import type { FastifyInstance } from 'fastify'
import {
  getSystemMultiCityConfig,
  upsertSystemMultiCityConfig,
  getOrgMultiCityConfig,
  upsertOrgMultiCityConfig,
  resolveEffectiveMultiCityConfig,
} from '../services/multicity-config.service.js'
import type { OrgMultiCityConfigResponse, SystemMultiCityConfigResponse } from '@ibe/shared'

export async function multiCityPublicRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { orgId: string } }>(
    '/api/v1/multi-city/config/org/:orgId/effective',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return resolveEffectiveMultiCityConfig(orgId)
    },
  )
}

export async function multiCityAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/admin/multi-city/config/system', async () => {
    return getSystemMultiCityConfig()
  })

  fastify.put('/api/v1/admin/multi-city/config/system', async (request) => {
    return upsertSystemMultiCityConfig(request.body as Partial<SystemMultiCityConfigResponse>)
  })

  fastify.get<{ Params: { orgId: string } }>(
    '/api/v1/admin/multi-city/config/org/:orgId',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return getOrgMultiCityConfig(orgId)
    },
  )

  fastify.put<{ Params: { orgId: string } }>(
    '/api/v1/admin/multi-city/config/org/:orgId',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return upsertOrgMultiCityConfig(orgId, request.body as Partial<OrgMultiCityConfigResponse>)
    },
  )
}
