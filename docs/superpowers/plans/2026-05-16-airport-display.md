# Airport Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple nearest-airport display from Amadeus WL into its own system→org→property config with its own admin card in the Design tab.

**Architecture:** Three new Prisma models (`SystemAirportConfig`, `OrgAirportConfig`, `PropertyAirportConfig`) own the airport dataset and display settings. A new `airport-config.service.ts` owns all airport logic; the WL service calls it for `iataCode`. The guest `NearestAirports` component is unchanged — only the endpoint's gate changes.

**Tech Stack:** Prisma + PostgreSQL, Fastify, Next.js 14 (App Router), React Query, Vitest, Zod-free shared types (plain TS interfaces).

---

## File Map

**Create:**
- `packages/shared/src/types/airport-config.ts` — `AirportConfigResponse`, `AirportConfigUpdate`, `ResolvedAirportConfig`, `NearestAirport`, `NearestAirportsResponse`
- `apps/api/src/services/airport-config.service.ts` — all airport CRUD + inheritance logic
- `apps/api/src/services/__tests__/airport-config.service.test.ts` — vitest unit tests
- `apps/api/src/routes/airport-config.route.ts` — admin + public airport routes
- `apps/web/src/app/admin/design/airports/page.tsx` — airport display admin page

**Modify:**
- `packages/shared/src/types/wl-config.ts` — remove `NearestAirport`, `NearestAirportsResponse`, `airportRadiusKm`, `airportMaxCount` fields
- `packages/shared/src/index.ts` — add export for `airport-config.ts`
- `apps/api/prisma/schema.prisma` — add 3 new models, remove 4 fields from `SystemWLConfig`
- `apps/api/src/services/wl-config.service.ts` — remove airport functions; call airport service for `iataCode`
- `apps/api/src/routes/wl-config.route.ts` — remove `/airports/nearest` and `/refresh-airports` endpoints
- `apps/api/src/app.ts` — register new route
- `apps/web/src/lib/api-client.ts` — add airport config methods, update URLs
- `apps/web/src/app/admin/config/events/amadeus-wl-card.tsx` — remove airport sliders + dataset refresh section
- `apps/web/src/app/admin/_layout-client.tsx` — add Airports nav item to Display & Design

---

### Task 1: Schema changes + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260516000001_add_airport_config/migration.sql`

- [ ] **Step 1: Add 3 new models to schema and remove 4 fields from SystemWLConfig**

In `apps/api/prisma/schema.prisma`, add before the WL section (line ~1688):

```prisma
// ── Airport Display ────────────────────────────────────────────────────────────

model SystemAirportConfig {
  id                      Int       @id @default(autoincrement())
  enabled                 Boolean   @default(false)
  radiusKm                Int       @default(100)
  maxCount                Int       @default(3)
  airportDataset          Json?     // AirportEntry[] refreshed from OpenFlights
  airportDatasetUpdatedAt DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
}

model OrgAirportConfig {
  id             Int          @id @default(autoincrement())
  organizationId Int          @unique
  organization   Organization @relation(fields: [organizationId], references: [id])
  enabled        Boolean?     // null = inherit from system
  radiusKm       Int?         // null = inherit from system
  maxCount       Int?         // null = inherit from system
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}

model PropertyAirportConfig {
  id         Int      @id @default(autoincrement())
  propertyId Int      @unique
  property   Property @relation(fields: [propertyId], references: [propertyId])
  enabled    Boolean? // null = inherit from org → system
  radiusKm   Int?     // null = inherit from org → system
  maxCount   Int?     // null = inherit from org → system
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

Also add back-relations in `Organization` and `Property` models:
- In `Organization` model add: `orgAirportConfig    OrgAirportConfig?`
- In `Property` model add: `propertyAirportConfig PropertyAirportConfig?`

Then in `SystemWLConfig` model, remove these 4 lines:
```prisma
  airportDataset           Json?     // AirportEntry[] refreshed from OpenFlights
  airportDatasetUpdatedAt  DateTime?
  airportRadiusKm          Int       @default(100)
  airportMaxCount          Int       @default(3)
```

- [ ] **Step 2: Create migration with --create-only**

```bash
cd apps/api && npx prisma migrate dev --create-only --name add_airport_config
```

Expected: creates `prisma/migrations/20260516000001_add_airport_config/migration.sql` (timestamp may differ).

- [ ] **Step 3: Prepend data-copy SQL to the migration file**

Open the generated `migration.sql` and prepend this block BEFORE the `-- CreateTable` for `SystemAirportConfig`:

```sql
-- Migrate airport data from SystemWLConfig into new SystemAirportConfig
INSERT INTO "SystemAirportConfig" ("enabled", "radiusKm", "maxCount", "airportDataset", "airportDatasetUpdatedAt", "createdAt", "updatedAt")
SELECT
  false,
  COALESCE("airportRadiusKm", 100),
  COALESCE("airportMaxCount", 3),
  "airportDataset",
  "airportDatasetUpdatedAt",
  NOW(),
  NOW()
