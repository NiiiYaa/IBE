import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/client.js'

export async function visitRoutes(fastify: FastifyInstance) {
  fastify.post('/visit', async (request, reply) => {
    const { sessionId, propertyId, channel, page, device } = request.body as {
      sessionId?: string
      propertyId?: number | null
      channel?: string
      page?: string
      device?: string
    }

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 128) {
      return reply.status(400).send({ error: 'Invalid sessionId' })
    }

    const safePage = typeof page === 'string' && page.length <= 64 ? page : 'home'
    const safeDevice = device === 'mobile' || device === 'tablet' ? device : 'desktop'

    await prisma.iBEVisit.upsert({
      where: { sessionId_page: { sessionId, page: safePage } },
      create: {
        sessionId,
        page: safePage,
        propertyId: propertyId ?? null,
        channel: channel === 'b2b' ? 'b2b' : 'b2c',
        device: safeDevice,
      },
      update: {},
    })

    return reply.status(204).send()
  })
}
