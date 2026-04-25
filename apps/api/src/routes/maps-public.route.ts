import type { FastifyInstance } from 'fastify'
import { getPublicMapsConfig, getPublicMapsConfigByOrg, getChainProperties } from '../services/maps-config.service.js'

export async function mapsPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/maps/config', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    const orgId = qs.orgId ? parseInt(qs.orgId, 10) : null
    if (orgId && !isNaN(orgId)) return reply.send(await getPublicMapsConfigByOrg(orgId))
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId or orgId required' })
    return reply.send(await getPublicMapsConfig(propertyId))
  })

  fastify.get('/maps/chain', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const orgId = qs.orgId ? parseInt(qs.orgId, 10) : null
    if (!orgId || isNaN(orgId)) return reply.status(400).send({ error: 'orgId required' })
    return reply.send(await getChainProperties(orgId))
  })
}
