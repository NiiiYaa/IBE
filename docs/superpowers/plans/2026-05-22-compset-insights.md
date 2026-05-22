# CompSet Insights & Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-powered "Insights & Actions" tab to the CompSet admin page that generates persisted, structured revenue-management analysis from competitor data, and surfaces a summary card on the dashboard.

**Architecture:** A new `CompSetInsight` DB model (one row per property, upserted) stores AI-generated JSON. A new service `compset-insight.service.ts` handles detection of new data, prompt construction, AI invocation (via the existing provider-adapter pattern), and persistence. Two new API routes (GET + POST) are added to the existing `compset.route.ts`. The frontend adds a fourth tab `Insights & Actions` with an `InsightsSection` component, plus a compact card in the dashboard.

**Tech Stack:** Prisma (SQLite/Postgres), Fastify, React + TanStack Query, existing AI adapter pattern (`resolveAIConfig` + `getProviderAdapter`), `@ibe/shared` types.

---

## File Map

| Action | File |
|---|---|
| **Create** | `apps/api/src/services/compset-insight.service.ts` |
| **Create** | `apps/api/src/services/__tests__/compset-insight.service.test.ts` |
| **Modify** | `apps/api/prisma/schema.prisma` |
| **Modify** | `apps/api/src/routes/compset.route.ts` |
| **Modify** | `packages/shared/src/types/compset.ts` |
| **Modify** | `apps/web/src/lib/api-client.ts` |
| **Modify** | `apps/web/src/app/admin/intelligence/compset/page.tsx` |
| **Modify** | `apps/web/src/app/admin/dashboard/page.tsx` |

---

## Task 1: Shared Types

**Files:**
- Modify: `packages/shared/src/types/compset.ts`

No migration or tests needed — pure type definitions.

- [ ] **Step 1: Add types to compset.ts**

Append to the end of `packages/shared/src/types/compset.ts`:

```ts
export interface InsightContent {
  summary: string
  pricingInsights: string[]
  competitorPositioning: string[]
  recommendedActions: string[]
  anomalies: string[]
  strategicRecommendations: string[]
}

export interface CompSetInsight {
  id: number
  propertyId: number
  analyzedAt: string
  content: InsightContent
}

export interface CompSetInsightResponse {
  insight: CompSetInsight | null
  hasNewData: boolean
  hasResults: boolean
}
```

- [ ] **Step 2: Verify the shared package builds**

```bash
cd packages/shared && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/compset.ts
git commit -m "feat(compset): add InsightContent, CompSetInsight, CompSetInsightResponse shared types"
```

---

## Task 2: Database Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the model to schema.prisma**

Add after the existing `CompSetResult` model block. Also add the relation line to the `Property` model.

In the `Property` model, after `compSetResults CompSetResult[]`, add:
```prisma
  compSetInsight      CompSetInsight?
```

Then add the new model:
```prisma
model CompSetInsight {
  id         Int      @id @default(autoincrement())
  propertyId Int      @unique
  analyzedAt DateTime
  content    String   @db.Text

  property Property @relation(fields: [propertyId], references: [propertyId])
}
```

- [ ] **Step 2: Run the migration**

```bash
cd apps/api && npx prisma migrate dev --name add_compset_insight
```

Expected: prints `The following migration(s) have been applied: .../add_compset_insight/migration.sql`.

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(compset): add CompSetInsight DB model"
```

---

## Task 3: Service Tests (failing)

**Files:**
- Create: `apps/api/src/services/__tests__/compset-insight.service.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    compSetInsight: { findUnique: vi.fn(), upsert: vi.fn() },
    compSetResult: { findFirst: vi.fn(), findMany: vi.fn() },
    property: { findUnique: vi.fn() },
  },
}))

vi.mock('../ai-config.service.js', () => ({
  resolveAIConfig: vi.fn(),
}))

vi.mock('../../ai/adapters/index.js', () => ({
  getProviderAdapter: vi.fn(),
}))

