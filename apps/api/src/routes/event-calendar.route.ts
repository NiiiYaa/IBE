import type { FastifyInstance } from 'fastify'
import {
  getSystemEventCalendarConfig,
  upsertSystemEventCalendarConfig,
  getPropertyEventCalendarConfig,
  upsertPropertyEventCalendarConfig,
  getPropertyEvents,
  getChainEvents,
} from '../services/event-calendar.service.js'
import { refreshPropertyEvents } from '../services/event-calendar-fetch.service.js'

export async function eventCalendarRoutes(fastify: FastifyInstance) {

  // GET system config (super only)
  fastify.get('/admin/intelligence/event-calendar/system-config', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    return reply.send(await getSystemEventCalendarConfig())
  })

  // PUT system config (super only)
  fastify.put('/admin/intelligence/event-calendar/system-config', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    return reply.send(await upsertSystemEventCalendarConfig(request.body as Record<string, unknown>))
  })

  // GET property config
  fastify.get('/admin/intelligence/event-calendar/config', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = parseInt(query.propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    return reply.send(await getPropertyEventCalendarConfig(propertyId))
  })

  // PUT property config
  fastify.put('/admin/intelligence/event-calendar/config', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = parseInt(query.propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const body = request.body as Record<string, unknown>
    return reply.send(await upsertPropertyEventCalendarConfig(propertyId, {
      radiusKm: body.radiusKm as number | null,
    }))
  })

  // POST manual run
  fastify.post('/admin/intelligence/event-calendar/run', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = parseInt(query.propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })

    const today = new Date()
    const defaultStart = today.toISOString().split('T')[0]!
    const end = new Date(today)
    end.setDate(end.getDate() + 30)
    const defaultEnd = end.toISOString().split('T')[0]!

    const from = query.from ?? defaultStart
    const to = query.to ?? defaultEnd

    void refreshPropertyEvents(propertyId, from, to).catch(err =>
      fastify.log.warn({ err, propertyId }, '[EventCalendar] Background run failed'),
    )
    return reply.send({ started: true })
  })

  // GET events overlapping window
  fastify.get('/admin/intelligence/event-calendar/events', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = parseInt(query.propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const from = query.from ?? new Date().toISOString().split('T')[0]!
    const end = new Date()
    end.setDate(end.getDate() + 30)
    const to = query.to ?? end.toISOString().split('T')[0]!
    return reply.send(await getPropertyEvents(propertyId, from, to))
  })

  // GET chain events (all properties for an org)
  fastify.get('/admin/intelligence/event-calendar/events/chain', async (request, reply) => {
    const query = request.query as Record<string, string>
    const rawOrgId = query.orgId ? parseInt(query.orgId, 10) : undefined
    const orgId = request.admin.role === 'super' ? rawOrgId : (request.admin.organizationId ?? undefined)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    return reply.send(await getChainEvents(orgId))
  })
}
