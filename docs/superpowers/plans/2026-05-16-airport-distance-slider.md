# Airport Distance Slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a horizontal distance slider to the NearestAirports strip header so guests can drag to re-query the API with a new radius, potentially surfacing more airports than the admin-configured maximum.

**Architecture:** Backend gains an optional `radiusKmOverride` on `getNearestAirports` (capped at maxCount=20 when used). The shared type adds `radiusKm` to `NearestAirportsResponse`. The frontend uses a live slider state for display and a debounced state (400 ms) as the query key, so the list updates without a loading spinner.

**Tech Stack:** TypeScript, Fastify, Prisma, React 18, TanStack Query v5, Tailwind CSS via CSS variables.

---

## File Map

| File | Change |
|------|--------|
| `packages/shared/src/types/airport-config.ts` | Add `radiusKm: number` to `NearestAirportsResponse` |
| `apps/api/src/services/airport-config.service.ts` | Add `radiusKmOverride?` to `getNearestAirports`; cap maxCount at 20 when override present |
| `apps/api/src/routes/airport-config.route.ts` | Parse optional `radiusKm` query param, clamp to [1, 300] |
| `apps/api/src/services/__tests__/airport-config.service.test.ts` | Tests for `radiusKmOverride` behaviour |
| `apps/web/src/lib/api-client.ts` | Add optional `radiusKm?` second arg to `getNearestAirports` |
| `apps/web/src/components/hotel/NearestAirports.tsx` | Slider state, debounce effect, updated query, header layout |

No new files. No DB changes. No translation keys.

---

### Task 1: Shared type + backend service + route

**Files:**
- Modify: `packages/shared/src/types/airport-config.ts:9-13`
- Modify: `apps/api/src/services/airport-config.service.ts:184-201`
- Modify: `apps/api/src/routes/airport-config.route.ts:65-72`
- Modify: `apps/api/src/services/__tests__/airport-config.service.test.ts`

- [ ] **Step 1: Add `radiusKm` to `NearestAirportsResponse`**

In `packages/shared/src/types/airport-config.ts`, replace the `NearestAirportsResponse` interface (lines 9-13):

```ts
export interface NearestAirportsResponse {
  airports: NearestAirport[]
  radiusKm: number
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}
```

- [ ] **Step 2: Add `radiusKmOverride?` to the service function**

In `apps/api/src/services/airport-config.service.ts`, replace the `getNearestAirports` function (lines 184-201):

```ts
export async function getNearestAirports(propertyId: number, radiusKmOverride?: number): Promise<NearestAirportsResponse> {
  const [resolved, property, sysRow] = await Promise.all([
    getResolvedAirportConfig(propertyId),
    fetchPropertyStatic(propertyId).catch(() => null),
    prisma.systemAirportConfig.findFirst({ select: { stripDefaultFolded: true, stripAutoFoldSecs: true } }),
  ])

  const stripDefaultFolded = sysRow?.stripDefaultFolded ?? SYS_DEFAULTS.stripDefaultFolded
  const stripAutoFoldSecs = sysRow?.stripAutoFoldSecs ?? SYS_DEFAULTS.stripAutoFoldSecs

  const lat = property?.coordinates?.latitude
  const lng = property?.coordinates?.longitude
  if (!resolved.enabled || !lat || !lng) return { airports: [], radiusKm: resolved.radiusKm, stripDefaultFolded, stripAutoFoldSecs }

  const radiusKm = radiusKmOverride ?? resolved.radiusKm
  const maxCount = radiusKmOverride !== undefined ? 20 : resolved.maxCount

  const dataset = await getSystemDataset()
  const airports = findNearestAirports(lat, lng, radiusKm, maxCount, dataset)
  return { airports, radiusKm, stripDefaultFolded, stripAutoFoldSecs }
}
```

- [ ] **Step 3: Parse optional `radiusKm` query param in the public route**

In `apps/api/src/routes/airport-config.route.ts`, replace the `airportPublicRoutes` function (lines 65-72):

```ts
export async function airportPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/airports/nearest', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const rawRadius = qs.radiusKm ? parseInt(qs.radiusKm, 10) : undefined
    const radiusKmOverride = rawRadius !== undefined && !isNaN(rawRadius)
      ? Math.min(300, Math.max(1, rawRadius))
      : undefined
    return reply.send(await getNearestAirports(propertyId, radiusKmOverride))
  })
}
```

- [ ] **Step 4: Write failing tests for `radiusKmOverride`**

In `apps/api/src/services/__tests__/airport-config.service.test.ts`, add these test cases after the last `getNearestAirports` describe block (after line 119):

