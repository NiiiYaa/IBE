import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { getResolvedEventsConfig } from '../../services/events-config.service.js'
import { getResolvedAmadeusConfig, getAmadeusToken } from '../../services/amadeus-config.service.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'

export const getNearbyEventsTool: ToolDefinition = {
  name: 'get_nearby_events',
  description: 'Get upcoming events and activities near the hotel: concerts, sports, theatre, tours, experiences, things to do. Call when the user asks about events, activities, entertainment, or things to do nearby.',
  parameters: {
    type: 'object',
    properties: {
      propertyId: { type: 'number', description: 'Hotel property ID' },
      startDate: { type: 'string', description: 'Start date YYYY-MM-DD (defaults to today)' },
      endDate: { type: 'string', description: 'End date YYYY-MM-DD (defaults to 30 days from start)' },
    },
    required: ['propertyId'],
  },
}

interface TicketmasterEvent {
  name: string
  dates?: { start?: { localDate?: string; localTime?: string } }
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>
  _embedded?: { venues?: Array<{ name?: string; city?: { name?: string } }> }
  url?: string
}

interface RawAmadeusProduct {
  id: string
  name: string
  shortDescription?: string
  productType?: string
  pictures?: Array<{ url: string }>
  price?: { amount: number; currencyCode: string }
  duration?: string
  bookingLink?: string
  isBookable?: boolean
  booking?: { available: boolean }
}

export async function executeGetNearbyEvents(args: Record<string, unknown>): Promise<unknown> {
  const propertyId = args.propertyId as number

  try {
    const [property, eventsCfg, amadeusCfg] = await Promise.all([
      fetchPropertyStatic(propertyId),
      getResolvedEventsConfig(propertyId),
      getResolvedAmadeusConfig(propertyId),
    ])

    const today = new Date().toISOString().split('T')[0]!
    const startDate = (args.startDate as string | undefined) ?? today
    const endDate = (args.endDate as string | undefined) ?? addDays(startDate, 30)

    const lat = property.coordinates?.latitude
    const lng = property.coordinates?.longitude

    const [events, activities] = await Promise.all([
      fetchTmEvents(eventsCfg, lat, lng, startDate, endDate),
      fetchAmadeusActivities(amadeusCfg, lat, lng),
    ])

    return {
      propertyId,
      hotelName: property.name,
      totalFound: (events?.length ?? 0) + (activities?.length ?? 0),
      ...(events ? { events } : {}),
      ...(activities ? { activities } : {}),
    }
  } catch (err) {
    logger.warn({ propertyId, err }, '[AI Tool] get_nearby_events failed')
    return { error: 'Could not retrieve nearby events.' }
  }
}

async function fetchTmEvents(
  cfg: Awaited<ReturnType<typeof getResolvedEventsConfig>>,
  lat: number | undefined,
  lng: number | undefined,
  startDate: string,
  endDate: string,
): Promise<Array<{ name: string; date: string | null; time: string | null; category: string | null; genre: string | null; venue: string | null; ticketUrl: string | null }> | null> {
  if (!cfg.apiKey || !cfg.enabled || !lat || !lng) return null

  const url = [
    'https://app.ticketmaster.com/discovery/v2/events.json',
    `?apikey=${cfg.apiKey}`,
    `&latlong=${lat},${lng}`,
    `&radius=${cfg.radiusKm}&unit=km`,
    `&startDateTime=${startDate}T00:00:00Z`,
    `&endDateTime=${endDate}T23:59:59Z`,
    `&size=${cfg.maxEvents}`,
    '&sort=date,asc',
  ].join('')

  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 401) return null
    return null
  }

  const data = await res.json() as { _embedded?: { events?: TicketmasterEvent[] } }
  return (data._embedded?.events ?? []).map(e => ({
    name: e.name,
    date: e.dates?.start?.localDate ?? null,
    time: e.dates?.start?.localTime ?? null,
    category: e.classifications?.[0]?.segment?.name ?? null,
    genre: e.classifications?.[0]?.genre?.name ?? null,
    venue: e._embedded?.venues?.[0]?.name ?? null,
    ticketUrl: e.url ?? null,
  }))
}

async function fetchAmadeusActivities(
  cfg: Awaited<ReturnType<typeof getResolvedAmadeusConfig>>,
  lat: number | undefined,
  lng: number | undefined,
): Promise<Array<{ name: string; category: string | null; duration: string | null; price: number | null; currency: string | null; bookable: boolean }> | null> {
  if (!cfg || !lat || !lng) return null

  try {
    const token = await getAmadeusToken(cfg.tokenUrl, cfg.clientId, cfg.clientSecret)
    const url = new URL(cfg.activitiesUrl)
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set('radius', String(cfg.radiusKm))
    url.searchParams.set('limit', String(cfg.maxActivities))

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null

    const data = await res.json() as { data?: RawAmadeusProduct[] }
    return (data.data ?? []).map(r => ({
      name: r.name,
      category: r.productType ?? null,
      duration: r.duration ?? null,
      price: r.price?.amount ?? null,
      currency: r.price?.currencyCode ?? null,
      bookable: r.isBookable ?? r.booking?.available ?? false,
    }))
  } catch {
    return null
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]!
}
