import type { FastifyInstance } from 'fastify'
import { trackPresence, getViewerCount } from '../services/presence.service.js'
import { getPropertyOnsiteConversionAdmin, getRecentBookingsCount, getPromoDiscount } from '../services/onsite-conversion.service.js'
import type { OnsiteStats } from '@ibe/shared'

export async function publicOnsiteRoutes(fastify: FastifyInstance) {
  // POST /onsite/presence/:propertyId — heartbeat (no auth)
  fastify.post<{ Params: { propertyId: string }; Body: { sessionId: string } }>(
    '/onsite/presence/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId) || propertyId <= 0) return reply.status(400).send({ error: 'Invalid property ID' })

      const { sessionId } = request.body ?? {}
      if (!sessionId || typeof sessionId !== 'string') return reply.status(400).send({ error: 'sessionId required' })

      const viewerCount = await trackPresence(propertyId, sessionId)
      return { viewerCount }
    },
  )

  // GET /onsite/stats/:propertyId — viewer count + recent bookings + effective settings
  fastify.get<{ Params: { propertyId: string } }>(
    '/onsite/stats/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId) || propertyId <= 0) return reply.status(400).send({ error: 'Invalid property ID' })

      const { effective: settings } = await getPropertyOnsiteConversionAdmin(propertyId)

      const [viewerCount, recentBookingsCount, popupPromoDiscount] = await Promise.all([
        getViewerCount(propertyId),
        settings.bookingsEnabled
          ? getRecentBookingsCount(propertyId, settings.bookingsWindowHours)
          : Promise.resolve(0),
        settings.popupEnabled && settings.popupPromoCode
          ? getPromoDiscount(settings.popupPromoCode)
          : Promise.resolve(null),
      ])

      const stats: OnsiteStats = { settings, viewerCount, recentBookingsCount, popupPromoDiscount }
      return stats
    },
  )
}
