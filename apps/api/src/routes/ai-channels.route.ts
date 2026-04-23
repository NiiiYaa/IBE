import type { FastifyInstance } from 'fastify'
import { getOrgAIChannels, upsertOrgAIChannels } from '../services/ai-channels.service.js'
import type { UpdateAIChannelSettingsRequest } from '../services/ai-channels.service.js'
import { prisma } from '../db/client.js'

export async function aiChannelsRoutes(fastify: FastifyInstance) {
  // GET /admin/ai/channels — get org AI channel settings
  fastify.get('/admin/ai/channels', async (request, reply) => {
    const query = request.query as { orgId?: string }
    let orgId = request.admin.organizationId

    // Super admin can pass ?orgId= to manage any org
    if (orgId === null && query.orgId) {
      orgId = Number(query.orgId) || null
    }
    if (orgId === null) {
      const firstOrg = await prisma.organization.findFirst({ select: { id: true } })
      orgId = firstOrg?.id ?? null
    }
    if (!orgId) return reply.status(403).send({ error: 'No org' })

    const settings = await getOrgAIChannels(orgId)
    return reply.send(settings)
  })

  // PUT /admin/ai/channels — update org AI channel settings
  fastify.put('/admin/ai/channels', async (request, reply) => {
    const query = request.query as { orgId?: string }
    let orgId = request.admin.organizationId

    // Super admin can pass ?orgId= to manage any org
    if (orgId === null && query.orgId) {
      orgId = Number(query.orgId) || null
    }
    if (orgId === null) {
      const firstOrg = await prisma.organization.findFirst({ select: { id: true } })
      orgId = firstOrg?.id ?? null
    }
    if (!orgId) return reply.status(403).send({ error: 'No org' })

    try {
      const body = request.body as UpdateAIChannelSettingsRequest
      const settings = await upsertOrgAIChannels(orgId, body)
      return reply.send(settings)
    } catch (err) {
      fastify.log.error(err, 'Failed to update org AI channel settings')
      return reply.status(500).send({ error: err instanceof Error ? err.message : 'Internal error' })
    }
  })
}
