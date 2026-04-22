import type { FastifyInstance } from 'fastify'
import { trackPresence, getViewerCount } from '../services/presence.service.js'
import { getPropertyOnsiteConversionAdmin, getRecentBookingsCount, getPromoDiscount } from '../services/onsite-conversion.service.js'
import { isMarketingFeatureEnabled } from '../services/marketing.service.js'
import { extractB2BContext } from '../utils/b2b-context.js'
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

      const b2b = extractB2BContext(fastify, request)
      const sellModel = b2b ? 'b2b' : 'b2c'
      const onsiteEnabled = await isMarketingFeatureEnabled('onsiteConversion', sellModel, propertyId)
      if (!onsiteEnabled) {
        return reply.send({ settings: null, viewerCount: 0, recentBookingsCount: 0, popupPromoDiscount: null })
      }

      const { effective: settings } = await getPropertyOnsiteConversionAdmin(propertyId)

      const [viewerCount, recentBookingsCount, popupPromoDiscount] = await Promise.all([
        getViewerCount(propertyId),
        settings.bookingsEnabledModels.includes(sellModel)
          ? getRecentBookingsCount(propertyId, settings.bookingsWindowHours)
          : Promise.resolve(0),
        settings.popupEnabledModels.includes(sellModel) && settings.popupPromoCode
          ? getPromoDiscount(settings.popupPromoCode)
          : Promise.resolve(null),
      ])

      const stats: OnsiteStats = { settings, viewerCount, recentBookingsCount, popupPromoDiscount }
      return stats
    },
  )
}
