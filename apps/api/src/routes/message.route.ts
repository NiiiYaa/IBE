import type { FastifyInstance } from 'fastify'
import { listMessageRules, createMessageRule, updateMessageRule, deleteMessageRule, getMessageRuleOrg } from '../services/message.service.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'

async function resolveOrgId(admin: { organizationId: number | null }, propertyId: number | null): Promise<number | null> {
  if (admin.organizationId) return admin.organizationId
  if (propertyId) return (await getOrgIdForProperty(propertyId)) ?? null
  return null
}

export async function messageRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/messages', async (request, reply) => {
    const qs = request.query as { propertyId?: string }
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    const orgId = await resolveOrgId(request.admin, propertyId)
    if (!orgId) return reply.send([])
    return reply.send(await listMessageRules(orgId, propertyId))
  })

  fastify.post('/admin/messages', async (request, reply) => {
    const body = request.body as {
      name: string; enabled?: boolean; channels: string[]
      trigger: string; offsetValue?: number; offsetUnit?: string; direction?: string
      propertyId?: number | null
    }
    if (!body.name?.trim()) {
      return reply.status(400).send({ error: 'name is required', code: 'IBE.VALIDATION.001' })
    }
    if (!body.trigger) {
      return reply.status(400).send({ error: 'trigger is required', code: 'IBE.VALIDATION.001' })
    }
    const orgId = await resolveOrgId(request.admin, body.propertyId ?? null)
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const rule = await createMessageRule(orgId, body)
    return reply.status(201).send(rule)
  })

  fastify.put('/admin/messages/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const body = request.body as {
      name?: string; enabled?: boolean; channels?: string[]
      trigger?: string; offsetValue?: number; offsetUnit?: string; direction?: string
    }
    let orgId = request.admin.organizationId
    if (!orgId) {
      orgId = await getMessageRuleOrg(id)
      if (!orgId) return reply.status(404).send({ error: 'Not found' })
    }
    const rule = await updateMessageRule(orgId, id, body)
    return reply.send(rule)
  })

  fastify.delete('/admin/messages/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    let orgId = request.admin.organizationId
    if (!orgId) {
      orgId = await getMessageRuleOrg(id)
      if (!orgId) return reply.status(404).send({ error: 'Not found' })
    }
    await deleteMessageRule(orgId, id)
    return reply.send({ ok: true })
  })
}
