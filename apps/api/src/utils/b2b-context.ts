import type { FastifyInstance, FastifyRequest } from 'fastify'

export interface B2BContext {
  adminId: number
  buyerOrgId: number
  sellerOrgId: number
  role: string
  agentName?: string
}

const B2B_COOKIE_NAME = 'ibe_b2b_token'

/**
 * Extracts B2B context from the ibe_b2b_token cookie if present.
 * Returns null if no valid B2B session is found (not an error — request may be B2C).
 */
export function extractB2BContext(fastify: FastifyInstance, request: FastifyRequest): B2BContext | null {
  const token = (request.cookies as Record<string, string>)[B2B_COOKIE_NAME]
  if (!token) return null

  try {
    const payload = fastify.jwt.verify<{
      adminId: number
      organizationId: number
      role: string
      sellerOrgId: number
      b2b: boolean
    }>(token)

    if (!payload.b2b || !payload.organizationId || !payload.sellerOrgId) return null

    return {
      adminId: payload.adminId,
      buyerOrgId: payload.organizationId,
      sellerOrgId: payload.sellerOrgId,
      role: payload.role,
    }
  } catch {
    return null
  }
}
