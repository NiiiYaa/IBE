import type { FastifyInstance } from 'fastify'
import { getOrgOffersSettings, upsertOrgOffersSettings, getPropertyOffersAdmin, upsertPropertyOffersSettings } from '../services/offers.service.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'

export async function offersRoutes(fastify: FastifyInstance) {
  // GET /admin/offers/global — org-level defaults
  fastify.get('/admin/offers/global', async (request, reply) => {
    const orgId = request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const settings = await getOrgOffersSettings(orgId)
    return reply.send(settings)
  })

  // PUT /admin/offers/global — update org-level defaults
  fastify.put('/admin/offers/global', async (request, reply) => {
    const orgId = request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const body = request.body as Record<string, unknown>
    const settings = await upsertOrgOffersSettings(orgId, body)
    return reply.send(settings)
  })

  // GET /admin/offers/property/:propertyId — property overrides + org defaults
  fastify.get('/admin/offers/property/:propertyId', async (request, reply) => {
    const id = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(id) || id <= 0) return reply.status(400).send({ error: 'Invalid property ID' })

    // Super admins (organizationId = null) can access any property
    if (request.admin.organizationId !== null) {
      const orgId = await getOrgIdForProperty(id)
      if (orgId && orgId !== request.admin.organizationId) {
        return reply.status(403).send({ error: 'Access denied' })
      }
    }

    const result = await getPropertyOffersAdmin(id)
    return reply.send(result)
  })

  // PUT /admin/offers/property/:propertyId — update property-level overrides
  fastify.put('/admin/offers/property/:propertyId', async (request, reply) => {
    const id = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(id) || id <= 0) return reply.status(400).send({ error: 'Invalid property ID' })

    const body = request.body as Record<string, unknown>
    const result = await upsertPropertyOffersSettings(id, body)
    return reply.send(result)
  })
}
