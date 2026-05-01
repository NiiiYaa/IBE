import { createRemoteJWKSet, jwtVerify } from 'jose'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import type { McpScope } from './mcp.service.js'

let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks() {
  if (!JWKS) {
    JWKS = createRemoteJWKSet(new URL(`https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`))
  }
  return JWKS
}

export function isJwt(token: string): boolean {
  const parts = token.split('.')
  return parts.length === 3 && parts.every(p => p.length > 0)
}

export async function validateMcpJwt(token: string): Promise<{ sub: string } | null> {
  if (!env.AUTH0_DOMAIN || !env.AUTH0_AUDIENCE) return null
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://${env.AUTH0_DOMAIN}/`,
      audience: env.AUTH0_AUDIENCE,
    })
    return payload.sub ? { sub: payload.sub } : null
  } catch {
    return null
  }
}

export async function getOAuthScope(sub: string): Promise<McpScope | null> {
  const identity = await prisma.oAuthIdentity.findUnique({ where: { sub } })
  if (!identity) return null
  if (identity.propertyId) return { kind: 'property', propertyId: identity.propertyId }
  if (identity.organizationId) return { kind: 'org', orgId: identity.organizationId }
  return null
}

export async function linkOAuthIdentity(sub: string, scope: McpScope): Promise<void> {
  await prisma.oAuthIdentity.upsert({
    where: { sub },
    create: {
      sub,
      organizationId: scope.kind === 'org' ? scope.orgId : null,
      propertyId: scope.kind === 'property' ? scope.propertyId : null,
    },
    update: {
      organizationId: scope.kind === 'org' ? scope.orgId : null,
      propertyId: scope.kind === 'property' ? scope.propertyId : null,
    },
  })
}

export async function unlinkOAuthIdentity(scope: McpScope): Promise<void> {
  if (scope.kind === 'org') {
    await prisma.oAuthIdentity.deleteMany({ where: { organizationId: scope.orgId } })
  } else {
    await prisma.oAuthIdentity.deleteMany({ where: { propertyId: scope.propertyId } })
  }
}

export async function getLinkedIdentity(scope: McpScope): Promise<{ sub: string } | null> {
  const row = scope.kind === 'org'
    ? await prisma.oAuthIdentity.findFirst({ where: { organizationId: scope.orgId } })
    : await prisma.oAuthIdentity.findFirst({ where: { propertyId: scope.propertyId } })
  return row ? { sub: row.sub } : null
}

export async function exchangeCodeForSub(code: string, redirectUri: string): Promise<{ sub: string } | null> {
  if (!env.AUTH0_DOMAIN || !env.AUTH0_CLIENT_ID || !env.AUTH0_CLIENT_SECRET) return null
  const tokenRes = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: env.AUTH0_CLIENT_ID,
      client_secret: env.AUTH0_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!tokenRes.ok) return null
  const tokens = await tokenRes.json() as { access_token?: string }
  if (!tokens.access_token) return null

  const userRes = await fetch(`https://${env.AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!userRes.ok) return null
  const user = await userRes.json() as { sub?: string }
  return user.sub ? { sub: user.sub } : null
}

export function getAuth0AuthUrl(redirectUri: string, state: string): string | null {
  if (!env.AUTH0_DOMAIN || !env.AUTH0_CLIENT_ID) return null
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.AUTH0_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile',
    state,
    ...(env.AUTH0_AUDIENCE ? { audience: env.AUTH0_AUDIENCE } : {}),
  })
  return `https://${env.AUTH0_DOMAIN}/authorize?${params.toString()}`
}

export function isAuth0Configured(): boolean {
  return !!(env.AUTH0_DOMAIN && env.AUTH0_CLIENT_ID && env.AUTH0_CLIENT_SECRET && env.AUTH0_AUDIENCE)
}
