# DataForSEO SERP Hotel Search — Design Spec

**Date:** 2026-05-28  
**Status:** Approved

## Problem

The current hotel search in the self-onboarding invitation flow uses Brave Search via Playwright. It is unreliable: rate-limited on dev IPs, requires a 40s timeout, and depends on a headless browser rendering a JS SPA. The fallback chain needs restructuring.

## Goal

Replace Brave Search as the primary search engine with DataForSEO's Google SERP API. Keep Brave as a last-resort fallback. The new priority order is:

1. Chain registry (instant, local)
2. DataForSEO SERP (Google organic via API, ~1-2s)
3. AI fallback (if no candidate scores ≥ 30)
4. Brave Search (last resort, only if AI also fails)

## Architecture

### New file: `apps/onboarding-api/src/services/dataforseo.service.ts`

Encapsulates all DataForSEO SERP logic for onboarding-api. Standalone — does not share code with `apps/api/src/adapters/dataforseo/client.ts`.

**Credentials:** reads `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` from env vars. If either is missing, returns `[]` immediately (graceful degradation — falls through to AI/Brave).

**Endpoint:** `POST https://api.dataforseo.com/v3/serp/google/organic/live/regular`

**Request body:**
```json
[{
  "keyword": "\"Hotel Name\" City Country official website -site:booking.com -site:tripadvisor.com -site:expedia.com -site:agoda.com -site:hotels.com -site:kayak.com",
  "location_code": 2840,
  "language_code": "en",
  "depth": 10
}]
```

- City and country are appended only when provided.
- `-site:` exclusions mirror the current Brave query exclusions.
- `depth: 10` returns up to 10 organic results.

**Response parsing:**
- `tasks[0].result[0].items` — each organic item has `url`, `title`, `description`
- Filter out items where `type !== 'organic'` 
- Apply existing `isOta()` blocklist (post-processing safety net)
- Apply existing `scoreCandidate()` for confidence scoring
- Run `detectKnownIBE()` per result
- Take screenshots per candidate (same as Brave path)
- Return `HotelCandidate[]` — same interface, no changes to consumers

**Timeout:** 15s `AbortSignal.timeout` — DataForSEO is synchronous and fast; no long wait needed.

**Error handling:** Any fetch error or non-20000 task status code returns `[]`. Never throws.

### `apps/onboarding-api/src/services/hotel-search.service.ts` — refactored

Split existing `searchHotels()` into two exported functions:

| Function | Does |
|---|---|
| `searchHotelsDataForSEO(hotelName, city, country)` | Chain registry check + DataForSEO SERP |
| `searchHotelsBrave(hotelName, city, country)` | Chain registry check + Brave Search (existing logic, unchanged) |

The chain registry check is shared — both functions detect the chain domain early, run the main search, then append the chain domain to results only if the main search didn't already surface it (score 65, same as today).

### `apps/onboarding-api` routes — add `/hotel-search/brave`

`hotel-search.route.ts` currently exposes `POST /hotel-search`. Add a second route:

| Route | Handler |
|---|---|
| `POST /hotel-search` | `searchHotelsDataForSEO()` |
| `POST /hotel-search/brave` | `searchHotelsBrave()` |

Both routes accept the same body `{ hotelName, city, country }` and return `{ candidates: HotelCandidate[] }`.

### `apps/api/src/routes/onboarding-admin.route.ts` — orchestration update

Replace the single `/hotel-search` call with a 4-step cascade:

```
1. POST /hotel-search (DataForSEO)
   → if any candidate.score ≥ 30 → return candidates

2. AI fallback (existing code, unchanged)
   → if AI returns a URL → push to candidates, return if score ≥ 30

3. POST /hotel-search/brave (Brave)
   → merge results, deduplicate by hostname
   → return merged candidates
```

Deduplication: when merging Brave results into existing candidates, skip any URL whose hostname already appears in the candidate list.

The 45s abort signal on the outer fetch is kept for Brave calls (Brave needs it). DataForSEO calls use a 15s signal.

## Data Flow

```
onboarding-admin.route.ts (apps/api)
  │
  ├─ POST /hotel-search → dataforseo.service.ts
  │     chain registry → DataForSEO SERP → score → screenshot
  │
  ├─ AI adapter (resolveAIConfig + getProviderAdapter) [if needed]
  │
  └─ POST /hotel-search/brave → hotel-search.service.ts (Brave path)
        chain registry → Brave Playwright → score → screenshot
```

## Files Changed

| File | Change |
|---|---|
| `apps/onboarding-api/src/services/dataforseo.service.ts` | New |
| `apps/onboarding-api/src/services/hotel-search.service.ts` | Refactor: split into two exported functions |
| `apps/onboarding-api/src/routes/hotel-search.route.ts` | Add `POST /hotel-search/brave` route |
| `apps/api/src/routes/onboarding-admin.route.ts` | Update orchestration: DataForSEO → AI → Brave |

## Environment Variables

| Var | Where | Purpose |
|---|---|---|
| `DATAFORSEO_LOGIN` | onboarding-api | DataForSEO Basic Auth login |
| `DATAFORSEO_PASSWORD` | onboarding-api | DataForSEO Basic Auth password |

These are the same vars already used by `apps/api`. Add them to the onboarding-api env on Render.

## No-Credentials Behaviour

If `DATAFORSEO_LOGIN` or `DATAFORSEO_PASSWORD` are absent, `dataforseo.service.ts` returns `[]`. The route proceeds directly to AI fallback, then Brave. The system degrades gracefully with no errors surfaced to the user.

## Out of Scope

- Moving the DataForSEO client to `packages/shared` (not needed — only onboarding-api uses SERP)
- Persisting SERP results
- Rate-limit handling beyond what DataForSEO manages server-side
