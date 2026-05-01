import { createLocalJWKSet, exportJWK, generateKeyPair, importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose'
import type { CryptoKey } from 'jose'
import { randomUUID } from 'node:crypto'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import type { McpScope } from './mcp.service.js'

// ── Key pair ──────────────────────────────────────────────────────────────────

interface OAuthKeyPair {
  privateKey: CryptoKey
  publicJwk: Record<string, unknown>
  kid: string
}

let _keyPair: OAuthKeyPair | null = null

export async function getKeyPair(): Promise<OAuthKeyPair> {
  if (_keyPair) return _keyPair
  const kid = 'ibe-mcp-1'
  if (env.OAUTH_PRIVATE_KEY_PEM && env.OAUTH_PUBLIC_KEY_PEM) {
    const privateKey = await importPKCS8(env.OAUTH_PRIVATE_KEY_PEM, 'RS256')
    const publicKey  = await importSPKI(env.OAUTH_PUBLIC_KEY_PEM, 'RS256')
    _keyPair = { privateKey, publicJwk: { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' }, kid }
  } else {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    _keyPair = { privateKey, publicJwk: { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' }, kid }
    console.warn('[OAuth] OAUTH_PRIVATE_KEY_PEM not set — using ephemeral key (tokens lost on restart)')
  }
  return _keyPair
}

export async function getJwks(): Promise<{ keys: unknown[] }> {
  const { publicJwk } = await getKeyPair()
  return { keys: [publicJwk] }
}

// ── JWT ───────────────────────────────────────────────────────────────────────

export function isJwt(token: string): boolean {
  const parts = token.split('.')
  return parts.length === 3 && parts.every(p => p.length > 0)
}

export function getOAuthIssuer(): string {
  return env.WEB_BASE_URL
}

export function getOAuthAudience(): string {
  return `${env.WEB_BASE_URL}/api/v1/mcp`
}

export async function signAccessToken(adminUserId: number): Promise<string> {
  const { privateKey, kid } = await getKeyPair()
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid })
    .setSubject(`user:${adminUserId}`)
    .setIssuer(getOAuthIssuer())
    .setAudience(getOAuthAudience())
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

export async function validateMcpJwt(token: string): Promise<{ sub: string } | null> {
  try {
    const { publicJwk, kid } = await getKeyPair()
    const JWKS = createLocalJWKSet({ keys: [publicJwk as Parameters<typeof createLocalJWKSet>[0]['keys'][0]] })
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: getOAuthIssuer(),
      audience: getOAuthAudience(),
    })
    return payload.sub ? { sub: payload.sub } : null
  } catch {
    return null
  }
}

export async function getOAuthScope(sub: string): Promise<McpScope | null> {
  // sub is "user:{adminUserId}" — look up the admin's org directly
  const match = sub.match(/^user:(\d+)$/)
  if (!match?.[1]) return null
  const user = await prisma.adminUser.findUnique({
    where: { id: parseInt(match[1], 10) },
    select: { organizationId: true, isActive: true },
  })
  if (!user?.isActive || !user.organizationId) return null
  return { kind: 'org', orgId: user.organizationId }
}

// ── Auth codes ────────────────────────────────────────────────────────────────

interface AuthCode {
  adminUserId: number
  clientId: string
  redirectUri: string
  expiresAt: number
}
const authCodes = new Map<string, AuthCode>()

export function issueAuthCode(adminUserId: number, clientId: string, redirectUri: string): string {
  const code = randomUUID()
  authCodes.set(code, { adminUserId, clientId, redirectUri, expiresAt: Date.now() + 5 * 60_000 })
  return code
}

export function consumeAuthCode(code: string): AuthCode | null {
  const entry = authCodes.get(code)
  authCodes.delete(code)
  if (!entry || entry.expiresAt < Date.now()) return null
  return entry
}

// ── Client registry ───────────────────────────────────────────────────────────

export async function validateClient(clientId: string, clientSecret: string | null, redirectUri: string): Promise<boolean> {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } })
  if (!client) return false
  if (clientSecret && clientSecret !== client.clientSecret) return false
  const uris: string[] = JSON.parse(client.redirectUris)
  return uris.some(u => redirectUri === u || redirectUri.startsWith(u))
}

export async function lookupClientName(clientId: string): Promise<string> {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } })
  return client?.clientName ?? clientId
}

export async function registerClient(clientName: string, redirectUris: string[]): Promise<{ clientId: string; clientSecret: string }> {
  const clientId = randomUUID()
  const clientSecret = randomUUID()
  await prisma.oAuthClient.create({
    data: { clientId, clientSecret, clientName, redirectUris: JSON.stringify(redirectUris) },
  })
  return { clientId, clientSecret }
}

export async function getOrCreateClaudeClient(): Promise<{ clientId: string; clientSecret: string }> {
  const existing = await prisma.oAuthClient.findUnique({ where: { clientId: 'claude_ai' } })
  if (existing) return { clientId: existing.clientId, clientSecret: existing.clientSecret }
  const secret = randomUUID()
  await prisma.oAuthClient.create({
    data: {
      clientId: 'claude_ai',
      clientSecret: secret,
      clientName: 'Claude.ai',
      redirectUris: JSON.stringify(['https://claude.ai/', 'https://api.claude.ai/']),
    },
  })
  return { clientId: 'claude_ai', clientSecret: secret }
}

export async function rotateClientSecret(clientId: string): Promise<string | null> {
  const newSecret = randomUUID()
  const updated = await prisma.oAuthClient.updateMany({ where: { clientId }, data: { clientSecret: newSecret } })
  return updated.count > 0 ? newSecret : null
}
