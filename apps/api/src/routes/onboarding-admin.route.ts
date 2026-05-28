import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  createInvitation,
  listInvitations,
  listNeedsAttention,
  revokeInvitation,
  triggerBackgroundHarvest,
} from '../services/onboarding-invitation.service.js'
import { getVendorFlow } from '@ibe/onboarding-flows'
import { detectKnownIBE } from '@ibe/shared'
import { prisma } from '../db/client.js'

const createInvitationSchema = z.object({
  pmsId: z.number().int().positive(),
  hotelName: z.string().optional(),
  ibeUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
})

export async function onboardingAdminRoutes(app: FastifyInstance) {
  app.post('/admin/hotel-onboarding/invitations', async (request, reply) => {
    const me = request.admin
    if (!me.organizationId) return reply.badRequest('No organization context')
    const body = createInvitationSchema.parse(request.body)
    const flow = getVendorFlow(body.pmsId)
    if (!flow) return reply.badRequest(`Unknown pmsId: ${body.pmsId}`)

    const inv = await createInvitation({
      organizationId: me.organizationId,
      pmsId: body.pmsId,
      pmsName: flow.pmsName,
      ...(body.hotelName !== undefined && { hotelName: body.hotelName }),
      ...(body.ibeUrl !== undefined && { ibeUrl: body.ibeUrl }),
      ...(body.contactEmail !== undefined && { contactEmail: body.contactEmail }),
      createdByAdminId: me.adminId,
    })
    return reply.code(201).send(inv)
  })

  app.get('/admin/hotel-onboarding/invitations', async (request, reply) => {
    const me = request.admin
    if (!me.organizationId) return reply.badRequest('No organization context')
    return listInvitations(me.organizationId)
  })

  app.get('/admin/hotel-onboarding/stats', async (request, reply) => {
    const me = request.admin
    if (!me.organizationId && me.role !== 'super') return reply.badRequest('No organization context')
    const orgFilter = me.role === 'super' ? {} : { organizationId: me.organizationId }

    const invitations = await prisma.onboardingInvitation.findMany({
      where: orgFilter,
      select: {
        pmsId: true,
        ibePattern: true,
        ibeUrl: true,
        session: { select: { status: true } },
      },
    })

    const ariStats: Record<number, { total: number; approved: number }> = {}
    const ibeStats: Record<string, { total: number; approved: number }> = {}
    const ibeSampleUrls: Record<string, string> = {}

    for (const inv of invitations) {
      if (inv.pmsId !== null) {
        if (!ariStats[inv.pmsId]) ariStats[inv.pmsId] = { total: 0, approved: 0 }
        ariStats[inv.pmsId]!.total++
        if (inv.session?.status === 'approved') ariStats[inv.pmsId]!.approved++
      }
      if (inv.ibePattern) {
        if (!ibeStats[inv.ibePattern]) ibeStats[inv.ibePattern] = { total: 0, approved: 0 }
        ibeStats[inv.ibePattern]!.total++
        if (inv.session?.status === 'approved') ibeStats[inv.ibePattern]!.approved++
        if (!ibeSampleUrls[inv.ibePattern] && inv.ibeUrl) {
          ibeSampleUrls[inv.ibePattern] = inv.ibeUrl
        }
      }
    }

    // Fallback: populate missing sample URLs from ExternalIBEConfig
    const extConfigs = await prisma.externalIBEConfig.findMany({
      where: { searchTemplate: { not: null }, externalHotelId: { not: null } },
      select: { searchTemplate: true, externalHotelId: true },
    })
    for (const cfg of extConfigs) {
      if (!cfg.searchTemplate || !cfg.externalHotelId) continue
      const sampleUrl = cfg.searchTemplate
        .replace('{externalHotelId}', cfg.externalHotelId)
        .replace('{checkIn}', '2026-06-01').replace('{checkOut}', '2026-06-02')
        .replace('{guests}', 'A%2CA').replace('{adults}', '2')
        .replace('{currency}', 'EUR').replace('{checkInMDY}', '06/01/2026')
        .replace('{checkOutMDY}', '06/02/2026').replace('{nights}', '1')
      const detected = detectKnownIBE(sampleUrl)
      if (detected?.name && !ibeSampleUrls[detected.name]) {
        ibeSampleUrls[detected.name] = sampleUrl
      }
    }

    return reply.send({ ariStats, ibeStats, ibeSampleUrls })
  })

  app.post<{ Body: { hotelName: string; city: string; country?: string } }>(
    '/admin/hotel-onboarding/search',
    async (request, reply) => {
      const me = request.admin
      if (!me.organizationId) return reply.badRequest('No organization context')
      const { hotelName, city, country } = request.body
      if (!hotelName?.trim() || !city?.trim()) return reply.badRequest('hotelName and city required')
      const internalUrl = process.env['ONBOARDING_API_INTERNAL_URL'] ?? 'http://localhost:3003'
      try {
        const res = await fetch(`${internalUrl}/hotel-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hotelName: hotelName.trim(), city: city.trim(), country: country ?? '' }),
        })
        if (!res.ok) return reply.status(502).send({ error: 'Search service unavailable' })
        const data = await res.json() as {
          candidates: Array<{ url: string; title: string; detected: boolean; screenshotUrl: string | null }>
        }
        return reply.send(data)
      } catch {
        return reply.status(502).send({ error: 'Search service unavailable' })
      }
    }
  )

  app.get('/admin/hotel-onboarding/invitations/needs-attention', async (request, reply) => {
    const me = request.admin
    if (me.role !== 'super') return reply.forbidden('Super admin required')
    return listNeedsAttention()
  })

  app.delete('/admin/hotel-onboarding/invitations/:id', async (request, reply) => {
    const me = request.admin
    const { id } = request.params as { id: string }
    const invitationId = parseInt(id, 10)
    const invitation = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } })
    if (!invitation) return reply.notFound('Invitation not found')
    if (me.role !== 'super' && invitation.organizationId !== me.organizationId) {
      return reply.forbidden('Access denied')
    }
    await revokeInvitation(invitationId)
    return reply.code(204).send()
  })

  app.post('/admin/hotel-onboarding/invitations/:id/retry-harvest', async (request, reply) => {
    const me = request.admin
    const invitationId = parseInt((request.params as { id: string }).id, 10)
    const invitation = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } })
    if (!invitation) return reply.notFound('Invitation not found')
    if (me.role !== 'super' && invitation.organizationId !== me.organizationId) {
      return reply.forbidden('Access denied')
    }
    if (!invitation.ibeUrl) return reply.badRequest('No IBE URL on invitation')
    await triggerBackgroundHarvest(invitationId, invitation.ibeUrl)
    return { ok: true }
  })

  app.put('/admin/hotel-onboarding/sessions/:id/approve', async (request, reply) => {
    const me = request.admin
    const sessionId = parseInt((request.params as { id: string }).id, 10)
    const session = await prisma.onboardingSession.findUnique({
      where: { id: sessionId },
      include: { invitation: { select: { organizationId: true } } },
    })
    if (!session) return reply.notFound('Session not found')
    if (me.role !== 'super' && session.invitation.organizationId !== me.organizationId) {
      return reply.forbidden('Access denied')
    }
    if (session.status !== 'pending_review') return reply.badRequest('Session is not pending review')
    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: { status: 'approved', approvedAt: new Date(), approvedByAdminId: me.adminId },
    })
    return reply.send({ ok: true })
  })
}
