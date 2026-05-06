import type { FastifyInstance } from 'fastify'
import { getPropertyDetail } from '../services/static.service.js'
import { invalidatePropertyCache } from '../adapters/hyperguest/static.js'
import { IBE_ERROR_NOT_FOUND } from '@ibe/shared'
import { HyperGuestApiError } from '../adapters/hyperguest/client.js'
import { env } from '../config/env.js'

const ALLOWED_IMAGE_HOSTS = new Set(['hg-static.hyperguest.com', 'hg-static.hyperguest.io'])
if (env.HYPERGUEST_STATIC_DOMAIN) ALLOWED_IMAGE_HOSTS.add(env.HYPERGUEST_STATIC_DOMAIN)

export async function staticRoutes(fastify: FastifyInstance) {
  // GET /properties/:id — full static data for a property
  fastify.get('/properties/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const propertyId = parseInt(id, 10)

    if (isNaN(propertyId) || propertyId <= 0) {
      return reply.status(400).send({ error: 'Invalid property ID', code: 'IBE.VALIDATION.001' })
    }

    try {
      const detail = await getPropertyDetail(propertyId)
      return reply.send(detail)
    } catch (err) {
      if (err instanceof HyperGuestApiError && err.httpStatus === 404) {
        return reply.status(404).send({ error: 'Property not found', code: IBE_ERROR_NOT_FOUND })
      }
      throw err
    }
  })

  // GET /public/image-proxy?url=... — proxy HyperGuest CDN images (avoids hotlink blocks)
  fastify.get('/public/image-proxy', async (request, reply) => {
    const { url } = request.query as { url?: string }
    if (!url) return reply.status(400).send('Missing url')
    let parsed: URL
    try { parsed = new URL(url) } catch { return reply.status(400).send('Invalid url') }
    if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) return reply.status(403).send('Forbidden')
    try {
      const res = await fetch(url, {
        headers: { Referer: env.WEB_BASE_URL, 'User-Agent': 'IBE-Proxy/1.0' },
      })
      if (!res.ok) return reply.status(res.status).send()
      reply.header('Content-Type', res.headers.get('Content-Type') ?? 'image/jpeg')
      reply.header('Cache-Control', 'public, max-age=86400')
      reply.header('Access-Control-Allow-Origin', '*')
      return reply.send(Buffer.from(await res.arrayBuffer()))
    } catch {
      return reply.status(502).send('Proxy error')
    }
  })

  // DELETE /properties/:id/cache — invalidate static cache for a property
  fastify.delete('/properties/:id/cache', async (request, reply) => {
    const { id } = request.params as { id: string }
    const propertyId = parseInt(id, 10)
    if (isNaN(propertyId) || propertyId <= 0) {
      return reply.status(400).send({ error: 'Invalid property ID', code: 'IBE.VALIDATION.001' })
    }
    await invalidatePropertyCache(propertyId)
    return reply.send({ ok: true })
  })
}
