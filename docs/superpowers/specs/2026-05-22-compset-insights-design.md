# CompSet Insights & Actions — Design Spec

**Date:** 2026-05-22  
**Scope:** Property-level only  
**Status:** Approved

---

## Overview

A new **Insights & Actions** tab in Intelligence → CompSet surfaces AI-generated revenue management analysis based on the latest competitor comparison data. Analysis is persisted per property, user-triggered, and also shown as a compact card on the admin dashboard.

---

## Data Model

New Prisma model — one row per property, upserted on each analysis run:

```prisma
model CompSetInsight {
  id         Int      @id @default(autoincrement())
  propertyId Int      @unique
  analyzedAt DateTime
  content    String   @db.Text
  property   Property @relation(fields: [propertyId], references: [propertyId])
}
```

`content` is a JSON string with this shape:

```ts
interface InsightContent {
  summary: string                      // one-sentence headline for dashboard card
  pricingInsights: string[]
  competitorPositioning: string[]
  recommendedActions: string[]
  anomalies: string[]
  strategicRecommendations: string[]
}
```

**"New data" detection:** compare `max(CompSetResult.fetchedAt)` for the property against `CompSetInsight.analyzedAt`. If results are newer → new data is available.

---

## Backend

### Service: `compset-insight.service.ts`

| Function | Description |
|---|---|
| `getLatestInsight(propertyId)` | Fetch insight row from DB; returns `null` if none |
| `hasNewData(propertyId)` | Returns `true` if `max(results.fetchedAt) > insight.analyzedAt` (or no insight exists and results do) |
| `generateInsight(propertyId)` | Build prompt → call AI → parse JSON → upsert DB → return insight |

### Route group: `/api/v1/admin/intelligence/compset/insights`

All routes require admin authentication.

| Method | Path | Description |
|---|---|---|
| `GET` | `?propertyId=X` | Returns `{ insight: CompSetInsight \| null, hasNewData: boolean }` |
| `POST` | body `{ propertyId }` | Triggers generation, returns saved insight |

### Prompt construction (`generateInsight`)

1. Fetch `Property` row → name, location, star rating
2. Fetch all `CompSetResult` rows for property (same data as Excel export rows)
3. Fetch `CompSetSearchParam[]`, `CompSetCompetitor[]`, `CompSetRoomMapping[]`
4. Call `resolveAIConfig(propertyId)` → `getProviderAdapter(provider)` (existing pattern)
5. Build prompt:

```
You are a revenue management AI assistant.

I am the Revenue Manager of [Hotel Name], a [N]-star hotel located in [Location].

Below is our latest competitor rate comparison data from [Date].

Respond with ONLY a valid JSON object in this exact format — no markdown, no explanation:
{
  "summary": "One-sentence headline",
  "pricingInsights": ["..."],
  "competitorPositioning": ["..."],
  "recommendedActions": ["..."],
  "anomalies": ["..."],
  "strategicRecommendations": ["..."]
}

Competitor Data:
[formatted text table — same columns as Excel export minus Events]
```

6. Parse AI response as JSON. If parsing fails, store `{ summary: rawText, pricingInsights: [], ... }` as fallback.
7. Upsert `CompSetInsight` with `analyzedAt = now()`.

---

## Frontend

### Tab addition

Add `'Insights & Actions'` to the `TABS` array after `'Results'`:

```ts
const TABS = ['Results', 'Competitors', 'Search Configurations', 'Insights & Actions'] as const
```

### `InsightsSection` component

Props: `{ propertyId: number, orgId: number | null }`

**Data fetching:**
- `GET /insights?propertyId=X` — query key `['compset-insight', propertyId]`
- Refetch when `runStatus` transitions to `done` (existing run-status polling)

**States:**

| Condition | UI |
|---|---|
| No results exist at all | Grey empty state: "Run a competitor search first to enable analysis." |
| Results exist, no insight yet | Blue empty state + **Analyze** button |
| `hasNewData: true`, insight exists | Amber banner: *"New comparison results are available. Would you like me to analyze them?"* + **Analyze** button. Existing insight shown below. |
| `hasNewData: false`, insight exists | Insight cards shown, no banner |
| POST in flight | **Analyze** button → spinner, disabled |
| POST error | Inline error message, button re-enabled |

**Insight display (when content exists):**

Header row: *"Last analyzed: 22 May 2026, 14:32"*

Five section cards rendered vertically, each with icon + title + bulleted list:

| Section | Icon |
|---|---|
| Pricing Insights | 💰 |
| Competitor Positioning | 🏨 |
| Recommended Actions | ✅ |
| Anomalies | ⚠️ |
| Strategic Recommendations | 🎯 |

Empty arrays are hidden (not rendered).

### Dashboard card

Location: existing `/admin/dashboard/page.tsx`

- Only renders if `CompSetInsight` exists for the selected property
- Fetches from same `GET /insights?propertyId=X` endpoint
- Shows: `summary` headline, *"Analyzed: [date]"*, *"View Full Analysis →"* link to `/admin/intelligence/compset`
- Card is compact — same visual style as other dashboard summary cards

---

## Shared Types

Add to `packages/shared/src/types/compset.ts`:

```ts
export interface CompSetInsight {
  id: number
  propertyId: number
  analyzedAt: string
  content: InsightContent
}

export interface InsightContent {
  summary: string
  pricingInsights: string[]
  competitorPositioning: string[]
  recommendedActions: string[]
  anomalies: string[]
  strategicRecommendations: string[]
}

export interface CompSetInsightResponse {
  insight: CompSetInsight | null
  hasNewData: boolean
}
```

---

## Error Handling

- AI config not set for property/org → `POST` returns `400` with message *"AI not configured for this property"*
- AI provider call fails → `POST` returns `500`, frontend shows inline error
- JSON parse failure → fallback: store `{ summary: rawText, pricingInsights: [], competitorPositioning: [], recommendedActions: [], anomalies: [], strategicRecommendations: [] }`

---

## Out of Scope

- Chain-level analysis (property-only)
- Streaming (single response on completion)
- Scheduled/automatic analysis (user-trigger only)
- Analysis history / multiple snapshots per property