FROM "SystemWLConfig"
LIMIT 1;

```

- [ ] **Step 4: Apply migration and regenerate client**

```bash
cd apps/api && npx prisma migrate dev && npx prisma generate
```

Expected: migration applies, Prisma client regenerates with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add SystemAirportConfig/OrgAirportConfig/PropertyAirportConfig models"
```

---

### Task 2: Shared types

**Files:**
- Create: `packages/shared/src/types/airport-config.ts`
- Modify: `packages/shared/src/types/wl-config.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create airport-config.ts**

```typescript
export interface NearestAirport {
  code: string        // "LHR"
  name: string        // "London Heathrow Airport"
  distanceKm: number  // 12
}

export interface NearestAirportsResponse {
  airports: NearestAirport[]
}

export interface AirportConfigResponse {
  enabled: boolean
  radiusKm: number           // effective value (system default if not overridden)
  maxCount: number           // effective value
  hasOwnConfig: boolean
  datasetUpdatedAt: string | null  // system tier only; null at org/property
}

export interface AirportConfigUpdate {
  enabled?: boolean | null   // null = revert to inherit
  radiusKm?: number | null   // null = revert to inherit
  maxCount?: number | null   // null = revert to inherit
}

export interface ResolvedAirportConfig {
  enabled: boolean
  radiusKm: number
  maxCount: number
}
```

- [ ] **Step 2: Remove NearestAirport + NearestAirportsResponse from wl-config.ts**

In `packages/shared/src/types/wl-config.ts`, delete the `NearestAirport` interface (lines 1-5) and `NearestAirportsResponse` interface (lines 34-36).

Also remove `airportRadiusKm` and `airportMaxCount` from `WLConfigResponse` and `WLConfigUpdate`.

The final `wl-config.ts` should be:

```typescript
export interface WLConfigResponse {
  channelUuidSet: boolean
  channelUuidMasked: string | null
  enabled: boolean
  enforceChildCreds: boolean
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
}

export interface WLConfigUpdate {
  channelUuid?: string
  enabled?: boolean
  enforceChildCreds?: boolean
  systemServiceDisabled?: boolean
}

export interface ResolvedWLConfig {
  channelUuid: string | null
  enabled: boolean
  iataCode: string | null
}
```

- [ ] **Step 3: Add export to index.ts**

In `packages/shared/src/index.ts`, add:
```typescript
export * from './types/airport-config.js'
```

- [ ] **Step 4: Build shared package to catch type errors**

```bash
cd packages/shared && npm run build
```

Expected: builds with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/airport-config.ts packages/shared/src/types/wl-config.ts packages/shared/src/index.ts
git commit -m "feat: add AirportConfig shared types, move NearestAirport out of wl-config"
```

---

### Task 3: Airport config service + tests

