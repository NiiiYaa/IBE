import type { FastifyInstance } from 'fastify'
import {
  getSystemConfig,
  upsertSystemConfig,
  getOrgConfig,
  upsertOrgConfig,
  getPropertyConfig,
  upsertPropertyConfig,
  getEffectiveConfig,
} from '../services/data-provider.service.js'
import { refreshProperty } from '../services/data-provider-fetch.service.js'
import { prisma } from '../db/client.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'

export async function dataProviderRoutes(fastify: FastifyInstance) {
  // GET /admin/data-provider/system — super admin only
  fastify.get('/admin/data-provider/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    return reply.send(await getSystemConfig())
  })

  // PUT /admin/data-provider/system — super admin only
  fastify.put('/admin/data-provider/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    return reply.send(await upsertSystemConfig(request.body as Record<string, unknown>))
  })

  // GET /admin/data-provider/global — org-level config
  fastify.get('/admin/data-provider/global', async (request, reply) => {
    const orgId = request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const config = await getOrgConfig(orgId)
    return reply.send(config ?? { organizationId: orgId, useSystem: true, refreshIntervalDays: null, enabled: null })
  })

  // PUT /admin/data-provider/global
  fastify.put('/admin/data-provider/global', async (request, reply) => {
    const orgId = request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await upsertOrgConfig(orgId, request.body as Record<string, unknown>))
  })

  // GET /admin/data-provider/property/:propertyId — config + current score
  fastify.get('/admin/data-provider/property/:propertyId', async (request, reply) => {
    const id = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(id) || id <= 0) return reply.status(400).send({ error: 'Invalid property ID' })

    if (request.admin.organizationId !== null) {
      const orgId = await getOrgIdForProperty(id)
      if (orgId && orgId !== request.admin.organizationId)
        return reply.status(403).send({ error: 'Access denied' })
    }

    const property = await prisma.property.findUnique({ where: { propertyId: id }, select: { organizationId: true } })
    const orgId = property?.organizationId ?? null

    const [propertyConfig, orgConfig, systemConfig, effectiveConfig, score] = await Promise.all([
      getPropertyConfig(id),
      orgId ? getOrgConfig(orgId) : Promise.resolve(null),
      getSystemConfig(),
      getEffectiveConfig(id),
      prisma.propertyScore.findUnique({ where: { propertyId: id }, select: {
        propertyId: true, score: true, reviewCount: true, source: true,
        fetchedAt: true, status: true, errorMsg: true,
      }}),
    ])

    return reply.send({
      propertyId: id,
      propertyConfig,
      orgConfig,
      systemConfig,
      effective: effectiveConfig,
      score: score
        ? { ...score, fetchedAt: score.fetchedAt?.toISOString() ?? null }
        : null,
    })
  })

  // PUT /admin/data-provider/property/:propertyId
  fastify.put('/admin/data-provider/property/:propertyId', async (request, reply) => {
    const id = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(id) || id <= 0) return reply.status(400).send({ error: 'Invalid property ID' })

    if (request.admin.organizationId !== null) {
      const orgId = await getOrgIdForProperty(id)
      if (orgId && orgId !== request.admin.organizationId)
        return reply.status(403).send({ error: 'Access denied' })
    }

    return reply.send(await upsertPropertyConfig(id, request.body as Record<string, unknown>))
  })

  // POST /admin/data-provider/refresh/:propertyId — manual trigger
  fastify.post('/admin/data-provider/refresh/:propertyId', async (request, reply) => {
    const id = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(id) || id <= 0) return reply.status(400).send({ error: 'Invalid property ID' })

    if (request.admin.organizationId !== null) {
      const orgId = await getOrgIdForProperty(id)
      if (orgId && orgId !== request.admin.organizationId)
        return reply.status(403).send({ error: 'Access denied' })
    }

    const result = await refreshProperty(id)
    return reply.send(result)
  })
}
