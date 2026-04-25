import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { getResolvedEventsConfig } from '../../services/events-config.service.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'

export const getNearbyEventsTool: ToolDefinition = {
  name: 'get_nearby_events',
  description: 'Get upcoming events near the hotel: concerts, sports, theatre, festivals, etc. Call this when the user asks about events, things to do, concerts, shows, or entertainment nearby.',
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

export async function executeGetNearbyEvents(args: Record<string, unknown>): Promise<unknown> {
  const propertyId = args.propertyId as number

  try {
    const [property, eventsCfg] = await Promise.all([
      fetchPropertyStatic(propertyId),
      getResolvedEventsConfig(propertyId),
    ])

    if (!eventsCfg.apiKey) return { error: 'Events service not configured. An admin needs to add a Ticketmaster API key.' }
    if (!eventsCfg.enabled) return { error: 'Events service is disabled for this hotel.' }

    const lat = property.coordinates?.latitude
    const lng = property.coordinates?.longitude
    if (!lat || !lng) return { error: 'Hotel coordinates not available.' }

    const today = new Date().toISOString().split('T')[0]!
    const startDate = (args.startDate as string | undefined) ?? today
    const endDate = (args.endDate as string | undefined) ?? addDays(startDate, 30)

    const url = [
      'https://app.ticketmaster.com/discovery/v2/events.json',
      `?apikey=${eventsCfg.apiKey}`,
      `&latlong=${lat},${lng}`,
      `&radius=${eventsCfg.radiusKm}&unit=km`,
      `&startDateTime=${startDate}T00:00:00Z`,
      `&endDateTime=${endDate}T23:59:59Z`,
      `&size=${eventsCfg.maxEvents}`,
      '&sort=date,asc',
    ].join('')

    const res = await fetch(url)
    if (!res.ok) {
      if (res.status === 401) return { error: 'Invalid Ticketmaster API key.' }
      return { error: `Ticketmaster returned ${res.status}` }
    }

    const data = await res.json() as { _embedded?: { events?: TicketmasterEvent[] } }
    const rawEvents = data._embedded?.events ?? []

    const events = rawEvents.map(e => ({
      name: e.name,
      date: e.dates?.start?.localDate ?? null,
      time: e.dates?.start?.localTime ?? null,
      category: e.classifications?.[0]?.segment?.name ?? null,
      genre: e.classifications?.[0]?.genre?.name ?? null,
      venue: e.venue,
      ticketUrl: e.url ?? null,
    }))

    return {
      propertyId,
      hotelName: property.name,
      radiusKm: eventsCfg.radiusKm,
      totalFound: events.length,
      events,
    }
  } catch (err) {
    logger.warn({ propertyId, err }, '[AI Tool] get_nearby_events failed')
    return { error: 'Could not retrieve nearby events.' }
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]!
}
