# Property Incomplete Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `isActive` boolean on `Property` with a three-value `status` string (`'active' | 'inactive' | 'incomplete'`), and automatically mark properties as incomplete when the HG backfill detects missing name, rooms, or address.

**Architecture:** Prisma schema migration drops `isActive` and adds `status`; shared type `PropertyStatus` flows through service → routes → API client → admin UI. The backfill route is expanded to check completeness after fetching HG static data and applies status transitions per a simple rule table.

**Tech Stack:** Prisma (PostgreSQL), Fastify, Vitest, Next.js 14, React Query, TypeScript

**Spec:** `docs/superpowers/specs/2026-05-11-property-incomplete-status-design.md`

---

## File Map

| File | Change |
|------|--------|
| `apps/api/prisma/schema.prisma` | Remove `isActive`, add `status String @default("active")` |
| `packages/shared/src/types/api.ts` | Add `PropertyStatus` type; replace `isActive: boolean` in `PropertyRecord` |
| `apps/api/src/services/property-registry.service.ts` | Replace all `isActive` refs, rename `setPropertyActive` → `setPropertyStatus`, add `checkPropertyCompleteness` |
| `apps/api/src/services/__tests__/property-registry.service.test.ts` | Update mocks/assertions, add `checkPropertyCompleteness` + `setPropertyStatus` tests |
| `apps/api/src/routes/admin.route.ts` | Rename active route → status route; expand backfill completeness check |
| `apps/api/src/routes/config.route.ts` | `isActive: true` → `status: 'active'` (line 42) |
| `apps/api/src/routes/mcp.route.ts` | `isActive: true` → `status: 'active'` (lines 570, 598, 600, 854) |
| `apps/web/src/lib/api-client.ts` | Rename `setPropertyActive` → `setPropertyStatus` |
| `apps/web/src/app/admin/config/properties/page.tsx` | FilterStatus, filter logic, badge, toggle mutation, dropdown |

---

## Task 1: Prisma schema — replace `isActive` with `status`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Edit the Property model**

  In `apps/api/prisma/schema.prisma`, find the `Property` model (~line 439). Replace:
  ```prisma
  isActive       Boolean      @default(true)
  ```
  with:
  ```prisma
  status         String       @default("active")
  ```

- [ ] **Step 2: Run the migration**

  ```bash
  cd apps/api && npx prisma migrate dev --name add_property_status
  ```
  Expected: migration created and applied. The migration SQL should contain:
  ```sql
  ALTER TABLE "Property" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
  UPDATE "Property" SET status = CASE WHEN "isActive" = true THEN 'active' ELSE 'inactive' END;
  ALTER TABLE "Property" DROP COLUMN "isActive";
  ```
  If prisma generates only the ALTER ADD without the data migration UPDATE, edit the generated migration file to insert the UPDATE before the DROP, then run `npx prisma migrate dev` again.

- [ ] **Step 3: Regenerate Prisma client**

  ```bash
  cd apps/api && npx prisma generate
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
  git commit -m "feat: replace Property.isActive with status enum string"
  ```

---

## Task 2: Shared types — add `PropertyStatus`, update `PropertyRecord`

**Files:**
- Modify: `packages/shared/src/types/api.ts`

- [ ] **Step 1: Add `PropertyStatus` type**

  In `packages/shared/src/types/api.ts`, immediately before the `PropertyRecord` interface (line 760), insert:
  ```typescript
  export type PropertyStatus = 'active' | 'inactive' | 'incomplete'
  
  ```

- [ ] **Step 2: Update `PropertyRecord`**

  In the `PropertyRecord` interface (line 764), replace:
  ```typescript
    isActive: boolean
  ```
  with:
  ```typescript
    status: PropertyStatus
  ```

- [ ] **Step 3: Build shared package**

  ```bash
  pnpm --filter @ibe/shared build
  ```
  Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

  ```bash
  git add packages/shared/src/types/api.ts
  git commit -m "feat: add PropertyStatus type, replace isActive in PropertyRecord"
  ```

---