vi.mock('../static.service.js', () => ({
  getPropertyDetail: vi.fn(),
}))

import { prisma } from '../../db/client.js'
import { resolveAIConfig } from '../ai-config.service.js'
import { getProviderAdapter } from '../../ai/adapters/index.js'
import { getPropertyDetail } from '../static.service.js'
import {
  getLatestInsight,
  hasNewData,
  generateInsight,
} from '../compset-insight.service.js'

const mp = prisma as any
const mockResolveAI = resolveAIConfig as ReturnType<typeof vi.fn>
const mockGetAdapter = getProviderAdapter as ReturnType<typeof vi.fn>
const mockGetDetail = getPropertyDetail as ReturnType<typeof vi.fn>

beforeEach(() => { vi.clearAllMocks() })

// ── getLatestInsight ─────────────────────────────────────────────────────────

describe('getLatestInsight', () => {
  it('returns null when no row exists', async () => {
    mp.compSetInsight.findUnique.mockResolvedValue(null)
    expect(await getLatestInsight(1)).toBeNull()
  })

  it('parses content JSON and returns typed insight', async () => {
    const content = { summary: 'Test', pricingInsights: ['A'], competitorPositioning: [], recommendedActions: [], anomalies: [], strategicRecommendations: [] }
    mp.compSetInsight.findUnique.mockResolvedValue({
      id: 1, propertyId: 1, analyzedAt: new Date('2026-05-22T10:00:00Z'), content: JSON.stringify(content),
    })
    const result = await getLatestInsight(1)
    expect(result).not.toBeNull()
    expect(result!.content.summary).toBe('Test')
    expect(result!.content.pricingInsights).toEqual(['A'])
    expect(result!.analyzedAt).toBe('2026-05-22T10:00:00.000Z')
  })

  it('falls back gracefully if content is invalid JSON', async () => {
    mp.compSetInsight.findUnique.mockResolvedValue({
      id: 1, propertyId: 1, analyzedAt: new Date(), content: 'not json',
    })
    const result = await getLatestInsight(1)
    expect(result).not.toBeNull()
    expect(result!.content.summary).toBe('not json')
    expect(result!.content.pricingInsights).toEqual([])
  })
})

// ── hasNewData ────────────────────────────────────────────────────────────────

describe('hasNewData', () => {
  it('returns false when no results exist', async () => {
    mp.compSetResult.findFirst.mockResolvedValue(null)
    expect(await hasNewData(1)).toBe(false)
  })

  it('returns true when results exist but no insight', async () => {
    mp.compSetResult.findFirst.mockResolvedValue({ fetchedAt: new Date() })
    mp.compSetInsight.findUnique.mockResolvedValue(null)
    expect(await hasNewData(1)).toBe(true)
  })

  it('returns true when latest result is newer than insight', async () => {
    const insightDate = new Date('2026-05-20T00:00:00Z')
    const resultDate = new Date('2026-05-22T00:00:00Z')
    mp.compSetResult.findFirst.mockResolvedValue({ fetchedAt: resultDate })
    mp.compSetInsight.findUnique.mockResolvedValue({ analyzedAt: insightDate })
    expect(await hasNewData(1)).toBe(true)
  })

  it('returns false when insight is newer than latest result', async () => {
    const insightDate = new Date('2026-05-22T00:00:00Z')
    const resultDate = new Date('2026-05-20T00:00:00Z')
    mp.compSetResult.findFirst.mockResolvedValue({ fetchedAt: resultDate })
    mp.compSetInsight.findUnique.mockResolvedValue({ analyzedAt: insightDate })
    expect(await hasNewData(1)).toBe(false)
  })
})

// ── generateInsight ───────────────────────────────────────────────────────────

