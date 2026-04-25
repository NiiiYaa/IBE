import type { FastifyInstance } from 'fastify'
import { getMapsConfig, upsertMapsConfig } from '../services/maps-config.service.js'

export async function mapsConfigRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/maps/config', async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? parseInt(rawOrgId, 10) : null)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await getMapsConfig(orgId))
  })

  fastify.put('/admin/maps/config', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const orgId = request.admin.role === 'super'
      ? ((body.orgId as number | undefined) ?? request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await upsertMapsConfig(orgId, body))
  })
}
