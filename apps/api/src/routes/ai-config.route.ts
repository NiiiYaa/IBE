import type { FastifyInstance } from 'fastify'
import {
  getSystemAIConfig,
  upsertSystemAIConfig,
  getOrgAIConfig,
  upsertOrgAIConfig,
  getPropertyAIConfig,
  upsertPropertyAIConfig,
  testAIConnection,
} from '../services/ai-config.service.js'
import type { AIProvider } from '@ibe/shared'

export async function aiConfigRoutes(fastify: FastifyInstance) {
  // GET /admin/ai/system — super admin only
  fastify.get('/admin/ai/system', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemAIConfig())
  })

  // PUT /admin/ai/system — super admin only
  fastify.put('/admin/ai/system', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const body = request.body as Record<string, unknown>
    return reply.send(await upsertSystemAIConfig(body))
  })

  // GET /admin/ai/org — org-level config for the authenticated admin's org
  fastify.get('/admin/ai/org', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? parseInt(rawOrgId, 10) : null)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await getOrgAIConfig(orgId))
  })

  // PUT /admin/ai/org — org-level config update
  fastify.put('/admin/ai/org', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const orgId = request.admin.role === 'super'
      ? ((request.body as Record<string, unknown>).orgId as number | undefined ?? request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const body = request.body as Record<string, unknown>
    if (body.provider === 'fake' && request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Fake AI provider is restricted to super admins' })
    }
    if (body.systemServiceDisabled !== undefined && request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Only super admins can disable system services' })
    }
    return reply.send(await upsertOrgAIConfig(orgId, body))
  })

  // GET /admin/ai/property/:propertyId — property-level config
  fastify.get('/admin/ai/property/:propertyId', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const propertyId = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(propertyId) || propertyId <= 0) return reply.status(400).send({ error: 'Invalid property ID' })
    return reply.send(await getPropertyAIConfig(propertyId))
  })

  // PUT /admin/ai/property/:propertyId — property-level config update
  fastify.put('/admin/ai/property/:propertyId', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const propertyId = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(propertyId) || propertyId <= 0) return reply.status(400).send({ error: 'Invalid property ID' })
    const body = request.body as Record<string, unknown>
    if (body.provider === 'fake' && request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Fake AI provider is restricted to super admins' })
    }
    if (body.systemServiceDisabled !== undefined && request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Only super admins can disable system services' })
    }
    return reply.send(await upsertPropertyAIConfig(propertyId, body))
  })

  // POST /admin/ai/test — test a provider connection
  fastify.post('/admin/ai/test', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { provider, apiKey, model } = request.body as { provider: AIProvider; apiKey: string; model: string }
    if (!provider || !model) return reply.status(400).send({ error: 'provider and model are required' })
    if (provider !== 'fake' && !apiKey) return reply.status(400).send({ error: 'apiKey is required' })
    return reply.send(await testAIConnection(provider, apiKey ?? '', model))
  })
}
