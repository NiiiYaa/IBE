# External IBE Bulk Hotel ID Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let chain admins upload an Excel file to bulk-map HyperGuest property IDs to External IBE IDs, replacing the per-hotel URL-paste workflow.

**Architecture:** Client-side Excel parsing with `xlsx` (SheetJS) sends parsed `{ propertyId, externalHotelId }[]` to a new `POST /admin/external-ibe/bulk-map` API endpoint. The endpoint validates org membership, upserts each mapping, then returns errors + a "still missing" list. UI lives at the bottom of the chain-level `FullTemplateUI`.

**Tech Stack:** SheetJS (`xlsx`), Fastify, Prisma, React/TanStack Query

---

## File Map

| File | Change |
|------|--------|
| `packages/shared/src/types/external-ibe.ts` | Add `ExternalIBEBulkMapRequest` and `ExternalIBEBulkMapResponse` interfaces |
| `apps/api/src/services/external-ibe.service.ts` | Add `bulkMapExternalHotelIds` function |
| `apps/api/src/services/__tests__/external-ibe.service.test.ts` | Add tests for `bulkMapExternalHotelIds` |
| `apps/api/src/routes/external-ibe.route.ts` | Add `POST /admin/external-ibe/bulk-map` route |
| `apps/web/src/lib/api-client.ts` | Add `bulkMapExternalIBE` method |
| `apps/web/src/app/admin/config/external-ibe/page.tsx` | Add `BulkMappingUpload` component + wire into chain `FullTemplateUI` |
| `apps/web/package.json` | Add `xlsx` dependency |

---

## Task 1: Add shared types

**Files:**
- Modify: `packages/shared/src/types/external-ibe.ts`

- [ ] **Step 1: Add the two interfaces after the existing `ExternalIBEResolveResponse` interface**

```ts
export interface ExternalIBEBulkMapRequest {
  orgId: number
  mappings: { propertyId: number; externalHotelId: string }[]
}

export interface ExternalIBEBulkMapResponse {
  updated: number
  errors: { propertyId: number; message: string }[]
  stillMissing: { propertyId: number; name: string }[]
}
```

- [ ] **Step 2: Rebuild the shared package**

```bash
cd packages/shared && npx tsc
```

