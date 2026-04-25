import type { FastifyInstance } from 'fastify'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'
import { getResolvedEventsConfig } from '../services/events-config.service.js'

interface TmEvent {
  name: string
  dates?: { start?: { localDate?: string; localTime?: string } }
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>
  _embedded?: { venues?: Array<{ name?: string; address?: { line1?: string }; city?: { name?: string } }> }
  url?: string
  images?: Array<{ url: string; width: number; height: number }>
}

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]!
}

export async function eventsPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/events', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })

    const today = new Date().toISOString().split('T')[0]!
    const startDate = qs.startDate ?? today
    const endDate = qs.endDate ?? addDays(startDate, 6)

    const [property, cfg] = await Promise.all([
      fetchPropertyStatic(propertyId),
      getResolvedEventsConfig(propertyId),
    ])

    if (!cfg.enabled || !cfg.apiKey) return reply.send({ enabled: false })

    const lat = property.coordinates?.latitude
    const lng = property.coordinates?.longitude
    if (!lat || !lng) return reply.send({ enabled: false })

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
      if (!res.ok) return reply.send({ enabled: false })

      const data = await res.json() as { _embedded?: { events?: TmEvent[] } }
      const raw = data._embedded?.events ?? []

      const mapped = raw.map(e => {
        const venue = e._embedded?.venues?.[0]
        const thumb = e.images
          ?.filter(i => i.width >= 200 && i.width <= 500)
          .sort((a, b) => a.width - b.width)[0]?.url ?? null
        // Strip Ticketmaster package suffixes: "Event Name | VIP Package" → "Event Name"
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

      // Deduplicate: same event name + date = same event
      const seen = new Set<string>()
      const events = mapped.filter(e => {
        const key = `${e.name.toLowerCase()}|${e.date ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      return reply.send({ enabled: true, radiusKm: cfg.radiusKm, events, stripDefaultFolded: cfg.stripDefaultFolded, stripAutoFoldSecs: cfg.stripAutoFoldSecs })
    } catch {
      return reply.send({ enabled: false })
    }
  })
}