describe('generateInsight', () => {
  it('throws when AI is not configured', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5, name: 'Hotel X' })
    mockResolveAI.mockResolvedValue(null)
    await expect(generateInsight(1)).rejects.toThrow('AI not configured')
  })

  it('upserts parsed JSON content on success', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5, name: 'Hotel X' })
    mockResolveAI.mockResolvedValue({ provider: 'fake', apiKey: 'k', model: 'm' })
    mockGetDetail.mockResolvedValue({ name: 'Hotel X', starRating: 5, location: { city: 'Berlin', countryCode: 'DE' } })
    mp.compSetResult.findMany.mockResolvedValue([])
    const content = { summary: 'Good rates', pricingInsights: ['p1'], competitorPositioning: [], recommendedActions: [], anomalies: [], strategicRecommendations: [] }
    const mockAdapter = { call: vi.fn().mockResolvedValue({ text: JSON.stringify(content), stopReason: 'end', toolCalls: [] }) }
    mockGetAdapter.mockReturnValue(mockAdapter)
    mp.compSetInsight.upsert.mockResolvedValue({ id: 1, propertyId: 1, analyzedAt: new Date(), content: JSON.stringify(content) })

    const result = await generateInsight(1)
    expect(mp.compSetInsight.upsert).toHaveBeenCalledOnce()
    expect(result.content.summary).toBe('Good rates')
  })

  it('stores fallback when AI returns non-JSON', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5, name: 'Hotel X' })
    mockResolveAI.mockResolvedValue({ provider: 'fake', apiKey: 'k', model: 'm' })
    mockGetDetail.mockRejectedValue(new Error('HG unavailable'))
    mp.compSetResult.findMany.mockResolvedValue([])
    const mockAdapter = { call: vi.fn().mockResolvedValue({ text: 'Some prose analysis', stopReason: 'end', toolCalls: [] }) }
    mockGetAdapter.mockReturnValue(mockAdapter)
    const fallbackContent = { summary: 'Some prose analysis', pricingInsights: [], competitorPositioning: [], recommendedActions: [], anomalies: [], strategicRecommendations: [] }
    mp.compSetInsight.upsert.mockResolvedValue({ id: 1, propertyId: 1, analyzedAt: new Date(), content: JSON.stringify(fallbackContent) })

    const result = await generateInsight(1)
    expect(result.content.summary).toBe('Some prose analysis')
    expect(result.content.pricingInsights).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/api && npx vitest run src/services/__tests__/compset-insight.service.test.ts
```

Expected: FAIL — `Cannot find module '../compset-insight.service.js'`

---

## Task 4: Service Implementation

**Files:**
- Create: `apps/api/src/services/compset-insight.service.ts`

- [ ] **Step 1: Create the service file**

```ts
import { prisma } from '../db/client.js'
import { resolveAIConfig } from './ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import { getPropertyDetail } from './static.service.js'
import { logger } from '../utils/logger.js'
import type { CompSetInsight, InsightContent } from '@ibe/shared'

function rowToInsight(row: { id: number; propertyId: number; analyzedAt: Date; content: string }): CompSetInsight {
  let content: InsightContent
  try {
    content = JSON.parse(row.content) as InsightContent
  } catch {
    content = { summary: row.content.slice(0, 500), pricingInsights: [], competitorPositioning: [], recommendedActions: [], anomalies: [], strategicRecommendations: [] }
  }
  return { id: row.id, propertyId: row.propertyId, analyzedAt: row.analyzedAt.toISOString(), content }
}

export async function getLatestInsight(propertyId: number): Promise<CompSetInsight | null> {
  const row = await prisma.compSetInsight.findUnique({ where: { propertyId } })
  return row ? rowToInsight(row) : null
}

export async function hasNewData(propertyId: number): Promise<boolean> {
  const latest = await prisma.compSetResult.findFirst({
    where: { propertyId },
    orderBy: { fetchedAt: 'desc' },
    select: { fetchedAt: true },
  })
  if (!latest) return false
  const insight = await prisma.compSetInsight.findUnique({ where: { propertyId }, select: { analyzedAt: true } })
  if (!insight) return true
  return latest.fetchedAt > insight.analyzedAt
}

