import type { FastifyInstance } from 'fastify'
import { setPropertyOverride } from '../services/property-override.service.js'
import { getOrgNavItemOverrides, setOrgNavItemOverride } from '../services/nav.service.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'

export async function propertyOverrideRoutes(fastify: FastifyInstance) {
  fastify.put('/admin/property-overrides', async (request, reply) => {
    const body = request.body as {
      entityType: 'affiliate' | 'message_rule' | 'promo_code'
      entityId: number
      propertyId: number
      isEnabled: boolean
    }
    if (!body.entityType || !body.entityId || !body.propertyId || body.isEnabled === undefined) {
      return reply.status(400).send({ error: 'Missing required fields' })
    }
    const orgId = request.admin.organizationId
      ?? (await getOrgIdForProperty(body.propertyId)) ?? null
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    await setPropertyOverride(body.entityType, body.entityId, body.propertyId, body.isEnabled)
    return reply.send({ ok: true })
  })

  fastify.get('/admin/org-nav-item-overrides', async (request, reply) => {
    const qs = request.query as { propertyId?: string }
    if (!qs.propertyId) return reply.status(400).send({ error: 'propertyId is required' })
    const propertyId = parseInt(qs.propertyId, 10)
    const overrides = await getOrgNavItemOverrides(propertyId)
    return reply.send(overrides)
  })

  fastify.put('/admin/org-nav-item-overrides', async (request, reply) => {
    const body = request.body as { orgNavItemId: string; propertyId: number; isEnabled: boolean }
    if (!body.orgNavItemId || !body.propertyId || body.isEnabled === undefined) {
      return reply.status(400).send({ error: 'Missing required fields' })
    }
    await setOrgNavItemOverride(body.orgNavItemId, body.propertyId, body.isEnabled)
    return reply.send({ ok: true })
  })
}
