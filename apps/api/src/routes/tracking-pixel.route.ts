import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/client.js'
import {
  listPixels,
  getPixel,
  createPixel,
  updatePixel,
  deletePixel,
  getActivePixelsForPage,
} from '../services/tracking-pixel.service.js'

export async function trackingPixelRoutes(fastify: FastifyInstance) {
  // ── Org-level pixels ────────────────────────────────────────────────────────

  fastify.get('/admin/pixels', async (request, reply) => {
    const orgId = request.admin.organizationId
    if (!orgId) return reply.send([])
    return reply.send(await listPixels(orgId, null))
  })

  fastify.post('/admin/pixels', async (request, reply) => {
    const orgId = request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const body = request.body as { name: string; code: string; pages: string[]; isActive?: boolean }
    if (!body.name?.trim()) return reply.status(400).send({ error: 'name is required', code: 'IBE.VALIDATION.001' })
    if (!body.code?.trim()) return reply.status(400).send({ error: 'code is required', code: 'IBE.VALIDATION.001' })
    if (!Array.isArray(body.pages) || body.pages.length === 0) {
      return reply.status(400).send({ error: 'pages must be a non-empty array', code: 'IBE.VALIDATION.001' })
    }
    const px = await createPixel(orgId, body, null)
    return reply.status(201).send(px)
  })

  // ── Property-level pixels ───────────────────────────────────────────────────

  fastify.get('/admin/properties/:propertyId/pixels', async (request, reply) => {
    const orgId = request.admin.organizationId
    const propertyId = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (!orgId) return reply.send([])
    return reply.send(await listPixels(orgId, propertyId))
  })

  fastify.post('/admin/properties/:propertyId/pixels', async (request, reply) => {
    const orgId = request.admin.organizationId
    const propertyId = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const body = request.body as { name: string; code: string; pages: string[]; isActive?: boolean }
    if (!body.name?.trim()) return reply.status(400).send({ error: 'name is required', code: 'IBE.VALIDATION.001' })
    if (!body.code?.trim()) return reply.status(400).send({ error: 'code is required', code: 'IBE.VALIDATION.001' })
    if (!Array.isArray(body.pages) || body.pages.length === 0) {
      return reply.status(400).send({ error: 'pages must be a non-empty array', code: 'IBE.VALIDATION.001' })
    }
    const px = await createPixel(orgId, body, propertyId)
    return reply.status(201).send(px)
  })

  // ── Shared update/delete (work for both org- and property-level) ────────────

  fastify.put('/admin/pixels/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const orgId = request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const body = request.body as { name?: string; code?: string; pages?: string[]; isActive?: boolean }
    const px = await updatePixel(id, orgId, body)
    if (!px) return reply.status(404).send({ error: 'Not found' })
    return reply.send(px)
  })

  fastify.delete('/admin/pixels/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const orgId = request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const existing = await getPixel(id, orgId)
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await deletePixel(id, orgId)
    return reply.send({ ok: true })
  })
}

export async function publicTrackingPixelRoutes(fastify: FastifyInstance) {
  fastify.get('/pixels', async (request, reply) => {
    const qs = request.query as { propertyId?: string; page?: string }
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    const page = qs.page ?? 'all'
    if (!propertyId) return reply.send({ pixels: [] })
    const prop = await prisma.property.findUnique({
      where: { propertyId: propertyId },
      select: { organizationId: true },
    })
    if (!prop) return reply.send({ pixels: [] })
    const pixels = await getActivePixelsForPage(prop.organizationId, propertyId, page)
    return reply.send({ pixels })
  })
}