function buildDataTable(
  results: Array<{ searchParamId: number; competitorId: number | null; checkIn: string; checkOut: string; roomName: string | null; board: string | null; cancellation: string | null; searchStatus: string; pricePerNight: number | null; total: number | null; currency: string | null }>,
  params: Array<{ id: number; label: string }>,
  competitors: Array<{ id: number; name: string }>,
): string {
  const today = new Date().toISOString().split('T')[0]!
  const fresh = results.filter(r => r.checkIn >= today)
  if (fresh.length === 0) return '(no current comparison data)'

  const paramById = new Map(params.map(p => [p.id, p]))
  const compById = new Map(competitors.map(c => [c.id, c]))

  const header = 'Pattern | Check-in | Check-out | Competitor | Room | Board | Cancellation | Status | Price/Night | Total | Currency'
  const rows = fresh.map(r => [
    paramById.get(r.searchParamId)?.label ?? `Config #${r.searchParamId}`,
    r.checkIn,
    r.checkOut,
    r.competitorId === null ? 'My Hotel' : (compById.get(r.competitorId)?.name ?? `Competitor ${r.competitorId}`),
    r.roomName ?? '',
    r.board ?? '',
    r.cancellation ?? '',
    r.searchStatus,
    r.pricePerNight ?? '',
    r.total ?? '',
    r.currency ?? '',
  ].join(' | '))

  return [header, ...rows].join('\n')
}

export async function generateInsight(propertyId: number): Promise<CompSetInsight> {
  const property = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true, name: true },
  })
  if (!property) throw new Error(`Property ${propertyId} not found`)

  const aiConfig = await resolveAIConfig(propertyId, property.organizationId)
  if (!aiConfig) throw new Error('AI not configured for this property')

  // Hotel context from HyperGuest (fallback to DB name)
  let hotelName = property.name ?? `Property ${propertyId}`
  let hotelCity = ''
  let hotelCountry = ''
  let starRating = 0
  try {
    const detail = await getPropertyDetail(propertyId)
    hotelName = detail.name
    hotelCity = detail.location.city
    hotelCountry = detail.location.countryCode
    starRating = detail.starRating
  } catch (err) {
    logger.warn({ err, propertyId }, '[CompSetInsight] Could not fetch property detail, using DB name')
  }

  const [results, params, competitors] = await Promise.all([
    prisma.compSetResult.findMany({ where: { propertyId } }),
    prisma.compSetSearchParam.findMany({ where: { propertyId } }),
    prisma.compSetCompetitor.findMany({ where: { propertyId } }),
  ])

  const dataTable = buildDataTable(results, params, competitors)
  const starStr = starRating > 0 ? `${starRating}-star ` : ''
  const locationStr = [hotelCity, hotelCountry].filter(Boolean).join(', ')
  const hotelContext = locationStr ? `${hotelName}, a ${starStr}hotel located in ${locationStr}` : `${hotelName}`
  const fetchedDate = results[0]
    ? new Date(results[0].fetchedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'today'

  const prompt = `You are a revenue management AI assistant.

I am the Revenue Manager of ${hotelContext}.

Below is our latest competitor rate comparison data fetched on ${fetchedDate}.

Respond with ONLY a valid JSON object in this exact format — no markdown fences, no explanation outside the JSON:
{
  "summary": "One-sentence headline summarizing the single most important finding",
  "pricingInsights": ["bullet 1", "bullet 2"],
  "competitorPositioning": ["bullet 1"],
  "recommendedActions": ["bullet 1", "bullet 2"],
  "anomalies": ["bullet 1"],
  "strategicRecommendations": ["bullet 1"]
}

Each array may have 1–5 items. Omit a key only if there is genuinely nothing to say (use an empty array otherwise).

Competitor Data:
${dataTable}`

  const adapter = getProviderAdapter(aiConfig.provider)
  const response = await adapter.call(
    [{ role: 'user', content: prompt }],
    [],
    'You are a revenue management AI assistant. Return only valid JSON with no markdown fences.',
    aiConfig.apiKey,
    aiConfig.model,
  )

  const rawText = response.text ?? ''
  let content: InsightContent
  try {
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    content = JSON.parse(jsonText) as InsightContent
  } catch {
    logger.warn({ propertyId }, '[CompSetInsight] AI response was not valid JSON, storing fallback')
    content = { summary: rawText.slice(0, 500), pricingInsights: [], competitorPositioning: [], recommendedActions: [], anomalies: [], strategicRecommendations: [] }
  }

  const now = new Date()
  const row = await prisma.compSetInsight.upsert({
    where: { propertyId },
    create: { propertyId, analyzedAt: now, content: JSON.stringify(content) },
    update: { analyzedAt: now, content: JSON.stringify(content) },
  })

  logger.info({ propertyId }, '[CompSetInsight] Analysis stored')
  return rowToInsight(row)
}
```

- [ ] **Step 2: Run the tests — verify they pass**

```bash
cd apps/api && npx vitest run src/services/__tests__/compset-insight.service.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/compset-insight.service.ts \
        apps/api/src/services/__tests__/compset-insight.service.test.ts
