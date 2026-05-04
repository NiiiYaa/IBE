import type { FastifyInstance, FastifyReply } from 'fastify'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import { cookieDomain } from '../utils/cookie.js'
import { sendSystemEmail } from '../services/email.service.js'
import { validatePassword } from '@ibe/shared'
import type { AdminPayload } from '../services/auth.service.js'

const COOKIE_NAME = 'ibe_admin_token'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60

const _domain = cookieDomain()

function setSessionCookie(fastify: FastifyInstance, reply: FastifyReply, payload: AdminPayload) {
  const token = fastify.jwt.sign(payload as AdminPayload & { organizationId: number | null })
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    ...(_domain ? { domain: _domain } : {}),
  })
}

function generateCode(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(3, 'X')
  const suffix = randomBytes(2).toString('hex').toUpperCase()
  return `${base}${suffix}`
}

async function ensureUniqueCode(orgId: number, name: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCode(name)
    const exists = await prisma.affiliate.findFirst({ where: { organizationId: orgId, code } })
    if (!exists) return code
  }
  return `AFF${randomBytes(3).toString('hex').toUpperCase()}`
}

function requireAffiliate(request: { admin: AdminPayload }, reply: { status: (n: number) => { send: (o: object) => unknown } }) {
  if (request.admin.role !== 'affiliate') {
    reply.status(403).send({ error: 'Affiliate access only' })
    return false
  }
  return true
}

