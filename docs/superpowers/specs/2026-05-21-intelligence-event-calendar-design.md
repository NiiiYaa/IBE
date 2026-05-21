# Intelligence — Event Calendar

**Date:** 2026-05-21  
**Scope:** Full feature. Covers nav addition, system/property config, AI-based event discovery, cron + manual + CompSet-triggered refresh, per-property and chain-level admin UI, and the API surface consumed by the CompSet results table (Sub-project 2).

---

## Overview

The **Event Calendar** feature gives hotel admins visibility into events happening near their property over a configurable time horizon. Events are discovered via a single AI call using the hotel's existing AI provider configuration — no additional API keys required. Providers with live web search capability (Perplexity sonar, Gemini with grounding) return current event data; others fall back to training knowledge.

Events are stored in the database and refreshed on three triggers: a nightly cron, a manual admin action, and automatically at the end of every CompSet collection run. The CompSet results table (Sub-project 2) reads from the same event store to show an **Events** column alongside rate data.

---

## 1. Navigation & Module Structure

**Event Calendar** is added to the Intelligence nav after CompSet:

- **System level** (super admin, no org/property selected): system config panel — enable toggle, default radius (km), cron schedule.
- **Chain level** (org selected, no property): combined view of all chain properties' upcoming events, grouped by property. Read-only. "Refresh All" button triggers a run for all chain properties.
- **Property level** (property selected): full event list for that property + radius override input + manual Refresh button with date range picker.

The page uses the same `useAdminProperty` context as the CompSet page.

---

## 2. Data Model

Three new Prisma models added to `apps/api/prisma/schema.prisma`.

### `SystemEventCalendarConfig`
Singleton. Super admin only.

```prisma
model SystemEventCalendarConfig {
  id             Int      @id @default(autoincrement())
  enabled        Boolean  @default(false)
  defaultRadiusKm Int     @default(50)
  cronSchedule   String   @default("0 4 * * *")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

### `PropertyEventCalendarConfig`
Per-property overrides. Created on first save.

```prisma
model PropertyEventCalendarConfig {
  id         Int      @id @default(autoincrement())
  propertyId Int      @unique
  radiusKm   Int?     // null = inherit system default
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  property Property @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade)
}
```

### `EventCalendarEvent`
Stored events per property per fetch window. Replaced on each refresh (same pattern as `CompSetResult`). No `updatedAt` — append-only log.

```prisma
model EventCalendarEvent {
  id                Int      @id @default(autoincrement())
  propertyId        Int
  fetchedAt         DateTime
  periodStart       String   // YYYY-MM-DD — start of the window this fetch covered
  periodEnd         String   // YYYY-MM-DD — end of the window
  name              String
  startDate         String   // YYYY-MM-DD
  endDate           String   // YYYY-MM-DD
  description       String
  demandLevel       String   // 'high' | 'medium' | 'low'
  demandDescription String
  createdAt         DateTime @default(now())

  property Property @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade)

  @@index([propertyId, startDate, endDate])
}
```

**Property model additions:**
```prisma
  eventCalendarConfig  PropertyEventCalendarConfig?
  eventCalendarEvents  EventCalendarEvent[]
```

---

## 3. Event Discovery

**File:** `apps/api/src/services/event-calendar-fetch.service.ts`  
**Entry point:** `refreshPropertyEvents(propertyId: number, periodStart: string, periodEnd: string): Promise<void>`

### Flow

1. Fetch the property's `organizationId` from the DB.
2. Resolve AI config via `resolveAIConfig(propertyId, orgId)`. If no AI config, log and return early.
3. Fetch hotel location via `fetchPropertyStatic(propertyId)` → `coordinates.latitude`, `coordinates.longitude`, `location.city`, `location.countryCode`.
4. Resolve effective radius: `PropertyEventCalendarConfig.radiusKm ?? SystemEventCalendarConfig.defaultRadiusKm ?? 50`.
5. Build and send AI prompt (see below).
6. Parse JSON response → validate each event object has the required fields.
7. Delete **all** existing `EventCalendarEvent` rows for this `propertyId` (same replace-on-refresh pattern as `CompSetResult`).
8. Bulk-insert fresh events via `createMany`. If parsing fails or response is empty, insert zero rows (no crash).

### AI Prompt

```
System: You are a hotel demand intelligence assistant. Return only valid JSON with no surrounding text.

User: Find events (concerts, conferences, sports tournaments, festivals, public holidays, major exhibitions, trade shows) happening within {radiusKm}km of {city}, {countryCode} (coordinates: {latitude}, {longitude}) between {periodStart} and {periodEnd}.

Search the web for current, accurate information.

Return a JSON array where each object has exactly these keys:
- name (string)
- startDate (YYYY-MM-DD)
- endDate (YYYY-MM-DD)
- description (string, 1–2 sentences)
- demandLevel ("high", "medium", or "low")
- demandDescription (string, 1 sentence explaining expected traveler impact)

