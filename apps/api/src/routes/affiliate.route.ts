import type { FastifyInstance } from 'fastify'
import { listAffiliates, createAffiliate, updateAffiliate, deleteAffiliate, getAffiliateOrg } from '../services/affiliate.service.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'
import { prisma } from '../db/client.js'

async function resolveOrgId(admin: { organizationId: number | null }, propertyId: number | null): Promise<number | null> {
  if (admin.organizationId) return admin.organizationId
  if (propertyId) return (await getOrgIdForProperty(propertyId)) ?? null
  return null
}

export async function affiliateRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/affiliates', async (request, reply) => {
    const qs = request.query as { propertyId?: string }
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    const orgId = await resolveOrgId(request.admin, propertyId)
    if (!orgId) return reply.header('Cache-Control', 'no-store').send([])
    const affiliates = await listAffiliates(orgId, propertyId)
    return reply.header('Cache-Control', 'no-store').send(affiliates)
  })

  fastify.post('/admin/affiliates', async (request, reply) => {
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
    const affiliate = await createAffiliate(orgId, body)
    return reply.status(201).send(affiliate)
  })

  fastify.put('/admin/affiliates/:id', async (request, reply) => {
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
      orgId = await getAffiliateOrg(id)
      if (!orgId) return reply.status(404).send({ error: 'Not found' })
    }
    const affiliate = await updateAffiliate(orgId, id, body)
    return reply.send(affiliate)
  })

  fastify.delete('/admin/affiliates/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    let orgId = request.admin.organizationId
    if (!orgId) {
      orgId = await getAffiliateOrg(id)
      if (!orgId) return reply.status(404).send({ error: 'Not found' })
    }
    await deleteAffiliate(orgId, id)
    return reply.send({ ok: true })
  })

  // GET /admin/affiliates/marketplace-config — chain-level marketplace defaults
  fastify.get('/admin/affiliates/marketplace-config', async (request, reply) => {
    const qs = request.query as { propertyId?: string; orgId?: string }
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    const explicitOrgId = qs.orgId ? parseInt(qs.orgId, 10) : null
    const orgId = request.admin.organizationId ?? explicitOrgId ?? (propertyId ? await getOrgIdForProperty(propertyId) : null)
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const row = await prisma.orgSettings.findUnique({
      where: { organizationId: orgId },
      select: { affiliateMarketplace: true, affiliateDefaultCommissionRate: true },
    })
    return reply.send({
      affiliateMarketplace: row?.affiliateMarketplace ?? false,
      affiliateDefaultCommissionRate: row?.affiliateDefaultCommissionRate != null
        ? Number(row.affiliateDefaultCommissionRate) : null,
    })
  })

  // PUT /admin/affiliates/marketplace-config — update chain-level marketplace defaults
  fastify.put('/admin/affiliates/marketplace-config', async (request, reply) => {
    const qs = request.query as { propertyId?: string; orgId?: string }
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    const explicitOrgId = qs.orgId ? parseInt(qs.orgId, 10) : null
    const orgId = request.admin.organizationId ?? explicitOrgId ?? (propertyId ? await getOrgIdForProperty(propertyId) : null)
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const body = request.body as { affiliateMarketplace?: boolean; affiliateDefaultCommissionRate?: number | null }
    const data: Record<string, unknown> = {}
    if (body.affiliateMarketplace !== undefined) data.affiliateMarketplace = body.affiliateMarketplace
    if (body.affiliateDefaultCommissionRate !== undefined) data.affiliateDefaultCommissionRate = body.affiliateDefaultCommissionRate
    await prisma.orgSettings.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, ...data },
      update: data,
    })
    const row = await prisma.orgSettings.findUnique({
      where: { organizationId: orgId },
      select: { affiliateMarketplace: true, affiliateDefaultCommissionRate: true },
    })
    return reply.send({
      affiliateMarketplace: row?.affiliateMarketplace ?? false,
      affiliateDefaultCommissionRate: row?.affiliateDefaultCommissionRate != null
        ? Number(row.affiliateDefaultCommissionRate) : null,
    })
  })
}