Expected: no errors, `dist/` updated.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/external-ibe.ts packages/shared/dist
git commit -m "feat: add ExternalIBEBulkMapRequest/Response shared types"
```

---

## Task 2: Add service function + tests

**Files:**
- Modify: `apps/api/src/services/external-ibe.service.ts`
- Modify: `apps/api/src/services/__tests__/external-ibe.service.test.ts`

- [ ] **Step 1: Add `findMany` to the prisma mock in the test file**

In `apps/api/src/services/__tests__/external-ibe.service.test.ts`, update the mock at the top:

```ts
vi.mock('../../db/client.js', () => ({
  prisma: {
    externalIBEConfig: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    property: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))
```

Also add `bulkMapExternalHotelIds` to the import:

```ts
import {
  buildExternalUrl,
  getEffectiveExternalIBEConfig,
  getExternalIBEConfig,
  bulkMapExternalHotelIds,
} from '../external-ibe.service.js'
```

- [ ] **Step 2: Write the failing tests**

Add at the end of the test file:

```ts
// ── bulkMapExternalHotelIds ───────────────────────────────────────────────

describe('bulkMapExternalHotelIds', () => {
  const orgProperties = [
    { propertyId: 10, name: 'Hotel Alpha' },
    { propertyId: 11, name: 'Hotel Beta' },
    { propertyId: 12, name: 'Hotel Gamma' },
  ]

  beforeEach(() => {
    mp.property.findMany.mockResolvedValue(orgProperties)
    mp.externalIBEConfig.upsert.mockResolvedValue({ id: 1, propertyId: 10, externalHotelId: 'ext-10' })
    mp.externalIBEConfig.findMany.mockResolvedValue([])
  })

  it('upserts valid mappings and returns updated count', async () => {
    mp.externalIBEConfig.findMany.mockResolvedValue([
      { propertyId: 10, externalHotelId: 'ext-10' },
      { propertyId: 11, externalHotelId: 'ext-11' },
    ])

    const result = await bulkMapExternalHotelIds(1, [
      { propertyId: 10, externalHotelId: 'ext-10' },
      { propertyId: 11, externalHotelId: 'ext-11' },
    ])

    expect(result.updated).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(result.stillMissing).toEqual([{ propertyId: 12, name: 'Hotel Gamma' }])
  })

  it('returns error for property not in org', async () => {
    const result = await bulkMapExternalHotelIds(1, [
      { propertyId: 99, externalHotelId: 'ext-99' },
    ])

    expect(result.updated).toBe(0)
    expect(result.errors).toEqual([
      { propertyId: 99, message: 'Property not found in this organisation' },
    ])
    expect(mp.externalIBEConfig.upsert).not.toHaveBeenCalled()
  })

  it('collects db error and continues remaining mappings', async () => {
    mp.externalIBEConfig.upsert
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce({ id: 2, propertyId: 11, externalHotelId: 'ext-11' })

    mp.externalIBEConfig.findMany.mockResolvedValue([
      { propertyId: 11, externalHotelId: 'ext-11' },
    ])

    const result = await bulkMapExternalHotelIds(1, [
      { propertyId: 10, externalHotelId: 'ext-10' },
      { propertyId: 11, externalHotelId: 'ext-11' },
    ])

    expect(result.updated).toBe(1)
    expect(result.errors).toEqual([{ propertyId: 10, message: 'DB timeout' }])
    expect(result.stillMissing).toEqual([{ propertyId: 12, name: 'Hotel Gamma' }])
  })

  it('reports all properties as still missing when no configs exist', async () => {
    mp.externalIBEConfig.findMany.mockResolvedValue([])

    const result = await bulkMapExternalHotelIds(1, [])

    expect(result.updated).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(result.stillMissing).toHaveLength(3)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/__tests__/external-ibe.service.test.ts 2>&1 | tail -20
```

Expected: tests fail with "bulkMapExternalHotelIds is not a function" or similar.

- [ ] **Step 4: Add `bulkMapExternalHotelIds` to the service**

Add this function to `apps/api/src/services/external-ibe.service.ts`, after `deleteExternalIBEConfig` and before `getEffectiveExternalIBEConfig`. Also add `ExternalIBEBulkMapResponse` to the import from `@ibe/shared`:

```ts
import type {
  ExternalIBEConfigRow,
  ExternalIBEConfigUpdate,
  EffectiveExternalIBEConfig,
  ExternalIBEAnalyzeRequest,
  ExternalIBEAnalyzeResponse,
  ExternalIBEBulkMapResponse,
} from '@ibe/shared'
```

Then add the function:

```ts
export async function bulkMapExternalHotelIds(
  orgId: number,
  mappings: { propertyId: number; externalHotelId: string }[],
): Promise<ExternalIBEBulkMapResponse> {
  const orgProperties = await prisma.property.findMany({
    where: { organizationId: orgId },
    select: { propertyId: true, name: true },
  })
  const orgPropertyIds = new Set(orgProperties.map(p => p.propertyId))

  const errors: { propertyId: number; message: string }[] = []
  let updated = 0

  for (const { propertyId, externalHotelId } of mappings) {
    if (!orgPropertyIds.has(propertyId)) {
      errors.push({ propertyId, message: 'Property not found in this organisation' })
      continue
    }
    try {
      await upsertExternalIBEConfig({ propertyId }, { externalHotelId })
      updated++
    } catch (e) {
      errors.push({ propertyId, message: e instanceof Error ? e.message : 'Failed to save' })
    }
  }

  const configs = await prisma.externalIBEConfig.findMany({
    where: { propertyId: { in: Array.from(orgPropertyIds) } },
    select: { propertyId: true, externalHotelId: true },
  })
  const configMap = new Map(configs.map(c => [c.propertyId, c.externalHotelId]))

  const stillMissing = orgProperties
    .filter(p => !configMap.get(p.propertyId))
    .map(p => ({ propertyId: p.propertyId, name: p.name }))

  return { updated, errors, stillMissing }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/services/__tests__/external-ibe.service.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/external-ibe.service.ts apps/api/src/services/__tests__/external-ibe.service.test.ts
git commit -m "feat: add bulkMapExternalHotelIds service function"
```

---

## Task 3: Add API route

**Files:**
- Modify: `apps/api/src/routes/external-ibe.route.ts`

- [ ] **Step 1: Add `bulkMapExternalHotelIds` to the import at the top of the route file**

```ts
import {
  getExternalIBEConfig,
  upsertExternalIBEConfig,
  deleteExternalIBEConfig,
  analyzeExternalIBEUrls,
  getEffectiveExternalIBEConfig,
  buildExternalUrl,
  bulkMapExternalHotelIds,
} from '../services/external-ibe.service.js'
```

Also add `ExternalIBEBulkMapRequest` to the type import:

```ts
import type { ExternalIBEConfigUpdate, ExternalIBEAnalyzeRequest, ExternalIBETestResultItem, ExternalIBEBulkMapRequest } from '@ibe/shared'
```

- [ ] **Step 2: Add the route handler inside `externalIBERoutes`, after the DELETE route**

```ts
  fastify.post('/admin/external-ibe/bulk-map', async (request, reply) => {
    const { orgId, mappings } = request.body as ExternalIBEBulkMapRequest

    if (!orgId || !Array.isArray(mappings)) {
      return reply.status(400).send({ error: 'orgId and mappings are required' })
    }

    const admin = request.admin
    if (admin.role !== 'super' && admin.organizationId !== orgId) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    return reply.send(await bulkMapExternalHotelIds(orgId, mappings))
  })
```

- [ ] **Step 3: Type-check the API**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep "external-ibe"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/external-ibe.route.ts
git commit -m "feat: add POST /admin/external-ibe/bulk-map route"
```

---

## Task 4: Add xlsx dependency and API client method

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Install xlsx in the web app**

```bash
cd apps/web && pnpm add xlsx
```

Expected: `xlsx` appears in `apps/web/package.json` dependencies.

- [ ] **Step 2: Add `bulkMapExternalIBE` to the API client**

In `apps/web/src/lib/api-client.ts`, add to the imports from `@ibe/shared`:

```ts
import type {
  // ... existing imports ...
  ExternalIBEBulkMapRequest,
  ExternalIBEBulkMapResponse,
} from '@ibe/shared'
```

Then add the method after `testExternalIBECombinations`:

```ts
  bulkMapExternalIBE(req: ExternalIBEBulkMapRequest): Promise<ExternalIBEBulkMapResponse> {
    return apiRequest<ExternalIBEBulkMapResponse>('/api/v1/admin/external-ibe/bulk-map', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  },
```

- [ ] **Step 3: Type-check the web app**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "external-ibe\|bulkMap"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/src/lib/api-client.ts pnpm-lock.yaml
git commit -m "feat: add bulkMapExternalIBE API client method + xlsx dependency"
```

---

## Task 5: Add BulkMappingUpload UI component

**Files:**
- Modify: `apps/web/src/app/admin/config/external-ibe/page.tsx`

- [ ] **Step 1: Add xlsx import at the top of the page file**

```ts
import * as XLSX from 'xlsx'
```

- [ ] **Step 2: Add the `BulkMappingUpload` component**

Add this component before `FullTemplateUI` in the file:

```tsx
function BulkMappingUpload({ orgId }: { orgId: number }) {
  const [result, setResult] = useState<{
    updated: number
    errors: { propertyId: number; message: string }[]
    stillMissing: { propertyId: number; name: string }[]
  } | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function parseExcel(file: File): Promise<{ propertyId: number; externalHotelId: string }[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]!]!
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

          if (rows.length === 0) { reject(new Error('File is empty')); return }

          // Find column keys case-insensitively
          const sampleRow = rows[0]!
          const keys = Object.keys(sampleRow)
          const propKey = keys.find(k => k.toLowerCase().replace(/\s+/g, ' ').trim() === 'property id')
          const extKey  = keys.find(k => k.toLowerCase().replace(/\s+/g, ' ').trim() === 'external ibe id')

          if (!propKey) { reject(new Error('Missing required column: Property ID')); return }
          if (!extKey)  { reject(new Error('Missing required column: External IBE ID')); return }

          const mappings: { propertyId: number; externalHotelId: string }[] = []
          const errors: string[] = []

          rows.forEach((row, i) => {
            const rawId = row[propKey]
            const rawExt = String(row[extKey] ?? '').trim()
            if (!rawExt) return // skip blank external IDs
            const propertyId = parseInt(String(rawId), 10)
            if (isNaN(propertyId) || propertyId <= 0) {
              errors.push(`Row ${i + 2}: Property ID "${rawId}" is not a valid number`)
              return
            }
            mappings.push({ propertyId, externalHotelId: rawExt })
          })

          if (errors.length > 0) { reject(new Error(errors.join('\n'))); return }
          resolve(mappings)
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to parse file'))
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(file)
    })
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError(null)
    setResult(null)
    setLoading(true)

    try {
      const mappings = await parseExcel(file)
      const res = await apiClient.bulkMapExternalIBE({ orgId, mappings })
      setResult(res)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to process file')
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">Bulk Hotel ID Mapping</h3>
      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
        Upload an Excel file (.xlsx or .xls) with a header row containing at minimum two columns:{' '}
        <strong className="text-[var(--color-text)]">Property ID</strong> (HyperGuest numeric property ID) and{' '}
        <strong className="text-[var(--color-text)]">External IBE ID</strong>. A Hotel Name column is accepted but ignored.
        Each data row maps one hotel. Blank External IBE ID rows are skipped.
      </p>
      <div>
        <label className={[
          'inline-flex items-center gap-2 cursor-pointer rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors',
          loading ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}>
          <svg className="h-4 w-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {loading ? 'Uploading…' : 'Choose file'}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={handleFile}
            disabled={loading}
          />
        </label>
      </div>

      {parseError && (
        <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3">
          <p className="text-xs font-medium text-error whitespace-pre-line">{parseError}</p>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-success">Updated {result.updated} hotel{result.updated !== 1 ? 's' : ''}</p>

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-error mb-1">Errors</p>
              {result.errors.map(e => (
                <p key={e.propertyId} className="text-xs text-error">
                  Property {e.propertyId}: {e.message}
                </p>
              ))}
            </div>
          )}

          {result.stillMissing.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-amber-800 mb-1">
                Still missing External IBE ID ({result.stillMissing.length})
              </p>
              {result.stillMissing.map(h => (
                <p key={h.propertyId} className="text-xs text-amber-700">
                  {h.name} <span className="font-mono text-amber-600">(#{h.propertyId})</span>
                </p>
              ))}
            </div>
          )}

          {result.stillMissing.length === 0 && result.errors.length === 0 && (
            <p className="text-xs text-success">All hotels in the chain have an External IBE ID.</p>
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Wire `BulkMappingUpload` into `FullTemplateUI`**

In `FullTemplateUI`, the `scope` prop is `{ orgId?: number; propertyId?: number }`. Add the upload section at the very bottom of the returned JSX, after the delete button and the test section, but only when `scope` has an `orgId` (chain level):

Find the closing `</div>` of `FullTemplateUI`'s return and add before it:

```tsx
      {'orgId' in scope && (
        <BulkMappingUpload orgId={(scope as { orgId: number }).orgId} />
      )}
```

- [ ] **Step 4: Type-check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "external-ibe\|BulkMapping\|bulkMap"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/config/external-ibe/page.tsx
git commit -m "feat: add BulkMappingUpload component to chain External IBE page"
```

---

## Task 6: Rebuild shared dist and final type-check

- [ ] **Step 1: Rebuild shared**

```bash
cd packages/shared && npx tsc
```

- [ ] **Step 2: Full type-check across API and web**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | tail -5
cd apps/web && npx tsc --noEmit 2>&1 | tail -5
```

Expected: no errors in either.

- [ ] **Step 3: Run API tests**

```bash
cd apps/api && npx vitest run src/services/__tests__/external-ibe.service.test.ts 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 4: Final commit**

```bash
cd /path/to/repo && git add packages/shared/dist
git commit -m "chore: rebuild shared dist for bulk mapping types"
```
