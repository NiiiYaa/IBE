import type { FastifyInstance } from 'fastify'
import { verifyAdminLogin, signUpAdmin, findOrCreateGoogleUser, getAdminById } from '../services/auth.service.js'
import { env } from '../config/env.js'

const COOKIE_NAME = 'ibe_admin_token'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

function setCookieAndRespond(
  fastify: FastifyInstance,
  reply: Parameters<Parameters<FastifyInstance['get']>[1]>[1],
  payload: { adminId: number; organizationId: number | null; role: string; propertyIds?: number[] },
) {
  const token = fastify.jwt.sign(payload, { expiresIn: env.JWT_EXPIRES_IN })
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
}

export async function authRoutes(fastify: FastifyInstance) {
  // ── Auth providers ─────────────────────────────────────────────────────────

  fastify.get('/auth/providers', async (_request, reply) => {
    return reply.send({ googleOAuth: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) })
  })

  // ── Email / password login ─────────────────────────────────────────────────

  fastify.post('/auth/login', async (request, reply) => {
    const { email, password, hyperGuestOrgId } = request.body as {
      email?: string; password?: string; hyperGuestOrgId?: string
    }
    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password are required', code: 'IBE.AUTH.002' })
    }
    const admin = await verifyAdminLogin(email, password, hyperGuestOrgId)
    if (!admin) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'IBE.AUTH.003' })
    }
    setCookieAndRespond(fastify, reply, admin)
    return reply.send({ ok: true, role: admin.role, organizationId: admin.organizationId })
  })

  // ── Sign up ────────────────────────────────────────────────────────────────

  fastify.post('/auth/signup', async (request, reply) => {
    const { email, password, name, orgName, hyperGuestOrgId } = request.body as {
      email?: string; password?: string; name?: string; orgName?: string; hyperGuestOrgId?: string
    }
    if (!email || !password || !name || !orgName) {
      return reply.status(400).send({ error: 'email, password, name and orgName are required', code: 'IBE.AUTH.002' })
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters', code: 'IBE.AUTH.004' })
    }
    try {
      const admin = await signUpAdmin({ email, password, name, orgName, ...(hyperGuestOrgId && { hyperGuestOrgId }) })
      setCookieAndRespond(fastify, reply, admin)
      return reply.status(201).send({ ok: true, role: admin.role, organizationId: admin.organizationId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed'
      return reply.status(409).send({ error: message, code: 'IBE.AUTH.005' })
    }
  })

  // ── Logout ─────────────────────────────────────────────────────────────────

  fastify.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' })
    return reply.send({ ok: true })
  })

  // ── Me ─────────────────────────────────────────────────────────────────────

  fastify.get('/auth/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const admin = await getAdminById(request.admin.adminId)
    if (!admin || !admin.isActive) {
      reply.clearCookie(COOKIE_NAME, { path: '/' })
      return reply.status(401).send({ error: 'Unauthorized', code: 'IBE.AUTH.001' })
    }
    return reply.send(admin)
  })

  // ── Google OAuth ───────────────────────────────────────────────────────────

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const { default: oauth2 } = await import('@fastify/oauth2')

    await fastify.register(oauth2, {
      name: 'googleOAuth2',
      scope: ['profile', 'email'],
      credentials: {
        client: { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET },
        auth: (oauth2 as unknown as { GOOGLE_CONFIGURATION: object }).GOOGLE_CONFIGURATION,
      },
      startRedirectPath: '/auth/google',
      callbackUri: `${env.WEB_BASE_URL}/api/v1/auth/google/callback`,
    })

    fastify.get('/auth/google/callback', async (request, reply) => {
      try {
        const instance = fastify as unknown as {
          googleOAuth2: { getAccessTokenFromAuthorizationCodeFlow: (req: typeof request) => Promise<{ token: { access_token: string } }> }
        }
        const { token } = await instance.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request)

        // Fetch Google profile
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${token.access_token}` },
        })
        const profile = await profileRes.json() as { id: string; email: string; name: string }

        const admin = await findOrCreateGoogleUser({
          googleId: profile.id,
          email: profile.email,
          name: profile.name,
        })

        setCookieAndRespond(fastify, reply, admin)
        return reply.redirect(`${env.WEB_BASE_URL}/admin`)
      } catch (err) {
        fastify.log.error(err, 'Google OAuth callback failed')
        return reply.redirect(`${env.WEB_BASE_URL}/admin/login?error=oauth_failed`)
      }
    })
  }
}