## Task 3: Property registry service — replace `isActive`, add helpers

**Files:**
- Modify: `apps/api/src/services/property-registry.service.ts`
- Modify: `apps/api/src/services/__tests__/property-registry.service.test.ts`

- [ ] **Step 1: Write failing tests for `checkPropertyCompleteness`**

  At the top of `apps/api/src/services/__tests__/property-registry.service.test.ts`, add an import and a new describe block. Add it after the existing imports and before the `addProperty` describe:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import type { HGPropertyStatic } from '@ibe/shared'
  
  // ... existing mocks ...
  
  import { addProperty, PropertyConflictError, checkPropertyCompleteness, setPropertyStatus } from '../property-registry.service.js'
  
  // ... existing beforeEach ...
  
  function makeStaticData(overrides: Partial<HGPropertyStatic> = {}): HGPropertyStatic {
    return {
      id: 1,
      name: 'Grand Hotel',
      rating: 4,
      logo: '',
      group: '',
      isTest: 0,
      contact: {} as never,
      coordinates: {} as never,
      location: { address: '123 Main St', city: { id: 1, name: 'City', hereMapsId: '' }, countryCode: 'US', postcode: '12345' },
      descriptions: [],
      facilities: [],
      images: [],
      policies: [],
      ratePlans: [],
      rooms: [{ id: 1, hotelId: 1, pmsCode: 'R1', name: 'Standard', descriptions: [], facilities: [], images: [], beds: [], ratePlans: [] }],
      commission: { calculation: '', chargeType: '', value: 0 },
      created: '',
      ...overrides,
    } as HGPropertyStatic
  }
  
  describe('checkPropertyCompleteness', () => {
    it('returns true when name, rooms, and address are all present', () => {
      expect(checkPropertyCompleteness(makeStaticData())).toBe(true)
    })
  
    it('returns false when name is empty', () => {
      expect(checkPropertyCompleteness(makeStaticData({ name: '' }))).toBe(false)
    })
  
    it('returns false when name is whitespace', () => {
      expect(checkPropertyCompleteness(makeStaticData({ name: '   ' }))).toBe(false)
    })
  
    it('returns false when rooms array is empty', () => {
      expect(checkPropertyCompleteness(makeStaticData({ rooms: [] }))).toBe(false)
    })
  
    it('returns false when address is empty', () => {
      expect(checkPropertyCompleteness(makeStaticData({
        location: { address: '', city: { id: 1, name: 'City' }, countryCode: 'US', postcode: '12345' },
      }))).toBe(false)
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd apps/api && pnpm test src/services/__tests__/property-registry.service.test.ts
  ```
  Expected: FAIL — `checkPropertyCompleteness` not exported.

- [ ] **Step 3: Update the import line in property-registry.service.ts**

  In `apps/api/src/services/property-registry.service.ts` line 5, replace:
  ```typescript
  import type { HGPropertyStatic } from '@ibe/shared'
  ```
  with:
  ```typescript
  import type { HGPropertyStatic, PropertyStatus } from '@ibe/shared'
  ```

- [ ] **Step 4: Update the internal `PropertyRecord` interface**

  In `property-registry.service.ts`, the internal `PropertyRecord` interface (lines 28–42). Replace:
  ```typescript
    isActive: boolean
  ```
  with:
  ```typescript
    status: PropertyStatus
  ```

- [ ] **Step 5: Update `makeDemoRecord()`**

  Replace:
  ```typescript
  export function makeDemoRecord(): PropertyRecord {
    return { id: 0, propertyId: DEMO_HG_ID, isDefault: false, isActive: true, lastSyncedAt: null, createdAt: new Date().toISOString(), isDemo: true }
  }
  ```
  with:
  ```typescript
  export function makeDemoRecord(): PropertyRecord {
    return { id: 0, propertyId: DEMO_HG_ID, isDefault: false, status: 'active', lastSyncedAt: null, createdAt: new Date().toISOString(), isDemo: true }
  }
  ```

- [ ] **Step 6: Add `checkPropertyCompleteness` export**

  After `makeDemoRecord()`, add:
  ```typescript
  export function checkPropertyCompleteness(data: HGPropertyStatic): boolean {
    return !!(data.name?.trim() && data.rooms.length > 0 && data.location?.address?.trim())
  }
  ```

- [ ] **Step 7: Update `listProperties()` mapper**

  In `listProperties()` (~line 90), replace:
  ```typescript
      isActive: r.isActive,
  ```
  with:
  ```typescript
      status: r.status as PropertyStatus,
  ```

- [ ] **Step 8: Update demo property in `listProperties()`**

  Inside `listProperties()` (~lines 102–111), find the inline `demo: PropertyRecord` object and replace:
  ```typescript
      const demo: PropertyRecord = {
        id: 0,
        propertyId: DEMO_HG_ID,
        isDefault: real.length === 0,
        isActive: true,
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        isDemo: true,
      }
  ```
  with:
  ```typescript
      const demo: PropertyRecord = {
        id: 0,
        propertyId: DEMO_HG_ID,
        isDefault: real.length === 0,
        status: 'active',
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        isDemo: true,
      }
  ```

- [ ] **Step 10: Update `addProperty()` — restore soft-deleted same-org branch**

  Around line 208, replace:
  ```typescript
          data: { deletedAt: null, isActive: true, ...(name ? { name } : {}) },
  ```
  with:
  ```typescript
          data: { deletedAt: null, status: 'active', ...(name ? { name } : {}) },
  ```

  And around line 215 (the return statement for restored property), replace:
  ```typescript
        return { id: restored.id, propertyId: restored.propertyId, isDefault: restored.isDefault, isActive: restored.isActive, isPrimary: true, lastSyncedAt: restored.lastSyncedAt?.toISOString() ?? null, createdAt: restored.createdAt.toISOString(), name: restored.name ?? null }
  ```
  with:
  ```typescript
        return { id: restored.id, propertyId: restored.propertyId, isDefault: restored.isDefault, status: restored.status as PropertyStatus, isPrimary: true, lastSyncedAt: restored.lastSyncedAt?.toISOString() ?? null, createdAt: restored.createdAt.toISOString(), name: restored.name ?? null }
  ```

- [ ] **Step 11: Update `addProperty()` — secondary association return**

  Around line 224, replace:
  ```typescript
        return { id: conflict.id, propertyId: conflict.propertyId, isDefault: false, isActive: conflict.isActive, isPrimary: false, lastSyncedAt: conflict.lastSyncedAt?.toISOString() ?? null, createdAt: conflict.createdAt.toISOString(), name: conflict.name ?? null }
  ```
  with:
  ```typescript
        return { id: conflict.id, propertyId: conflict.propertyId, isDefault: false, status: conflict.status as PropertyStatus, isPrimary: false, lastSyncedAt: conflict.lastSyncedAt?.toISOString() ?? null, createdAt: conflict.createdAt.toISOString(), name: conflict.name ?? null }
  ```

- [ ] **Step 12: Update `addProperty()` — reassign from another org**

  Around line 231, replace:
  ```typescript
          data: { organizationId, deletedAt: null, isActive: true, isDefault: count === 0, ...(name ? { name } : {}) },
  ```
  with:
  ```typescript
          data: { organizationId, deletedAt: null, status: 'active', isDefault: count === 0, ...(name ? { name } : {}) },
  ```

  Around line 237 (return for reassigned), replace:
  ```typescript
        return { id: reassigned.id, propertyId: reassigned.propertyId, isDefault: reassigned.isDefault, isActive: reassigned.isActive, isPrimary: true, lastSyncedAt: reassigned.lastSyncedAt?.toISOString() ?? null, createdAt: reassigned.createdAt.toISOString(), name: reassigned.name ?? null }
  ```
  with:
  ```typescript
        return { id: reassigned.id, propertyId: reassigned.propertyId, isDefault: reassigned.isDefault, status: reassigned.status as PropertyStatus, isPrimary: true, lastSyncedAt: reassigned.lastSyncedAt?.toISOString() ?? null, createdAt: reassigned.createdAt.toISOString(), name: reassigned.name ?? null }
  ```

- [ ] **Step 13: Update `addProperty()` — fresh create return**

  Around line 249, replace:
  ```typescript
    return { id: row.id, propertyId: row.propertyId, isDefault: row.isDefault, isActive: row.isActive, isPrimary: true, lastSyncedAt: null, createdAt: row.createdAt.toISOString(), name: name ?? null }
  ```
  with:
  ```typescript
    return { id: row.id, propertyId: row.propertyId, isDefault: row.isDefault, status: row.status as PropertyStatus, isPrimary: true, lastSyncedAt: null, createdAt: row.createdAt.toISOString(), name: name ?? null }
  ```

- [ ] **Step 14: Update `removeProperty()` soft-delete**

  Around line 287, replace:
  ```typescript
        prisma.property.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }),
  ```
  with:
  ```typescript
        prisma.property.update({ where: { id }, data: { deletedAt: new Date(), status: 'inactive' } }),
  ```

- [ ] **Step 15: Update `listAllProperties()` mapper**

  Around line 330, replace:
  ```typescript
      isActive: r.isActive,
  ```
  with:
  ```typescript
      status: r.status as PropertyStatus,
  ```

- [ ] **Step 16: Replace `setPropertyActive` with `setPropertyStatus`**

  Replace the entire function (lines 296–301):
  ```typescript
  export async function setPropertyActive(organizationId: number | null, id: number, active: boolean): Promise<void> {
    await prisma.property.update({
      where: { id, ...(organizationId !== null ? { organizationId } : {}) },
      data: { isActive: active },
    })
  }
  ```
  with:
  ```typescript
  export async function setPropertyStatus(organizationId: number | null, id: number, status: 'active' | 'inactive'): Promise<void> {
    await prisma.property.update({
      where: { id, ...(organizationId !== null ? { organizationId } : {}) },
      data: { status },
    })
  }
  ```

- [ ] **Step 17: Update tests — fix existing assertions**

  In `property-registry.service.test.ts`, update the import line to include new exports:
  ```typescript
  import { addProperty, PropertyConflictError, checkPropertyCompleteness, setPropertyStatus } from '../property-registry.service.js'
  ```

  Update every mock return value and assertion that uses `isActive`. The changes are:

  Line 23: `isActive: true` → `status: 'active'`
  Line 39: `isActive: true` → `status: 'active'`
  Line 80: `isActive: true` → `status: 'active'`
  Line 87: `data: { deletedAt: null, isActive: true }` → `data: { deletedAt: null, status: 'active' }`
  Line 89: `result.isActive` → `result.status`; `toBe(true)` → `toBe('active')`
  Line 101: `isActive: true` → `status: 'active'`
  Line 108: `data: { organizationId: 1, deletedAt: null, isActive: true, isDefault: false }` → `data: { organizationId: 1, deletedAt: null, status: 'active', isDefault: false }`
  Line 110: `result.isActive` → `result.status`; `toBe(true)` → `toBe('active')`
  Line 122: `isActive: true` → `status: 'active'`
  Line 129: `data: { organizationId: 1, deletedAt: null, isActive: true, isDefault: true }` → `data: { organizationId: 1, deletedAt: null, status: 'active', isDefault: true }`

- [ ] **Step 18: Add `setPropertyStatus` test**

  Append to `property-registry.service.test.ts`:
  ```typescript
  describe('setPropertyStatus', () => {
    it('updates property status to inactive', async () => {
      mockProperty.update.mockResolvedValue({})
  
      await setPropertyStatus(1, 10, 'inactive')
  
      expect(mockProperty.update).toHaveBeenCalledWith({
        where: { id: 10, organizationId: 1 },
        data: { status: 'inactive' },
      })
    })
  
    it('updates property status to active', async () => {
      mockProperty.update.mockResolvedValue({})
  
      await setPropertyStatus(null, 10, 'active')
  
      expect(mockProperty.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { status: 'active' },
      })
    })
  })
  ```

- [ ] **Step 19: Run tests to confirm all pass**

  ```bash
  cd apps/api && pnpm test src/services/__tests__/property-registry.service.test.ts
  ```
  Expected: all tests PASS.

- [ ] **Step 20: Commit**

  ```bash
  git add apps/api/src/services/property-registry.service.ts apps/api/src/services/__tests__/property-registry.service.test.ts
  git commit -m "feat: replace isActive with status in property-registry service, add checkPropertyCompleteness"
  ```

---

## Task 4: Admin route — rename status route + expand backfill

**Files:**
- Modify: `apps/api/src/routes/admin.route.ts`

- [ ] **Step 1: Update imports**

  In `apps/api/src/routes/admin.route.ts` line 4, replace:
  ```typescript
  import { listProperties, listAllProperties, makeDemoRecord, addProperty, PropertyConflictError, setDefaultProperty, removeProperty, setPropertyActive, setPropertyHGCredentials, getPropertyUsers, setPropertyUsers, getPropertyOrgs, addOrgToProperty, removeOrgFromProperty, transferPrimaryOwnership, updatePropertyName } from '../services/property-registry.service.js'
  ```
  with:
  ```typescript
  import { listProperties, listAllProperties, makeDemoRecord, addProperty, PropertyConflictError, setDefaultProperty, removeProperty, setPropertyStatus, checkPropertyCompleteness, setPropertyHGCredentials, getPropertyUsers, setPropertyUsers, getPropertyOrgs, addOrgToProperty, removeOrgFromProperty, transferPrimaryOwnership, updatePropertyName } from '../services/property-registry.service.js'
  ```

- [ ] **Step 2: Rename the active toggle route**

  Replace (lines 173–178):
  ```typescript
    fastify.put('/admin/properties/:id/active', async (request, reply) => {
      const id = parseInt((request.params as { id: string }).id, 10)
      const { active } = request.body as { active: boolean }
      await setPropertyActive(request.admin.organizationId, id, !!active)
      return reply.send({ ok: true, active: !!active })
    })
  ```
  with:
  ```typescript
    fastify.put('/admin/properties/:id/status', async (request, reply) => {
      const id = parseInt((request.params as { id: string }).id, 10)
      const { status } = request.body as { status: string }
      if (status !== 'active' && status !== 'inactive') {
        return reply.status(400).send({ error: 'Invalid status. Must be "active" or "inactive"' })
      }
      await setPropertyStatus(request.admin.organizationId, id, status as 'active' | 'inactive')
      return reply.send({ ok: true, status })
    })
  ```

- [ ] **Step 3: Expand the backfill route**

  Replace the entire backfill handler (lines 379–430):
  ```typescript
    // ── Property name backfill — SSE progress stream (any admin, scoped to their org) ──
    fastify.post('/admin/properties/backfill-names', async (request, reply) => {
      const isSuper = request.admin.role === 'super'
      const orgId = request.admin.organizationId

      const where = isSuper
        ? { deletedAt: null, OR: [{ name: null }, { status: 'incomplete' }] }
        : {
            deletedAt: null,
            OR: [{ name: null }, { status: 'incomplete' }],
            propertyOrganizations: { some: { organizationId: orgId! } },
          }

      const rows = await prisma.property.findMany({
        where,
        select: { propertyId: true, name: true, status: true },
        orderBy: { propertyId: 'asc' },
      })

      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.setHeader('X-Accel-Buffering', 'no')
      reply.raw.flushHeaders()

      const send = (data: object) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)

      send({ type: 'total', total: rows.length })

      let filled = 0
      let failed = 0
      const errors: { propertyId: number; name: string | null }[] = []

      for (const row of rows) {
        const { propertyId, status: currentStatus } = row
        try {
          const data = await fetchPropertyStatic(propertyId)
          const complete = checkPropertyCompleteness(data)

          if (complete) {
            if (!row.name && data.name) await updatePropertyName(propertyId, data.name)
            if (currentStatus === 'incomplete') {
              await prisma.property.updateMany({
                where: { propertyId, deletedAt: null },
                data: { status: 'active' },
              })
            }
            filled++
          } else {
            await prisma.property.updateMany({
              where: { propertyId, deletedAt: null },
              data: { status: 'incomplete' },
            })
            failed++
            errors.push({ propertyId, name: row.name })
          }
        } catch {
          await prisma.property.updateMany({
            where: { propertyId, deletedAt: null },
            data: { status: 'incomplete' },
          })
          failed++
          errors.push({ propertyId, name: row.name })
        }
        send({ type: 'progress', filled, failed, total: rows.length })
      }

      send({ type: 'done', filled, failed, total: rows.length, errors })
      reply.raw.end()
      return reply
    })
  ```

- [ ] **Step 4: Build API to verify**

  ```bash
  pnpm --filter api build
  ```
  Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/routes/admin.route.ts
  git commit -m "feat: rename property active route to status, expand backfill with completeness check"
  ```

