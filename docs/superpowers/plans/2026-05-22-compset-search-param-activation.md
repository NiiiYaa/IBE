# CompSet Search Param Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each level (system/chain/hotel) to activate/deactivate inherited search params via an override table, and soft-delete/edit their own params; CompSet runs only the effectively-active params.

**Architecture:** Add `isActive` to `CompSetSearchParam` for owner control and a new `CompSetSearchParamOverride` table for lower-level overrides. Resolution order: property override → org override → param's own `isActive`. The admin UI uses a new `getAdminSearchParams` service function (returns all tiers with resolved state); the run service continues to use `getEffectiveSearchParams` (returns only active params).

**Tech Stack:** Prisma (SQLite dev / PostgreSQL prod), Fastify, React + TanStack Query, TypeScript, Vitest

---

## File Map

| File | Action |
|------|--------|
| `apps/api/prisma/schema.prisma` | Add `isActive` to `CompSetSearchParam`; add `CompSetSearchParamOverride` model |
| `packages/shared/src/types/compset.ts` | Add `isActive`, `resolvedIsActive` to `CompSetSearchParam` interface |
| `apps/api/src/services/compset.service.ts` | Add `resolveIsActive`, `getAdminSearchParams`, `updateSearchParamActive`; update `toParam`, `getEffectiveSearchParams`, `deleteSearchParam` |
| `apps/api/src/services/__tests__/compset.service.test.ts` | Update mocks + existing tests; add new tests |
| `apps/api/src/routes/compset.route.ts` | Update GET handler to call `getAdminSearchParams`; add `PATCH /:id/active` |
| `apps/web/src/lib/api-client.ts` | Add `patchCompSetSearchParamActive` |
| `apps/web/src/app/admin/intelligence/compset/page.tsx` | Update `ParamRow` (toggle + inline edit); update `SearchConfigSection` mutations |

---

## Task 1: Prisma Schema — add `isActive` + `CompSetSearchParamOverride`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add `isActive` to `CompSetSearchParam` and add the override model**

In `apps/api/prisma/schema.prisma`, find the `CompSetSearchParam` model and add the field:

```prisma
model CompSetSearchParam {
  id          Int      @id @default(autoincrement())
  orgId       Int?
  propertyId  Int?
  offsetDays  Int
  nights      Int
  adults      Int
  children    Int      @default(0)
  childAges   String   @default("[]")
  label       String
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  organization Organization?   @relation(fields: [orgId], references: [id], onDelete: SetNull)
  property     Property?       @relation(fields: [propertyId], references: [propertyId], onDelete: SetNull, map: "CompSetSearchParam_propertyId_fkey")
  results      CompSetResult[]
  overrides    CompSetSearchParamOverride[]
}
```

Then add the new model after `CompSetSearchParam`:

```prisma
model CompSetSearchParamOverride {
  id            Int     @id @default(autoincrement())
  searchParamId Int
  orgId         Int?
  propertyId    Int?
  isActive      Boolean
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  searchParam CompSetSearchParam @relation(fields: [searchParamId], references: [id], onDelete: Cascade)
}
```

Note: No `@@unique` on `(searchParamId, orgId, propertyId)` — nullable composite unique constraints behave inconsistently across SQLite/PostgreSQL. Use `findFirst` + create/update in service code instead of upsert.

- [ ] **Step 2: Run migration**

```bash
cd /home/nir/ibe/apps/api && npx prisma migrate dev --name add_compset_param_activation
```

Expected: migration created and applied, `prisma generate` runs automatically.

- [ ] **Step 3: Verify generated client has new model**

```bash
cd /home/nir/ibe/apps/api && node -e "const {PrismaClient}=require('./src/db/client.js'); console.log('ok')" 2>&1 | head -5
```

Or just confirm no TS errors in the next task.

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe && git add apps/api/prisma/ && git commit -m "feat(compset): add isActive + CompSetSearchParamOverride migration"
```

---

## Task 2: Shared Types

**Files:**
- Modify: `packages/shared/src/types/compset.ts`

- [ ] **Step 1: Update `CompSetSearchParam` interface**

Replace the existing interface:

```ts
export interface CompSetSearchParam {
  id: number
  orgId: number | null
  propertyId: number | null
  offsetDays: number
  nights: number
  adults: number
  children: number
  childAges: number[]
  label: string
  sortOrder: number
  tier: 'system' | 'chain' | 'hotel'
  isActive: boolean
  resolvedIsActive: boolean
}
```

- [ ] **Step 2: Build shared package to catch type errors**

```bash
cd /home/nir/ibe && npx turbo build --filter=@ibe/shared
```

Expected: builds without errors.

- [ ] **Step 3: Commit**

```bash
cd /home/nir/ibe && git add packages/shared/src/types/compset.ts && git commit -m "feat(compset): add isActive + resolvedIsActive to CompSetSearchParam type"
```

---

## Task 3: Service — `resolveIsActive`, `toParam`, `getAdminSearchParams`

**Files:**
- Modify: `apps/api/src/services/compset.service.ts`

- [ ] **Step 1: Update `toParam` to accept `resolvedIsActive`**

Replace the existing `toParam` function (around line 56):

```ts
type OverrideRow = { searchParamId: number; orgId: number | null; propertyId: number | null; isActive: boolean }

