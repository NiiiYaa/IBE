import type { FastifyInstance } from 'fastify'
import { getPropertyDetail } from '../services/static.service.js'
import { invalidatePropertyCache } from '../adapters/hyperguest/static.js'
import { IBE_ERROR_NOT_FOUND } from '@ibe/shared'
import { HyperGuestApiError } from '../adapters/hyperguest/client.js'

export async function staticRoutes(fastify: FastifyInstance) {
  // GET /properties/:id — full static data for a property
  fastify.get('/properties/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const propertyId = parseInt(id, 10)

    if (isNaN(propertyId) || propertyId <= 0) {
      return reply.status(400).send({ error: 'Invalid property ID', code: 'IBE.VALIDATION.001' })
    }

    try {
      const detail = await getPropertyDetail(propertyId)
      return reply.send(detail)
    } catch (err) {
      if (err instanceof HyperGuestApiError && err.httpStatus === 404) {
        return reply.status(404).send({ error: 'Property not found', code: IBE_ERROR_NOT_FOUND })
      }
      throw err
    }
  })

  // DELETE /properties/:id/cache — invalidate static cache for a property
  fastify.delete('/properties/:id/cache', async (request, reply) => {
    const { id } = request.params as { id: string }
    const propertyId = parseInt(id, 10)
    if (isNaN(propertyId) || propertyId <= 0) {
      return reply.status(400).send({ error: 'Invalid property ID', code: 'IBE.VALIDATION.001' })
    }
    await invalidatePropertyCache(propertyId)
    return reply.send({ ok: true })
  })
}