---

## Task 5: Guest-facing route fixes

**Files:**
- Modify: `apps/api/src/routes/config.route.ts`
- Modify: `apps/api/src/routes/mcp.route.ts`

- [ ] **Step 1: Fix config.route.ts**

  In `apps/api/src/routes/config.route.ts` line 42, replace:
  ```typescript
        where: { subdomain, isActive: true, deletedAt: null },
  ```
  with:
  ```typescript
        where: { subdomain, status: 'active', deletedAt: null },
  ```

- [ ] **Step 2: Fix mcp.route.ts — resolveDefaultProperty**

  In `apps/api/src/routes/mcp.route.ts` line 570, replace:
  ```typescript
    where: { organizationId: scope.orgId, isActive: true },
  ```
  with:
  ```typescript
    where: { organizationId: scope.orgId, status: 'active' },
  ```

- [ ] **Step 3: Fix mcp.route.ts — list_properties baseWhere**

  Around line 598, replace:
  ```typescript
        ? { organizationId: orgId, isActive: true }
        : defaultPropertyId
        ? { propertyId: defaultPropertyId, isActive: true }
  ```
  with:
  ```typescript
        ? { organizationId: orgId, status: 'active' }
        : defaultPropertyId
        ? { propertyId: defaultPropertyId, status: 'active' }
  ```

