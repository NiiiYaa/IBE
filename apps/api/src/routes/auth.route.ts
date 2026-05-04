import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveAdminLogin, signUpAdmin, findOrCreateGoogleUser, getAdminById, updateAdminProfile, type AdminPayload } from '../services/auth.service.js'
import { forgotAdminPassword } from '../services/user.service.js'
import { env } from '../config/env.js'
import { cookieDomain } from '../utils/cookie.js'

const COOKIE_NAME = 'ibe_admin_token'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

const _adminCookieDomain = cookieDomain()
function setCookieAndRespond(
  fastify: FastifyInstance,
  reply: FastifyReply,
  payload: AdminPayload & { organizationId: number | null },
) {
  const token = fastify.jwt.sign(payload)
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    ...(_adminCookieDomain ? { domain: _adminCookieDomain } : {}),
  })
}

export async function authRoutes(fastify: FastifyInstance) {
  // ── Auth providers ─────────────────────────────────────────────────────────

  fastify.get('/auth/providers', async (_request, reply) => {
    return reply.send({ googleOAuth: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) })
  })

  // ── Email / password login ─────────────────────────────────────────────────

  fastify.post('/auth/login', async (request, reply) => {
    const { email, password, adminId } = request.body as {
      email?: string; password?: string; adminId?: number
    }
    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password are required', code: 'IBE.AUTH.002' })
    }
    const result = await resolveAdminLogin(email, password, adminId)
    if (!result.direct && result.choices.length === 0) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'IBE.AUTH.003' })
    }
    if (result.choices.length > 0) {
      return reply.send({ requiresSelection: true, accounts: result.choices })
    }
    const admin = result.direct!
    setCookieAndRespond(fastify, reply, admin)
    return reply.send({ ok: true, role: admin.role, organizationId: admin.organizationId, mustChangePassword: admin.mustChangePassword ?? false })
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

  fastify.post('/auth/forgot-password', async (request, reply) => {
    const { email } = request.body as { email?: string }
    if (email?.trim()) await forgotAdminPassword(email.trim()).catch(() => {})
    return reply.send({ ok: true })
  })

  fastify.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/', ...(_adminCookieDomain ? { domain: _adminCookieDomain } : {}) })
    return reply.send({ ok: true })
  })

  // ── Me ─────────────────────────────────────────────────────────────────────

  fastify.get('/auth/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const admin = await getAdminById(request.admin.adminId)
    if (!admin || !admin.isActive) {
      reply.clearCookie(COOKIE_NAME, { path: '/', ...(_adminCookieDomain ? { domain: _adminCookieDomain } : {}) })
      return reply.status(401).send({ error: 'Unauthorized', code: 'IBE.AUTH.001' })
    }
    return reply.send(admin)
  })

  fastify.put('/auth/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as { name?: string; email?: string; currentPassword?: string; newPassword?: string }
    try {
      const updated = await updateAdminProfile(request.admin.adminId, {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.currentPassword !== undefined && { currentPassword: body.currentPassword }),
        ...(body.newPassword !== undefined && { newPassword: body.newPassword }),
      })
      return reply.send(updated)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed'
      const status = message === 'Current password is incorrect' ? 401
        : message === 'Email already in use' ? 409
        : 400
      return reply.status(status).send({ error: message })
    }
  })

  // ── Google OAuth ───────────────────────────────────────────────────────────

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const { default: oauth2 } = await import('@fastify/oauth2')

    await fastify.register(oauth2 as never, {
      name: 'googleOAuth2',
      scope: ['profile', 'email'],
      credentials: {
        client: { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET },
        auth: (oauth2 as unknown as { GOOGLE_CONFIGURATION: object }).GOOGLE_CONFIGURATION,
      },
      callbackUri: `${env.WEB_BASE_URL}/api/v1/auth/google/callback`,
    })

    type GoogleOAuth2Instance = {
      googleOAuth2: {
        generateAuthorizationUri: (req: FastifyRequest, reply: FastifyReply) => Promise<string>
        getAccessTokenFromAuthorizationCodeFlow: (req: FastifyRequest, reply: FastifyReply) => Promise<{ token: { access_token: string } }>
      }
    }

    const INTENT_COOKIE = 'google_oauth_intent'
    const INTENT_COOKIE_OPTS = { path: '/', httpOnly: true, sameSite: 'lax' as const, maxAge: 300 }

    fastify.get('/auth/google/login', async (request, reply) => {
      reply.setCookie(INTENT_COOKIE, 'login', INTENT_COOKIE_OPTS)
      const uri = await (fastify as unknown as GoogleOAuth2Instance).googleOAuth2.generateAuthorizationUri(request, reply)
      return reply.redirect(uri)
    })

    fastify.get('/auth/google/signup', async (request, reply) => {
      reply.setCookie(INTENT_COOKIE, 'signup', INTENT_COOKIE_OPTS)
      const uri = await (fastify as unknown as GoogleOAuth2Instance).googleOAuth2.generateAuthorizationUri(request, reply)
      return reply.redirect(uri)
    })

    fastify.get('/auth/google/callback', async (request, reply) => {
      const intent = (request.cookies as Record<string, string>)[INTENT_COOKIE] ?? 'signup'
      reply.clearCookie(INTENT_COOKIE, { path: '/' })
      try {
        const { token } = await (fastify as unknown as GoogleOAuth2Instance).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply)

        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${token.access_token}` },
        })
        const profile = await profileRes.json() as { id: string; email: string; name: string }

        const admin = await findOrCreateGoogleUser({
          googleId: profile.id,
          email: profile.email,
          name: profile.name,
          createIfNotFound: intent === 'signup',
        })

        setCookieAndRespond(fastify, reply, admin)
        return reply.redirect(`${env.WEB_BASE_URL}/admin${admin.isNew ? '/onboarding' : ''}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        if (message === 'NO_ACCOUNT') {
          return reply.redirect(`${env.WEB_BASE_URL}/admin/login?error=google_no_account`)
        }
        fastify.log.error(err, 'Google OAuth callback failed')
        return reply.redirect(`${env.WEB_BASE_URL}/admin/login?error=oauth_failed`)
      }
    })
  }
}
