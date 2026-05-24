# Multi-City Stay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Multi-city trip" mode on the chain's booking page where guests plan sequential stays at chain hotels in different cities, selecting offers per leg and booking each from a Summary tab.

**Architecture:** System→Org config inheritance (no property level). No new search API — each leg reuses the existing search endpoint. All multi-city state lives in `MultiCityPanel` (client component). The Summary tab renders per-leg booking links using existing `encodeSearchParams`.

**Tech Stack:** Fastify, Prisma/PostgreSQL, Next.js 14, React Query v5 (`useQuery`), Vitest, TypeScript, `@ibe/shared` types, `encodeSearchParams`, `CalendarDropdown`, `GuestsDropdown` (existing).

**Spec:** `docs/superpowers/specs/2026-05-24-multi-city-stay-design.md`

**Reference patterns:**
- Config service pattern: `apps/api/src/services/interhotel-config.service.ts` (Task 3)
- Route pattern: `apps/api/src/routes/interhotel.route.ts` (Task 4)
- Admin UI pattern: the InterHotel Stay section in `apps/web/src/app/admin/config/offers/page.tsx` (`IhToggle`, `IhNumberField`)
- Hook pattern: `apps/web/src/hooks/use-public-group-config.ts`

---

## File Map

| File | Action |
|---|---|
| `apps/api/prisma/schema.prisma` | Add 2 models + org relation |
| `apps/api/prisma/migrations/20260524_multicity_config/migration.sql` | Create |
| `packages/shared/src/types/api.ts` | Add 3 interfaces |
| `apps/api/src/services/multicity-config.service.ts` | Create |
| `apps/api/src/services/__tests__/multicity-config.service.test.ts` | Create |
| `apps/api/src/routes/multicity.route.ts` | Create |
| `apps/api/src/app.ts` | Register routes |
| `apps/api/src/translations/en.json` | Add 10 keys |
| `apps/web/src/lib/api-client.ts` | Add 4 methods |
| `apps/web/src/app/admin/config/offers/page.tsx` | Replace Coming Soon with real UI |
| `apps/web/src/components/home/MultiCityPanel.tsx` | Create |
| `apps/web/src/hooks/use-multicity-config.ts` | Create |
| `apps/web/src/components/home/HomePageClient.tsx` | Add multi-city toggle + panel |

---

## Task 1: DB Schema — 2 New Models + Org Relation

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260524_multicity_config/migration.sql`

- [ ] **Step 1: Add 2 models to schema.prisma**

Open `apps/api/prisma/schema.prisma`. Find the `NearbyHotel` model (after the interhotel models). Add these two models immediately after the `NearbyHotel` closing brace:

```prisma
model SystemMultiCityConfig {
  id      Int     @id @default(1)
  enabled Boolean @default(false)
  maxLegs Int     @default(3)
}

