import type { FastifyInstance } from 'fastify'
import { getMcpConfig, upsertMcpConfig, rotateApiKey, getSystemMcpConfig, setSystemMcpEnabled } from '../services/mcp.service.js'
import type { McpScope } from '../services/mcp.service.js'
import { exchangeCodeForSub, getAuth0AuthUrl, getLinkedIdentity, isAuth0Configured, linkOAuthIdentity, unlinkOAuthIdentity } from '../services/oauth.service.js'
import { env } from '../config/env.js'

function resolveScope(request: { admin: { role: string; organizationId: number | null } }, query: Record<string, string>, params?: Record<string, string>): McpScope | null {
  const propertyId = params?.propertyId ? parseInt(params.propertyId, 10) : undefined
  if (propertyId && !isNaN(propertyId)) return { kind: 'property', propertyId }

  const orgId = request.admin.role === 'super'
    ? (query.orgId ? parseInt(query.orgId, 10) : null)
    : request.admin.organizationId
  if (!orgId) return null
  return { kind: 'org', orgId }
}

export async function adminMcpRoutes(fastify: FastifyInstance) {
  // GET /admin/ai/mcp/system — system-level MCP switch (super only)
  fastify.get('/admin/ai/mcp/system', async (request, reply) => {
    if ((request as any).admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemMcpConfig())
  })

  // PUT /admin/ai/mcp/system — enable/disable MCP globally (super only)
  fastify.put('/admin/ai/mcp/system', async (request, reply) => {
    if ((request as any).admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const { enabled } = request.body as { enabled: boolean }
    return reply.send(await setSystemMcpEnabled(enabled))
  })

  // GET /admin/ai/mcp — get MCP config for org or property
  fastify.get('/admin/ai/mcp', async (request, reply) => {
    const scope = resolveScope(request as any, request.query as Record<string, string>)
    if (!scope) return reply.status(400).send({ error: 'No organization context' })
    const config = await getMcpConfig(scope)
    return reply.send(config ?? { enabled: false, apiKey: null })
  })

  // GET /admin/ai/mcp/property/:propertyId — property-level MCP config
  fastify.get('/admin/ai/mcp/property/:propertyId', async (request, reply) => {
    const scope = resolveScope(request as any, {}, request.params as Record<string, string>)
    if (!scope) return reply.status(400).send({ error: 'Invalid property ID' })
    const config = await getMcpConfig(scope)
    return reply.send(config ?? { enabled: false, apiKey: null })
  })

  // PUT /admin/ai/mcp — enable or disable (creates record + key on first enable)
  fastify.put('/admin/ai/mcp', async (request, reply) => {
    const body = request.body as { enabled: boolean; orgId?: number; propertyId?: number }
    const scope = body.propertyId
      ? { kind: 'property' as const, propertyId: body.propertyId }
      : (() => {
          const orgId = (request as any).admin.role === 'super'
            ? (body.orgId ?? (request as any).admin.organizationId)
            : (request as any).admin.organizationId
          if (!orgId) return null
          return { kind: 'org' as const, orgId }
        })()
    if (!scope) return reply.status(400).send({ error: 'No organization context' })
    const config = await upsertMcpConfig(scope, body.enabled)
    return reply.send(config)
  })

  // GET /admin/ai/mcp/oauth/config — Auth0 config + linked identity status
  fastify.get('/admin/ai/mcp/oauth/config', async (request, reply) => {
    const scope = resolveScope(request as any, request.query as Record<string, string>)
    if (!scope) return reply.status(400).send({ error: 'No organization context' })
    const configured = isAuth0Configured()
    const identity = configured ? await getLinkedIdentity(scope) : null
    const authUrl = configured
      ? getAuth0AuthUrl(
          `${env.WEB_BASE_URL}/admin/ai/mcp/oauth/callback`,
          Buffer.from(JSON.stringify(scope)).toString('base64url'),
        )
      : null
    return reply.send({
      configured,
      linked: !!identity,
      clientId: env.AUTH0_CLIENT_ID ?? null,
      clientSecret: env.AUTH0_CLIENT_SECRET ?? null,
      authUrl,
    })
  })

  // POST /admin/ai/mcp/oauth/link — exchange auth code, store OAuth identity
  fastify.post('/admin/ai/mcp/oauth/link', async (request, reply) => {
    const { code, state } = request.body as { code: string; state: string }
    if (!code) return reply.status(400).send({ error: 'Missing code' })
    const redirectUri = `${env.WEB_BASE_URL}/admin/ai/mcp/oauth/callback`
    const result = await exchangeCodeForSub(code, redirectUri)
    if (!result) return reply.status(400).send({ error: 'Failed to exchange code' })
    let scope: McpScope | null = null
    try {
      scope = JSON.parse(Buffer.from(state, 'base64url').toString()) as McpScope
    } catch { /* invalid state */ }
    if (!scope) return reply.status(400).send({ error: 'Invalid state' })
    await linkOAuthIdentity(result.sub, scope)
    return reply.send({ linked: true })
  })

  // DELETE /admin/ai/mcp/oauth/identity — unlink OAuth identity
  fastify.delete('/admin/ai/mcp/oauth/identity', async (request, reply) => {
    const scope = resolveScope(request as any, request.query as Record<string, string>)
    if (!scope) return reply.status(400).send({ error: 'No organization context' })
    await unlinkOAuthIdentity(scope)
    return reply.send({ linked: false })
  })

  // POST /admin/ai/mcp/rotate — generate a new API key
  fastify.post('/admin/ai/mcp/rotate', async (request, reply) => {
    const body = request.body as { orgId?: number; propertyId?: number }
    const scope = body.propertyId
      ? { kind: 'property' as const, propertyId: body.propertyId }
      : (() => {
          const orgId = (request as any).admin.role === 'super'
            ? (body.orgId ?? (request as any).admin.organizationId)
            : (request as any).admin.organizationId
          if (!orgId) return null
          return { kind: 'org' as const, orgId }
        })()
    if (!scope) return reply.status(400).send({ error: 'No organization context' })
    const config = await rotateApiKey(scope)
    return reply.send(config)
  })
}
