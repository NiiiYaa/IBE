# Price Calendar & Anomaly Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect nightly prices for each hotel for the next 365 days, display them with color-coded anomaly classification on the guest search calendar, and surface price anomalies on the admin dashboard.

**Architecture:** BullMQ (backed by existing Redis) handles async price collection jobs; `node-cron` triggers nightly job enqueuing; three config models (System/Org/Property) handle inheritance; a `DailyRate` table stores per-night prices + classification; the public calendar API serves the guest frontend; the existing `CalendarDropdown` is extended with an optional `dailyRates` prop.

**Tech Stack:** BullMQ, Prisma, HyperGuest search adapter, xlsx (client-side), React Query, Tailwind CSS, existing `cacheGet/cacheSet/cacheDel`, `addDays/todayIso` from `@ibe/shared`.

**Spec:** `docs/superpowers/specs/2026-05-22-price-calendar-design.md`

---

## File Map

### New — Backend
- `apps/api/src/services/pricing-config.service.ts` — config inheritance resolution, getEnabledPropertyIds
- `apps/api/src/services/pricing-collect.service.ts` — 29-day batch HG searches, DailyRate upserts
- `apps/api/src/services/pricing-classify.service.ts` — rolling avg, calendarColor, anomalyType
- `apps/api/src/services/pricing-queue.service.ts` — BullMQ queue + worker
- `apps/api/src/services/pricing-cron.service.ts` — nightly node-cron that enqueues jobs
- `apps/api/src/routes/pricing.route.ts` — public calendar + admin config/ops routes
- `apps/api/src/services/__tests__/pricing-config.service.test.ts`
- `apps/api/src/services/__tests__/pricing-classify.service.test.ts`
- `apps/api/src/services/__tests__/pricing-collect.service.test.ts`

### Modified — Backend
- `apps/api/prisma/schema.prisma` — 4 new models + relations
- `apps/api/src/app.ts` — register pricing routes
- `apps/api/src/server.ts` — start/stop pricing cron + BullMQ worker
- `apps/api/src/services/config.service.ts` — add `pricingEnabled` to property config response
- `packages/shared/src/types/api.ts` — add `pricingEnabled` to `HotelDesignConfig` + new pricing types

### New — Frontend
- `apps/web/src/app/admin/config/misc/pricing/page.tsx` — 3-level pricing config page with Refresh Now + Export

### Modified — Frontend
- `apps/web/src/app/admin/_layout-client.tsx` — add Misc nav group
- `apps/web/src/components/search/CalendarDropdown.tsx` — dailyRates prop, price cells, color, strikethrough
- `apps/web/src/app/admin/dashboard/page.tsx` — PricingAnomalyCard component + section
- `apps/web/src/lib/api-client.ts` — pricing API methods

---

## Task 1: Install BullMQ

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install BullMQ in the API package**

```bash
cd apps/api && npm install bullmq
```

Expected: bullmq appears in `apps/api/package.json` dependencies.

- [ ] **Step 2: Verify import resolves**

```bash
cd apps/api && node -e "import('bullmq').then(m => console.log('ok', Object.keys(m)))"
```

Expected: prints `ok` followed by BullMQ export names.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json
git commit -m "chore: install bullmq for pricing job queue"
```

---

## Task 2: DB Schema — 4 new models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add models to schema**

Add these models to `apps/api/prisma/schema.prisma` after the `// ── Intelligence CompSet` block:

```prisma
// ── Pricing Intelligence ──────────────────────────────────────────────────────

model SystemPricingConfig {
  id                  Int      @id @default(autoincrement())
  enabled             Boolean  @default(false)
  openToAll           Boolean  @default(true)
  refreshIntervalDays Int      @default(1)
  highPricePct        Float    @default(15)
  lowPricePct         Float    @default(15)
  highAnomalyPct      Float    @default(30)
  lowAnomalyPct       Float    @default(30)
  dayDifferencePct    Float    @default(35)
  dayDifferenceWindow Int      @default(7)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model OrgPricingConfig {
  id                    Int          @id @default(autoincrement())
  organizationId        Int          @unique
  organization          Organization @relation(fields: [organizationId], references: [id])
  enabled               Boolean?
  systemServiceDisabled Boolean      @default(false)
  highPricePct          Float?
  lowPricePct           Float?
  highAnomalyPct        Float?
  lowAnomalyPct         Float?
  dayDifferencePct      Float?
  dayDifferenceWindow   Int?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
}

model PropertyPricingConfig {
  id                  Int      @id @default(autoincrement())
  propertyId          Int      @unique
  property            Property @relation(fields: [propertyId], references: [propertyId], map: "PropertyPricingConfig_propertyId_fkey")
  enabled             Boolean?
  orgServiceDisabled  Boolean  @default(false)
  highPricePct        Float?
  lowPricePct         Float?
  highAnomalyPct      Float?
  lowAnomalyPct       Float?
  dayDifferencePct    Float?
  dayDifferenceWindow Int?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model DailyRate {
  id            Int      @id @default(autoincrement())
  propertyId    Int
  property      Property @relation(fields: [propertyId], references: [propertyId], map: "DailyRate_propertyId_fkey")
  date          String
  minSellPrice  Float
  currency      String
  available     Boolean  @default(true)
  calendarColor String   @default("normal")
  anomalyType   String?
  rollingAvg    Float?
  collectedAt   DateTime @default(now())

  @@unique([propertyId, date])
}
```

Also add the reverse relations on the `Organization` and `Property` models:

On `Organization` model, add:
```prisma
  orgPricingConfig            OrgPricingConfig?
```

On `Property` model, add:
```prisma
  propertyPricingConfig       PropertyPricingConfig?
  dailyRates                  DailyRate[]
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api && npx prisma migrate dev --name add_pricing_models
```

Expected: migration file created and applied, no errors.

- [ ] **Step 3: Regenerate Prisma client**

```bash
cd apps/api && npx prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(pricing): add SystemPricingConfig, OrgPricingConfig, PropertyPricingConfig, DailyRate models"
```

---

## Task 3: Shared Types

**Files:**
- Modify: `packages/shared/src/types/api.ts`

- [ ] **Step 1: Add `pricingEnabled` to `HotelDesignConfig`**

In `packages/shared/src/types/api.ts`, add to the `HotelDesignConfig` interface after `affiliateDefaultCommissionRate`:

```typescript
  pricingEnabled: boolean
```

- [ ] **Step 2: Add pricing API types**

After the `HotelDesignConfig` interface (before `UpdateDesignConfigRequest`), add:

```typescript
// ── Pricing ───────────────────────────────────────────────────────────────────

export interface DayPriceEntry {
  date: string
  price: number
  currency: string
  available: boolean
  calendarColor: 'low' | 'normal' | 'high'
}

export interface DayRateAdminEntry extends DayPriceEntry {
  anomalyType: 'high' | 'low' | 'diff' | null
  rollingAvg: number | null
}

export interface PricingConfigValues {
  highPricePct: number
  lowPricePct: number
  highAnomalyPct: number
  lowAnomalyPct: number
  dayDifferencePct: number
  dayDifferenceWindow: number
}

export interface SystemPricingConfigResponse extends PricingConfigValues {
  enabled: boolean
  openToAll: boolean
  refreshIntervalDays: number
}

export interface OrgPricingConfigResponse {
  enabled: boolean | null
  systemServiceDisabled: boolean
  highPricePct: number | null
  lowPricePct: number | null
  highAnomalyPct: number | null
  lowAnomalyPct: number | null
  dayDifferencePct: number | null
  dayDifferenceWindow: number | null
  // Resolved effective values (from system → org)
  effective: SystemPricingConfigResponse
}

export interface PropertyPricingConfigResponse {
  enabled: boolean | null
  orgServiceDisabled: boolean
  highPricePct: number | null
  lowPricePct: number | null
  highAnomalyPct: number | null
  lowAnomalyPct: number | null
  dayDifferencePct: number | null
  dayDifferenceWindow: number | null
  // Resolved effective values (from system → org → property)
  effective: SystemPricingConfigResponse
}

export interface PricingJobStatus {
  status: 'idle' | 'queued' | 'running'
  lastCollectedAt: string | null
  dayCount: number
}
```

- [ ] **Step 3: Build shared package**

```bash
cd packages/shared && npm run build
```

Expected: `dist/` updated, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/api.ts packages/shared/dist/
git commit -m "feat(pricing): add shared pricing types and pricingEnabled to HotelDesignConfig"
```

---

## Task 4: Pricing Config Service (TDD)

**Files:**
- Create: `apps/api/src/services/pricing-config.service.ts`
- Create: `apps/api/src/services/__tests__/pricing-config.service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/services/__tests__/pricing-config.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/client.js'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemPricingConfig: { findFirst: vi.fn() },
    orgPricingConfig: { findUnique: vi.fn() },
    propertyPricingConfig: { findUnique: vi.fn() },
    property: { findMany: vi.fn() },
  },
}))

