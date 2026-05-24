import type { FastifyInstance } from 'fastify'
import {
  getSystemFlexibleDatesConfig, upsertSystemFlexibleDatesConfig,
  getOrgFlexibleDatesConfig, upsertOrgFlexibleDatesConfig,
  getPropertyFlexibleDatesConfig, upsertPropertyFlexibleDatesConfig,
  resolveEffectiveFlexibleDatesConfig,
} from '../services/flexible-dates-config.service.js'
import type { FlexibleDatesEffective, OrgFlexibleDatesConfigResponse, PropertyFlexibleDatesConfigResponse } from '@ibe/shared'

export async function flexibleDatesPublicRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/flexible-dates/config/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
      return resolveEffectiveFlexibleDatesConfig(propertyId)
    },
  )
}

export async function flexibleDatesAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/admin/flexible-dates/config/system', async () => {
    return getSystemFlexibleDatesConfig()
  })

  fastify.put('/api/v1/admin/flexible-dates/config/system', async (request) => {
    return upsertSystemFlexibleDatesConfig(request.body as Partial<FlexibleDatesEffective>)
  })

  fastify.get<{ Params: { orgId: string } }>(
    '/api/v1/admin/flexible-dates/config/org/:orgId',
    async (request) => {
      return getOrgFlexibleDatesConfig(parseInt(request.params.orgId, 10))
    },
  )

  fastify.put<{ Params: { orgId: string } }>(
    '/api/v1/admin/flexible-dates/config/org/:orgId',
    async (request) => {
      return upsertOrgFlexibleDatesConfig(
        parseInt(request.params.orgId, 10),
        request.body as Partial<OrgFlexibleDatesConfigResponse>,
      )
    },
  )

  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/flexible-dates/config/property/:propertyId',
    async (request) => {
      return getPropertyFlexibleDatesConfig(parseInt(request.params.propertyId, 10))
    },
  )

  fastify.put<{ Params: { propertyId: string } }>(
    '/api/v1/admin/flexible-dates/config/property/:propertyId',
    async (request) => {
      return upsertPropertyFlexibleDatesConfig(
        parseInt(request.params.propertyId, 10),
        request.body as Partial<PropertyFlexibleDatesConfigResponse>,
      )
    },
  )
}