git commit -m "feat(compset): add compset-insight service with getLatestInsight, hasNewData, generateInsight"
```

---

## Task 5: API Routes

**Files:**
- Modify: `apps/api/src/routes/compset.route.ts`

- [ ] **Step 1: Add imports to compset.route.ts**

At the top of `apps/api/src/routes/compset.route.ts`, after the existing imports, add:

```ts
import { getLatestInsight, hasNewData, generateInsight } from '../services/compset-insight.service.js'
```

- [ ] **Step 2: Add GET and POST routes**

Inside the `compsetRoutes` function, append before the closing `}`:

```ts
  // GET /admin/intelligence/compset/insights?propertyId=X
  fastify.get('/admin/intelligence/compset/insights', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = parseInt(query.propertyId ?? '', 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })

    const [insight, newData, latestResult] = await Promise.all([
      getLatestInsight(propertyId),
      hasNewData(propertyId),
      prisma.compSetResult.findFirst({ where: { propertyId }, select: { id: true } }),
    ])

    return reply.send({ insight, hasNewData: newData, hasResults: latestResult !== null })
  })

  // POST /admin/intelligence/compset/insights
  fastify.post('/admin/intelligence/compset/insights', async (request, reply) => {
    const body = request.body as { propertyId?: number }
    const propertyId = typeof body.propertyId === 'number' ? body.propertyId : parseInt(String(body.propertyId ?? ''), 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })

    try {
      const insight = await generateInsight(propertyId)
      return reply.send(insight)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Generation failed'
      if (msg.includes('AI not configured')) return reply.status(400).send({ error: msg })
      return reply.status(500).send({ error: msg })
    }
  })
```

- [ ] **Step 3: Verify the API type-checks**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/compset.route.ts
git commit -m "feat(compset): add GET/POST /insights routes"
```

---

## Task 6: API Client Methods

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add CompSetInsightResponse to the imports**

Find the existing compset type import block in `apps/web/src/lib/api-client.ts` (search for `CompSetResult`) and add `CompSetInsight, CompSetInsightResponse` to it.

- [ ] **Step 2: Add the two methods**

Find the `autoCompSetRoomMappings` method (the last compset method before the Event Calendar comment). After it, add:

```ts
  getCompSetInsight(propertyId: number): Promise<CompSetInsightResponse> {
    return apiRequest(`/api/v1/admin/intelligence/compset/insights?propertyId=${propertyId}`)
  },

  generateCompSetInsight(propertyId: number): Promise<CompSetInsight> {
    return apiRequest('/api/v1/admin/intelligence/compset/insights', {
      method: 'POST',
      body: JSON.stringify({ propertyId }),
    })
  },
```

