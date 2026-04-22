import type { FastifyInstance } from 'fastify'
import type { SellModel } from '../services/org.service.js'
import type { MarketingFeature } from '../services/marketing.service.js'
import {
  getOrgMarketingSettings,
  updateOrgMarketingSettings,
  getPropertyMarketingSettings,
  updatePropertyMarketingSettings,
} from '../services/marketing.service.js'
import { prisma } from '../db/client.js'

export async function marketingRoutes(fastify: FastifyInstance) {
  // ── Org-level ──────────────────────────────────────────────────────────────

  fastify.get('/admin/marketing/settings', async (request, reply) => {
    let orgId = request.admin.organizationId
    if (orgId === null) {
      const firstOrg = await prisma.organization.findFirst({ select: { id: true } })
      orgId = firstOrg?.id ?? null
    }
    if (!orgId) return reply.status(403).send({ error: 'No org' })
    const settings = await getOrgMarketingSettings(orgId)
    return reply.send(settings)
  })

  fastify.put('/admin/marketing/settings', async (request, reply) => {
    let orgId = request.admin.organizationId
    if (orgId === null) {
      const firstOrg = await prisma.organization.findFirst({ select: { id: true } })
      orgId = firstOrg?.id ?? null
    }
    if (!orgId) return reply.status(403).send({ error: 'No org' })
    try {
      const body = request.body as Partial<Record<MarketingFeature, SellModel[]>>
      const settings = await updateOrgMarketingSettings(orgId, body)
      return reply.send(settings)
    } catch (err) {
      fastify.log.error(err, 'Failed to update org marketing settings')
      return reply.status(500).send({ error: err instanceof Error ? err.message : 'Internal error' })
    }
  })

  // ── Property-level ─────────────────────────────────────────────────────────

  fastify.get('/admin/marketing/settings/property/:propertyId', async (request, reply) => {
    const { propertyId } = request.params as { propertyId: string }
    const pid = Number(propertyId)
    if (!pid) return reply.status(400).send({ error: 'Invalid propertyId' })
    const settings = await getPropertyMarketingSettings(pid)
    return reply.send(settings)
  })

  fastify.put('/admin/marketing/settings/property/:propertyId', async (request, reply) => {
    const { propertyId } = request.params as { propertyId: string }
    const pid = Number(propertyId)
    if (!pid) return reply.status(400).send({ error: 'Invalid propertyId' })
    const body = request.body as Partial<Record<MarketingFeature, SellModel[] | null>>
    const settings = await updatePropertyMarketingSettings(pid, body)
    return reply.send(settings)
  })
}

// Public endpoint — used by frontend to check which features are on
export async function publicMarketingRoutes(fastify: FastifyInstance) {
  fastify.get('/marketing/settings/effective', async (request, reply) => {
    const query = request.query as { propertyId?: string }
    const pid = query.propertyId ? Number(query.propertyId) : null
    if (!pid) return reply.status(400).send({ error: 'propertyId required' })
    const { effective } = await getPropertyMarketingSettings(pid)
    return reply.send(effective)
  })
}