model OrgMultiCityConfig {
  organizationId Int          @id
  enabled        Boolean?
  maxLegs        Int?
  org            Organization @relation(fields: [organizationId], references: [id])
}
```

- [ ] **Step 2: Add relation to Organization model**

In the `Organization` model (search for `model Organization {`), add after the existing `orgInterHotelConfig` line:

```prisma
  orgMultiCityConfig          OrgMultiCityConfig?
```

- [ ] **Step 3: Create migration SQL**

Create file `apps/api/prisma/migrations/20260524_multicity_config/migration.sql`:

```sql
CREATE TABLE "SystemMultiCityConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxLegs" INTEGER NOT NULL DEFAULT 3,
    CONSTRAINT "SystemMultiCityConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrgMultiCityConfig" (
    "organizationId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "maxLegs" INTEGER,
    CONSTRAINT "OrgMultiCityConfig_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "OrgMultiCityConfig" ADD CONSTRAINT "OrgMultiCityConfig_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply migration via shadow-DB workaround**

```bash
cd /home/nir/ibe/apps/api
npx prisma db execute --file prisma/migrations/20260524_multicity_config/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260524_multicity_config
npx prisma generate
```

Expected: no errors, client regenerated.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260524_multicity_config/
git commit -m "feat(multi-city): add SystemMultiCityConfig + OrgMultiCityConfig DB models"
```

---

## Task 2: Shared Types

**Files:**
- Modify: `packages/shared/src/types/api.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/multicity-types.test.ts`:

```typescript
import type { MultiCityEffective, SystemMultiCityConfigResponse, OrgMultiCityConfigResponse } from '../types/api'

describe('MultiCity types', () => {
  it('MultiCityEffective has enabled and maxLegs', () => {
    const eff: MultiCityEffective = { enabled: true, maxLegs: 3 }
    expect(eff.enabled).toBe(true)
    expect(eff.maxLegs).toBe(3)
  })

  it('SystemMultiCityConfigResponse extends MultiCityEffective', () => {
    const sys: SystemMultiCityConfigResponse = { enabled: false, maxLegs: 2 }
    expect(sys).toBeDefined()
  })

  it('OrgMultiCityConfigResponse has nullable fields + effective', () => {
    const org: OrgMultiCityConfigResponse = { enabled: null, maxLegs: null, effective: { enabled: false, maxLegs: 3 } }
    expect(org.enabled).toBeNull()
    expect(org.effective.enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/nir/ibe
npx vitest run packages/shared/src/__tests__/multicity-types.test.ts
```

Expected: FAIL (types not defined yet)

- [ ] **Step 3: Add types to api.ts**

In `packages/shared/src/types/api.ts`, find the `InterHotelSearchResponse` interface and add immediately after its closing brace:

```typescript
export interface MultiCityEffective {
  enabled: boolean
  maxLegs: number
}

export interface SystemMultiCityConfigResponse extends MultiCityEffective {}

export interface OrgMultiCityConfigResponse {
  enabled: boolean | null
  maxLegs: number | null
  effective: MultiCityEffective
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/nir/ibe
npx vitest run packages/shared/src/__tests__/multicity-types.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/api.ts packages/shared/src/__tests__/multicity-types.test.ts
git commit -m "feat(multi-city): add MultiCity shared types"
```

---

## Task 3: Config Service (System → Org Inheritance)

**Files:**
- Create: `apps/api/src/services/multicity-config.service.ts`
- Create: `apps/api/src/services/__tests__/multicity-config.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/__tests__/multicity-config.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/client.js'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemMultiCityConfig: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orgMultiCityConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

const mockPrisma = prisma as unknown as {
  systemMultiCityConfig: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  orgMultiCityConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
}

beforeEach(() => { vi.clearAllMocks() })

describe('getSystemMultiCityConfig', () => {
  it('returns defaults when no row exists', async () => {
    mockPrisma.systemMultiCityConfig.findFirst.mockResolvedValue(null)
    const { getSystemMultiCityConfig } = await import('../multicity-config.service.js')
    const result = await getSystemMultiCityConfig()
    expect(result).toEqual({ enabled: false, maxLegs: 3 })
  })

  it('returns stored values', async () => {
    mockPrisma.systemMultiCityConfig.findFirst.mockResolvedValue({ id: 1, enabled: true, maxLegs: 4 })
    const { getSystemMultiCityConfig } = await import('../multicity-config.service.js')
    const result = await getSystemMultiCityConfig()
    expect(result.enabled).toBe(true)
    expect(result.maxLegs).toBe(4)
  })
})

describe('getOrgMultiCityConfig', () => {
  it('uses system defaults when no org row', async () => {
    mockPrisma.systemMultiCityConfig.findFirst.mockResolvedValue({ id: 1, enabled: false, maxLegs: 3 })
    mockPrisma.orgMultiCityConfig.findUnique.mockResolvedValue(null)
    const { getOrgMultiCityConfig } = await import('../multicity-config.service.js')
    const result = await getOrgMultiCityConfig(1)
    expect(result.enabled).toBeNull()
    expect(result.effective.enabled).toBe(false)
    expect(result.effective.maxLegs).toBe(3)
  })

  it('org enabled overrides system', async () => {
    mockPrisma.systemMultiCityConfig.findFirst.mockResolvedValue({ id: 1, enabled: false, maxLegs: 3 })
    mockPrisma.orgMultiCityConfig.findUnique.mockResolvedValue({ organizationId: 1, enabled: true, maxLegs: null })
    const { getOrgMultiCityConfig } = await import('../multicity-config.service.js')
    const result = await getOrgMultiCityConfig(1)
    expect(result.enabled).toBe(true)
    expect(result.effective.enabled).toBe(true)
    expect(result.effective.maxLegs).toBe(3)
  })

  it('resolveEffectiveMultiCityConfig returns enabled:false when system disabled', async () => {
    mockPrisma.systemMultiCityConfig.findFirst.mockResolvedValue({ id: 1, enabled: false, maxLegs: 3 })
    mockPrisma.orgMultiCityConfig.findUnique.mockResolvedValue(null)
    const { resolveEffectiveMultiCityConfig } = await import('../multicity-config.service.js')
    const eff = await resolveEffectiveMultiCityConfig(1)
    expect(eff.enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/nir/ibe/apps/api
npx vitest run src/services/__tests__/multicity-config.service.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/multicity-config.service.ts`:

```typescript
import { prisma } from '../db/client.js'
import type { SystemMultiCityConfigResponse, OrgMultiCityConfigResponse, MultiCityEffective } from '@ibe/shared'

const SYSTEM_DEFAULTS: SystemMultiCityConfigResponse = {
  enabled: false,
  maxLegs: 3,
}

export async function getSystemMultiCityConfig(): Promise<SystemMultiCityConfigResponse> {
  const row = await prisma.systemMultiCityConfig.findFirst()
  if (!row) return SYSTEM_DEFAULTS
  return { enabled: row.enabled, maxLegs: row.maxLegs }
}

export async function upsertSystemMultiCityConfig(
  data: Partial<SystemMultiCityConfigResponse>,
): Promise<SystemMultiCityConfigResponse> {
  const existing = await prisma.systemMultiCityConfig.findFirst()
  const row = existing
    ? await prisma.systemMultiCityConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemMultiCityConfig.create({ data: { ...SYSTEM_DEFAULTS, ...data } })
  return { enabled: row.enabled, maxLegs: row.maxLegs }
}

function resolveOrgEffective(
  system: SystemMultiCityConfigResponse,
  org: { enabled: boolean | null; maxLegs: number | null } | null,
): MultiCityEffective {
  return {
    enabled: org?.enabled ?? system.enabled,
    maxLegs: org?.maxLegs ?? system.maxLegs,
  }
}

export async function getOrgMultiCityConfig(orgId: number): Promise<OrgMultiCityConfigResponse> {
  const [system, org] = await Promise.all([
    getSystemMultiCityConfig(),
    prisma.orgMultiCityConfig.findUnique({ where: { organizationId: orgId } }),
  ])
  return {
    enabled: org?.enabled ?? null,
    maxLegs: org?.maxLegs ?? null,
    effective: resolveOrgEffective(system, org ?? null),
  }
}

export async function upsertOrgMultiCityConfig(
  orgId: number,
  data: Partial<OrgMultiCityConfigResponse>,
): Promise<OrgMultiCityConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.orgMultiCityConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...fields },
    update: fields,
  })
  return getOrgMultiCityConfig(orgId)
}

export async function resolveEffectiveMultiCityConfig(orgId: number): Promise<MultiCityEffective> {
  const cfg = await getOrgMultiCityConfig(orgId)
  return cfg.effective
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/nir/ibe/apps/api
npx vitest run src/services/__tests__/multicity-config.service.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/multicity-config.service.ts apps/api/src/services/__tests__/multicity-config.service.test.ts
git commit -m "feat(multi-city): add config service with System→Org inheritance"
```

---

## Task 4: API Routes

**Files:**
- Create: `apps/api/src/routes/multicity.route.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/__tests__/multicity.route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest'
import Fastify from 'fastify'
import { multiCityPublicRoutes, multiCityAdminRoutes } from '../multicity.route.js'

vi.mock('../../services/multicity-config.service.js', () => ({
  getSystemMultiCityConfig: vi.fn().mockResolvedValue({ enabled: false, maxLegs: 3 }),
  upsertSystemMultiCityConfig: vi.fn().mockImplementation(async (data) => ({ enabled: false, maxLegs: 3, ...data })),
  getOrgMultiCityConfig: vi.fn().mockResolvedValue({ enabled: null, maxLegs: null, effective: { enabled: false, maxLegs: 3 } }),
  upsertOrgMultiCityConfig: vi.fn().mockResolvedValue({ enabled: null, maxLegs: null, effective: { enabled: false, maxLegs: 3 } }),
  resolveEffectiveMultiCityConfig: vi.fn().mockResolvedValue({ enabled: false, maxLegs: 3 }),
}))

let app: ReturnType<typeof Fastify>

beforeAll(async () => {
  app = Fastify()
  await app.register(multiCityPublicRoutes)
  await app.register(multiCityAdminRoutes)
  await app.ready()
})

describe('GET /api/v1/multi-city/config/org/:orgId/effective', () => {
  it('returns effective config', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/multi-city/config/org/1/effective' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body).toHaveProperty('enabled')
    expect(body).toHaveProperty('maxLegs')
  })

  it('returns 400 for invalid orgId', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/multi-city/config/org/abc/effective' })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/v1/admin/multi-city/config/system', () => {
  it('returns system config', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/multi-city/config/system' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toHaveProperty('maxLegs')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/nir/ibe/apps/api
npx vitest run src/routes/__tests__/multicity.route.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement the routes**

Create `apps/api/src/routes/multicity.route.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import {
  getSystemMultiCityConfig,
  upsertSystemMultiCityConfig,
  getOrgMultiCityConfig,
  upsertOrgMultiCityConfig,
  resolveEffectiveMultiCityConfig,
} from '../services/multicity-config.service.js'
import type { OrgMultiCityConfigResponse, SystemMultiCityConfigResponse } from '@ibe/shared'

export async function multiCityPublicRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { orgId: string } }>(
    '/api/v1/multi-city/config/org/:orgId/effective',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return resolveEffectiveMultiCityConfig(orgId)
    },
  )
}

export async function multiCityAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/admin/multi-city/config/system', async () => {
    return getSystemMultiCityConfig()
  })

  fastify.put('/api/v1/admin/multi-city/config/system', async (request) => {
    return upsertSystemMultiCityConfig(request.body as Partial<SystemMultiCityConfigResponse>)
  })

  fastify.get<{ Params: { orgId: string } }>(
    '/api/v1/admin/multi-city/config/org/:orgId',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return getOrgMultiCityConfig(orgId)
    },
  )

  fastify.put<{ Params: { orgId: string } }>(
    '/api/v1/admin/multi-city/config/org/:orgId',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return upsertOrgMultiCityConfig(orgId, request.body as Partial<OrgMultiCityConfigResponse>)
    },
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/nir/ibe/apps/api
npx vitest run src/routes/__tests__/multicity.route.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/multicity.route.ts apps/api/src/routes/__tests__/multicity.route.test.ts
git commit -m "feat(multi-city): add public + admin API routes"
```

---

## Task 5: Register Routes in app.ts

**Files:**
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Add import**

In `apps/api/src/app.ts`, find the import line for `interHotelPublicRoutes` and add after it:

```typescript
import { multiCityPublicRoutes, multiCityAdminRoutes } from './routes/multicity.route.js'
```

- [ ] **Step 2: Register public routes**

In `app.ts`, find where `interHotelPublicRoutes` is registered (no prefix). Add immediately after it:

```typescript
  await app.register(multiCityPublicRoutes)
```

- [ ] **Step 3: Register admin routes**

Find where `interHotelAdminRoutes` is registered. Add immediately after it:

```typescript
  await app.register(multiCityAdminRoutes)
```

- [ ] **Step 4: Build and verify**

```bash
cd /home/nir/ibe/apps/api
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(multi-city): register multicity routes in app"
```

---

## Task 6: Translation Keys + API Client

**Files:**
- Modify: `apps/api/src/translations/en.json`
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add translation keys**

In `apps/api/src/translations/en.json`, find the `"interHotelFrom"` entry (the last interhotel key). Add after it, inside the `"search"` section:

```json
"multiCityTrip": "Multi-city Trip",
"multiCityAddCity": "Add city",
"multiCityRemoveCity": "Remove",
"multiCityLeg": "City {n}",
"multiCitySummary": "Summary",
"multiCitySelectHotel": "Select hotel",
"multiCityBook": "Book this leg",
"multiCityEmpty": "Select your stays for each city, then review the summary here.",
"multiCitySelectCity": "Select city",
"multiCitySearchResults": "Available rooms"
```

- [ ] **Step 2: Add API client methods**

In `apps/web/src/lib/api-client.ts`, find the `getInterHotelConfig` method (or last interhotel method). Add these 4 methods after the interhotel methods:

```typescript
async getOrgMultiCityEffective(orgId: number): Promise<import('@ibe/shared').MultiCityEffective> {
  return this.request(`/api/v1/multi-city/config/org/${orgId}/effective`)
},

async getSystemMultiCityConfig(): Promise<import('@ibe/shared').SystemMultiCityConfigResponse> {
  return this.request('/api/v1/admin/multi-city/config/system')
},

async updateSystemMultiCityConfig(data: Partial<import('@ibe/shared').SystemMultiCityConfigResponse>): Promise<import('@ibe/shared').SystemMultiCityConfigResponse> {
  return this.request('/api/v1/admin/multi-city/config/system', { method: 'PUT', body: JSON.stringify(data) })
},

async getOrgMultiCityConfig(orgId: number): Promise<import('@ibe/shared').OrgMultiCityConfigResponse> {
  return this.request(`/api/v1/admin/multi-city/config/org/${orgId}`)
},

async updateOrgMultiCityConfig(orgId: number, data: Partial<import('@ibe/shared').OrgMultiCityConfigResponse>): Promise<import('@ibe/shared').OrgMultiCityConfigResponse> {
  return this.request(`/api/v1/admin/multi-city/config/org/${orgId}`, { method: 'PUT', body: JSON.stringify(data) })
},
```

- [ ] **Step 3: Verify no TS errors**

```bash
cd /home/nir/ibe/apps/web
npx tsc --noEmit 2>&1 | grep -i "multicity\|multi-city\|MultiCity" | head -20
```

Expected: no errors related to new methods.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/translations/en.json apps/web/src/lib/api-client.ts
git commit -m "feat(multi-city): add translation keys and API client methods"
```

---

## Task 7: Admin UI — Multi-city Tab

**Files:**
- Modify: `apps/web/src/app/admin/config/offers/page.tsx`

Context: The file already has a `ComingSoonCard` rendered for `activeTab === 'multi-city'`. We replace it with real System and Org config sections using the existing `IhToggle` and `IhNumberField` helper components (same pattern as `SystemInterHotelSection` / `OrgInterHotelSection`).

Also need: state for system + org multi-city data, fetch queries, save handlers.

- [ ] **Step 1: Write the section component**

In `apps/web/src/app/admin/config/offers/page.tsx`, find the `ComingSoonCard` component (around line 672). Add these component definitions **before** it:

```tsx
// ── Multi-city Stay Admin Sections ────────────────────────────────────────────

function SystemMultiCitySection() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-multicity-system'],
    queryFn: () => apiClient.getSystemMultiCityConfig(),
  })
  const [saving, setSaving] = useState(false)

  async function save(patch: Partial<{ enabled: boolean; maxLegs: number }>) {
    setSaving(true)
    try { await apiClient.updateSystemMultiCityConfig(patch); await refetch() }
    finally { setSaving(false) }
  }

  if (isLoading) return <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
  if (!data) return null

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="mb-4 text-sm font-semibold text-[var(--color-text)]">System Defaults</h3>
      <IhToggle label="Enable Multi-city" checked={data.enabled} onChange={v => save({ enabled: v })} />
      <IhNumberField label="Max city legs" value={data.maxLegs} min={2} max={6}
        onChange={v => save({ maxLegs: v })} saving={saving} />
    </div>
  )
}

function OrgMultiCitySection({ orgId }: { orgId: number }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-multicity-org', orgId],
    queryFn: () => apiClient.getOrgMultiCityConfig(orgId),
  })
  const [saving, setSaving] = useState(false)

  async function save(patch: Partial<{ enabled: boolean | null; maxLegs: number | null }>) {
    setSaving(true)
    try { await apiClient.updateOrgMultiCityConfig(orgId, patch); await refetch() }
    finally { setSaving(false) }
  }

  if (isLoading) return <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
  if (!data) return null

  const eff = data.effective

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="mb-4 text-sm font-semibold text-[var(--color-text)]">Organization Override</h3>
      <IhToggle label="Enable Multi-city" checked={data.enabled} inherited={eff.enabled}
        onChange={v => save({ enabled: v })}
        onReset={() => save({ enabled: null })} />
      <IhNumberField label="Max city legs" value={data.maxLegs ?? eff.maxLegs} min={2} max={6}
        onChange={v => save({ maxLegs: v })} saving={saving} />
      {data.maxLegs !== null && (
        <button type="button" onClick={() => save({ maxLegs: null })}
          className="mt-1 text-xs text-[var(--color-primary)] underline">
          Reset to inherited ({eff.maxLegs})
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Replace ComingSoonCard rendering for multi-city**

Find the block:
```tsx
      {activeTab === 'multi-city' && (
        <ComingSoonCard tab={activeTab} />
```

Replace with:
```tsx
      {activeTab === 'multi-city' && (
        <div className="space-y-6">
          <SystemMultiCitySection />
          {adminMe?.orgId && <OrgMultiCitySection orgId={adminMe.orgId} />}
        </div>
```

- [ ] **Step 3: Verify no TS errors**

```bash
cd /home/nir/ibe/apps/web
npx tsc --noEmit 2>&1 | grep "offers\|MultiCity\|multicity" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/config/offers/page.tsx
git commit -m "feat(multi-city): replace Coming Soon with real admin config UI"
```

---

## Task 8: useMultiCityConfig Hook

**Files:**
- Create: `apps/web/src/hooks/use-multicity-config.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/__tests__/use-multicity-config.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useMultiCityConfig } from '../use-multicity-config'

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getOrgMultiCityEffective: vi.fn().mockResolvedValue({ enabled: true, maxLegs: 3 }),
  },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useMultiCityConfig', () => {
  it('returns null data when orgId is null', () => {
    const { result } = renderHook(() => useMultiCityConfig(null), { wrapper })
    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
  })

  it('fetches config when orgId is provided', async () => {
    const { result } = renderHook(() => useMultiCityConfig(5), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.enabled).toBe(true)
    expect(result.current.data?.maxLegs).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/nir/ibe/apps/web
npx vitest run src/hooks/__tests__/use-multicity-config.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement the hook**

Create `apps/web/src/hooks/use-multicity-config.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export function useMultiCityConfig(orgId: number | null) {
  return useQuery({
    queryKey: ['multi-city-config', orgId],
    queryFn: () => apiClient.getOrgMultiCityEffective(orgId!),
    enabled: orgId != null,
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/nir/ibe/apps/web
npx vitest run src/hooks/__tests__/use-multicity-config.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-multicity-config.ts apps/web/src/hooks/__tests__/use-multicity-config.test.ts
git commit -m "feat(multi-city): add useMultiCityConfig hook"
```

---

## Task 9: MultiCityPanel Component

**Files:**
- Create: `apps/web/src/components/home/MultiCityPanel.tsx`

This is the core UI component. It manages an array of city legs, renders tabs (one per leg + Summary), and triggers per-leg searches via `useQuery`. When "Select" is clicked on a room/rate, it stores the selection and marks the tab. The Summary tab shows all selections with "Book" links.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/home/__tests__/MultiCityPanel.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { MultiCityPanel } from '../MultiCityPanel'
import type { PropertyOption } from '@/components/search/SearchBar'

vi.mock('@/context/translations', () => ({
  useT: () => (key: string) => key,
  useLocale: () => 'en',
}))
vi.mock('@/lib/api-client', () => ({
  apiClient: { search: vi.fn().mockResolvedValue({ rooms: [] }) },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const properties: PropertyOption[] = [
  { id: 1, name: 'Hotel A', city: 'Paris', isDefault: true },
  { id: 2, name: 'Hotel B', city: 'Lyon' },
  { id: 3, name: 'Hotel C', city: 'Lyon' },
]

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('MultiCityPanel', () => {
  it('renders initial leg tab and Summary tab', () => {
    render(createElement(MultiCityPanel, {
      properties,
      maxLegs: 3,
      infantMaxAge: 2,
      childMaxAge: 16,
    }), { wrapper })
    expect(screen.getByText('City 1')).toBeDefined()
    expect(screen.getByText('multiCitySummary')).toBeDefined()
  })

  it('shows Add city button when below maxLegs', () => {
    render(createElement(MultiCityPanel, {
      properties,
      maxLegs: 3,
      infantMaxAge: 2,
      childMaxAge: 16,
    }), { wrapper })
    expect(screen.getByText('multiCityAddCity')).toBeDefined()
  })

  it('adds a second leg when Add city is clicked', () => {
    render(createElement(MultiCityPanel, {
      properties,
      maxLegs: 3,
      infantMaxAge: 2,
      childMaxAge: 16,
    }), { wrapper })
    fireEvent.click(screen.getByText('multiCityAddCity'))
    expect(screen.getByText('City 2')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/nir/ibe/apps/web
npx vitest run src/components/home/__tests__/MultiCityPanel.test.tsx
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement MultiCityPanel**

Create `apps/web/src/components/home/MultiCityPanel.tsx`:

```tsx
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { addDays, todayIso } from '@ibe/shared'
import { encodeSearchParams } from '@/lib/search-params'
import { displayDate } from '@/lib/calendar-utils'
import { useT, useLocale } from '@/context/translations'
import { CalendarDropdown } from '@/components/search/CalendarDropdown'
import { GuestsDropdown, type GuestRoom } from '@/components/search/GuestsDropdown'
import { apiClient } from '@/lib/api-client'
import type { PropertyOption } from '@/components/search/SearchBar'
import type { RoomAvailability } from '@ibe/shared'

type MultiCitySelectedOffer = {
  roomId: string
  roomName: string
  rateId: string
  rateName: string
  fromPrice: number
  currency: string
}

type MultiCityLeg = {
  id: string
  city: string
  propertyId: number | null
  checkIn: string
  checkOut: string
  rooms: GuestRoom[]
  searched: boolean
  selectedOffer: MultiCitySelectedOffer | null
}

type ActiveTab = number | 'summary'

function makeId() {
  return Math.random().toString(36).slice(2, 9)
}

function makeLeg(n: number): MultiCityLeg {
  const checkIn = addDays(todayIso(), 1)
  return {
    id: makeId(),
    city: '',
    propertyId: null,
    checkIn,
    checkOut: addDays(checkIn, 2),
    rooms: [{ adults: 2, children: 0, infants: 0 }],
    searched: false,
    selectedOffer: null,
  }
}

interface MultiCityPanelProps {
  properties: PropertyOption[]
  maxLegs: number
  infantMaxAge: number
  childMaxAge: number
}

export function MultiCityPanel({ properties, maxLegs, infantMaxAge, childMaxAge }: MultiCityPanelProps) {
  const t = useT('search')
  const [legs, setLegs] = useState<MultiCityLeg[]>([makeLeg(1)])
  const [activeTab, setActiveTab] = useState<ActiveTab>(0)

  const cities = [...new Set(properties.map(p => p.city ?? '').filter(Boolean))].sort()

  function addLeg() {
    if (legs.length >= maxLegs) return
    setLegs(prev => [...prev, makeLeg(prev.length + 1)])
    setActiveTab(legs.length)
  }

  function removeLeg(idx: number) {
    setLegs(prev => prev.filter((_, i) => i !== idx))
    setActiveTab(Math.max(0, idx - 1))
  }

  function updateLeg(idx: number, patch: Partial<MultiCityLeg>) {
    setLegs(prev => prev.map((leg, i) => i === idx ? { ...leg, ...patch, searched: false, selectedOffer: null } : leg))
  }

  function selectOffer(idx: number, offer: MultiCitySelectedOffer) {
    setLegs(prev => prev.map((leg, i) => i === idx ? { ...leg, selectedOffer: offer } : leg))
    if (idx < legs.length - 1) setActiveTab(idx + 1)
    else setActiveTab('summary')
  }

  return (
    <div className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-[var(--color-border)] overflow-x-auto">
        {legs.map((leg, idx) => (
          <button
            key={leg.id}
            type="button"
            onClick={() => setActiveTab(idx)}
            className={[
              'px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2',
              activeTab === idx
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            ].join(' ')}
          >
            {leg.city || t('multiCityLeg').replace('{n}', String(idx + 1))}
            {leg.selectedOffer && <span className="ml-1 text-green-500">✓</span>}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={[
            'px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2',
            activeTab === 'summary'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          ].join(' ')}
        >
          {t('multiCitySummary')}
        </button>
        {legs.length < maxLegs && (
          <button
            type="button"
            onClick={addLeg}
            className="ml-auto mr-3 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] whitespace-nowrap"
          >
            + {t('multiCityAddCity')}
          </button>
        )}
      </div>

      {/* Leg tabs */}
      {typeof activeTab === 'number' && legs[activeTab] && (
        <MultiCityLegForm
          leg={legs[activeTab]}
          legIndex={activeTab}
          cities={cities}
          properties={properties}
          canRemove={legs.length > 1}
          infantMaxAge={infantMaxAge}
          childMaxAge={childMaxAge}
          onUpdate={patch => updateLeg(activeTab, patch)}
          onRemove={() => removeLeg(activeTab)}
          onSelectOffer={offer => selectOffer(activeTab, offer)}
        />
      )}

      {/* Summary tab */}
      {activeTab === 'summary' && (
        <MultiCitySummary legs={legs} />
      )}
    </div>
  )
}

interface MultiCityLegFormProps {
  leg: MultiCityLeg
  legIndex: number
  cities: string[]
  properties: PropertyOption[]
  canRemove: boolean
  infantMaxAge: number
  childMaxAge: number
  onUpdate: (patch: Partial<MultiCityLeg>) => void
  onRemove: () => void
  onSelectOffer: (offer: MultiCitySelectedOffer) => void
}

function MultiCityLegForm({
  leg, legIndex, cities, properties, canRemove,
  infantMaxAge, childMaxAge, onUpdate, onRemove, onSelectOffer,
}: MultiCityLegFormProps) {
  const t = useT('search')
  const locale = useLocale()
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const cityProperties = properties.filter(p => p.city === leg.city)

  const searchEnabled = !!(leg.propertyId && leg.checkIn && leg.checkOut && hasSearched)
  const { data: searchResult, isLoading: searchLoading } = useQuery({
    queryKey: ['multicity-leg-search', leg.propertyId, leg.checkIn, leg.checkOut, JSON.stringify(leg.rooms)],
    queryFn: async () => {
      const rooms = leg.rooms.map(r => ({
        adults: r.adults,
        ...(r.children > 0 ? { childAges: Array(r.children).fill(Math.round((infantMaxAge + childMaxAge) / 2)) } : {}),
      }))
      return apiClient.search({
        hotelId: leg.propertyId!,
        checkIn: leg.checkIn,
        checkOut: leg.checkOut,
        rooms,
      })
    },
    enabled: searchEnabled,
    staleTime: 5 * 60 * 1000,
  })

  function handleSearch() {
    if (!leg.propertyId || !leg.checkIn || !leg.checkOut) return
    setHasSearched(true)
  }

  return (
    <div className="p-6 space-y-4">
      {/* City + Hotel row */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('multiCitySelectCity')}</label>
          <select
            value={leg.city}
            onChange={e => onUpdate({ city: e.target.value, propertyId: null })}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)]"
          >
            <option value="">{t('multiCitySelectCity')}</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {leg.city && (
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('multiCitySelectHotel')}</label>
            <select
              value={leg.propertyId ?? ''}
              onChange={e => onUpdate({ propertyId: Number(e.target.value) || null })}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)]"
            >
              <option value="">{t('multiCitySelectHotel')}</option>
              {cityProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Dates + Guests row */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-[200px]">
          <CalendarDropdown
            checkIn={leg.checkIn}
            checkOut={leg.checkOut}
            onChange={(ci, co) => onUpdate({ checkIn: ci, checkOut: co })}
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <GuestsDropdown
            rooms={leg.rooms}
            infantMaxAge={infantMaxAge}
            childMaxAge={childMaxAge}
            onChange={rooms => onUpdate({ rooms })}
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={!leg.propertyId}
          className="px-6 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-40"
        >
          Search
        </button>
      </div>

      {/* Remove leg */}
      {canRemove && (
        <button type="button" onClick={onRemove}
          className="text-xs text-red-500 hover:underline">
          {t('multiCityRemoveCity')}
        </button>
      )}

      {/* Search results */}
      {searchEnabled && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">{t('multiCitySearchResults')}</p>
          {searchLoading && (
            <p className="text-sm text-[var(--color-text-muted)]">Searching…</p>
          )}
          {!searchLoading && searchResult && (searchResult as { rooms?: RoomAvailability[] }).rooms?.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">No rooms available for these dates.</p>
          )}
          {!searchLoading && (searchResult as { rooms?: RoomAvailability[] })?.rooms?.map((room: RoomAvailability) => (
            room.rates?.map(rate => (
              <div key={`${room.roomId}-${rate.rateId}`}
                className="flex items-center justify-between rounded-lg border border-[var(--color-border)] p-3 mb-2 bg-[var(--color-background)]">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{room.roomName}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{rate.rateName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    {rate.currency} {rate.fromPrice?.toFixed(0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectOffer({
                      roomId: room.roomId,
                      roomName: room.roomName,
                      rateId: rate.rateId,
                      rateName: rate.rateName,
                      fromPrice: rate.fromPrice ?? 0,
                      currency: rate.currency,
                    })}
                    className="px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium"
                  >
                    Select
                  </button>
                </div>
              </div>
            ))
          ))}
        </div>
      )}

      {/* Current selection */}
      {leg.selectedOffer && (
        <div className="mt-2 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          ✓ Selected: {leg.selectedOffer.roomName} — {leg.selectedOffer.currency} {leg.selectedOffer.fromPrice.toFixed(0)}
        </div>
      )}
    </div>
  )
}

function MultiCitySummary({ legs }: { legs: MultiCityLeg[] }) {
  const t = useT('search')
  const router = useRouter()
  const locale = useLocale()

  const hasAnySelection = legs.some(l => l.selectedOffer)

  if (!hasAnySelection) {
    return (
      <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">
        {t('multiCityEmpty')}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {legs.map((leg, idx) => (
        <div key={leg.id} className="rounded-lg border border-[var(--color-border)] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-[var(--color-text-muted)] mb-1">
                {t('multiCityLeg').replace('{n}', String(idx + 1))} · {leg.city}
              </p>
              <p className="text-sm font-medium text-[var(--color-text)]">
                {displayDate(leg.checkIn, locale)} → {displayDate(leg.checkOut, locale)}
              </p>
              {leg.selectedOffer ? (
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  {leg.selectedOffer.roomName} · {leg.selectedOffer.currency} {leg.selectedOffer.fromPrice.toFixed(0)}
                </p>
              ) : (
                <p className="text-sm text-amber-600 mt-1">No offer selected yet</p>
              )}
            </div>
            {leg.selectedOffer && leg.propertyId && (
              <button
                type="button"
                onClick={() => {
                  const qs = encodeSearchParams({
                    hotelId: leg.propertyId!,
                    checkIn: leg.checkIn,
                    checkOut: leg.checkOut,
                    rooms: leg.rooms.map(r => ({
                      adults: r.adults,
                      ...(r.children > 0 ? { childAges: Array(r.children).fill(8) } : {}),
                    })),
                  })
                  router.push(`/search?${qs.toString()}`)
                }}
                className="shrink-0 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium"
              >
                {t('multiCityBook')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/nir/ibe/apps/web
npx vitest run src/components/home/__tests__/MultiCityPanel.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 5: Verify no TS errors**

```bash
cd /home/nir/ibe/apps/web
npx tsc --noEmit 2>&1 | grep "MultiCityPanel\|multicity" | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/home/MultiCityPanel.tsx apps/web/src/components/home/__tests__/MultiCityPanel.test.tsx
git commit -m "feat(multi-city): add MultiCityPanel component with leg tabs + summary"
```

---

## Task 10: HomePageClient Integration

**Files:**
- Modify: `apps/web/src/components/home/HomePageClient.tsx`

This is the last task. We add a `useMultiCityConfig` call, check eligibility (org + multiCities > 1 + enabled), and render a "Multi-city trip" toggle. When toggled on, replace the `SearchBar` with `MultiCityPanel`.

- [ ] **Step 1: Read the current HomePageClient**

Read `apps/web/src/components/home/HomePageClient.tsx` to understand its props interface, where `SearchBar` is rendered, and how `multiCities` is already computed. Identify the exact block to modify.

- [ ] **Step 2: Add imports**

At the top of `HomePageClient.tsx`, add:

```tsx
import { useMultiCityConfig } from '@/hooks/use-multicity-config'
import { MultiCityPanel } from './MultiCityPanel'
```

And add `useState` to the existing React import if not already present.

- [ ] **Step 3: Add multi-city state and config fetch**

Inside the `HomePageClient` function body, find where `const tProps = useT('properties')` is (or any hook call near the top of the component). Add after it:

```tsx
const orgId = searchBarProps.orgId ?? null
const { data: multiCityConfig } = useMultiCityConfig(orgId)
const multiCityEligible = !!orgId && multiCities > 1 && multiCityConfig?.enabled === true
const [multiCityMode, setMultiCityMode] = useState(false)
```

- [ ] **Step 4: Add toggle and conditionally render MultiCityPanel**

Find where `<SearchBar ... />` is rendered in `HomePageClient.tsx`. It's rendered inside a form/section for the hero area. Wrap that section so that:

1. When `multiCityEligible`, render a toggle checkbox above the SearchBar:
```tsx
{multiCityEligible && (
  <div className="flex items-center gap-2 mb-3">
    <button
      type="button"
      role="switch"
      aria-checked={multiCityMode}
      onClick={() => setMultiCityMode(v => !v)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        multiCityMode ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
      ].join(' ')}
    >
      <span className={[
        'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform',
        multiCityMode ? 'translate-x-4' : 'translate-x-0',
      ].join(' ')} />
    </button>
    <span className="text-sm text-[var(--color-text)]">{tSearch('multiCityTrip')}</span>
  </div>
)}
```

2. When `multiCityMode`, render `MultiCityPanel` instead of `SearchBar`:
```tsx
{multiCityMode && multiCityEligible ? (
  <MultiCityPanel
    properties={searchBarProps.properties ?? []}
    maxLegs={multiCityConfig!.maxLegs}
    infantMaxAge={searchBarProps.infantMaxAge ?? 2}
    childMaxAge={searchBarProps.childMaxAge ?? 16}
  />
) : (
  <SearchBar ... />  {/* existing SearchBar rendering */}
)}
```

Note: you need `const tSearch = useT('search')` if not already available, or use the existing `t` function with the right namespace.

- [ ] **Step 5: Verify no TS errors**

```bash
cd /home/nir/ibe/apps/web
npx tsc --noEmit 2>&1 | grep "HomePageClient\|MultiCity\|multiCity" | head -20
```

Expected: no errors.

- [ ] **Step 6: Build the project**

```bash
cd /home/nir/ibe/apps/api
npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/home/HomePageClient.tsx
git commit -m "feat(multi-city): integrate MultiCityPanel into chain homepage"
```
