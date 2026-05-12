import type { FastifyInstance } from 'fastify'
import {
  getMcpConfig,
  upsertMcpConfig,
  rotateApiKey,
  getSystemMcpConfig,
  setSystemMcpEnabled,
  setSystemMcpTokenExpiry,
  getOrgMcpTokenExpirySettings,
  setOrgMcpTokenExpiry,
} from '../services/mcp.service.js'
import type { McpScope } from '../services/mcp.service.js'
import { getOAuthIssuer, getOAuthAudience, getOrCreateClaudeClient, rotateClientSecret } from '../services/oauth.service.js'
import { prisma } from '../db/client.js'
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
    if (scope.kind === 'org') {
      const expiry = await getOrgMcpTokenExpirySettings(scope.orgId)
      return reply.send({ ...(config ?? { enabled: false, apiKey: null }), ...expiry })
    }
    return reply.send(config ?? { enabled: false, apiKey: null })
  })

  // PATCH /admin/ai/mcp/system — update system-level OAuth token expiry (super only)
  fastify.patch('/admin/ai/mcp/system', async (request, reply) => {
    if ((request as any).admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const { oauthTokenExpiryDays } = request.body as { oauthTokenExpiryDays: number | null }
    if (oauthTokenExpiryDays !== null && (typeof oauthTokenExpiryDays !== 'number' || oauthTokenExpiryDays <= 0 || !Number.isInteger(oauthTokenExpiryDays))) {
      return reply.status(400).send({ error: 'oauthTokenExpiryDays must be a positive integer or null' })
    }
    return reply.send(await setSystemMcpTokenExpiry(oauthTokenExpiryDays))
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

  // PATCH /admin/ai/mcp — update org-level OAuth token expiry
  fastify.patch('/admin/ai/mcp', async (request, reply) => {
    const body = request.body as { oauthTokenExpiryDays: number | null; orgId?: number }
    if (body.oauthTokenExpiryDays !== null && (typeof body.oauthTokenExpiryDays !== 'number' || body.oauthTokenExpiryDays <= 0 || !Number.isInteger(body.oauthTokenExpiryDays))) {
      return reply.status(400).send({ error: 'oauthTokenExpiryDays must be a positive integer or null' })
    }
    const orgId = (request as any).admin.role === 'super'
      ? (body.orgId ?? (request as any).admin.organizationId)
      : (request as any).admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await setOrgMcpTokenExpiry(orgId, body.oauthTokenExpiryDays))
  })

  // GET /admin/ai/mcp/oauth/config — built-in OAuth server info + Claude.ai credentials
  fastify.get('/admin/ai/mcp/oauth/config', async (request, reply) => {
    const req = request as any
    const query = request.query as Record<string, string>
    const qOrgId = query.orgId
    const qPropertyId = query.propertyId ? parseInt(query.propertyId, 10) : null
    const orgId: number | null = req.admin.role === 'super'
      ? (qOrgId ? parseInt(qOrgId, 10) : null)
      : req.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const base = env.WEB_BASE_URL
    const [claude, org, property] = await Promise.all([
      getOrCreateClaudeClient(orgId),
      prisma.organization.findUnique({ where: { id: orgId }, select: { slug: true } }),
      qPropertyId ? prisma.property.findUnique({ where: { propertyId: qPropertyId }, select: { subdomain: true } }) : null,
    ])
    const mcpUrl = property?.subdomain
      ? `https://${property.subdomain}.hyperguest.net/api/v1/mcp`
      : org?.slug
        ? `https://${org.slug}.hyperguest.net/api/v1/mcp`
        : `${base}/api/v1/mcp`
    return reply.send({
      issuer: getOAuthIssuer(),
      authorizeUrl: `${base}/api/v1/oauth/authorize`,
      tokenUrl: `${base}/api/v1/oauth/token`,
      jwksUrl: `${base}/.well-known/jwks.json`,
      discoveryUrl: `${base}/.well-known/oauth-authorization-server`,
      registerUrl: `${base}/api/v1/oauth/register`,
      mcpUrl,
      claude: { clientId: claude.clientId, clientSecret: claude.clientSecret },
    })
  })

  // POST /admin/ai/mcp/oauth/claude/rotate — rotate Claude.ai client secret
  fastify.post('/admin/ai/mcp/oauth/claude/rotate', async (request, reply) => {
    const req = request as any
    const body = request.body as { orgId?: number }
    const orgId: number | null = req.admin.role === 'super'
      ? (body.orgId ?? null)
      : req.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const clientId = `claude_ai_org_${orgId}`
    const newSecret = await rotateClientSecret(clientId)
    if (!newSecret) return reply.status(404).send({ error: 'Claude.ai client not found' })
    return reply.send({ clientId, clientSecret: newSecret })
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
