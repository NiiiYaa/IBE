# Flexible Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a primary hotel search returns zero rooms, automatically fan out searches for nearby date windows (±N configurable days) and show collapsible alternative-date results below a "no availability" message.

**Architecture:** Three-tier config (System→Org→Property) stored in Prisma, resolved via a service mirroring the pricing-config pattern. A public API endpoint returns the resolved config to the frontend. The search page uses a new `useFlexibleDateSearch` hook (React Query `useQueries`) to run one parallel search per date-delta when the primary has no results.

**Tech Stack:** Prisma (SQLite/Postgres), Fastify, React Query v5 (`useQueries`), Next.js 14 Client Components, TypeScript

---

## File Map

**New files:**
- `apps/api/prisma/migrations/<timestamp>_flexible_dates_config/migration.sql`
- `apps/api/src/services/flexible-dates-config.service.ts`
- `apps/api/src/services/__tests__/flexible-dates-config.service.test.ts`
- `apps/api/src/routes/flexible-dates.route.ts`
- `apps/web/src/hooks/use-flexible-date-search.ts`

**Modified files:**
- `apps/api/prisma/schema.prisma` — 3 new models + relations on Organization + Property
- `packages/shared/src/types/api.ts` — 4 new interfaces
- `apps/api/src/app.ts` — import + register 2 new route functions
- `apps/web/src/lib/api-client.ts` — 6 new API client methods
- `apps/web/src/app/admin/config/offers/page.tsx` — tab bar + Flexible Dates tab UI
- `apps/web/src/app/(main)/search/_content.tsx` — flex config query + hook call + no-rooms block replacement
- `apps/api/src/translations/en.json` — 6 new keys under `"search"`

---

## Task 1: Prisma Schema — 3 New Models + Relations

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add models to schema.prisma**

Open `apps/api/prisma/schema.prisma`. After the `PropertyPricingConfig` model (around line 1868), add:

```prisma
model SystemFlexibleDatesConfig {
  id         Int     @id @default(1)
  enabled    Boolean @default(false)
  daysBefore Int     @default(1)
  daysAfter  Int     @default(1)
}

model OrgFlexibleDatesConfig {
  orgId      Int          @id
  enabled    Boolean?
  daysBefore Int?
  daysAfter  Int?
  org        Organization @relation(fields: [orgId], references: [id])
}

model PropertyFlexibleDatesConfig {
  propertyId Int      @id
  enabled    Boolean?
  daysBefore Int?
  daysAfter  Int?
  property   Property @relation(fields: [propertyId], references: [propertyId])
}
```

- [ ] **Step 2: Add relation to Organization model**

In the `Organization` model (around line 15), after the `orgPricingConfig` line, add:

```prisma
  orgFlexibleDatesConfig      OrgFlexibleDatesConfig?
```

- [ ] **Step 3: Add relation to Property model**

In the `Property` model (around line 442), after the `propertyPricingConfig` line, add:

```prisma
  propertyFlexibleDatesConfig PropertyFlexibleDatesConfig?
```

- [ ] **Step 4: Run migration**

```bash
cd apps/api && npx prisma migrate dev --name flexible_dates_config
```

Expected: Migration created and applied. If it asks for a name, enter `flexible_dates_config`.

- [ ] **Step 5: Verify generated client**

```bash
cd apps/api && npx prisma generate
```

Expected: Prisma client regenerated without errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): add SystemFlexibleDatesConfig, OrgFlexibleDatesConfig, PropertyFlexibleDatesConfig models"
```

---

## Task 2: Shared Types

**Files:**
- Modify: `packages/shared/src/types/api.ts`

- [ ] **Step 1: Write the failing test (type-level check)**

The test is the TypeScript compiler — after adding the interfaces, ensure the build passes in Task 4.

- [ ] **Step 2: Add 4 new interfaces to `packages/shared/src/types/api.ts`**

After the `PropertyPricingConfigResponse` interface (around line 395), add:

```ts
// ── Flexible Dates Config ─────────────────────────────────────────────────────

export interface FlexibleDatesEffective {
  enabled: boolean
  daysBefore: number
  daysAfter: number
}

export interface SystemFlexibleDatesConfigResponse extends FlexibleDatesEffective {}

export interface OrgFlexibleDatesConfigResponse {
  enabled: boolean | null
  daysBefore: number | null
  daysAfter: number | null
  effective: FlexibleDatesEffective
}

