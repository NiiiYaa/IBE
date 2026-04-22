import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import sensible from '@fastify/sensible'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import { env } from './config/env.js'
import { logger } from './utils/logger.js'
import { errorHandler } from './middleware/error-handler.js'
import { searchRoutes } from './routes/search.route.js'
import { bookingRoutes } from './routes/booking.route.js'
import { staticRoutes } from './routes/static.route.js'
import { paymentRoutes } from './routes/payment.route.js'
import { configRoutes } from './routes/config.route.js'
import { navRoutes } from './routes/nav.route.js'
import { syncRoutes } from './routes/sync.route.js'
import { adminRoutes } from './routes/admin.route.js'
import { ratesRoutes } from './routes/rates.route.js'
import { promoRoutes } from './routes/promo.route.js'
import { affiliateRoutes } from './routes/affiliate.route.js'
import { campaignRoutes } from './routes/campaign.route.js'
import { communicationRoutes } from './routes/communication.route.js'
import { messageRoutes } from './routes/message.route.js'
import { priceComparisonRoutes } from './routes/price-comparison.route.js'
import { authRoutes } from './routes/auth.route.js'
import { userRoutes } from './routes/user.route.js'
import { propertyOverrideRoutes } from './routes/property-override.route.js'
import { offersRoutes } from './routes/offers.route.js'
import { onsiteConversionRoutes } from './routes/onsite-conversion.route.js'
import { publicOnsiteRoutes } from './routes/public-onsite.route.js'
import { adminBookingsRoutes } from './routes/admin-bookings.route.js'
import { guestRoutes } from './routes/guest.route.js'
import { adminGuestsRoutes } from './routes/admin-guests.route.js'
import { trackingPixelRoutes, publicTrackingPixelRoutes } from './routes/tracking-pixel.route.js'
import { manualRoutes } from './routes/manual.route.js'
import { b2bAuthRoutes } from './routes/b2b-auth.route.js'
import { b2bAccessRoutes } from './routes/b2b-access.route.js'
import type { AdminPayload } from './services/auth.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    admin: AdminPayload
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AdminPayload & { organizationId: number | null }
    user: AdminPayload & { organizationId: number | null }
  }
}

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: env.NODE_ENV === 'production',
    bodyLimit: 50 * 1024 * 1024, // 50 MB — needed for base64-encoded image uploads
  })

  // ── Plugins ────────────────────────────────────────────────────────────────

  await app.register(sensible)

  await app.register(helmet, {
    contentSecurityPolicy: false,
  })

  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Too many requests',
      code: 'IBE.RATE_LIMIT',
    }),
  })

  await app.register(cookie)

  await app.register(multipart, {
    limits: { fileSize: 30 * 1024 * 1024 },  // 30 MB — covers PDFs and image uploads
  })

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: 'ibe_admin_token', signed: false },
  })

  // ── Auth decorator ─────────────────────────────────────────────────────────

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify({ onlyCookie: true })
      request.admin = request.user as AdminPayload
    } catch {
      reply.status(401).send({ error: 'Unauthorized', code: 'IBE.AUTH.001' })
    }
  })

  // ── Health check ───────────────────────────────────────────────────────────

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // ── Public routes ──────────────────────────────────────────────────────────

  await app.register(searchRoutes, { prefix: '/api/v1' })
  await app.register(bookingRoutes, { prefix: '/api/v1' })
  await app.register(staticRoutes, { prefix: '/api/v1' })
  await app.register(paymentRoutes, { prefix: '/api/v1' })
  await app.register(configRoutes, { prefix: '/api/v1' })
  await app.register(navRoutes, { prefix: '/api/v1' })
  await app.register(ratesRoutes, { prefix: '/api/v1' })
  await app.register(authRoutes, { prefix: '/api/v1' })
  await app.register(b2bAuthRoutes, { prefix: '/api/v1' })

  // Price comparison results endpoint is public (guest-facing)
  await app.register(priceComparisonRoutes, { prefix: '/api/v1' })

  // Onsite conversion public endpoints (presence heartbeat + stats)
  await app.register(publicOnsiteRoutes, { prefix: '/api/v1' })

  // Guest portal (public auth + protected self-service)
  await app.register(guestRoutes, { prefix: '/api/v1' })

  // Public pixel endpoint (no auth)
  await app.register(publicTrackingPixelRoutes, { prefix: '/api/v1' })

  // ── Protected admin routes ─────────────────────────────────────────────────

  await app.register(async (adminApp) => {
    adminApp.addHook('onRequest', app.authenticate)
    await adminApp.register(adminRoutes, { prefix: '/api/v1' })
    await adminApp.register(syncRoutes, { prefix: '/api/v1' })
    await adminApp.register(promoRoutes, { prefix: '/api/v1' })
    await adminApp.register(affiliateRoutes, { prefix: '/api/v1' })
    await adminApp.register(campaignRoutes, { prefix: '/api/v1' })
    await adminApp.register(communicationRoutes, { prefix: '/api/v1' })
    await adminApp.register(messageRoutes, { prefix: '/api/v1' })
    await adminApp.register(userRoutes, { prefix: '/api/v1' })
    await adminApp.register(propertyOverrideRoutes, { prefix: '/api/v1' })
    await adminApp.register(offersRoutes, { prefix: '/api/v1' })
    await adminApp.register(onsiteConversionRoutes, { prefix: '/api/v1' })
    await adminApp.register(adminBookingsRoutes, { prefix: '/api/v1' })
    await adminApp.register(adminGuestsRoutes, { prefix: '/api/v1' })
    await adminApp.register(trackingPixelRoutes, { prefix: '/api/v1' })
    await adminApp.register(manualRoutes, { prefix: '/api/v1' })
    await adminApp.register(b2bAccessRoutes, { prefix: '/api/v1' })
  })

  // ── Error handler ──────────────────────────────────────────────────────────

  app.setErrorHandler(errorHandler)

  return app
}
