import type { FastifyInstance } from 'fastify'
import { getDashboardStats } from '../services/dashboard.service.js'
import { prisma } from '../db/client.js'

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/dashboard/stats', async (request, reply) => {
    const { admin } = request
    const query = request.query as { orgId?: string; propertyId?: string; days?: string }

    const days = Math.min(90, Math.max(7, parseInt(query.days ?? '14', 10) || 14))
    const reqPropertyId = query.propertyId ? parseInt(query.propertyId, 10) : null

    let organizationId: number | null
    let resolvedPropertyId: number | null = reqPropertyId

    if (admin.role === 'super') {
      organizationId = query.orgId ? parseInt(query.orgId, 10) : null
    } else {
      organizationId = admin.organizationId ?? null
      // Validate that the requested propertyId belongs to this admin's org
      if (reqPropertyId && organizationId) {
        const prop = await prisma.property.findFirst({ where: { id: reqPropertyId, organizationId }, select: { id: true } })
        resolvedPropertyId = prop ? reqPropertyId : null
      }
    }

    return reply.send(await getDashboardStats(organizationId, days, resolvedPropertyId))
  })
}