**Files:**
- Create: `apps/api/src/services/airport-config.service.ts`
- Create: `apps/api/src/services/__tests__/airport-config.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/__tests__/airport-config.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemAirportConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    orgAirportConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyAirportConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyDataProviderConfig: { findUnique: vi.fn() },
    property: { findUnique: vi.fn() },
  },
}))

import { prisma } from '../../db/client.js'
import {
  getResolvedAirportConfig,
  getNearestAirports,
} from '../airport-config.service.js'

const mp = prisma as any
beforeEach(() => { vi.clearAllMocks() })

const SYS_ROW = {
  enabled: true, radiusKm: 100, maxCount: 3,
  airportDataset: null, airportDatasetUpdatedAt: null,
}

describe('getResolvedAirportConfig — system only', () => {
  it('returns system values when no org/property override', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)

    const result = await getResolvedAirportConfig(42)
    expect(result).toEqual({ enabled: true, radiusKm: 100, maxCount: 3 })
  })

  it('returns disabled when system disabled', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({ ...SYS_ROW, enabled: false })
    mp.orgAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)

    const result = await getResolvedAirportConfig(42)
    expect(result.enabled).toBe(false)
  })
})

describe('getResolvedAirportConfig — org override', () => {
  it('org enabled=false overrides system enabled=true', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: false, radiusKm: null, maxCount: null })
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)

    const result = await getResolvedAirportConfig(42)
    expect(result.enabled).toBe(false)
    expect(result.radiusKm).toBe(100) // inherits system
  })

  it('org radiusKm overrides system radiusKm', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: 200, maxCount: null })
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)

    const result = await getResolvedAirportConfig(42)
    expect(result.enabled).toBe(true) // inherits system
    expect(result.radiusKm).toBe(200)
    expect(result.maxCount).toBe(3) // inherits system
  })
})

describe('getResolvedAirportConfig — property override', () => {
  it('property enabled=false overrides system+org enabled=true', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: true, radiusKm: null, maxCount: null })
    mp.propertyAirportConfig.findUnique.mockResolvedValue({ enabled: false, radiusKm: null, maxCount: null })

    const result = await getResolvedAirportConfig(42)
    expect(result.enabled).toBe(false)
  })

  it('property maxCount overrides all', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: 200, maxCount: 4 })
    mp.propertyAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: 1 })

    const result = await getResolvedAirportConfig(42)
    expect(result.maxCount).toBe(1)
    expect(result.radiusKm).toBe(200) // org overrides system; property inherits org
  })
})

describe('getNearestAirports', () => {
  it('returns empty array when airport display disabled', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({ ...SYS_ROW, enabled: false })
    mp.orgAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyDataProviderConfig.findUnique.mockResolvedValue({ lat: 51.5074, lng: -0.1278 })

    const result = await getNearestAirports(42)
    expect(result.airports).toEqual([])
  })

  it('returns empty array when no coordinates', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyDataProviderConfig.findUnique.mockResolvedValue(null)

    const result = await getNearestAirports(42)
    expect(result.airports).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx vitest run src/services/__tests__/airport-config.service.test.ts
```

Expected: FAIL — `airport-config.service.js` not found.

- [ ] **Step 3: Implement airport-config.service.ts**

Create `apps/api/src/services/airport-config.service.ts`:

```typescript
import { prisma } from '../db/client.js'
import { findNearestAirports, type AirportEntry } from '../utils/iata-lookup.js'
import type {
  AirportConfigResponse, AirportConfigUpdate, ResolvedAirportConfig, NearestAirportsResponse
} from '@ibe/shared'

const SYS_DEFAULTS = { enabled: false, radiusKm: 100, maxCount: 3 }

function sysToResponse(row: {
  enabled: boolean; radiusKm: number; maxCount: number;
  airportDatasetUpdatedAt: Date | null
} | null): AirportConfigResponse {
  return {
    enabled: row?.enabled ?? SYS_DEFAULTS.enabled,
    radiusKm: row?.radiusKm ?? SYS_DEFAULTS.radiusKm,
    maxCount: row?.maxCount ?? SYS_DEFAULTS.maxCount,
    hasOwnConfig: !!row,
    datasetUpdatedAt: row?.airportDatasetUpdatedAt?.toISOString() ?? null,
  }
}

function childToResponse(
  row: { enabled: boolean | null; radiusKm: number | null; maxCount: number | null } | null,
  sys: AirportConfigResponse,
  hasOwn: boolean
): AirportConfigResponse {
  return {
    enabled: row?.enabled ?? sys.enabled,
    radiusKm: row?.radiusKm ?? sys.radiusKm,
    maxCount: row?.maxCount ?? sys.maxCount,
    hasOwnConfig: hasOwn,
    datasetUpdatedAt: null,
  }
}

export async function getSystemAirportConfig(): Promise<AirportConfigResponse> {
  const row = await prisma.systemAirportConfig.findFirst()
  return sysToResponse(row)
}

export async function upsertSystemAirportConfig(data: AirportConfigUpdate): Promise<AirportConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.enabled !== undefined && data.enabled !== null) update.enabled = data.enabled
  if (data.radiusKm !== undefined && data.radiusKm !== null) update.radiusKm = data.radiusKm
  if (data.maxCount !== undefined && data.maxCount !== null) update.maxCount = data.maxCount

  const existing = await prisma.systemAirportConfig.findFirst()
  const row = existing
    ? await prisma.systemAirportConfig.update({ where: { id: existing.id }, data: update })
    : await prisma.systemAirportConfig.create({ data: { ...update } })
  return sysToResponse(row)
}

export async function refreshAirportDataset(): Promise<{ count: number; updatedAt: string }> {
  const url = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports-extended.dat'
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Failed to fetch airports: ${res.status}`)
  const text = await res.text()

  const entries: AirportEntry[] = []
  const seen = new Set<string>()

  for (const line of text.split('\n')) {
    const parts = line.split(',').map((p: string) => p.replace(/^"|"$/g, '').trim())
    const name = parts[1] ?? ''
    const iata = parts[4] ?? ''
    const lat = parseFloat(parts[6] ?? '')
    const lng = parseFloat(parts[7] ?? '')
    const type = parts[12] ?? ''
    if (type !== 'airport') continue
    if (name === 'All Airports') continue
    if (!iata || iata === '\\N' || !/^[A-Z]{3}$/.test(iata) || isNaN(lat) || isNaN(lng)) continue
    if (seen.has(iata)) continue
    seen.add(iata)
    entries.push({ code: iata, name, lat, lng })
  }

  if (entries.length < 1000) throw new Error(`Unexpectedly small airport dataset: ${entries.length} entries`)

  const now = new Date()
  const existing = await prisma.systemAirportConfig.findFirst()
  if (existing) {
    await prisma.systemAirportConfig.update({
      where: { id: existing.id },
      data: { airportDataset: entries as unknown as never, airportDatasetUpdatedAt: now },
    })
  } else {
    await prisma.systemAirportConfig.create({
      data: { airportDataset: entries as unknown as never, airportDatasetUpdatedAt: now },
    })
  }

  return { count: entries.length, updatedAt: now.toISOString() }
}

