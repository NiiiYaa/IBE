import type { FastifyInstance } from 'fastify'
import { markHarvestComplete, markHarvestFailed } from '../services/onboarding-invitation.service.js'

export async function onboardingInternalRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    const secret = request.headers['x-internal-secret']
    const expected = process.env['INTERNAL_API_SECRET']
    if (!expected || secret !== expected) {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.post<{ Body: { invitationId: number; harvestedData: unknown } }>(
    '/internal/onboarding/harvest-complete',
    async (request, reply) => {
      const { invitationId, harvestedData } = request.body
      if (!invitationId) return reply.badRequest('invitationId required')
      await markHarvestComplete(invitationId, harvestedData)
      return reply.code(204).send()
    }
  )

  app.post<{ Body: { invitationId: number; reason: string } }>(
    '/internal/onboarding/harvest-failed',
    async (request, reply) => {
      const { invitationId, reason } = request.body
      if (!invitationId) return reply.badRequest('invitationId required')
      await markHarvestFailed(invitationId, reason ?? 'Unknown error')
      return reply.code(204).send()
    }
  )
}
