import type { FastifyInstance } from 'fastify'
import { listPromoCodes, createPromoCode, updatePromoCode, deletePromoCode, getPromoCodeOrg } from '../services/promo.service.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'

async function resolveOrgId(admin: { organizationId: number | null }, propertyId: number | null): Promise<number | null> {
  if (admin.organizationId) return admin.organizationId
  if (propertyId) return (await getOrgIdForProperty(propertyId)) ?? null
  return null
}

export async function promoRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/promo-codes', async (request, reply) => {
    const qs = request.query as { propertyId?: string }
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    const orgId = await resolveOrgId(request.admin, propertyId)
    if (!orgId) return reply.send([])
    const codes = await listPromoCodes(orgId, propertyId)
    return reply.send(codes)
  })

  fastify.post('/admin/promo-codes', async (request, reply) => {
    const body = request.body as {
      code: string
      description?: string | null
      discountValue: number
      validFrom?: string | null
      validTo?: string | null
      propertyId?: number | null
    }

    if (!body.code || body.code.trim().length === 0) {
      return reply.status(400).send({ error: 'code is required', code: 'IBE.VALIDATION.001' })
    }
    if (typeof body.discountValue !== 'number' || body.discountValue < 0 || body.discountValue > 100) {
      return reply.status(400).send({ error: 'discountValue must be 0–100', code: 'IBE.VALIDATION.001' })
    }

    const orgId = await resolveOrgId(request.admin, body.propertyId ?? null)
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const promo = await createPromoCode(orgId, body)
    return reply.status(201).send(promo)
  })

  fastify.put('/admin/promo-codes/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const body = request.body as {
      code?: string
      description?: string | null
      discountValue?: number
      validFrom?: string | null
      validTo?: string | null
      isActive?: boolean
    }

    if (body.discountValue !== undefined && (body.discountValue < 0 || body.discountValue > 100)) {
      return reply.status(400).send({ error: 'discountValue must be 0–100', code: 'IBE.VALIDATION.001' })
    }

    let orgId = request.admin.organizationId
    if (!orgId) {
      orgId = await getPromoCodeOrg(id)
      if (!orgId) return reply.status(404).send({ error: 'Not found' })
    }
    const promo = await updatePromoCode(orgId, id, body)
    return reply.send(promo)
  })

  fastify.delete('/admin/promo-codes/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    let orgId = request.admin.organizationId
    if (!orgId) {
      orgId = await getPromoCodeOrg(id)
      if (!orgId) return reply.status(404).send({ error: 'Not found' })
    }
    await deletePromoCode(orgId, id)
    return reply.send({ ok: true })
  })
}
