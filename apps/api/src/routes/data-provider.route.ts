import type { FastifyInstance } from 'fastify'
import {
  getSystemConfig,
  upsertSystemConfig,
  getOrgConfig,
  upsertOrgConfig,
  getPropertyConfig,
  upsertPropertyConfig,
  getEffectiveConfig,
  decryptCredential,
} from '../services/data-provider.service.js'
import { refreshProperty } from '../services/data-provider-fetch.service.js'
import { testDataForSEOConnection } from '../adapters/dataforseo/client.js'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
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

  // GET /admin/data-provider/global — org-level config + system config
  fastify.get('/admin/data-provider/global', async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? parseInt(rawOrgId, 10) : request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const [orgConfig, systemConfig] = await Promise.all([getOrgConfig(orgId), getSystemConfig()])
    return reply.send({
      orgConfig: orgConfig ?? {
        organizationId: orgId, useSystem: true, refreshIntervalDays: null, enabled: null,
        providerType: null, loginSet: false, passwordMasked: null, systemServiceDisabled: false,
      },
      systemConfig,
    })
  })

  // PUT /admin/data-provider/global
  fastify.put('/admin/data-provider/global', async (request, reply) => {
    const body = { ...(request.body as Record<string, unknown>) }
    const orgId = request.admin.role === 'super'
      ? ((body.orgId as number | undefined) ?? request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    delete body.orgId
    // Only super admin can set systemServiceDisabled
    if (request.admin.role !== 'super') delete body.systemServiceDisabled
    const [orgConfig, systemConfig] = await Promise.all([
      upsertOrgConfig(orgId, body as Parameters<typeof upsertOrgConfig>[1]),
      getSystemConfig(),
    ])
    return reply.send({ orgConfig, systemConfig })
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
      prisma.propertyScore.findUnique({
        where: { propertyId: id },
        select: { propertyId: true, score: true, reviewCount: true, source: true, fetchedAt: true, status: true, errorMsg: true },
      }),
    ])

    // Strip decrypted credentials — never send login/password to the client
    const { login: _l, password: _p, ...safeEffective } = effectiveConfig

    return reply.send({
      propertyId: id,
      propertyConfig,
      orgConfig,
      systemConfig,
      effective: safeEffective,
      score: score ? { ...score, fetchedAt: score.fetchedAt?.toISOString() ?? null } : null,
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

    const body = { ...(request.body as Record<string, unknown>) }
    // Observers cannot set orgServiceDisabled
    if (request.admin.role === 'observer') delete body.orgServiceDisabled

    return reply.send(await upsertPropertyConfig(id, body as Parameters<typeof upsertPropertyConfig>[1]))
  })

  // POST /admin/data-provider/test-connection — super admin: tests system credentials
  fastify.post('/admin/data-provider/test-connection', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    const systemRow = await prisma.systemDataProviderConfig.findFirst()
    const login = systemRow?.login ? decryptCredential(systemRow.login) : env.DATAFORSEO_LOGIN
    const password = systemRow?.password ? decryptCredential(systemRow.password) : env.DATAFORSEO_PASSWORD
    return reply.send(await testDataForSEOConnection(login, password))
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

    const result = await refreshProperty(id, { force: true })
    return reply.send(result)
  })
}
