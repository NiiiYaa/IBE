import type { FastifyInstance } from 'fastify'
import { fetchPropertyStatic, invalidatePropertyCache } from '../adapters/hyperguest/static.js'
import { updateLastSyncedAt } from '../services/property-registry.service.js'
import { logger } from '../utils/logger.js'

export async function syncRoutes(fastify: FastifyInstance) {
  fastify.post('/sync/property/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const propertyId = parseInt(id, 10)

    if (isNaN(propertyId) || propertyId <= 0) {
      return reply.status(400).send({ error: 'Invalid property ID', code: 'IBE.VALIDATION.001' })
    }

    logger.info({ propertyId }, '[Sync] HyperGuest sync triggered')
    await invalidatePropertyCache(propertyId)
    await fetchPropertyStatic(propertyId)
    await updateLastSyncedAt(propertyId)

    const syncedAt = new Date().toISOString()
    logger.info({ propertyId, syncedAt }, '[Sync] HyperGuest sync complete')

    return reply.send({ ok: true, syncedAt })
  })
}
