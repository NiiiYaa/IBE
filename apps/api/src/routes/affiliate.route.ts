import type { FastifyInstance } from 'fastify'
import { listAffiliates, createAffiliate, updateAffiliate, deleteAffiliate, getAffiliateOrg, resetAffiliatePortalPassword } from '../services/affiliate.service.js'
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

  fastify.post('/admin/affiliates/:id/reset-password', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    let orgId = request.admin.organizationId
    if (!orgId) {
      orgId = await getAffiliateOrg(id)
      if (!orgId) return reply.status(404).send({ error: 'Not found' })
    }
    try {
      const result = await resetAffiliatePortalPassword(id, orgId)
      return reply.send(result)
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Failed to reset password' })
    }
  })

  // GET /admin/super/affiliate-users — all portal registrations (super only)
  fastify.get('/admin/super/affiliate-users', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const includeDeleted = (request.query as Record<string, string>).includeDeleted === 'true'
    const users = await prisma.adminUser.findMany({
      where: { role: 'affiliate', ...(includeDeleted ? {} : { deletedAt: null }) },
      select: {
        id: true, name: true, email: true, isActive: true, emailVerified: true,
        createdAt: true, deletedAt: true, organizationId: true,
        affiliateProfile: { select: { country: true, accountType: true, companyName: true } },
        affiliate: { select: { id: true, code: true, organizationId: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      emailVerified: u.emailVerified,
      deletedAt: u.deletedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      organizationId: u.organizationId,
      country: u.affiliateProfile?.country ?? null,
      accountType: u.affiliateProfile?.accountType ?? null,
      companyName: u.affiliateProfile?.companyName ?? null,
      linkedAffiliateId: u.affiliate?.id ?? null,
      linkedAffiliateCode: u.affiliate?.code ?? null,
      linkedOrgId: u.affiliate?.organizationId ?? null,
    })))
  })

  // POST /admin/super/affiliate-users/:id/approve — force-activate (super only)
  fastify.post('/admin/super/affiliate-users/:id/approve', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const id = parseInt((request.params as { id: string }).id, 10)
    const user = await prisma.adminUser.findUnique({ where: { id } })
    if (!user || user.role !== 'affiliate') return reply.status(404).send({ error: 'Not found' })
    await prisma.adminUser.update({
      where: { id },
      data: { isActive: true, emailVerified: true, emailVerifyToken: null },
    })
    return reply.send({ ok: true })
  })

  // PUT /admin/super/affiliate-users/:id — update name / isActive (super only)
  fastify.put('/admin/super/affiliate-users/:id', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const id = parseInt((request.params as { id: string }).id, 10)
    const body = request.body as { name?: string; isActive?: boolean }
    const user = await prisma.adminUser.findUnique({ where: { id } })
    if (!user || user.role !== 'affiliate') return reply.status(404).send({ error: 'Not found' })
    await prisma.adminUser.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    })
    return reply.send({ ok: true })
  })

  // DELETE /admin/super/affiliate-users/:id — soft delete (super only)
  fastify.delete('/admin/super/affiliate-users/:id', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const id = parseInt((request.params as { id: string }).id, 10)
    const user = await prisma.adminUser.findUnique({ where: { id } })
    if (!user || user.role !== 'affiliate') return reply.status(404).send({ error: 'Not found' })
    await prisma.adminUser.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } })
    return reply.send({ ok: true })
  })

  // POST /admin/super/affiliate-users/:id/revive — restore soft-deleted (super only)
  fastify.post('/admin/super/affiliate-users/:id/revive', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const id = parseInt((request.params as { id: string }).id, 10)
    const user = await prisma.adminUser.findUnique({ where: { id } })
    if (!user || user.role !== 'affiliate') return reply.status(404).send({ error: 'Not found' })
    await prisma.adminUser.update({ where: { id }, data: { isActive: true, deletedAt: null } })
    return reply.send({ ok: true })
  })

  // POST /admin/super/affiliate-users/:id/reset-password — reset portal password by AdminUser id (super only)
  fastify.post('/admin/super/affiliate-users/:id/reset-password', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const id = parseInt((request.params as { id: string }).id, 10)
    const user = await prisma.adminUser.findUnique({ where: { id } })
    if (!user || user.role !== 'affiliate') return reply.status(404).send({ error: 'Not found' })
    if (!user.email) return reply.status(400).send({ error: 'User has no email' })
    const { hashPassword } = await import('../services/auth.service.js')
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const temporaryPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const passwordHash = await hashPassword(temporaryPassword)
    await prisma.adminUser.update({ where: { id }, data: { passwordHash, mustChangePassword: true } })
    return reply.send({ name: user.name, email: user.email, temporaryPassword })
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