- [ ] **Step 3: Type-check the web app**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "error|api-client" | head -20
```

Expected: no new errors related to api-client.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat(compset): add getCompSetInsight and generateCompSetInsight api-client methods"
```

---

## Task 7: Insights Tab UI

**Files:**
- Modify: `apps/web/src/app/admin/intelligence/compset/page.tsx`

- [ ] **Step 1: Add new types to the import block**

Find the existing type import from `@ibe/shared` at the top of `compset/page.tsx` (the block containing `CompSetResult`). Add `InsightContent, CompSetInsight, CompSetInsightResponse` to that import.

- [ ] **Step 2: Add the TABS entry**

Find:
```ts
const TABS = ['Results', 'Competitors', 'Search Configurations'] as const
```

Replace with:
```ts
const TABS = ['Results', 'Competitors', 'Search Configurations', 'Insights & Actions'] as const
```

- [ ] **Step 3: Add InsightsSection component**

Add this component before the `export default function CompSetPage()` line:

```tsx
const INSIGHT_SECTIONS: Array<{ key: keyof InsightContent; title: string; icon: string }> = [
  { key: 'pricingInsights',          title: 'Pricing Insights',           icon: '💰' },
  { key: 'competitorPositioning',    title: 'Competitor Positioning',     icon: '🏨' },
  { key: 'recommendedActions',       title: 'Recommended Actions',        icon: '✅' },
  { key: 'anomalies',                title: 'Anomalies',                  icon: '⚠️' },
  { key: 'strategicRecommendations', title: 'Strategic Recommendations',  icon: '🎯' },
]

function InsightsSection({ propertyId }: { propertyId: number }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const insightQuery = useQuery({
    queryKey: ['compset-insight', propertyId],
    queryFn: () => apiClient.getCompSetInsight(propertyId),
  })

  const data = insightQuery.data
  const insight: CompSetInsight | null = data?.insight ?? null
  const hasNewData = data?.hasNewData ?? false
  const hasResults = data?.hasResults ?? false

  async function handleAnalyze() {
    setIsGenerating(true)
    setGenError(null)
    try {
      await apiClient.generateCompSetInsight(propertyId)
      await queryClient.invalidateQueries({ queryKey: ['compset-insight', propertyId] })
    } catch {
      setGenError('Analysis failed. Please check your AI configuration and try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  if (insightQuery.isLoading) return null

  return (
    <section className="space-y-4">
      {/* No results at all */}
      {!hasResults && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Run a competitor search first to enable analysis.</p>
        </div>
      )}

      {/* New data banner */}
      {hasNewData && hasResults && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            {insight ? 'New comparison results are available. Would you like me to analyze them?' : 'Comparison data is ready. Would you like me to generate an analysis?'}
          </p>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={isGenerating}
            className="flex-shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {isGenerating ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      )}

      {/* Error */}
      {genError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{genError}</p>
      )}

      {/* Insight content */}
      {insight && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            Last analyzed:{' '}
            {new Date(insight.analyzedAt).toLocaleString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </p>

          {INSIGHT_SECTIONS.map(({ key, title, icon }) => {
            const items = insight.content[key] as string[]
            if (!items || items.length === 0) return null
            return (
              <div key={key} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="mb-3 text-sm font-semibold text-[var(--color-text)]">{icon} {title}</p>
                <ul className="space-y-1.5">
                  {items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[var(--color-text)]">
                      <span className="mt-0.5 text-[var(--color-text-muted)]">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Add the tab render block**

Find the closing of the last tab block in `CompSetPage` (the `{/* Tab: Results */}` block ends with `</main>`). Before `</main>`, add:

```tsx
      {/* Tab: Insights & Actions */}
      {activeTab === 'Insights & Actions' && (
        propertyId !== null ? (
          <InsightsSection propertyId={propertyId} />
        ) : (
          <p className="text-sm text-[var(--color-text-muted)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            Select a property to view insights.
          </p>
        )
      )}
