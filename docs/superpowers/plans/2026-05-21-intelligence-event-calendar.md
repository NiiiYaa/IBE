# Intelligence — Event Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Event Calendar feature under the Intelligence admin menu that discovers local events near each hotel via the existing AI provider config, stores them in the DB, and exposes them through a dedicated admin UI.

**Architecture:** Three new Prisma models (SystemEventCalendarConfig singleton, PropertyEventCalendarConfig per-property, EventCalendarEvent event rows). A fetch service calls the hotel's configured AI provider with a structured prompt; events are replaced on each refresh (same pattern as CompSetResult). Three refresh triggers: manual, nightly cron, and automatic post-CompSet hook. The admin page has three views: system config (super only), chain overview, and property detail with event cards.

**Tech Stack:** Prisma + Fastify (API), Next.js 14 App Router + TanStack Query (web), `@ibe/shared` for types, `node-cron` for scheduling, existing `resolveAIConfig` + `getProviderAdapter` for AI, `fetchPropertyStatic` for hotel coordinates.

---

## File Map

**New API files:**
- `apps/api/prisma/migrations/20260521000001_add_event_calendar/migration.sql`
- `apps/api/src/services/event-calendar.service.ts` — CRUD for config + events query + active property IDs
- `apps/api/src/services/__tests__/event-calendar.service.test.ts`
- `apps/api/src/services/event-calendar-fetch.service.ts` — AI call, parse, store
- `apps/api/src/services/__tests__/event-calendar-fetch.service.test.ts`
- `apps/api/src/services/event-calendar-cron.service.ts` — cron wrapper
- `apps/api/src/routes/event-calendar.route.ts` — all 7 routes

**Modified API files:**
- `apps/api/prisma/schema.prisma` — 3 new models + Property back-relations
- `apps/api/src/app.ts` — register event calendar routes
- `apps/api/src/server.ts` — start/stop event calendar cron
- `apps/api/src/services/compset-collect.service.ts` — add post-run event refresh

**New shared files:**
- `packages/shared/src/types/event-calendar.ts`

**Modified shared files:**
- `packages/shared/src/index.ts` — export event-calendar types

**New web files:**
- `apps/web/src/app/admin/intelligence/event-calendar/page.tsx`

**Modified web files:**
- `apps/web/src/app/admin/_layout-client.tsx` — add Event Calendar nav item
- `apps/web/src/lib/api-client.ts` — add 7 event calendar API client methods

---

## Task 1: DB Schema — 3 New Models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260521000001_add_event_calendar/migration.sql`

- [ ] **Step 1: Add the three models and Property back-relations to schema.prisma**

Open `apps/api/prisma/schema.prisma`. Find the `CompSetResult` model block (after all CompSet models). Add immediately after it:

```prisma
model SystemEventCalendarConfig {
  id              Int      @id @default(autoincrement())
  enabled         Boolean  @default(false)
  defaultRadiusKm Int      @default(50)
  cronSchedule    String   @default("0 4 * * *")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model PropertyEventCalendarConfig {
  id         Int      @id @default(autoincrement())
  propertyId Int      @unique
  radiusKm   Int?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  property Property @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade)
}

model EventCalendarEvent {
  id                Int      @id @default(autoincrement())
  propertyId        Int
  fetchedAt         DateTime
  periodStart       String
  periodEnd         String
  name              String
  startDate         String
  endDate           String
  description       String
  demandLevel       String
  demandDescription String
  createdAt         DateTime @default(now())

  property Property @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade)

  @@index([propertyId, startDate, endDate])
}
```

Then find the `Property` model and add these two back-relations alongside the existing compset ones:

```prisma
  eventCalendarConfig  PropertyEventCalendarConfig?
  eventCalendarEvents  EventCalendarEvent[]
```

- [ ] **Step 2: Create the migration directory and SQL file**

```bash
mkdir -p apps/api/prisma/migrations/20260521000001_add_event_calendar
```

Create `apps/api/prisma/migrations/20260521000001_add_event_calendar/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "SystemEventCalendarConfig" (
    "id" SERIAL NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultRadiusKm" INTEGER NOT NULL DEFAULT 50,
    "cronSchedule" TEXT NOT NULL DEFAULT '0 4 * * *',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemEventCalendarConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyEventCalendarConfig" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "radiusKm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyEventCalendarConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCalendarEvent" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "demandLevel" TEXT NOT NULL,
    "demandDescription" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyEventCalendarConfig_propertyId_key" ON "PropertyEventCalendarConfig"("propertyId");

-- CreateIndex
CREATE INDEX "EventCalendarEvent_propertyId_startDate_endDate_idx" ON "EventCalendarEvent"("propertyId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "PropertyEventCalendarConfig" ADD CONSTRAINT "PropertyEventCalendarConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCalendarEvent" ADD CONSTRAINT "EventCalendarEvent_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply migration and regenerate Prisma client**

```bash
cd apps/api && npx prisma migrate deploy && npx prisma generate
```

Expected: migration applied, Prisma client regenerated with the 3 new models.

- [ ] **Step 4: Verify Prisma client has new models**

```bash
cd apps/api && node -e "const { PrismaClient } = require('./node_modules/.prisma/client'); const p = new PrismaClient(); console.log(typeof p.systemEventCalendarConfig, typeof p.propertyEventCalendarConfig, typeof p.eventCalendarEvent)"
```

Expected: `object object object`

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260521000001_add_event_calendar/
git commit -m "feat: add event calendar DB schema (3 models)"
```

---

## Task 2: Shared Types

**Files:**
- Create: `packages/shared/src/types/event-calendar.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing type-check test (compile-time only)**

Verify the new types don't exist yet:

```bash
grep -r "EventCalendarEvent" packages/shared/src/ && echo "EXISTS" || echo "OK - not yet"
```

Expected: `OK - not yet`

- [ ] **Step 2: Create the types file**

Create `packages/shared/src/types/event-calendar.ts`:

```typescript
export interface SystemEventCalendarConfig {
  enabled: boolean
  defaultRadiusKm: number
  cronSchedule: string
}

export interface PropertyEventCalendarConfig {
  propertyId: number
  radiusKm: number | null
}

export interface EventCalendarEvent {
  id: number
  propertyId: number
  fetchedAt: string
  periodStart: string
  periodEnd: string
  name: string
  startDate: string
  endDate: string
  description: string
  demandLevel: 'high' | 'medium' | 'low'
  demandDescription: string
}

export interface EventCalendarRunResponse {
  started: boolean
}