```ts
vi.mock('../../../adapters/hyperguest/static.js', () => ({
  fetchPropertyStatic: vi.fn().mockResolvedValue({
    coordinates: { latitude: 51.5074, longitude: -0.1278 },
  }),
}))

vi.mock('../../utils/iata-lookup.js', () => ({
  findNearestAirports: vi.fn().mockReturnValue([]),
}))

import { findNearestAirports } from '../../utils/iata-lookup.js'

describe('getNearestAirports — radiusKmOverride', () => {
  beforeEach(() => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({
      ...SYS_ROW,
      stripDefaultFolded: false,
      stripAutoFoldSecs: 0,
      airportDataset: null,
    })
    mp.orgAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)
  })

  it('uses system radiusKm and maxCount when no override', async () => {
    const result = await getNearestAirports(42)
    expect(result.radiusKm).toBe(100)
    expect(findNearestAirports).toHaveBeenCalledWith(
      expect.any(Number), expect.any(Number), 100, 3, undefined
    )
  })

  it('uses override radiusKm and caps maxCount at 20', async () => {
    const result = await getNearestAirports(42, 250)
    expect(result.radiusKm).toBe(250)
    expect(findNearestAirports).toHaveBeenCalledWith(
      expect.any(Number), expect.any(Number), 250, 20, undefined
    )
  })

  it('returns override radiusKm in response even when 0 airports found', async () => {
    const result = await getNearestAirports(42, 50)
    expect(result.radiusKm).toBe(50)
    expect(result.airports).toEqual([])
  })
})
```

**Note:** The existing test file at the top already has `vi.mock` calls for `../../db/client.js`. The new mocks for `fetchPropertyStatic` and `iata-lookup` must be added at the top of the file alongside the existing mocks — before the `import` statements, since `vi.mock` is hoisted. Move them to the top of the file adjacent to the existing `vi.mock` block.

Specifically, insert at line 1 (before the existing `vi.mock` calls):

```ts
vi.mock('../../adapters/hyperguest/static.js', () => ({
  fetchPropertyStatic: vi.fn().mockResolvedValue({
    coordinates: { latitude: 51.5074, longitude: -0.1278 },
  }),
}))

vi.mock('../../utils/iata-lookup.js', () => ({
  findNearestAirports: vi.fn().mockReturnValue([]),
}))
```

And add the import for `findNearestAirports` alongside the other imports (after the `prisma` import):

```ts
import { findNearestAirports } from '../../utils/iata-lookup.js'
```

- [ ] **Step 5: Run failing tests**

```bash
cd /home/nir/ibe
pnpm --filter @ibe/api test -- --reporter=verbose --testPathPattern=airport-config.service
```

Expected: the three new tests FAIL (function signature mismatch or mock not called with expected args).

- [ ] **Step 6: Verify tests pass**

After completing Steps 2–3 above, run again:

```bash
pnpm --filter @ibe/api test -- --reporter=verbose --testPathPattern=airport-config.service
```

Expected: all tests pass (the new tests plus all pre-existing ones).

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /home/nir/ibe
pnpm --filter @ibe/api exec tsc --noEmit
pnpm --filter @ibe/shared exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd /home/nir/ibe
git add packages/shared/src/types/airport-config.ts \
        apps/api/src/services/airport-config.service.ts \
        apps/api/src/routes/airport-config.route.ts \
        apps/api/src/services/__tests__/airport-config.service.test.ts