const mockPrisma = prisma as unknown as {
  systemPricingConfig: { findFirst: ReturnType<typeof vi.fn> }
  orgPricingConfig: { findUnique: ReturnType<typeof vi.fn> }
  propertyPricingConfig: { findUnique: ReturnType<typeof vi.fn> }
  property: { findMany: ReturnType<typeof vi.fn> }
}

const SYSTEM_ROW = {
  enabled: true, openToAll: true, refreshIntervalDays: 1,
  highPricePct: 15, lowPricePct: 15, highAnomalyPct: 30,
  lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
}

describe('resolveEffectivePricingConfig', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns system defaults when no overrides exist', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue(null)
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)

    expect(result.highPricePct).toBe(15)
    expect(result.enabled).toBe(true)
  })

  it('applies property override over system', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue({
      enabled: true, orgServiceDisabled: false, highPricePct: 25,
      lowPricePct: null, highAnomalyPct: null, lowAnomalyPct: null,
      dayDifferencePct: null, dayDifferenceWindow: null,
      property: { organizationId: 10 },
    })
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)

    expect(result.highPricePct).toBe(25) // property override
    expect(result.lowPricePct).toBe(15)  // falls back to system
  })

  it('returns enabled=false when orgServiceDisabled', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue({
      enabled: null, orgServiceDisabled: true, highPricePct: null,
      lowPricePct: null, highAnomalyPct: null, lowAnomalyPct: null,
      dayDifferencePct: null, dayDifferenceWindow: null,
      property: { organizationId: 10 },
    })
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)

    expect(result.enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/api && npx vitest run src/services/__tests__/pricing-config.service.test.ts
```

Expected: `FAIL — Cannot find module '../pricing-config.service.js'`

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/pricing-config.service.ts`:

```typescript
import { prisma } from '../db/client.js'
import type {
  SystemPricingConfigResponse,
  OrgPricingConfigResponse,
  PropertyPricingConfigResponse,
} from '@ibe/shared'

const SYSTEM_DEFAULTS: SystemPricingConfigResponse = {
  enabled: false,
  openToAll: true,
  refreshIntervalDays: 1,
  highPricePct: 15,
  lowPricePct: 15,
  highAnomalyPct: 30,
  lowAnomalyPct: 30,
  dayDifferencePct: 35,
  dayDifferenceWindow: 7,
}

export async function getSystemPricingConfig(): Promise<SystemPricingConfigResponse> {
  const row = await prisma.systemPricingConfig.findFirst()
  return row ? {
    enabled: row.enabled,
    openToAll: row.openToAll,
    refreshIntervalDays: row.refreshIntervalDays,
    highPricePct: row.highPricePct,
    lowPricePct: row.lowPricePct,
    highAnomalyPct: row.highAnomalyPct,
    lowAnomalyPct: row.lowAnomalyPct,
    dayDifferencePct: row.dayDifferencePct,
    dayDifferenceWindow: row.dayDifferenceWindow,
  } : SYSTEM_DEFAULTS
}

export async function upsertSystemPricingConfig(data: Partial<SystemPricingConfigResponse>): Promise<SystemPricingConfigResponse> {
  const existing = await prisma.systemPricingConfig.findFirst()
  const row = existing
    ? await prisma.systemPricingConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemPricingConfig.create({ data: { ...SYSTEM_DEFAULTS, ...data } })
  return {
    enabled: row.enabled, openToAll: row.openToAll, refreshIntervalDays: row.refreshIntervalDays,
    highPricePct: row.highPricePct, lowPricePct: row.lowPricePct,
    highAnomalyPct: row.highAnomalyPct, lowAnomalyPct: row.lowAnomalyPct,
    dayDifferencePct: row.dayDifferencePct, dayDifferenceWindow: row.dayDifferenceWindow,
  }
}

export async function getOrgPricingConfig(orgId: number): Promise<OrgPricingConfigResponse> {
  const [system, org] = await Promise.all([
    getSystemPricingConfig(),
    prisma.orgPricingConfig.findUnique({ where: { organizationId: orgId } }),
  ])
  const effective = resolveOrgEffective(system, org)
  return {
    enabled: org?.enabled ?? null,
    systemServiceDisabled: org?.systemServiceDisabled ?? false,
    highPricePct: org?.highPricePct ?? null,
    lowPricePct: org?.lowPricePct ?? null,
    highAnomalyPct: org?.highAnomalyPct ?? null,
    lowAnomalyPct: org?.lowAnomalyPct ?? null,
    dayDifferencePct: org?.dayDifferencePct ?? null,
    dayDifferenceWindow: org?.dayDifferenceWindow ?? null,
    effective,
  }
}

export async function upsertOrgPricingConfig(orgId: number, data: Partial<OrgPricingConfigResponse>): Promise<OrgPricingConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.orgPricingConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...fields },
    update: fields,
  })
  return getOrgPricingConfig(orgId)
}

export async function getPropertyPricingConfig(propertyId: number): Promise<PropertyPricingConfigResponse> {
  const property = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  const orgId = property?.organizationId
  const [system, org, prop] = await Promise.all([
    getSystemPricingConfig(),
    orgId ? prisma.orgPricingConfig.findUnique({ where: { organizationId: orgId } }) : Promise.resolve(null),
    prisma.propertyPricingConfig.findUnique({ where: { propertyId } }),
  ])
  const orgEffective = resolveOrgEffective(system, org)
  const effective = resolvePropertyEffective(orgEffective, org, prop)
  return {
    enabled: prop?.enabled ?? null,
    orgServiceDisabled: prop?.orgServiceDisabled ?? false,
    highPricePct: prop?.highPricePct ?? null,
    lowPricePct: prop?.lowPricePct ?? null,
    highAnomalyPct: prop?.highAnomalyPct ?? null,
    lowAnomalyPct: prop?.lowAnomalyPct ?? null,
    dayDifferencePct: prop?.dayDifferencePct ?? null,
    dayDifferenceWindow: prop?.dayDifferenceWindow ?? null,
    effective,
  }
}

export async function upsertPropertyPricingConfig(propertyId: number, data: Partial<PropertyPricingConfigResponse>): Promise<PropertyPricingConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.propertyPricingConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...fields },
    update: fields,
  })
  return getPropertyPricingConfig(propertyId)
}

export async function resolveEffectivePricingConfig(propertyId: number): Promise<SystemPricingConfigResponse> {
  const result = await getPropertyPricingConfig(propertyId)
  return result.effective
}

export async function getEnabledPropertyIds(): Promise<number[]> {
  const system = await getSystemPricingConfig()
  if (!system.enabled) return []

  const properties = await prisma.property.findMany({
    where: { status: 'active' },
    include: {
      propertyPricingConfig: true,
      organization: { include: { orgPricingConfig: true } },
    },
  })

  return properties
    .filter(p => {
      const org = p.organization?.orgPricingConfig
      const prop = p.propertyPricingConfig
      if (org?.systemServiceDisabled) return false
      if (prop?.orgServiceDisabled) return false
      const effectiveEnabled = prop?.enabled ?? org?.enabled ?? system.enabled
      if (!system.openToAll && effectiveEnabled !== true) return false
      return effectiveEnabled === true
    })
    .map(p => p.propertyId)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveOrgEffective(
  system: SystemPricingConfigResponse,
  org: { enabled: boolean | null; systemServiceDisabled: boolean; highPricePct: number | null; lowPricePct: number | null; highAnomalyPct: number | null; lowAnomalyPct: number | null; dayDifferencePct: number | null; dayDifferenceWindow: number | null } | null,
): SystemPricingConfigResponse {
  if (org?.systemServiceDisabled) return { ...system, enabled: false }
  return {
    enabled: org?.enabled ?? system.enabled,
    openToAll: system.openToAll,
    refreshIntervalDays: system.refreshIntervalDays,
    highPricePct: org?.highPricePct ?? system.highPricePct,
    lowPricePct: org?.lowPricePct ?? system.lowPricePct,
    highAnomalyPct: org?.highAnomalyPct ?? system.highAnomalyPct,
    lowAnomalyPct: org?.lowAnomalyPct ?? system.lowAnomalyPct,
    dayDifferencePct: org?.dayDifferencePct ?? system.dayDifferencePct,
    dayDifferenceWindow: org?.dayDifferenceWindow ?? system.dayDifferenceWindow,
  }
}

function resolvePropertyEffective(
  orgEffective: SystemPricingConfigResponse,
  _org: { systemServiceDisabled: boolean } | null,
  prop: { enabled: boolean | null; orgServiceDisabled: boolean; highPricePct: number | null; lowPricePct: number | null; highAnomalyPct: number | null; lowAnomalyPct: number | null; dayDifferencePct: number | null; dayDifferenceWindow: number | null } | null,
): SystemPricingConfigResponse {
  if (prop?.orgServiceDisabled) return { ...orgEffective, enabled: false }
  return {
    enabled: prop?.enabled ?? orgEffective.enabled,
    openToAll: orgEffective.openToAll,
    refreshIntervalDays: orgEffective.refreshIntervalDays,
    highPricePct: prop?.highPricePct ?? orgEffective.highPricePct,
    lowPricePct: prop?.lowPricePct ?? orgEffective.lowPricePct,
    highAnomalyPct: prop?.highAnomalyPct ?? orgEffective.highAnomalyPct,
    lowAnomalyPct: prop?.lowAnomalyPct ?? orgEffective.lowAnomalyPct,
    dayDifferencePct: prop?.dayDifferencePct ?? orgEffective.dayDifferencePct,
    dayDifferenceWindow: prop?.dayDifferenceWindow ?? orgEffective.dayDifferenceWindow,
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx vitest run src/services/__tests__/pricing-config.service.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/pricing-config.service.ts apps/api/src/services/__tests__/pricing-config.service.test.ts
git commit -m "feat(pricing): add pricing config service with system/org/property inheritance"
```

---

## Task 5: Add `pricingEnabled` to Hotel Config Response

**Files:**
- Modify: `apps/api/src/services/config.service.ts`

- [ ] **Step 1: Read the current config service to find where property config is built**

Open `apps/api/src/services/config.service.ts` and find the function that builds the `HotelDesignConfig` response (look for `priceComparisonEnabled`).

- [ ] **Step 2: Add pricingEnabled to the return value**

In the function that returns `HotelDesignConfig`, add:

```typescript
import { resolveEffectivePricingConfig } from './pricing-config.service.js'
```

And in the config build (alongside `priceComparisonEnabled`):

```typescript
const effectivePricing = await resolveEffectivePricingConfig(propertyId)
// then in the return object:
pricingEnabled: effectivePricing.enabled,
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors (the type already has `pricingEnabled` from Task 3).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/config.service.ts
git commit -m "feat(pricing): expose pricingEnabled in property config response"
```

---

## Task 6: Price Classification Service (TDD)

**Files:**
- Create: `apps/api/src/services/pricing-classify.service.ts`
- Create: `apps/api/src/services/__tests__/pricing-classify.service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/services/__tests__/pricing-classify.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// Test the pure classification functions in isolation
// Import them after they exist
describe('assignCalendarColor', () => {
  it('returns normal when price is within threshold', async () => {
    const { assignCalendarColor } = await import('../pricing-classify.service.js')
    expect(assignCalendarColor(100, 100, 15, 15)).toBe('normal')
    expect(assignCalendarColor(114, 100, 15, 15)).toBe('normal') // 14% above, threshold is 15
  })

  it('returns high when price exceeds threshold', async () => {
    const { assignCalendarColor } = await import('../pricing-classify.service.js')
    expect(assignCalendarColor(120, 100, 15, 15)).toBe('high') // 20% above, threshold is 15
  })

  it('returns low when price is below threshold', async () => {
    const { assignCalendarColor } = await import('../pricing-classify.service.js')
    expect(assignCalendarColor(80, 100, 15, 15)).toBe('low') // 20% below, threshold is 15
  })

  it('returns normal when avg is 0', async () => {
    const { assignCalendarColor } = await import('../pricing-classify.service.js')
    expect(assignCalendarColor(100, 0, 15, 15)).toBe('normal')
  })
})

describe('computeRollingAvg', () => {
  it('returns avg of same-weekday prices within ±28 days', async () => {
    const { computeRollingAvg } = await import('../pricing-classify.service.js')
    // 2026-05-22 is a Friday (day 5)
    const rates = [
      { date: '2026-05-15', minSellPrice: 100, available: true }, // Friday -7 days
      { date: '2026-05-22', minSellPrice: 200, available: true }, // Friday target
      { date: '2026-05-29', minSellPrice: 150, available: true }, // Friday +7 days
      { date: '2026-05-23', minSellPrice: 999, available: true }, // Saturday — excluded
    ]
    // For 2026-05-22, window includes 2026-05-15 and 2026-05-29 (not the target itself)
    const avg = computeRollingAvg('2026-05-22', rates)
    expect(avg).toBeCloseTo(125) // (100 + 150) / 2
  })

  it('excludes unavailable days from the average', async () => {
    const { computeRollingAvg } = await import('../pricing-classify.service.js')
    const rates = [
      { date: '2026-05-15', minSellPrice: 100, available: false }, // unavailable Friday
      { date: '2026-05-22', minSellPrice: 200, available: true },  // target
      { date: '2026-05-29', minSellPrice: 150, available: true },  // Friday +7
    ]
    const avg = computeRollingAvg('2026-05-22', rates)
    expect(avg).toBeCloseTo(150) // only 2026-05-29 counts
  })
})

describe('assignAnomalyType', () => {
  it('returns high when price far above rolling avg', async () => {
    const { assignAnomalyType } = await import('../pricing-classify.service.js')
    const rates = [{ date: '2026-05-22', minSellPrice: 200, available: true }]
    // price=200, rollingAvg=100, highAnomalyPct=30 → 100% above → high
    expect(assignAnomalyType('2026-05-22', 200, 100, rates, 30, 30, 35, 7)).toBe('high')
  })

  it('returns diff when price drops vs previous days', async () => {
    const { assignAnomalyType } = await import('../pricing-classify.service.js')
    const rates = [
      { date: '2026-05-15', minSellPrice: 200, available: true },
      { date: '2026-05-16', minSellPrice: 200, available: true },
      { date: '2026-05-17', minSellPrice: 200, available: true },
      { date: '2026-05-18', minSellPrice: 200, available: true },
      { date: '2026-05-19', minSellPrice: 200, available: true },
      { date: '2026-05-20', minSellPrice: 200, available: true },
      { date: '2026-05-21', minSellPrice: 200, available: true },
      { date: '2026-05-22', minSellPrice: 100, available: true }, // 50% drop vs prev 7 days avg of 200
    ]
    // 50% drop > 35% threshold → diff
    expect(assignAnomalyType('2026-05-22', 100, 200, rates, 30, 30, 35, 7)).toBe('diff')
  })

  it('returns null when no anomaly', async () => {
    const { assignAnomalyType } = await import('../pricing-classify.service.js')
    const rates = [{ date: '2026-05-22', minSellPrice: 100, available: true }]
    expect(assignAnomalyType('2026-05-22', 100, 100, rates, 30, 30, 35, 7)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/api && npx vitest run src/services/__tests__/pricing-classify.service.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/pricing-classify.service.ts`:

```typescript
import { prisma } from '../db/client.js'
import { resolveEffectivePricingConfig } from './pricing-config.service.js'

interface RateRow {
  date: string
  minSellPrice: number
  available: boolean
}

export async function classifyDailyRates(propertyId: number): Promise<void> {
  const config = await resolveEffectivePricingConfig(propertyId)
  const rates = await prisma.dailyRate.findMany({
    where: { propertyId },
    orderBy: { date: 'asc' },
    select: { id: true, date: true, minSellPrice: true, available: true },
  })

  const rateRows: RateRow[] = rates.map(r => ({ date: r.date, minSellPrice: r.minSellPrice, available: r.available }))

  for (const rate of rates) {
    if (!rate.available) {
      await prisma.dailyRate.update({
        where: { id: rate.id },
        data: { calendarColor: 'normal', anomalyType: null, rollingAvg: null },
      })
      continue
    }

    const rollingAvg = computeRollingAvg(rate.date, rateRows)
    const calendarColor = assignCalendarColor(rate.minSellPrice, rollingAvg, config.highPricePct, config.lowPricePct)
    const anomalyType = assignAnomalyType(
      rate.date, rate.minSellPrice, rollingAvg, rateRows,
      config.highAnomalyPct, config.lowAnomalyPct, config.dayDifferencePct, config.dayDifferenceWindow,
    )

    await prisma.dailyRate.update({
      where: { id: rate.id },
      data: { calendarColor, anomalyType, rollingAvg },
    })
  }
}

export function computeRollingAvg(date: string, allRates: RateRow[]): number {
  const target = new Date(date + 'T00:00:00Z')
  const targetDay = target.getUTCDay()

  const window = allRates.filter(r => {
    if (!r.available || r.date === date) return false
    const d = new Date(r.date + 'T00:00:00Z')
    if (d.getUTCDay() !== targetDay) return false
    const diffDays = Math.abs((d.getTime() - target.getTime()) / 86_400_000)
    return diffDays <= 28
  })

  if (window.length === 0) return allRates.find(r => r.date === date)?.minSellPrice ?? 0
  return window.reduce((sum, r) => sum + r.minSellPrice, 0) / window.length
}

export function assignCalendarColor(
  price: number,
  avg: number,
  highPricePct: number,
  lowPricePct: number,
): 'low' | 'normal' | 'high' {
  if (avg === 0) return 'normal'
  const ratio = price / avg
  if (ratio > 1 + highPricePct / 100) return 'high'
  if (ratio < 1 - lowPricePct / 100) return 'low'
  return 'normal'
}

export function assignAnomalyType(
  date: string,
  price: number,
  rollingAvg: number,
  allRates: RateRow[],
  highAnomalyPct: number,
  lowAnomalyPct: number,
  dayDifferencePct: number,
  dayDifferenceWindow: number,
): 'high' | 'low' | 'diff' | null {
  if (rollingAvg > 0) {
    const ratio = price / rollingAvg
    if (ratio > 1 + highAnomalyPct / 100) return 'high'
    if (ratio < 1 - lowAnomalyPct / 100) return 'low'
  }

  const sorted = [...allRates].sort((a, b) => a.date.localeCompare(b.date))
  const idx = sorted.findIndex(r => r.date === date)
  if (idx > 0) {
    const prevDays = sorted.slice(Math.max(0, idx - dayDifferenceWindow), idx).filter(r => r.available)
    if (prevDays.length > 0) {
      const prevAvg = prevDays.reduce((sum, r) => sum + r.minSellPrice, 0) / prevDays.length
      if (prevAvg > 0 && (prevAvg - price) / prevAvg > dayDifferencePct / 100) return 'diff'
    }
  }

  return null
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx vitest run src/services/__tests__/pricing-classify.service.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/pricing-classify.service.ts apps/api/src/services/__tests__/pricing-classify.service.test.ts
git commit -m "feat(pricing): add classification service (rolling avg, calendarColor, anomalyType)"
```

---

## Task 7: Price Collection Service (TDD)

**Files:**
- Create: `apps/api/src/services/pricing-collect.service.ts`
- Create: `apps/api/src/services/__tests__/pricing-collect.service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/services/__tests__/pricing-collect.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../adapters/hyperguest/search.js', () => ({
  searchAvailability: vi.fn(),
}))
vi.mock('../../db/client.js', () => ({
  prisma: {
    property: { findUnique: vi.fn() },
    dailyRate: { upsert: vi.fn() },
  },
}))

import { searchAvailability } from '../../adapters/hyperguest/search.js'
import { prisma } from '../../db/client.js'

const mockSearch = searchAvailability as ReturnType<typeof vi.fn>
const mockPrisma = prisma as { property: { findUnique: ReturnType<typeof vi.fn> }; dailyRate: { upsert: ReturnType<typeof vi.fn> } }

function makeHGResponse(nights: number, basePrice = 100, currency = 'USD') {
  return {
    results: [{
      propertyId: 1,
      propertyInfo: { name: 'Test', starRating: 4, cityName: 'City', countryCode: 'TH', latitude: 0, longitude: 0 },
      remarks: [],
      rooms: [{
        roomId: 1, roomTypeCode: 'STD', roomName: 'Standard',
        numberOfAvailableRooms: 5,
        settings: { maxOccupancy: 2, maxAdultsNumber: 2, maxChildrenNumber: 1, roomSize: 30, beddingConfigurations: [] },
        ratePlans: [{
          ratePlanId: 1, ratePlanCode: 'BB', ratePlanName: 'Bed & Breakfast',
          board: 'BB', cancellationPolicies: [], remarks: [],
          ratePlanInfo: { virtual: false, contracts: [], originalRatePlanCode: 'BB', isPromotion: false, isPrivate: false },
          payment: { charge: 'agent', chargeType: 'prepaid', chargeAmount: { price: basePrice * nights, currency } },
          isImmediate: true,
          prices: {
            net: { price: basePrice * nights * 0.8, currency, taxes: [] },
            sell: { price: basePrice * nights, currency, taxes: [] },
            bar: { price: basePrice * nights, currency },
            commission: { price: 0, currency },
            fees: [],
          },
          nightlyBreakdown: Array.from({ length: nights }, (_, i) => {
            const d = new Date('2026-05-22')
            d.setDate(d.getDate() + i)
            return {
              date: d.toISOString().slice(0, 10),
              prices: {
                net: { price: basePrice * 0.8, currency, taxes: [] },
                sell: { price: basePrice, currency, taxes: [] },
                bar: { price: basePrice, currency },
                commission: { price: 0, currency },
                fees: [],
              },
            }
          }),
        }],
      }],
    }],
  }
}

describe('collectHotelPrices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 1, propertyId: 1 })
    mockPrisma.dailyRate.upsert.mockResolvedValue({})
  })

  it('calls searchAvailability in 29-day windows covering 365 days', async () => {
    mockSearch.mockResolvedValue(makeHGResponse(29))
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)

    // 12 full windows of 29 days + 1 final window of 17 = 13 calls total
    expect(mockSearch).toHaveBeenCalledTimes(13)
  })

  it('upserts a DailyRate row for each night', async () => {
    mockSearch.mockResolvedValue(makeHGResponse(29))
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)

    expect(mockPrisma.dailyRate.upsert).toHaveBeenCalledTimes(365)
  })

  it('marks nights as unavailable when search returns no rates for them', async () => {
    const response = makeHGResponse(29)
    // Remove nightlyBreakdown for first night to simulate unavailability
    response.results[0]!.rooms[0]!.ratePlans[0]!.nightlyBreakdown = 
      response.results[0]!.rooms[0]!.ratePlans[0]!.nightlyBreakdown.slice(1)
    mockSearch.mockResolvedValueOnce(response)
    mockSearch.mockResolvedValue(makeHGResponse(29))

    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)

    const firstCall = mockPrisma.dailyRate.upsert.mock.calls[0]![0]
    expect(firstCall.create.available).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd apps/api && npx vitest run src/services/__tests__/pricing-collect.service.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/pricing-collect.service.ts`:

```typescript
import { addDays, todayIso } from '@ibe/shared'
import type { HGSearchResponse } from '@ibe/shared'
import { searchAvailability } from '../adapters/hyperguest/search.js'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'

const WINDOW_DAYS = 29
const TOTAL_DAYS = 365

interface NightlyPrice {
  date: string
  minSellPrice: number
  currency: string
  available: boolean
}

export async function collectHotelPrices(propertyId: number): Promise<void> {
  const property = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  if (!property) throw new Error(`Property ${propertyId} not found`)

  const today = todayIso()
  const prices: NightlyPrice[] = []

  let offset = 0
  while (offset < TOTAL_DAYS) {
    const windowSize = Math.min(WINDOW_DAYS, TOTAL_DAYS - offset)
    const checkIn = addDays(today, offset)
    const checkOut = addDays(today, offset + windowSize)

    try {
      const hgResponse = await searchAvailability({
        hotelId: propertyId,
        checkIn,
        checkOut,
        rooms: [{ adults: 1, children: [] }],
      })
      prices.push(...extractNightlyPrices(hgResponse, checkIn, windowSize))
    } catch (err) {
      logger.warn({ err, propertyId, checkIn }, '[Pricing] Batch search failed — marking window unavailable')
      for (let i = 0; i < windowSize; i++) {
        prices.push({ date: addDays(today, offset + i), minSellPrice: 0, currency: 'USD', available: false })
      }
    }

    offset += windowSize
  }

  await upsertDailyRates(propertyId, prices)
}

function extractNightlyPrices(hgResponse: HGSearchResponse, checkIn: string, windowSize: number): NightlyPrice[] {
  const byDate = new Map<string, number>()
  let currency = 'USD'

  for (const result of hgResponse.results) {
    for (const room of result.rooms) {
      for (const rp of room.ratePlans) {
        currency = rp.prices.sell.currency
        for (const night of rp.nightlyBreakdown) {
          const existing = byDate.get(night.date)
          if (existing === undefined || night.prices.sell.price < existing) {
            byDate.set(night.date, night.prices.sell.price)
          }
        }
      }
    }
  }

  const prices: NightlyPrice[] = []
  for (let i = 0; i < windowSize; i++) {
    const date = addDays(checkIn, i)
    const price = byDate.get(date)
    prices.push(
      price !== undefined
        ? { date, minSellPrice: price, currency, available: true }
        : { date, minSellPrice: 0, currency, available: false },
    )
  }
  return prices
}

async function upsertDailyRates(propertyId: number, prices: NightlyPrice[]): Promise<void> {
  for (const p of prices) {
    await prisma.dailyRate.upsert({
      where: { propertyId_date: { propertyId, date: p.date } },
      create: {
        propertyId, date: p.date, minSellPrice: p.minSellPrice,
        currency: p.currency, available: p.available, collectedAt: new Date(),
      },
      update: {
        minSellPrice: p.minSellPrice, currency: p.currency,
        available: p.available, collectedAt: new Date(),
      },
    })
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx vitest run src/services/__tests__/pricing-collect.service.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/pricing-collect.service.ts apps/api/src/services/__tests__/pricing-collect.service.test.ts
git commit -m "feat(pricing): add price collection service (29-day batch HG searches)"
```

---

## Task 8: BullMQ Queue + Worker

**Files:**
- Create: `apps/api/src/services/pricing-queue.service.ts`

- [ ] **Step 1: Implement the queue service**

Create `apps/api/src/services/pricing-queue.service.ts`:

```typescript
import { Queue, Worker, type Job } from 'bullmq'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { collectHotelPrices } from './pricing-collect.service.js'
import { classifyDailyRates } from './pricing-classify.service.js'
import { cacheDel } from '../utils/cache.js'

export interface PricingJobData {
  propertyId: number
  triggeredBy: 'cron' | 'manual'
}

const CONNECTION = { url: env.REDIS_URL ?? 'redis://localhost:6379' }

let _queue: Queue<PricingJobData> | null = null
let _worker: Worker<PricingJobData> | null = null

function getQueue(): Queue<PricingJobData> {
  if (!_queue) {
    _queue = new Queue<PricingJobData>('pricing', { connection: CONNECTION })
  }
  return _queue
}

export async function enqueuePricingJob(propertyId: number, triggeredBy: 'cron' | 'manual'): Promise<'queued' | 'already_running'> {
  const queue = getQueue()
  const [active, waiting] = await Promise.all([queue.getActive(), queue.getWaiting()])
  const alreadyQueued = [...active, ...waiting].some(j => j.data.propertyId === propertyId)
  if (alreadyQueued) return 'already_running'

  const priority = triggeredBy === 'manual' ? 1 : 10
  await queue.add('collect-hotel-prices', { propertyId, triggeredBy }, { priority })
  return 'queued'
}

export async function getPricingJobStatus(propertyId: number): Promise<'idle' | 'queued' | 'running'> {
  const queue = getQueue()
  const [active, waiting] = await Promise.all([queue.getActive(), queue.getWaiting()])
  if (active.some(j => j.data.propertyId === propertyId)) return 'running'
  if (waiting.some(j => j.data.propertyId === propertyId)) return 'queued'
  return 'idle'
}

export function startPricingWorker(): Worker<PricingJobData> {
  if (!_worker) {
    _worker = new Worker<PricingJobData>(
      'pricing',
      async (job: Job<PricingJobData>) => {
        const { propertyId } = job.data
        logger.info({ propertyId }, '[Pricing] Job started')
        await collectHotelPrices(propertyId)
        await classifyDailyRates(propertyId)
        // Invalidate all currency variants of this property's calendar cache
        const { getRedis } = await import('../utils/redis.js')
        const redis = getRedis()
        const keys = await redis.keys(`pricing:calendar:${propertyId}:*`)
        if (keys.length > 0) await redis.del(...keys)
        logger.info({ propertyId }, '[Pricing] Job complete')
      },
      { connection: CONNECTION, concurrency: 2 },
    )

    _worker.on('failed', (job, err) => {
      logger.warn({ jobId: job?.id, propertyId: job?.data.propertyId, err }, '[Pricing] Job failed')
    })
  }
  return _worker
}

export async function closePricingQueue(): Promise<void> {
  await _worker?.close()
  await _queue?.close()
  _worker = null
  _queue = null
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/pricing-queue.service.ts
git commit -m "feat(pricing): add BullMQ queue and worker for price collection jobs"
```

---

## Task 9: Pricing Cron + Server Wiring

**Files:**
- Create: `apps/api/src/services/pricing-cron.service.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Create the cron service**

Create `apps/api/src/services/pricing-cron.service.ts`:

```typescript
import cron from 'node-cron'
import { logger } from '../utils/logger.js'
import { getSystemPricingConfig, getEnabledPropertyIds } from './pricing-config.service.js'
import { enqueuePricingJob } from './pricing-queue.service.js'

let _task: ReturnType<typeof cron.schedule> | undefined

export function startPricingCron(): void {
  const schedule = '0 2 * * *' // 2am UTC daily

  if (!cron.validate(schedule)) {
    logger.warn({ schedule }, '[Pricing] Invalid cron expression, skipping')
    return
  }

  _task = cron.schedule(schedule, async () => {
    try {
      const config = await getSystemPricingConfig()
      if (!config.enabled) {
        logger.debug('[Pricing] Cron fired but system pricing is disabled, skipping')
        return
      }
      const propertyIds = await getEnabledPropertyIds()
      logger.info({ count: propertyIds.length }, '[Pricing] Cron enqueuing jobs')
      for (const propertyId of propertyIds) {
        await enqueuePricingJob(propertyId, 'cron').catch(err =>
          logger.warn({ err, propertyId }, '[Pricing] Failed to enqueue cron job (non-fatal)'),
        )
      }
    } catch (err) {
      logger.warn({ err }, '[Pricing] Cron run failed (non-fatal)')
    }
  }, { noOverlap: true })

  logger.info({ schedule }, '[Pricing] Cron scheduled')
}

export function stopPricingCron(): void {
  _task?.stop()
}
```

- [ ] **Step 2: Wire into server.ts — startup**

In `apps/api/src/server.ts`, after the existing cron startups (after `startEventCalendarCron`), add:

```typescript
  // Start pricing cron + BullMQ worker (non-fatal)
  void import('./services/pricing-cron.service.js').then(m => m.startPricingCron()).catch(err =>
    logger.warn({ err }, '[Pricing] Cron setup failed (non-fatal)'),
  )
  void import('./services/pricing-queue.service.js').then(m => m.startPricingWorker()).catch(err =>
    logger.warn({ err }, '[Pricing] Worker setup failed (non-fatal)'),
  )
```

- [ ] **Step 3: Wire into server.ts — shutdown**

In the shutdown handler (alongside `stopCompSetCron` etc.), add:

```typescript
    const { stopPricingCron } = await import('./services/pricing-cron.service.js')
    stopPricingCron()
    const { closePricingQueue } = await import('./services/pricing-queue.service.js')
    await closePricingQueue()
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/pricing-cron.service.ts apps/api/src/server.ts
git commit -m "feat(pricing): add pricing cron and wire BullMQ worker into server lifecycle"
```

---

## Task 10: Pricing API Routes

**Files:**
- Create: `apps/api/src/routes/pricing.route.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create the routes file**

Create `apps/api/src/routes/pricing.route.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/client.js'
import {
  getSystemPricingConfig, upsertSystemPricingConfig,
  getOrgPricingConfig, upsertOrgPricingConfig,
  getPropertyPricingConfig, upsertPropertyPricingConfig,
  resolveEffectivePricingConfig,
} from '../services/pricing-config.service.js'
import { enqueuePricingJob, getPricingJobStatus } from '../services/pricing-queue.service.js'
import { getExchangeRates } from '../services/rates.service.js'
import { cacheGet, cacheSet } from '../utils/cache.js'
import type { DayPriceEntry, DayRateAdminEntry, PricingJobStatus } from '@ibe/shared'

const CALENDAR_TTL = 3600

export async function pricingPublicRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { propertyId: string }; Querystring: { currency?: string } }>(
    '/api/v1/pricing/calendar/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })

      const currency = request.query.currency
      const cacheKey = `pricing:calendar:${propertyId}:${currency ?? 'native'}`
      const cached = await cacheGet<DayPriceEntry[]>(cacheKey)
      if (cached) return cached

      const config = await resolveEffectivePricingConfig(propertyId)
      if (!config.enabled) return reply.send([])

      const rates = await prisma.dailyRate.findMany({
        where: { propertyId },
        orderBy: { date: 'asc' },
        select: { date: true, minSellPrice: true, currency: true, available: true, calendarColor: true },
      })
      if (rates.length === 0) return reply.send([])

      const nativeCurrency = rates[0]!.currency
      let fxRate = 1
      if (currency && currency !== nativeCurrency) {
        try {
          const fx = await getExchangeRates(nativeCurrency)
          fxRate = fx.rates[currency] ?? 1
        } catch { /* skip conversion */ }
      }

      const result: DayPriceEntry[] = rates.map(r => ({
        date: r.date,
        price: Math.round(r.minSellPrice * fxRate * 100) / 100,
        currency: currency ?? nativeCurrency,
        available: r.available,
        calendarColor: r.calendarColor as 'low' | 'normal' | 'high',
      }))

      await cacheSet(cacheKey, result, CALENDAR_TTL)
      return result
    },
  )
}

export async function pricingAdminRoutes(fastify: FastifyInstance) {
  // ── System config ─────────────────────────────────────────────────────────
  fastify.get('/api/v1/admin/pricing/config/system', { preHandler: [fastify.authenticate] }, async () => {
    return getSystemPricingConfig()
  })

  fastify.put('/api/v1/admin/pricing/config/system', { preHandler: [fastify.authenticate] }, async (request) => {
    return upsertSystemPricingConfig(request.body as Parameters<typeof upsertSystemPricingConfig>[0])
  })

  // ── Org config ────────────────────────────────────────────────────────────
  fastify.get<{ Params: { orgId: string } }>(
    '/api/v1/admin/pricing/config/org/:orgId',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      return getOrgPricingConfig(parseInt(request.params.orgId, 10))
    },
  )

  fastify.put<{ Params: { orgId: string } }>(
    '/api/v1/admin/pricing/config/org/:orgId',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      return upsertOrgPricingConfig(parseInt(request.params.orgId, 10), request.body as Parameters<typeof upsertOrgPricingConfig>[1])
    },
  )

  // ── Property config ───────────────────────────────────────────────────────
  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/config/property/:propertyId',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      return getPropertyPricingConfig(parseInt(request.params.propertyId, 10))
    },
  )

  fastify.put<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/config/property/:propertyId',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      return upsertPropertyPricingConfig(parseInt(request.params.propertyId, 10), request.body as Parameters<typeof upsertPropertyPricingConfig>[1])
    },
  )

  // ── Operations ────────────────────────────────────────────────────────────
  fastify.post<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/refresh/:propertyId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      const status = await enqueuePricingJob(propertyId, 'manual')
      return reply.send({ status })
    },
  )

  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/status/:propertyId',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      const [jobStatus, lastRate, dayCount] = await Promise.all([
        getPricingJobStatus(propertyId),
        prisma.dailyRate.findFirst({
          where: { propertyId },
          orderBy: { collectedAt: 'desc' },
          select: { collectedAt: true },
        }),
        prisma.dailyRate.count({ where: { propertyId } }),
      ])
      const result: PricingJobStatus = {
        status: jobStatus,
        lastCollectedAt: lastRate?.collectedAt.toISOString() ?? null,
        dayCount,
      }
      return result
    },
  )

  // ── Admin data (full daily rates with anomalyType for dashboard/export) ──
  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/data/:propertyId',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      const rates = await prisma.dailyRate.findMany({
        where: { propertyId },
        orderBy: { date: 'asc' },
        select: { date: true, minSellPrice: true, currency: true, available: true, calendarColor: true, anomalyType: true, rollingAvg: true },
      })
      return rates as DayRateAdminEntry[]
    },
  )
}
```

- [ ] **Step 2: Register routes in app.ts**

In `apps/api/src/app.ts`, add the imports and register after the existing routes:

```typescript
import { pricingPublicRoutes, pricingAdminRoutes } from './routes/pricing.route.js'
```

And in the route registration section:

```typescript
  await app.register(pricingPublicRoutes)
  await app.register(pricingAdminRoutes)
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/pricing.route.ts apps/api/src/app.ts
git commit -m "feat(pricing): add public calendar API and admin pricing config/ops routes"
```

---

## Task 11: Add Pricing API Methods to Frontend Client

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add pricing methods to apiClient**

In `apps/web/src/lib/api-client.ts`, add these methods to the apiClient object (alongside the other admin config methods):

```typescript
  // ── Pricing ───────────────────────────────────────────────────────────────
  getPricingCalendar(propertyId: number, currency?: string): Promise<import('@ibe/shared').DayPriceEntry[]> {
    const qs = currency ? `?currency=${currency}` : ''
    return apiRequest(`/api/v1/pricing/calendar/${propertyId}${qs}`)
  },

  getSystemPricingConfig(): Promise<import('@ibe/shared').SystemPricingConfigResponse> {
    return apiRequest('/api/v1/admin/pricing/config/system')
  },

  updateSystemPricingConfig(data: Partial<import('@ibe/shared').SystemPricingConfigResponse>): Promise<import('@ibe/shared').SystemPricingConfigResponse> {
    return apiRequest('/api/v1/admin/pricing/config/system', { method: 'PUT', body: JSON.stringify(data) })
  },

  getOrgPricingConfig(orgId: number): Promise<import('@ibe/shared').OrgPricingConfigResponse> {
    return apiRequest(`/api/v1/admin/pricing/config/org/${orgId}`)
  },

  updateOrgPricingConfig(orgId: number, data: Partial<import('@ibe/shared').OrgPricingConfigResponse>): Promise<import('@ibe/shared').OrgPricingConfigResponse> {
    return apiRequest(`/api/v1/admin/pricing/config/org/${orgId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  getPropertyPricingConfig(propertyId: number): Promise<import('@ibe/shared').PropertyPricingConfigResponse> {
    return apiRequest(`/api/v1/admin/pricing/config/property/${propertyId}`)
  },

  updatePropertyPricingConfig(propertyId: number, data: Partial<import('@ibe/shared').PropertyPricingConfigResponse>): Promise<import('@ibe/shared').PropertyPricingConfigResponse> {
    return apiRequest(`/api/v1/admin/pricing/config/property/${propertyId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  triggerPricingRefresh(propertyId: number): Promise<{ status: 'queued' | 'already_running' }> {
    return apiRequest(`/api/v1/admin/pricing/refresh/${propertyId}`, { method: 'POST' })
  },

  getPricingStatus(propertyId: number): Promise<import('@ibe/shared').PricingJobStatus> {
    return apiRequest(`/api/v1/admin/pricing/status/${propertyId}`)
  },

  getAdminPricingData(propertyId: number): Promise<import('@ibe/shared').DayRateAdminEntry[]> {
    return apiRequest(`/api/v1/admin/pricing/data/${propertyId}`)
  },
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat(pricing): add pricing API methods to frontend client"
```

---

## Task 12: Misc Nav + Admin Pricing Config Page

**Files:**
- Modify: `apps/web/src/app/admin/_layout-client.tsx`
- Create: `apps/web/src/app/admin/config/misc/pricing/page.tsx`

- [ ] **Step 1: Add Misc nav group**

In `apps/web/src/app/admin/_layout-client.tsx`, add a new nav group after the `Intelligence` group:

```typescript
  {
    title: 'Misc',
    sellerOnly: true,
    items: [
      { href: '/admin/config/misc/pricing', label: 'Pricing', sellerOnly: true },
    ],
  },
```

- [ ] **Step 2: Create the pricing config page**

Create `apps/web/src/app/admin/config/misc/pricing/page.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../../property-context'
import { SaveBar } from '../../../design/components'
import type {
  SystemPricingConfigResponse,
  OrgPricingConfigResponse,
  PropertyPricingConfigResponse,
  DayRateAdminEntry,
} from '@ibe/shared'

// ── Shared primitives ─────────────────────────────────────────────────────────

const inputCls = 'w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="mb-5 text-base font-semibold text-[var(--color-text)]">{title}</h2>
      {children}
    </div>
  )
}

function PctField({ label, value, onChange, inherited }: { label: string; value: number | null; onChange: (v: number | null) => void; inherited?: number }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--color-text)]">{label}</span>
      <div className="flex items-center gap-2">
        {inherited !== undefined && value === null && (
          <span className="text-xs text-[var(--color-text-muted)]">({inherited}% inherited)</span>
        )}
        <div className="relative">
          <input
            type="number" min={0} max={100} step={1}
            value={value ?? ''}
            placeholder={inherited !== undefined ? String(inherited) : ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className={inputCls}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)]">%</span>
        </div>
      </div>
    </div>
  )
}

// ── Export helper ─────────────────────────────────────────────────────────────

function exportToExcel(rates: DayRateAdminEntry[], propertyId: number) {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const rows = rates.map(r => ({
    'Date': r.date,
    'Day of Week': DAYS[new Date(r.date + 'T00:00:00Z').getUTCDay()],
    'Min Sell Price': r.price,
    'Currency': r.currency,
    'Available': r.available ? 'Y' : 'N',
    'Calendar Color': r.calendarColor,
    'Anomaly Type': r.anomalyType ?? '',
    'Rolling Avg': r.rollingAvg ?? '',
    '% vs Avg': r.rollingAvg && r.rollingAvg > 0
      ? `${((r.price / r.rollingAvg - 1) * 100).toFixed(1)}%`
      : '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Rates')
  const d = new Date()
  const date = `${String(d.getDate()).padStart(2, '0')}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}-${d.getFullYear()}`
  XLSX.writeFile(wb, `Pricing ${propertyId}_${date}.xlsx`)
}

// ── System level ──────────────────────────────────────────────────────────────

function SystemPricingSection() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['pricing-config-system'],
    queryFn: () => apiClient.getSystemPricingConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<SystemPricingConfigResponse>) => apiClient.updateSystemPricingConfig(u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pricing-config-system'] }) },
  })

  const [form, setForm] = useState<SystemPricingConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const dirty = JSON.stringify(form) !== JSON.stringify(data)
  const set = (k: keyof SystemPricingConfigResponse) => (v: unknown) => setForm(f => f ? { ...f, [k]: v } : f)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between py-2">
        <span className="text-sm font-medium text-[var(--color-text)]">Enabled</span>
        <Toggle checked={form.enabled} onChange={set('enabled')} />
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Open to all organisations</span>
        <Toggle checked={form.openToAll} onChange={set('openToAll')} />
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Refresh interval (days)</span>
        <input type="number" min={1} max={30} value={form.refreshIntervalDays}
          onChange={e => set('refreshIntervalDays')(Number(e.target.value))} className={inputCls} />
      </div>
      <div className="border-t border-[var(--color-border)] pt-3 mt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Calendar thresholds</p>
        <PctField label="High Price %" value={form.highPricePct} onChange={v => set('highPricePct')(v ?? 15)} />
        <PctField label="Low Price %" value={form.lowPricePct} onChange={v => set('lowPricePct')(v ?? 15)} />
      </div>
      <div className="border-t border-[var(--color-border)] pt-3 mt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Anomaly thresholds</p>
        <PctField label="High Anomaly %" value={form.highAnomalyPct} onChange={v => set('highAnomalyPct')(v ?? 30)} />
        <PctField label="Low Anomaly %" value={form.lowAnomalyPct} onChange={v => set('lowAnomalyPct')(v ?? 30)} />
        <PctField label="Day Difference %" value={form.dayDifferencePct} onChange={v => set('dayDifferencePct')(v ?? 35)} />
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-[var(--color-text)]">Day Difference window (days)</span>
          <input type="number" min={1} max={90} value={form.dayDifferenceWindow}
            onChange={e => set('dayDifferenceWindow')(Number(e.target.value))} className={inputCls} />
        </div>
      </div>
      {dirty && <SaveBar onSave={() => saveMutation.mutate(form)} saving={saveMutation.isPending} />}
    </div>
  )
}

// ── Org level ─────────────────────────────────────────────────────────────────

function OrgPricingSection({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['pricing-config-org', orgId],
    queryFn: () => apiClient.getOrgPricingConfig(orgId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<OrgPricingConfigResponse>) => apiClient.updateOrgPricingConfig(orgId, u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pricing-config-org', orgId] }) },
  })

  const [form, setForm] = useState<OrgPricingConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const eff = data.effective
  const dirty = JSON.stringify(form) !== JSON.stringify(data)
  const set = (k: keyof OrgPricingConfigResponse) => (v: unknown) => setForm(f => f ? { ...f, [k]: v } : f)

  return (
    <div className="space-y-2">
      {form.systemServiceDisabled && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
          Pricing service is disabled for this organisation by a super admin.
        </div>
      )}
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Opt out of system pricing</span>
        <Toggle checked={form.systemServiceDisabled} onChange={set('systemServiceDisabled')} />
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Enabled override</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">{form.enabled === null ? '(inheriting)' : ''}</span>
          <Toggle checked={form.enabled ?? eff.enabled} onChange={v => set('enabled')(v)} />
          {form.enabled !== null && (
            <button onClick={() => set('enabled')(null)} className="text-xs text-[var(--color-primary)] underline">Reset</button>
          )}
        </div>
      </div>
      <PctField label="High Price %" value={form.highPricePct} onChange={set('highPricePct')} inherited={eff.highPricePct} />
      <PctField label="Low Price %" value={form.lowPricePct} onChange={set('lowPricePct')} inherited={eff.lowPricePct} />
      <PctField label="High Anomaly %" value={form.highAnomalyPct} onChange={set('highAnomalyPct')} inherited={eff.highAnomalyPct} />
      <PctField label="Low Anomaly %" value={form.lowAnomalyPct} onChange={set('lowAnomalyPct')} inherited={eff.lowAnomalyPct} />
      <PctField label="Day Difference %" value={form.dayDifferencePct} onChange={set('dayDifferencePct')} inherited={eff.dayDifferencePct} />
      {dirty && <SaveBar onSave={() => saveMutation.mutate(form)} saving={saveMutation.isPending} />}
    </div>
  )
}

// ── Property level ────────────────────────────────────────────────────────────

function PropertyPricingSection({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const { data: config } = useQuery({
    queryKey: ['pricing-config-property', propertyId],
    queryFn: () => apiClient.getPropertyPricingConfig(propertyId),
  })
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['pricing-status', propertyId],
    queryFn: () => apiClient.getPricingStatus(propertyId),
    refetchInterval: 8_000,
  })
  const { data: ratesData } = useQuery({
    queryKey: ['pricing-admin-data', propertyId],
    queryFn: () => apiClient.getAdminPricingData(propertyId),
    enabled: (status?.dayCount ?? 0) > 0,
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<PropertyPricingConfigResponse>) => apiClient.updatePropertyPricingConfig(propertyId, u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pricing-config-property', propertyId] }) },
  })
  const refreshMutation = useMutation({
    mutationFn: () => apiClient.triggerPricingRefresh(propertyId),
    onSuccess: () => { void refetchStatus() },
  })

  const [form, setForm] = useState<PropertyPricingConfigResponse | null>(null)
  useEffect(() => { if (config) setForm(config) }, [config])

  if (!config || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const eff = config.effective
  const dirty = JSON.stringify(form) !== JSON.stringify(config)
  const set = (k: keyof PropertyPricingConfigResponse) => (v: unknown) => setForm(f => f ? { ...f, [k]: v } : f)

  return (
    <div className="space-y-2">
      {form.orgServiceDisabled && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
          Pricing is disabled for this hotel by the chain admin.
        </div>
      )}
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Opt out</span>
        <Toggle checked={form.orgServiceDisabled} onChange={set('orgServiceDisabled')} />
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Enabled override</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">{form.enabled === null ? '(inheriting)' : ''}</span>
          <Toggle checked={form.enabled ?? eff.enabled} onChange={v => set('enabled')(v)} />
          {form.enabled !== null && (
            <button onClick={() => set('enabled')(null)} className="text-xs text-[var(--color-primary)] underline">Reset</button>
          )}
        </div>
      </div>
      <PctField label="High Price %" value={form.highPricePct} onChange={set('highPricePct')} inherited={eff.highPricePct} />
      <PctField label="Low Price %" value={form.lowPricePct} onChange={set('lowPricePct')} inherited={eff.lowPricePct} />
      <PctField label="High Anomaly %" value={form.highAnomalyPct} onChange={set('highAnomalyPct')} inherited={eff.highAnomalyPct} />
      <PctField label="Low Anomaly %" value={form.lowAnomalyPct} onChange={set('lowAnomalyPct')} inherited={eff.lowAnomalyPct} />
      <PctField label="Day Difference %" value={form.dayDifferencePct} onChange={set('dayDifferencePct')} inherited={eff.dayDifferencePct} />
      {dirty && <SaveBar onSave={() => saveMutation.mutate(form)} saving={saveMutation.isPending} />}

      <div className="mt-4 border-t border-[var(--color-border)] pt-4 flex items-center justify-between">
        <div className="text-xs text-[var(--color-text-muted)]">
          {status?.status === 'running' && 'Collecting…'}
          {status?.status === 'queued' && 'Queued…'}
          {status?.status === 'idle' && status.lastCollectedAt
            ? `Last collected: ${new Date(status.lastCollectedAt).toLocaleString()}`
            : status?.status === 'idle' ? 'Never collected' : ''}
          {status && status.dayCount > 0 && ` · ${status.dayCount} days`}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || status?.status === 'running' || status?.status === 'queued'}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40 transition-colors"
          >
            {refreshMutation.isPending ? 'Triggering…' : 'Refresh Now'}
          </button>
          <button
            onClick={() => ratesData && exportToExcel(ratesData, propertyId)}
            disabled={!ratesData || ratesData.length === 0}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Export Excel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PricingConfigPage() {
  const { admin } = useAdminAuth()
  const { propertyId, orgId } = useAdminProperty()
  const isSuper = admin?.role === 'super'
  const isSystem = propertyId == null && orgId == null && isSuper

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Pricing</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Configure price calendar and anomaly detection thresholds.</p>
      </div>

      {isSystem && isSuper && (
        <SectionCard title="System Defaults">
          <SystemPricingSection />
        </SectionCard>
      )}

      {!isSystem && orgId != null && propertyId == null && (
        <SectionCard title="Chain Override">
          <OrgPricingSection orgId={orgId} />
        </SectionCard>
      )}

      {propertyId != null && (
        <SectionCard title="Hotel Settings">
          <PropertyPricingSection propertyId={propertyId} />
        </SectionCard>
      )}
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/_layout-client.tsx apps/web/src/app/admin/config/misc/
git commit -m "feat(pricing): add Misc nav group and admin pricing config page"
```

---

## Task 13: Guest Calendar — Price Display

**Files:**
- Modify: `apps/web/src/components/search/CalendarDropdown.tsx`

- [ ] **Step 1: Add the compact price formatter and color helper**

At the top of `apps/web/src/components/search/CalendarDropdown.tsx`, after the imports, add:

```typescript
import type { DayPriceEntry } from '@ibe/shared'

function formatCompactPrice(price: number): string {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (price >= 1_000) return `${(price / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(Math.round(price))
}

function colorClass(calendarColor: 'low' | 'normal' | 'high'): string {
  if (calendarColor === 'low') return 'text-green-600'
  if (calendarColor === 'high') return 'text-red-500'
  return 'text-blue-500'
}
```

- [ ] **Step 2: Add `dailyRates` prop to `CalendarDropdownProps`**

In the `CalendarDropdownProps` interface, add:

```typescript
  dailyRates?: Record<string, DayPriceEntry>
  priceCurrency?: string
```

- [ ] **Step 3: Thread `dailyRates` through to the month grids**

In `CalendarDropdown`, pass `dailyRates` and `priceCurrency` down to both `InlineMonthGrid` and `DropdownMonthGrid` props. Add `dailyRates?: Record<string, DayPriceEntry>` and `priceCurrency?: string` to both grid's prop interfaces.

In the `inline` variant return:
```typescript
<InlineMonthGrid ... dailyRates={dailyRates} priceCurrency={priceCurrency} />
```

In the `dropdown` variant return:
```typescript
<DropdownMonthGrid ym={viewMonth} ... dailyRates={dailyRates} priceCurrency={priceCurrency} />
<DropdownMonthGrid ym={rightMonth} ... dailyRates={dailyRates} priceCurrency={priceCurrency} />
```

- [ ] **Step 4: Update the day cell rendering in both grids**

In both `InlineMonthGrid` and `DropdownMonthGrid`, inside the day cell rendering, replace the day number `<div>` with this pattern:

```typescript
const dayData = dailyRates?.[date]
const hasPrice = dayData && !isOverflow && !isPast && !isDisabled
const isUnavailable = dayData?.available === false && !isPast && !isOverflow

// Day circle stays the same but add strikethrough class when unavailable:
// Replace the existing number rendering inside the circle div:
<span className={isUnavailable ? 'line-through opacity-60' : ''}>
  {parseInt(date.slice(-2), 10)}
</span>

// Price line below the circle (add inside the outer cell div, after the circle div):
<div className="text-center" style={{ fontSize: '9px', lineHeight: '1', marginTop: '1px' }}>
  {hasPrice && dayData.available
    ? <span className={colorClass(dayData.calendarColor)}>{formatCompactPrice(dayData.price)}</span>
    : <span className="text-[var(--color-text-muted)] opacity-40">·</span>
  }
</div>
```

- [ ] **Step 5: Add currency note below the calendar**

In the `inline` variant, after the `<InlineMonthGrid>` and before the Summary section, add:

```typescript
{dailyRates && priceCurrency && (
  <p className="mt-1 text-center text-[10px] text-[var(--color-text-muted)]">
    Prices in {priceCurrency}
  </p>
)}
```

In the `dropdown` variant, after the two `<DropdownMonthGrid>` blocks, add the same note.

- [ ] **Step 6: Fetch and pass daily rates from the hotel search page**

Find where `CalendarDropdown` is used in the search flow (check `apps/web/src/components/search/SearchBar.tsx` and `SearchSidebar.tsx`). In the component that wraps `CalendarDropdown`, add:

```typescript
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

// Inside the component, assuming `propertyId` and `currency` are available:
const { data: dailyRates } = useQuery({
  queryKey: ['pricing-calendar', propertyId, currency],
  queryFn: () => apiClient.getPricingCalendar(propertyId, currency),
  enabled: !!propertyId && pricingEnabled, // pricingEnabled comes from HotelDesignConfig
  staleTime: 60 * 60 * 1000, // 1 hour
})

const dailyRatesMap = dailyRates
  ? Object.fromEntries(dailyRates.map(d => [d.date, d]))
  : undefined
```

Then pass to `CalendarDropdown`:
```typescript
<CalendarDropdown
  ...
  dailyRates={dailyRatesMap}
  priceCurrency={currency}
/>
```

- [ ] **Step 7: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/search/CalendarDropdown.tsx apps/web/src/components/search/SearchBar.tsx apps/web/src/components/search/SearchSidebar.tsx
git commit -m "feat(pricing): display color-coded prices and availability on guest search calendar"
```

---

## Task 14: Dashboard Anomaly Card

**Files:**
- Modify: `apps/web/src/app/admin/dashboard/page.tsx`

- [ ] **Step 1: Add `PricingAnomalyCard` component inside dashboard/page.tsx**

In `apps/web/src/app/admin/dashboard/page.tsx`, after the `CompSetInsightsCard` component definition, add:

```typescript
function PricingAnomalyCard({ propertyId }: { propertyId: number }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ high: true, low: true, diff: true })
  const statusQuery = useQuery({
    queryKey: ['pricing-status', propertyId],
    queryFn: () => apiClient.getPricingStatus(propertyId),
  })
  const ratesQuery = useQuery({
    queryKey: ['pricing-admin-data', propertyId],
    queryFn: () => apiClient.getAdminPricingData(propertyId),
    enabled: (statusQuery.data?.dayCount ?? 0) > 0,
  })

  if (!statusQuery.data || statusQuery.data.dayCount === 0) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Price Anomalies</p>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">No price data collected yet.</p>
      </div>
    )
  }

  const rates = ratesQuery.data ?? []
  const highAnomalies = rates.filter(r => r.anomalyType === 'high').sort((a, b) => {
    const da = a.rollingAvg && a.rollingAvg > 0 ? (a.price / a.rollingAvg - 1) : 0
    const db = b.rollingAvg && b.rollingAvg > 0 ? (b.price / b.rollingAvg - 1) : 0
    return db - da
  })
  const lowAnomalies = rates.filter(r => r.anomalyType === 'low').sort((a, b) => {
    const da = a.rollingAvg && a.rollingAvg > 0 ? (1 - a.price / a.rollingAvg) : 0
    const db = b.rollingAvg && b.rollingAvg > 0 ? (1 - b.price / b.rollingAvg) : 0
    return db - da
  })
  const diffAnomalies = rates.filter(r => r.anomalyType === 'diff')

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const currency = rates[0]?.currency ?? ''

  function AnomalyTable({ title, rows, type }: { title: string; rows: typeof rates; type: string }) {
    return (
      <div className="border-t border-[var(--color-border)] pt-4 mt-4">
        <button
          onClick={() => setOpen(o => ({ ...o, [type]: !o[type] }))}
          className="flex w-full items-center justify-between text-sm font-medium text-[var(--color-text)]"
        >
          <span>{title} <span className="ml-1 text-xs text-[var(--color-text-muted)]">({rows.length})</span></span>
          <span>{open[type] ? '▲' : '▼'}</span>
        </button>
        {open[type] && (
          rows.length === 0
            ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">No anomalies detected.</p>
            : (
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--color-text-muted)]">
                    <th className="pb-1 pr-2">Date</th>
                    <th className="pb-1 pr-2">Day</th>
                    <th className="pb-1 pr-2">Price</th>
                    <th className="pb-1 pr-2">Avg</th>
                    <th className="pb-1">Dev %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const dev = r.rollingAvg && r.rollingAvg > 0
                      ? ((r.price / r.rollingAvg - 1) * 100).toFixed(1)
                      : '—'
                    return (
                      <tr key={r.date} className="border-t border-[var(--color-border)]">
                        <td className="py-1 pr-2">{r.date}</td>
                        <td className="py-1 pr-2">{DAYS[new Date(r.date + 'T00:00:00Z').getUTCDay()]}</td>
                        <td className="py-1 pr-2">{r.price.toFixed(0)} {currency}</td>
                        <td className="py-1 pr-2">{r.rollingAvg?.toFixed(0) ?? '—'}</td>
                        <td className="py-1">{dev !== '—' ? `${Number(dev) >= 0 ? '+' : ''}${dev}%` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Price Anomalies</p>
        <span className="text-xs text-[var(--color-text-muted)]">
          {statusQuery.data.lastCollectedAt
            ? `Updated ${new Date(statusQuery.data.lastCollectedAt).toLocaleDateString()}`
            : ''}
        </span>
      </div>
      <AnomalyTable title="High Price" rows={highAnomalies} type="high" />
      <AnomalyTable title="Low Price" rows={lowAnomalies} type="low" />
      <AnomalyTable title="Day Difference" rows={diffAnomalies} type="diff" />
    </div>
  )
}
```

- [ ] **Step 2: Add `pricing-anomalies` to the SECTIONS list**

In the `SECTIONS` array (alongside `compset-insights`), add:

```typescript
  { id: 'pricing-anomalies', label: 'Price Anomalies' },
```

- [ ] **Step 3: Add the card to the render section**

After the CompSet Insights section in the render, add:

```typescript
      {visibleSections.has('pricing-anomalies') && propertyId != null && (
        <section>
          <SectionTitle>Price Anomalies</SectionTitle>
          <PricingAnomalyCard propertyId={propertyId} />
        </section>
      )}
```

- [ ] **Step 4: Add the import for `DayRateAdminEntry`**

Add to the existing import from `@ibe/shared`:

```typescript
import type { ..., DayRateAdminEntry } from '@ibe/shared'
```

- [ ] **Step 5: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/dashboard/page.tsx
git commit -m "feat(pricing): add price anomaly dashboard card with collapsible sub-tables"
```

---

## Final Verification

- [ ] **Step 1: Run all API tests**

```bash
cd apps/api && npx vitest run
```

Expected: all tests pass including the 3 new pricing test files.

- [ ] **Step 2: Full TypeScript check**

```bash
cd apps/api && npx tsc --noEmit && cd ../web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start the dev server and verify**

```bash
cd /home/nir/ibe && npm run dev
```

Verify:
- Admin nav shows Misc → Pricing
- System/chain/hotel pricing config pages render without error
- Calendar renders without error on a hotel page (no prices if no data collected)
- Dashboard page renders without error

- [ ] **Step 4: Trigger a test collection**

Via the admin UI Misc → Pricing (hotel level), click "Refresh Now". Verify the status changes to "Queued" then "Running" then shows a timestamp.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -p
git commit -m "fix(pricing): post-integration fixes"
```
