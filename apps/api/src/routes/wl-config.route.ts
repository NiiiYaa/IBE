import type { FastifyInstance } from 'fastify'
import type { WLConfigUpdate } from '@ibe/shared'
import {
  getSystemWLConfig, upsertSystemWLConfig,
  getOrgWLConfig, upsertOrgWLConfig,
  getPropertyWLConfig, upsertPropertyWLConfig,
  getResolvedWLConfig,
} from '../services/wl-config.service.js'

export async function wlAdminRoutes(fastify: FastifyInstance) {
  // ── System ────────────────────────────────────────────────────────────────
  fastify.get('/admin/wl/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemWLConfig())
  })

  fastify.put('/admin/wl/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await upsertSystemWLConfig(request.body as WLConfigUpdate))
  })

  // ── Org ───────────────────────────────────────────────────────────────────
  fastify.get('/admin/wl/config', async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? parseInt(rawOrgId, 10) : null)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await getOrgWLConfig(orgId))
  })

  fastify.put('/admin/wl/config', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const orgId = request.admin.role === 'super'
      ? ((body.orgId as number | undefined) ?? request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    if (body.enforceChildCreds !== undefined && request.admin.role !== 'super')
      return reply.status(403).send({ error: 'Only super admins can set enforceChildCreds' })
    if (body.systemServiceDisabled !== undefined && request.admin.role !== 'super')
      return reply.status(403).send({ error: 'Only super admins can set systemServiceDisabled' })
    return reply.send(await upsertOrgWLConfig(orgId, body as WLConfigUpdate))
  })

  // ── Property ──────────────────────────────────────────────────────────────
  fastify.get('/admin/wl/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string | undefined>).propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
    return reply.send(await getPropertyWLConfig(propertyId))
  })

  fastify.put('/admin/wl/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string | undefined>).propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
    return reply.send(await upsertPropertyWLConfig(propertyId, request.body as WLConfigUpdate))
  })
}

export async function wlPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/wl/config', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const fallbackOrgId = qs.orgId ? parseInt(qs.orgId, 10) : undefined
    return reply.send(await getResolvedWLConfig(propertyId, fallbackOrgId))
  })
}
