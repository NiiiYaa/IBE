// apps/api/src/routes/external-ibe.route.ts
import type { FastifyInstance } from 'fastify'
import {
  getExternalIBEConfig,
  upsertExternalIBEConfig,
  deleteExternalIBEConfig,
  analyzeExternalIBEUrls,
} from '../services/external-ibe.service.js'
import type { ExternalIBEConfigUpdate, ExternalIBEAnalyzeRequest } from '@ibe/shared'

function parseScope(
  query: Record<string, string>,
  admin: { role: string; organizationId: number | null },
): { orgId?: number; propertyId?: number } | { error: string } {
  const rawProperty = query['propertyId']
  const rawOrg = query['orgId']

  if (rawProperty) {
    const propertyId = parseInt(rawProperty, 10)
    if (isNaN(propertyId)) return { error: 'Invalid propertyId' }
    return { propertyId }
  }

  if (rawOrg) {
    const orgId = parseInt(rawOrg, 10)
    if (isNaN(orgId)) return { error: 'Invalid orgId' }
    if (admin.role !== 'super' && admin.organizationId !== orgId) return { error: 'Forbidden' }
    return { orgId }
  }

  if (admin.organizationId) return { orgId: admin.organizationId }
  return { error: 'No scope provided' }
}

export async function externalIBERoutes(fastify: FastifyInstance) {
  fastify.get('/admin/external-ibe', async (request, reply) => {
    const scope = parseScope(
      request.query as Record<string, string>,
      request.admin,
    )
    if ('error' in scope) return reply.status(400).send({ error: scope.error })
    return reply.send(await getExternalIBEConfig(scope))
  })

  fastify.put('/admin/external-ibe', async (request, reply) => {
    const scope = parseScope(
      request.query as Record<string, string>,
      request.admin,
    )
    if ('error' in scope) return reply.status(400).send({ error: scope.error })
    const body = request.body as ExternalIBEConfigUpdate
    return reply.send(await upsertExternalIBEConfig(scope, body))
  })

  fastify.delete('/admin/external-ibe', async (request, reply) => {
    const scope = parseScope(
      request.query as Record<string, string>,
      request.admin,
    )
    if ('error' in scope) return reply.status(400).send({ error: scope.error })
    try {
      await deleteExternalIBEConfig(scope)
      return reply.status(204).send()
    } catch {
      return reply.status(404).send({ error: 'Config not found' })
    }
  })

  fastify.post('/admin/external-ibe/analyze', async (request, reply) => {
    const body = request.body as ExternalIBEAnalyzeRequest
    if (!body.urls?.length) return reply.status(400).send({ error: 'urls is required' })
    if (!body.type) return reply.status(400).send({ error: 'type is required' })
    const result = await analyzeExternalIBEUrls(body)
    if ('error' in result) return reply.status(422).send(result)
    return reply.send(result)
  })
}
