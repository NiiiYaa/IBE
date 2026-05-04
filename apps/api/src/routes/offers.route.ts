import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { OffersChannel } from '@ibe/shared'
import {
  getSystemOffersSettings,
  upsertSystemOffersSettings,
  getOrgOffersSettings,
  upsertOrgOffersSettings,
  getPropertyOffersAdmin,
  upsertPropertyOffersSettings,
} from '../services/offers.service.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'

function getChannel(request: FastifyRequest): OffersChannel {
  const q = (request.query as { channel?: string }).channel
  return q === 'b2b' ? 'b2b' : 'b2c'
}

export async function offersRoutes(fastify: FastifyInstance) {
  // GET /admin/offers/system — system-level defaults (super admin only)
  fastify.get('/admin/offers/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    const settings = await getSystemOffersSettings(getChannel(request))
    return reply.send(settings)
  })

  // PUT /admin/offers/system — update system-level defaults (super admin only)
  fastify.put('/admin/offers/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    const body = request.body as Record<string, unknown>
    const settings = await upsertSystemOffersSettings(getChannel(request), body)
    return reply.send(settings)
  })

  // GET /admin/offers/global — org-level defaults
  fastify.get('/admin/offers/global', async (request, reply) => {
    const orgId = request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const settings = await getOrgOffersSettings(orgId, getChannel(request))
    return reply.send(settings)
  })

  // PUT /admin/offers/global — update org-level defaults
  fastify.put('/admin/offers/global', async (request, reply) => {
    const orgId = request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const body = request.body as Record<string, unknown>
    const settings = await upsertOrgOffersSettings(orgId, getChannel(request), body)
    return reply.send(settings)
  })

  // GET /admin/offers/property/:propertyId — property overrides + org defaults + system defaults
  fastify.get('/admin/offers/property/:propertyId', async (request, reply) => {
    const id = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(id) || id <= 0) return reply.status(400).send({ error: 'Invalid property ID' })

    if (request.admin.organizationId !== null) {
      const orgId = await getOrgIdForProperty(id)
      if (orgId && orgId !== request.admin.organizationId) {
        return reply.status(403).send({ error: 'Access denied' })
      }
    }

    const result = await getPropertyOffersAdmin(id, getChannel(request))
    return reply.send(result)
  })

  // PUT /admin/offers/property/:propertyId — update property-level overrides
  fastify.put('/admin/offers/property/:propertyId', async (request, reply) => {
    const id = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(id) || id <= 0) return reply.status(400).send({ error: 'Invalid property ID' })

    const body = request.body as Record<string, unknown>
    const result = await upsertPropertyOffersSettings(id, getChannel(request), body)
    return reply.send(result)
  })
}
