// apps/api/src/routes/amadeus-config.route.ts
import type { FastifyInstance } from 'fastify'
import {
  getSystemAmadeusConfig,
  upsertSystemAmadeusConfig,
  getOrgAmadeusConfig,
  upsertOrgAmadeusConfig,
  getPropertyAmadeusConfig,
  upsertPropertyAmadeusConfig,
  getAmadeusToken,
  getResolvedAmadeusConfig,
} from '../services/amadeus-config.service.js'
import type { AmadeusConfigUpdate } from '@ibe/shared'

export async function amadeusConfigRoutes(fastify: FastifyInstance) {
  // ── System ────────────────────────────────────────────────────────────────
  fastify.get('/admin/amadeus/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemAmadeusConfig())
  })

  fastify.put('/admin/amadeus/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await upsertSystemAmadeusConfig(request.body as AmadeusConfigUpdate))
  })

  // ── Org ───────────────────────────────────────────────────────────────────
  fastify.get('/admin/amadeus/config', async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? parseInt(rawOrgId, 10) : null)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await getOrgAmadeusConfig(orgId))
  })

  fastify.put('/admin/amadeus/config', async (request, reply) => {
    const body = request.body as AmadeusConfigUpdate & { orgId?: number }
    const orgId = request.admin.role === 'super'
      ? (body.orgId ?? request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    if (body.systemServiceDisabled !== undefined && request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Only super admins can disable system services' })
    }
    // enforceChildCreds at org level: super can set it on any org; org admin can set it on their own org
    // (chain admin locking hotels to use chain credentials is an intended self-service capability)
    return reply.send(await upsertOrgAmadeusConfig(orgId, body))
  })

  // ── Property ──────────────────────────────────────────────────────────────
  fastify.get('/admin/amadeus/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string | undefined>).propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
    return reply.send(await getPropertyAmadeusConfig(propertyId))
  })

  fastify.put('/admin/amadeus/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string | undefined>).propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
    const body = request.body as AmadeusConfigUpdate
    if (body.systemServiceDisabled !== undefined && !['super', 'chain'].includes(request.admin.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' })
    }
    return reply.send(await upsertPropertyAmadeusConfig(propertyId, body))
  })

  // ── Test connection ───────────────────────────────────────────────────────
  fastify.post('/admin/amadeus/test', async (request, reply) => {
    const body = request.body as { orgId?: number; propertyId?: number }
    try {
      const orgId = request.admin.role === 'super' ? body.orgId : (request.admin.organizationId ?? undefined)
      const cfg = body.propertyId
        ? await getResolvedAmadeusConfig(body.propertyId)
        : await getResolvedAmadeusConfig(0, orgId)
      if (!cfg) return reply.send({ ok: false, error: 'Amadeus not configured or disabled' })
      await getAmadeusToken(cfg.tokenUrl, cfg.clientId, cfg.clientSecret)
      return reply.send({ ok: true })
    } catch (err) {
      return reply.send({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })
}
