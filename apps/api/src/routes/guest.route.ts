import crypto from 'crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { validatePassword } from '@ibe/shared'
import {
  registerGuest, loginGuest, getGuestById, updateGuestProfile,
  updateGuestPassword, deleteGuestAccount, findOrCreateGoogleGuest,
  getGuestBookings, getGuestBookingById, cancelGuestBooking,
  resolveOrgIdFromProperty,
  GuestExistsError, InvalidCredentialsError, GuestBlockedError, OrgNotFoundError,
} from '../services/guest.service.js'
import { env } from '../config/env.js'
import { cookieDomain } from '../utils/cookie.js'

const GUEST_COOKIE = 'ibe_guest_token'

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
  domain: cookieDomain(),
}

interface GuestPayload { guestId: number; type: 'guest' }

async function requireGuest(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<GuestPayload | null> {
  try {
    const token = request.cookies[GUEST_COOKIE]
    if (!token) throw new Error('no token')
    const payload = fastify.jwt.verify<GuestPayload>(token)
    if (payload.type !== 'guest') throw new Error('wrong type')
    return payload
  } catch {
    reply.status(401).send({ error: 'Unauthorized', code: 'IBE.GUEST.AUTH.001' })
    return null
  }
}

export async function guestRoutes(fastify: FastifyInstance) {
  fastify.get('/guest/auth/providers', async (_request, reply) => {
    return reply.send({ googleOAuth: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) })
  })

  // ── Auth (public) ─────────────────────────────────────────────────────────

  fastify.post('/guest/auth/register', async (request, reply) => {
    const { email, password, firstName, lastName, phone, nationality, propertyId } =
      request.body as { email: string; password: string; firstName: string; lastName: string; phone?: string; nationality?: string; propertyId: number }

    if (!email || !password || !firstName || !lastName || !propertyId)
      return reply.status(400).send({ error: 'email, password, firstName, lastName and propertyId are required' })
    const pwErrors = validatePassword(password)
    if (pwErrors.length > 0)
      return reply.status(400).send({ error: pwErrors.join(', ') })

    let organizationId: number
    try {
      organizationId = await resolveOrgIdFromProperty(propertyId)
    } catch {
      return reply.status(400).send({ error: 'Invalid propertyId' })
    }

    try {
      const guest = await registerGuest({ organizationId, email, password, firstName, lastName, phone, nationality })
      const token = fastify.jwt.sign({ guestId: guest.id, type: 'guest' })
      reply.setCookie(GUEST_COOKIE, token, COOKIE_OPTS)
      return reply.status(201).send({ id: guest.id, email: guest.email, firstName: guest.firstName, lastName: guest.lastName })
    } catch (err) {
      if (err instanceof GuestExistsError)
        return reply.status(409).send({ error: 'An account with this email already exists' })
      throw err
    }
  })

  fastify.post('/guest/auth/login', async (request, reply) => {
    const { email, password, propertyId } = request.body as { email: string; password: string; propertyId: number }
    if (!email || !password || !propertyId)
      return reply.status(400).send({ error: 'email, password and propertyId are required' })

    let organizationId: number
    try {
      organizationId = await resolveOrgIdFromProperty(propertyId)
    } catch {
      return reply.status(400).send({ error: 'Invalid propertyId' })
    }

    try {
      const guest = await loginGuest(organizationId, email, password)
      const token = fastify.jwt.sign({ guestId: guest.id, type: 'guest' })
      reply.setCookie(GUEST_COOKIE, token, COOKIE_OPTS)
      return reply.send({ id: guest.id, email: guest.email, firstName: guest.firstName, lastName: guest.lastName })
    } catch (err) {
      if (err instanceof InvalidCredentialsError)
        return reply.status(401).send({ error: 'Invalid email or password' })
      if (err instanceof GuestBlockedError)
        return reply.status(403).send({ error: 'Your account has been suspended. Please contact support.' })
      throw err
    }
  })

  fastify.post('/guest/auth/logout', async (request, reply) => {
    reply.clearCookie(GUEST_COOKIE, { path: '/', domain: cookieDomain() })
    return reply.send({ ok: true })
  })

  // ── Protected (require guest cookie) ────────────────────────────────────

  fastify.get('/guest/me', async (request, reply) => {
    const payload = await requireGuest(fastify, request, reply)
    if (!payload) return
    const guest = await getGuestById(payload.guestId)
    return reply.send({
      id: guest.id, email: guest.email,
      firstName: guest.firstName, lastName: guest.lastName,
      phone: guest.phone, nationality: guest.nationality,
      createdAt: guest.createdAt.toISOString(),
    })
  })

  fastify.put('/guest/me', async (request, reply) => {
    const payload = await requireGuest(fastify, request, reply)
    if (!payload) return
    const { firstName, lastName, phone, nationality, currentPassword, newPassword } =
      request.body as { firstName?: string; lastName?: string; phone?: string | null; nationality?: string | null; currentPassword?: string; newPassword?: string }

    if (newPassword) {
      if (!currentPassword) return reply.status(400).send({ error: 'currentPassword required to change password' })
      const pwErrors = validatePassword(newPassword)
      if (pwErrors.length > 0) return reply.status(400).send({ error: pwErrors.join(', ') })
      const guest = await getGuestById(payload.guestId)
      try {
        await loginGuest(guest.organizationId, guest.email, currentPassword)
      } catch {
        return reply.status(401).send({ error: 'Current password is incorrect' })
      }
      await updateGuestPassword(payload.guestId, newPassword)
    }

    const updated = await updateGuestProfile(payload.guestId, { firstName, lastName, phone, nationality })
    return reply.send({
      id: updated.id, email: updated.email,
      firstName: updated.firstName, lastName: updated.lastName,
      phone: updated.phone, nationality: updated.nationality,
    })
  })

  fastify.delete('/guest/me', async (request, reply) => {
    const payload = await requireGuest(fastify, request, reply)
    if (!payload) return
    await deleteGuestAccount(payload.guestId)
    reply.clearCookie(GUEST_COOKIE, { path: '/', domain: cookieDomain() })
    return reply.send({ ok: true })
  })

  fastify.get('/guest/bookings', async (request, reply) => {
    const payload = await requireGuest(fastify, request, reply)
    if (!payload) return
    const guest = await getGuestById(payload.guestId)
    const bookings = await getGuestBookings(guest.id, guest.email)
    const now = new Date()
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
      promoCode: b.promoCode,
      cancellationDeadline: b.cancellationDeadline?.toISOString() ?? null,
      canCancel: b.status !== 'cancelled' && (!b.cancellationDeadline || b.cancellationDeadline > now),
      roomCount: b.rooms.length,
      createdAt: b.createdAt.toISOString(),
    })))
  })

  fastify.get('/guest/bookings/:id', async (request, reply) => {
    const payload = await requireGuest(fastify, request, reply)
    if (!payload) return
    const id = parseInt((request.params as { id: string }).id, 10)
    const guest = await getGuestById(payload.guestId)
    const b = await getGuestBookingById(id, guest.id, guest.email)
    if (!b) return reply.status(404).send({ error: 'Booking not found' })
    const now = new Date()
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
      promoDiscountPct: b.promoDiscountPct ? Number(b.promoDiscountPct) : null,
      affiliateCode: b.affiliateBooking?.affiliate.name ?? b.affiliateId ?? null,
      paymentMethod: b.paymentMethod,
      agencyReference: b.agencyReference,
      cancellationDeadline: b.cancellationDeadline?.toISOString() ?? null,
      canCancel: b.status !== 'cancelled' && (!b.cancellationDeadline || b.cancellationDeadline > now),
      rooms: b.rooms.map(r => ({ roomCode: r.roomCode, rateCode: r.rateCode, board: r.board, status: r.status })),
      createdAt: b.createdAt.toISOString(),
    })
  })

  fastify.post('/guest/bookings/:id/cancel', async (request, reply) => {
    const payload = await requireGuest(fastify, request, reply)
    if (!payload) return
    const id = parseInt((request.params as { id: string }).id, 10)
    const guest = await getGuestById(payload.guestId)
    const ok = await cancelGuestBooking(id, guest.id, guest.email)
    if (!ok) return reply.status(400).send({ error: 'Booking cannot be cancelled (not found, already cancelled, or past deadline)' })
    return reply.send({ ok: true })
  })

  // ── Google OAuth (guest) ─────────────────────────────────────────────────────

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const { default: oauth2 } = await import('@fastify/oauth2')

    await fastify.register(oauth2, {
      name: 'guestGoogleOAuth2',
      scope: ['profile', 'email'],
      credentials: {
        client: { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET },
        auth: (oauth2 as unknown as { GOOGLE_CONFIGURATION: object }).GOOGLE_CONFIGURATION,
      },
      startRedirectPath: '/guest/auth/google',
      callbackUri: `${env.WEB_BASE_URL}/api/v1/guest/auth/google/callback`,
      // Embed propertyId inside state: "<nonce>:<propertyId>"
      // The plugin stores the full state in an httpOnly cookie (oauth2-redirect-state)
      // for CSRF verification on callback.
      generateStateFunction: function (this: FastifyInstance, request: FastifyRequest) {
        const propertyId = (request.query as Record<string, string>)['state'] ?? '0'
        const nonce = crypto.randomBytes(10).toString('hex')
        return `${nonce}:${propertyId}`
      },
      checkStateFunction: function (request: FastifyRequest, callback: (err?: Error) => void) {
        const cookieState = (request.cookies as Record<string, string>)['oauth2-redirect-state']
        const queryState = (request.query as Record<string, string>)['state']
        if (queryState && cookieState && queryState === cookieState) {
          callback()
        } else {
          callback(new Error('Invalid state'))
        }
      },
    })

    fastify.get('/guest/auth/google/callback', async (request, reply) => {
      try {
        const instance = fastify as unknown as {
          guestGoogleOAuth2: { getAccessTokenFromAuthorizationCodeFlow: (req: typeof request, rep: typeof reply) => Promise<{ token: { access_token: string } }> }
        }
        const { token } = await instance.guestGoogleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply)

        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${token.access_token}` },
        })
        const profile = await profileRes.json() as { email: string; given_name: string; family_name: string }

        // Parse propertyId from state: "<nonce>:<propertyId>"
        const stateStr = (request.query as Record<string, string>)['state'] ?? ''
        const propertyId = Number(stateStr.split(':')[1] ?? 0)

        let organizationId: number
        try {
          organizationId = await resolveOrgIdFromProperty(propertyId)
        } catch {
          return reply.redirect(`${env.WEB_BASE_URL}/account/login?error=oauth_failed`)
        }

        const guest = await findOrCreateGoogleGuest({
          organizationId,
          email: profile.email,
          firstName: profile.given_name || profile.email.split('@')[0],
          lastName: profile.family_name || '',
        })

        const jwtToken = fastify.jwt.sign({ guestId: guest.id, type: 'guest' })
        reply.setCookie(GUEST_COOKIE, jwtToken, COOKIE_OPTS)
        return reply.redirect(`${env.WEB_BASE_URL}/account/oauth-success?propertyId=${propertyId}`)
      } catch (err) {
        fastify.log.error(err, 'Guest Google OAuth callback failed')
        return reply.redirect(`${env.WEB_BASE_URL}/account/login?error=oauth_failed`)
      }
    })
  }
}
