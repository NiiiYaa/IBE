# Intelligence — CompSet Sub-project 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Intelligence/CompSet foundation: admin nav restructure, three-tier search config inheritance, per-property competitor CRUD, Playwright-based rate collection engine, and cron scheduler.

**Architecture:** New `compset.service.ts` handles all CRUD (system config, search params, competitors). `compset-collect.service.ts` runs the collection: fetches own hotel rates from HyperGuest, scrapes each competitor via Playwright (AI fallback for unknown IBE types), stores results in `CompSetResult`. Cron + manual trigger both call the same `runPropertyCompSet` entry point. All follows the data-provider pattern already in the codebase.

**Tech Stack:** Prisma (PostgreSQL), Fastify, Playwright (existing `withStealthPage`), Vitest, React + TanStack Query, existing `searchAvailability` HyperGuest adapter, existing `getProviderAdapter` AI adapter, existing `buildExternalUrl` URL builder.

---

## File Map

**New API files:**
- Create: `apps/api/prisma/migrations/20260521000000_add_compset/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` — 4 new models + relations
- Create: `apps/api/src/services/compset.service.ts` — CRUD for system config, search params, competitors
- Create: `apps/api/src/services/compset-collect.service.ts` — collection engine (HG own rates + Playwright)
- Create: `apps/api/src/services/compset-cron.service.ts` — cron wrapper (same pattern as data-provider-cron)
- Create: `apps/api/src/routes/compset.route.ts` — all 12 API routes
- Modify: `apps/api/src/app.ts` — register `compsetRoutes`
- Modify: `apps/api/src/server.ts` — start/stop compset cron
- Create: `apps/api/src/services/__tests__/compset.service.test.ts`
- Create: `apps/api/src/services/__tests__/compset-collect.service.test.ts`

**New shared types:**
- Create: `packages/shared/src/types/compset.ts`
- Modify: `packages/shared/src/index.ts` — export compset types

**New web files:**
- Modify: `apps/web/src/app/admin/_layout-client.tsx` — add Intelligence section, keep Config/data-provider entry
- Create: `apps/web/src/app/admin/intelligence/data-provider/page.tsx` — redirect to new URL
- Create: `apps/web/src/app/admin/intelligence/compset/page.tsx` — full CompSet admin page
- Modify: `apps/web/src/lib/api-client.ts` — add compset API methods

---

## Task 1: Database Schema