- [ ] **Step 4: Fix mcp.route.ts — property count**

  Around line 854, replace:
  ```typescript
        prisma.property.count({ where: { organizationId: orgId, isActive: true } }),
  ```
  with:
  ```typescript
        prisma.property.count({ where: { organizationId: orgId, status: 'active' } }),
  ```

- [ ] **Step 5: Build API**

  ```bash
  pnpm --filter api build
  ```
  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api/src/routes/config.route.ts apps/api/src/routes/mcp.route.ts
  git commit -m "fix: replace isActive with status in guest-facing property queries"
  ```

---

## Task 6: API client — rename `setPropertyActive`

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Replace `setPropertyActive` method**

  In `apps/web/src/lib/api-client.ts` lines 511–516, replace:
  ```typescript
    setPropertyActive(id: number, active: boolean): Promise<{ ok: boolean; active: boolean }> {
      return apiRequest<{ ok: boolean; active: boolean }>(`/api/v1/admin/properties/${id}/active`, {
        method: 'PUT',
        body: JSON.stringify({ active }),
      })
    },
  ```
  with:
  ```typescript
    setPropertyStatus(id: number, status: 'active' | 'inactive'): Promise<{ ok: boolean; status: string }> {
      return apiRequest<{ ok: boolean; status: string }>(`/api/v1/admin/properties/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
    },
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add apps/web/src/lib/api-client.ts
  git commit -m "feat: rename setPropertyActive to setPropertyStatus in api-client"
  ```

---

## Task 7: Admin UI — filter, badge, toggle

**Files:**
- Modify: `apps/web/src/app/admin/config/properties/page.tsx`

- [ ] **Step 1: Update `FilterStatus` type**

  Around line 939, replace:
  ```typescript
  type FilterStatus = 'all' | 'active' | 'inactive'
  ```
  with:
  ```typescript
  type FilterStatus = 'all' | 'active' | 'inactive' | 'incomplete'
  ```

- [ ] **Step 2: Update filter logic**

  Around lines 1056–1057, replace:
  ```typescript
    if (filterStatus === 'active' && !p.isActive) return false
    if (filterStatus === 'inactive' && p.isActive) return false
  ```
  with:
  ```typescript
    if (filterStatus === 'active' && p.status !== 'active') return false
    if (filterStatus === 'inactive' && p.status !== 'inactive') return false
    if (filterStatus === 'incomplete' && p.status !== 'incomplete') return false
  ```

- [ ] **Step 3: Add Incomplete badge**

  In the property row badge section (~lines 553–557), find the block of badge spans (Demo, Default, Secondary). Add the Incomplete badge after them:
  ```tsx
  {record.status === 'incomplete' && (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      Incomplete
    </span>
  )}
  ```

- [ ] **Step 4: Update `activeMutation`**

  Around lines 494–500, replace:
  ```typescript
    const activeMutation = useMutation({
      mutationFn: (active: boolean) => apiClient.setPropertyActive(record.id, active),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['admin-properties'] })
        void qc.invalidateQueries({ queryKey: ['admin-super-properties'] })
      },
    })
  ```
  with:
  ```typescript
    const activeMutation = useMutation({
      mutationFn: (status: 'active' | 'inactive') => apiClient.setPropertyStatus(record.id, status),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['admin-properties'] })
        void qc.invalidateQueries({ queryKey: ['admin-super-properties'] })
      },
    })
  ```

- [ ] **Step 5: Update toggle button**

  Around lines 611–625, replace:
  ```tsx
    <button
      onClick={() => activeMutation.mutate(!record.isActive)}
      disabled={activeMutation.isPending}
      title={record.isActive ? 'Disable property' : 'Enable property'}
      className={[
        'h-7 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-50',
        record.isActive
          ? 'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20'
          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
      ].join(' ')}
    >
      {record.isActive ? 'Enabled' : 'Disabled'}
    </button>
  ```
  with:
  ```tsx
    <button
      onClick={() => activeMutation.mutate(record.status === 'active' ? 'inactive' : 'active')}
      disabled={activeMutation.isPending}
      title={record.status === 'active' ? 'Disable property' : 'Enable property'}
      className={[
        'h-7 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-50',
        record.status === 'active'
          ? 'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20'
          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
      ].join(' ')}
    >
      {record.status === 'active' ? 'Enabled' : 'Disabled'}
    </button>
  ```

- [ ] **Step 6: Add Incomplete option to filter dropdown**

  Around lines 1268–1276, add the new option inside the `<select>`:
  ```tsx
  <option value="incomplete">Incomplete</option>
  ```
  The full select becomes:
  ```tsx
  <select
    value={filterStatus}
    onChange={e => setFilterStatus(e.target.value as FilterStatus)}
    className="w-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
  >
    <option value="all">All statuses</option>
    <option value="active">Active</option>
    <option value="inactive">Inactive</option>
    <option value="incomplete">Incomplete</option>
  </select>
  ```

- [ ] **Step 7: Build web to verify**

  ```bash
  pnpm --filter web build
  ```
  Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

  ```bash
  git add apps/web/src/app/admin/config/properties/page.tsx
  git commit -m "feat: add Incomplete status to admin properties UI — filter, badge, toggle"
  ```

---

## Task 8: Final verification

- [ ] **Step 1: Run full API test suite**

  ```bash
  cd apps/api && pnpm test
  ```
  Expected: all tests pass.

- [ ] **Step 2: Start dev servers and smoke test**

  ```bash
  pnpm dev
  ```
  1. Open admin → Config → Properties
  2. Verify the filter dropdown shows "All statuses / Active / Inactive / Incomplete"
  3. Run backfill on a known incomplete property (e.g., 36466) — confirm it gets the Incomplete badge
  4. Toggle the property to Active via the button — confirm the Incomplete badge disappears
  5. Run backfill again — confirm it re-marks the property as Incomplete if HG data is still missing
