import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import {
  getJwks,
  getOAuthAudience,
  getOAuthIssuer,
  issueAuthCode,
  consumeAuthCode,
  signAccessToken,
  validateClient,
  lookupClientName,
  registerClient,
} from '../services/oauth.service.js'

// ── Authorize page HTML ───────────────────────────────────────────────────────

function authorizeHtml(params: {
  clientName: string
  clientId: string
  redirectUri: string
  state: string
  responseType: string
  error?: string
}): string {
  const errorBlock = params.error
    ? `<div class="error">${escHtml(params.error)}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Sign in — Hotel Booking</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .card{background:#fff;border-radius:12px;padding:40px;max-width:400px;width:100%;box-shadow:0 2px 16px rgba(0,0,0,.1)}
    .logo{font-size:22px;font-weight:700;color:#111;margin-bottom:6px}
    .sub{font-size:14px;color:#555;line-height:1.5;margin-bottom:24px}
    .sub strong{color:#111}
    .error{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;font-size:13px;color:#dc2626;margin-bottom:16px}
    label{display:block;font-size:13px;font-weight:500;color:#333;margin-bottom:4px}
    input[type=email],input[type=password]{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;margin-bottom:16px}
    input[type=email]:focus,input[type=password]:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.1)}
    button{width:100%;padding:11px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
    button:hover{background:#1d4ed8}
    .footer{font-size:12px;color:#999;text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #eee}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Hotel Booking</div>
    <p class="sub">Sign in to allow <strong>${escHtml(params.clientName)}</strong> to search room availability and create booking links on your behalf.</p>
    ${errorBlock}
    <form method="POST">
      <input type="hidden" name="client_id"      value="${escHtml(params.clientId)}"/>
      <input type="hidden" name="redirect_uri"   value="${escHtml(params.redirectUri)}"/>
      <input type="hidden" name="state"          value="${escHtml(params.state)}"/>
      <input type="hidden" name="response_type"  value="${escHtml(params.responseType)}"/>
      <label for="email">Email</label>
      <input type="email"    id="email"    name="email"    required autocomplete="email"             placeholder="admin@hotel.com"/>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Password"/>
      <button type="submit">Sign in &amp; connect</button>
    </form>
    <p class="footer">Access granted: search availability · get property info · create booking links</p>
  </div>
</body>
</html>`
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function oauthRoutes(fastify: FastifyInstance) {

  // Parse application/x-www-form-urlencoded for token + authorize POST endpoints
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body: string, done) => {
    const result: Record<string, string> = {}
    new URLSearchParams(body).forEach((v, k) => { result[k] = v })
    done(null, result)
  })

  // ── Discovery metadata ────────────────────────────────────────────────────

  fastify.get('/oauth/.well-known/oauth-authorization-server', async (_request, reply) => {
    const base = env.WEB_BASE_URL
    return reply.send({
      issuer: getOAuthIssuer(),
      authorization_endpoint: `${base}/api/v1/oauth/authorize`,
      token_endpoint: `${base}/api/v1/oauth/token`,
      jwks_uri: `${base}/.well-known/jwks.json`,
      registration_endpoint: `${base}/api/v1/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      scopes_supported: ['openid'],
      code_challenge_methods_supported: ['S256'],
    })
  })

  // ── JWKS ──────────────────────────────────────────────────────────────────

  fastify.get('/oauth/.well-known/jwks.json', async (_request, reply) => {
    return reply.send(await getJwks())
  })

  // ── Authorization endpoint — GET: show login form ─────────────────────────

  fastify.get('/oauth/authorize', async (request, reply) => {
    const q = request.query as Record<string, string>
    const { client_id, redirect_uri, state = '', response_type = 'code' } = q

    if (!client_id || !redirect_uri) {
      return reply.status(400).send({ error: 'invalid_request', error_description: 'client_id and redirect_uri are required' })
    }

    const clientName = await lookupClientName(client_id)
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(authorizeHtml({ clientName, clientId: client_id, redirectUri: redirect_uri, state, responseType: response_type }))
  })

  // ── Authorization endpoint — POST: process login ──────────────────────────

  fastify.post('/oauth/authorize', async (request, reply) => {
    const body = request.body as Record<string, string>
    const { client_id, redirect_uri, state = '', response_type = 'code', email, password } = body

    if (!client_id || !redirect_uri || !email || !password) {
      return reply.status(400).send({ error: 'invalid_request' })
    }

    const clientName = await lookupClientName(client_id)

    // Validate redirect_uri is registered for this client
    const validClient = await validateClient(client_id, null, redirect_uri)
    if (!validClient) {
      return reply.status(400).send({ error: 'invalid_client', error_description: 'Unregistered redirect_uri' })
    }

    // Authenticate admin
    const user = await prisma.adminUser.findFirst({
      where: { email: email.toLowerCase().trim(), isActive: true },
      select: { id: true, passwordHash: true, organizationId: true },
    })

    const valid = user?.passwordHash && await bcrypt.compare(password, user.passwordHash)
    if (!valid || !user?.organizationId) {
      return reply
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(authorizeHtml({
          clientName, clientId: client_id, redirectUri: redirect_uri, state, responseType: response_type,
          error: 'Invalid email or password, or account has no organisation.',
        }))
    }

    const code = issueAuthCode(user.id, client_id, redirect_uri)
    const redirectUrl = new URL(redirect_uri)
    redirectUrl.searchParams.set('code', code)
    if (state) redirectUrl.searchParams.set('state', state)

    logger.info({ adminId: user.id, clientId: client_id }, '[OAuth] Auth code issued')
    return reply.redirect(redirectUrl.toString())
  })

  // ── Token endpoint ────────────────────────────────────────────────────────

  fastify.post('/oauth/token', async (request, reply) => {
    // Accept both JSON and form-encoded bodies
    const body = request.body as Record<string, string>

    // Extract client credentials — body params or Basic Auth header
    let clientId = body.client_id ?? ''
    let clientSecret = body.client_secret ?? ''
    const authHeader = (request.headers['authorization'] as string | undefined) ?? ''
    if (authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString()
      const sep = decoded.indexOf(':')
      if (sep !== -1) {
        clientId = decoded.slice(0, sep)
        clientSecret = decoded.slice(sep + 1)
      }
    }

    const { grant_type, code, redirect_uri } = body

    if (grant_type !== 'authorization_code') {
      return reply.status(400).send({ error: 'unsupported_grant_type' })
    }
    if (!code || !redirect_uri) {
      return reply.status(400).send({ error: 'invalid_request', error_description: 'code and redirect_uri are required' })
    }

    const validClient = await validateClient(clientId, clientSecret || null, redirect_uri)
    if (!validClient) {
      return reply.status(401).send({ error: 'invalid_client' })
    }

    const entry = consumeAuthCode(code)
    if (!entry) {
      return reply.status(400).send({ error: 'invalid_grant', error_description: 'Code expired or already used' })
    }
    if (entry.clientId !== clientId || entry.redirectUri !== redirect_uri) {
      return reply.status(400).send({ error: 'invalid_grant', error_description: 'client_id or redirect_uri mismatch' })
    }

    const accessToken = await signAccessToken(entry.adminUserId)
    logger.info({ adminId: entry.adminUserId, clientId }, '[OAuth] Access token issued')

    return reply.send({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid',
      audience: getOAuthAudience(),
    })
  })

  // ── Dynamic Client Registration (DCR) — for ChatGPT ──────────────────────

  fastify.post('/oauth/register', async (request, reply) => {
    const body = request.body as {
      client_name?: string
      redirect_uris?: string[]
      grant_types?: string[]
      response_types?: string[]
    }

    const redirectUris = body.redirect_uris ?? []
    if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
      return reply.status(400).send({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' })
    }

    const { clientId, clientSecret } = await registerClient(body.client_name ?? 'Unknown', redirectUris)
    logger.info({ clientId, clientName: body.client_name }, '[OAuth] DCR client registered')

    return reply.status(201).send({
      client_id: clientId,
      client_secret: clientSecret,
      client_name: body.client_name,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    })
  })
}