**Files:**
- Create: `apps/api/prisma/migrations/20260521000000_add_compset/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add migration SQL**

Create `apps/api/prisma/migrations/20260521000000_add_compset/migration.sql`:

```sql
-- CreateTable: SystemCompSetConfig
CREATE TABLE IF NOT EXISTS "SystemCompSetConfig" (
    "id" SERIAL NOT NULL,
    "maxCompetitorsPerProperty" INTEGER NOT NULL DEFAULT 5,
    "cronSchedule" TEXT NOT NULL DEFAULT '0 3 * * *',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemCompSetConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompSetSearchParam
CREATE TABLE IF NOT EXISTS "CompSetSearchParam" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER,
    "propertyId" INTEGER,
    "offsetDays" INTEGER NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'US',
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompSetSearchParam_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompSetCompetitor
CREATE TABLE IF NOT EXISTS "CompSetCompetitor" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "searchUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastFetchAt" TIMESTAMP(3),
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompSetCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompSetResult
CREATE TABLE IF NOT EXISTS "CompSetResult" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "competitorId" INTEGER,
    "searchParamId" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "checkIn" TEXT NOT NULL,
    "checkOut" TEXT NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL,
    "countryCode" TEXT NOT NULL,
    "searchStatus" TEXT NOT NULL,
    "roomName" TEXT,
    "board" TEXT,
    "cancellation" TEXT,
    "pricePerNight" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompSetResult_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: CompSetSearchParam.orgId
ALTER TABLE "CompSetSearchParam" ADD CONSTRAINT "CompSetSearchParam_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompSetSearchParam.propertyId
ALTER TABLE "CompSetSearchParam" ADD CONSTRAINT "CompSetSearchParam_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompSetCompetitor.propertyId
ALTER TABLE "CompSetCompetitor" ADD CONSTRAINT "CompSetCompetitor_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CompSetResult.propertyId
ALTER TABLE "CompSetResult" ADD CONSTRAINT "CompSetResult_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CompSetResult.competitorId
ALTER TABLE "CompSetResult" ADD CONSTRAINT "CompSetResult_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "CompSetCompetitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompSetResult.searchParamId
ALTER TABLE "CompSetResult" ADD CONSTRAINT "CompSetResult_searchParamId_fkey"
    FOREIGN KEY ("searchParamId") REFERENCES "CompSetSearchParam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 2: Add models to schema.prisma**

In `apps/api/prisma/schema.prisma`, find the `// ── External IBE ──` comment block (around line 1681) and add these four models before it:

```prisma
// ── Intelligence CompSet ──────────────────────────────────────────────────────

model SystemCompSetConfig {
  id                        Int      @id @default(autoincrement())
  maxCompetitorsPerProperty Int      @default(5)
  cronSchedule              String   @default("0 3 * * *")
  enabled                   Boolean  @default(false)
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
}

model CompSetSearchParam {
  id          Int      @id @default(autoincrement())
  orgId       Int?
  propertyId  Int?
  offsetDays  Int
  nights      Int
  adults      Int
  countryCode String   @default("US")
  label       String
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  organization Organization?   @relation(fields: [orgId], references: [id], onDelete: SetNull)
  property     Property?       @relation(fields: [propertyId], references: [propertyId], onDelete: SetNull, map: "CompSetSearchParam_propertyId_fkey")
  results      CompSetResult[]
}

model CompSetCompetitor {
  id          Int       @id @default(autoincrement())
  propertyId  Int
  name        String
  searchUrl   String?
  sortOrder   Int       @default(0)
  status      String    @default("idle")
  lastFetchAt DateTime?
  errorMsg    String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  property Property        @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade, map: "CompSetCompetitor_propertyId_fkey")
  results  CompSetResult[]
}

model CompSetResult {
  id            Int       @id @default(autoincrement())
  propertyId    Int
  competitorId  Int?
  searchParamId Int
  fetchedAt     DateTime
  checkIn       String
  checkOut      String
  nights        Int
  adults        Int
  countryCode   String
  searchStatus  String
  roomName      String?
  board         String?
  cancellation  String?
  pricePerNight Float?
  total         Float?
  currency      String?
  createdAt     DateTime  @default(now())

  property     Property           @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade, map: "CompSetResult_propertyId_fkey")
  competitor   CompSetCompetitor? @relation(fields: [competitorId], references: [id], onDelete: SetNull)
  searchParam  CompSetSearchParam @relation(fields: [searchParamId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: Add back-relations to Property and Organization models**

In the `Property` model, add:
```prisma
  compSetSearchParams CompSetSearchParam[]
  compSetCompetitors  CompSetCompetitor[]
  compSetResults      CompSetResult[]
```

In the `Organization` model, add:
```prisma
  compSetSearchParams CompSetSearchParam[]
```

- [ ] **Step 4: Apply migration and generate client**

```bash
cd /home/nir/ibe/apps/api
npx prisma migrate resolve --applied 20260521000000_add_compset
npx prisma db execute --file prisma/migrations/20260521000000_add_compset/migration.sql --url "$(grep DATABASE_URL .env | cut -d= -f2-)"
npx prisma generate
touch src/server.ts
```

Expected: no errors, server restarts in `/tmp/api-server.log`.

- [ ] **Step 5: Commit**

```bash
cd /home/nir/ibe
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260521000000_add_compset/
git commit -m "feat: add CompSet database schema (SystemCompSetConfig, CompSetSearchParam, CompSetCompetitor, CompSetResult)"
```

---

## Task 2: Shared Types

**Files:**
- Create: `packages/shared/src/types/compset.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create compset.ts**

Create `packages/shared/src/types/compset.ts`:

```typescript
export interface SystemCompSetConfig {
  maxCompetitorsPerProperty: number
  cronSchedule: string
  enabled: boolean
}

export interface CompSetSearchParam {
  id: number
  orgId: number | null
  propertyId: number | null
  offsetDays: number
  nights: number
  adults: number
  countryCode: string
  label: string
  sortOrder: number
  tier: 'system' | 'chain' | 'hotel'
}

export interface CompSetSearchParamCreate {
  offsetDays: number
  nights: number
  adults: number
  countryCode: string
  sortOrder?: number
}

export interface CompSetCompetitor {
  id: number
  propertyId: number
  name: string
  searchUrl: string | null
  sortOrder: number
  status: 'idle' | 'fetching' | 'done' | 'error'
  lastFetchAt: string | null
  errorMsg: string | null
}

export interface CompSetCompetitorCreate {
  propertyId: number
  name: string
  searchUrl?: string | null
  sortOrder?: number
}

export interface CompSetCompetitorUpdate {
  name?: string
  searchUrl?: string | null
  sortOrder?: number
}

export interface CompSetResult {
  id: number
  propertyId: number
  competitorId: number | null
  searchParamId: number
  fetchedAt: string
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  countryCode: string
  searchStatus: 'found' | 'not_found' | 'error'
  roomName: string | null
  board: string | null
  cancellation: string | null
  pricePerNight: number | null
  total: number | null
  currency: string | null
}

export interface CompSetRunResponse {
  started: boolean
}
```

- [ ] **Step 2: Export from shared index**

In `packages/shared/src/index.ts`, add after the last `export type` line:

```typescript
export type * from './types/compset.js'
```

- [ ] **Step 3: Verify types build**

```bash
cd /home/nir/ibe/packages/shared
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add packages/shared/src/types/compset.ts packages/shared/src/index.ts
git commit -m "feat: add CompSet shared TypeScript types"
```

---

## Task 3: CompSet Service (CRUD)

**Files:**
- Create: `apps/api/src/services/compset.service.ts`

- [ ] **Step 1: Write the failing tests** (see Task 4 — write tests first, then implement)

Skip to Task 4 step 1, then return here.

- [ ] **Step 2: Implement compset.service.ts**

Create `apps/api/src/services/compset.service.ts`:

```typescript
import { prisma } from '../db/client.js'
import type {
  SystemCompSetConfig,
  CompSetSearchParam,
  CompSetSearchParamCreate,
  CompSetCompetitor,
  CompSetCompetitorCreate,
  CompSetCompetitorUpdate,
} from '@ibe/shared'

// ── Label generation ──────────────────────────────────────────────────────────

export function buildSearchParamLabel(offsetDays: number, nights: number, adults: number, countryCode: string): string {
  return `Today+${offsetDays} · ${nights} Night${nights !== 1 ? 's' : ''} · ${adults} Adult${adults !== 1 ? 's' : ''} · ${countryCode}`
}

// ── SystemCompSetConfig ───────────────────────────────────────────────────────

export async function getSystemCompSetConfig(): Promise<SystemCompSetConfig> {
  const row = await prisma.systemCompSetConfig.findFirst()
  return {
    maxCompetitorsPerProperty: row?.maxCompetitorsPerProperty ?? 5,
    cronSchedule: row?.cronSchedule ?? '0 3 * * *',
    enabled: row?.enabled ?? false,
  }
}

export async function upsertSystemCompSetConfig(data: Partial<SystemCompSetConfig>): Promise<SystemCompSetConfig> {
  const existing = await prisma.systemCompSetConfig.findFirst()
  const row = existing
    ? await prisma.systemCompSetConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemCompSetConfig.create({ data: {
        maxCompetitorsPerProperty: data.maxCompetitorsPerProperty ?? 5,
        cronSchedule: data.cronSchedule ?? '0 3 * * *',
        enabled: data.enabled ?? false,
      } })
  return {
    maxCompetitorsPerProperty: row.maxCompetitorsPerProperty,
    cronSchedule: row.cronSchedule,
    enabled: row.enabled,
  }
}

// ── CompSetSearchParam ────────────────────────────────────────────────────────

type Tier = 'system' | 'chain' | 'hotel'

function toParam(row: {
  id: number; orgId: number | null; propertyId: number | null;
  offsetDays: number; nights: number; adults: number; countryCode: string;
  label: string; sortOrder: number;
}, tier: Tier): CompSetSearchParam {
  return { id: row.id, orgId: row.orgId, propertyId: row.propertyId,
    offsetDays: row.offsetDays, nights: row.nights, adults: row.adults,
    countryCode: row.countryCode, label: row.label, sortOrder: row.sortOrder, tier }
}

/** Returns all params for a scope (null/null=system, orgId only=chain, propertyId only=hotel). */
export async function getScopedSearchParams(scope: { orgId?: number | null; propertyId?: number | null }): Promise<CompSetSearchParam[]> {
  if (scope.propertyId) {
    const rows = await prisma.compSetSearchParam.findMany({ where: { propertyId: scope.propertyId }, orderBy: { sortOrder: 'asc' } })
    return rows.map(r => toParam(r, 'hotel'))
  }
  if (scope.orgId) {
    const rows = await prisma.compSetSearchParam.findMany({ where: { orgId: scope.orgId, propertyId: null }, orderBy: { sortOrder: 'asc' } })
    return rows.map(r => toParam(r, 'chain'))
  }
  const rows = await prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: { sortOrder: 'asc' } })
  return rows.map(r => toParam(r, 'system'))
}

/** Returns the merged effective set for a property: system + chain + hotel, in that order. */
export async function getEffectiveSearchParams(propertyId: number): Promise<CompSetSearchParam[]> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId ?? null

  const [systemRows, chainRows, hotelRows] = await Promise.all([
    prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: { sortOrder: 'asc' } }),
    orgId ? prisma.compSetSearchParam.findMany({ where: { orgId, propertyId: null }, orderBy: { sortOrder: 'asc' } }) : [],
    prisma.compSetSearchParam.findMany({ where: { propertyId }, orderBy: { sortOrder: 'asc' } }),
  ])

  return [
    ...systemRows.map(r => toParam(r, 'system')),
    ...chainRows.map(r => toParam(r, 'chain')),
    ...hotelRows.map(r => toParam(r, 'hotel')),
  ]
}

export async function createSearchParam(scope: { orgId?: number | null; propertyId?: number | null }, data: CompSetSearchParamCreate): Promise<CompSetSearchParam> {
  const label = buildSearchParamLabel(data.offsetDays, data.nights, data.adults, data.countryCode)
  const row = await prisma.compSetSearchParam.create({
    data: {
      orgId: scope.orgId ?? null,
      propertyId: scope.propertyId ?? null,
      offsetDays: data.offsetDays,
      nights: data.nights,
      adults: data.adults,
      countryCode: data.countryCode,
      label,
      sortOrder: data.sortOrder ?? 0,
    },
  })
  const tier: Tier = scope.propertyId ? 'hotel' : scope.orgId ? 'chain' : 'system'
  return toParam(row, tier)
}

export async function updateSearchParam(id: number, data: Partial<CompSetSearchParamCreate>): Promise<CompSetSearchParam | null> {
  const existing = await prisma.compSetSearchParam.findUnique({ where: { id } })
  if (!existing) return null
  const updated = await prisma.compSetSearchParam.update({
    where: { id },
    data: {
      ...data,
      label: buildSearchParamLabel(
        data.offsetDays ?? existing.offsetDays,
        data.nights ?? existing.nights,
        data.adults ?? existing.adults,
        data.countryCode ?? existing.countryCode,
      ),
    },
  })
  const tier: Tier = updated.propertyId ? 'hotel' : updated.orgId ? 'chain' : 'system'
  return toParam(updated, tier)
}

export async function deleteSearchParam(id: number): Promise<boolean> {
  const existing = await prisma.compSetSearchParam.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.compSetSearchParam.delete({ where: { id } })
  return true
}

// ── CompSetCompetitor ─────────────────────────────────────────────────────────

function toCompetitor(row: {
  id: number; propertyId: number; name: string; searchUrl: string | null;
  sortOrder: number; status: string; lastFetchAt: Date | null; errorMsg: string | null;
}): CompSetCompetitor {
  return {
    id: row.id, propertyId: row.propertyId, name: row.name, searchUrl: row.searchUrl,
    sortOrder: row.sortOrder, status: row.status as CompSetCompetitor['status'],
    lastFetchAt: row.lastFetchAt?.toISOString() ?? null,
    errorMsg: row.errorMsg,
  }
}

export async function listCompetitors(propertyId: number): Promise<CompSetCompetitor[]> {
  const rows = await prisma.compSetCompetitor.findMany({ where: { propertyId }, orderBy: { sortOrder: 'asc' } })
  return rows.map(toCompetitor)
}

export async function createCompetitor(data: CompSetCompetitorCreate): Promise<CompSetCompetitor | { error: string }> {
  const config = await getSystemCompSetConfig()
  const count = await prisma.compSetCompetitor.count({ where: { propertyId: data.propertyId } })
  if (count >= config.maxCompetitorsPerProperty) {
    return { error: `Maximum ${config.maxCompetitorsPerProperty} competitors allowed per property` }
  }
  const row = await prisma.compSetCompetitor.create({
    data: {
      propertyId: data.propertyId,
      name: data.name,
      searchUrl: data.searchUrl ?? null,
      sortOrder: data.sortOrder ?? 0,
    },
  })
  return toCompetitor(row)
}

export async function updateCompetitor(id: number, data: CompSetCompetitorUpdate): Promise<CompSetCompetitor | null> {
  const existing = await prisma.compSetCompetitor.findUnique({ where: { id } })
  if (!existing) return null
  const row = await prisma.compSetCompetitor.update({ where: { id }, data })
  return toCompetitor(row)
}

export async function deleteCompetitor(id: number): Promise<boolean> {
  const existing = await prisma.compSetCompetitor.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.compSetCompetitor.delete({ where: { id } })
  return true
}

/** Returns all propertyIds that have at least one competitor (for cron iteration). */
export async function getActivePropertyIds(): Promise<number[]> {
  const rows = await prisma.compSetCompetitor.groupBy({ by: ['propertyId'] })
  return rows.map(r => r.propertyId)
}
```

- [ ] **Step 3: Run the tests**

```bash
cd /home/nir/ibe/apps/api
npx vitest run src/services/__tests__/compset.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add apps/api/src/services/compset.service.ts
git commit -m "feat: add compset.service — CRUD for system config, search params, competitors"
```

---

## Task 4: CompSet Service Tests

**Files:**
- Create: `apps/api/src/services/__tests__/compset.service.test.ts`

- [ ] **Step 1: Write tests**

Create `apps/api/src/services/__tests__/compset.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemCompSetConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    compSetSearchParam: {
      findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    compSetCompetitor: {
      findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(), groupBy: vi.fn(),
    },
    property: { findUnique: vi.fn() },
  },
}))

import { prisma } from '../../db/client.js'
import {
  buildSearchParamLabel,
  getSystemCompSetConfig,
  upsertSystemCompSetConfig,
  getScopedSearchParams,
  getEffectiveSearchParams,
  createSearchParam,
  updateSearchParam,
  deleteSearchParam,
  listCompetitors,
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
  getActivePropertyIds,
} from '../compset.service.js'

const mp = prisma as any

beforeEach(() => vi.clearAllMocks())

describe('buildSearchParamLabel', () => {
  it('generates singular forms when count is 1', () => {
    expect(buildSearchParamLabel(1, 1, 1, 'US')).toBe('Today+1 · 1 Night · 1 Adult · US')
  })
  it('generates plural forms when count > 1', () => {
    expect(buildSearchParamLabel(7, 5, 2, 'GB')).toBe('Today+7 · 5 Nights · 2 Adults · GB')
  })
})

describe('getSystemCompSetConfig', () => {
  it('returns defaults when no row exists', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue(null)
    const result = await getSystemCompSetConfig()
    expect(result).toEqual({ maxCompetitorsPerProperty: 5, cronSchedule: '0 3 * * *', enabled: false })
  })
  it('returns stored values', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue({ maxCompetitorsPerProperty: 10, cronSchedule: '0 4 * * *', enabled: true })
    const result = await getSystemCompSetConfig()
    expect(result.maxCompetitorsPerProperty).toBe(10)
    expect(result.enabled).toBe(true)
  })
})

describe('upsertSystemCompSetConfig', () => {
  it('creates a new row when none exists', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue(null)
    mp.systemCompSetConfig.create.mockResolvedValue({ maxCompetitorsPerProperty: 8, cronSchedule: '0 3 * * *', enabled: false })
    const result = await upsertSystemCompSetConfig({ maxCompetitorsPerProperty: 8 })
    expect(mp.systemCompSetConfig.create).toHaveBeenCalledWith({ data: expect.objectContaining({ maxCompetitorsPerProperty: 8 }) })
    expect(result.maxCompetitorsPerProperty).toBe(8)
  })
  it('updates existing row', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue({ id: 1, maxCompetitorsPerProperty: 5, cronSchedule: '0 3 * * *', enabled: false })
    mp.systemCompSetConfig.update.mockResolvedValue({ maxCompetitorsPerProperty: 5, cronSchedule: '0 3 * * *', enabled: true })
    const result = await upsertSystemCompSetConfig({ enabled: true })
    expect(mp.systemCompSetConfig.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { enabled: true } })
    expect(result.enabled).toBe(true)
  })
})

describe('getScopedSearchParams', () => {
  it('returns system params when no scope keys provided', async () => {
    mp.compSetSearchParam.findMany.mockResolvedValue([
      { id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, countryCode: 'US', label: 'Today+7 · 5 Nights · 2 Adults · US', sortOrder: 0 },
    ])
    const result = await getScopedSearchParams({})
    expect(result).toHaveLength(1)
    expect(result[0].tier).toBe('system')
    expect(mp.compSetSearchParam.findMany).toHaveBeenCalledWith({ where: { orgId: null, propertyId: null }, orderBy: { sortOrder: 'asc' } })
  })
  it('returns chain params when orgId provided', async () => {
    mp.compSetSearchParam.findMany.mockResolvedValue([
      { id: 2, orgId: 5, propertyId: null, offsetDays: 3, nights: 3, adults: 2, countryCode: 'DE', label: 'Today+3 · 3 Nights · 2 Adults · DE', sortOrder: 0 },
    ])
    const result = await getScopedSearchParams({ orgId: 5 })
    expect(result[0].tier).toBe('chain')
  })
  it('returns hotel params when propertyId provided', async () => {
    mp.compSetSearchParam.findMany.mockResolvedValue([
      { id: 3, orgId: null, propertyId: 100, offsetDays: 1, nights: 1, adults: 1, countryCode: 'FR', label: 'Today+1 · 1 Night · 1 Adult · FR', sortOrder: 0 },
    ])
    const result = await getScopedSearchParams({ propertyId: 100 })
    expect(result[0].tier).toBe('hotel')
  })
})

describe('getEffectiveSearchParams', () => {
  it('merges system + chain + hotel params in order', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([{ id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, countryCode: 'US', label: 'L1', sortOrder: 0 }])
      .mockResolvedValueOnce([{ id: 2, orgId: 5, propertyId: null, offsetDays: 3, nights: 3, adults: 2, countryCode: 'DE', label: 'L2', sortOrder: 0 }])
      .mockResolvedValueOnce([{ id: 3, orgId: null, propertyId: 100, offsetDays: 1, nights: 1, adults: 1, countryCode: 'FR', label: 'L3', sortOrder: 0 }])
    const result = await getEffectiveSearchParams(100)
    expect(result.map(r => r.tier)).toEqual(['system', 'chain', 'hotel'])
    expect(result).toHaveLength(3)
  })
})

describe('createSearchParam', () => {
  it('creates a system param and generates label', async () => {
    mp.compSetSearchParam.create.mockResolvedValue({
      id: 10, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, countryCode: 'US',
      label: 'Today+7 · 5 Nights · 2 Adults · US', sortOrder: 0,
    })
    const result = await createSearchParam({}, { offsetDays: 7, nights: 5, adults: 2, countryCode: 'US' })
    expect(mp.compSetSearchParam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ label: 'Today+7 · 5 Nights · 2 Adults · US', orgId: null, propertyId: null }),
    })
    expect(result.tier).toBe('system')
  })
})

describe('createCompetitor', () => {
  it('rejects when property has reached the max', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue({ maxCompetitorsPerProperty: 3, cronSchedule: '0 3 * * *', enabled: true })
    mp.compSetCompetitor.count.mockResolvedValue(3)
    const result = await createCompetitor({ propertyId: 100, name: 'Hotel X' })
    expect('error' in result).toBe(true)
    expect(mp.compSetCompetitor.create).not.toHaveBeenCalled()
  })
  it('creates when under the max', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue({ maxCompetitorsPerProperty: 5, cronSchedule: '0 3 * * *', enabled: true })
    mp.compSetCompetitor.count.mockResolvedValue(2)
    mp.compSetCompetitor.create.mockResolvedValue({ id: 1, propertyId: 100, name: 'Hotel X', searchUrl: null, sortOrder: 0, status: 'idle', lastFetchAt: null, errorMsg: null })
    const result = await createCompetitor({ propertyId: 100, name: 'Hotel X' })
    expect('error' in result).toBe(false)
    if (!('error' in result)) expect(result.name).toBe('Hotel X')
  })
})

describe('getActivePropertyIds', () => {
  it('returns distinct propertyIds from competitors', async () => {
    mp.compSetCompetitor.groupBy.mockResolvedValue([{ propertyId: 100 }, { propertyId: 200 }])
    const result = await getActivePropertyIds()
    expect(result).toEqual([100, 200])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail before implementation**

```bash
cd /home/nir/ibe/apps/api
npx vitest run src/services/__tests__/compset.service.test.ts
```

Expected: FAIL — module not found (service doesn't exist yet). Then return to Task 3 Step 2.

- [ ] **Step 3: Run tests again after implementation (Task 3 Step 3 above)**

```bash
cd /home/nir/ibe/apps/api
npx vitest run src/services/__tests__/compset.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit tests**

```bash
cd /home/nir/ibe
git add apps/api/src/services/__tests__/compset.service.test.ts
git commit -m "test: add compset.service unit tests"
```

---

## Task 5: Collection Engine

**Files:**
- Create: `apps/api/src/services/compset-collect.service.ts`

- [ ] **Step 1: Write tests first** (see Task 6 — then return here)

- [ ] **Step 2: Implement compset-collect.service.ts**

Create `apps/api/src/services/compset-collect.service.ts`:

```typescript
import type { Page } from 'playwright'
import { logger } from '../utils/logger.js'
import { prisma } from '../db/client.js'
import { buildExternalUrl } from './external-ibe.service.js'
import { withStealthPage } from './playwright-browser.service.js'
import { searchAvailability } from '../adapters/hyperguest/search.js'
import { resolveAIConfig } from './ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import { getEffectiveSearchParams, listCompetitors } from './compset.service.js'
import type { CompSetSearchParam } from '@ibe/shared'
import { CancellationPenaltyType } from '@ibe/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoomRate {
  roomName: string
  board: string
  cancellation: string
  pricePerNight: number
  total: number
  currency: string
}

// ── Cancellation policy helper ────────────────────────────────────────────────

export function deriveCancellation(policies: Array<{ daysBefore: number; penaltyType: string; amount: number }>): string {
  if (policies.length === 0) return 'Flexi'
  // NR = no free cancellation window: all penalties start at daysBefore === 0
  const hasGracePeriod = policies.some(p => p.daysBefore > 0)
  return hasGracePeriod ? 'Flexi' : 'NR'
}

// ── IBE-specific rate extractors ──────────────────────────────────────────────
// Map from IBE type (as returned by analyzeExternalIBEUrls) to an extractor fn.
// Add entries here as IBE-specific extractors are built. AI fallback handles the rest.

type RateExtractor = (page: Page) => Promise<RoomRate[]>

const IBE_EXTRACTORS: Record<string, RateExtractor> = {
  // e.g. 'sentec': extractSentecRates,
  // Populated incrementally. AI fallback used for all unregistered types.
}

// ── AI fallback rate extractor ────────────────────────────────────────────────

async function extractRatesWithAI(page: Page, orgId: number | null): Promise<RoomRate[]> {
  const aiConfig = await resolveAIConfig(undefined, orgId ?? undefined)
  if (!aiConfig) return []

  const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 8000))

  const systemPrompt = 'You are a hotel rate extractor. Return only valid JSON with no surrounding text.'
  const userPrompt = `Extract all available room rates from this hotel booking page text.
Return a JSON array of objects. Each object must have exactly these keys:
- roomName (string)
- board (one of: RO, BB, HB, FB, AI — Room Only/Bed&Breakfast/Half Board/Full Board/All Inclusive)
- cancellation (one of: NR, Flexi)
- pricePerNight (number)
- total (number)
- currency (3-letter ISO code, e.g. USD)

Page text:
${visibleText}

Return only the JSON array, no surrounding text.`

  try {
    const adapter = getProviderAdapter(aiConfig.provider)
    const response = await adapter.call(
      [{ role: 'user', content: userPrompt }],
      [],
      systemPrompt,
      aiConfig.apiKey,
      aiConfig.model,
    )
    if (response.stopReason === 'error' || !response.text) return []
    const jsonText = response.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed = JSON.parse(jsonText)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ── Own hotel rates from HyperGuest ──────────────────────────────────────────

async function fetchOwnRates(propertyId: number, param: CompSetSearchParam): Promise<RoomRate[]> {
  const checkIn = resolveDate(param.offsetDays)
  const checkOut = resolveDate(param.offsetDays + param.nights)

  const response = await searchAvailability({
    hotelId: propertyId,
    checkIn,
    checkOut,
    rooms: [{ adults: param.adults, childrenAges: [] }],
    nationality: param.countryCode,
  })

  const result = response.results.find(r => r.propertyId === propertyId)
  if (!result) return []

  const rates: RoomRate[] = []
  for (const room of result.rooms) {
    for (const rp of room.ratePlans) {
      rates.push({
        roomName: room.roomName,
        board: rp.board,
        cancellation: deriveCancellation(rp.cancellationPolicies.map(p => ({
          daysBefore: p.daysBefore,
          penaltyType: p.penaltyType,
          amount: p.amount,
        }))),
        total: rp.prices.sell.price,
        pricePerNight: rp.prices.sell.price / param.nights,
        currency: rp.prices.sell.currency,
      })
    }
  }
  return rates
}

// ── Competitor rates via Playwright ──────────────────────────────────────────

async function fetchCompetitorRates(
  searchUrl: string,
  orgId: number | null,
): Promise<RoomRate[]> {
  try {
    return await withStealthPage(searchUrl, async (page) => {
      // Detect IBE type from URL hostname
      const hostname = new URL(searchUrl).hostname
      const ibeType = Object.keys(IBE_EXTRACTORS).find(k => hostname.includes(k))

      if (ibeType) {
        const extractor = IBE_EXTRACTORS[ibeType]!
        return await extractor(page)
      }

      // AI fallback for unknown IBE types
      return await extractRatesWithAI(page, orgId)
    }, { navigationTimeout: 30000, idleTimeout: 15000 })
  } catch (err) {
    logger.warn({ err, searchUrl }, '[CompSet] Playwright scrape failed')
    return []
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function resolveDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]!
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runPropertyCompSet(propertyId: number): Promise<void> {
  logger.info({ propertyId }, '[CompSet] Starting collection run')

  const [params, competitors] = await Promise.all([
    getEffectiveSearchParams(propertyId),
    listCompetitors(propertyId),
  ])

  if (params.length === 0) {
    logger.info({ propertyId }, '[CompSet] No search params — skipping')
    return
  }

  // Get orgId for AI fallback
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId ?? null

  // Mark all competitors as fetching
  if (competitors.length > 0) {
    await prisma.compSetCompetitor.updateMany({
      where: { propertyId },
      data: { status: 'fetching' },
    })
  }

  // Delete stale results for this property
  await prisma.compSetResult.deleteMany({ where: { propertyId } })

  const fetchedAt = new Date()
  const toInsert: Parameters<typeof prisma.compSetResult.createMany>[0]['data'] = []

  for (const param of params) {
    const checkIn = resolveDate(param.offsetDays)
    const checkOut = resolveDate(param.offsetDays + param.nights)

    // Own hotel rates
    try {
      const ownRates = await fetchOwnRates(propertyId, param)
      for (const rate of ownRates) {
        toInsert.push({
          propertyId, competitorId: null, searchParamId: param.id,
          fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
          countryCode: param.countryCode, searchStatus: 'found',
          roomName: rate.roomName, board: rate.board, cancellation: rate.cancellation,
          pricePerNight: rate.pricePerNight, total: rate.total, currency: rate.currency,
        })
      }
      if (ownRates.length === 0) {
        toInsert.push({
          propertyId, competitorId: null, searchParamId: param.id,
          fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
          countryCode: param.countryCode, searchStatus: 'not_found',
          roomName: null, board: null, cancellation: null,
          pricePerNight: null, total: null, currency: null,
        })
      }
    } catch (err) {
      logger.warn({ err, propertyId, paramId: param.id }, '[CompSet] Own rates fetch failed')
      toInsert.push({
        propertyId, competitorId: null, searchParamId: param.id,
        fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
        countryCode: param.countryCode, searchStatus: 'error',
        roomName: null, board: null, cancellation: null,
        pricePerNight: null, total: null, currency: null,
      })
    }

    // Competitor rates
    for (const competitor of competitors) {
      if (!competitor.searchUrl) {
        await prisma.compSetCompetitor.update({ where: { id: competitor.id }, data: { status: 'error', errorMsg: 'No search URL configured', lastFetchAt: fetchedAt } })
        continue
      }

      const builtUrl = buildExternalUrl(competitor.searchUrl, {
        checkIn, checkOut, adults: param.adults,
        nights: param.nights, countryCode: param.countryCode,
      })

      try {
        const rates = await fetchCompetitorRates(builtUrl, orgId)
        for (const rate of rates) {
          toInsert.push({
            propertyId, competitorId: competitor.id, searchParamId: param.id,
            fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
            countryCode: param.countryCode, searchStatus: 'found',
            roomName: rate.roomName, board: rate.board, cancellation: rate.cancellation,
            pricePerNight: rate.pricePerNight, total: rate.total, currency: rate.currency,
          })
        }
        if (rates.length === 0) {
          toInsert.push({
            propertyId, competitorId: competitor.id, searchParamId: param.id,
            fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
            countryCode: param.countryCode, searchStatus: 'not_found',
            roomName: null, board: null, cancellation: null, pricePerNight: null, total: null, currency: null,
          })
        }
        await prisma.compSetCompetitor.update({
          where: { id: competitor.id },
          data: { status: 'done', lastFetchAt: fetchedAt, errorMsg: null },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await prisma.compSetCompetitor.update({
          where: { id: competitor.id },
          data: { status: 'error', lastFetchAt: fetchedAt, errorMsg: msg },
        })
      }
    }
  }

  if (toInsert.length > 0) {
    await prisma.compSetResult.createMany({ data: toInsert })
  }

  logger.info({ propertyId, rows: toInsert.length }, '[CompSet] Collection run complete')
}
```

- [ ] **Step 3: Run the tests**

```bash
cd /home/nir/ibe/apps/api
npx vitest run src/services/__tests__/compset-collect.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add apps/api/src/services/compset-collect.service.ts
git commit -m "feat: add compset-collect.service — HyperGuest own rates + Playwright competitor scraping"
```

---

## Task 6: Collection Engine Tests

**Files:**
- Create: `apps/api/src/services/__tests__/compset-collect.service.test.ts`

- [ ] **Step 1: Write tests**

Create `apps/api/src/services/__tests__/compset-collect.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    property: { findUnique: vi.fn() },
    compSetCompetitor: { updateMany: vi.fn(), update: vi.fn() },
    compSetResult: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}))
vi.mock('../compset.service.js', () => ({
  getEffectiveSearchParams: vi.fn(),
  listCompetitors: vi.fn(),
}))
vi.mock('../../adapters/hyperguest/search.js', () => ({ searchAvailability: vi.fn() }))
vi.mock('../playwright-browser.service.js', () => ({ withStealthPage: vi.fn() }))
vi.mock('../ai-config.service.js', () => ({ resolveAIConfig: vi.fn() }))
vi.mock('../external-ibe.service.js', () => ({
  buildExternalUrl: vi.fn((template: string) => template),
}))

import { prisma } from '../../db/client.js'
import { getEffectiveSearchParams, listCompetitors } from '../compset.service.js'
import { searchAvailability } from '../../adapters/hyperguest/search.js'
import { deriveCancellation, runPropertyCompSet } from '../compset-collect.service.js'

const mp = prisma as any
const mGetParams = getEffectiveSearchParams as any
const mListComp = listCompetitors as any
const mSearch = searchAvailability as any

beforeEach(() => vi.clearAllMocks())

describe('deriveCancellation', () => {
  it('returns Flexi when no policies', () => {
    expect(deriveCancellation([])).toBe('Flexi')
  })
  it('returns NR when all policies start at daysBefore=0', () => {
    expect(deriveCancellation([{ daysBefore: 0, penaltyType: 'percent', amount: 100 }])).toBe('NR')
  })
  it('returns Flexi when any policy has daysBefore > 0', () => {
    expect(deriveCancellation([{ daysBefore: 7, penaltyType: 'percent', amount: 100 }])).toBe('Flexi')
  })
})

describe('runPropertyCompSet', () => {
  const baseParam = {
    id: 1, orgId: null, propertyId: null, offsetDays: 1, nights: 2, adults: 2,
    countryCode: 'US', label: 'L', sortOrder: 0, tier: 'system' as const,
  }

  it('exits early when there are no search params', async () => {
    mGetParams.mockResolvedValue([])
    mListComp.mockResolvedValue([])
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    await runPropertyCompSet(100)
    expect(mp.compSetResult.deleteMany).not.toHaveBeenCalled()
  })

  it('stores own hotel rates when HyperGuest returns results', async () => {
    mGetParams.mockResolvedValue([baseParam])
    mListComp.mockResolvedValue([])
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetResult.deleteMany.mockResolvedValue({})
    mp.compSetResult.createMany.mockResolvedValue({})
    mSearch.mockResolvedValue({
      results: [{
        propertyId: 100,
        rooms: [{
          roomName: 'Deluxe Room',
          ratePlans: [{
            board: 'BB',
            cancellationPolicies: [{ daysBefore: 3, penaltyType: 'percent', amount: 100 }],
            prices: { sell: { price: 400, currency: 'USD' } },
          }],
        }],
      }],
    })

    await runPropertyCompSet(100)

    expect(mp.compSetResult.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          propertyId: 100,
          competitorId: null,
          searchStatus: 'found',
          roomName: 'Deluxe Room',
          board: 'BB',
          cancellation: 'Flexi',
          total: 400,
          pricePerNight: 200,
          currency: 'USD',
        }),
      ]),
    })
  })

  it('stores not_found row when HyperGuest returns no rooms for property', async () => {
    mGetParams.mockResolvedValue([baseParam])
    mListComp.mockResolvedValue([])
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetResult.deleteMany.mockResolvedValue({})
    mp.compSetResult.createMany.mockResolvedValue({})
    mSearch.mockResolvedValue({ results: [] })

    await runPropertyCompSet(100)

    expect(mp.compSetResult.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ competitorId: null, searchStatus: 'not_found' }),
      ]),
    })
  })

  it('marks competitor as error when no searchUrl configured', async () => {
    mGetParams.mockResolvedValue([baseParam])
    mListComp.mockResolvedValue([{ id: 10, propertyId: 100, name: 'Rival', searchUrl: null, sortOrder: 0, status: 'idle', lastFetchAt: null, errorMsg: null }])
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetCompetitor.updateMany.mockResolvedValue({})
    mp.compSetCompetitor.update.mockResolvedValue({})
    mp.compSetResult.deleteMany.mockResolvedValue({})
    mp.compSetResult.createMany.mockResolvedValue({})
    mSearch.mockResolvedValue({ results: [] })

    await runPropertyCompSet(100)

    expect(mp.compSetCompetitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10 }, data: expect.objectContaining({ status: 'error', errorMsg: 'No search URL configured' }) }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail before implementation**

```bash
cd /home/nir/ibe/apps/api
npx vitest run src/services/__tests__/compset-collect.service.test.ts
```

Expected: FAIL. Then complete Task 5 Step 2, then run again.

- [ ] **Step 3: Run after implementation**

```bash
cd /home/nir/ibe/apps/api
npx vitest run src/services/__tests__/compset-collect.service.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add apps/api/src/services/__tests__/compset-collect.service.test.ts
git commit -m "test: add compset-collect.service unit tests"
```

---

## Task 7: Cron Service

**Files:**
- Create: `apps/api/src/services/compset-cron.service.ts`

- [ ] **Step 1: Implement cron service**

Create `apps/api/src/services/compset-cron.service.ts`:

```typescript
import cron from 'node-cron'
import { logger } from '../utils/logger.js'
import { getSystemCompSetConfig, getActivePropertyIds } from './compset.service.js'
import { runPropertyCompSet } from './compset-collect.service.js'

let _task: ReturnType<typeof cron.schedule> | undefined

export function startCompSetCron(): void {
  // Schedule is read from DB at runtime so we default to daily here;
  // the actual DB value is checked inside the handler.
  const schedule = '0 3 * * *'

  _task = cron.schedule(schedule, async () => {
    try {
      const config = await getSystemCompSetConfig()
      if (!config.enabled) {
        logger.debug('[CompSet] Cron fired but system config has enabled=false, skipping')
        return
      }
      const propertyIds = await getActivePropertyIds()
      logger.info({ count: propertyIds.length }, '[CompSet] Cron starting collection for properties')
      for (const propertyId of propertyIds) {
        await runPropertyCompSet(propertyId).catch(err =>
          logger.warn({ err, propertyId }, '[CompSet] Collection failed for property (non-fatal)'),
        )
      }
    } catch (err) {
      logger.warn({ err }, '[CompSet] Cron run failed (non-fatal)')
    }
  }, { noOverlap: true })

  logger.info({ schedule }, '[CompSet] Cron scheduled')
}

export function stopCompSetCron(): void {
  _task?.stop()
}
```

- [ ] **Step 2: Wire into server.ts**

In `apps/api/src/server.ts`, find the block that starts the data-provider cron:
```typescript
void import('./services/data-provider-cron.service.js').then(m => m.startDataProviderCron())...
```

Add immediately after it:
```typescript
void import('./services/compset-cron.service.js').then(m => m.startCompSetCron()).catch(err =>
  logger.warn({ err }, '[CompSet] Cron setup failed (non-fatal)'),
)
```

Also find the graceful shutdown block that calls `stopDataProviderCron()` and add:
```typescript
const { stopCompSetCron } = await import('./services/compset-cron.service.js')
stopCompSetCron()
```

- [ ] **Step 3: Commit**

```bash
cd /home/nir/ibe
git add apps/api/src/services/compset-cron.service.ts apps/api/src/server.ts
git commit -m "feat: add compset cron service and wire into server lifecycle"
```

---

## Task 8: API Routes

**Files:**
- Create: `apps/api/src/routes/compset.route.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create compset.route.ts**

Create `apps/api/src/routes/compset.route.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import {
  getSystemCompSetConfig,
  upsertSystemCompSetConfig,
  getScopedSearchParams,
  getEffectiveSearchParams,
  createSearchParam,
  updateSearchParam,
  deleteSearchParam,
  listCompetitors,
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
} from '../services/compset.service.js'
import { runPropertyCompSet } from '../services/compset-collect.service.js'
import { getOrgIdForProperty } from '../services/property-registry.service.js'

export async function compsetRoutes(fastify: FastifyInstance) {

  // ── System config (super only) ────────────────────────────────────────────

  fastify.get('/admin/intelligence/compset/system-config', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    return reply.send(await getSystemCompSetConfig())
  })

  fastify.put('/admin/intelligence/compset/system-config', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    return reply.send(await upsertSystemCompSetConfig(request.body as Record<string, unknown>))
  })

  // ── Search params ─────────────────────────────────────────────────────────

  // GET — returns effective (merged) set for the caller's scope, or scoped-only when propertyId/orgId passed
  fastify.get('/admin/intelligence/compset/search-params', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = query.propertyId ? parseInt(query.propertyId, 10) : undefined
    const rawOrgId = query.orgId ? parseInt(query.orgId, 10) : undefined

    if (propertyId) {
      return reply.send(await getEffectiveSearchParams(propertyId))
    }

    const orgId = request.admin.role === 'super'
      ? (rawOrgId ?? request.admin.organizationId)
      : request.admin.organizationId

    if (query.effective === 'false') {
      return reply.send(await getScopedSearchParams({ orgId }))
    }

    // System level: no orgId
    if (request.admin.role === 'super' && !orgId) {
      return reply.send(await getScopedSearchParams({}))
    }

    return reply.send(await getScopedSearchParams({ orgId: orgId ?? null }))
  })

  fastify.post('/admin/intelligence/compset/search-params', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const rawOrgId = (body.orgId as number | undefined) ?? null
    const rawPropertyId = (body.propertyId as number | undefined) ?? null

    const orgId = request.admin.role === 'super'
      ? rawOrgId
      : request.admin.organizationId ?? null
    const propertyId = rawPropertyId

    const data = { offsetDays: body.offsetDays as number, nights: body.nights as number, adults: body.adults as number, countryCode: body.countryCode as string, sortOrder: body.sortOrder as number | undefined }
    const result = await createSearchParam({ orgId, propertyId }, data)
    return reply.status(201).send(result)
  })

  fastify.put('/admin/intelligence/compset/search-params/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const body = request.body as Record<string, unknown>
    const result = await updateSearchParam(id, body as Parameters<typeof updateSearchParam>[1])
    if (!result) return reply.status(404).send({ error: 'Not found' })
    return reply.send(result)
  })

  fastify.delete('/admin/intelligence/compset/search-params/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const deleted = await deleteSearchParam(id)
    if (!deleted) return reply.status(404).send({ error: 'Not found' })
    return reply.status(204).send()
  })

  // ── Competitors ───────────────────────────────────────────────────────────

  fastify.get('/admin/intelligence/compset/competitors', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = query.propertyId ? parseInt(query.propertyId, 10) : undefined
    if (!propertyId) return reply.status(400).send({ error: 'propertyId is required' })
    return reply.send(await listCompetitors(propertyId))
  })

  fastify.post('/admin/intelligence/compset/competitors', async (request, reply) => {
    const body = request.body as { propertyId: number; name: string; searchUrl?: string | null; sortOrder?: number }
    const result = await createCompetitor(body)
    if ('error' in result) return reply.status(400).send({ error: result.error })
    return reply.status(201).send(result)
  })

  fastify.put('/admin/intelligence/compset/competitors/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const body = request.body as Record<string, unknown>
    const result = await updateCompetitor(id, body as Parameters<typeof updateCompetitor>[1])
    if (!result) return reply.status(404).send({ error: 'Not found' })
    return reply.send(result)
  })

  fastify.delete('/admin/intelligence/compset/competitors/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const deleted = await deleteCompetitor(id)
    if (!deleted) return reply.status(404).send({ error: 'Not found' })
    return reply.status(204).send()
  })

  // ── Manual run trigger ────────────────────────────────────────────────────

  fastify.post('/admin/intelligence/compset/run', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = query.propertyId ? parseInt(query.propertyId, 10) : undefined
    if (!propertyId) return reply.status(400).send({ error: 'propertyId is required' })
    // Fire and forget — run in background
    void runPropertyCompSet(propertyId).catch(err =>
      fastify.log.warn({ err, propertyId }, '[CompSet] Background run failed'),
    )
    return reply.send({ started: true })
  })

  // ── Results ───────────────────────────────────────────────────────────────

  fastify.get('/admin/intelligence/compset/results', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = query.propertyId ? parseInt(query.propertyId, 10) : undefined
    if (!propertyId) return reply.status(400).send({ error: 'propertyId is required' })
    const rows = await (await import('../db/client.js')).prisma.compSetResult.findMany({
      where: { propertyId },
      orderBy: [{ fetchedAt: 'desc' }, { competitorId: 'asc' }, { id: 'asc' }],
    })
    return reply.send(rows.map(r => ({
      ...r,
      fetchedAt: r.fetchedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })))
  })
}
```

- [ ] **Step 2: Register route in app.ts**

In `apps/api/src/app.ts`, add the import at the top with other admin route imports:
```typescript
import { compsetRoutes } from './routes/compset.route.js'
```

Inside the protected admin routes block (after `await adminApp.register(dataProviderRoutes...)`), add:
```typescript
await adminApp.register(compsetRoutes, { prefix: '/api/v1' })
```

- [ ] **Step 3: Type-check**

```bash
cd /home/nir/ibe/apps/api
npx tsc --noEmit 2>&1 | grep -v "test-bookings\|email.service" | head -20
```

Expected: no new errors in the compset files.

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add apps/api/src/routes/compset.route.ts apps/api/src/app.ts
git commit -m "feat: add compset API routes and register in app"
```

---

## Task 9: API Client Methods

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add imports and types at top of api-client.ts**

In `apps/web/src/lib/api-client.ts`, add to the imports from `@ibe/shared`:
```typescript
import type {
  SystemCompSetConfig,
  CompSetSearchParam,
  CompSetSearchParamCreate,
  CompSetCompetitor,
  CompSetCompetitorCreate,
  CompSetCompetitorUpdate,
  CompSetResult,
  CompSetRunResponse,
} from '@ibe/shared'
```

- [ ] **Step 2: Add compset methods to apiClient object**

Find the end of the `apiClient` export object (before the final `}`) and add:

```typescript
  // ── CompSet ───────────────────────────────────────────────────────────────

  getCompSetSystemConfig(): Promise<SystemCompSetConfig> {
    return apiRequest('/api/v1/admin/intelligence/compset/system-config')
  },
  updateCompSetSystemConfig(data: Partial<SystemCompSetConfig>): Promise<SystemCompSetConfig> {
    return apiRequest('/api/v1/admin/intelligence/compset/system-config', { method: 'PUT', body: JSON.stringify(data) })
  },
  getCompSetSearchParams(opts?: { propertyId?: number; orgId?: number; effective?: boolean }): Promise<CompSetSearchParam[]> {
    const qs = new URLSearchParams()
    if (opts?.propertyId) qs.set('propertyId', String(opts.propertyId))
    if (opts?.orgId) qs.set('orgId', String(opts.orgId))
    if (opts?.effective === false) qs.set('effective', 'false')
    const q = qs.toString()
    return apiRequest(`/api/v1/admin/intelligence/compset/search-params${q ? `?${q}` : ''}`)
  },
  createCompSetSearchParam(data: CompSetSearchParamCreate & { orgId?: number | null; propertyId?: number | null }): Promise<CompSetSearchParam> {
    return apiRequest('/api/v1/admin/intelligence/compset/search-params', { method: 'POST', body: JSON.stringify(data) })
  },
  updateCompSetSearchParam(id: number, data: Partial<CompSetSearchParamCreate>): Promise<CompSetSearchParam> {
    return apiRequest(`/api/v1/admin/intelligence/compset/search-params/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },
  deleteCompSetSearchParam(id: number): Promise<void> {
    return apiRequest(`/api/v1/admin/intelligence/compset/search-params/${id}`, { method: 'DELETE' })
  },
  getCompSetCompetitors(propertyId: number): Promise<CompSetCompetitor[]> {
    return apiRequest(`/api/v1/admin/intelligence/compset/competitors?propertyId=${propertyId}`)
  },
  createCompSetCompetitor(data: CompSetCompetitorCreate): Promise<CompSetCompetitor> {
    return apiRequest('/api/v1/admin/intelligence/compset/competitors', { method: 'POST', body: JSON.stringify(data) })
  },
  updateCompSetCompetitor(id: number, data: CompSetCompetitorUpdate): Promise<CompSetCompetitor> {
    return apiRequest(`/api/v1/admin/intelligence/compset/competitors/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },
  deleteCompSetCompetitor(id: number): Promise<void> {
    return apiRequest(`/api/v1/admin/intelligence/compset/competitors/${id}`, { method: 'DELETE' })
  },
  runCompSet(propertyId: number): Promise<CompSetRunResponse> {
    return apiRequest(`/api/v1/admin/intelligence/compset/run?propertyId=${propertyId}`, { method: 'POST' })
  },
  getCompSetResults(propertyId: number): Promise<CompSetResult[]> {
    return apiRequest(`/api/v1/admin/intelligence/compset/results?propertyId=${propertyId}`)
  },
```

- [ ] **Step 3: Type-check web app**

```bash
cd /home/nir/ibe/apps/web
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add apps/web/src/lib/api-client.ts
git commit -m "feat: add CompSet API client methods"
```

---

## Task 10: Admin Nav + Data Provider Move

**Files:**
- Modify: `apps/web/src/app/admin/_layout-client.tsx`
- Create: `apps/web/src/app/admin/intelligence/data-provider/page.tsx`

- [ ] **Step 1: Add Intelligence section to nav**

In `apps/web/src/app/admin/_layout-client.tsx`, find the `SECTIONS` array and add before the `Configuration` section:

```typescript
  {
    title: 'Intelligence',
    sellerOnly: true,
    items: [
      { href: '/admin/intelligence/data-provider', label: 'Data Provider', sellerOnly: true },
      { href: '/admin/intelligence/compset', label: 'CompSet', sellerOnly: true, propertyOnly: true },
    ],
  },
```

Also remove the Data Provider entry from the `Configuration` section:
```typescript
      { href: '/admin/config/data-provider', label: 'Data Provider', sellerOnly: true },
```
(delete that line)

- [ ] **Step 2: Create data-provider redirect page**

Create directory: `apps/web/src/app/admin/intelligence/data-provider/`

Create `apps/web/src/app/admin/intelligence/data-provider/page.tsx`:

```typescript
export { default } from '../../config/data-provider/page'
```

This re-exports the existing Data Provider page at the new URL with zero duplication.

- [ ] **Step 3: Verify both URLs work**

Start the web dev server if not running, then navigate to:
- `/admin/intelligence/data-provider` — should show the Data Provider page
- The Intelligence section should appear in the nav

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add apps/web/src/app/admin/_layout-client.tsx apps/web/src/app/admin/intelligence/data-provider/
git commit -m "feat: add Intelligence nav section, move Data Provider to intelligence/data-provider"
```

---

## Task 11: CompSet Admin Page

**Files:**
- Create: `apps/web/src/app/admin/intelligence/compset/page.tsx`

- [ ] **Step 1: Implement the CompSet admin page**

Create `apps/web/src/app/admin/intelligence/compset/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../../property-context'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { SaveBar } from '@/app/admin/design/components'
import type { CompSetSearchParam, CompSetCompetitor } from '@ibe/shared'

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!enabled)}
      className={['relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
      <span className={['pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
        enabled ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function Spinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
    </div>
  )
}

// ── Search Param Row ──────────────────────────────────────────────────────────

function AddParamForm({ onSave, onCancel, orgId, propertyId }: {
  onSave: (data: { offsetDays: number; nights: number; adults: number; countryCode: string }) => void
  onCancel: () => void
  orgId?: number | null
  propertyId?: number | null
}) {
  const [offsetDays, setOffsetDays] = useState(7)
  const [nights, setNights] = useState(2)
  const [adults, setAdults] = useState(2)
  const [countryCode, setCountryCode] = useState('US')

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none'

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <p className="text-sm font-semibold text-[var(--color-text)]">Add Search Configuration</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Check-in offset (days from today)</label>
          <input type="number" min={0} max={365} value={offsetDays} onChange={e => setOffsetDays(Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Nights</label>
          <input type="number" min={1} max={30} value={nights} onChange={e => setNights(Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Adults</label>
          <input type="number" min={1} max={10} value={adults} onChange={e => setAdults(Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Country code (ISO-2)</label>
          <input type="text" maxLength={2} value={countryCode} onChange={e => setCountryCode(e.target.value.toUpperCase())} className={inputCls} placeholder="US" />
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors">
          Cancel
        </button>
        <button type="button" onClick={() => onSave({ offsetDays, nights, adults, countryCode })}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity">
          Save
        </button>
      </div>
    </div>
  )
}

// ── Add Competitor Form ───────────────────────────────────────────────────────

function AddCompetitorForm({ propertyId, orgId, onSave, onCancel }: {
  propertyId: number; orgId: number | null | undefined;
  onSave: (data: { name: string; searchUrl: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('')
  const [rawUrl, setRawUrl] = useState('')
  const [template, setTemplate] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-mono focus:border-[var(--color-primary)] focus:outline-none'

  async function handleAnalyze() {
    if (!rawUrl.trim()) return
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const result = await apiClient.analyzeExternalIBEUrls({
        urls: [rawUrl.trim()],
        type: 'search',
        orgId: orgId ?? undefined,
        propertyId,
      })
      if ('error' in result) { setAnalyzeError(result.error); return }
      setTemplate(result.template)
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <p className="text-sm font-semibold text-[var(--color-text)]">Add Competitor</p>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Competitor name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Grand Palace Hotel" className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Sample search URL (real URL with dates filled in)</label>
        <div className="flex gap-2">
          <input type="text" value={rawUrl} onChange={e => setRawUrl(e.target.value)} placeholder="https://competitor.com/booking?checkIn=2026-06-01&nights=2&adults=2" className={inputCls} />
          <button type="button" onClick={handleAnalyze} disabled={analyzing || !rawUrl.trim()}
            className="shrink-0 rounded-lg border border-[var(--color-primary)]/40 px-3 py-2 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40 transition-colors">
            {analyzing ? 'Analysing…' : 'Analyse URL'}
          </button>
        </div>
        {analyzeError && <p className="mt-1 text-xs text-[var(--color-error)]">{analyzeError}</p>}
      </div>
      {template && (
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">URL Template (edit if needed)</label>
          <input type="text" value={template} onChange={e => setTemplate(e.target.value)} className={inputCls} />
        </div>
      )}
      {!template && (
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Or enter template manually</label>
          <input type="text" value={template} onChange={e => setTemplate(e.target.value)} placeholder="https://competitor.com/booking?checkIn={checkIn}&nights={nights}&adults={adults}" className={inputCls} />
        </div>
      )}
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors">
          Cancel
        </button>
        <button type="button" disabled={!name.trim() || !template.trim()} onClick={() => onSave({ name: name.trim(), searchUrl: template.trim() })}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity">
          Save
        </button>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function CompSetPage() {
  const qc = useQueryClient()
  const { propertyId, orgId } = useAdminProperty()
  const { admin } = useAdminAuth()
  const isSystemLevel = admin?.role === 'super' && orgId === null && propertyId === null
  const isSuper = admin?.role === 'super'

  // System config state
  const [maxCompetitors, setMaxCompetitors] = useState(5)
  const [cronSchedule, setCronSchedule] = useState('0 3 * * *')
  const [systemEnabled, setSystemEnabled] = useState(false)
  const [systemDirty, setSystemDirty] = useState(false)

  // Search params UI
  const [showAddParam, setShowAddParam] = useState(false)

  // Competitors UI
  const [showAddCompetitor, setShowAddCompetitor] = useState(false)
  const [editCompetitorId, setEditCompetitorId] = useState<number | null>(null)

  const systemConfigQuery = useQuery({
    queryKey: ['compset-system-config'],
    queryFn: () => apiClient.getCompSetSystemConfig(),
    enabled: isSystemLevel,
  })

  const searchParamsQuery = useQuery({
    queryKey: ['compset-search-params', orgId, propertyId],
    queryFn: () => apiClient.getCompSetSearchParams({
      propertyId: propertyId ?? undefined,
      orgId: orgId ?? undefined,
    }),
  })

  const competitorsQuery = useQuery({
    queryKey: ['compset-competitors', propertyId],
    queryFn: () => apiClient.getCompSetCompetitors(propertyId!),
    enabled: !!propertyId,
    refetchInterval: (data) => {
      const fetching = data?.state?.data?.some((c: CompSetCompetitor) => c.status === 'fetching')
      return fetching ? 2000 : false
    },
  })

  // System config load into state
  const sysData = systemConfigQuery.data
  if (isSystemLevel && sysData && !systemDirty) {
    if (maxCompetitors !== sysData.maxCompetitorsPerProperty) setMaxCompetitors(sysData.maxCompetitorsPerProperty)
    if (cronSchedule !== sysData.cronSchedule) setCronSchedule(sysData.cronSchedule)
    if (systemEnabled !== sysData.enabled) setSystemEnabled(sysData.enabled)
  }

  const saveSystemMutation = useMutation({
    mutationFn: () => apiClient.updateCompSetSystemConfig({ maxCompetitorsPerProperty: maxCompetitors, cronSchedule, enabled: systemEnabled }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['compset-system-config'] }); setSystemDirty(false) },
  })

  const addParamMutation = useMutation({
    mutationFn: (data: Parameters<typeof apiClient.createCompSetSearchParam>[0]) => apiClient.createCompSetSearchParam(data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['compset-search-params', orgId, propertyId] }); setShowAddParam(false) },
  })

  const deleteParamMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteCompSetSearchParam(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['compset-search-params', orgId, propertyId] }),
  })

  const addCompetitorMutation = useMutation({
    mutationFn: (data: { name: string; searchUrl: string }) => apiClient.createCompSetCompetitor({ propertyId: propertyId!, name: data.name, searchUrl: data.searchUrl }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['compset-competitors', propertyId] }); setShowAddCompetitor(false) },
  })

  const deleteCompetitorMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteCompSetCompetitor(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['compset-competitors', propertyId] }),
  })

  const runAllMutation = useMutation({
    mutationFn: () => apiClient.runCompSet(propertyId!),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['compset-competitors', propertyId] }),
  })

  const runOneMutation = useMutation({
    mutationFn: () => apiClient.runCompSet(propertyId!),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['compset-competitors', propertyId] }),
  })

  if (searchParamsQuery.isLoading) return <Spinner />

  const params = searchParamsQuery.data ?? []
  const ownParams = params.filter(p => {
    if (propertyId) return p.tier === 'hotel'
    if (orgId) return p.tier === 'chain'
    return p.tier === 'system'
  })
  const inheritedParams = params.filter(p => {
    if (propertyId) return p.tier !== 'hotel'
    if (orgId) return p.tier === 'system'
    return false
  })

  const competitors = competitorsQuery.data ?? []
  const maxReached = competitors.length >= (sysData?.maxCompetitorsPerProperty ?? 5)

  const tierLabel = isSystemLevel ? 'System' : propertyId ? 'Hotel' : 'Chain'

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none'

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">CompSet</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Competitive set configuration and rate collection.</p>
      </div>

      {/* System config panel — super admin only at system level */}
      {isSystemLevel && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">System Configuration</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Enable CompSet collection</p>
              <p className="text-xs text-[var(--color-text-muted)]">Allow cron to collect competitor rates automatically</p>
            </div>
            <Toggle enabled={systemEnabled} onChange={v => { setSystemEnabled(v); setSystemDirty(true) }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Max competitors per property</label>
              <input type="number" min={1} max={20} value={maxCompetitors}
                onChange={e => { setMaxCompetitors(Number(e.target.value)); setSystemDirty(true) }} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Cron schedule</label>
              <input type="text" value={cronSchedule}
                onChange={e => { setCronSchedule(e.target.value); setSystemDirty(true) }} className={inputCls} placeholder="0 3 * * *" />
            </div>
          </div>
          <SaveBar isDirty={systemDirty} isSaving={saveSystemMutation.isPending} onSave={() => saveSystemMutation.mutate()} />
        </div>
      )}

      {/* Search configurations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Search Configurations</h2>
          {!showAddParam && (
            <button type="button" onClick={() => setShowAddParam(true)}
              className="rounded-lg border border-[var(--color-primary)]/40 px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors">
              + Add
            </button>
          )}
        </div>

        {inheritedParams.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Inherited</p>
            {inheritedParams.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5">
                <span className="text-sm text-[var(--color-text)]">{p.label}</span>
                <span className="text-xs text-[var(--color-text-muted)] rounded-full bg-[var(--color-border)] px-2 py-0.5 capitalize">{p.tier}</span>
              </div>
            ))}
          </div>
        )}

        {ownParams.length > 0 && (
          <div className="space-y-2">
            {inheritedParams.length > 0 && <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">{tierLabel}</p>}
            {ownParams.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
                <span className="text-sm text-[var(--color-text)]">{p.label}</span>
                <button type="button" onClick={() => deleteParamMutation.mutate(p.id)} disabled={deleteParamMutation.isPending}
                  className="text-xs text-[var(--color-error)] hover:underline disabled:opacity-40">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {ownParams.length === 0 && inheritedParams.length === 0 && !showAddParam && (
          <p className="text-sm text-[var(--color-text-muted)]">No search configurations yet. Add one to get started.</p>
        )}

        {showAddParam && (
          <AddParamForm
            orgId={orgId}
            propertyId={propertyId}
            onSave={(data) => addParamMutation.mutate({ ...data, orgId: orgId ?? null, propertyId: propertyId ?? null })}
            onCancel={() => setShowAddParam(false)}
          />
        )}
      </div>

      {/* Competitors — property level only */}
      {propertyId && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Competitors</h2>
            <div className="flex gap-2">
              {competitors.length > 0 && (
                <button type="button" onClick={() => runAllMutation.mutate()} disabled={runAllMutation.isPending}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40 transition-colors">
                  {runAllMutation.isPending ? 'Starting…' : 'Run All'}
                </button>
              )}
              {!showAddCompetitor && (
                <button type="button" onClick={() => setShowAddCompetitor(true)} disabled={maxReached}
                  title={maxReached ? `Maximum ${sysData?.maxCompetitorsPerProperty ?? 5} competitors reached` : undefined}
                  className="rounded-lg border border-[var(--color-primary)]/40 px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  + Add Competitor
                </button>
              )}
            </div>
          </div>

          {competitors.map(c => (
            <div key={c.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)]">{c.name}</p>
                  {c.searchUrl && (
                    <p className="mt-0.5 text-xs font-mono text-[var(--color-text-muted)] truncate max-w-xs">{c.searchUrl}</p>
                  )}
                  {c.lastFetchAt && (
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                      Last run: {new Date(c.lastFetchAt).toLocaleString()}
                      {c.errorMsg && <span className="ml-2 text-[var(--color-error)]">— {c.errorMsg}</span>}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={['rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    c.status === 'done' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
                    c.status === 'fetching' ? 'bg-amber-100 text-amber-700' :
                    c.status === 'error' ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' :
                    'bg-[var(--color-border)] text-[var(--color-text-muted)]',
                  ].join(' ')}>
                    {c.status === 'fetching' ? 'Fetching…' : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </span>
                  <button type="button" onClick={() => runOneMutation.mutate()} disabled={c.status === 'fetching'}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40 transition-colors">
                    Run
                  </button>
                  <button type="button" onClick={() => deleteCompetitorMutation.mutate(c.id)} disabled={deleteCompetitorMutation.isPending}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-error)] hover:bg-[var(--color-error)]/5 disabled:opacity-40 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}

          {competitors.length === 0 && !showAddCompetitor && (
            <p className="text-sm text-[var(--color-text-muted)]">No competitors added yet.</p>
          )}

          {showAddCompetitor && (
            <AddCompetitorForm
              propertyId={propertyId}
              orgId={orgId}
              onSave={(data) => addCompetitorMutation.mutate(data)}
              onCancel={() => setShowAddCompetitor(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/nir/ibe/apps/web
npx tsc --noEmit 2>&1 | grep "compset\|intelligence" | head -20
```

Expected: no errors in the new files.

- [ ] **Step 3: Smoke-test in browser**

Navigate to `/admin/intelligence/compset` in the dev admin. Verify:
- System level (no property/org selected, super admin): system config panel and empty search params list visible
- Chain level (org selected, no property): inherited system params + chain add form
- Property level: all sections visible — inherited params, own params, competitor list

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add apps/web/src/app/admin/intelligence/
git commit -m "feat: add CompSet admin page — search config management and competitor CRUD"
```

---

## Task 12: Final Run Tests + Type-Check

- [ ] **Step 1: Run full API test suite**

```bash
cd /home/nir/ibe/apps/api
npx vitest run
```

Expected: all tests pass including the new compset tests.

- [ ] **Step 2: Full type-check**

```bash
cd /home/nir/ibe/apps/api && npx tsc --noEmit 2>&1 | grep -v "test-bookings\|email.service" | head -20
cd /home/nir/ibe/apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors introduced by this feature.

- [ ] **Step 3: Final commit**

```bash
cd /home/nir/ibe
git add -A
git status  # verify only expected files
git commit -m "feat: Intelligence CompSet sub-project 1 complete — nav, search config inheritance, competitor CRUD, collection engine"
```