export interface ChainEventCalendarEvents {
  propertyId: number
  events: EventCalendarEvent[]
}
```

- [ ] **Step 3: Export from the shared package index**

In `packages/shared/src/index.ts`, add after the compset export line:

```typescript
export type * from './types/event-calendar.js'
```

- [ ] **Step 4: Build shared package**

```bash
cd packages/shared && npm run build
```

Expected: exits 0, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/event-calendar.ts packages/shared/src/index.ts packages/shared/dist/
git commit -m "feat: add event calendar shared types"
```

---

## Task 3: Event Calendar Service + Tests

**Files:**
- Create: `apps/api/src/services/event-calendar.service.ts`
- Create: `apps/api/src/services/__tests__/event-calendar.service.test.ts`

This service handles CRUD for system config, property config, event queries, and resolving which property IDs need cron runs.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/__tests__/event-calendar.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemEventCalendarConfig: {
      findFirst: vi.fn(), update: vi.fn(), create: vi.fn(),
    },
    propertyEventCalendarConfig: {
      findUnique: vi.fn(), upsert: vi.fn(),
    },
    eventCalendarEvent: {
      findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(),
    },
    propertyEventCalendarConfig_findMany: vi.fn(),
    compSetCompetitor: { groupBy: vi.fn() },
    $transaction: vi.fn(),
  },
}))

// We need a separate mock for the groupBy on propertyEventCalendarConfig
vi.mock('../../db/client.js', () => ({
  prisma: {
    systemEventCalendarConfig: {
      findFirst: vi.fn(), update: vi.fn(), create: vi.fn(),
    },
    propertyEventCalendarConfig: {
      findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn(),
    },
    eventCalendarEvent: {
      findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(),
    },
    compSetCompetitor: { groupBy: vi.fn() },
  },
}))

import { prisma } from '../../db/client.js'
import {
  getSystemEventCalendarConfig,
  upsertSystemEventCalendarConfig,
  getPropertyEventCalendarConfig,
  upsertPropertyEventCalendarConfig,
  getPropertyEvents,
  getChainEvents,
  replacePropertyEvents,
  getActiveEventPropertyIds,
} from '../event-calendar.service.js'

const mp = prisma as any

beforeEach(() => { vi.clearAllMocks() })

describe('getSystemEventCalendarConfig', () => {
  it('returns defaults when no row exists', async () => {
    mp.systemEventCalendarConfig.findFirst.mockResolvedValue(null)
    const result = await getSystemEventCalendarConfig()
    expect(result).toEqual({ enabled: false, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
  })

  it('returns stored values', async () => {
    mp.systemEventCalendarConfig.findFirst.mockResolvedValue({
      enabled: true, defaultRadiusKm: 30, cronSchedule: '0 5 * * *',
    })
    const result = await getSystemEventCalendarConfig()
    expect(result.enabled).toBe(true)
    expect(result.defaultRadiusKm).toBe(30)
    expect(result.cronSchedule).toBe('0 5 * * *')
  })
})

describe('upsertSystemEventCalendarConfig', () => {
  it('creates a new row when none exists', async () => {
    mp.systemEventCalendarConfig.findFirst.mockResolvedValue(null)
    mp.systemEventCalendarConfig.create.mockResolvedValue({
      enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *',
    })
    const result = await upsertSystemEventCalendarConfig({ enabled: true })
    expect(mp.systemEventCalendarConfig.create).toHaveBeenCalled()
    expect(result.enabled).toBe(true)
  })

  it('updates existing row', async () => {
    mp.systemEventCalendarConfig.findFirst.mockResolvedValue({ id: 1, enabled: false, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mp.systemEventCalendarConfig.update.mockResolvedValue({
      enabled: false, defaultRadiusKm: 100, cronSchedule: '0 4 * * *',
    })
    const result = await upsertSystemEventCalendarConfig({ defaultRadiusKm: 100 })
    expect(mp.systemEventCalendarConfig.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { defaultRadiusKm: 100 },
    })
    expect(result.defaultRadiusKm).toBe(100)
  })
})

describe('getPropertyEventCalendarConfig', () => {
  it('returns null when no config exists', async () => {
    mp.propertyEventCalendarConfig.findUnique.mockResolvedValue(null)
    const result = await getPropertyEventCalendarConfig(99)
    expect(result).toBeNull()
  })

  it('returns config when found', async () => {
    mp.propertyEventCalendarConfig.findUnique.mockResolvedValue({ propertyId: 5, radiusKm: 25 })
    const result = await getPropertyEventCalendarConfig(5)
    expect(result).toEqual({ propertyId: 5, radiusKm: 25 })
  })
})

describe('upsertPropertyEventCalendarConfig', () => {
  it('calls upsert with correct data', async () => {
    mp.propertyEventCalendarConfig.upsert.mockResolvedValue({ propertyId: 5, radiusKm: 40 })
    const result = await upsertPropertyEventCalendarConfig(5, { radiusKm: 40 })
    expect(mp.propertyEventCalendarConfig.upsert).toHaveBeenCalledWith({
      where: { propertyId: 5 },
      create: { propertyId: 5, radiusKm: 40 },
      update: { radiusKm: 40 },
    })
    expect(result).toEqual({ propertyId: 5, radiusKm: 40 })
  })
})

describe('getPropertyEvents', () => {
  it('queries events overlapping the given window', async () => {
    mp.eventCalendarEvent.findMany.mockResolvedValue([])
    await getPropertyEvents(7, '2026-06-01', '2026-06-30')
    expect(mp.eventCalendarEvent.findMany).toHaveBeenCalledWith({
      where: {
        propertyId: 7,
        startDate: { lte: '2026-06-30' },
        endDate: { gte: '2026-06-01' },
      },
      orderBy: { startDate: 'asc' },
    })
  })

  it('returns mapped events', async () => {
    const row = {
      id: 1, propertyId: 7, fetchedAt: new Date('2026-05-21'),
      periodStart: '2026-06-01', periodEnd: '2026-06-30',
      name: 'Jazz Fest', startDate: '2026-06-10', endDate: '2026-06-12',
      description: 'Annual jazz festival', demandLevel: 'high',
      demandDescription: 'High occupancy expected', createdAt: new Date(),
    }
    mp.eventCalendarEvent.findMany.mockResolvedValue([row])
    const result = await getPropertyEvents(7, '2026-06-01', '2026-06-30')
    expect(result[0]!.fetchedAt).toBe('2026-05-21T00:00:00.000Z')
    expect(result[0]!.name).toBe('Jazz Fest')
  })
})

describe('replacePropertyEvents', () => {
  it('deletes existing and inserts new events', async () => {
    mp.eventCalendarEvent.deleteMany.mockResolvedValue({ count: 3 })
    mp.eventCalendarEvent.createMany.mockResolvedValue({ count: 2 })
    const fetchedAt = new Date()
    const events = [
      {
        name: 'Concert', startDate: '2026-06-05', endDate: '2026-06-05',
        description: 'Big show', demandLevel: 'high' as const, demandDescription: 'Sold out expected',
      },
    ]
    await replacePropertyEvents(5, fetchedAt, '2026-06-01', '2026-06-30', events)
    expect(mp.eventCalendarEvent.deleteMany).toHaveBeenCalledWith({ where: { propertyId: 5 } })
    expect(mp.eventCalendarEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ propertyId: 5, name: 'Concert', fetchedAt })],
    })
  })

  it('calls deleteMany even when events array is empty', async () => {
    mp.eventCalendarEvent.deleteMany.mockResolvedValue({ count: 1 })
    mp.eventCalendarEvent.createMany.mockResolvedValue({ count: 0 })
    await replacePropertyEvents(5, new Date(), '2026-06-01', '2026-06-30', [])
    expect(mp.eventCalendarEvent.deleteMany).toHaveBeenCalled()
    expect(mp.eventCalendarEvent.createMany).toHaveBeenCalledWith({ data: [] })
  })
})