export interface PropertyFlexibleDatesConfigResponse {
  enabled: boolean | null
  daysBefore: number | null
  daysAfter: number | null
  effective: FlexibleDatesEffective
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/api.ts
git commit -m "feat(shared): add FlexibleDates config types"
```

---

## Task 3: Service + Tests

**Files:**
- Create: `apps/api/src/services/flexible-dates-config.service.ts`
- Create: `apps/api/src/services/__tests__/flexible-dates-config.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/__tests__/flexible-dates-config.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/client.js'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemFlexibleDatesConfig: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orgFlexibleDatesConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyFlexibleDatesConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

const mockPrisma = prisma as unknown as {
  systemFlexibleDatesConfig: {
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  orgFlexibleDatesConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  propertyFlexibleDatesConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
}

const SYSTEM_ROW = { id: 1, enabled: true, daysBefore: 2, daysAfter: 2 }

describe('resolveEffectiveFlexibleDatesConfig', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns system defaults when no overrides exist', async () => {
    mockPrisma.systemFlexibleDatesConfig.findFirst.mockResolvedValue(null)
    mockPrisma.propertyFlexibleDatesConfig.findUnique.mockResolvedValue(null)
    mockPrisma.orgFlexibleDatesConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectiveFlexibleDatesConfig } = await import('../flexible-dates-config.service.js')
    const result = await resolveEffectiveFlexibleDatesConfig(1)

    expect(result.enabled).toBe(false)
    expect(result.daysBefore).toBe(1)
    expect(result.daysAfter).toBe(1)
  })

  it('applies system row values when present', async () => {
    mockPrisma.systemFlexibleDatesConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyFlexibleDatesConfig.findUnique.mockResolvedValue(null)
    mockPrisma.orgFlexibleDatesConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectiveFlexibleDatesConfig } = await import('../flexible-dates-config.service.js')
    const result = await resolveEffectiveFlexibleDatesConfig(1)

    expect(result.enabled).toBe(true)
    expect(result.daysBefore).toBe(2)
    expect(result.daysAfter).toBe(2)
  })

  it('applies org override over system', async () => {
    mockPrisma.systemFlexibleDatesConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyFlexibleDatesConfig.findUnique.mockResolvedValue({
      propertyId: 1, enabled: null, daysBefore: null, daysAfter: null,
      property: { organizationId: 10 },
    })
    mockPrisma.orgFlexibleDatesConfig.findUnique.mockResolvedValue({
      orgId: 10, enabled: null, daysBefore: 3, daysAfter: null,
    })

    const { resolveEffectiveFlexibleDatesConfig } = await import('../flexible-dates-config.service.js')
    const result = await resolveEffectiveFlexibleDatesConfig(1)

    expect(result.daysBefore).toBe(3) // org override
    expect(result.daysAfter).toBe(2)  // falls back to system
  })

  it('applies property override over org and system', async () => {
    mockPrisma.systemFlexibleDatesConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyFlexibleDatesConfig.findUnique.mockResolvedValue({
      propertyId: 1, enabled: true, daysBefore: 1, daysAfter: null,
      property: { organizationId: 10 },
    })
    mockPrisma.orgFlexibleDatesConfig.findUnique.mockResolvedValue({
      orgId: 10, enabled: false, daysBefore: 3, daysAfter: 3,
    })

    const { resolveEffectiveFlexibleDatesConfig } = await import('../flexible-dates-config.service.js')
    const result = await resolveEffectiveFlexibleDatesConfig(1)

    expect(result.enabled).toBe(true)   // property override
    expect(result.daysBefore).toBe(1)   // property override
    expect(result.daysAfter).toBe(3)    // org override (property has null)
  })

  it('returns enabled=false when system is disabled and no overrides', async () => {
    mockPrisma.systemFlexibleDatesConfig.findFirst.mockResolvedValue({ ...SYSTEM_ROW, enabled: false })
    mockPrisma.propertyFlexibleDatesConfig.findUnique.mockResolvedValue(null)
    mockPrisma.orgFlexibleDatesConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectiveFlexibleDatesConfig } = await import('../flexible-dates-config.service.js')
    const result = await resolveEffectiveFlexibleDatesConfig(1)

    expect(result.enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/__tests__/flexible-dates-config.service.test.ts
```

Expected: FAIL — `flexible-dates-config.service.js` not found.

- [ ] **Step 3: Create the service**

Create `apps/api/src/services/flexible-dates-config.service.ts`:

```ts
import { prisma } from '../db/client.js'
import type {
  FlexibleDatesEffective,
  SystemFlexibleDatesConfigResponse,
  OrgFlexibleDatesConfigResponse,
  PropertyFlexibleDatesConfigResponse,
} from '@ibe/shared'

const SYSTEM_DEFAULTS: FlexibleDatesEffective = {
  enabled: false,
  daysBefore: 1,
  daysAfter: 1,
}

export async function getSystemFlexibleDatesConfig(): Promise<SystemFlexibleDatesConfigResponse> {
  const row = await prisma.systemFlexibleDatesConfig.findFirst()
  return row ? { enabled: row.enabled, daysBefore: row.daysBefore, daysAfter: row.daysAfter } : SYSTEM_DEFAULTS
}

export async function upsertSystemFlexibleDatesConfig(
  data: Partial<FlexibleDatesEffective>,
): Promise<SystemFlexibleDatesConfigResponse> {
  const existing = await prisma.systemFlexibleDatesConfig.findFirst()
  const row = existing
    ? await prisma.systemFlexibleDatesConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemFlexibleDatesConfig.create({ data: { ...SYSTEM_DEFAULTS, ...data } })
  return { enabled: row.enabled, daysBefore: row.daysBefore, daysAfter: row.daysAfter }
}

export async function getOrgFlexibleDatesConfig(orgId: number): Promise<OrgFlexibleDatesConfigResponse> {
  const [system, org] = await Promise.all([
    getSystemFlexibleDatesConfig(),
    prisma.orgFlexibleDatesConfig.findUnique({ where: { orgId } }),
  ])
  const effective = resolveOrgEffective(system, org)
  return {
    enabled: org?.enabled ?? null,
    daysBefore: org?.daysBefore ?? null,
    daysAfter: org?.daysAfter ?? null,
    effective,
  }
}

export async function upsertOrgFlexibleDatesConfig(
  orgId: number,
  data: Partial<OrgFlexibleDatesConfigResponse>,
): Promise<OrgFlexibleDatesConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.orgFlexibleDatesConfig.upsert({
    where: { orgId },
    create: { orgId, ...fields },
    update: fields,
  })
  return getOrgFlexibleDatesConfig(orgId)
}

export async function getPropertyFlexibleDatesConfig(propertyId: number): Promise<PropertyFlexibleDatesConfigResponse> {
  const prop = await prisma.propertyFlexibleDatesConfig.findUnique({
    where: { propertyId },
    include: { property: { select: { organizationId: true } } },
  })
  const orgId = prop?.property?.organizationId

  const [system, org] = await Promise.all([
    getSystemFlexibleDatesConfig(),
    orgId ? prisma.orgFlexibleDatesConfig.findUnique({ where: { orgId } }) : Promise.resolve(null),
  ])

  const orgEffective = resolveOrgEffective(system, org)
  const effective = resolvePropertyEffective(orgEffective, prop)
  return {
    enabled: prop?.enabled ?? null,
    daysBefore: prop?.daysBefore ?? null,
    daysAfter: prop?.daysAfter ?? null,
    effective,
  }
}

export async function upsertPropertyFlexibleDatesConfig(
  propertyId: number,
  data: Partial<PropertyFlexibleDatesConfigResponse>,
): Promise<PropertyFlexibleDatesConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.propertyFlexibleDatesConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...fields },
    update: fields,
  })
  return getPropertyFlexibleDatesConfig(propertyId)
}

