// apps/api/src/routes/amadeus-public.route.ts
import type { FastifyInstance } from 'fastify'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'
import { getResolvedAmadeusConfig, getAmadeusToken } from '../services/amadeus-config.service.js'
import { getResolvedEventsConfig } from '../services/events-config.service.js'
import { logger } from '../utils/logger.js'
import type { AmadeusActivity, AmadeusPublicResponse, ActivitiesAndEventsResponse } from '@ibe/shared'

interface RawAmadeusProduct {
  id: string
  title: string
  description?: string
  thumbnailImage?: string
  galleryImages?: Array<{ url: string }>
  minPrice?: number
  priceCurrency?: string
  duration?: string
  onlineBookable?: boolean
  bookingUrl?: string
  taxonomies?: Array<Array<{ name: string; family: string; level: number }>>
}

async function fetchAmadeusActivities(
  activitiesUrl: string,
  token: string,
  lat: number,
  lng: number,
  radiusKm: number,
  max: number,
): Promise<RawAmadeusProduct[]> {
  if (!activitiesUrl) throw new Error('Amadeus activities URL not configured.')
  const url = new URL(activitiesUrl)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('radius', String(radiusKm))
  url.searchParams.set('maxRecommendations', String(Math.min(max, 10)))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Amadeus activities fetch failed: ${res.status}`)
  const raw = await res.json()
  return (Array.isArray(raw) ? raw : (raw as { data?: RawAmadeusProduct[] }).data ?? []) as RawAmadeusProduct[]
}

function normaliseActivity(raw: RawAmadeusProduct): AmadeusActivity {
  const thumb = (raw.thumbnailImage?.startsWith('http') ? raw.thumbnailImage : null)
    ?? raw.galleryImages?.[0]?.url
    ?? null
  const categoryName = raw.taxonomies
    ?.flatMap(g => g)
    .find(t => t.family === 'activities' && t.level === 1)?.name ?? null
  const category = categoryName === 'No Category' ? null : categoryName
  const description = raw.description
    ? raw.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || null
    : null
  return {
    id: raw.id,
    name: raw.title,
    description,
    category,
    thumb,
    price: raw.minPrice ?? null,
    currency: raw.priceCurrency ?? null,
    duration: raw.duration ?? null,
    bookable: raw.onlineBookable ?? false,
    bookingUrl: raw.bookingUrl ?? null,
  }
}

async function getAmadeusActivities(
  propertyId: number,
  fallbackOrgId?: number,
): Promise<AmadeusPublicResponse> {
  const cfg = await getResolvedAmadeusConfig(propertyId, fallbackOrgId)
  if (!cfg) return { enabled: false }

  const property = await fetchPropertyStatic(propertyId).catch(() => null)
  const lat = property?.coordinates?.latitude
  const lng = property?.coordinates?.longitude
  if (!lat || !lng) return { enabled: false }

  try {
    const token = await getAmadeusToken(cfg.tokenUrl, cfg.clientId, cfg.clientSecret)
    const raw = await fetchAmadeusActivities(cfg.activitiesUrl, token, lat, lng, cfg.radiusKm, cfg.maxActivities)
    return {
      enabled: true,
      radiusKm: cfg.radiusKm,
      activities: raw.map(normaliseActivity),
      stripLabel: cfg.stripLabel,
      stripMode: cfg.stripMode,
      stripDefaultFolded: cfg.stripDefaultFolded,
      stripAutoFoldSecs: cfg.stripAutoFoldSecs,
      showBookButton: cfg.showBookButton,
    }
  } catch (err) {
    logger.warn({ propertyId, err }, '[Amadeus] activities fetch failed')
    return { enabled: false }
  }
}

export async function amadeusPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/amadeus/activities', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const fallbackOrgId = qs.orgId ? parseInt(qs.orgId, 10) : undefined
    return reply.send(await getAmadeusActivities(propertyId, fallbackOrgId))
  })

  fastify.get('/activities-and-events', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const fallbackOrgId = qs.orgId ? parseInt(qs.orgId, 10) : undefined

    const today = new Date().toISOString().split('T')[0]!
    const startDate = qs.startDate ?? today
    const endDate = qs.endDate ?? addDays(startDate, 6)

    const [tmResult, amadeusResult] = await Promise.all([
      fetchTicketmaster(propertyId, fallbackOrgId, startDate, endDate),
      getAmadeusActivities(propertyId, fallbackOrgId),
    ])

    const response: ActivitiesAndEventsResponse = {
      ticketmaster: tmResult,
      amadeus: amadeusResult,
    }
    return reply.send(response)
  })
}

// ── Ticketmaster (extracted from events-public.route.ts logic) ────────────────

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]!
}

interface TmEvent {
  name: string
  dates?: { start?: { localDate?: string; localTime?: string } }
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>
  _embedded?: { venues?: Array<{ name?: string; address?: { line1?: string }; city?: { name?: string } }> }
  url?: string
  images?: Array<{ url: string; width: number; height: number }>
}

async function fetchTicketmaster(
  propertyId: number,
  fallbackOrgId: number | undefined,
  startDate: string,
  endDate: string,
): Promise<ActivitiesAndEventsResponse['ticketmaster']> {
  const [propertyResult, cfg] = await Promise.all([
    fetchPropertyStatic(propertyId).catch(() => null),
    getResolvedEventsConfig(propertyId, fallbackOrgId),
  ])

  if (!cfg.enabled || !cfg.apiKey) return { enabled: false }

  const lat = propertyResult?.coordinates?.latitude
  const lng = propertyResult?.coordinates?.longitude
  if (!lat || !lng) return { enabled: false }

  try {
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
    if (!res.ok) return { enabled: false }

    const data = await res.json() as { _embedded?: { events?: TmEvent[] } }
    const raw = data._embedded?.events ?? []

    const seen = new Set<string>()
    const events = raw
      .map(e => {
        const venue = e._embedded?.venues?.[0]
        const thumb = e.images
          ?.filter(i => i.width >= 200 && i.width <= 500)
          .sort((a, b) => a.width - b.width)[0]?.url ?? null
        const baseName = e.name.split('|')[0]!.trim()
        return {
          name: baseName,
          date: e.dates?.start?.localDate ?? null,
          time: e.dates?.start?.localTime?.slice(0, 5) ?? null,
          category: e.classifications?.[0]?.segment?.name ?? null,
          genre: e.classifications?.[0]?.genre?.name ?? null,
          venue: venue?.name ?? null,
          city: venue?.city?.name ?? null,
          ticketUrl: e.url ?? null,
          thumb,
        }
      })
      .filter(e => {
        const key = `${e.name.toLowerCase()}|${e.date ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

    return {
      enabled: true,
      events,
      stripDefaultFolded: cfg.stripDefaultFolded,
      stripAutoFoldSecs: cfg.stripAutoFoldSecs,
      showBookButton: cfg.showBookButton,
    }
  } catch {
    return { enabled: false }
  }
}
