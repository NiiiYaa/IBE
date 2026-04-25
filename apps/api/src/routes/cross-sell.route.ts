import type { FastifyInstance } from 'fastify'
import {
  getCrossSellConfig, updateCrossSellConfig,
  createCrossSellProduct, updateCrossSellProduct, deleteCrossSellProduct,
  getPropertyCrossSellOverride, upsertPropertyCrossSellOverride,
} from '../services/cross-sell.service.js'
import { prisma } from '../db/client.js'

export async function crossSellAdminRoutes(fastify: FastifyInstance) {
  // GET /admin/cross-sell/config?orgId=X
  fastify.get('/admin/cross-sell/config', async (request, reply) => {
    const { orgId: rawOrgId } = request.query as { orgId?: string }
    const admin = request.admin
    const orgId = admin.role === 'super' && rawOrgId
      ? parseInt(rawOrgId, 10)
      : (admin.organizationId ?? null)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    return reply.send(await getCrossSellConfig(orgId))
  })

  // PUT /admin/cross-sell/config
  fastify.put('/admin/cross-sell/config', async (request, reply) => {
    const body = request.body as { orgId?: number; enabled?: boolean; paymentMode?: string; showExternalEvents?: boolean }
    const admin = request.admin
    const orgId = admin.role === 'super' && body.orgId ? body.orgId : (admin.organizationId ?? null)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const update: import('@ibe/shared').CrossSellConfigUpdate = {}
    if (body.enabled !== undefined) update.enabled = body.enabled
    if (body.paymentMode === 'informational' || body.paymentMode === 'online') update.paymentMode = body.paymentMode
    if (body.showExternalEvents !== undefined) update.showExternalEvents = body.showExternalEvents
    return reply.send(await updateCrossSellConfig(orgId, update))
  })

  // POST /admin/cross-sell/products
  fastify.post('/admin/cross-sell/products', async (request, reply) => {
    const { orgId: rawOrgId, ...data } = request.body as { orgId?: number; [k: string]: unknown }
    const admin = request.admin
    const orgId = admin.role === 'super' && rawOrgId ? rawOrgId : (admin.organizationId ?? null)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const product = await createCrossSellProduct(orgId, data as unknown as Parameters<typeof createCrossSellProduct>[1])
    return reply.status(201).send(product)
  })

  // PUT /admin/cross-sell/products/:id
  fastify.put('/admin/cross-sell/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { orgId: rawOrgId, ...data } = request.body as { orgId?: number; [k: string]: unknown }
    const admin = request.admin
    const orgId = admin.role === 'super' && rawOrgId ? rawOrgId : (admin.organizationId ?? null)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const product = await updateCrossSellProduct(orgId, parseInt(id, 10), data as Parameters<typeof updateCrossSellProduct>[2])
    if (!product) return reply.status(404).send({ error: 'Product not found' })
    return reply.send(product)
  })

  // DELETE /admin/cross-sell/products/:id
  fastify.delete('/admin/cross-sell/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { orgId: rawOrgId } = request.query as { orgId?: string }
    const admin = request.admin
    const orgId = admin.role === 'super' && rawOrgId ? parseInt(rawOrgId, 10) : (admin.organizationId ?? null)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const ok = await deleteCrossSellProduct(orgId, parseInt(id, 10))
    if (!ok) return reply.status(404).send({ error: 'Product not found' })
    return reply.status(204).send()
  })

  // GET /admin/cross-sell/property/:propertyId — property-level override
  fastify.get('/admin/cross-sell/property/:propertyId', async (request, reply) => {
    const { propertyId: rawId } = request.params as { propertyId: string }
    const prop = await prisma.property.findUnique({ where: { propertyId: parseInt(rawId, 10) } })
    if (!prop) return reply.status(404).send({ error: 'Property not found' })
    const override = await getPropertyCrossSellOverride(prop.id)
    return reply.send({ enabled: override?.enabled ?? null, paymentMode: override?.paymentMode ?? null })
  })

  // PUT /admin/cross-sell/property/:propertyId
  fastify.put('/admin/cross-sell/property/:propertyId', async (request, reply) => {
    const { propertyId: rawId } = request.params as { propertyId: string }
    const body = request.body as { enabled?: boolean | null; paymentMode?: string | null }
    const prop = await prisma.property.findUnique({ where: { propertyId: parseInt(rawId, 10) } })
    if (!prop) return reply.status(404).send({ error: 'Property not found' })
    const override = await upsertPropertyCrossSellOverride(prop.id, prop.organizationId, body)
    return reply.send({ enabled: override.enabled ?? null, paymentMode: override.paymentMode ?? null })
  })
}

// Public route — called from booking confirmation page
export async function crossSellPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/cross-sell/:propertyId', async (request, reply) => {
    const { propertyId: rawId } = request.params as { propertyId: string }
    const propertyId = parseInt(rawId, 10)
    if (isNaN(propertyId) || propertyId <= 0) return reply.status(400).send({ error: 'Invalid propertyId' })

    const { getResolvedCrossSell } = await import('../services/cross-sell.service.js')
    const result = await getResolvedCrossSell(propertyId)
    if (!result) return reply.status(404).send({ error: 'Property not found' })

    void reply.header('Cache-Control', 'public, max-age=60')
    return reply.send(result)
  })
}
