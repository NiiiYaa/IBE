# Airport Strip Chain/Hotel Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow chain (org) and hotel (property) admins to override `stripDefaultFolded` and `stripAutoFoldSecs` for the nearest-airports strip, with full system → chain → hotel inheritance.

**Architecture:** Add two nullable columns to `OrgAirportConfig` and `PropertyAirportConfig`. Update `childToResponse` and `getResolvedAirportConfig` to resolve them through the chain. Remove the `!isSystem` guard in the admin UI form.

**Tech Stack:** Prisma, TypeScript (Fastify API + Next.js 14), Vitest

---

## Files

| Action | Path |
|--------|------|
| Create | `apps/api/prisma/migrations/20260517000000_airport_strip_org_property_override/migration.sql` |
| Modify | `apps/api/prisma/schema.prisma` |
| Modify | `packages/shared/src/types/airport-config.ts` |
| Modify | `apps/api/src/services/airport-config.service.ts` |
| Modify | `apps/api/src/services/__tests__/airport-config.service.test.ts` |
| Modify | `apps/web/src/app/admin/design/airports/page.tsx` |

---

## Task 1: DB Schema + Migration

**Files:**
- Create: `apps/api/prisma/migrations/20260517000000_airport_strip_org_property_override/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Create migration file**

```bash
mkdir -p apps/api/prisma/migrations/20260517000000_airport_strip_org_property_override
```

Write `apps/api/prisma/migrations/20260517000000_airport_strip_org_property_override/migration.sql`:

```sql
ALTER TABLE "OrgAirportConfig" ADD COLUMN "stripDefaultFolded" BOOLEAN;
ALTER TABLE "OrgAirportConfig" ADD COLUMN "stripAutoFoldSecs" INTEGER;
ALTER TABLE "PropertyAirportConfig" ADD COLUMN "stripDefaultFolded" BOOLEAN;
ALTER TABLE "PropertyAirportConfig" ADD COLUMN "stripAutoFoldSecs" INTEGER;
```

- [ ] **Step 2: Update Prisma schema**

In `apps/api/prisma/schema.prisma`, update `OrgAirportConfig` (around line 1705):

```prisma
model OrgAirportConfig {
  id                 Int          @id @default(autoincrement())
  organizationId     Int          @unique
  organization       Organization @relation(fields: [organizationId], references: [id])
  enabled            Boolean?     // null = inherit from system
  radiusKm           Int?         // null = inherit from system
  maxCount           Int?         // null = inherit from system
  stripDefaultFolded Boolean?     // null = inherit from system
  stripAutoFoldSecs  Int?         // null = inherit from system
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
}
```

Update `PropertyAirportConfig` (around line 1716):

```prisma
model PropertyAirportConfig {
  id                 Int      @id @default(autoincrement())
  propertyId         Int      @unique
  property           Property @relation(fields: [propertyId], references: [propertyId])
  enabled            Boolean? // null = inherit from org → system
  radiusKm           Int?     // null = inherit from org → system
  maxCount           Int?     // null = inherit from org → system
  stripDefaultFolded Boolean? // null = inherit from org → system
  stripAutoFoldSecs  Int?     // null = inherit from org → system
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

- [ ] **Step 3: Apply migration and regenerate client**

```bash
cd apps/api && pnpm db:migrate:deploy && pnpm db:generate
```

Expected: migration applied, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/migrations/20260517000000_airport_strip_org_property_override/migration.sql apps/api/prisma/schema.prisma
git commit -m "feat: add strip settings columns to OrgAirportConfig and PropertyAirportConfig"
```

---

## Task 2: Shared Types

**Files:**
- Modify: `packages/shared/src/types/airport-config.ts`

- [ ] **Step 1: Remove "system tier only" comments**

Replace the contents of `packages/shared/src/types/airport-config.ts` with:

```ts
export interface NearestAirport {
  code: string        // "LHR"
  name: string        // "London Heathrow Airport"
  distanceKm: number  // 12
  lat: number
  lng: number
}

export interface NearestAirportsResponse {
  airports: NearestAirport[]
  radiusKm: number
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}

export interface AirportConfigResponse {
  enabled: boolean
  radiusKm: number
  maxCount: number
  hasOwnConfig: boolean
  datasetUpdatedAt: string | null  // non-null at system tier only
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}

export interface AirportConfigUpdate {
  enabled?: boolean | null         // null = revert to inherit
  radiusKm?: number | null         // null = revert to inherit
  maxCount?: number | null         // null = revert to inherit
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
}

export interface ResolvedAirportConfig {
  enabled: boolean
  radiusKm: number
  maxCount: number
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}
```

- [ ] **Step 2: Rebuild shared package**

```bash
cd packages/shared && pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/airport-config.ts packages/shared/dist
git commit -m "feat: extend ResolvedAirportConfig with strip settings"
```

---

## Task 3: Service — Resolve Strip Settings Through Chain

**Files:**
- Modify: `apps/api/src/services/airport-config.service.ts`

- [ ] **Step 1: Update `childToResponse` row type and body**

Find the `childToResponse` function and replace it:

```ts
function childToResponse(
  row: {
    enabled: boolean | null
    radiusKm: number | null
    maxCount: number | null
    stripDefaultFolded: boolean | null | undefined
    stripAutoFoldSecs: number | null | undefined
  } | null,
  parent: AirportConfigResponse,
  hasOwn: boolean
): AirportConfigResponse {
  return {
    enabled: row?.enabled ?? parent.enabled,
    radiusKm: row?.radiusKm ?? parent.radiusKm,
    maxCount: row?.maxCount ?? parent.maxCount,
    stripDefaultFolded: row?.stripDefaultFolded ?? parent.stripDefaultFolded,
    stripAutoFoldSecs: row?.stripAutoFoldSecs ?? parent.stripAutoFoldSecs,
    hasOwnConfig: hasOwn,
    datasetUpdatedAt: null,
  }
}
```

- [ ] **Step 2: Update `getResolvedAirportConfig` return type and body**

Find the `getResolvedAirportConfig` function and replace its return statement:

```ts
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

  return {
    enabled: resolved.enabled,
    radiusKm: resolved.radiusKm,
    maxCount: resolved.maxCount,
    stripDefaultFolded: resolved.stripDefaultFolded,
    stripAutoFoldSecs: resolved.stripAutoFoldSecs,
  }
}
```

- [ ] **Step 3: Update `getNearestAirports` to use resolved strip settings**

Find `getNearestAirports` and replace it — removing the separate `sysRow` parallel query and using `resolved` instead:

```ts
export async function getNearestAirports(propertyId: number, radiusKmOverride?: number): Promise<NearestAirportsResponse> {
  const [resolved, property] = await Promise.all([
    getResolvedAirportConfig(propertyId),
    fetchPropertyStatic(propertyId).catch(() => null),
  ])

  const stripDefaultFolded = resolved.stripDefaultFolded
  const stripAutoFoldSecs = resolved.stripAutoFoldSecs

  const lat = property?.coordinates?.latitude
  const lng = property?.coordinates?.longitude
  if (!resolved.enabled || !lat || !lng) return { airports: [], radiusKm: radiusKmOverride ?? resolved.radiusKm, stripDefaultFolded, stripAutoFoldSecs }

  const radiusKm = radiusKmOverride ?? resolved.radiusKm
  const maxCount = radiusKmOverride !== undefined ? 20 : resolved.maxCount

  const dataset = await getSystemDataset()
  const airports = findNearestAirports(lat, lng, radiusKm, maxCount, dataset)
  return { airports, radiusKm, stripDefaultFolded, stripAutoFoldSecs }
}
```

- [ ] **Step 4: Update `upsertOrgAirportConfig` to save strip fields**

Find `upsertOrgAirportConfig` and add two lines after the existing `maxCount` guard:

```ts
export async function upsertOrgAirportConfig(orgId: number, data: AirportConfigUpdate): Promise<AirportConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxCount !== undefined) update.maxCount = data.maxCount
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs

  const row = await prisma.orgAirportConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  const sys = await getSystemAirportConfig()
  return childToResponse(row, sys, true)
}
```

- [ ] **Step 5: Update `upsertPropertyAirportConfig` to save strip fields**

Find `upsertPropertyAirportConfig` and add two lines after the existing `maxCount` guard:

```ts
export async function upsertPropertyAirportConfig(propertyId: number, data: AirportConfigUpdate): Promise<AirportConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxCount !== undefined) update.maxCount = data.maxCount
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs

  const row = await prisma.propertyAirportConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...update },
    update,
  })
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId
  const sys = await getSystemAirportConfig()
  const orgRow = orgId ? await prisma.orgAirportConfig.findUnique({ where: { organizationId: orgId } }) : null
  const orgResolved = childToResponse(orgRow ?? null, sys, !!orgRow)
  return childToResponse(row, orgResolved, true)
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/airport-config.service.ts
git commit -m "feat: resolve airport strip settings through system→chain→hotel inheritance"
```

---

## Task 4: Service Tests

**Files:**
- Modify: `apps/api/src/services/__tests__/airport-config.service.test.ts`

- [ ] **Step 1: Update `SYS_ROW` constant to include strip fields**

Find the `SYS_ROW` constant and replace it:

```ts
const SYS_ROW = {
  enabled: true, radiusKm: 100, maxCount: 3,
  stripDefaultFolded: false, stripAutoFoldSecs: 0,
  airportDataset: null, airportDatasetUpdatedAt: null,
}
```

- [ ] **Step 2: Add strip-setting inheritance test block**

Add this `describe` block after the existing `getResolvedAirportConfig — property override` block:

```ts
describe('getResolvedAirportConfig — strip settings inheritance', () => {
  it('inherits system strip settings when org and property have null', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({ ...SYS_ROW, stripDefaultFolded: true, stripAutoFoldSecs: 30 })
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: null, stripDefaultFolded: null, stripAutoFoldSecs: null })
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)

    const result = await getResolvedAirportConfig(42)
    expect(result.stripDefaultFolded).toBe(true)
    expect(result.stripAutoFoldSecs).toBe(30)
  })

  it('org stripDefaultFolded overrides system', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({ ...SYS_ROW, stripDefaultFolded: false, stripAutoFoldSecs: 0 })
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: null, stripDefaultFolded: true, stripAutoFoldSecs: 10 })
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)

    const result = await getResolvedAirportConfig(42)
    expect(result.stripDefaultFolded).toBe(true)
    expect(result.stripAutoFoldSecs).toBe(10)
  })

  it('property stripAutoFoldSecs overrides org; property inherits org stripDefaultFolded', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({ ...SYS_ROW, stripDefaultFolded: false, stripAutoFoldSecs: 0 })
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: null, stripDefaultFolded: true, stripAutoFoldSecs: 10 })
    mp.propertyAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: null, stripDefaultFolded: null, stripAutoFoldSecs: 60 })

    const result = await getResolvedAirportConfig(42)
    expect(result.stripDefaultFolded).toBe(true)  // inherits from org
    expect(result.stripAutoFoldSecs).toBe(60)       // property override
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && pnpm test src/services/__tests__/airport-config.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/__tests__/airport-config.service.test.ts
git commit -m "test: airport strip setting inheritance through system→chain→hotel"
```

---

## Task 5: Admin UI — Remove isSystem Gating

**Files:**
- Modify: `apps/web/src/app/admin/design/airports/page.tsx`

- [ ] **Step 1: Remove the "Configured at system level." note and opacity wrappers**

In `AirportConfigForm`, find the Strip display behaviour section (around line 113) and replace it:

```tsx
<div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Strip display behaviour</p>
  <div className="flex items-center gap-3">
    <Toggle checked={stripDefaultFolded} onChange={setStripDefaultFolded} />
    <span className="text-sm text-[var(--color-text)]">Start collapsed by default</span>
  </div>
  <div>
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
      Auto-collapse after <span className="font-normal normal-case opacity-60">seconds (0 = never)</span>
    </label>
    <div className="flex items-center gap-3">
      <input type="range" min={0} max={120} step={1}
        value={stripAutoFoldSecs}
        onChange={e => setStripAutoFoldSecs(Number(e.target.value))}
        className="flex-1 accent-[var(--color-primary)]" />
      <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
        {stripAutoFoldSecs === 0 ? 'Never' : `${stripAutoFoldSecs}s`}
      </span>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Update `onSave` to always include strip settings**

Find the Save button's `onClick` and replace:

```tsx
onClick={() => onSave({ enabled, radiusKm, maxCount, stripDefaultFolded, stripAutoFoldSecs })}
```

(Remove the `...(isSystem && { ... })` conditional spread.)

- [ ] **Step 3: Remove unused `isSystem` prop if it's no longer used elsewhere in the form**

Check if `isSystem` is still referenced in `AirportConfigForm`. It's used in:
- The "Using inherited settings from parent level" inherited-config banner (line 70): `{!isSystem && !data.hasOwnConfig && ...}` — keep this.
- The `DatasetRefreshSection` render (line 146): `{isSystem && <DatasetRefreshSection />}` — keep this.

So `isSystem` prop stays; only the strip display section changes.

- [ ] **Step 4: Type check**

```bash
cd apps/web && pnpm type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/design/airports/page.tsx
git commit -m "feat: allow chain and hotel admins to override airport strip display behaviour"
```