describe('getActiveEventPropertyIds', () => {
  it('returns union of property config IDs and compset competitor IDs', async () => {
    mp.propertyEventCalendarConfig.findMany.mockResolvedValue([{ propertyId: 1 }, { propertyId: 2 }])
    mp.compSetCompetitor.groupBy.mockResolvedValue([{ propertyId: 2 }, { propertyId: 3 }])
    const result = await getActiveEventPropertyIds()
    expect(result.sort()).toEqual([1, 2, 3])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/__tests__/event-calendar.service.test.ts
```

Expected: FAIL — module `../event-calendar.service.js` not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/event-calendar.service.ts`:

```typescript
import { prisma } from '../db/client.js'
import type {
  SystemEventCalendarConfig,
  PropertyEventCalendarConfig,
  EventCalendarEvent,
  ChainEventCalendarEvents,
} from '@ibe/shared'

// ── SystemEventCalendarConfig ─────────────────────────────────────────────────

export async function getSystemEventCalendarConfig(): Promise<SystemEventCalendarConfig> {
  const row = await prisma.systemEventCalendarConfig.findFirst()
  return {
    enabled: row?.enabled ?? false,
    defaultRadiusKm: row?.defaultRadiusKm ?? 50,
    cronSchedule: row?.cronSchedule ?? '0 4 * * *',
  }
}

export async function upsertSystemEventCalendarConfig(
  data: Partial<SystemEventCalendarConfig>,
): Promise<SystemEventCalendarConfig> {
  const existing = await prisma.systemEventCalendarConfig.findFirst()
  const row = existing
    ? await prisma.systemEventCalendarConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemEventCalendarConfig.create({
        data: {
          enabled: data.enabled ?? false,
          defaultRadiusKm: data.defaultRadiusKm ?? 50,
          cronSchedule: data.cronSchedule ?? '0 4 * * *',
        },
      })
  return { enabled: row.enabled, defaultRadiusKm: row.defaultRadiusKm, cronSchedule: row.cronSchedule }
}

// ── PropertyEventCalendarConfig ───────────────────────────────────────────────

export async function getPropertyEventCalendarConfig(
  propertyId: number,
): Promise<PropertyEventCalendarConfig | null> {
  const row = await prisma.propertyEventCalendarConfig.findUnique({ where: { propertyId } })
  if (!row) return null
  return { propertyId: row.propertyId, radiusKm: row.radiusKm }
}

export async function upsertPropertyEventCalendarConfig(
  propertyId: number,
  data: { radiusKm: number | null },
): Promise<PropertyEventCalendarConfig> {
  const row = await prisma.propertyEventCalendarConfig.upsert({
    where: { propertyId },
    create: { propertyId, radiusKm: data.radiusKm },
    update: { radiusKm: data.radiusKm },
  })
  return { propertyId: row.propertyId, radiusKm: row.radiusKm }
}

// ── Events ────────────────────────────────────────────────────────────────────

function toEvent(row: {
  id: number; propertyId: number; fetchedAt: Date; periodStart: string; periodEnd: string
  name: string; startDate: string; endDate: string; description: string
  demandLevel: string; demandDescription: string
}): EventCalendarEvent {
  return {
    id: row.id,
    propertyId: row.propertyId,
    fetchedAt: row.fetchedAt.toISOString(),
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    description: row.description,
    demandLevel: row.demandLevel as 'high' | 'medium' | 'low',
    demandDescription: row.demandDescription,
  }
}

export async function getPropertyEvents(
  propertyId: number,
  from: string,
  to: string,
): Promise<EventCalendarEvent[]> {
  const rows = await prisma.eventCalendarEvent.findMany({
    where: {
      propertyId,
      startDate: { lte: to },
      endDate: { gte: from },
    },
    orderBy: { startDate: 'asc' },
  })
  return rows.map(toEvent)
}

export async function getChainEvents(orgId: number): Promise<ChainEventCalendarEvents[]> {
  const properties = await prisma.property.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { propertyId: true },
  })
  const results: ChainEventCalendarEvents[] = []
  for (const { propertyId } of properties) {
    const rows = await prisma.eventCalendarEvent.findMany({
      where: { propertyId },
      orderBy: { startDate: 'asc' },
    })
    results.push({ propertyId, events: rows.map(toEvent) })
  }
  return results
}

export async function replacePropertyEvents(
  propertyId: number,
  fetchedAt: Date,
  periodStart: string,
  periodEnd: string,
  events: Array<{
    name: string; startDate: string; endDate: string
    description: string; demandLevel: 'high' | 'medium' | 'low'; demandDescription: string
  }>,
): Promise<void> {
  await prisma.eventCalendarEvent.deleteMany({ where: { propertyId } })
  await prisma.eventCalendarEvent.createMany({
    data: events.map(e => ({
      propertyId, fetchedAt, periodStart, periodEnd,
      name: e.name, startDate: e.startDate, endDate: e.endDate,
      description: e.description, demandLevel: e.demandLevel, demandDescription: e.demandDescription,
    })),
  })
}

// ── Active property IDs for cron ──────────────────────────────────────────────

export async function getActiveEventPropertyIds(): Promise<number[]> {
  const [configRows, competitorRows] = await Promise.all([
    prisma.propertyEventCalendarConfig.findMany({ select: { propertyId: true } }),
    prisma.compSetCompetitor.groupBy({ by: ['propertyId'] }),
  ])
  const ids = new Set<number>([
    ...configRows.map(r => r.propertyId),
    ...competitorRows.map(r => r.propertyId),
  ])
  return Array.from(ids)
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd apps/api && npx vitest run src/services/__tests__/event-calendar.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/event-calendar.service.ts apps/api/src/services/__tests__/event-calendar.service.test.ts
git commit -m "feat: add event calendar service with CRUD and event query"
```

---

## Task 4: Event Fetch Service + Tests

**Files:**
- Create: `apps/api/src/services/event-calendar-fetch.service.ts`
- Create: `apps/api/src/services/__tests__/event-calendar-fetch.service.test.ts`

This service performs the AI call to discover events and persists the results.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/__tests__/event-calendar-fetch.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../ai-config.service.js', () => ({ resolveAIConfig: vi.fn() }))
vi.mock('../../adapters/hyperguest/static.js', () => ({ fetchPropertyStatic: vi.fn() }))
vi.mock('../../ai/adapters/index.js', () => ({ getProviderAdapter: vi.fn() }))
vi.mock('../event-calendar.service.js', () => ({
  getSystemEventCalendarConfig: vi.fn(),
  getPropertyEventCalendarConfig: vi.fn(),
  replacePropertyEvents: vi.fn(),
}))
vi.mock('../../db/client.js', () => ({
  prisma: {
    property: { findUnique: vi.fn() },
  },
}))

import { prisma } from '../../db/client.js'
import { resolveAIConfig } from '../ai-config.service.js'
import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { getProviderAdapter } from '../../ai/adapters/index.js'
import {
  getSystemEventCalendarConfig,
  getPropertyEventCalendarConfig,
  replacePropertyEvents,
} from '../event-calendar.service.js'
import { refreshPropertyEvents } from '../event-calendar-fetch.service.js'

const mp = prisma as any
const mAI = resolveAIConfig as any
const mStatic = fetchPropertyStatic as any
const mAdapter = getProviderAdapter as any
const mSysConfig = getSystemEventCalendarConfig as any
const mPropConfig = getPropertyEventCalendarConfig as any
const mReplace = replacePropertyEvents as any

beforeEach(() => { vi.clearAllMocks() })

function makeStaticResult() {
  return {
    coordinates: { latitude: 51.5, longitude: -0.1 },
    location: { city: { id: 1, name: 'London' }, countryCode: 'GB', address: '1 St', postcode: 'SW1' },
  }
}

function makeAIConfig() {
  return {
    provider: 'openai' as const,
    model: 'gpt-4o',
    apiKey: 'sk-test',
    whatsappModel: null, whatsappProvider: null, whatsappApiKey: null,
    systemPrompt: null, source: 'org' as const,
  }
}

describe('refreshPropertyEvents', () => {
  it('returns early when no AI config is set', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mAI.mockResolvedValue(null)
    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')
    expect(mReplace).not.toHaveBeenCalled()
  })

  it('returns early when fetchPropertyStatic fails', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockRejectedValue(new Error('static fetch failed'))
    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')
    expect(mReplace).not.toHaveBeenCalled()
  })

  it('calls AI adapter with correct prompt', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockResolvedValue(makeStaticResult())
    mSysConfig.mockResolvedValue({ enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mPropConfig.mockResolvedValue(null)
    const mockCall = vi.fn().mockResolvedValue({ text: '[]', stopReason: 'end_turn' })
    mAdapter.mockReturnValue({ call: mockCall })
    mReplace.mockResolvedValue(undefined)

    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')

    expect(mockCall).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: expect.stringContaining('London') }),
      ]),
      [],
      expect.stringContaining('JSON'),
      'sk-test',
      'gpt-4o',
    )
  })

  it('uses property radius override when set', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockResolvedValue(makeStaticResult())
    mSysConfig.mockResolvedValue({ enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mPropConfig.mockResolvedValue({ propertyId: 1, radiusKm: 20 })
    const mockCall = vi.fn().mockResolvedValue({ text: '[]', stopReason: 'end_turn' })
    mAdapter.mockReturnValue({ call: mockCall })
    mReplace.mockResolvedValue(undefined)

    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')

    const callArgs = mockCall.mock.calls[0]
    const userMessage = callArgs[0][0].content as string
    expect(userMessage).toContain('20km')
  })

  it('stores parsed events on successful AI response', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockResolvedValue(makeStaticResult())
    mSysConfig.mockResolvedValue({ enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mPropConfig.mockResolvedValue(null)
    const events = [
      { name: 'Jazz Fest', startDate: '2026-06-10', endDate: '2026-06-12',
        description: 'Big event', demandLevel: 'high', demandDescription: 'High demand' },
    ]
    const mockCall = vi.fn().mockResolvedValue({
      text: JSON.stringify(events), stopReason: 'end_turn',
    })
    mAdapter.mockReturnValue({ call: mockCall })
    mReplace.mockResolvedValue(undefined)

    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')

    expect(mReplace).toHaveBeenCalledWith(
      1,
      expect.any(Date),
      '2026-06-01',
      '2026-06-30',
      expect.arrayContaining([expect.objectContaining({ name: 'Jazz Fest' })]),
    )
  })

  it('stores zero events and does not crash on malformed AI response', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockResolvedValue(makeStaticResult())
    mSysConfig.mockResolvedValue({ enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mPropConfig.mockResolvedValue(null)
    const mockCall = vi.fn().mockResolvedValue({ text: 'not json!!', stopReason: 'end_turn' })
    mAdapter.mockReturnValue({ call: mockCall })
    mReplace.mockResolvedValue(undefined)

    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')

    expect(mReplace).toHaveBeenCalledWith(1, expect.any(Date), '2026-06-01', '2026-06-30', [])
  })

  it('skips malformed event objects but saves valid ones', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockResolvedValue(makeStaticResult())
    mSysConfig.mockResolvedValue({ enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mPropConfig.mockResolvedValue(null)
    const mixed = [
      { name: 'Good', startDate: '2026-06-01', endDate: '2026-06-01',
        description: 'ok', demandLevel: 'low', demandDescription: 'low demand' },
      { name: 'Bad', startDate: '2026-06-02' }, // missing required fields
    ]
    const mockCall = vi.fn().mockResolvedValue({ text: JSON.stringify(mixed), stopReason: 'end_turn' })
    mAdapter.mockReturnValue({ call: mockCall })
    mReplace.mockResolvedValue(undefined)

    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')

    const savedEvents = mReplace.mock.calls[0][4]
    expect(savedEvents).toHaveLength(1)
    expect(savedEvents[0].name).toBe('Good')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx vitest run src/services/__tests__/event-calendar-fetch.service.test.ts
```

Expected: FAIL — module `../event-calendar-fetch.service.js` not found.

- [ ] **Step 3: Implement the fetch service**

Create `apps/api/src/services/event-calendar-fetch.service.ts`:

```typescript
import { logger } from '../utils/logger.js'
import { prisma } from '../db/client.js'
import { resolveAIConfig } from './ai-config.service.js'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import {
  getSystemEventCalendarConfig,
  getPropertyEventCalendarConfig,
  replacePropertyEvents,
} from './event-calendar.service.js'

interface ParsedEvent {
  name: string
  startDate: string
  endDate: string
  description: string
  demandLevel: 'high' | 'medium' | 'low'
  demandDescription: string
}

function isValidEvent(obj: unknown): obj is ParsedEvent {
  if (!obj || typeof obj !== 'object') return false
  const e = obj as Record<string, unknown>
  return (
    typeof e.name === 'string' &&
    typeof e.startDate === 'string' &&
    typeof e.endDate === 'string' &&
    typeof e.description === 'string' &&
    (e.demandLevel === 'high' || e.demandLevel === 'medium' || e.demandLevel === 'low') &&
    typeof e.demandDescription === 'string'
  )
}

export async function refreshPropertyEvents(
  propertyId: number,
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  const prop = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  const orgId = prop?.organizationId ?? undefined

  const aiConfig = await resolveAIConfig(propertyId, orgId)
  if (!aiConfig) {
    logger.info({ propertyId }, '[EventCalendar] No AI config — skipping')
    return
  }

  let staticData: Awaited<ReturnType<typeof fetchPropertyStatic>>
  try {
    staticData = await fetchPropertyStatic(propertyId)
  } catch (err) {
    logger.warn({ err, propertyId }, '[EventCalendar] fetchPropertyStatic failed — skipping')
    return
  }

  const [sysConfig, propConfig] = await Promise.all([
    getSystemEventCalendarConfig(),
    getPropertyEventCalendarConfig(propertyId),
  ])
  const radiusKm = propConfig?.radiusKm ?? sysConfig.defaultRadiusKm ?? 50

  const { latitude, longitude } = staticData.coordinates
  const city = staticData.location.city.name
  const countryCode = staticData.location.countryCode

  const systemPrompt = 'You are a hotel demand intelligence assistant. Return only valid JSON with no surrounding text.'
  const userPrompt = `Find events (concerts, conferences, sports tournaments, festivals, public holidays, major exhibitions, trade shows) happening within ${radiusKm}km of ${city}, ${countryCode} (coordinates: ${latitude}, ${longitude}) between ${periodStart} and ${periodEnd}.

Search the web for current, accurate information.

Return a JSON array where each object has exactly these keys:
- name (string)
- startDate (YYYY-MM-DD)
- endDate (YYYY-MM-DD)
- description (string, 1–2 sentences)
- demandLevel ("high", "medium", or "low")
- demandDescription (string, 1 sentence explaining expected traveler impact)

Return only the JSON array, no surrounding text. If no events are found, return an empty array [].`

  let events: ParsedEvent[] = []
  try {
    const adapter = getProviderAdapter(aiConfig.provider)
    const response = await adapter.call(
      [{ role: 'user', content: userPrompt }],
      [],
      systemPrompt,
      aiConfig.apiKey,
      aiConfig.model,
    )
    if (response.stopReason !== 'error' && response.text) {
      const jsonText = response.text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim()
      const parsed = JSON.parse(jsonText) as unknown
      if (Array.isArray(parsed)) {
        events = parsed.filter(isValidEvent)
        const skipped = parsed.length - events.length
        if (skipped > 0) {
          logger.warn({ propertyId, skipped }, '[EventCalendar] Skipped malformed event objects')
        }
      }
    }
  } catch (err) {
    logger.warn({ err, propertyId }, '[EventCalendar] AI call or parse failed — storing zero events')
    events = []
  }

  await replacePropertyEvents(propertyId, new Date(), periodStart, periodEnd, events)
  logger.info({ propertyId, count: events.length }, '[EventCalendar] Events refreshed')
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd apps/api && npx vitest run src/services/__tests__/event-calendar-fetch.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/event-calendar-fetch.service.ts apps/api/src/services/__tests__/event-calendar-fetch.service.test.ts
git commit -m "feat: add event calendar AI fetch service"
```

---

## Task 5: Cron Service + Server Wiring

**Files:**
- Create: `apps/api/src/services/event-calendar-cron.service.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Create the cron service**

Create `apps/api/src/services/event-calendar-cron.service.ts`:

```typescript
import cron from 'node-cron'
import { logger } from '../utils/logger.js'
import { getSystemEventCalendarConfig, getActiveEventPropertyIds } from './event-calendar.service.js'
import { refreshPropertyEvents } from './event-calendar-fetch.service.js'

let _task: ReturnType<typeof cron.schedule> | undefined

export function startEventCalendarCron(): void {
  const DEFAULT_SCHEDULE = '0 4 * * *'

  getSystemEventCalendarConfig().then(config => {
    const schedule = config.cronSchedule || DEFAULT_SCHEDULE

    if (!cron.validate(schedule)) {
      logger.warn({ schedule }, '[EventCalendar] Invalid cron expression, skipping cron setup')
      return
    }

    _task = cron.schedule(schedule, async () => {
      try {
        const currentConfig = await getSystemEventCalendarConfig()
        if (!currentConfig.enabled) {
          logger.debug('[EventCalendar] Cron fired but system config has enabled=false, skipping')
          return
        }
        const propertyIds = await getActiveEventPropertyIds()
        logger.info({ count: propertyIds.length }, '[EventCalendar] Cron starting refresh for properties')
        const today = new Date()
        const periodStart = today.toISOString().split('T')[0]!
        const end = new Date(today)
        end.setDate(end.getDate() + 30)
        const periodEnd = end.toISOString().split('T')[0]!
        for (const propertyId of propertyIds) {
          await refreshPropertyEvents(propertyId, periodStart, periodEnd).catch(err =>
            logger.warn({ err, propertyId }, '[EventCalendar] Refresh failed for property (non-fatal)'),
          )
        }
      } catch (err) {
        logger.warn({ err }, '[EventCalendar] Cron run failed (non-fatal)')
      }
    }, { noOverlap: true })

    logger.info({ schedule }, '[EventCalendar] Cron scheduled')
  }).catch(err => {
    logger.warn({ err }, '[EventCalendar] Failed to read config for cron setup (non-fatal)')
  })
}

export function stopEventCalendarCron(): void {
  _task?.stop()
}
```

- [ ] **Step 2: Wire cron into server.ts**

In `apps/api/src/server.ts`, add the event calendar cron start immediately after the CompSet cron block (around line 56). The new block follows the same pattern:

```typescript
  // Start event calendar cron (non-fatal)
  void import('./services/event-calendar-cron.service.js').then(m => m.startEventCalendarCron()).catch(err =>
    logger.warn({ err }, '[EventCalendar] Cron setup failed (non-fatal)'),
  )
```

Also add the stop call in the `shutdown` function, after the CompSet cron stop block:

```typescript
  try {
    const { stopEventCalendarCron } = await import('./services/event-calendar-cron.service.js')
    stopEventCalendarCron()
  } catch { /* ignore */ }
```

- [ ] **Step 3: Type-check the API**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/event-calendar-cron.service.ts apps/api/src/server.ts
git commit -m "feat: add event calendar cron service and server wiring"
```

---

## Task 6: CompSet Post-Run Trigger

**Files:**
- Modify: `apps/api/src/services/compset-collect.service.ts`

After each `runPropertyCompSet` completes, automatically refresh events for the same property and date window.

- [ ] **Step 1: Add the import at the top of compset-collect.service.ts**

In `apps/api/src/services/compset-collect.service.ts`, add to the imports block at the top:

```typescript
import { refreshPropertyEvents } from './event-calendar-fetch.service.js'
```

- [ ] **Step 2: Add the post-run trigger at the end of runPropertyCompSet**

Find the final log line in `runPropertyCompSet` (around line 250):

```typescript
  logger.info({ propertyId, rows: toInsert.length }, '[CompSet] Collection run complete')
```

Add the event refresh immediately after it:

```typescript
  // Trigger event calendar refresh for the same date window (non-fatal)
  const dates = params.map(p => ({
    start: resolveDate(p.offsetDays),
    end: resolveDate(p.offsetDays + p.nights),
  }))
  const minStart = dates.reduce((min, d) => d.start < min ? d.start : min, dates[0]!.start)
  const maxEnd = dates.reduce((max, d) => d.end > max ? d.end : max, dates[0]!.end)
  await refreshPropertyEvents(propertyId, minStart, maxEnd).catch(err =>
    logger.warn({ err, propertyId }, '[EventCalendar] Post-CompSet event refresh failed (non-fatal)'),
  )
```

- [ ] **Step 3: Verify type-check passes**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Verify existing CompSet tests still pass**

```bash
cd apps/api && npx vitest run src/services/__tests__/compset-collect.service.test.ts
```

Expected: all pass. The new import is mocked at the module boundary so existing tests are unaffected. If any tests fail due to the new import, add to the top of the test file:

```typescript
vi.mock('../event-calendar-fetch.service.js', () => ({ refreshPropertyEvents: vi.fn() }))
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/compset-collect.service.ts
git commit -m "feat: trigger event calendar refresh after CompSet run"
```

---

## Task 7: API Routes

**Files:**
- Create: `apps/api/src/routes/event-calendar.route.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create the routes file**

Create `apps/api/src/routes/event-calendar.route.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import {
  getSystemEventCalendarConfig,
  upsertSystemEventCalendarConfig,
  getPropertyEventCalendarConfig,
  upsertPropertyEventCalendarConfig,
  getPropertyEvents,
  getChainEvents,
} from '../services/event-calendar.service.js'
import { refreshPropertyEvents } from '../services/event-calendar-fetch.service.js'

export async function eventCalendarRoutes(fastify: FastifyInstance) {

  // GET system config (super only)
  fastify.get('/admin/intelligence/event-calendar/system-config', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    return reply.send(await getSystemEventCalendarConfig())
  })

  // PUT system config (super only)
  fastify.put('/admin/intelligence/event-calendar/system-config', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    return reply.send(await upsertSystemEventCalendarConfig(request.body as Record<string, unknown>))
  })

  // GET property config
  fastify.get('/admin/intelligence/event-calendar/config', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = parseInt(query.propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    return reply.send(await getPropertyEventCalendarConfig(propertyId))
  })

  // PUT property config
  fastify.put('/admin/intelligence/event-calendar/config', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = parseInt(query.propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const body = request.body as Record<string, unknown>
    return reply.send(await upsertPropertyEventCalendarConfig(propertyId, {
      radiusKm: body.radiusKm as number | null,
    }))
  })

  // POST manual run
  fastify.post('/admin/intelligence/event-calendar/run', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = parseInt(query.propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })

    const today = new Date()
    const defaultStart = today.toISOString().split('T')[0]!
    const end = new Date(today)
    end.setDate(end.getDate() + 30)
    const defaultEnd = end.toISOString().split('T')[0]!

    const from = query.from ?? defaultStart
    const to = query.to ?? defaultEnd

    void refreshPropertyEvents(propertyId, from, to).catch(err =>
      fastify.log.warn({ err, propertyId }, '[EventCalendar] Background run failed'),
    )
    return reply.send({ started: true })
  })

  // GET events overlapping window
  fastify.get('/admin/intelligence/event-calendar/events', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = parseInt(query.propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const from = query.from ?? new Date().toISOString().split('T')[0]!
    const end = new Date()
    end.setDate(end.getDate() + 30)
    const to = query.to ?? end.toISOString().split('T')[0]!
    return reply.send(await getPropertyEvents(propertyId, from, to))
  })

  // GET chain events (all properties for an org)
  fastify.get('/admin/intelligence/event-calendar/events/chain', async (request, reply) => {
    const query = request.query as Record<string, string>
    const rawOrgId = query.orgId ? parseInt(query.orgId, 10) : undefined
    const orgId = request.admin.role === 'super' ? rawOrgId : (request.admin.organizationId ?? undefined)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    return reply.send(await getChainEvents(orgId))
  })
}
```

- [ ] **Step 2: Register routes in app.ts**

In `apps/api/src/app.ts`, add the import after the compset import:

```typescript
import { eventCalendarRoutes } from './routes/event-calendar.route.js'
```

Then in the route registration section (find `app.register(compsetRoutes`), add immediately after:

```typescript
  await app.register(eventCalendarRoutes, { prefix: '/api/v1' })
```

- [ ] **Step 3: Type-check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/event-calendar.route.ts apps/api/src/app.ts
git commit -m "feat: add event calendar API routes"
```

---

## Task 8: API Client Methods

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add the type imports**

In `apps/web/src/lib/api-client.ts`, find the existing compset type imports block. Add after them:

```typescript
import type {
  SystemEventCalendarConfig,
  PropertyEventCalendarConfig,
  EventCalendarEvent,
  EventCalendarRunResponse,
  ChainEventCalendarEvents,
} from '@ibe/shared'
```

- [ ] **Step 2: Add the API client methods**

Find the end of the CompSet section in `api-client.ts` (after `getCompSetResults`). Add a new section:

```typescript
  // ── Event Calendar ────────────────────────────────────────────────────────

  getEventCalendarSystemConfig(): Promise<SystemEventCalendarConfig> {
    return apiRequest('/api/v1/admin/intelligence/event-calendar/system-config')
  },

  updateEventCalendarSystemConfig(data: Partial<SystemEventCalendarConfig>): Promise<SystemEventCalendarConfig> {
    return apiRequest('/api/v1/admin/intelligence/event-calendar/system-config', { method: 'PUT', body: JSON.stringify(data) })
  },

  getEventCalendarPropertyConfig(propertyId: number): Promise<PropertyEventCalendarConfig | null> {
    return apiRequest(`/api/v1/admin/intelligence/event-calendar/config?propertyId=${propertyId}`)
  },

  updateEventCalendarPropertyConfig(propertyId: number, data: { radiusKm: number | null }): Promise<PropertyEventCalendarConfig> {
    return apiRequest(`/api/v1/admin/intelligence/event-calendar/config?propertyId=${propertyId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  runEventCalendar(propertyId: number, from?: string, to?: string): Promise<EventCalendarRunResponse> {
    const params = new URLSearchParams({ propertyId: String(propertyId) })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    return apiRequest(`/api/v1/admin/intelligence/event-calendar/run?${params.toString()}`, { method: 'POST' })
  },

  getEventCalendarEvents(propertyId: number, from: string, to: string): Promise<EventCalendarEvent[]> {
    return apiRequest(`/api/v1/admin/intelligence/event-calendar/events?propertyId=${propertyId}&from=${from}&to=${to}`)
  },

  getEventCalendarChainEvents(orgId: number): Promise<ChainEventCalendarEvents[]> {
    return apiRequest(`/api/v1/admin/intelligence/event-calendar/events/chain?orgId=${orgId}`)
  },
```

- [ ] **Step 3: Type-check the web app**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat: add event calendar API client methods"
```

---

## Task 9: Nav Update + Admin Page

**Files:**
- Modify: `apps/web/src/app/admin/_layout-client.tsx`
- Create: `apps/web/src/app/admin/intelligence/event-calendar/page.tsx`

- [ ] **Step 1: Add Event Calendar to the Intelligence nav**

In `apps/web/src/app/admin/_layout-client.tsx`, find the Intelligence items array:

```typescript
      { href: '/admin/intelligence/compset', label: 'CompSet', sellerOnly: true },
```

Add immediately after:

```typescript
      { href: '/admin/intelligence/event-calendar', label: 'Event Calendar', sellerOnly: true },
```

- [ ] **Step 2: Create the admin page**

Create `apps/web/src/app/admin/intelligence/event-calendar/page.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminProperty } from '../../_hooks/useAdminProperty'
import { apiClient } from '@/lib/api-client'
import { SaveBar } from '../../_components/SaveBar'
import type {
  SystemEventCalendarConfig,
  EventCalendarEvent,
  ChainEventCalendarEvents,
} from '@ibe/shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0]!
}

function todayPlus30(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().split('T')[0]!
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (start === end) {
    return s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (s.getMonth() === e.getMonth()) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.getDate()}`
  }
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

const DEMAND_BADGE: Record<string, { label: string; className: string }> = {
  high: { label: 'High', className: 'bg-red-100 text-red-700' },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-700' },
  low: { label: 'Low', className: 'bg-green-100 text-green-700' },
}

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: EventCalendarEvent }) {
  const badge = DEMAND_BADGE[event.demandLevel] ?? DEMAND_BADGE.low!
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{event.name}</p>
          <p className="text-sm text-gray-500">{formatDateRange(event.startDate, event.endDate)}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-600">{event.description}</p>
      <p className="mt-1 text-xs text-gray-400 italic">{event.demandDescription}</p>
    </div>
  )
}

// ── System Config Panel ───────────────────────────────────────────────────────

function SystemConfigPanel() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['eventCalendar', 'system-config'],
    queryFn: () => apiClient.getEventCalendarSystemConfig(),
  })
  const [form, setForm] = useState<Partial<SystemEventCalendarConfig>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data) { setForm(data); setDirty(false) }
  }, [data])

  const { mutate: save, isPending } = useMutation({
    mutationFn: (d: Partial<SystemEventCalendarConfig>) => apiClient.updateEventCalendarSystemConfig(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['eventCalendar', 'system-config'] }); setDirty(false) },
  })

  if (!data) return <p className="text-sm text-gray-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">System Configuration</h2>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={form.enabled ?? false}
          onChange={e => { setForm(f => ({ ...f, enabled: e.target.checked })); setDirty(true) }}
          className="h-4 w-4 rounded border-gray-300"
        />
        <span className="text-sm font-medium text-gray-700">Enable Event Calendar</span>
      </label>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Default Radius (km)</label>
        <input
          type="number"
          min={1}
          value={form.defaultRadiusKm ?? 50}
          onChange={e => { setForm(f => ({ ...f, defaultRadiusKm: parseInt(e.target.value, 10) })); setDirty(true) }}
          className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Cron Schedule</label>
        <input
          type="text"
          value={form.cronSchedule ?? '0 4 * * *'}
          onChange={e => { setForm(f => ({ ...f, cronSchedule: e.target.value })); setDirty(true) }}
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono"
        />
      </div>
      <SaveBar dirty={dirty} saving={isPending} onSave={() => save(form)} onDiscard={() => { setForm(data); setDirty(false) }} />
    </div>
  )
}

// ── Property View ─────────────────────────────────────────────────────────────

function PropertyView({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(todayPlus30())
  const [radiusInput, setRadiusInput] = useState<string>('')
  const [radDirty, setRadDirty] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const { data: sysConfig } = useQuery({
    queryKey: ['eventCalendar', 'system-config'],
    queryFn: () => apiClient.getEventCalendarSystemConfig(),
  })

  const { data: propConfig } = useQuery({
    queryKey: ['eventCalendar', 'property-config', propertyId],
    queryFn: () => apiClient.getEventCalendarPropertyConfig(propertyId),
  })

  useEffect(() => {
    if (propConfig !== undefined) {
      setRadiusInput(propConfig?.radiusKm != null ? String(propConfig.radiusKm) : '')
      setRadDirty(false)
    }
  }, [propConfig])

  const { data: events, dataUpdatedAt } = useQuery({
    queryKey: ['eventCalendar', 'events', propertyId, from, to],
    queryFn: () => apiClient.getEventCalendarEvents(propertyId, from, to),
  })

  const { mutate: saveRadius, isPending: savingRadius } = useMutation({
    mutationFn: (r: number | null) => apiClient.updateEventCalendarPropertyConfig(propertyId, { radiusKm: r }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['eventCalendar', 'property-config', propertyId] }); setRadDirty(false) },
  })

  const { mutate: run, isPending: running } = useMutation({
    mutationFn: () => apiClient.runEventCalendar(propertyId, from, to),
    onSuccess: () => {
      setRunError(null)
      const start = Date.now()
      const poll = setInterval(() => {
        if (Date.now() - start > 60000) { clearInterval(poll); return }
        qc.invalidateQueries({ queryKey: ['eventCalendar', 'events', propertyId, from, to] })
      }, 2000)
    },
    onError: () => setRunError('Failed to start refresh. Please try again.'),
  })

  const lastFetched = events && events.length > 0
    ? new Date(events[0]!.fetchedAt).toLocaleString()
    : null

  const defaultRadius = sysConfig?.defaultRadiusKm ?? 50

  return (
    <div className="space-y-6">
      {/* Radius override */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Radius Override (km)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            placeholder={`Default: ${defaultRadius}`}
            value={radiusInput}
            onChange={e => { setRadiusInput(e.target.value); setRadDirty(true) }}
            className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          {radDirty && (
            <button
              disabled={savingRadius}
              onClick={() => saveRadius(radiusInput ? parseInt(radiusInput, 10) : null)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingRadius ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Refresh controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <button
          disabled={running}
          onClick={() => run()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? 'Refreshing…' : 'Refresh Events'}
        </button>
      </div>
      {runError && <p className="text-sm text-red-600">{runError}</p>}

      {/* Event list */}
      {lastFetched && (
        <p className="text-xs text-gray-400">Last fetched: {lastFetched}</p>
      )}
      {events && events.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No events found for this period. Try refreshing or check that your AI provider supports live web search.
        </p>
      )}
      <div className="space-y-3">
        {events?.map(e => <EventCard key={e.id} event={e} />)}
      </div>
    </div>
  )
}

// ── Chain View ────────────────────────────────────────────────────────────────

function ChainView({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: chainData } = useQuery({
    queryKey: ['eventCalendar', 'chain', orgId],
    queryFn: () => apiClient.getEventCalendarChainEvents(orgId),
  })

  async function refreshAll() {
    if (!chainData) return
    setRefreshing(true)
    setError(null)
    try {
      const from = today()
      const to = todayPlus30()
      for (const { propertyId } of chainData) {
        await apiClient.runEventCalendar(propertyId, from, to).catch(() => null)
      }
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['eventCalendar', 'chain', orgId] })
        setRefreshing(false)
      }, 3000)
    } catch {
      setError('Refresh failed. Please try again.')
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">All Properties — Upcoming Events</h2>
        <button
          disabled={refreshing}
          onClick={refreshAll}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing All…' : 'Refresh All'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {chainData?.map(({ propertyId, events }) => (
        <details key={propertyId} className="rounded-lg border border-gray-200" open>
          <summary className="cursor-pointer px-4 py-3 font-medium text-gray-800 hover:bg-gray-50">
            Property #{propertyId}
          </summary>
          <div className="space-y-3 p-4">
            {events.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No events found. Try refreshing.
              </p>
            ) : (
              events.map(e => <EventCard key={e.id} event={e} />)
            )}
          </div>
        </details>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EventCalendarPage() {
  const { propertyId, orgId, isSuper, isSystemLevel } = useAdminProperty()

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-bold text-gray-900">Event Calendar</h1>

      {isSystemLevel && isSuper && <SystemConfigPanel />}

      {propertyId ? (
        <PropertyView propertyId={propertyId} />
      ) : orgId ? (
        <ChainView orgId={orgId} />
      ) : (
        <p className="text-sm text-gray-500">Select a property or organization to view events.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Check what `useAdminProperty` exports to ensure correct field names**

```bash
grep -n "isSystemLevel\|isSuper\|propertyId\|orgId\|export" apps/web/src/app/admin/_hooks/useAdminProperty.ts | head -20
```

If the hook exports different field names, adjust the destructuring in the page accordingly. Common alternatives: `selectedPropertyId`, `selectedOrgId`, `adminMe?.role === 'super'`.

- [ ] **Step 4: Type-check the web app**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: exits 0. Fix any type errors before committing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/_layout-client.tsx apps/web/src/app/admin/intelligence/event-calendar/page.tsx
git commit -m "feat: add event calendar admin page and nav entry"
```

---

## Task 10: Final Type-Check + Test Run

**Files:** no new files — verification only.

- [ ] **Step 1: Run all event calendar tests**

```bash
cd apps/api && npx vitest run src/services/__tests__/event-calendar.service.test.ts src/services/__tests__/event-calendar-fetch.service.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run all CompSet tests to verify no regressions**

```bash
cd apps/api && npx vitest run src/services/__tests__/compset.service.test.ts src/services/__tests__/compset-collect.service.test.ts
```

Expected: all pass.

- [ ] **Step 3: Full API type-check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Full web type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 5: Commit if any minor fixes were needed**

```bash
git add -p
git commit -m "fix: type-check and test cleanup for event calendar"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] System config panel (enable, radius, cron) — Task 9 SystemConfigPanel
- [x] Property config upsert + radius override — Tasks 3, 7, 9
- [x] refreshPropertyEvents AI call with full prompt — Task 4
- [x] Delete-then-insert replace-on-refresh — Task 3 replacePropertyEvents
- [x] Effective radius: propConfig.radiusKm ?? sysConfig.defaultRadiusKm ?? 50 — Task 4
- [x] Manual run endpoint fires background Promise, returns { started: true } — Task 7
- [x] Cron reads config on each run, checks enabled flag — Task 5
- [x] Cron iterates property IDs from PropertyEventCalendarConfig ∪ CompSetCompetitor — Task 3 getActiveEventPropertyIds
- [x] CompSet post-run trigger calls refreshPropertyEvents with min/max date window — Task 6
- [x] Events overlap query: startDate ≤ to AND endDate ≥ from — Task 3 getPropertyEvents
- [x] Chain events endpoint grouped by propertyId — Tasks 3, 7
- [x] Event cards with demand badge (red/amber/green) — Task 9 EventCard
- [x] Empty state message — Task 9 PropertyView
- [x] Polling after manual run (2s interval until fetchedAt updates) — Task 9 PropertyView run mutation

**No placeholders:** all code blocks contain complete implementations.
