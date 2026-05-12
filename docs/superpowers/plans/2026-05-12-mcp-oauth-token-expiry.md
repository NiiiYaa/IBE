# MCP OAuth Token Expiry — Configurable Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable OAuth token lifetime setting (System → Org inheritance, default = forever) exposed in the MCP admin UI.

**Architecture:** Add `oauthTokenExpiryDays Int?` to `SystemMcpConfig` and `OrgMcpConfig` Prisma models. A new `getEffectiveMcpTokenExpiry(orgId)` service function resolves inheritance. `signAccessToken` accepts the resolved expiry and conditionally sets the JWT `exp` claim. The MCP admin page gains a dropdown in both the system and org views.

**Tech Stack:** Prisma, Fastify, jose (JWT), React + TanStack Query, Vitest

---

## File Map

| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | Add `oauthTokenExpiryDays Int?` to `SystemMcpConfig` + `OrgMcpConfig` |
| `apps/api/src/services/mcp.service.ts` | Add `getOrgMcpTokenExpirySettings`, `getEffectiveMcpTokenExpiry`, `setSystemMcpTokenExpiry`, `setOrgMcpTokenExpiry`; update `getSystemMcpConfig` |
| `apps/api/src/services/__tests__/mcp.service.test.ts` | New — unit tests for the new expiry functions |
| `apps/api/src/services/oauth.service.ts` | Update `signAccessToken` signature to accept `expiryDays: number \| null` |
| `apps/api/src/routes/admin-mcp.route.ts` | Add `PATCH /admin/ai/mcp/system` and `PATCH /admin/ai/mcp`; extend `GET` responses |
| `apps/api/src/routes/oauth.route.ts` | Look up effective expiry before signing; pass to `signAccessToken`; set `expires_in` |
| `apps/web/src/lib/api-client.ts` | Update return types for `getSystemMcpConfig` / `getOrgMcpConfig`; add `updateSystemMcpTokenExpiry` + `updateOrgMcpTokenExpiry` |
| `apps/web/src/app/admin/ai/mcp/page.tsx` | Add token expiry dropdown to `SystemMcpSection` and org-level section |

---

### Task 1: Schema — add `oauthTokenExpiryDays` to MCP config models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the field to both models**

In `apps/api/prisma/schema.prisma`, find `model SystemMcpConfig` and add the new field:

```prisma
model SystemMcpConfig {
  id        Int      @id @default(autoincrement())
  enabled   Boolean  @default(true)
  oauthTokenExpiryDays Int?  // null = forever
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Find `model OrgMcpConfig` and add the field:

```prisma
model OrgMcpConfig {
  id             Int          @id @default(autoincrement())
  organizationId Int          @unique
  organization   Organization @relation(fields: [organizationId], references: [id])
  enabled        Boolean      @default(false)
  apiKey         String       @unique
  oauthTokenExpiryDays Int?  // null = inherit from system
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api && npx prisma migrate dev --name add_mcp_oauth_token_expiry
```

Expected: migration file created, `prisma generate` runs automatically.

- [ ] **Step 3: Verify generated client has the new fields**

```bash
grep -n "oauthTokenExpiryDays" apps/api/node_modules/.prisma/client/index.d.ts | head -5
```

Expected: at least one match.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add oauthTokenExpiryDays to SystemMcpConfig and OrgMcpConfig"
```

---

### Task 2: mcp.service.ts — add expiry functions (TDD)

**Files:**
- Modify: `apps/api/src/services/mcp.service.ts`
- Create: `apps/api/src/services/__tests__/mcp.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/__tests__/mcp.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemMcpConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    orgMcpConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

import { prisma } from '../../db/client.js'
import {
  getSystemMcpConfig,
  getOrgMcpTokenExpirySettings,
  getEffectiveMcpTokenExpiry,
  setSystemMcpTokenExpiry,
  setOrgMcpTokenExpiry,
} from '../mcp.service.js'

const mp = prisma as any

beforeEach(() => { vi.clearAllMocks() })

describe('getSystemMcpConfig', () => {
  it('returns oauthTokenExpiryDays from DB row', async () => {
    mp.systemMcpConfig.findFirst.mockResolvedValue({ enabled: true, oauthTokenExpiryDays: 30 })
    const result = await getSystemMcpConfig()
    expect(result).toEqual({ enabled: true, oauthTokenExpiryDays: 30 })
  })

  it('returns null expiry when row has null', async () => {
    mp.systemMcpConfig.findFirst.mockResolvedValue({ enabled: true, oauthTokenExpiryDays: null })
    const result = await getSystemMcpConfig()
    expect(result.oauthTokenExpiryDays).toBeNull()
  })

  it('returns null expiry when no row exists', async () => {
    mp.systemMcpConfig.findFirst.mockResolvedValue(null)
    const result = await getSystemMcpConfig()
    expect(result.oauthTokenExpiryDays).toBeNull()
  })
})

describe('getOrgMcpTokenExpirySettings', () => {
  it('returns org value when org has explicit override', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: 7 })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: 30 })
    const result = await getOrgMcpTokenExpirySettings(1)
    expect(result).toEqual({
      oauthTokenExpiryDays: 7,
      effectiveTokenExpiryDays: 7,
      tokenExpiryInheritedFromSystem: false,
    })
  })

  it('falls back to system when org setting is null', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: null })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: 90 })
    const result = await getOrgMcpTokenExpirySettings(1)
    expect(result).toEqual({
      oauthTokenExpiryDays: null,
      effectiveTokenExpiryDays: 90,
      tokenExpiryInheritedFromSystem: true,
    })
  })

  it('returns null effective when both are null (forever)', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: null })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: null })
    const result = await getOrgMcpTokenExpirySettings(1)
    expect(result).toEqual({
      oauthTokenExpiryDays: null,
      effectiveTokenExpiryDays: null,
      tokenExpiryInheritedFromSystem: true,
    })
  })

  it('falls back to system when no org row exists', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue(null)
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: 365 })
    const result = await getOrgMcpTokenExpirySettings(1)
    expect(result).toEqual({
      oauthTokenExpiryDays: null,
      effectiveTokenExpiryDays: 365,
      tokenExpiryInheritedFromSystem: true,
    })
  })
})

describe('getEffectiveMcpTokenExpiry', () => {
  it('returns org value when set', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: 7 })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: 30 })
    expect(await getEffectiveMcpTokenExpiry(1)).toBe(7)
  })

  it('returns null when both are null', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: null })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: null })
    expect(await getEffectiveMcpTokenExpiry(1)).toBeNull()
  })
})

describe('setSystemMcpTokenExpiry', () => {
  it('updates existing row', async () => {
    mp.systemMcpConfig.findFirst.mockResolvedValue({ id: 1, enabled: true, oauthTokenExpiryDays: null })
    mp.systemMcpConfig.update.mockResolvedValue({ enabled: true, oauthTokenExpiryDays: 30 })
    const result = await setSystemMcpTokenExpiry(30)
    expect(mp.systemMcpConfig.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { oauthTokenExpiryDays: 30 },
    })
    expect(result.oauthTokenExpiryDays).toBe(30)
  })

  it('creates row when none exists', async () => {
    mp.systemMcpConfig.findFirst.mockResolvedValue(null)
    mp.systemMcpConfig.create.mockResolvedValue({ enabled: true, oauthTokenExpiryDays: null })
    await setSystemMcpTokenExpiry(null)
    expect(mp.systemMcpConfig.create).toHaveBeenCalledWith({
      data: { enabled: true, oauthTokenExpiryDays: null },
    })
  })
})

describe('setOrgMcpTokenExpiry', () => {
  it('upserts the org expiry and returns updated settings', async () => {
    mp.orgMcpConfig.upsert.mockResolvedValue({})
    // After upsert, getOrgMcpTokenExpirySettings is called internally
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: 90 })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: null })
    const result = await setOrgMcpTokenExpiry(1, 90)
    expect(result.oauthTokenExpiryDays).toBe(90)
    expect(result.tokenExpiryInheritedFromSystem).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd apps/api && npm test -- mcp.service
```

Expected: failures — functions not yet exported.

- [ ] **Step 3: Implement the functions in mcp.service.ts**

Replace the content of `apps/api/src/services/mcp.service.ts` with:

```ts
import { randomUUID } from 'node:crypto'
import { prisma } from '../db/client.js'

export type McpScope = { kind: 'org'; orgId: number } | { kind: 'property'; propertyId: number }

export interface McpConfigRecord {
  enabled: boolean
  apiKey: string
}

export interface OrgMcpTokenExpirySettings {
  oauthTokenExpiryDays: number | null
  effectiveTokenExpiryDays: number | null
  tokenExpiryInheritedFromSystem: boolean
}

export async function getSystemMcpConfig(): Promise<{ enabled: boolean; oauthTokenExpiryDays: number | null }> {
  const row = await prisma.systemMcpConfig.findFirst()
  return { enabled: row?.enabled ?? true, oauthTokenExpiryDays: row?.oauthTokenExpiryDays ?? null }
}

export async function setSystemMcpEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
  const existing = await prisma.systemMcpConfig.findFirst()
  const row = existing
    ? await prisma.systemMcpConfig.update({ where: { id: existing.id }, data: { enabled } })
    : await prisma.systemMcpConfig.create({ data: { enabled } })
  return { enabled: row.enabled }
}

export async function setSystemMcpTokenExpiry(days: number | null): Promise<{ enabled: boolean; oauthTokenExpiryDays: number | null }> {
  const existing = await prisma.systemMcpConfig.findFirst()
  const row = existing
    ? await prisma.systemMcpConfig.update({ where: { id: existing.id }, data: { oauthTokenExpiryDays: days } })
    : await prisma.systemMcpConfig.create({ data: { enabled: true, oauthTokenExpiryDays: days } })
  return { enabled: row.enabled, oauthTokenExpiryDays: row.oauthTokenExpiryDays }
}

export async function getOrgMcpTokenExpirySettings(orgId: number): Promise<OrgMcpTokenExpirySettings> {
  const [org, sys] = await Promise.all([
    prisma.orgMcpConfig.findUnique({ where: { organizationId: orgId }, select: { oauthTokenExpiryDays: true } }),
    prisma.systemMcpConfig.findFirst({ select: { oauthTokenExpiryDays: true } }),
  ])
  const orgDays = org?.oauthTokenExpiryDays ?? null
  const sysDays = sys?.oauthTokenExpiryDays ?? null
  const inherited = orgDays === null
  return {
    oauthTokenExpiryDays: orgDays,
    effectiveTokenExpiryDays: inherited ? sysDays : orgDays,
    tokenExpiryInheritedFromSystem: inherited,
  }
}

export async function getEffectiveMcpTokenExpiry(orgId: number): Promise<number | null> {
  const settings = await getOrgMcpTokenExpirySettings(orgId)
  return settings.effectiveTokenExpiryDays
}

export async function setOrgMcpTokenExpiry(orgId: number, days: number | null): Promise<OrgMcpTokenExpirySettings> {
  await prisma.orgMcpConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, enabled: false, apiKey: randomUUID(), oauthTokenExpiryDays: days },
    update: { oauthTokenExpiryDays: days },
  })
  return getOrgMcpTokenExpirySettings(orgId)
}

export async function getMcpConfig(scope: McpScope): Promise<McpConfigRecord | null> {
  if (scope.kind === 'org') {
    const row = await prisma.orgMcpConfig.findUnique({ where: { organizationId: scope.orgId } })
    return row ? { enabled: row.enabled, apiKey: row.apiKey } : null
  }
  const row = await prisma.propertyMcpConfig.findUnique({ where: { propertyId: scope.propertyId } })
  return row ? { enabled: row.enabled, apiKey: row.apiKey } : null
}

export async function upsertMcpConfig(scope: McpScope, enabled: boolean): Promise<McpConfigRecord> {
  if (scope.kind === 'org') {
    const existing = await prisma.orgMcpConfig.findUnique({ where: { organizationId: scope.orgId } })
    const row = await prisma.orgMcpConfig.upsert({
      where: { organizationId: scope.orgId },
      create: { organizationId: scope.orgId, enabled, apiKey: existing?.apiKey ?? randomUUID() },
      update: { enabled },
    })
    return { enabled: row.enabled, apiKey: row.apiKey }
  }
  const existing = await prisma.propertyMcpConfig.findUnique({ where: { propertyId: scope.propertyId } })
  const row = await prisma.propertyMcpConfig.upsert({
    where: { propertyId: scope.propertyId },
    create: { propertyId: scope.propertyId, enabled, apiKey: existing?.apiKey ?? randomUUID() },
    update: { enabled },
  })
  return { enabled: row.enabled, apiKey: row.apiKey }
}

export async function rotateApiKey(scope: McpScope): Promise<McpConfigRecord> {
  const newKey = randomUUID()
  if (scope.kind === 'org') {
    const row = await prisma.orgMcpConfig.upsert({
      where: { organizationId: scope.orgId },
      create: { organizationId: scope.orgId, enabled: false, apiKey: newKey },
      update: { apiKey: newKey },
    })
    return { enabled: row.enabled, apiKey: row.apiKey }
  }
  const row = await prisma.propertyMcpConfig.upsert({
    where: { propertyId: scope.propertyId },
    create: { propertyId: scope.propertyId, enabled: false, apiKey: newKey },
    update: { apiKey: newKey },
  })
  return { enabled: row.enabled, apiKey: row.apiKey }
}

export async function validateApiKey(apiKey: string): Promise<McpScope | null> {
  const [sys, org, prop] = await Promise.all([
    prisma.systemMcpConfig.findFirst({ select: { enabled: true } }),
    prisma.orgMcpConfig.findUnique({ where: { apiKey } }),
    prisma.propertyMcpConfig.findUnique({ where: { apiKey } }),
  ])
  if (sys?.enabled === false) return null
  if (org?.enabled) return { kind: 'org', orgId: org.organizationId }
  if (prop?.enabled) return { kind: 'property', propertyId: prop.propertyId }
  return null
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd apps/api && npm test -- mcp.service
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/mcp.service.ts apps/api/src/services/__tests__/mcp.service.test.ts
git commit -m "feat: add MCP token expiry resolution functions with tests"
```

---

### Task 3: oauth.service.ts — accept expiryDays parameter

**Files:**
- Modify: `apps/api/src/services/oauth.service.ts`

- [ ] **Step 1: Update `signAccessToken` to accept `expiryDays`**

In `apps/api/src/services/oauth.service.ts`, replace the `signAccessToken` function (lines 54–64):

```ts
export async function signAccessToken(adminUserId: number, orgId: number, expiryDays: number | null): Promise<string> {
  const { privateKey, kid } = await getKeyPair()
  let builder = new SignJWT({ org: orgId })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setSubject(`user:${adminUserId}`)
    .setIssuer(getOAuthIssuer())
    .setAudience(getOAuthAudience())
    .setIssuedAt()
  if (expiryDays !== null) builder = builder.setExpirationTime(`${expiryDays}d`)
  return builder.sign(privateKey)
}
```

- [ ] **Step 2: Check for TypeScript errors**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep -i "oauth\|signAccess" | head -20
```

Expected: errors pointing to call sites of `signAccessToken` (the route file hasn't been updated yet). That's fine — you'll fix them in Task 4.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/oauth.service.ts
git commit -m "feat: signAccessToken accepts expiryDays param (null = no exp claim)"
```

---

### Task 4: oauth.route.ts — look up expiry, pass to signAccessToken, update expires_in

**Files:**
- Modify: `apps/api/src/routes/oauth.route.ts`

- [ ] **Step 1: Import `getEffectiveMcpTokenExpiry`**

At the top of `apps/api/src/routes/oauth.route.ts`, add to the existing imports from `mcp.service.js`:

Find the line that imports from `'../services/oauth.service.js'` and add below it (or find existing `mcp.service` import):

```ts
import { getEffectiveMcpTokenExpiry } from '../services/mcp.service.js'
```

- [ ] **Step 2: Update the token endpoint**

Find the block in the `/oauth/token` POST handler that calls `signAccessToken` and returns the response (around line 407–417). Replace it with:

```ts
    let expiryDays: number | null = null
    try {
      expiryDays = await getEffectiveMcpTokenExpiry(entry.orgId)
    } catch {
      logger.warn('[OAuth] Could not fetch token expiry config — defaulting to forever')
    }

    const accessToken = await signAccessToken(entry.adminUserId, entry.orgId, expiryDays)
    logger.info({ adminId: entry.adminUserId, orgId: entry.orgId, clientId }, '[OAuth] Access token issued')

    return reply.send({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiryDays !== null ? expiryDays * 86400 : 2147483647,
      scope: 'openid',
      audience: getOAuthAudience(),
    })
```

- [ ] **Step 3: Verify TypeScript — no errors in oauth.route.ts**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep "oauth.route" | head -10
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
cd apps/api && npm test
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/oauth.route.ts
git commit -m "feat: look up effective MCP token expiry when issuing OAuth tokens"
```

---

### Task 5: admin-mcp.route.ts — PATCH endpoints + extended GET responses

**Files:**
- Modify: `apps/api/src/routes/admin-mcp.route.ts`

- [ ] **Step 1: Add new imports**

At the top of `apps/api/src/routes/admin-mcp.route.ts`, extend the import from `'../services/mcp.service.js'`:

```ts
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
```

- [ ] **Step 2: Extend `GET /admin/ai/mcp` to include expiry for org scope**

Replace the existing `GET /admin/ai/mcp` handler:

```ts
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
```

- [ ] **Step 3: Add `PATCH /admin/ai/mcp/system` for token expiry**

Add after the existing `PUT /admin/ai/mcp/system` handler:

```ts
  // PATCH /admin/ai/mcp/system — update system-level OAuth token expiry (super only)
  fastify.patch('/admin/ai/mcp/system', async (request, reply) => {
    if ((request as any).admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const { oauthTokenExpiryDays } = request.body as { oauthTokenExpiryDays: number | null }
    return reply.send(await setSystemMcpTokenExpiry(oauthTokenExpiryDays))
  })
```

- [ ] **Step 4: Add `PATCH /admin/ai/mcp` for org-level token expiry**

Add after the existing `PUT /admin/ai/mcp` handler:

```ts
  // PATCH /admin/ai/mcp — update org-level OAuth token expiry
  fastify.patch('/admin/ai/mcp', async (request, reply) => {
    const body = request.body as { oauthTokenExpiryDays: number | null; orgId?: number }
    const orgId = (request as any).admin.role === 'super'
      ? (body.orgId ?? (request as any).admin.organizationId)
      : (request as any).admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await setOrgMcpTokenExpiry(orgId, body.oauthTokenExpiryDays))
  })
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep "admin-mcp" | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin-mcp.route.ts
git commit -m "feat: add PATCH endpoints for MCP token expiry; extend GET to include expiry settings"
```

---

### Task 6: api-client.ts — update types and add new methods

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Update `getSystemMcpConfig` return type**

Find this line (around line 1585):
```ts
  getSystemMcpConfig(): Promise<{ enabled: boolean }> {
```

Replace with:
```ts
  getSystemMcpConfig(): Promise<{ enabled: boolean; oauthTokenExpiryDays: number | null }> {
```

- [ ] **Step 2: Update `getOrgMcpConfig` return type**

Find this line (around line 1568):
```ts
  getOrgMcpConfig(orgId?: number): Promise<{ enabled: boolean; apiKey: string | null }> {
```

Replace with:
```ts
  getOrgMcpConfig(orgId?: number): Promise<{ enabled: boolean; apiKey: string | null; oauthTokenExpiryDays: number | null; effectiveTokenExpiryDays: number | null; tokenExpiryInheritedFromSystem: boolean }> {
```

- [ ] **Step 3: Add `updateSystemMcpTokenExpiry` method**

After the `updateSystemMcpConfig` method, add:

```ts
  updateSystemMcpTokenExpiry(oauthTokenExpiryDays: number | null): Promise<{ enabled: boolean; oauthTokenExpiryDays: number | null }> {
    return apiRequest('/api/v1/admin/ai/mcp/system', { method: 'PATCH', body: JSON.stringify({ oauthTokenExpiryDays }) })
  },
```

- [ ] **Step 4: Add `updateOrgMcpTokenExpiry` method**

After `updateSystemMcpTokenExpiry`, add:

```ts
  updateOrgMcpTokenExpiry(oauthTokenExpiryDays: number | null, orgId?: number): Promise<{ oauthTokenExpiryDays: number | null; effectiveTokenExpiryDays: number | null; tokenExpiryInheritedFromSystem: boolean }> {
    return apiRequest('/api/v1/admin/ai/mcp', { method: 'PATCH', body: JSON.stringify({ oauthTokenExpiryDays, ...(orgId !== undefined ? { orgId } : {}) }) })
  },
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "api-client" | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat: update api-client for MCP token expiry — types and new methods"
```

---

### Task 7: page.tsx — token expiry dropdowns in system and org views

**Files:**
- Modify: `apps/web/src/app/admin/ai/mcp/page.tsx`

- [ ] **Step 1: Add the shared dropdown options constant**

Near the top of the file, after the `PLATFORMS` constant, add:

```ts
const TOKEN_EXPIRY_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Forever', value: null },
  { label: '1 year', value: 365 },
  { label: '90 days', value: 90 },
  { label: '30 days', value: 30 },
  { label: '7 days', value: 7 },
  { label: '1 day', value: 1 },
]

function expiryLabel(days: number | null): string {
  return TOKEN_EXPIRY_OPTIONS.find(o => o.value === days)?.label ?? `${days} days`
}
```

- [ ] **Step 2: Update `SystemMcpSection` to handle token expiry**

Replace the entire `SystemMcpSection` function with:

```tsx
function SystemMcpSection() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['system-mcp-config'],
    queryFn: () => apiClient.getSystemMcpConfig(),
  })
  const { mutate: mutateEnabled, isPending: pendingEnabled } = useMutation({
    mutationFn: (enabled: boolean) => apiClient.updateSystemMcpConfig(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-mcp-config'] }),
  })
  const { mutate: mutateExpiry, isPending: pendingExpiry } = useMutation({
    mutationFn: (days: number | null) => apiClient.updateSystemMcpTokenExpiry(days),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-mcp-config'] }),
  })

  if (isLoading) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const enabled = data?.enabled ?? true
  const tokenExpiry = data?.oauthTokenExpiryDays ?? null

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">MCPs — System</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Global on/off switch for MCP across all organisations. Disabling this overrides any org or property setting.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">MCP globally enabled</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              When off, all MCP connections are rejected regardless of org or property settings.
            </p>
          </div>
          <Toggle checked={enabled} onChange={() => mutateEnabled(!enabled)} disabled={pendingEnabled} />
        </div>
        {!enabled && (
          <p className="rounded-lg border border-[var(--color-error)]/40 bg-red-50 px-4 py-2.5 text-xs text-[var(--color-error)]">
            MCP is globally disabled. All API key connections will be rejected.
          </p>
        )}

        <div className="border-t border-[var(--color-border)] pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">OAuth Token Lifetime</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                How long Claude.ai / ChatGPT tokens stay valid before re-authentication. Default is forever.
              </p>
            </div>
            <select
              value={String(tokenExpiry)}
              onChange={e => {
                const val = e.target.value === 'null' ? null : Number(e.target.value)
                mutateExpiry(val)
              }}
              disabled={pendingExpiry}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50"
            >
              {TOKEN_EXPIRY_OPTIONS.map(o => (
                <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add token expiry state and mutation to the org-level section**

In the `AdminMcpPage` component, find the existing state declarations (around line 500) and add after `const [channelModels, setChannelModels] = useState`:

```ts
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null)
```

Find the existing `useEffect` that reads from `mcpData` (around line 506) and extend it:

```ts
  useEffect(() => {
    if (!mcpData) return
    setEnabled(mcpData.enabled)
    setApiKey(mcpData.apiKey)
    if ('oauthTokenExpiryDays' in mcpData) setTokenExpiry(mcpData.oauthTokenExpiryDays)
  }, [mcpData])
```

Add a new mutation after the `rotateClaudeSecret` mutation:

```ts
  const { mutate: updateTokenExpiry, isPending: savingExpiry } = useMutation({
    mutationFn: (days: number | null) =>
      apiClient.updateOrgMcpTokenExpiry(days, superOrgId),
    onSuccess: (res) => {
      setTokenExpiry(res.oauthTokenExpiryDays)
      qc.invalidateQueries({ queryKey: mcpQKey })
    },
  })
```

- [ ] **Step 4: Add the token expiry UI to the org Server config card**

In the org-level return JSX, find the `{/* Server config */}` card (around line 587). Inside that card, after the `ApiKeyDisplay` block (after the `{apiKey ? ... : ...}` block), add:

```tsx
        <div className="border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">OAuth Token Lifetime</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {(mcpData as any)?.tokenExpiryInheritedFromSystem
                  ? `Inherited from system — ${expiryLabel((mcpData as any)?.effectiveTokenExpiryDays ?? null)}`
                  : 'How long Claude.ai / ChatGPT tokens stay valid before re-authentication.'}
              </p>
            </div>
            <select
              value={String(tokenExpiry)}
              onChange={e => {
                const val = e.target.value === 'null' ? null : Number(e.target.value)
                setTokenExpiry(val)
                updateTokenExpiry(val)
              }}
              disabled={savingExpiry}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50"
            >
              {TOKEN_EXPIRY_OPTIONS.map(o => (
                <option key={String(o.value)} value={String(o.value)}>
                  {o.value === null && (mcpData as any)?.tokenExpiryInheritedFromSystem
                    ? `Forever (system default)`
                    : o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "mcp/page" | head -10
```

Expected: no errors.

- [ ] **Step 6: Run all API tests**

```bash
cd apps/api && npm test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/ai/mcp/page.tsx
git commit -m "feat: add OAuth Token Lifetime dropdown to MCP admin UI (system and org levels)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `oauthTokenExpiryDays` added to `SystemMcpConfig` and `OrgMcpConfig` — Task 1
- ✅ System → Org inheritance via `getEffectiveMcpTokenExpiry` — Task 2
- ✅ `signAccessToken` conditionally omits `exp` claim when `null` — Task 3
- ✅ `expires_in: 2147483647` for forever case — Task 4
- ✅ System PATCH endpoint (super admin only) — Task 5
- ✅ Org PATCH endpoint — Task 5
- ✅ GET responses extended with expiry fields — Task 5
- ✅ API client updated — Task 6
- ✅ UI dropdown in `SystemMcpSection` — Task 7
- ✅ UI dropdown in org section with inherited hint — Task 7
- ✅ Error handling: `signAccessToken` call site catches lookup failure and defaults to forever — Task 4
- ✅ Tests for all new service functions — Task 2

**Type consistency:** `OrgMcpTokenExpirySettings` defined in `mcp.service.ts` Task 2, used in Task 5 routes and Task 6 api-client return type — consistent.

**No placeholders found.**