export async function getOrgAirportConfig(orgId: number): Promise<AirportConfigResponse> {
  const [sys, row] = await Promise.all([
    getSystemAirportConfig(),
    prisma.orgAirportConfig.findUnique({ where: { organizationId: orgId } }),
  ])
  return childToResponse(row, sys, !!row)
}

export async function upsertOrgAirportConfig(orgId: number, data: AirportConfigUpdate): Promise<AirportConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.enabled !== undefined) update.enabled = data.enabled  // allow null
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxCount !== undefined) update.maxCount = data.maxCount

  const row = await prisma.orgAirportConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  const sys = await getSystemAirportConfig()
  return childToResponse(row, sys, true)
}

export async function getPropertyAirportConfig(propertyId: number): Promise<AirportConfigResponse> {
  const [prop, row] = await Promise.all([
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
    prisma.propertyAirportConfig.findUnique({ where: { propertyId } }),
  ])
  const orgId = prop?.organizationId
  const sys = await getSystemAirportConfig()
  const orgRow = orgId ? await prisma.orgAirportConfig.findUnique({ where: { organizationId: orgId } }) : null
  const orgResolved = childToResponse(orgRow, sys, !!orgRow)
  return childToResponse(row, orgResolved, !!row)
}

export async function upsertPropertyAirportConfig(propertyId: number, data: AirportConfigUpdate): Promise<AirportConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxCount !== undefined) update.maxCount = data.maxCount

  const row = await prisma.propertyAirportConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...update },
    update,
  })
  const [prop] = await Promise.all([
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
  ])
  const orgId = prop?.organizationId
  const sys = await getSystemAirportConfig()
  const orgRow = orgId ? await prisma.orgAirportConfig.findUnique({ where: { organizationId: orgId } }) : null
  const orgResolved = childToResponse(orgRow, sys, !!orgRow)
  return childToResponse(row, orgResolved, true)
}

export async function getResolvedAirportConfig(propertyId: number): Promise<ResolvedAirportConfig> {
  const [prop, propRow] = await Promise.all([
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
    prisma.propertyAirportConfig.findUnique({ where: { propertyId } }),
  ])
  const orgId = prop?.organizationId

  const [sysRow, orgRow] = await Promise.all([
    prisma.systemAirportConfig.findFirst(),
    orgId ? prisma.orgAirportConfig.findUnique({ where: { organizationId: orgId } }) : Promise.resolve(null),
  ])

  const sys = sysToResponse(sysRow)
  const org = childToResponse(orgRow ?? null, sys, !!orgRow)
  const resolved = childToResponse(propRow ?? null, org, !!propRow)

  return { enabled: resolved.enabled, radiusKm: resolved.radiusKm, maxCount: resolved.maxCount }
}

async function getSystemDataset(): Promise<AirportEntry[] | undefined> {
  const row = await prisma.systemAirportConfig.findFirst({
    select: { airportDataset: true },
  })
  return row?.airportDataset ? (row.airportDataset as unknown as AirportEntry[]) : undefined
}

export async function getNearestAirports(propertyId: number): Promise<NearestAirportsResponse> {
  const [resolved, dpConfig] = await Promise.all([
    getResolvedAirportConfig(propertyId),
    prisma.propertyDataProviderConfig.findUnique({
      where: { propertyId },
      select: { lat: true, lng: true },
    }),
  ])

  if (!resolved.enabled || !dpConfig?.lat || !dpConfig?.lng) return { airports: [] }

  const dataset = await getSystemDataset()
  const airports = findNearestAirports(
    Number(dpConfig.lat), Number(dpConfig.lng),
    resolved.radiusKm, resolved.maxCount,
    dataset
  )
  return { airports }
}

