import type { FastifyInstance } from 'fastify'
import { listNavItems, createNavItem, updateNavItem, deleteNavItem, getOrgNavItemOverrides, setOrgNavItemOverride } from '../services/nav.service.js'

export async function navRoutes(fastify: FastifyInstance) {
  // GET /nav-items?propertyId=&section=
  fastify.get('/nav-items', async (request, reply) => {
    const { propertyId, section } = request.query as { propertyId?: string; section?: string }
    if (!propertyId) return reply.status(400).send({ error: 'propertyId is required' })
    const items = await listNavItems(Number(propertyId), section)
    return reply.send(items)
  })

  // POST /nav-items
  fastify.post('/nav-items', async (request, reply) => {
    const { propertyId, ...data } = request.body as { propertyId: number } & import('@ibe/shared').CreateNavItemRequest
    if (!propertyId) return reply.status(400).send({ error: 'propertyId is required' })
    const item = await createNavItem(propertyId, data)
    return reply.status(201).send(item)
  })

  // PUT /nav-items/:id
  fastify.put('/nav-items/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = request.body as import('@ibe/shared').UpdateNavItemRequest
    const item = await updateNavItem(id, data)
    return reply.send(item)
  })

  // DELETE /nav-items/:id
  fastify.delete('/nav-items/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteNavItem(id)
    return reply.send({ ok: true })
  })

  // PUT /nav-items/reorder — bulk update order for a section
  fastify.put('/nav-items/reorder', async (request, reply) => {
    const { ids } = request.body as { ids: string[] }
    await Promise.all(ids.map((id, order) => updateNavItem(id, { order })))
    return reply.send({ ok: true })
  })
}
