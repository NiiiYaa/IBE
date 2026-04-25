import type { FastifyInstance } from 'fastify'
import { getSystemEventsConfig, upsertSystemEventsConfig, getEventsConfig, upsertEventsConfig, getResolvedEventsConfig } from '../services/events-config.service.js'
import { decryptApiKey } from '../services/ai-config.service.js'
import { prisma } from '../db/client.js'

export async function eventsConfigRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/events/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemEventsConfig())
  })

  fastify.put('/admin/events/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await upsertSystemEventsConfig(request.body as Record<string, unknown>))
  })

  fastify.get('/admin/events/config', async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? parseInt(rawOrgId, 10) : null)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await getEventsConfig(orgId))
  })

  fastify.put('/admin/events/config', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const orgId = request.admin.role === 'super'
      ? ((body.orgId as number | undefined) ?? request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    if (body.systemServiceDisabled !== undefined && request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Only super admins can disable system services' })
    }
    return reply.send(await upsertEventsConfig(orgId, body))
  })

  fastify.post('/admin/events/test', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const rawOrgId = body.orgId ?? (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? Number(rawOrgId) : null)
      : request.admin.organizationId

    try {
      if (!orgId && request.admin.role === 'super') {
        const row = await prisma.systemEventsConfig.findFirst()
        if (!row?.apiKey) return reply.send({ ok: false, error: 'No Ticketmaster API key configured' })
        const key = decryptApiKey(row.apiKey)
        const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${key}&size=1`)
        return reply.send(res.ok || res.status === 400 ? { ok: true } : { ok: false, error: `Ticketmaster returned ${res.status}` })
      }
      if (!orgId) return reply.status(400).send({ error: 'No organization context' })
      const prop = await prisma.property.findFirst({ where: { organizationId: orgId }, select: { propertyId: true } })
      const cfg = await getResolvedEventsConfig(prop?.propertyId ?? 0)
      if (!cfg.apiKey) return reply.send({ ok: false, error: 'No Ticketmaster API key configured' })
      const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${cfg.apiKey}&size=1`)
      return reply.send(res.ok || res.status === 400 ? { ok: true } : { ok: false, error: `Ticketmaster returned ${res.status}` })
    } catch (err) {
      return reply.send({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })
}