```

- [ ] **Step 5: Type-check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "compset" | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/intelligence/compset/page.tsx
git commit -m "feat(compset): add Insights & Actions tab with InsightsSection component"
```

---

## Task 8: Dashboard Card

**Files:**
- Modify: `apps/web/src/app/admin/dashboard/page.tsx`

- [ ] **Step 1: Add CompSetInsightResponse to dashboard imports**

At the top of `apps/web/src/app/admin/dashboard/page.tsx`, add `CompSetInsightResponse` to the existing `@ibe/shared` import (alongside `DashboardStats`, etc.).

- [ ] **Step 2: Add CompSet Insights to SECTIONS**

Find `const SECTIONS = [` and add a new entry after `'events'`:

```ts
  { id: 'compset-insights', label: 'CompSet Insights' },
```

- [ ] **Step 3: Add the CompSetInsightsCard component**

Add this component before the `export default function DashboardPage()` function:

```tsx
function CompSetInsightsCard({ propertyId }: { propertyId: number }) {
  const insightQuery = useQuery({
    queryKey: ['compset-insight', propertyId],
    queryFn: () => apiClient.getCompSetInsight(propertyId),
    staleTime: 2 * 60_000,
  })

  const insight = insightQuery.data?.insight
  if (!insight) return null

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">CompSet Analysis</p>
          <p className="text-sm font-medium text-[var(--color-text)]">{insight.content.summary}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Analyzed{' '}
            {new Date(insight.analyzedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </div>
      <a
        href="/admin/intelligence/compset"
        className="inline-block text-xs font-medium text-[var(--color-primary)] hover:underline"
      >
        View Full Analysis →
      </a>
    </div>
  )
}
```

- [ ] **Step 4: Render the card in the dashboard**

Find `{visibleSections.has('events') && (` in the dashboard JSX and after its closing `)}`, add:

```tsx
      {/* CompSet Insights */}
      {visibleSections.has('compset-insights') && propertyId !== null && (
        <div className="space-y-3">
          <SectionTitle>CompSet Insights</SectionTitle>
          <CompSetInsightsCard propertyId={propertyId} />
        </div>
      )}
```

- [ ] **Step 5: Type-check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "dashboard" | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/dashboard/page.tsx
git commit -m "feat(dashboard): add CompSet Insights summary card"
```

---

## Task 9: Full Test Run & Verification

- [ ] **Step 1: Run all API tests**

```bash
cd apps/api && npx vitest run
```

Expected: all tests pass including the new compset-insight suite.

- [ ] **Step 2: Start dev servers and verify end-to-end**

In one terminal:
```bash
cd apps/api && npm run dev
```

In another:
```bash
cd apps/web && npm run dev
```

- [ ] **Step 3: Verify tab appears**

Navigate to `Intelligence → CompSet`. Confirm four tabs are visible: Results, Competitors, Search Configurations, Insights & Actions.

- [ ] **Step 4: Verify no-results state**

Click "Insights & Actions" with a property that has no results yet. Expected: *"Run a competitor search first to enable analysis."*

- [ ] **Step 5: Verify banner with results**

Use a property with existing CompSet results. Expected: amber banner with *"Comparison data is ready. Would you like me to generate an analysis?"* and an **Analyze** button.

- [ ] **Step 6: Trigger analysis**

Click **Analyze**. Expected: button shows *"Analyzing…"*, then the five insight section cards appear with the analysis timestamp.

- [ ] **Step 7: Verify no-new-data state**

Reload the tab without running a new search. Expected: no banner, only the insight cards.

- [ ] **Step 8: Verify dashboard card**

Navigate to the Dashboard. Expected: "CompSet Insights" section shows the summary headline and a "View Full Analysis →" link. Only visible when a property is selected and an insight exists.

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat(compset): Insights & Actions tab + dashboard card — complete"
```
