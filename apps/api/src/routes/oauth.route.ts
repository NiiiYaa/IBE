import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
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
  getClientBranding,
} from '../services/oauth.service.js'

// Short-lived nonces for super-admin org selection (60s TTL, single-use)
const pendingNonces = new Map<string, { adminId: number; expiresAt: number }>()

function issuePendingNonce(adminId: number): string {
  const nonce = randomUUID()
  pendingNonces.set(nonce, { adminId, expiresAt: Date.now() + 60_000 })
  return nonce
}

function consumePendingNonce(nonce: string): number | null {
  const entry = pendingNonces.get(nonce)
  pendingNonces.delete(nonce)
  if (!entry || entry.expiresAt < Date.now()) return null
  return entry.adminId
}

// ── Authorize page HTML ───────────────────────────────────────────────────────

function authorizeHtml(params: {
  clientName: string
  clientId: string
  redirectUri: string
  state: string
  responseType: string
  hotelName?: string
  logoUrl?: string
  error?: string
  // org-picker step: password already verified, just need org selection
  pendingNonce?: string
  orgs?: { id: number; name: string; hyperGuestOrgId: string | null }[]
}): string {
  const errorBlock = params.error
    ? `<div class="error">${escHtml(params.error)}</div>`
    : ''

  const brandBlock = params.logoUrl
    ? `<img src="${escHtml(params.logoUrl)}" alt="${escHtml(params.hotelName ?? '')}" style="max-height:56px;max-width:180px;object-fit:contain;margin-bottom:12px"/>`
    : `<div class="logo">${escHtml(params.hotelName ?? 'Hotel Booking')}</div>`

  const hidden = (name: string, value: string) =>
    `<input type="hidden" name="${name}" value="${escHtml(value)}"/>`

  // Org-picker step: password already validated, just pick org
  if (params.pendingNonce && params.orgs) {
    const orgsJson = JSON.stringify(params.orgs.map(o => ({ id: o.id, name: o.name, hgId: o.hyperGuestOrgId ?? '' })))
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Select organisation — ${escHtml(params.hotelName ?? 'Hotel Booking')}</title>
  ${params.logoUrl ? `<link rel="icon" href="${escHtml(params.logoUrl)}"/><meta property="og:image" content="${escHtml(params.logoUrl)}"/>` : ''}
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .card{background:#fff;border-radius:12px;padding:40px;max-width:400px;width:100%;box-shadow:0 2px 16px rgba(0,0,0,.1)}
    .logo{font-size:22px;font-weight:700;color:#111;margin-bottom:6px}
    .sub{font-size:14px;color:#555;line-height:1.5;margin-bottom:24px}
    .sub strong{color:#111}
    .error{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;font-size:13px;color:#dc2626;margin-bottom:16px}
    label{display:block;font-size:13px;font-weight:500;color:#333;margin-bottom:4px}
    .combo{position:relative;margin-bottom:16px}
    .combo input[type=text]{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;background:#fff;cursor:pointer}
    .combo input[type=text]:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.1)}
    .combo input[type=text].selected{color:#111;font-weight:500}
    .dropdown{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:100;display:none;max-height:220px;overflow:hidden;flex-direction:column}
    .dropdown.open{display:flex}
    .search-wrap{padding:8px;border-bottom:1px solid #eee;flex-shrink:0}
    .search-wrap input{width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;outline:none}
    .search-wrap input:focus{border-color:#2563eb}
    .opts{overflow-y:auto;flex:1}
    .opt{padding:9px 12px;font-size:14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center}
    .opt:hover,.opt.active{background:#f0f4ff}
    .opt .oid{font-size:11px;color:#999;margin-left:8px;flex-shrink:0}
    .opt.no-results{color:#999;font-size:13px;cursor:default;justify-content:center}
    button{width:100%;padding:11px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
    button:hover{background:#1d4ed8}
    button:disabled{background:#93c5fd;cursor:not-allowed}
    .footer{font-size:12px;color:#999;text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #eee}
  </style>
</head>
<body>
  <div class="card">
    ${brandBlock}
    <p class="sub" style="margin-top:8px">Select the organisation to connect to <strong>${escHtml(params.clientName)}</strong>.</p>
    ${errorBlock}
    <form method="POST" id="frm">
      ${hidden('client_id', params.clientId)}
      ${hidden('redirect_uri', params.redirectUri)}
      ${hidden('state', params.state)}
      ${hidden('response_type', params.responseType)}
      ${hidden('pending_nonce', params.pendingNonce)}
      <input type="hidden" name="org_id" id="org_id_val"/>
      <label>Organisation</label>
      <div class="combo">
        <input type="text" id="combo_display" placeholder="Select an organisation…" readonly/>
        <div class="dropdown" id="dropdown">
          <div class="search-wrap"><input type="text" id="search_input" placeholder="Search…" autocomplete="off"/></div>
          <div class="opts" id="opts_list"></div>
        </div>
      </div>
      <button type="submit" id="submit_btn" disabled>Connect</button>
    </form>
    <p class="footer">Access granted: search availability · get property info · create booking links</p>
  </div>
  <script>
    var orgs = ${orgsJson};
    var sel = null;
    var display = document.getElementById('combo_display');
    var dropdown = document.getElementById('dropdown');
    var searchInput = document.getElementById('search_input');
    var optsList = document.getElementById('opts_list');
    var hiddenVal = document.getElementById('org_id_val');
    var submitBtn = document.getElementById('submit_btn');

    function renderOpts(q) {
      var filtered = q ? orgs.filter(function(o){ return (o.name + ' ' + o.hgId).toLowerCase().indexOf(q.toLowerCase()) !== -1; }) : orgs;
      if (!filtered.length) {
        optsList.innerHTML = '<div class="opt no-results">No results</div>';
        return;
      }
      optsList.innerHTML = filtered.map(function(o){
        var hgLabel = o.hgId ? '(' + escH(o.hgId) + ')' : '';
        return '<div class="opt" data-id="' + o.id + '" data-name="' + escH(o.name) + '" data-hgid="' + escH(o.hgId) + '"><span>' + escH(o.name) + '</span><span class="oid">' + hgLabel + '</span></div>';
      }).join('');
      optsList.querySelectorAll('.opt[data-id]').forEach(function(el){
        el.addEventListener('mousedown', function(e){
          e.preventDefault();
          var hgid = el.dataset.hgid;
          pick(parseInt(el.dataset.id), el.dataset.name, hgid ? '(' + hgid + ')' : '');
        });
      });
    }

    function pick(id, name, hgLabel) {
      sel = id;
      hiddenVal.value = id;
      display.value = name + (hgLabel ? ' ' + hgLabel : '');
      display.classList.add('selected');
      submitBtn.disabled = false;
      close();
    }

    function open() { renderOpts(''); dropdown.classList.add('open'); setTimeout(function(){ searchInput.focus(); }, 0); }
    function close() { dropdown.classList.remove('open'); searchInput.value = ''; }

    display.addEventListener('click', function(){ dropdown.classList.contains('open') ? close() : open(); });
    searchInput.addEventListener('input', function(){ renderOpts(this.value); });
    document.addEventListener('mousedown', function(e){ if (!document.querySelector('.combo').contains(e.target)) close(); });

    document.getElementById('frm').addEventListener('submit', function(e){
      if (!sel) { e.preventDefault(); display.focus(); }
    });

    function escH(s){ var d=document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }
  </script>
</body>
</html>`
  }

  // Normal login step
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Sign in — ${escHtml(params.hotelName ?? 'Hotel Booking')}</title>
  ${params.logoUrl ? `<link rel="icon" href="${escHtml(params.logoUrl)}"/><meta property="og:image" content="${escHtml(params.logoUrl)}"/>` : ''}
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
    ${brandBlock}
    <p class="sub" style="margin-top:8px">Sign in to allow <strong>${escHtml(params.clientName)}</strong> to search room availability and create booking links on your behalf.</p>
    ${errorBlock}
    <form method="POST">
      ${hidden('client_id', params.clientId)}
      ${hidden('redirect_uri', params.redirectUri)}
      ${hidden('state', params.state)}
      ${hidden('response_type', params.responseType)}
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

    const [clientName, branding] = await Promise.all([
      lookupClientName(client_id),
      getClientBranding(client_id),
    ])
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(authorizeHtml({
        clientName, clientId: client_id, redirectUri: redirect_uri, state, responseType: response_type,
        ...(branding?.name ? { hotelName: branding.name } : {}),
        ...(branding?.logoUrl ? { logoUrl: branding.logoUrl } : {}),
      }))
  })

  // ── Authorization endpoint — POST: process login ──────────────────────────

  fastify.post('/oauth/authorize', async (request, reply) => {
    const body = request.body as Record<string, string>
    const { client_id, redirect_uri, state = '', response_type = 'code', email, password, org_id, pending_nonce } = body

    if (!client_id || !redirect_uri) {
      return reply.status(400).send({ error: 'invalid_request' })
    }

    const [clientName, branding] = await Promise.all([
      lookupClientName(client_id),
      getClientBranding(client_id),
    ])
    const brandingProps = {
      ...(branding?.name ? { hotelName: branding.name } : {}),
      ...(branding?.logoUrl ? { logoUrl: branding.logoUrl } : {}),
    }
    const baseParams = { clientName, clientId: client_id, redirectUri: redirect_uri, state, responseType: response_type, ...brandingProps }

    const showLoginError = (error: string) =>
      reply.header('Content-Type', 'text/html; charset=utf-8').send(authorizeHtml({ ...baseParams, error }))

    // Validate redirect_uri
    const validClient = await validateClient(client_id, null, redirect_uri)
    if (!validClient) {
      return reply.status(400).send({ error: 'invalid_client', error_description: 'Unregistered redirect_uri' })
    }

    // ── Step 2: super admin already verified, just picking org ───────────────
    if (pending_nonce) {
      const adminId = consumePendingNonce(pending_nonce)
      if (!adminId) return showLoginError('Session expired. Please sign in again.')
      const orgIdNum = parseInt(org_id ?? '', 10)
      if (!orgIdNum) return showLoginError('Please select an organisation.')
      const code = issueAuthCode(adminId, orgIdNum, client_id, redirect_uri)
      const redirectUrl = new URL(redirect_uri)
      redirectUrl.searchParams.set('code', code)
      if (state) redirectUrl.searchParams.set('state', state)
      logger.info({ adminId, orgId: orgIdNum, clientId: client_id }, '[OAuth] Auth code issued (super)')
      return reply.redirect(redirectUrl.toString())
    }

    // ── Step 1: validate credentials ─────────────────────────────────────────
    if (!email || !password) return reply.status(400).send({ error: 'invalid_request' })

    const user = await prisma.adminUser.findFirst({
      where: { email: email.toLowerCase().trim(), isActive: true },
      select: { id: true, passwordHash: true, organizationId: true, role: true },
    })

    const valid = user?.passwordHash && await bcrypt.compare(password, user.passwordHash)
    if (!valid) return showLoginError('Invalid email or password.')

    // Regular admin — issue code immediately
    if (user.organizationId) {
      const code = issueAuthCode(user.id, user.organizationId, client_id, redirect_uri)
      const redirectUrl = new URL(redirect_uri)
      redirectUrl.searchParams.set('code', code)
      if (state) redirectUrl.searchParams.set('state', state)
      logger.info({ adminId: user.id, orgId: user.organizationId, clientId: client_id }, '[OAuth] Auth code issued')
      return reply.redirect(redirectUrl.toString())
    }

    // Super admin — issue nonce, show org picker (no password re-entry)
    if (user.role !== 'super') {
      return showLoginError('Your account is not associated with a hotel organisation. Please contact your administrator.')
    }
    const nonce = issuePendingNonce(user.id)
    const orgs = await prisma.organization.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, hyperGuestOrgId: true },
      orderBy: { name: 'asc' },
    })
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(authorizeHtml({ ...baseParams, pendingNonce: nonce, orgs }))
  })

  // ── Token endpoint ────────────────────────────────────────────────────────

  fastify.post('/oauth/token', async (request, reply) => {
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

    const accessToken = await signAccessToken(entry.adminUserId, entry.orgId)
    logger.info({ adminId: entry.adminUserId, orgId: entry.orgId, clientId }, '[OAuth] Access token issued')

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
