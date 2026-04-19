import type { FastifyInstance } from 'fastify'
import {
  getOnsiteConversionSettings,
  updateOnsiteConversionSettings,
  getPropertyOnsiteConversionAdmin,
  upsertPropertyOnsiteConversionSettings,
} from '../services/onsite-conversion.service.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'
import type { UpdateOnsiteConversionRequest, UpdateOnsiteConversionOverridesRequest } from '@ibe/shared'

export async function onsiteConversionRoutes(fastify: FastifyInstance) {
  // GET /admin/onsite-conversion/global
  fastify.get('/admin/onsite-conversion/global', async (request, reply) => {
    const orgId = request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return getOnsiteConversionSettings(orgId)
  })

  // PUT /admin/onsite-conversion/global
  fastify.put('/admin/onsite-conversion/global', async (request, reply) => {
    const orgId = request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return updateOnsiteConversionSettings(orgId, request.body as UpdateOnsiteConversionRequest)
  })

  // GET /admin/onsite-conversion/property/:propertyId
  fastify.get('/admin/onsite-conversion/property/:propertyId', async (request, reply) => {
    const id = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(id) || id <= 0) return reply.status(400).send({ error: 'Invalid property ID' })
    if (request.admin.organizationId !== null) {
      const orgId = await getOrgIdForProperty(id)
      if (orgId && orgId !== request.admin.organizationId) return reply.status(403).send({ error: 'Access denied' })
    }
    return getPropertyOnsiteConversionAdmin(id)
  })

  // PUT /admin/onsite-conversion/property/:propertyId
  fastify.put('/admin/onsite-conversion/property/:propertyId', async (request, reply) => {
    const id = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(id) || id <= 0) return reply.status(400).send({ error: 'Invalid property ID' })
    if (request.admin.organizationId !== null) {
      const orgId = await getOrgIdForProperty(id)
      if (orgId && orgId !== request.admin.organizationId) return reply.status(403).send({ error: 'Access denied' })
    }
    return upsertPropertyOnsiteConversionSettings(id, request.body as UpdateOnsiteConversionOverridesRequest)
  })
}