git commit -m "feat: airport nearest-airports accepts radiusKm override"
```

---

### Task 2: API client

**Files:**
- Modify: `apps/web/src/lib/api-client.ts:1614-1616`

- [ ] **Step 1: Add optional `radiusKm` param to `getNearestAirports`**

In `apps/web/src/lib/api-client.ts`, replace the `getNearestAirports` method (lines 1614-1616):

```ts
  getNearestAirports(propertyId: number, radiusKm?: number): Promise<NearestAirportsResponse> {
    const qs = radiusKm !== undefined ? `&radiusKm=${radiusKm}` : ''
    return apiRequest(`/api/v1/airports/nearest?propertyId=${propertyId}${qs}`)
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/nir/ibe
pnpm --filter @ibe/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/nir/ibe
git add apps/web/src/lib/api-client.ts
git commit -m "feat: airport api client accepts optional radiusKm"
```

---

### Task 3: Frontend slider in `NearestAirports.tsx`

**Files:**
- Modify: `apps/web/src/components/hotel/NearestAirports.tsx`

- [ ] **Step 1: Add slider state and debounce effect**

Replace the entire file content with:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useT } from '@/context/translations'

interface Props {
  propertyId: number
}

export function NearestAirports({ propertyId }: Props) {
  const t = useT('search')
  const [dismissed, setDismissed] = useState(false)
  const [folded, setFolded] = useState(false)
  const [radiusKm, setRadiusKm] = useState<number | null>(null)
  const [debouncedRadius, setDebouncedRadius] = useState<number | null>(null)

  const { data } = useQuery({
    queryKey: ['nearest-airports', propertyId, debouncedRadius],
    queryFn: () => apiClient.getNearestAirports(propertyId, debouncedRadius ?? undefined),
    enabled: propertyId > 0,
  })

  // Initialise slider from first response
  useEffect(() => {
    if (!data || radiusKm !== null) return
    setRadiusKm(data.radiusKm)
    setDebouncedRadius(data.radiusKm)
  }, [data, radiusKm])

  // Auto-fold timer
  useEffect(() => {
    if (!data) return
    setFolded(data.stripDefaultFolded ?? false)
    const secs = data.stripAutoFoldSecs ?? 0
    if (secs === 0) return
    const timer = setTimeout(() => setFolded(true), secs * 1000)
    return () => clearTimeout(timer)
  }, [data])

  // Debounce slider → re-query
  useEffect(() => {
    if (radiusKm === null) return
    const timer = setTimeout(() => setDebouncedRadius(radiusKm), 400)
    return () => clearTimeout(timer)
  }, [radiusKm])

  const airports = data?.airports ?? []
  if (airports.length === 0 && !data) return null   // nothing loaded yet
  if (dismissed) return null
  // Keep strip visible even if slider returns 0 airports (was previously showing)

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none"
        onClick={() => setFolded(f => !f)}
      >
        {/* Icon + label */}
        <svg className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
        <span className="text-xs font-medium text-[var(--color-text)] shrink-0">{t('nearestAirports')}</span>

        {/* Slider — shown only after first load */}
        {radiusKm !== null && (
          <div
            className="flex items-center gap-1.5 flex-1 min-w-0"
            onClick={e => e.stopPropagation()}
          >
            <input
              type="range"
              min={10}
              max={300}
              step={10}
              value={radiusKm}
              onChange={e => setRadiusKm(Number(e.target.value))}
              className="w-full h-1 accent-[var(--color-primary)] cursor-pointer"
            />
            <span className="text-xs text-[var(--color-text-muted)] shrink-0 tabular-nums w-14 text-right">
              {radiusKm} km
            </span>
          </div>
        )}

        {/* Chevron + dismiss */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <svg
            className={['h-3.5 w-3.5 text-[var(--color-text-muted)] transition-transform duration-200', folded ? '' : 'rotate-180'].join(' ')}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <button
            onClick={e => { e.stopPropagation(); setDismissed(true) }}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)] transition-colors"
            aria-label="Dismiss"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Airport list */}
      {!folded && (
        <div className="border-t border-[var(--color-border)]">
          {airports.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
              {airports.map(a => (
                <div key={a.code} className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold text-[var(--color-text)]">{a.code}</span>
                  <span className="text-[var(--color-text-muted)]">{a.name}</span>
                  <span className="text-[var(--color-text-muted)]">·</span>
                  <span className="text-[var(--color-text-muted)]">{a.distanceKm} km</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
              No airports found within {radiusKm ?? 0} km.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

**Key behaviours encoded in this component:**
- `radiusKm === null` until first data load → slider is hidden (no flash of default value)
- First data arrival: `useEffect` initialises both `radiusKm` and `debouncedRadius` from `data.radiusKm`
- `dismissed` check is after the data guard so the component can be dismissed even if airports list is empty after a slider drag
- `airports.length === 0 && !data` → return null (nothing fetched yet, same as before)
- Once data has loaded (slider is visible), dragging to a radius that returns 0 shows an empty state message inside the unfolded body — the strip stays visible
- The `ml-auto` on the chevron+dismiss group pushes them to the right when the slider is absent (narrow label only); when slider is present it fills available space naturally

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/nir/ibe
pnpm --filter @ibe/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual browser check**

Start API dev server (if not running):
```bash
cd /home/nir/ibe/apps/api && pnpm dev
```

Start web dev server (if not running):
```bash
cd /home/nir/ibe/apps/web && pnpm dev
```

Open a search page for a property that has the airport strip enabled (e.g., one with `enabled: true` in the system airport config).

Verify:
1. Strip renders with label and chevron/dismiss — **no slider visible initially**
2. After first load, slider appears between label and chevron
3. Slider label shows the system-configured radius (e.g., `100 km`)
4. Dragging the slider updates the label immediately; 400 ms after releasing, the airport list re-queries
5. Dragging to a large radius (e.g., 300 km) may show more airports than the admin default
6. Dragging to a very small radius (e.g., 10 km) may show 0 airports → empty state message in body
7. Folding/unfolding still works; dismiss still removes the strip
8. Clicking on the slider area does **not** toggle fold/unfold

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add apps/web/src/components/hotel/NearestAirports.tsx
git commit -m "feat: distance slider in NearestAirports strip header"
```
