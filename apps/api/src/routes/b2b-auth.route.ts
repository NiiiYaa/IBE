import type { FastifyInstance } from 'fastify'
import { resolveB2BLogin, resolveSellerOrg, getB2BAdminById } from '../services/b2b-auth.service.js'
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
}
