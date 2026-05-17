import type { FastifyInstance } from 'fastify'
import type { AirportConfigUpdate } from '@ibe/shared'
import {
  getSystemAirportConfig, upsertSystemAirportConfig, refreshAirportDataset,
  getOrgAirportConfig, upsertOrgAirportConfig,
  getPropertyAirportConfig, upsertPropertyAirportConfig,
  getNearestAirports,
} from '../services/airport-config.service.js'

export async function airportAdminRoutes(fastify: FastifyInstance) {
  // ── System ────────────────────────────────────────────────────────────────
  fastify.get('/admin/airport/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemAirportConfig())
  })

  fastify.put('/admin/airport/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await upsertSystemAirportConfig(request.body as AirportConfigUpdate))
  })

  fastify.post('/admin/airport/config/system/refresh-dataset', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    try {
      return reply.send(await refreshAirportDataset())
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send({ error: 'Failed to refresh airport dataset' })
    }
  })

  // ── Org ───────────────────────────────────────────────────────────────────
  fastify.get('/admin/airport/config/org', async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? parseInt(rawOrgId, 10) : null)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await getOrgAirportConfig(orgId))
  })

  fastify.put('/admin/airport/config/org', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const orgId = request.admin.role === 'super'
      ? ((body.orgId as number | undefined) ?? request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await upsertOrgAirportConfig(orgId, body as AirportConfigUpdate))
  })

  // ── Property ──────────────────────────────────────────────────────────────
  fastify.get('/admin/airport/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string | undefined>).propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
    return reply.send(await getPropertyAirportConfig(propertyId))
  })

  fastify.put('/admin/airport/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string | undefined>).propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
    return reply.send(await upsertPropertyAirportConfig(propertyId, request.body as AirportConfigUpdate))
  })
}

export async function airportPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/airports/nearest', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const rawRadius = qs.radiusKm ? parseInt(qs.radiusKm, 10) : undefined
    const radiusKmOverride = rawRadius !== undefined && !isNaN(rawRadius)
      ? Math.min(300, Math.max(1, rawRadius))
      : undefined
    const forMap = qs.forMap === 'true'
    return reply.send(await getNearestAirports(propertyId, radiusKmOverride, forMap))
  })
}
