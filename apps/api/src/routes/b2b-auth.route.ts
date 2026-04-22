import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveB2BLogin, resolveSellerOrg, getB2BAdminById } from '../services/b2b-auth.service.js'
import { cancelBooking as hgCancelBooking } from '../adapters/hyperguest/booking.js'
import { getOrgSettings } from '../services/org.service.js'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'

const B2B_COOKIE_NAME = 'ibe_b2b_token'
const B2B_SESSION_8H = 8 * 60 * 60
const B2B_SESSION_7D = 7 * 24 * 60 * 60

export async function b2bAuthRoutes(fastify: FastifyInstance) {
  // ── Login ──────────────────────────────────────────────────────────────────

  fastify.post('/b2b/auth/login', async (request, reply) => {
    const { email, password, adminId, sellerSlug, rememberMe } = request.body as {
      email?: string
      password?: string
      adminId?: number
      sellerSlug?: string
      rememberMe?: boolean
    }

    if (!email || !password || !sellerSlug) {
      return reply.status(400).send({ error: 'email, password and sellerSlug are required', code: 'IBE.B2B.001' })
    }

    const sellerOrgId = await resolveSellerOrg(sellerSlug)
    if (!sellerOrgId) {
      return reply.status(404).send({ error: 'Portal not found', code: 'IBE.B2B.002' })
    }

    const sellerSettings = await getOrgSettings(sellerOrgId)
    if (!sellerSettings.enabledModels.includes('b2b')) {
      return reply.status(403).send({ error: 'B2B bookings are not enabled for this portal', code: 'IBE.MODEL.002' })
    }

    const result = await resolveB2BLogin(email, password, sellerOrgId, adminId)

    switch (result.type) {
      case 'invalid_credentials':
        return reply.status(401).send({ error: 'Invalid credentials', code: 'IBE.AUTH.003' })

      case 'choices':
        return reply.send({ requiresSelection: true, accounts: result.accounts })

      case 'no_access':
        return reply.status(403).send({ error: 'Your organization does not have access to this portal', code: 'IBE.B2B.003' })

      case 'ok': {
        const maxAge = rememberMe ? B2B_SESSION_7D : B2B_SESSION_8H
        const token = fastify.jwt.sign(result.payload, { expiresIn: maxAge })
        // No domain attribute — scoped to the exact B2B subdomain for per-portal sessions
        reply.setCookie(B2B_COOKIE_NAME, token, {
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge,
        })
        return reply.send({ ok: true, organizationId: result.payload.organizationId, role: result.payload.role })
      }
    }
  })

  // ── Logout ─────────────────────────────────────────────────────────────────

  fastify.post('/b2b/auth/logout', async (_request, reply) => {
    reply.clearCookie(B2B_COOKIE_NAME, { path: '/' })
    return reply.send({ ok: true })
  })

  // ── Me ─────────────────────────────────────────────────────────────────────

  fastify.get('/b2b/auth/me', async (request, reply) => {
    const token = (request.cookies as Record<string, string>)[B2B_COOKIE_NAME]
    if (!token) return reply.status(401).send({ error: 'Unauthorized', code: 'IBE.AUTH.001' })

    try {
      const payload = fastify.jwt.verify<{ adminId: number; organizationId: number; role: string; sellerOrgId: number; b2b: boolean }>(token)
      if (!payload.b2b) return reply.status(401).send({ error: 'Unauthorized', code: 'IBE.AUTH.001' })

      const admin = await getB2BAdminById(payload.adminId)
      if (!admin) {
        reply.clearCookie(B2B_COOKIE_NAME, { path: '/' })
        return reply.status(401).send({ error: 'Unauthorized', code: 'IBE.AUTH.001' })
      }

      return reply.send({ ...admin, sellerOrgId: payload.sellerOrgId })
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', code: 'IBE.AUTH.001' })
    }
  })

  // ── Agent bookings ─────────────────────────────────────────────────────────

  type B2BPayload = { adminId: number; organizationId: number; sellerOrgId: number; b2b: boolean }

  async function requireB2BPayload(request: FastifyRequest, reply: FastifyReply): Promise<B2BPayload | null> {
    const token = (request.cookies as Record<string, string>)[B2B_COOKIE_NAME]
    if (!token) { reply.status(401).send({ error: 'Unauthorized', code: 'IBE.AUTH.001' }); return null }
    try {
      const p = fastify.jwt.verify<B2BPayload>(token)
      if (!p.b2b) { reply.status(401).send({ error: 'Unauthorized', code: 'IBE.AUTH.001' }); return null }
      return p
    } catch {
      reply.status(401).send({ error: 'Unauthorized', code: 'IBE.AUTH.001' })
      return null
    }
  }

  fastify.get('/b2b/bookings', async (request, reply) => {
    const payload = await requireB2BPayload(request, reply)
    if (!payload) return

    const now = new Date()
    const bookings = await prisma.booking.findMany({
      where: { agentUserId: payload.adminId },
      include: { rooms: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return reply.send(bookings.map(b => ({
      id: b.id,
      hyperGuestBookingId: b.hyperGuestBookingId,
      status: b.status,
      propertyId: b.propertyId,
      checkIn: b.checkIn.toISOString().slice(0, 10),
      checkOut: b.checkOut.toISOString().slice(0, 10),
      nights: Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86400000),
      currency: b.currency,
      totalAmount: Number(b.totalAmount),
      leadGuestFirstName: b.leadGuestFirstName,
      leadGuestLastName: b.leadGuestLastName,
      cancellationDeadline: b.cancellationDeadline?.toISOString() ?? null,
      canCancel: b.status !== 'cancelled' && (!b.cancellationDeadline || b.cancellationDeadline > now),
      roomCount: b.rooms.length,
      createdAt: b.createdAt.toISOString(),
    })))
  })

  fastify.get('/b2b/bookings/:id', async (request, reply) => {
    const payload = await requireB2BPayload(request, reply)
    if (!payload) return

    const id = parseInt((request.params as { id: string }).id, 10)
    const b = await prisma.booking.findFirst({
      where: { id, agentUserId: payload.adminId },
      include: { rooms: true },
    })
    if (!b) return reply.status(404).send({ error: 'Booking not found' })

    const now = new Date()
    const raw = b.rawResponse as Record<string, unknown> | null
    const cancellationFrames = ((raw?.rooms as Array<Record<string, unknown>>) ?? []).flatMap(r =>
      ((r.cancellationPolicy as Array<Record<string, unknown>>) ?? []).map(cp => ({
        from: cp.startDate as string,
        to: cp.endDate as string | null,
        penaltyAmount: (cp.price as Record<string, unknown>)?.amount as number ?? 0,
        currency: (cp.price as Record<string, unknown>)?.currency as string ?? b.currency,
      }))
    )
    const isRefundable = cancellationFrames.every(f => f.penaltyAmount === 0)

    return reply.send({
      id: b.id,
      hyperGuestBookingId: b.hyperGuestBookingId,
      status: b.status,
      propertyId: b.propertyId,
      checkIn: b.checkIn.toISOString().slice(0, 10),
      checkOut: b.checkOut.toISOString().slice(0, 10),
      nights: Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86400000),
      currency: b.currency,
      totalAmount: Number(b.totalAmount),
      originalPrice: b.originalPrice ? Number(b.originalPrice) : null,
      promoCode: b.promoCode,
      agencyReference: b.agencyReference,
      leadGuestFirstName: b.leadGuestFirstName,
      leadGuestLastName: b.leadGuestLastName,
      leadGuestEmail: b.leadGuestEmail,
      cancellationDeadline: b.cancellationDeadline?.toISOString() ?? null,
      canCancel: b.status !== 'cancelled' && (!b.cancellationDeadline || b.cancellationDeadline > now),
      cancellationFrames,
      isRefundable,
      rooms: b.rooms.map(r => ({ roomCode: r.roomCode, rateCode: r.rateCode, board: r.board, status: r.status })),
      createdAt: b.createdAt.toISOString(),
    })
  })

  fastify.post('/b2b/bookings/:id/cancel', async (request, reply) => {
    const payload = await requireB2BPayload(request, reply)
    if (!payload) return

    const id = parseInt((request.params as { id: string }).id, 10)
    const b = await prisma.booking.findFirst({ where: { id, agentUserId: payload.adminId } })
    if (!b) return reply.status(404).send({ error: 'Booking not found' })
    if (b.status === 'cancelled') return reply.status(400).send({ error: 'Booking is already cancelled' })
    if (b.cancellationDeadline && new Date() > b.cancellationDeadline)
      return reply.status(400).send({ error: 'Cancellation deadline has passed' })

    await hgCancelBooking(b.hyperGuestBookingId, b.propertyId)
    await prisma.booking.update({ where: { id }, data: { status: 'cancelled' } })
    return reply.send({ ok: true })
  })
}
