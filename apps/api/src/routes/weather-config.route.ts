import type { FastifyInstance } from 'fastify'
import { getSystemWeatherConfig, upsertSystemWeatherConfig, getWeatherConfig, upsertWeatherConfig } from '../services/weather-config.service.js'

export async function weatherConfigRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/weather/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemWeatherConfig())
  })

  fastify.put('/admin/weather/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await upsertSystemWeatherConfig(request.body as Record<string, unknown>))
  })

  fastify.get('/admin/weather/config', async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? parseInt(rawOrgId, 10) : null)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await getWeatherConfig(orgId))
  })

  fastify.put('/admin/weather/config', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const orgId = request.admin.role === 'super'
      ? ((body.orgId as number | undefined) ?? request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    if (body.systemServiceDisabled !== undefined && request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Only super admins can disable system services' })
    }
    return reply.send(await upsertWeatherConfig(orgId, body))
  })
}