Return only the JSON array, no surrounding text. If no events are found, return an empty array [].
```

### Error Handling

- AI parse errors → log warning, store zero events, continue.
- `fetchPropertyStatic` failure → log warning, return early.
- No AI config → log info, return early (not an error).
- Individual malformed event objects are skipped; valid ones are saved.

---

## 4. Refresh Triggers & Cron

All three triggers call the same `refreshPropertyEvents` entry point.

### Manual
`POST /admin/intelligence/event-calendar/run?propertyId=N&from=YYYY-MM-DD&to=YYYY-MM-DD`

Fires `refreshPropertyEvents` as a background Promise (non-blocking), returns `{ started: true }` immediately. `from`/`to` default to today and today+30 if omitted. Frontend polls `GET /events` every 2 seconds until `fetchedAt` changes.

### Cron
`apps/api/src/services/event-calendar-cron.service.ts` — follows the same pattern as `compset-cron.service.ts`:

- Registered in `server.ts` at startup alongside existing crons.
- Reads `SystemEventCalendarConfig.enabled` on each run — skips if false.
- Iterates all properties that have at least one `PropertyEventCalendarConfig` row or at least one `CompSetCompetitor` (reuses `getActivePropertyIds` from `compset.service.ts`).
- Fetches next 30 days from today for each property.
- Per-property errors are non-fatal.
- Uses `noOverlap: true`.

### CompSet Trigger
At the end of `runPropertyCompSet(propertyId)` in `compset-collect.service.ts`, after results are stored, call:

```typescript
const minCheckIn = params.reduce((min, p) => p.checkIn < min ? p.checkIn : min, params[0].checkIn)
const maxCheckOut = params.reduce((max, p) => p.checkOut > max ? p.checkOut : max, params[0].checkOut)
await refreshPropertyEvents(propertyId, minCheckIn, maxCheckOut).catch(err =>
  logger.warn({ err, propertyId }, '[EventCalendar] Post-CompSet event refresh failed (non-fatal)')
)
```

This ensures events are always in sync with the CompSet search dates.

---

## 5. CompSet Integration

The `EventCalendarEvent` table is the shared data store. The CompSet results table (Sub-project 2) reads from it directly — no extra fetch at display time.

**Overlap query:** For a given search date window `[checkIn, checkOut]`, events are fetched where:
```
propertyId = N AND startDate <= checkOut AND endDate >= checkIn
```

**API endpoint used by CompSet table:** `GET /admin/intelligence/event-calendar/events?propertyId=N&from=YYYY-MM-DD&to=YYYY-MM-DD`

The CompSet results page calls this once with the full date span of all search params and groups events client-side by date. Implementation of the Events column itself is deferred to CompSet Sub-project 2.

---

## 6. Admin UI

**File:** `apps/web/src/app/admin/intelligence/event-calendar/page.tsx`

### System Config Panel (super admin, system level only)
- Enable toggle
- Default radius input (km, number)
- Cron schedule input
- SaveBar with dirty tracking

### Property Level
- **Radius override:** number input with system default shown as placeholder. Empty = inherit.
- **Refresh button:** opens inline date picker (default: today → today+30 days). On submit, triggers `POST /run`, shows spinner. Polls `GET /events` every 2s until `fetchedAt` updates, then re-renders the list.
- **Last fetched:** timestamp above the event list (from the most recent `fetchedAt` value).
- **Event cards:** sorted by `startDate`. Each card shows:
  - Event name + date range (e.g. "May 24–26")
  - Description
  - Demand badge: `High` (red) / `Medium` (amber) / `Low` (green)
  - Demand description
- **Empty state:** *"No events found for this period. Try refreshing or check that your AI provider supports live web search."*

### Chain Level
- Collapsible section per property showing that property's upcoming events (same card format).
- **"Refresh All" button:** calls `POST /run?propertyId=N` for each chain property in sequence (non-blocking, fire-and-forget per property), shows a progress indicator.
- Properties with no events show their empty state inline.

---

## 7. Shared Types

Added to `packages/shared/src/types/event-calendar.ts`:

```typescript
export interface SystemEventCalendarConfig {
  enabled: boolean
  defaultRadiusKm: number
  cronSchedule: string
}

export interface PropertyEventCalendarConfig {
  propertyId: number
  radiusKm: number | null  // null = inherit system default
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
```

---

## 8. API Routes

All routes under `/admin/intelligence/event-calendar/`, auth-guarded, registered in `app.ts`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/system-config` | Get `SystemEventCalendarConfig` (super only) |
| `PUT` | `/system-config` | Update enabled, radius, cron (super only) |
| `GET` | `/config` | Get `PropertyEventCalendarConfig` for `?propertyId=N` |
| `PUT` | `/config` | Upsert radius override for `?propertyId=N` |
| `POST` | `/run` | Manual trigger for `?propertyId=N&from=&to=` |
| `GET` | `/events` | Events overlapping `?propertyId=N&from=&to=` |
| `GET` | `/events/chain` | All events for `?orgId=N`, grouped by `propertyId` |

---

## 9. File Map

**New API files:**
- `apps/api/prisma/migrations/20260521000001_add_event_calendar/migration.sql`
- `apps/api/src/services/event-calendar-fetch.service.ts` — AI call, parse, store
- `apps/api/src/services/event-calendar.service.ts` — CRUD for config + events query
- `apps/api/src/services/event-calendar-cron.service.ts` — cron wrapper
- `apps/api/src/routes/event-calendar.route.ts` — all 7 routes
- Modify: `apps/api/prisma/schema.prisma` — 3 new models
- Modify: `apps/api/src/app.ts` — register routes
- Modify: `apps/api/src/server.ts` — start/stop cron
- Modify: `apps/api/src/services/compset-collect.service.ts` — add post-run event refresh

**New shared types:**
- `packages/shared/src/types/event-calendar.ts`
- Modify: `packages/shared/src/index.ts`

**New web files:**
- `apps/web/src/app/admin/intelligence/event-calendar/page.tsx`
- Modify: `apps/web/src/app/admin/_layout-client.tsx` — add Event Calendar nav item
- Modify: `apps/web/src/lib/api-client.ts` — add event calendar methods

---

## 10. What This Feature Does NOT Include

- Results display in the CompSet comparison table (deferred to CompSet Sub-project 2)
- Per-property enable/disable toggle (removing `PropertyEventCalendarConfig` opts the property out)
- Historical event archive (events are replaced on each refresh; no run history)
- Manual event entry by admin
