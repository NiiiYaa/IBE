import type { FastifyInstance } from 'fastify'
import { listCampaigns, createCampaign, updateCampaign, deleteCampaign, getCampaignOrg } from '../services/campaign.service.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'

async function resolveOrgId(admin: { organizationId: number | null }, propertyId: number | null): Promise<number | null> {
  if (admin.organizationId) return admin.organizationId
  if (propertyId) return (await getOrgIdForProperty(propertyId)) ?? null
  return null
}

export async function campaignRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/campaigns', async (request, reply) => {
    const qs = request.query as { propertyId?: string }
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    const orgId = await resolveOrgId(request.admin, propertyId)
    if (!orgId) return reply.header('Cache-Control', 'no-store').send([])
    const campaigns = await listCampaigns(orgId, propertyId)
    return reply.header('Cache-Control', 'no-store').send(campaigns)
  })

  fastify.post('/admin/campaigns', async (request, reply) => {
    const body = request.body as {
      code: string; name: string; email?: string | null
      commissionRate?: number | null; discountRate?: number | null; displayText?: string | null
      notes?: string | null; isActive?: boolean; propertyId?: number | null
    }
    if (!body.code?.trim()) return reply.status(400).send({ error: 'code is required' })
    if (!body.name?.trim()) return reply.status(400).send({ error: 'name is required' })
    if (body.commissionRate !== undefined && body.commissionRate !== null) {
      if (body.commissionRate < 0 || body.commissionRate > 100)
        return reply.status(400).send({ error: 'commissionRate must be 0–100' })
    }
    if (body.discountRate !== undefined && body.discountRate !== null) {
      if (body.discountRate < 0 || body.discountRate > 100)
        return reply.status(400).send({ error: 'discountRate must be 0–100' })
    }
    const orgId = await resolveOrgId(request.admin, body.propertyId ?? null)
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const campaign = await createCampaign(orgId, body)
    return reply.status(201).send(campaign)
  })

  fastify.put('/admin/campaigns/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const body = request.body as {
      code?: string; name?: string; email?: string | null
      commissionRate?: number | null; discountRate?: number | null; displayText?: string | null
      notes?: string | null; isActive?: boolean
    }
    if (body.commissionRate !== undefined && body.commissionRate !== null) {
      if (body.commissionRate < 0 || body.commissionRate > 100)
        return reply.status(400).send({ error: 'commissionRate must be 0–100' })
    }
    if (body.discountRate !== undefined && body.discountRate !== null) {
      if (body.discountRate < 0 || body.discountRate > 100)
        return reply.status(400).send({ error: 'discountRate must be 0–100' })
    }
    let orgId = request.admin.organizationId
    if (!orgId) {
      orgId = await getCampaignOrg(id)
      if (!orgId) return reply.status(404).send({ error: 'Not found' })
    }
    const campaign = await updateCampaign(orgId, id, body)
    return reply.send(campaign)
  })

  fastify.delete('/admin/campaigns/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    let orgId = request.admin.organizationId
    if (!orgId) {
      orgId = await getCampaignOrg(id)
      if (!orgId) return reply.status(404).send({ error: 'Not found' })
    }
    await deleteCampaign(orgId, id)
    return reply.send({ ok: true })
  })
}