export async function affiliatePortalRoutes(fastify: FastifyInstance) {
  // ── Public: register ────────────────────────────────────────────────────────

  fastify.post('/affiliate/register', async (request, reply) => {
    const body = request.body as { email?: string; password?: string; name?: string; country?: string; accountType?: string }
    if (!body.email?.trim() || !body.password || !body.name?.trim()) {
      return reply.status(400).send({ error: 'email, password and name are required' })
    }
    const errors = validatePassword(body.password)
    if (errors.length > 0) return reply.status(400).send({ error: errors.join(', ') })

    const email = body.email.toLowerCase().trim()
    const existing = await prisma.adminUser.findFirst({ where: { email } })
    if (existing) return reply.status(409).send({ error: 'Email already registered' })

    const passwordHash = await bcrypt.hash(body.password, 10)
    const verifyToken = randomBytes(32).toString('hex')

    const user = await prisma.adminUser.create({
      data: {
        email,
        passwordHash,
        name: body.name.trim(),
        role: 'affiliate',
        isActive: false,
        emailVerified: false,
        emailVerifyToken: verifyToken,
        organizationId: null,
        ...(body.country ? { country: body.country } : {}),
        ...(body.accountType ? { accountType: body.accountType } : {}),
      },
    })
    // Seed an empty profile row so it always exists for upserts
    await prisma.affiliateProfile.create({
      data: {
        adminUserId: user.id,
        ...(body.country ? { country: body.country } : {}),
        ...(body.accountType ? { accountType: body.accountType } : {}),
      },
    })

    const verifyUrl = `${env.WEB_BASE_URL}/affiliate/verify-email?token=${verifyToken}`
    const emailResult = await sendSystemEmail({
      to: email,
      subject: 'Confirm your affiliate account',
      html: `<p>Hi ${body.name.trim()},</p>
<p>Please confirm your affiliate account by clicking the link below:</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>
<p>This link expires in 24 hours.</p>`,
    })
    if (!emailResult.ok) {
      fastify.log.warn({ verifyUrl }, `[affiliate] Verification email failed (${emailResult.error}) — verify URL logged for dev`)
    }

    return reply.status(201).send({ ok: true, message: 'Check your email to confirm your account' })
  })

  // ── Public: verify email ────────────────────────────────────────────────────

  fastify.get('/affiliate/verify-email', async (request, reply) => {
    const { token } = request.query as { token?: string }
    if (!token) return reply.status(400).send({ error: 'Token required' })

    const user = await prisma.adminUser.findUnique({ where: { emailVerifyToken: token } })
    if (!user || user.role !== 'affiliate') {
      return reply.redirect(`${env.WEB_BASE_URL}/affiliate/login?error=invalid_token`)
    }

    await prisma.adminUser.update({
      where: { id: user.id },
      data: { isActive: true, emailVerified: true, emailVerifyToken: null },
    })

    const payload: AdminPayload = { adminId: user.id, organizationId: null, role: 'affiliate' }
    setSessionCookie(fastify, reply as never, payload)
    return reply.redirect(`${env.WEB_BASE_URL}/affiliate/dashboard`)
  })

  // ── Me ──────────────────────────────────────────────────────────────────────

  fastify.get('/affiliate/debug-cookie', async (request, reply) => {
    return reply.send({ cookie: request.headers.cookie ?? null, origin: request.headers.origin ?? null, host: request.headers.host ?? null })
  })

  fastify.get('/affiliate/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireAffiliate(request, reply)) return
    const user = await prisma.adminUser.findUnique({
      where: { id: request.admin.adminId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    })
    if (!user) return reply.status(404).send({ error: 'Not found' })

    // Aggregate stats across all their affiliate records
    const affiliates = await prisma.affiliate.findMany({
      where: { adminUser: { id: request.admin.adminId }, deletedAt: null },
      select: { id: true },
    })
    const affiliateIds = affiliates.map(a => a.id)

    const bookings = affiliateIds.length > 0
      ? await prisma.affiliateBooking.findMany({ where: { affiliateId: { in: affiliateIds } } })
      : []

    const totalCommission = bookings.reduce((s, b) => s + b.commissionAmount.toNumber(), 0)
    const totalRevenue = bookings.reduce((s, b) => s + b.commissionAmount.toNumber() / (b.commissionRate.toNumber() / 100), 0)

    return reply.send({
      id: user.id,
      email: user.email,
      name: user.name,
      stats: {
        totalBookings: bookings.length,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCommission: Math.round(totalCommission * 100) / 100,
        joinedHotels: affiliateIds.length,
      },
    })
  })

  // ── Onboarding profile ──────────────────────────────────────────────────────

  fastify.get('/affiliate/profile', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireAffiliate(request, reply)) return
    const profile = await prisma.affiliateProfile.findUnique({ where: { adminUserId: request.admin.adminId } })
    const user = await prisma.adminUser.findUnique({ where: { id: request.admin.adminId }, select: { name: true, country: true, accountType: true } })
    return reply.send({
      name: user?.name ?? '',
      country: user?.country ?? profile?.country ?? null,
      accountType: user?.accountType ?? profile?.accountType ?? null,
      companyName: profile?.companyName ?? null,
      websiteUrl: profile?.websiteUrl ?? null,
      primaryLanguage: profile?.primaryLanguage ?? null,
      audienceLocations: (profile?.audienceLocations as string[]) ?? [],
      audienceTypes: (profile?.audienceTypes as string[]) ?? [],
      monthlyTraffic: profile?.monthlyTraffic ?? null,
      promotionMethods: (profile?.promotionMethods as string[]) ?? [],
      runsBrandedKw: profile?.runsBrandedKw ?? null,
      socialInstagram: profile?.socialInstagram ?? null,
      socialTiktok: profile?.socialTiktok ?? null,
      socialYoutube: profile?.socialYoutube ?? null,
      newsletterSize: profile?.newsletterSize ?? null,
      hasAffiliateExp: profile?.hasAffiliateExp ?? null,
      expIndustries: (profile?.expIndustries as string[]) ?? [],
      expMonthlyBookings: profile?.expMonthlyBookings ?? null,
      paymentMethod: profile?.paymentMethod ?? null,
      paymentCurrency: profile?.paymentCurrency ?? null,
      taxId: profile?.taxId ?? null,
      termsAgreedAt: profile?.termsAgreedAt?.toISOString() ?? null,
      termsVersion: profile?.termsVersion ?? null,
    })
  })

  fastify.put('/affiliate/profile', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireAffiliate(request, reply)) return
    const body = request.body as Record<string, unknown>

    // Update AdminUser fields if present
    const userUpdate: Record<string, unknown> = {}
    if (body.country != null) userUpdate.country = body.country
    if (body.accountType != null) userUpdate.accountType = body.accountType
    if (Object.keys(userUpdate).length > 0) {
      await prisma.adminUser.update({ where: { id: request.admin.adminId }, data: userUpdate })
    }

    const { country: _c, accountType: _a, ...profileFields } = body
    await prisma.affiliateProfile.upsert({
      where: { adminUserId: request.admin.adminId },
      create: { adminUserId: request.admin.adminId, ...profileFields },
      update: profileFields,
    })

    return reply.send({ ok: true })
  })

  fastify.post('/affiliate/terms', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireAffiliate(request, reply)) return
    await prisma.affiliateProfile.upsert({
      where: { adminUserId: request.admin.adminId },
      create: { adminUserId: request.admin.adminId, termsAgreedAt: new Date(), termsVersion: '1.0' },
      update: { termsAgreedAt: new Date(), termsVersion: '1.0' },
    })
    return reply.send({ ok: true })
  })

  // ── Marketplace ─────────────────────────────────────────────────────────────

  fastify.get('/affiliate/marketplace', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireAffiliate(request, reply)) return

    const myAffiliates = await prisma.affiliate.findMany({
      where: { adminUser: { id: request.admin.adminId }, deletedAt: null },
      select: { propertyId: true, code: true },
    })
    const joinedMap = new Map(myAffiliates.filter(a => a.propertyId != null).map(a => [a.propertyId!, a.code]))

    // Hotels that opted into the marketplace, with their effective commission rate
    const configs = await prisma.hotelConfig.findMany({
      where: { affiliateMarketplace: true },
      select: {
        propertyId: true,
        affiliateDefaultCommissionRate: true,
        displayName: true,
        logoUrl: true,
      },
    })

    // Fetch org settings for chain-level fallback rates
    const properties = await prisma.property.findMany({
      where: { propertyId: { in: configs.map(c => c.propertyId) } },
      select: { propertyId: true, name: true, organizationId: true },
    })
    const orgIds = [...new Set(properties.map(p => p.organizationId))]
    const orgSettings = await prisma.orgSettings.findMany({
      where: { organizationId: { in: orgIds } },
      select: { organizationId: true, affiliateDefaultCommissionRate: true },
    })
    const orgRateMap = new Map(orgSettings.map(o => [o.organizationId, o.affiliateDefaultCommissionRate?.toNumber() ?? null]))
    const propertyMap = new Map(properties.map(p => [p.propertyId, p]))

    const entries = configs.map(c => {
      const prop = propertyMap.get(c.propertyId)
      const chainRate = prop ? (orgRateMap.get(prop.organizationId) ?? null) : null
      const effectiveRate = c.affiliateDefaultCommissionRate != null
        ? c.affiliateDefaultCommissionRate.toNumber()
        : (chainRate ?? 0)

      return {
        propertyId: c.propertyId,
        propertyName: prop?.name ?? '',
        displayName: c.displayName,
        logoUrl: c.logoUrl,
        commissionRate: effectiveRate,
        joined: joinedMap.has(c.propertyId),
        affiliateCode: joinedMap.get(c.propertyId) ?? null,
      }
    })

    return reply.send(entries)
  })

  // ── Join hotel ──────────────────────────────────────────────────────────────

  fastify.post('/affiliate/marketplace/:propertyId', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireAffiliate(request, reply)) return
    const propertyId = parseInt((request.params as { propertyId: string }).propertyId, 10)

    // Gate: profile must be complete before joining
    const profile = await prisma.affiliateProfile.findUnique({ where: { adminUserId: request.admin.adminId } })
    if (!profile?.termsAgreedAt || !(profile.promotionMethods as string[]).length) {
      return reply.status(403).send({ error: 'Complete your affiliate profile before joining hotels', code: 'PROFILE_INCOMPLETE' })
    }

    const config = await prisma.hotelConfig.findUnique({
      where: { propertyId },
      select: { affiliateMarketplace: true, affiliateDefaultCommissionRate: true },
    })
    if (!config?.affiliateMarketplace) {
      return reply.status(404).send({ error: 'Hotel not in marketplace' })
    }

    const property = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true, name: true } })
    if (!property) return reply.status(404).send({ error: 'Property not found' })

    // Check not already joined
    const user = await prisma.adminUser.findUnique({ where: { id: request.admin.adminId }, select: { name: true } })
    const existing = await prisma.affiliate.findFirst({
      where: { adminUser: { id: request.admin.adminId }, propertyId, deletedAt: null },
    })
    if (existing) return reply.status(409).send({ error: 'Already joined' })

    // Resolve effective commission rate: hotel override → chain default
    const orgSettings = await prisma.orgSettings.findUnique({
      where: { organizationId: property.organizationId },
      select: { affiliateDefaultCommissionRate: true },
    })
    const commissionRate = config.affiliateDefaultCommissionRate != null
      ? config.affiliateDefaultCommissionRate.toNumber()
      : (orgSettings?.affiliateDefaultCommissionRate?.toNumber() ?? 0)

    const code = await ensureUniqueCode(property.organizationId, user?.name ?? 'AFF')

    const affiliate = await prisma.affiliate.create({
      data: {
        organizationId: property.organizationId,
        propertyId,
        code,
        name: user?.name ?? 'Affiliate',
        commissionRate,
        isActive: true,
        status: 'active',
        adminUser: { connect: { id: request.admin.adminId } },
      },
    })

    return reply.status(201).send({ ok: true, affiliateId: affiliate.id, code: affiliate.code })
  })

  // ── My bookings ─────────────────────────────────────────────────────────────

  fastify.get('/affiliate/bookings', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireAffiliate(request, reply)) return

    const myAffiliates = await prisma.affiliate.findMany({
      where: { adminUser: { id: request.admin.adminId }, deletedAt: null },
      select: { id: true, propertyId: true },
    })
    if (myAffiliates.length === 0) return reply.send([])

    const affiliateIds = myAffiliates.map(a => a.id)
    const bookingRows = await prisma.affiliateBooking.findMany({
      where: { affiliateId: { in: affiliateIds } },
      include: {
        booking: {
          select: {
            id: true, hyperGuestBookingId: true, propertyId: true, status: true,
            checkIn: true, checkOut: true, totalAmount: true, currency: true,
            leadGuestFirstName: true, leadGuestLastName: true, createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const propertyIds = [...new Set(bookingRows.map(r => r.booking.propertyId).filter(Boolean))] as number[]
    const properties = propertyIds.length > 0
      ? await prisma.property.findMany({ where: { propertyId: { in: propertyIds } }, select: { propertyId: true, name: true } })
      : []
    const propMap = new Map(properties.map(p => [p.propertyId, p.name]))

    const result = bookingRows.map(r => ({
      id: r.id,
      bookingRef: String(r.booking.hyperGuestBookingId),
      propertyId: r.booking.propertyId,
      propertyName: propMap.get(r.booking.propertyId ?? 0) ?? '',
      guestName: `${r.booking.leadGuestFirstName} ${r.booking.leadGuestLastName}`.trim(),
      status: r.booking.status,
      checkIn: r.booking.checkIn,
      checkOut: r.booking.checkOut,
      totalAmount: r.booking.totalAmount.toNumber(),
      currency: r.currency,
      commissionRate: r.commissionRate.toNumber(),
      commissionAmount: r.commissionAmount.toNumber(),
      createdAt: r.createdAt.toISOString(),
    }))

    return reply.send(result)
  })

  // ── My links ────────────────────────────────────────────────────────────────

  fastify.get('/affiliate/links', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireAffiliate(request, reply)) return

    const affiliates = await prisma.affiliate.findMany({
      where: { adminUser: { id: request.admin.adminId }, deletedAt: null, isActive: true },
      select: {
        id: true, code: true, commissionRate: true, discountRate: true,
        propertyId: true, status: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const propertyIds = affiliates.map(a => a.propertyId).filter(Boolean) as number[]
    const properties = propertyIds.length > 0
      ? await prisma.property.findMany({ where: { propertyId: { in: propertyIds } }, select: { propertyId: true, name: true } })
      : []
    const propMap = new Map(properties.map(p => [p.propertyId, p.name]))

    const base = env.WEB_BASE_URL
    const links = affiliates.map(a => ({
      id: a.id,
      code: a.code,
      propertyId: a.propertyId,
      propertyName: a.propertyId ? (propMap.get(a.propertyId) ?? '') : null,
      commissionRate: a.commissionRate?.toNumber() ?? null,
      discountRate: a.discountRate?.toNumber() ?? null,
      status: a.status,
      url: a.propertyId ? `${base}/search?hotelId=${a.propertyId}&affiliateId=${a.code}` : `${base}/search?affiliateId=${a.code}`,
      createdAt: a.createdAt.toISOString(),
    }))

    return reply.send(links)
  })
}