export async function resolveEffectiveFlexibleDatesConfig(propertyId: number): Promise<FlexibleDatesEffective> {
  const result = await getPropertyFlexibleDatesConfig(propertyId)
  return result.effective
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveOrgEffective(
  system: FlexibleDatesEffective,
  org: { enabled: boolean | null; daysBefore: number | null; daysAfter: number | null } | null,
): FlexibleDatesEffective {
  return {
    enabled: org?.enabled ?? system.enabled,
    daysBefore: org?.daysBefore ?? system.daysBefore,
    daysAfter: org?.daysAfter ?? system.daysAfter,
  }
}

function resolvePropertyEffective(
  orgEffective: FlexibleDatesEffective,
  prop: { enabled: boolean | null; daysBefore: number | null; daysAfter: number | null } | null,
): FlexibleDatesEffective {
  return {
    enabled: prop?.enabled ?? orgEffective.enabled,
    daysBefore: prop?.daysBefore ?? orgEffective.daysBefore,
    daysAfter: prop?.daysAfter ?? orgEffective.daysAfter,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/services/__tests__/flexible-dates-config.service.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/flexible-dates-config.service.ts apps/api/src/services/__tests__/flexible-dates-config.service.test.ts
git commit -m "feat(api): add flexible-dates-config service with system→org→property inheritance"
```

---

## Task 4: API Routes + Registration

**Files:**
- Create: `apps/api/src/routes/flexible-dates.route.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create `apps/api/src/routes/flexible-dates.route.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import {
  getSystemFlexibleDatesConfig, upsertSystemFlexibleDatesConfig,
  getOrgFlexibleDatesConfig, upsertOrgFlexibleDatesConfig,
  getPropertyFlexibleDatesConfig, upsertPropertyFlexibleDatesConfig,
  resolveEffectiveFlexibleDatesConfig,
} from '../services/flexible-dates-config.service.js'
import type { FlexibleDatesEffective, OrgFlexibleDatesConfigResponse, PropertyFlexibleDatesConfigResponse } from '@ibe/shared'

export async function flexibleDatesPublicRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/flexible-dates/config/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
      return resolveEffectiveFlexibleDatesConfig(propertyId)
    },
  )
}

export async function flexibleDatesAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/admin/flexible-dates/config/system', async () => {
    return getSystemFlexibleDatesConfig()
  })

  fastify.put('/api/v1/admin/flexible-dates/config/system', async (request) => {
    return upsertSystemFlexibleDatesConfig(request.body as Partial<FlexibleDatesEffective>)
  })

  fastify.get<{ Params: { orgId: string } }>(
    '/api/v1/admin/flexible-dates/config/org/:orgId',
    async (request) => {
      return getOrgFlexibleDatesConfig(parseInt(request.params.orgId, 10))
    },
  )

  fastify.put<{ Params: { orgId: string } }>(
    '/api/v1/admin/flexible-dates/config/org/:orgId',
    async (request) => {
      return upsertOrgFlexibleDatesConfig(
        parseInt(request.params.orgId, 10),
        request.body as Partial<OrgFlexibleDatesConfigResponse>,
      )
    },
  )

  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/flexible-dates/config/property/:propertyId',
    async (request) => {
      return getPropertyFlexibleDatesConfig(parseInt(request.params.propertyId, 10))
    },
  )

  fastify.put<{ Params: { propertyId: string } }>(
    '/api/v1/admin/flexible-dates/config/property/:propertyId',
    async (request) => {
      return upsertPropertyFlexibleDatesConfig(
        parseInt(request.params.propertyId, 10),
        request.body as Partial<PropertyFlexibleDatesConfigResponse>,
      )
    },
  )
}
```

- [ ] **Step 2: Register routes in `apps/api/src/app.ts`**

At the top of `app.ts`, find the existing import block (near the pricing import on line ~72) and add:

```ts
import { flexibleDatesPublicRoutes, flexibleDatesAdminRoutes } from './routes/flexible-dates.route.js'
```

In the public routes section (after `pricingPublicRoutes`, around line 207), add:

```ts
  await app.register(flexibleDatesPublicRoutes)
```

In the protected admin routes section (after `pricingAdminRoutes`, around line 262), add:

```ts
    await adminApp.register(flexibleDatesAdminRoutes)
```

- [ ] **Step 3: Verify the API server still starts**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/flexible-dates.route.ts apps/api/src/app.ts
git commit -m "feat(api): add flexible-dates config routes (admin + public)"
```

---

## Task 5: API Client Methods

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add 6 new methods to `apps/web/src/lib/api-client.ts`**

Find the end of the `getAdminPricingOffers` method (around line 2436) and add before the closing `}`:

```ts
  getFlexibleDatesConfig(propertyId: number): Promise<import('@ibe/shared').FlexibleDatesEffective> {
    return apiRequest(`/api/v1/flexible-dates/config/${propertyId}`)
  },

  getSystemFlexibleDatesConfig(): Promise<import('@ibe/shared').SystemFlexibleDatesConfigResponse> {
    return apiRequest('/api/v1/admin/flexible-dates/config/system')
  },

  updateSystemFlexibleDatesConfig(
    data: Partial<import('@ibe/shared').FlexibleDatesEffective>,
  ): Promise<import('@ibe/shared').SystemFlexibleDatesConfigResponse> {
    return apiRequest('/api/v1/admin/flexible-dates/config/system', { method: 'PUT', body: JSON.stringify(data) })
  },

  getOrgFlexibleDatesConfig(orgId: number): Promise<import('@ibe/shared').OrgFlexibleDatesConfigResponse> {
    return apiRequest(`/api/v1/admin/flexible-dates/config/org/${orgId}`)
  },

  updateOrgFlexibleDatesConfig(
    orgId: number,
    data: Partial<import('@ibe/shared').OrgFlexibleDatesConfigResponse>,
  ): Promise<import('@ibe/shared').OrgFlexibleDatesConfigResponse> {
    return apiRequest(`/api/v1/admin/flexible-dates/config/org/${orgId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  getPropertyFlexibleDatesConfig(propertyId: number): Promise<import('@ibe/shared').PropertyFlexibleDatesConfigResponse> {
    return apiRequest(`/api/v1/admin/flexible-dates/config/property/${propertyId}`)
  },

  updatePropertyFlexibleDatesConfig(
    propertyId: number,
    data: Partial<import('@ibe/shared').PropertyFlexibleDatesConfigResponse>,
  ): Promise<import('@ibe/shared').PropertyFlexibleDatesConfigResponse> {
    return apiRequest(`/api/v1/admin/flexible-dates/config/property/${propertyId}`, { method: 'PUT', body: JSON.stringify(data) })
  },
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat(web): add flexible-dates API client methods"
```

---

## Task 6: Admin UI — Offers Page Tab Bar + Flexible Dates Tab

**Files:**
- Modify: `apps/web/src/app/admin/config/offers/page.tsx`

This task adds a four-tab bar (General | Flexible Dates | Inter-city | Multi-city) at the top of the Offers page and a full Flexible Dates editor.

- [ ] **Step 1: Add imports at the top of `offers/page.tsx`**

After the existing imports, add:

```ts
import { useSearchParams, useRouter } from 'next/navigation'
import type { FlexibleDatesEffective, OrgFlexibleDatesConfigResponse, PropertyFlexibleDatesConfigResponse } from '@ibe/shared'
```

- [ ] **Step 2: Add the tab bar component and tab type** (before the `OffersPage` export)

```tsx
type OffersTab = 'general' | 'flexible-dates' | 'inter-city' | 'multi-city'

const OFFERS_TABS: { value: OffersTab; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'flexible-dates', label: 'Flexible Dates' },
  { value: 'inter-city', label: 'Inter-city' },
  { value: 'multi-city', label: 'Multi-city' },
]

function OffersTabs({ value, onChange }: { value: OffersTab; onChange: (t: OffersTab) => void }) {
  return (
    <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 w-fit">
      {OFFERS_TABS.map(tab => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={[
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            value === tab.value
              ? 'bg-[var(--color-primary)] text-white shadow-sm'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Update `OffersPage` to read tab from URL params and render tabs**

Replace the current `OffersPage` function body with:

```tsx
export default function OffersPage() {
  const { admin } = useAdminAuth()
  const { propertyId, orgId: contextOrgId } = useAdminProperty()
  const [channel, setChannel] = useState<OffersChannel>('b2c')
  const rawParams = useSearchParams()
  const router = useRouter()

  if (propertyId === undefined) return null

  const isSuper = admin?.role === 'super'
  const isSystemLevel = isSuper && contextOrgId === null
  const activeTab = (rawParams.get('tab') ?? 'general') as OffersTab

  function setTab(tab: OffersTab) {
    const p = new URLSearchParams(rawParams.toString())
    p.set('tab', tab)
    router.replace(`?${p.toString()}`)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Offers</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {isSystemLevel
                ? 'System-wide defaults inherited by all chains.'
                : propertyId === null
                  ? 'Chain defaults inherited by all properties. Leave a field blank to use the system default.'
                  : 'Property overrides. Leave blank to inherit from chain defaults.'}
            </p>
          </div>
        </div>
        <OffersTabs value={activeTab} onChange={setTab} />
      </div>

      {activeTab === 'general' && (
        <div className="space-y-6">
          <ChannelTabs value={channel} onChange={setChannel} />
          {isSystemLevel ? (
            <SystemOffersEditor key={channel} channel={channel} />
          ) : propertyId === null ? (
            <GlobalOffersEditor key={channel} channel={channel} />
          ) : (
            <PropertyOffersEditor key={channel} propertyId={propertyId} channel={channel} />
          )}
        </div>
      )}

      {activeTab === 'flexible-dates' && (
        <FlexibleDatesEditor isSuper={isSuper} orgId={contextOrgId} propertyId={propertyId} />
      )}

      {(activeTab === 'inter-city' || activeTab === 'multi-city') && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
          <p className="font-medium text-[var(--color-text)]">Coming soon</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">This feature is under development.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add shared UI helpers for the Flexible Dates form** (before `FlexibleDatesEditor`)

```tsx
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

function NullableNumberField({
  label,
  value,
  inherited,
  min,
  max,
  onChange,
}: {
  label: string
  value: number | null
  inherited: number
  min: number
  max: number
  onChange: (v: number | null) => void
}) {
  return (
    <FormRow label={label}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value ?? ''}
          placeholder={String(inherited)}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={inputCls}
        />
        {value !== null && (
          <button type="button" onClick={() => onChange(null)}
            className="shrink-0 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            Reset
          </button>
        )}
      </div>
      {value === null && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">(inherited: {inherited})</p>
      )}
    </FormRow>
  )
}

function NullableBoolField({
  label,
  value,
  inherited,
  onChange,
}: {
  label: string
  value: boolean | null
  inherited: boolean
  onChange: (v: boolean | null) => void
}) {
  return (
    <FormRow label={label}>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={value ?? inherited}
          onChange={e => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
        />
        {value !== null && (
          <button type="button" onClick={() => onChange(null)}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            Reset
          </button>
        )}
        {value === null && (
          <span className="text-xs text-[var(--color-text-muted)]">
            (inherited: {inherited ? 'enabled' : 'disabled'})
          </span>
        )}
      </div>
    </FormRow>
  )
}
```

- [ ] **Step 5: Add the FlexibleDatesEditor component** (before the `Spinner` function at the bottom of the file)

```tsx
function FlexibleDatesEditor({
  isSuper,
  orgId,
  propertyId,
}: {
  isSuper: boolean
  orgId: number | null
  propertyId: number | null
}) {
  return (
    <div className="space-y-6">
      {isSuper && <SystemFlexibleDatesSection />}
      {orgId !== null && <OrgFlexibleDatesSection orgId={orgId} />}
      {propertyId !== null && <PropertyFlexibleDatesSection propertyId={propertyId} />}
      {!isSuper && orgId === null && propertyId === null && (
        <p className="text-sm text-[var(--color-text-muted)]">No flexible dates settings available at this level.</p>
      )}
    </div>
  )
}

function SystemFlexibleDatesSection() {
  const qc = useQueryClient()
  const qKey = ['flexible-dates-config', 'system']

  const { data, isLoading } = useQuery<FlexibleDatesEffective>({
    queryKey: qKey,
    queryFn: () => apiClient.getSystemFlexibleDatesConfig(),
  })

  const [enabled, setEnabled] = useState(false)
  const [daysBefore, setDaysBefore] = useState(1)
  const [daysAfter, setDaysAfter] = useState(1)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!data) return
    setEnabled(data.enabled)
    setDaysBefore(data.daysBefore)
    setDaysAfter(data.daysAfter)
    setIsDirty(false)
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: Partial<FlexibleDatesEffective>) => apiClient.updateSystemFlexibleDatesConfig(d),
    onSuccess: updated => { qc.setQueryData(qKey, updated); setIsDirty(false) },
  })

  if (isLoading) return <Spinner />

  function md() { setIsDirty(true) }

  return (
    <Section title="System Defaults">
      <FormRow label="Enable flexible dates">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => { setEnabled(e.target.checked); md() }}
          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
        />
      </FormRow>
      <div className="grid grid-cols-2 gap-4">
        <FormRow label="Days before">
          <input type="number" min={0} max={3} value={daysBefore}
            onChange={e => { setDaysBefore(Number(e.target.value)); md() }}
            className={inputCls} />
        </FormRow>
        <FormRow label="Days after">
          <input type="number" min={0} max={3} value={daysAfter}
            onChange={e => { setDaysAfter(Number(e.target.value)); md() }}
            className={inputCls} />
        </FormRow>
      </div>
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate({ enabled, daysBefore, daysAfter })} />
    </Section>
  )
}

function OrgFlexibleDatesSection({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const qKey = ['flexible-dates-config', 'org', orgId]

  const { data, isLoading } = useQuery<OrgFlexibleDatesConfigResponse>({
    queryKey: qKey,
    queryFn: () => apiClient.getOrgFlexibleDatesConfig(orgId),
  })

  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [daysBefore, setDaysBefore] = useState<number | null>(null)
  const [daysAfter, setDaysAfter] = useState<number | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!data) return
    setEnabled(data.enabled)
    setDaysBefore(data.daysBefore)
    setDaysAfter(data.daysAfter)
    setIsDirty(false)
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: Partial<OrgFlexibleDatesConfigResponse>) => apiClient.updateOrgFlexibleDatesConfig(orgId, d),
    onSuccess: updated => { qc.setQueryData(qKey, updated); setIsDirty(false) },
  })

  if (isLoading) return <Spinner />

  const eff = data?.effective ?? { enabled: false, daysBefore: 1, daysAfter: 1 }
  function md() { setIsDirty(true) }

  return (
    <Section title="Chain Override">
      <NullableBoolField label="Enable flexible dates" value={enabled} inherited={eff.enabled}
        onChange={v => { setEnabled(v); md() }} />
      <div className="grid grid-cols-2 gap-4">
        <NullableNumberField label="Days before" value={daysBefore} inherited={eff.daysBefore}
          min={0} max={3} onChange={v => { setDaysBefore(v); md() }} />
        <NullableNumberField label="Days after" value={daysAfter} inherited={eff.daysAfter}
          min={0} max={3} onChange={v => { setDaysAfter(v); md() }} />
      </div>
      <SaveBar isDirty={isDirty} isSaving={isPending}
        onSave={() => mutate({ enabled, daysBefore, daysAfter })} />
    </Section>
  )
}

function PropertyFlexibleDatesSection({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const qKey = ['flexible-dates-config', 'property', propertyId]

  const { data, isLoading } = useQuery<PropertyFlexibleDatesConfigResponse>({
    queryKey: qKey,
    queryFn: () => apiClient.getPropertyFlexibleDatesConfig(propertyId),
  })

  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [daysBefore, setDaysBefore] = useState<number | null>(null)
  const [daysAfter, setDaysAfter] = useState<number | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!data) return
    setEnabled(data.enabled)
    setDaysBefore(data.daysBefore)
    setDaysAfter(data.daysAfter)
    setIsDirty(false)
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: Partial<PropertyFlexibleDatesConfigResponse>) =>
      apiClient.updatePropertyFlexibleDatesConfig(propertyId, d),
    onSuccess: updated => { qc.setQueryData(qKey, updated); setIsDirty(false) },
  })

  if (isLoading) return <Spinner />

  const eff = data?.effective ?? { enabled: false, daysBefore: 1, daysAfter: 1 }
  function md() { setIsDirty(true) }

  return (
    <Section title="Hotel Settings">
      <NullableBoolField label="Enable flexible dates" value={enabled} inherited={eff.enabled}
        onChange={v => { setEnabled(v); md() }} />
      <div className="grid grid-cols-2 gap-4">
        <NullableNumberField label="Days before" value={daysBefore} inherited={eff.daysBefore}
          min={0} max={3} onChange={v => { setDaysBefore(v); md() }} />
        <NullableNumberField label="Days after" value={daysAfter} inherited={eff.daysAfter}
          min={0} max={3} onChange={v => { setDaysAfter(v); md() }} />
      </div>
      <SaveBar isDirty={isDirty} isSaving={isPending}
        onSave={() => mutate({ enabled, daysBefore, daysAfter })} />
    </Section>
  )
}
```

- [ ] **Step 6: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/config/offers/page.tsx
git commit -m "feat(admin): add Flexible Dates tab to Offers page with 3-tier config editor"
```

---

## Task 7: `useFlexibleDateSearch` Hook

**Files:**
- Create: `apps/web/src/hooks/use-flexible-date-search.ts`

- [ ] **Step 1: Create `apps/web/src/hooks/use-flexible-date-search.ts`**

```ts
'use client'

import { useQueries } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { encodeSearchParams } from '@/lib/search-params'
import type { SearchUrlParams } from '@/lib/search-params'
import type { FlexibleDatesEffective, SearchResponse } from '@ibe/shared'

export interface FlexibleDateResult {
  label: string
  checkIn: string
  checkOut: string
  data: SearchResponse | undefined
  isLoading: boolean
}

function computeDeltas(daysBefore: number, daysAfter: number): number[] {
  const before = Array.from({ length: daysBefore }, (_, i) => -(daysBefore - i))
  const after = Array.from({ length: daysAfter }, (_, i) => i + 1)
  return [...before, ...after]
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function shiftParams(base: SearchUrlParams, delta: number): SearchUrlParams {
  return {
    ...base,
    checkIn: shiftDate(base.checkIn, delta),
    checkOut: shiftDate(base.checkOut, delta),
  }
}

function defaultGetLabel(delta: number): string {
  const n = Math.abs(delta)
  if (delta < 0) return n === 1 ? '1 day before' : `${n} days before`
  return n === 1 ? '1 day after' : `${n} days after`
}

export function useFlexibleDateSearch(
  baseParams: SearchUrlParams | null,
  config: FlexibleDatesEffective | undefined,
  primaryHasResults: boolean,
  getLabel: (delta: number) => string = defaultGetLabel,
): FlexibleDateResult[] {
  const enabled = config?.enabled === true && !primaryHasResults && baseParams !== null
  const deltas = enabled ? computeDeltas(config!.daysBefore, config!.daysAfter) : []

  const results = useQueries({
    queries: deltas.map(delta => {
      const altParams = baseParams ? shiftParams(baseParams, delta) : null
      return {
        queryKey: ['search', altParams],
        queryFn: () => {
          if (!altParams) throw new Error('no params')
          return apiClient.search(encodeSearchParams(altParams))
        },
        enabled: enabled && !!altParams,
        staleTime: 4 * 60 * 1000,
        retry: false,
      }
    }),
  })

  return deltas
    .map((delta, i) => {
      const result = results[i]!
      const altParams = baseParams ? shiftParams(baseParams, delta) : null
      const rooms = result.data?.results.flatMap(r => r.rooms) ?? []
      return {
        label: getLabel(delta),
        checkIn: altParams?.checkIn ?? '',
        checkOut: altParams?.checkOut ?? '',
        data: result.data,
        isLoading: result.isFetching,
      }
    })
    .filter(r => {
      if (r.isLoading) return true
      const rooms = r.data?.results.flatMap(res => res.rooms) ?? []
      return rooms.length > 0
    })
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-flexible-date-search.ts
git commit -m "feat(web): add useFlexibleDateSearch hook with parallel React Query fan-out"
```

---

## Task 8: `_content.tsx` Integration + Translation Keys

**Files:**
- Modify: `apps/web/src/app/(main)/search/_content.tsx`
- Modify: `apps/api/src/translations/en.json`

### Part A: Translation Keys

- [ ] **Step 1: Add 6 new keys to `apps/api/src/translations/en.json`**

In the `"search"` namespace (after `"collapseCart": "Collapse cart"`, around line 50), add:

```json
    "flexibleUnavailable": "Unfortunately, we do not have availability for your selected dates.",
    "flexibleNearby": "However, we do have availability for nearby dates:",
    "flexibleDayBefore": "1 day before",
    "flexibleDaysBefore": "{n} days before",
    "flexibleDayAfter": "1 day after",
    "flexibleDaysAfter": "{n} days after",
```

### Part B: `_content.tsx` Changes

- [ ] **Step 2: Add imports to `_content.tsx`**

After the existing imports, add:

```tsx
import { useQuery } from '@tanstack/react-query'
import { useFlexibleDateSearch } from '@/hooks/use-flexible-date-search'
import type { FlexibleDateResult } from '@/hooks/use-flexible-date-search'
```

Note: `useQuery` may already be imported via another path — if so, just add the hook import.

- [ ] **Step 3: Add flex config query + hook call after the existing `useSearch` call**

The current `_content.tsx` has (around line 60):
```tsx
const { data, isLoading, isError, error } = useSearch(searchParams)
```

After this line (but before the `if (!searchParams)` check), add:

```tsx
  const { data: flexConfig } = useQuery({
    queryKey: ['flexible-dates-config', searchParams?.hotelId ?? null],
    queryFn: () => apiClient.getFlexibleDatesConfig(searchParams!.hotelId),
    enabled: searchParams !== null,
    staleTime: 5 * 60 * 1000,
  })
```

- [ ] **Step 4: Compute primaryHasResults and call the hook**

After the `allRooms` computation (around line 88-92), add:

```tsx
  const primaryHasResults = !isLoading && !isError && data !== undefined && allRooms.length > 0

  const flexResults = useFlexibleDateSearch(
    searchParams,
    flexConfig,
    primaryHasResults,
    (delta) => {
      const n = Math.abs(delta)
      if (delta < 0) return n === 1 ? t('flexibleDayBefore') : t('flexibleDaysBefore', { n: String(n) })
      return n === 1 ? t('flexibleDayAfter') : t('flexibleDaysAfter', { n: String(n) })
    },
  )
```

- [ ] **Step 5: Replace the no-rooms block (around line 280)**

Replace this existing block:

```tsx
      {data && allRooms.length === 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
          <p className="font-medium text-[var(--color-text)]">{t('noRoomsAvailable')}</p>
          <p className="mt-1 text-sm text-muted">{t('tryDifferentDates')}</p>
        </div>
      )}
```

With:

```tsx
      {data && allRooms.length === 0 && (() => {
        const flexWithRooms = flexResults.filter(r => !r.isLoading && (r.data?.results.flatMap(res => res.rooms) ?? []).length > 0)
        const flexLoading = flexResults.some(r => r.isLoading)

        if (flexWithRooms.length > 0) {
          return (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
                <p className="font-medium text-[var(--color-text)]">{t('flexibleUnavailable')}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('flexibleNearby')}</p>
              </div>
              {flexWithRooms.map(result => (
                <FlexibleDateSection
                  key={result.checkIn}
                  result={result}
                  baseParams={searchParams!}
                  nights={nights}
                  locale={locale}
                  roomDetailMap={roomDetailMap}
                  hotelConfig={hotelConfig}
                  dispCur={dispCur}
                  convert={convert}
                  router={router}
                  data={data}
                />
              ))}
            </div>
          )
        }

        if (flexLoading) {
          return (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
              <p className="font-medium text-[var(--color-text)]">{t('noRoomsAvailable')}</p>
              <p className="mt-1 text-sm text-muted">{t('tryDifferentDates')}</p>
              <div className="mt-3 flex justify-center gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-primary-light)]"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )
        }

        return (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
            <p className="font-medium text-[var(--color-text)]">{t('noRoomsAvailable')}</p>
            <p className="mt-1 text-sm text-muted">{t('tryDifferentDates')}</p>
          </div>
        )
      })()}
```

- [ ] **Step 6: Add the `FlexibleDateSection` component** (after the `SearchContent` function closing brace, before the end of file)

```tsx
function FlexibleDateSection({
  result,
  baseParams,
  nights,
  locale,
  roomDetailMap,
  hotelConfig,
  dispCur,
  convert,
  router,
  data: primaryData,
}: {
  result: FlexibleDateResult
  baseParams: import('@/lib/search-params').SearchUrlParams
  nights: number
  locale: string
  roomDetailMap: Map<number, import('@ibe/shared').RoomDetail>
  hotelConfig: import('@ibe/shared').HotelConfig | undefined | null
  dispCur: string
  convert: (amount: number) => number
  router: import('next/navigation').AppRouterInstance
  data: import('@ibe/shared').SearchResponse
}) {
  const [open, setOpen] = useState(false)
  const { encodeSearchParams } = require('@/lib/search-params')

  const altParams = { ...baseParams, checkIn: result.checkIn, checkOut: result.checkOut }
  const altNights = import('@ibe/shared').then ? nights : nights // reuse same nights (stay length preserved)
  const rooms = result.data?.results.flatMap(r => r.rooms) ?? []
  const minPrice = rooms.length > 0
    ? Math.min(...rooms.flatMap(r => r.rates.map(rt => convert(rt.prices.sell.amount))))
    : null

  function handleAltRateSelect(room: import('@ibe/shared').RoomOption, rate: import('@ibe/shared').RateOption) {
    const qs = encodeSearchParams(altParams)
    qs.set('roomId', String(room.roomId))
    qs.set('ratePlanId', String(rate.ratePlanId))
    qs.set('searchId', result.data?.searchId ?? primaryData.searchId)
    qs.set('price', String(rate.prices.sell.amount))
    qs.set('priceCurrency', rate.prices.sell.currency)
    router.push(`/booking?${qs.toString()}`)
  }

  const formattedMin = minPrice != null ? formatCurrency(minPrice, dispCur, locale) : null

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-[var(--color-background)] transition-colors"
      >
        <div>
          <span className="font-medium text-[var(--color-text)]">{result.label}</span>
          <span className="ml-2 text-sm text-[var(--color-text-muted)]">
            {result.checkIn} – {result.checkOut}
          </span>
          {formattedMin && (
            <span className="ml-2 text-sm text-[var(--color-primary)]">from {formattedMin}</span>
          )}
        </div>
        <span className="text-[var(--color-text-muted)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-border)] p-4 space-y-4">
          {rooms.map(room => (
            <RoomCard
              key={room.roomId}
              room={room}
              nights={nights}
              locale={locale}
              roomDetail={roomDetailMap.get(room.roomId)}
              remarks={result.data?.results.flatMap(r => r.remarks) ?? []}
              defaultExpanded={hotelConfig?.roomRatesDefaultExpanded ?? false}
              onRateSelect={handleAltRateSelect}
              displayCurrency={dispCur}
              convert={convert}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Note:** The `FlexibleDateSection` above uses a dynamic `require` which is not valid TypeScript. Replace the `encodeSearchParams` usage as follows — import it at the top of the file (it's already imported), and use it directly:

```tsx
  function handleAltRateSelect(room: RoomOption, rate: RateOption) {
    const qs = encodeSearchParams(altParams)
    qs.set('roomId', String(room.roomId))
    qs.set('ratePlanId', String(rate.ratePlanId))
    qs.set('searchId', result.data?.searchId ?? primaryData.searchId)
    qs.set('price', String(rate.prices.sell.amount))
    qs.set('priceCurrency', rate.prices.sell.currency)
    router.push(`/booking?${qs.toString()}`)
  }
```

Remove the `const { encodeSearchParams } = require(...)` line — `encodeSearchParams` is already imported at the top.

Also remove the dynamic `import` in `altNights` — replace with just `nights` since the stay length is preserved by the delta shift.

The cleaned-up `FlexibleDateSection` component (replace the one above):

```tsx
function FlexibleDateSection({
  result,
  baseParams,
  nights,
  locale,
  roomDetailMap,
  hotelConfig,
  dispCur,
  convert,
  router,
  data: primaryData,
}: {
  result: FlexibleDateResult
  baseParams: ReturnType<typeof decodeSearchParams>
  nights: number
  locale: string
  roomDetailMap: Map<number, RoomDetail>
  hotelConfig: ReturnType<typeof useHotelConfig>['data']
  dispCur: string
  convert: (amount: number) => number
  router: ReturnType<typeof useRouter>
  data: import('@ibe/shared').SearchResponse
}) {
  const [open, setOpen] = useState(false)
  const altParams = { ...baseParams!, checkIn: result.checkIn, checkOut: result.checkOut }
  const rooms = result.data?.results.flatMap(r => r.rooms) ?? []
  const minPrice = rooms.length > 0
    ? Math.min(...rooms.flatMap(r => r.rates.map(rt => convert(rt.prices.sell.amount))))
    : null
  const formattedMin = minPrice != null ? formatCurrency(minPrice, dispCur, locale) : null

  function handleAltRateSelect(room: RoomOption, rate: RateOption) {
    const qs = encodeSearchParams(altParams)
    qs.set('roomId', String(room.roomId))
    qs.set('ratePlanId', String(rate.ratePlanId))
    qs.set('searchId', result.data?.searchId ?? primaryData.searchId)
    qs.set('price', String(rate.prices.sell.amount))
    qs.set('priceCurrency', rate.prices.sell.currency)
    router.push(`/booking?${qs.toString()}`)
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-[var(--color-background)] transition-colors"
      >
        <div>
          <span className="font-medium text-[var(--color-text)]">{result.label}</span>
          <span className="ml-2 text-sm text-[var(--color-text-muted)]">
            {result.checkIn} – {result.checkOut}
          </span>
          {formattedMin && (
            <span className="ml-2 text-sm text-[var(--color-primary)]">from {formattedMin}</span>
          )}
        </div>
        <span className="text-[var(--color-text-muted)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-border)] p-4 space-y-4">
          {rooms.map(room => (
            <RoomCard
              key={room.roomId}
              room={room}
              nights={nights}
              locale={locale}
              roomDetail={roomDetailMap.get(room.roomId)}
              remarks={result.data?.results.flatMap(r => r.remarks) ?? []}
              defaultExpanded={hotelConfig?.roomRatesDefaultExpanded ?? false}
              onRateSelect={handleAltRateSelect}
              displayCurrency={dispCur}
              convert={convert}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No TypeScript errors. Fix any type issues (common ones: `ReturnType<typeof useHotelConfig>` resolving incorrectly — use the actual returned type from the hook, e.g. `import('@ibe/shared').HotelConfig | null | undefined`).

- [ ] **Step 8: Run all API tests**

```bash
cd apps/api && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add "apps/web/src/app/(main)/search/_content.tsx" apps/api/src/translations/en.json
git commit -m "feat(web): integrate flexible date search fan-out into search page with collapsible sections"
```

---

## Self-Review

### Spec Coverage Check

| Spec section | Covered by |
|---|---|
| DB models (System/Org/Property) | Task 1 |
| Service functions + merge rule | Task 3 |
| Shared types | Task 2 |
| Admin routes (6 endpoints) | Task 4 |
| Public route GET /flexible-dates/config/:propertyId | Task 4 |
| API client methods | Task 5 |
| Offers page tab bar (General/Flexible Dates/Inter-city/Multi-city) | Task 6 |
| Tab state in ?tab= URL param | Task 6 |
| Inter-city / Multi-city "Coming soon" | Task 6 |
| System Defaults section (super only) | Task 6 |
| Chain Override section (org+super) | Task 6 |
| Hotel Settings section (property+super) | Task 6 |
| Nullable fields + Reset + inherited placeholder | Task 6 |
| SaveBar when dirty | Task 6 |
| useFlexibleDateSearch hook | Task 7 |
| Delta order (negative asc, positive asc) | Task 7 |
| Parallel useSearch calls via useQueries | Task 7 |
| Error = zero results (retry: false, filter by rooms > 0) | Task 7 |
| getFlexibleDatesConfig public API client method | Task 5 |
| useQuery(['flexible-dates-config', propertyId]) in _content.tsx | Task 8 |
| primaryHasResults computation | Task 8 |
| No-rooms block: flex results / loading / fallback | Task 8 |
| FlexibleDateSection with collapsible header + from price | Task 8 |
| RoomCard wired with alt dates for correct booking URL | Task 8 |
| 6 new translation keys | Task 8 |

All spec requirements are covered. Inter-city and Multi-city logic is explicitly out of scope (placeholder tabs only — covered).
