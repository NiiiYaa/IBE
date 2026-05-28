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
    const body = createInvitationSchema.parse(request.body)
    const flow = getVendorFlow(body.pmsId)
    if (!flow) return reply.badRequest(`Unknown pmsId: ${body.pmsId}`)

    const inv = await createInvitation({
      organizationId: me.organizationId ?? 0,
      pmsId: body.pmsId,
      pmsName: flow.pmsName,
      ...(body.hotelName !== undefined && { hotelName: body.hotelName }),
      ...(body.ibeUrl !== undefined && { ibeUrl: body.ibeUrl }),
      ...(body.contactEmail !== undefined && { contactEmail: body.contactEmail }),
      createdByAdminId: me.adminId,
    })
    return reply.code(201).send(inv)
  })

  app.get('/admin/hotel-onboarding/invitations', async (request) => {
    const me = request.admin
    return listInvitations(me.organizationId ?? 0)
  })

  app.get('/admin/hotel-onboarding/invitations/needs-attention', async () => {
    return listNeedsAttention()
  })

  app.delete('/admin/hotel-onboarding/invitations/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await revokeInvitation(parseInt(id, 10))
    return reply.code(204).send()
  })

  app.post('/admin/hotel-onboarding/invitations/:id/retry-harvest', async (request, reply) => {
    const invitationId = parseInt((request.params as { id: string }).id, 10)
    const invitation = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } })
    if (!invitation) return reply.notFound('Invitation not found')
    if (!invitation.ibeUrl) return reply.badRequest('No IBE URL on invitation')
    await triggerBackgroundHarvest(invitationId, invitation.ibeUrl)
    return { ok: true }
  })

  app.put('/admin/hotel-onboarding/sessions/:id/approve', async (request, reply) => {
    const me = request.admin
    const sessionId = parseInt((request.params as { id: string }).id, 10)
    const session = await prisma.onboardingSession.findUnique({ where: { id: sessionId } })
    if (!session) return reply.notFound('Session not found')
    if (session.status !== 'pending_review') return reply.badRequest('Session is not pending review')
    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: { status: 'approved', approvedAt: new Date(), approvedByAdminId: me.adminId },
    })
    return reply.send({ ok: true })
  })
}
