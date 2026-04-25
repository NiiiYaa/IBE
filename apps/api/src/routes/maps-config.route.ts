import type { FastifyInstance } from 'fastify'
import { getSystemMapsConfig, upsertSystemMapsConfig, getMapsConfig, upsertMapsConfig } from '../services/maps-config.service.js'

export async function mapsConfigRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/maps/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemMapsConfig())
  })

  fastify.put('/admin/maps/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await upsertSystemMapsConfig(request.body as Record<string, unknown>))
  })

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