// Used by WL service to get iataCode for URL building — does NOT check airport display enabled.
export async function getNearestAirportCode(propertyId: number): Promise<string | null> {
  const dpConfig = await prisma.propertyDataProviderConfig.findUnique({
    where: { propertyId },
    select: { lat: true, lng: true },
  })
  if (!dpConfig?.lat || !dpConfig?.lng) return null

  const resolved = await getResolvedAirportConfig(propertyId)
  const dataset = await getSystemDataset()
  const nearest = findNearestAirports(
    Number(dpConfig.lat), Number(dpConfig.lng),
    resolved.radiusKm, resolved.maxCount,
    dataset
  )
  return nearest[0]?.code ?? null
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/api && npx vitest run src/services/__tests__/airport-config.service.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/airport-config.service.ts apps/api/src/services/__tests__/airport-config.service.test.ts
git commit -m "feat: airport-config service with system→org→property inheritance"
```

---

### Task 4: Airport config route + app registration

**Files:**
- Create: `apps/api/src/routes/airport-config.route.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create airport-config.route.ts**

```typescript
import type { FastifyInstance } from 'fastify'
import type { AirportConfigUpdate } from '@ibe/shared'
import {
  getSystemAirportConfig, upsertSystemAirportConfig, refreshAirportDataset,
  getOrgAirportConfig, upsertOrgAirportConfig,
  getPropertyAirportConfig, upsertPropertyAirportConfig,
  getNearestAirports,
} from '../services/airport-config.service.js'

export async function airportAdminRoutes(fastify: FastifyInstance) {
  // ── System ────────────────────────────────────────────────────────────────
  fastify.get('/admin/airport/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemAirportConfig())
  })

  fastify.put('/admin/airport/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await upsertSystemAirportConfig(request.body as AirportConfigUpdate))
  })

  fastify.post('/admin/airport/config/system/refresh-dataset', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    try {
      return reply.send(await refreshAirportDataset())
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send({ error: 'Failed to refresh airport dataset' })
    }
  })

  // ── Org ───────────────────────────────────────────────────────────────────
  fastify.get('/admin/airport/config/org', async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? parseInt(rawOrgId, 10) : null)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await getOrgAirportConfig(orgId))
  })

  fastify.put('/admin/airport/config/org', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const orgId = request.admin.role === 'super'
      ? ((body.orgId as number | undefined) ?? request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await upsertOrgAirportConfig(orgId, body as AirportConfigUpdate))
  })

  // ── Property ──────────────────────────────────────────────────────────────
  fastify.get('/admin/airport/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string>).propertyId, 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
    return reply.send(await getPropertyAirportConfig(propertyId))
  })

  fastify.put('/admin/airport/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string>).propertyId, 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
    return reply.send(await upsertPropertyAirportConfig(propertyId, request.body as AirportConfigUpdate))
  })
}

export async function airportPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/airports/nearest', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    return reply.send(await getNearestAirports(propertyId))
  })
}
```

- [ ] **Step 2: Register routes in app.ts**

In `apps/api/src/app.ts`, add the import alongside the wl import:
```typescript
import { airportAdminRoutes, airportPublicRoutes } from './routes/airport-config.route.js'
```

Add public route registration near the other public routes (near `wlPublicRoutes`):
```typescript
await app.register(airportPublicRoutes, { prefix: '/api/v1' })
```

Add admin route registration near `wlAdminRoutes`:
```typescript
await adminApp.register(airportAdminRoutes, { prefix: '/api/v1' })
```

- [ ] **Step 3: Verify API compiles**

```bash
cd apps/api && npm run build 2>&1 | head -30
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/airport-config.route.ts apps/api/src/app.ts
git commit -m "feat: airport config admin + public routes"
```

---

### Task 5: Update WL service + route

**Files:**
- Modify: `apps/api/src/services/wl-config.service.ts`
- Modify: `apps/api/src/routes/wl-config.route.ts`

- [ ] **Step 1: Update wl-config.service.ts**

Remove these functions entirely: `refreshAirportDataset`, `getNearestAirports`, `getSystemDataset`, `getPropertyLatLng`.

Remove the import of `findNearestAirports` and `AirportEntry` from `iata-lookup.js`.

Remove `airportRadiusKm`, `airportMaxCount`, `airportDatasetUpdatedAt` from `systemRowToResponse` (and the `systemRowToResponse` function parameter type).

Update `getResolvedWLConfig` — replace the inline airport lookup block with a call to the airport service:

```typescript
// Replace this block in getResolvedWLConfig:
//   let iataCode: string | null = null
//   if (channelUuid && enabled && dpConfig?.lat && dpConfig?.lng) { ... }
// With:
import { getNearestAirportCode } from './airport-config.service.js'

let iataCode: string | null = null
if (channelUuid && enabled) {
  iataCode = await getNearestAirportCode(propertyId)
}
```

Add the import at the top of the file:
```typescript
import { getNearestAirportCode } from './airport-config.service.js'
```

Remove `dpConfig` from the initial `Promise.all` in `getResolvedWLConfig` (it was only needed for the airport lookup).

The updated `getResolvedWLConfig` parallel fetch should be:
```typescript
const [prop] = await Promise.all([
  prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
])
const orgId = prop?.organizationId ?? fallbackOrgId

const [sysRow, orgRow, propRow] = await Promise.all([
  prisma.systemWLConfig.findFirst(),
  orgId ? prisma.orgWLConfig.findUnique({ where: { organizationId: orgId } }) : null,
  prisma.propertyWLConfig.findUnique({ where: { propertyId } }),
])
```

Update `systemRowToResponse` parameter type and return — remove `airportRadiusKm`, `airportMaxCount`, `airportDatasetUpdatedAt` from both.

The updated `WLConfigResponse` return from `systemRowToResponse` should be:
```typescript
return {
  channelUuidSet: !!row?.channelUuid,
  channelUuidMasked: row?.channelUuid ? maskApiKey(row.channelUuid) : null,
  enabled: row?.enabled ?? false,
  enforceChildCreds: row?.enforceChildCreds ?? false,
  systemServiceDisabled: false,
  hasOwnConfig: !!row,
}
```

- [ ] **Step 2: Update wl-config.route.ts**

Remove the `refreshAirportDataset` and `getNearestAirports` imports.

Remove the `POST /admin/wl/config/system/refresh-airports` handler.

Remove the `GET /airports/nearest` handler from `wlPublicRoutes`.

- [ ] **Step 3: Verify API compiles**

```bash
cd apps/api && npm run build 2>&1 | head -30
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/wl-config.service.ts apps/api/src/routes/wl-config.route.ts
git commit -m "refactor: remove airport logic from WL service; delegate to airport-config service"
```

---

### Task 6: Update api-client.ts

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Update imports**

In `api-client.ts`, change the import from `wl-config` types:

Remove from the `@ibe/shared` import: `NearestAirportsResponse` (it now comes from `airport-config`).

Add to the `@ibe/shared` import: `AirportConfigResponse`, `AirportConfigUpdate`, `NearestAirportsResponse`.

- [ ] **Step 2: Update existing airport method URL**

The `getNearestAirports` method URL stays the same — `/api/v1/airports/nearest` is now served by `airportPublicRoutes` instead of `wlPublicRoutes`. No URL change needed.

- [ ] **Step 3: Update refreshAirportDataset URL**

Change:
```typescript
refreshAirportDataset(): Promise<{ count: number; updatedAt: string }> {
  return apiRequest('/api/v1/admin/wl/config/system/refresh-airports', { method: 'POST' })
},
```
To:
```typescript
refreshAirportDataset(): Promise<{ count: number; updatedAt: string }> {
  return apiRequest('/api/v1/admin/airport/config/system/refresh-dataset', { method: 'POST' })
},
```

- [ ] **Step 4: Add new airport config CRUD methods**

After the existing `getNearestAirports` method, add:

```typescript
getSystemAirportConfig(): Promise<AirportConfigResponse> {
  return apiRequest('/api/v1/admin/airport/config/system')
},

updateSystemAirportConfig(data: AirportConfigUpdate): Promise<AirportConfigResponse> {
  return apiRequest('/api/v1/admin/airport/config/system', { method: 'PUT', body: JSON.stringify(data) })
},

getOrgAirportConfig(orgId?: number): Promise<AirportConfigResponse> {
  const qs = orgId ? `?orgId=${orgId}` : ''
  return apiRequest(`/api/v1/admin/airport/config/org${qs}`)
},

updateOrgAirportConfig(data: AirportConfigUpdate, orgId?: number): Promise<AirportConfigResponse> {
  const body = orgId ? { ...data, orgId } : data
  return apiRequest('/api/v1/admin/airport/config/org', { method: 'PUT', body: JSON.stringify(body) })
},

getPropertyAirportConfig(propertyId: number): Promise<AirportConfigResponse> {
  return apiRequest(`/api/v1/admin/airport/config/property/${propertyId}`)
},

updatePropertyAirportConfig(propertyId: number, data: AirportConfigUpdate): Promise<AirportConfigResponse> {
  return apiRequest(`/api/v1/admin/airport/config/property/${propertyId}`, { method: 'PUT', body: JSON.stringify(data) })
},
```

- [ ] **Step 5: Verify web compiles**

```bash
cd apps/web && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no type errors related to airport.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat: add airport config API client methods"
```

---

### Task 7: Admin UI — airport config page

**Files:**
- Create: `apps/web/src/app/admin/design/airports/page.tsx`
- Modify: `apps/web/src/app/admin/_layout-client.tsx`

- [ ] **Step 1: Create the airport config page**

Create `apps/web/src/app/admin/design/airports/page.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import type { AirportConfigResponse, AirportConfigUpdate } from '@ibe/shared'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
        checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function DatasetRefreshSection() {
  const qc = useQueryClient()
  const refreshMutation = useMutation({
    mutationFn: () => apiClient.refreshAirportDataset(),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['airport-config-system'] }) },
  })

  return (
    <div className="mt-4 border-t border-[var(--color-border)] pt-4">
      <p className="mb-1 text-sm font-medium text-[var(--color-text)]">Airport Dataset</p>
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Sourced from OpenFlights. The bundled dataset is used until refreshed.
      </p>
      <button type="button" disabled={refreshMutation.isPending} onClick={() => refreshMutation.mutate()}
        className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40">
        {refreshMutation.isPending ? 'Refreshing…' : 'Refresh Dataset'}
      </button>
      {refreshMutation.isSuccess && (
        <p className="mt-2 text-xs text-[var(--color-success)]">
          Dataset refreshed — {refreshMutation.data.count} airports loaded.
        </p>
      )}
      {refreshMutation.isError && <p className="mt-2 text-xs text-[var(--color-error)]">Refresh failed.</p>}
    </div>
  )
}

function AirportConfigForm({ data, onSave, saving, isSystem }: {
  data: AirportConfigResponse
  onSave: (u: AirportConfigUpdate) => void
  saving: boolean
  isSystem?: boolean
}) {
  const [enabled, setEnabled] = useState(data.enabled)
  const [radiusKm, setRadiusKm] = useState(data.radiusKm)
  const [maxCount, setMaxCount] = useState(data.maxCount)

  useEffect(() => {
    setEnabled(data.enabled)
    setRadiusKm(data.radiusKm)
    setMaxCount(data.maxCount)
  }, [data])

  return (
    <div className="space-y-5">
      {!isSystem && !data.hasOwnConfig && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <p className="text-sm text-[var(--color-text-muted)]">Using inherited settings from parent level.</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Toggle checked={enabled} onChange={setEnabled} />
        <span className="text-sm text-[var(--color-text)]">
          {enabled ? 'Nearest airports displayed' : 'Nearest airports hidden'}
        </span>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Search radius <span className="font-normal normal-case opacity-60">km around the hotel</span>
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={300} value={radiusKm}
            onChange={e => setRadiusKm(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]" />
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
            {radiusKm} km
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Show airports within this distance. Default: 100 km.</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Max airports shown
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={5} value={maxCount}
            onChange={e => setMaxCount(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]" />
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
            {maxCount}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Maximum airports to display per property. Default: 3.</p>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="button" disabled={saving}
          onClick={() => onSave({ enabled, radiusKm, maxCount })}
          className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {isSystem && <DatasetRefreshSection />}
    </div>
  )
}

function SystemSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['airport-config-system'],
    queryFn: () => apiClient.getSystemAirportConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (u: AirportConfigUpdate) => apiClient.updateSystemAirportConfig(u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['airport-config-system'] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <p className="mb-5 text-sm text-[var(--color-text-muted)]">
        System-level defaults. All organisations and properties inherit these unless overridden.
      </p>
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
      {data && <AirportConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending} isSystem />}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

function OrgSection({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['airport-config-org', orgId],
    queryFn: () => apiClient.getOrgAirportConfig(orgId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: AirportConfigUpdate) => apiClient.updateOrgAirportConfig(u, orgId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['airport-config-org', orgId] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
      {data && <AirportConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending} />}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

function PropertySection({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['airport-config-property', propertyId],
    queryFn: () => apiClient.getPropertyAirportConfig(propertyId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: AirportConfigUpdate) => apiClient.updatePropertyAirportConfig(propertyId, u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['airport-config-property', propertyId] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
      {data && <AirportConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending} />}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

export default function AirportConfigPage() {
  const { admin } = useAdminAuth()
  const { orgId: contextOrgId, propertyId: contextPropertyId } = useAdminProperty()
  const isSuper = admin?.role === 'super'
  const isSystemLevel = isSuper && contextOrgId === null
  const orgId = isSuper ? (contextOrgId ?? undefined) : (admin?.organizationId ?? undefined)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Nearest Airports</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Show the nearest airports and their distances on hotel pages. Uses the OpenFlights dataset.
          Settings inherit from system → organisation → property.
        </p>
      </div>

      {isSystemLevel && <SystemSection />}

      {!isSystemLevel && contextPropertyId !== null && (
        <PropertySection propertyId={contextPropertyId} />
      )}

      {!isSystemLevel && contextPropertyId === null && orgId !== undefined && (
        <OrgSection orgId={orgId} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add Airports to the Display & Design nav**

In `apps/web/src/app/admin/_layout-client.tsx`, find the `Display & Design` section items array and add:

```typescript
{ href: '/admin/design/airports', label: 'Nearest Airports', sellerOnly: true },
```

Add it after the `language` entry:
```typescript
{ href: '/admin/design/language', label: 'Languages' },
{ href: '/admin/design/airports', label: 'Nearest Airports', sellerOnly: true },
```

- [ ] **Step 3: Verify web builds**

```bash
cd apps/web && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/design/airports/page.tsx apps/web/src/app/admin/_layout-client.tsx
git commit -m "feat: Nearest Airports admin page in Design tab with system/org/property tiers"
```

---

### Task 8: Clean up WL admin card

**Files:**
- Modify: `apps/web/src/app/admin/config/events/amadeus-wl-card.tsx`

- [ ] **Step 1: Remove airport-related state and UI from WLConfigForm**

In `amadeus-wl-card.tsx`:

1. Remove `AirportDatasetSection` component entirely (the entire function, lines ~23–57).

2. In `WLConfigForm`:
   - Remove `radiusKm` and `maxCount` state declarations and their `useEffect` updates
   - Remove `radiusKm` and `maxCount` from `buildUpdate()`
   - Remove the two slider `<div>` blocks (radius and max count) from the JSX
   - Remove `{isSystem && <AirportDatasetSection data={data} />}` from the JSX

3. Update `WLConfigForm` props — remove `isSystem` prop since it's no longer used (the radius/count sliders were the only system-only content).

4. In `SystemWLSection`, remove `isSystem` prop from `<WLConfigForm>`.

5. Update the `WLConfigResponse` and `WLConfigUpdate` imports — remove `airportRadiusKm`, `airportMaxCount` references (already removed from the shared type in Task 2).

The `WLConfigForm` function after cleanup:

```typescript
function WLConfigForm({
  data,
  onSave,
  saving,
  isSuper,
}: {
  data: WLConfigResponse
  onSave: (u: WLConfigUpdate) => void
  saving: boolean
  isSuper?: boolean
}) {
  const [channelUuid, setChannelUuid] = useState('')
  const [enabled, setEnabled] = useState(data.enabled)
  const [enforceChildCreds, setEnforceChildCreds] = useState(data.enforceChildCreds)

  useEffect(() => {
    setEnabled(data.enabled)
    setEnforceChildCreds(data.enforceChildCreds)
  }, [data])

  // ... rest of form (channelUuid input, enabled toggle, enforceChildCreds toggle)
  // ... save button
  // No airport sliders, no AirportDatasetSection
}
```

- [ ] **Step 2: Verify web builds**

```bash
cd apps/web && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Run all API tests**

```bash
cd apps/api && npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/config/events/amadeus-wl-card.tsx
git commit -m "refactor: remove airport sliders and dataset refresh from WL admin card"
```

---

### Task 9: Smoke test end-to-end

- [ ] **Step 1: Start the dev server**

```bash
cd /home/nir/ibe && npm run dev
```

- [ ] **Step 2: Verify guest component still works**

Open a search page or property detail modal in the browser. The `NearestAirports` component should:
- Return airports when `SystemAirportConfig.enabled = true` and property has coordinates
- Return nothing when `enabled = false`

Test by toggling enabled via `PUT /api/v1/admin/airport/config/system`.

- [ ] **Step 3: Verify admin Design → Nearest Airports page loads**

Navigate to `/admin/design/airports` in the browser. Confirm:
- System-level view shows for super admin with no org selected
- Org-level view shows when org is selected
- Property-level view shows when a property is selected
- Sliders and enable toggle save correctly

- [ ] **Step 4: Verify WL admin card no longer shows airport sliders**

Navigate to `/admin/config/events` → Amadeus WL tab. Confirm:
- No radius slider
- No max count slider
- No "Refresh Dataset" button
- Channel UUID, enabled toggle, enforce child creds still present

- [ ] **Step 5: Verify WL resolved config still returns iataCode**

Check that the WL CTA button still works for a property with coordinates — it should still embed an IATA code in the WL URL, sourced from the airport service.
