import type { FastifyInstance } from 'fastify'
import { getMcpConfig, upsertMcpConfig, rotateApiKey, getSystemMcpConfig, setSystemMcpEnabled } from '../services/mcp.service.js'
import type { McpScope } from '../services/mcp.service.js'
import { getOAuthIssuer, getOAuthAudience, getOrCreateClaudeClient, rotateClientSecret } from '../services/oauth.service.js'
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

  // GET /admin/ai/mcp/oauth/config — built-in OAuth server info + Claude.ai credentials
  fastify.get('/admin/ai/mcp/oauth/config', async (_request, reply) => {
    const base = env.WEB_BASE_URL
    const claude = await getOrCreateClaudeClient()
    return reply.send({
      issuer: getOAuthIssuer(),
      authorizeUrl: `${base}/api/v1/oauth/authorize`,
      tokenUrl: `${base}/api/v1/oauth/token`,
      jwksUrl: `${base}/.well-known/jwks.json`,
      discoveryUrl: `${base}/.well-known/oauth-authorization-server`,
      registerUrl: `${base}/api/v1/oauth/register`,
      claude: { clientId: claude.clientId, clientSecret: claude.clientSecret },
    })
  })

  // POST /admin/ai/mcp/oauth/claude/rotate — rotate Claude.ai client secret
  fastify.post('/admin/ai/mcp/oauth/claude/rotate', async (_request, reply) => {
    const newSecret = await rotateClientSecret('claude_ai')
    if (!newSecret) return reply.status(404).send({ error: 'Claude.ai client not found' })
    return reply.send({ clientId: 'claude_ai', clientSecret: newSecret })
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
