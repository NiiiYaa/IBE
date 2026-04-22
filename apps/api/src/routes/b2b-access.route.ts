import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/client.js'

export async function b2bAccessRoutes(fastify: FastifyInstance) {
  // Super-only guard
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Forbidden', code: 'IBE.AUTH.006' })
    }
  })

  // ── List all B2B access relationships ─────────────────────────────────────

  fastify.get('/admin/super/b2b-access', async (_request, reply) => {
    const rows = await prisma.orgB2BAccess.findMany({
      include: {
        buyerOrg: { select: { id: true, name: true, slug: true } },
        sellerOrg: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ sellerOrg: { name: 'asc' } }, { buyerOrg: { name: 'asc' } }],
    })
    return reply.send(rows)
  })

  // ── Create a B2B access relationship ──────────────────────────────────────

  fastify.post('/admin/super/b2b-access', async (request, reply) => {
    const { buyerOrgId, sellerOrgId } = request.body as { buyerOrgId?: number; sellerOrgId?: number }

    if (!buyerOrgId || !sellerOrgId) {
      return reply.status(400).send({ error: 'buyerOrgId and sellerOrgId are required', code: 'IBE.B2B.004' })
    }
    if (buyerOrgId === sellerOrgId) {
      return reply.status(400).send({ error: 'Buyer and seller cannot be the same org', code: 'IBE.B2B.005' })
    }

    const [buyer, seller] = await Promise.all([
      prisma.organization.findFirst({ where: { id: buyerOrgId, deletedAt: null } }),
      prisma.organization.findFirst({ where: { id: sellerOrgId, deletedAt: null } }),
    ])
    if (!buyer) return reply.status(404).send({ error: 'Buyer organization not found', code: 'IBE.B2B.006' })
    if (!seller) return reply.status(404).send({ error: 'Seller organization not found', code: 'IBE.B2B.007' })

    try {
      const access = await prisma.orgB2BAccess.create({
        data: { buyerOrgId, sellerOrgId },
        include: {
          buyerOrg: { select: { id: true, name: true, slug: true } },
          sellerOrg: { select: { id: true, name: true, slug: true } },
        },
      })
      return reply.status(201).send(access)
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        return reply.status(409).send({ error: 'This access relationship already exists', code: 'IBE.B2B.008' })
      }
      throw err
    }
  })

  // ── Delete a B2B access relationship ──────────────────────────────────────

  fastify.delete('/admin/super/b2b-access/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    if (!id) return reply.status(400).send({ error: 'Invalid id' })

    try {
      await prisma.orgB2BAccess.delete({ where: { id } })
      return reply.status(204).send()
    } catch {
      return reply.status(404).send({ error: 'Access relationship not found', code: 'IBE.B2B.009' })
    }
  })
}