function resolveIsActive(
  paramId: number,
  paramOwnIsActive: boolean,
  overrides: OverrideRow[],
  scope: { orgId: number | null; propertyId: number | null },
): boolean {
  if (scope.propertyId !== null) {
    const hit = overrides.find(o => o.searchParamId === paramId && o.propertyId === scope.propertyId)
    if (hit) return hit.isActive
  }
  if (scope.orgId !== null) {
    const hit = overrides.find(o => o.searchParamId === paramId && o.orgId === scope.orgId && o.propertyId === null)
    if (hit) return hit.isActive
  }
  return paramOwnIsActive
}

function toParam(row: {
  id: number; orgId: number | null; propertyId: number | null;
  offsetDays: number; nights: number; adults: number; children: number; childAges: string;
  label: string; sortOrder: number; isActive: boolean;
}, tier: Tier, resolvedIsActive: boolean): CompSetSearchParam {
  return {
    id: row.id, orgId: row.orgId, propertyId: row.propertyId,
    offsetDays: row.offsetDays, nights: row.nights, adults: row.adults,
    children: row.children, childAges: JSON.parse(row.childAges) as number[],
    label: row.label, sortOrder: row.sortOrder, tier,
    isActive: row.isActive,
    resolvedIsActive,
  }
}
```

- [ ] **Step 2: Add `getAdminSearchParams`**

Add after `getScopedSearchParams`:

```ts
export async function getAdminSearchParams(scope: { orgId?: number | null; propertyId?: number | null }): Promise<CompSetSearchParam[]> {
  const propertyId = scope.propertyId ?? null
  const orgId = scope.orgId ?? null

  if (propertyId !== null) {
    const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
    const propOrgId = prop?.organizationId ?? null

    const [systemRows, chainRows, hotelRows, overrides] = await Promise.all([
      prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: { sortOrder: 'asc' } }),
      propOrgId ? prisma.compSetSearchParam.findMany({ where: { orgId: propOrgId, propertyId: null }, orderBy: { sortOrder: 'asc' } }) : Promise.resolve([]),
      prisma.compSetSearchParam.findMany({ where: { propertyId, isActive: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.compSetSearchParamOverride.findMany({
        where: { OR: [{ propertyId }, ...(propOrgId ? [{ orgId: propOrgId, propertyId: null }] : [])] },
      }),
    ])

    const resolveScope = { orgId: propOrgId, propertyId }
    return [
      ...systemRows.map(r => toParam(r, 'system', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
      ...chainRows.map(r => toParam(r, 'chain', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
      ...hotelRows.map(r => toParam(r, 'hotel', r.isActive)),
    ]
  }

  if (orgId !== null) {
    const [systemRows, chainRows, overrides] = await Promise.all([
      prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: { sortOrder: 'asc' } }),
      prisma.compSetSearchParam.findMany({ where: { orgId, propertyId: null, isActive: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.compSetSearchParamOverride.findMany({ where: { orgId, propertyId: null } }),
    ])

    const resolveScope = { orgId, propertyId: null }
    return [
      ...systemRows.map(r => toParam(r, 'system', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
      ...chainRows.map(r => toParam(r, 'chain', r.isActive)),
    ]
  }

  // System level — own params only, isActive=true
  const rows = await prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null, isActive: true }, orderBy: { sortOrder: 'asc' } })
  return rows.map(r => toParam(r, 'system', r.isActive))
}
```

- [ ] **Step 3: Fix `createSearchParam` and `updateSearchParam` calls to `toParam`**

`createSearchParam` (around line 99) — pass `isActive` and `resolvedIsActive`:

```ts
export async function createSearchParam(scope: { orgId?: number | null; propertyId?: number | null }, data: CompSetSearchParamCreate): Promise<CompSetSearchParam> {
  const label = buildSearchParamLabel(data.offsetDays, data.nights, data.adults, data.children, data.childAges)
  const row = await prisma.compSetSearchParam.create({
    data: {
      orgId: scope.orgId ?? null,
      propertyId: scope.propertyId ?? null,
      offsetDays: data.offsetDays,
      nights: data.nights,
      adults: data.adults,
      children: data.children,
      childAges: JSON.stringify(data.childAges),
      label,
      sortOrder: data.sortOrder ?? 0,
    },
  })
  const tier: Tier = scope.propertyId ? 'hotel' : scope.orgId ? 'chain' : 'system'
  return toParam(row, tier, row.isActive)
}
```

`updateSearchParam` (around line 118) — same fix at the return:

```ts
export async function updateSearchParam(id: number, data: Partial<CompSetSearchParamCreate>): Promise<CompSetSearchParam | null> {
  const existing = await prisma.compSetSearchParam.findUnique({ where: { id } })
  if (!existing) return null
  const children = data.children ?? existing.children
  const childAges = data.childAges ?? (JSON.parse(existing.childAges) as number[])
  const updated = await prisma.compSetSearchParam.update({
    where: { id },
    data: {
      ...(data.offsetDays !== undefined && { offsetDays: data.offsetDays }),
      ...(data.nights !== undefined && { nights: data.nights }),
      ...(data.adults !== undefined && { adults: data.adults }),
      children,
      childAges: JSON.stringify(childAges),
      label: buildSearchParamLabel(
        data.offsetDays ?? existing.offsetDays,
        data.nights ?? existing.nights,
        data.adults ?? existing.adults,
        children,
        childAges,
      ),
    },
  })
  const tier: Tier = updated.propertyId ? 'hotel' : updated.orgId ? 'chain' : 'system'
  return toParam(updated, tier, updated.isActive)
}
```

- [ ] **Step 4: Check for TS errors**

```bash
cd /home/nir/ibe/apps/api && npx tsc --noEmit 2>&1 | grep compset.service | head -20
```

Expected: no errors in compset.service.ts.

- [ ] **Step 5: Commit**

```bash
cd /home/nir/ibe && git add apps/api/src/services/compset.service.ts && git commit -m "feat(compset): add resolveIsActive helper + getAdminSearchParams"
```

---

## Task 4: Service — `updateSearchParamActive` + soft-delete `deleteSearchParam`

**Files:**
- Modify: `apps/api/src/services/compset.service.ts`

- [ ] **Step 1: Replace `deleteSearchParam` with soft-delete**

Find and replace the existing `deleteSearchParam` function:

```ts
export async function deleteSearchParam(id: number): Promise<boolean> {
  const existing = await prisma.compSetSearchParam.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.compSetSearchParam.update({ where: { id }, data: { isActive: false } })
  return true
}
```

- [ ] **Step 2: Add `updateSearchParamActive`**

Add after `deleteSearchParam`:

```ts
export async function updateSearchParamActive(
  id: number,
  scope: { orgId: number | null; propertyId: number | null },
  isActive: boolean,
): Promise<CompSetSearchParam | null> {
  const param = await prisma.compSetSearchParam.findUnique({ where: { id } })
  if (!param) return null

  const paramTier: Tier = param.propertyId ? 'hotel' : param.orgId ? 'chain' : 'system'
  const scopeTier: Tier = scope.propertyId ? 'hotel' : scope.orgId ? 'chain' : 'system'

  if (paramTier === scopeTier) {
    // Own param — update isActive directly
    const updated = await prisma.compSetSearchParam.update({ where: { id }, data: { isActive } })
    return toParam(updated, paramTier, updated.isActive)
  }

  // Inherited param — upsert override for this scope
  const existingOverride = await prisma.compSetSearchParamOverride.findFirst({
    where: { searchParamId: id, orgId: scope.orgId, propertyId: scope.propertyId },
  })
  if (existingOverride) {
    await prisma.compSetSearchParamOverride.update({ where: { id: existingOverride.id }, data: { isActive } })
  } else {
    await prisma.compSetSearchParamOverride.create({
      data: { searchParamId: id, orgId: scope.orgId, propertyId: scope.propertyId, isActive },
    })
  }

  return toParam(param, paramTier, isActive)
}
```

- [ ] **Step 3: Check TS**

```bash
cd /home/nir/ibe/apps/api && npx tsc --noEmit 2>&1 | grep compset.service | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe && git add apps/api/src/services/compset.service.ts && git commit -m "feat(compset): updateSearchParamActive + soft-delete deleteSearchParam"
```

---

## Task 5: Service — update `getEffectiveSearchParams`

**Files:**
- Modify: `apps/api/src/services/compset.service.ts`

- [ ] **Step 1: Update `getEffectiveSearchParams` to filter by resolved isActive**

Replace the existing `getEffectiveSearchParams` function:

```ts
export async function getEffectiveSearchParams(propertyId: number): Promise<CompSetSearchParam[]> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId ?? null

  const [systemRows, chainRows, hotelRows, overrides] = await Promise.all([
    prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: { sortOrder: 'asc' } }),
    orgId ? prisma.compSetSearchParam.findMany({ where: { orgId, propertyId: null }, orderBy: { sortOrder: 'asc' } }) : Promise.resolve([]),
    prisma.compSetSearchParam.findMany({ where: { propertyId }, orderBy: { sortOrder: 'asc' } }),
    prisma.compSetSearchParamOverride.findMany({
      where: { OR: [{ propertyId }, ...(orgId ? [{ orgId, propertyId: null }] : [])] },
    }),
  ])

  const resolveScope = { orgId, propertyId }
  const all = [
    ...systemRows.map(r => toParam(r, 'system', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
    ...chainRows.map(r => toParam(r, 'chain', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
    ...hotelRows.map(r => toParam(r, 'hotel', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
  ]

  return all.filter(p => p.resolvedIsActive)
}
```

- [ ] **Step 2: Also remove the now-unused `getScopedSearchParams` function** (it's replaced by `getAdminSearchParams`). Verify it's not imported anywhere else first:

```bash
grep -r "getScopedSearchParams" /home/nir/ibe/apps --include="*.ts" --include="*.tsx" | grep -v "__tests__"
```

If it only appears in `compset.service.ts` and `compset.route.ts`, remove it from the service and update the route import in the next task.

- [ ] **Step 3: Check TS**

```bash
cd /home/nir/ibe/apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe && git add apps/api/src/services/compset.service.ts && git commit -m "feat(compset): getEffectiveSearchParams filters by resolved isActive"
```

---

## Task 6: Service Tests

**Files:**
- Modify: `apps/api/src/services/__tests__/compset.service.test.ts`

- [ ] **Step 1: Update the Prisma mock to include the new model and `isActive` field**

Replace the mock block at the top of the file:

```ts
vi.mock('../../db/client.js', () => ({
  prisma: {
    systemCompSetConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    compSetSearchParam: {
      findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    compSetSearchParamOverride: {
      findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(),
    },
    compSetCompetitor: {
      findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(), groupBy: vi.fn(),
    },
    property: { findUnique: vi.fn() },
  },
}))
```

Update the import to include new functions:

```ts
import {
  buildSearchParamLabel,
  getSystemCompSetConfig,
  upsertSystemCompSetConfig,
  getAdminSearchParams,
  getEffectiveSearchParams,
  createSearchParam,
  updateSearchParam,
  deleteSearchParam,
  updateSearchParamActive,
  listCompetitors,
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
  getActivePropertyIds,
} from '../compset.service.js'
```

- [ ] **Step 2: Add a base param factory to reduce repetition**

Add near the top of the test file, after imports:

```ts
const mp = prisma as any

function makeParam(overrides: Partial<{ id: number; orgId: number | null; propertyId: number | null; offsetDays: number; nights: number; adults: number; isActive: boolean }> = {}) {
  return {
    id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, children: 0, childAges: '[]',
    label: 'Today+7 · 5 Nights · 2 Adults', sortOrder: 0, isActive: true,
    ...overrides,
  }
}
```

- [ ] **Step 3: Update `getScopedSearchParams` tests → `getAdminSearchParams`**

Replace the `describe('getScopedSearchParams', ...)` block:

```ts
describe('getAdminSearchParams', () => {
  beforeEach(() => { mp.compSetSearchParamOverride.findMany.mockResolvedValue([]) })

  it('returns system params (isActive=true only) when no scope given', async () => {
    mp.compSetSearchParam.findMany.mockResolvedValue([makeParam()])
    const result = await getAdminSearchParams({})
    expect(result).toHaveLength(1)
    expect(result[0]!.tier).toBe('system')
    expect(result[0]!.resolvedIsActive).toBe(true)
    expect(mp.compSetSearchParam.findMany).toHaveBeenCalledWith({
      where: { orgId: null, propertyId: null, isActive: true }, orderBy: { sortOrder: 'asc' },
    })
  })

  it('returns system (all) + chain (own, isActive=true) for chain scope', async () => {
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([makeParam({ id: 2, orgId: 5, isActive: true })])
    const result = await getAdminSearchParams({ orgId: 5 })
    expect(result).toHaveLength(2)
    expect(result[0]!.tier).toBe('system')
    expect(result[1]!.tier).toBe('chain')
  })

  it('applies org-level override to inherited system param for chain scope', async () => {
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([])
    mp.compSetSearchParamOverride.findMany.mockResolvedValue([
      { searchParamId: 1, orgId: 5, propertyId: null, isActive: false },
    ])
    const result = await getAdminSearchParams({ orgId: 5 })
    expect(result[0]!.resolvedIsActive).toBe(false)
  })

  it('returns system + chain (inherited, all) + hotel (own) for hotel scope', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([makeParam({ id: 2, orgId: 5 })])
      .mockResolvedValueOnce([makeParam({ id: 3, propertyId: 100 })])
    const result = await getAdminSearchParams({ propertyId: 100 })
    expect(result.map(r => r.tier)).toEqual(['system', 'chain', 'hotel'])
  })

  it('property-level override takes precedence over org-level override', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mp.compSetSearchParamOverride.findMany.mockResolvedValue([
      { searchParamId: 1, orgId: 5, propertyId: null, isActive: false },
      { searchParamId: 1, orgId: null, propertyId: 100, isActive: true },
    ])
    const result = await getAdminSearchParams({ propertyId: 100 })
    expect(result[0]!.resolvedIsActive).toBe(true)
  })
})
```

- [ ] **Step 4: Update `getEffectiveSearchParams` tests**

Replace the `describe('getEffectiveSearchParams', ...)` block:

```ts
describe('getEffectiveSearchParams', () => {
  beforeEach(() => { mp.compSetSearchParamOverride.findMany.mockResolvedValue([]) })

  it('returns only active params (merges system + chain + hotel)', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([makeParam({ id: 2, orgId: 5 })])
      .mockResolvedValueOnce([makeParam({ id: 3, propertyId: 100 })])
    const result = await getEffectiveSearchParams(100)
    expect(result.map(r => r.tier)).toEqual(['system', 'chain', 'hotel'])
    expect(result).toHaveLength(3)
  })

  it('excludes params where resolved isActive is false (override)', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mp.compSetSearchParamOverride.findMany.mockResolvedValue([
      { searchParamId: 1, orgId: null, propertyId: 100, isActive: false },
    ])
    const result = await getEffectiveSearchParams(100)
    expect(result).toHaveLength(0)
  })

  it('hotel re-activates a param deactivated at system level via property override', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1, isActive: false })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mp.compSetSearchParamOverride.findMany.mockResolvedValue([
      { searchParamId: 1, orgId: null, propertyId: 100, isActive: true },
    ])
    const result = await getEffectiveSearchParams(100)
    expect(result).toHaveLength(1)
    expect(result[0]!.resolvedIsActive).toBe(true)
  })

  it('handles property with no organization', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: null })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([makeParam({ id: 3, propertyId: 100 })])
    const result = await getEffectiveSearchParams(100)
    expect(result.map(r => r.tier)).toEqual(['system', 'hotel'])
  })
})
```

- [ ] **Step 5: Update `deleteSearchParam` test**

Replace the `describe('deleteSearchParam', ...)` block:

```ts
describe('deleteSearchParam', () => {
  it('returns false when id not found', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(null)
    const result = await deleteSearchParam(999)
    expect(result).toBe(false)
    expect(mp.compSetSearchParam.update).not.toHaveBeenCalled()
  })
  it('soft-deletes by setting isActive=false', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(makeParam({ id: 1 }))
    mp.compSetSearchParam.update.mockResolvedValue(makeParam({ id: 1, isActive: false }))
    const result = await deleteSearchParam(1)
    expect(result).toBe(true)
    expect(mp.compSetSearchParam.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { isActive: false },
    })
    expect(mp.compSetSearchParam.delete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Add `updateSearchParamActive` tests**

Add a new describe block:

```ts
describe('updateSearchParamActive', () => {
  it('returns null when param not found', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(null)
    const result = await updateSearchParamActive(999, { orgId: null, propertyId: null }, false)
    expect(result).toBeNull()
  })

  it('updates param isActive directly when scope matches param tier (own param)', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(makeParam({ id: 1, orgId: null, propertyId: null }))
    mp.compSetSearchParam.update.mockResolvedValue(makeParam({ id: 1, isActive: false }))
    const result = await updateSearchParamActive(1, { orgId: null, propertyId: null }, false)
    expect(mp.compSetSearchParam.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { isActive: false } })
    expect(result?.resolvedIsActive).toBe(false)
    expect(mp.compSetSearchParamOverride.create).not.toHaveBeenCalled()
  })

  it('creates an override when toggling an inherited param', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(makeParam({ id: 1, orgId: null, propertyId: null }))
    mp.compSetSearchParamOverride.findFirst.mockResolvedValue(null)
    mp.compSetSearchParamOverride.create.mockResolvedValue({ id: 10, searchParamId: 1, orgId: null, propertyId: 100, isActive: false })
    const result = await updateSearchParamActive(1, { orgId: null, propertyId: 100 }, false)
    expect(mp.compSetSearchParamOverride.create).toHaveBeenCalledWith({
      data: { searchParamId: 1, orgId: null, propertyId: 100, isActive: false },
    })
    expect(mp.compSetSearchParam.update).not.toHaveBeenCalled()
    expect(result?.resolvedIsActive).toBe(false)
  })

  it('updates existing override instead of creating a new one', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(makeParam({ id: 1, orgId: null, propertyId: null }))
    mp.compSetSearchParamOverride.findFirst.mockResolvedValue({ id: 10, searchParamId: 1, orgId: null, propertyId: 100, isActive: false })
    mp.compSetSearchParamOverride.update.mockResolvedValue({ id: 10, isActive: true })
    const result = await updateSearchParamActive(1, { orgId: null, propertyId: 100 }, true)
    expect(mp.compSetSearchParamOverride.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { isActive: true } })
    expect(mp.compSetSearchParamOverride.create).not.toHaveBeenCalled()
    expect(result?.resolvedIsActive).toBe(true)
  })
})
```

- [ ] **Step 7: Run tests**

```bash
cd /home/nir/ibe/apps/api && npx vitest run src/services/__tests__/compset.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
cd /home/nir/ibe && git add apps/api/src/services/__tests__/compset.service.test.ts && git commit -m "test(compset): update + add tests for activation, override, soft-delete"
```

---

## Task 7: Route Updates

**Files:**
- Modify: `apps/api/src/routes/compset.route.ts`

- [ ] **Step 1: Update imports in the route**

Replace the import line:

```ts
import {
  getSystemCompSetConfig,
  upsertSystemCompSetConfig,
  getAdminSearchParams,
  createSearchParam,
  updateSearchParam,
  deleteSearchParam,
  updateSearchParamActive,
  listCompetitors,
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
  getRoomMappings,
  replaceRoomMappings,
  autoMapRooms,
} from '../services/compset.service.js'
```

- [ ] **Step 2: Replace the GET search-params handler**

Find and replace the entire `fastify.get('/admin/intelligence/compset/search-params', ...)` handler:

```ts
fastify.get('/admin/intelligence/compset/search-params', async (request, reply) => {
  const query = request.query as Record<string, string>
  const propertyId = query.propertyId ? parseInt(query.propertyId, 10) : undefined
  const rawOrgId = query.orgId ? parseInt(query.orgId, 10) : undefined

  if (propertyId) {
    return reply.send(await getAdminSearchParams({ propertyId }))
  }

  const orgId = request.admin.role === 'super'
    ? (rawOrgId ?? request.admin.organizationId)
    : request.admin.organizationId

  if (request.admin.role === 'super' && !orgId) {
    return reply.send(await getAdminSearchParams({}))
  }

  return reply.send(await getAdminSearchParams({ orgId: orgId ?? null }))
})
```

- [ ] **Step 3: Add PATCH active route**

Add after the `DELETE /search-params/:id` handler and before the competitors section:

```ts
// PATCH activate/deactivate a search param (own: update isActive; inherited: upsert override)
fastify.patch('/admin/intelligence/compset/search-params/:id/active', async (request, reply) => {
  const id = parseInt((request.params as { id: string }).id, 10)
  const body = request.body as { isActive: boolean; orgId?: number | null; propertyId?: number | null }

  const orgId = (request.admin.role === 'super'
    ? (body.orgId ?? request.admin.organizationId)
    : request.admin.organizationId) ?? null
  const propertyId = body.propertyId ?? null

  const result = await updateSearchParamActive(id, { orgId, propertyId }, body.isActive)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
})
```

- [ ] **Step 4: Check TS**

```bash
cd /home/nir/ibe/apps/api && npx tsc --noEmit 2>&1 | grep compset.route | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/nir/ibe && git add apps/api/src/routes/compset.route.ts && git commit -m "feat(compset): update GET params route + add PATCH active route"
```

---

## Task 8: API Client

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add `patchCompSetSearchParamActive`**

Find the `runCompSet` method and add before it:

```ts
patchCompSetSearchParamActive(
  id: number,
  data: { isActive: boolean; orgId?: number | null; propertyId?: number | null },
): Promise<CompSetSearchParam> {
  return apiRequest(`/api/v1/admin/intelligence/compset/search-params/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
},
```

- [ ] **Step 2: Check TS**

```bash
cd /home/nir/ibe/apps/web && npx tsc --noEmit 2>&1 | grep api-client | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/nir/ibe && git add apps/web/src/lib/api-client.ts && git commit -m "feat(compset): add patchCompSetSearchParamActive API client method"
```

---

## Task 9: UI — `ParamRow` with toggle + inline edit, `SearchConfigSection` mutations

**Files:**
- Modify: `apps/web/src/app/admin/intelligence/compset/page.tsx`

- [ ] **Step 1: Add `EditParamForm` component**

Add after `AddParamForm` and before `SearchConfigSection`:

```tsx
interface EditParamFormProps {
  param: CompSetSearchParam
  onSave: (data: CompSetSearchParamCreate) => void
  isPending: boolean
  onCancel: () => void
}

function EditParamForm({ param, onSave, isPending, onCancel }: EditParamFormProps) {
  const [offsetDays, setOffsetDays] = useState(param.offsetDays)
  const [nights, setNights] = useState(param.nights)
  const [adults, setAdults] = useState(param.adults)
  const [children, setChildren] = useState(param.children)
  const [childAges, setChildAges] = useState<number[]>(param.childAges)

  function handleChildrenChange(count: number) {
    setChildren(count)
    setChildAges(prev => {
      if (count > prev.length) return [...prev, ...Array(count - prev.length).fill(8)]
      return prev.slice(0, count)
    })
  }

  function handleChildAge(index: number, age: number) {
    setChildAges(prev => prev.map((a, i) => (i === index ? age : a)))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({ offsetDays, nights, adults, children, childAges })
  }

  const fieldClass = inputClass('max-w-[100px]')

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-background,#f9fafb)] p-4 space-y-3">
      <p className="text-sm font-medium text-[var(--color-text)]">Edit search parameter</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Offset days</label>
          <input type="number" min={1} max={365} value={offsetDays}
            onChange={(e) => setOffsetDays(Number(e.target.value))}
            className={fieldClass} required />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Nights</label>
          <input type="number" min={1} max={30} value={nights}
            onChange={(e) => setNights(Number(e.target.value))}
            className={fieldClass} required />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Adults</label>
          <input type="number" min={1} max={10} value={adults}
            onChange={(e) => setAdults(Number(e.target.value))}
            className={fieldClass} required />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Children</label>
          <input type="number" min={0} max={10} value={children}
            onChange={(e) => handleChildrenChange(Number(e.target.value))}
            className={fieldClass} />
        </div>
        {childAges.map((age, i) => (
          <div key={i} className="space-y-1">
            <label className="block text-xs text-[var(--color-text-muted)]">Child {i + 1} age</label>
            <input type="number" min={0} max={17} value={age}
              onChange={(e) => handleChildAge(i, Number(e.target.value))}
              className={fieldClass} />
          </div>
        ))}
        <div className="flex gap-2">
          <button type="submit" disabled={isPending}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity">
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Update `ParamRowProps` and `ParamRow`**

Replace the existing `ParamRowProps` interface and `ParamRow` component:

```tsx
interface ParamRowProps {
  param: CompSetSearchParam
  isOwn: boolean
  // Active toggle
  isTogglingActive?: boolean
  onToggleActive?: (isActive: boolean) => void
  // Edit (own only)
  isEditing?: boolean
  onEditRequest?: () => void
  onEditCancel?: () => void
  onEditSave?: (data: CompSetSearchParamCreate) => void
  isEditSaving?: boolean
  // Delete (own only)
  deleteConfirm?: boolean
  onDeleteRequest?: () => void
  onDeleteConfirm?: () => void
  onDeleteCancel?: () => void
  isDeleting?: boolean
}

function ParamRow({
  param,
  isOwn,
  isTogglingActive,
  onToggleActive,
  isEditing,
  onEditRequest,
  onEditCancel,
  onEditSave,
  isEditSaving,
  deleteConfirm,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  isDeleting,
}: ParamRowProps) {
  if (isEditing && isOwn) {
    return (
      <EditParamForm
        param={param}
        onSave={(data) => onEditSave?.(data)}
        isPending={isEditSaving ?? false}
        onCancel={() => onEditCancel?.()}
      />
    )
  }

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-lg border px-4 py-3',
        isOwn
          ? 'border-[var(--color-border)] bg-[var(--color-surface)]'
          : 'border-[var(--color-border)] bg-[var(--color-background,#f9fafb)]',
      ].join(' ')}
    >
      <TierBadge tier={param.tier} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-text)] font-medium">{param.label}</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          +{param.offsetDays}d · {param.nights}n · {param.adults}A{param.children > 0 ? ` · ${param.children}C (${param.childAges.join(', ')})` : ''}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Own param actions */}
        {isOwn && !deleteConfirm && (
          <>
            <button
              type="button"
              onClick={onEditRequest}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDeleteRequest}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error,#dc2626)] transition-colors"
            >
              Delete
            </button>
          </>
        )}
        {isOwn && deleteConfirm && (
          <>
            <span className="text-xs text-[var(--color-text-muted)]">Delete?</span>
            <button
              type="button"
              disabled={isDeleting}
              onClick={onDeleteConfirm}
              className="rounded bg-[var(--color-error,#dc2626)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {isDeleting ? '…' : 'Yes'}
            </button>
            <button
              type="button"
              onClick={onDeleteCancel}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              Cancel
            </button>
          </>
        )}

        {/* Active toggle — all params */}
        <button
          type="button"
          role="switch"
          aria-checked={param.resolvedIsActive}
          disabled={isTogglingActive}
          onClick={() => onToggleActive?.(!param.resolvedIsActive)}
          className={[
            'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50',
            param.resolvedIsActive ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
              param.resolvedIsActive ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update `SearchConfigSection` to use new props + mutations**

Replace the `SearchConfigSection` function body. The key changes are:
1. Add `editingParamId` state
2. Add `activeMutation`
3. Add `editMutation`
4. Pass new props to `ParamRow`
5. Update section header for inherited params

```tsx
function SearchConfigSection({ propertyId, orgId, isSuper }: SearchConfigSectionProps) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [editingParamId, setEditingParamId] = useState<number | null>(null)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)

  const currentTier: 'system' | 'chain' | 'hotel' = propertyId
    ? 'hotel'
    : orgId
    ? 'chain'
    : 'system'

  const paramsQuery = useQuery({
    queryKey: ['compset-search-params', propertyId, orgId],
    queryFn: () =>
      apiClient.getCompSetSearchParams({
        ...(propertyId !== null ? { propertyId } : {}),
        ...(orgId !== null && propertyId === null ? { orgId } : {}),
        effective: true,
      }),
  })

  const createMutation = useMutation({
    mutationFn: (data: CompSetSearchParamCreate) =>
      apiClient.createCompSetSearchParam({
        ...data,
        ...(propertyId !== null ? { propertyId } : orgId !== null ? { orgId } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-search-params'] })
      setShowAdd(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CompSetSearchParamCreate }) =>
      apiClient.updateCompSetSearchParam(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-search-params'] })
      setEditingParamId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteCompSetSearchParam(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-search-params'] })
      setDeleteConfirmId(null)
      setDeleteErr(null)
    },
    onError: (e) => setDeleteErr(e instanceof Error ? e.message : 'Delete failed'),
  })

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiClient.patchCompSetSearchParamActive(id, {
        isActive,
        orgId: orgId ?? null,
        propertyId: propertyId ?? null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['compset-search-params'] }),
  })

  const params = paramsQuery.data ?? []

  const tierOrder: Record<'system' | 'chain' | 'hotel', number> = { system: 0, chain: 1, hotel: 2 }
  const currentTierOrder = tierOrder[currentTier]

  const inheritedParams = params.filter((p) => tierOrder[p.tier] < currentTierOrder)
  const ownParams = params.filter((p) => p.tier === currentTier)

  return (
    <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Search Configurations</h2>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-background,#f9fafb)] transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        )}
      </div>

      {paramsQuery.isLoading ? (
        <div className="h-12 animate-pulse rounded-lg bg-[var(--color-border)]" />
      ) : (
        <>
          {inheritedParams.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Inherited — toggle to activate or deactivate
              </p>
              {inheritedParams.map((param) => (
                <ParamRow
                  key={param.id}
                  param={param}
                  isOwn={false}
                  isTogglingActive={activeMutation.isPending}
                  onToggleActive={(isActive) => activeMutation.mutate({ id: param.id, isActive })}
                />
              ))}
            </div>
          )}

          {ownParams.length > 0 && (
            <div className="space-y-2">
              {inheritedParams.length > 0 && (
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  Own
                </p>
              )}
              {ownParams.map((param) => (
                <ParamRow
                  key={param.id}
                  param={param}
                  isOwn={true}
                  isTogglingActive={activeMutation.isPending}
                  onToggleActive={(isActive) => activeMutation.mutate({ id: param.id, isActive })}
                  isEditing={editingParamId === param.id}
                  onEditRequest={() => { setEditingParamId(param.id); setShowAdd(false) }}
                  onEditCancel={() => setEditingParamId(null)}
                  onEditSave={(data) => editMutation.mutate({ id: param.id, data })}
                  isEditSaving={editMutation.isPending && editingParamId === param.id}
                  deleteConfirm={deleteConfirmId === param.id}
                  onDeleteRequest={() => setDeleteConfirmId(param.id)}
                  onDeleteConfirm={() => deleteMutation.mutate(param.id)}
                  onDeleteCancel={() => setDeleteConfirmId(null)}
                  isDeleting={deleteMutation.isPending && deleteConfirmId === param.id}
                />
              ))}
            </div>
          )}

          {inheritedParams.length === 0 && ownParams.length === 0 && !showAdd && (
            <p className="text-sm text-[var(--color-text-muted)] italic">
              No search parameters configured. Click &quot;Add&quot; to create one.
            </p>
          )}
        </>
      )}

      {showAdd && (
        <AddParamForm
          onAdd={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {createMutation.isError && (
        <p className="text-sm text-[var(--color-error,#dc2626)]">
          {createMutation.error instanceof Error ? createMutation.error.message : 'Create failed'}
        </p>
      )}

      {deleteErr && (
        <p className="text-xs text-[var(--color-error,#dc2626)]">{deleteErr}</p>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Add `updateCompSetSearchParam` to api-client if missing**

Check whether `updateCompSetSearchParam` exists:

```bash
grep -n "updateCompSetSearchParam" /home/nir/ibe/apps/web/src/lib/api-client.ts
```

If missing, add it next to `createCompSetSearchParam`:

```ts
updateCompSetSearchParam(id: number, data: CompSetSearchParamCreate): Promise<CompSetSearchParam> {
  return apiRequest(`/api/v1/admin/intelligence/compset/search-params/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
},
```

- [ ] **Step 5: Check TS for the web app**

```bash
cd /home/nir/ibe/apps/web && npx tsc --noEmit 2>&1 | grep compset | head -20
```

Expected: no errors.

- [ ] **Step 6: Run all compset service tests one final time**

```bash
cd /home/nir/ibe/apps/api && npx vitest run src/services/__tests__/compset.service.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /home/nir/ibe && git add apps/web/src/app/admin/intelligence/compset/page.tsx apps/web/src/lib/api-client.ts && git commit -m "feat(compset): search param activation toggle + inline edit UI"
```
