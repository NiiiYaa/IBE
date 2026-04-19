import type { FastifyInstance } from 'fastify'
import {
  listPriceComparisonOtas,
  createPriceComparisonOta,
  updatePriceComparisonOta,
  deletePriceComparisonOta,
  getPriceComparisonResults,
} from '../services/price-comparison.service.js'
import { scrapeOtaPrice } from '../services/ota-scraper.service.js'

export async function priceComparisonRoutes(fastify: FastifyInstance) {
  // Public endpoint — called from search results page
  fastify.get('/price-comparison/results', async (request, reply) => {
    const q = request.query as Record<string, string>
    const { checkin, checkout, adults, children, rooms, propertyId } = q
    if (!checkin || !checkout || !adults) {
      return reply.status(400).send({ error: 'checkin, checkout, adults are required' })
    }
    const results = await getPriceComparisonResults(
      {
        checkin,
        checkout,
        adults: Number(adults),
        children: Number(children ?? 0),
        rooms: Number(rooms ?? 1),
      },
      propertyId ? Number(propertyId) : undefined,
    )
    return reply.send({ results })
  })

  // ── Admin routes (require auth via parent plugin scope) ─────────────────────

  fastify.get('/admin/price-comparison/debug-scrape', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { url } = request.query as { url?: string }
    if (!url) return reply.status(400).send({ error: 'url is required' })
    const result = await scrapeOtaPrice(url)
    return reply.send({ url, ...result })
  })

  fastify.get('/admin/price-comparison', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const otas = await listPriceComparisonOtas(request.admin.organizationId!)
    return reply.send(otas)
  })

  fastify.post('/admin/price-comparison', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as { name?: string; url?: string; isEnabled?: boolean }
    if (!body.name?.trim() || !body.url?.trim()) {
      return reply.status(400).send({ error: 'name and url are required' })
    }
    const ota = await createPriceComparisonOta(request.admin.organizationId!, { name: body.name, url: body.url, isEnabled: body.isEnabled ?? true })
    return reply.status(201).send(ota)
  })

  fastify.put('/admin/price-comparison/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { name?: string; url?: string; isEnabled?: boolean }
    const ota = await updatePriceComparisonOta(request.admin.organizationId!, Number(id), body)
    return reply.send(ota)
  })

  fastify.delete('/admin/price-comparison/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deletePriceComparisonOta(request.admin.organizationId!, Number(id))
    return reply.status(204).send()
  })
}
