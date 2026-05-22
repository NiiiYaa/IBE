# CompSet Search Param Activation — Design Spec

**Date:** 2026-05-22  
**Status:** Approved

---

## Problem

Search configurations (params) are currently all-or-nothing: every param at every level runs when CompSet executes. There is no way for a level to deactivate an inherited param or soft-delete its own. Hotels cannot choose which patterns to run.

---

## Goals

- Each level (system / chain / hotel) can activate, deactivate, soft-delete, and edit its **own** params.
- Each level can activate or deactivate **inherited** params (toggle only — no edit, no delete).
- Deactivating at a higher level is a soft cascade (B): lower levels can re-activate.
- CompSet runs only the params that are effectively active for that hotel.

---

## Data Model

### Migration 1 — add `isActive` to `CompSetSearchParam`

```sql
ALTER TABLE CompSetSearchParam ADD COLUMN isActive BOOLEAN NOT NULL DEFAULT true;
```

- `isActive = false` = soft-deleted / deactivated by owner. Hidden from the owner's UI.

### Migration 2 — new table `CompSetSearchParamOverride`

```prisma
model CompSetSearchParamOverride {
  id            Int     @id @default(autoincrement())
  searchParamId Int
  orgId         Int?    // chain-level override
  propertyId    Int?    // hotel-level override
  isActive      Boolean

  @@unique([searchParamId, orgId, propertyId])
}
```

### Effective-active resolution (most specific wins)

```
1. Property-level override  (CompSetSearchParamOverride where propertyId = X)
2. Org-level override       (CompSetSearchParamOverride where orgId = Y, propertyId = null)
3. Param's own isActive     (CompSetSearchParam.isActive)
```

---

## Service Changes

### `getEffectiveSearchParams(propertyId)` — used by the run service

- Fetches system + chain + hotel params as before.
- Loads all override rows for this property and its org.
- Applies resolution order; filters to `resolvedIsActive === true`.
- Returns only active params — the run service needs no changes.

### `getScopedSearchParams(scope)` — used by the admin UI

- Returns **own** params where `isActive = true` (soft-deleted ones are hidden).
- Returns **all inherited** params (active or not), with `isActive` pre-resolved for the current scope, so lower levels can see and re-activate deactivated ones.
- Adds `isActive` and `resolvedIsActive` fields to the returned `CompSetSearchParam` type.

### `updateSearchParamActive(id, scope, isActive)` — new

- If the param's tier matches the current scope (own param): update `CompSetSearchParam.isActive`.
- If inherited: upsert `CompSetSearchParamOverride` for this scope.

### `deleteSearchParam(id)` — changed from hard-delete to soft-delete

- Sets `CompSetSearchParam.isActive = false` instead of deleting the row.
- Row is hidden from the owner's UI; lower levels can still re-activate via override.

---

## API Changes

### Existing — updated behavior

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/admin/intelligence/compset/search-params` | Response includes `isActive` and `resolvedIsActive` |
| `DELETE` | `/admin/intelligence/compset/search-params/:id` | Soft-delete (sets `isActive=false`), not hard-delete |

### New

```
PATCH /admin/intelligence/compset/search-params/:id/active
  Body:    { isActive: boolean }
  Auth:    current admin scope (orgId / propertyId)
  Behavior:
    - own param  → update CompSetSearchParam.isActive
    - inherited  → upsert CompSetSearchParamOverride for current scope
  Response: updated CompSetSearchParam
```

---

## Shared Type Changes

```ts
interface CompSetSearchParam {
  // ...existing fields...
  isActive: boolean         // owner's setting
  resolvedIsActive: boolean // effective value after overrides for the requesting scope
}
```

---

## UI Changes (`compset/page.tsx`)

### `ParamRow` additions

- **Toggle** (all params): activate/deactivate switch. Calls `PATCH .../active`. Optimistic cache update.
- **Edit button** (own params only): opens inline edit form pre-filled with current values.
- **Delete button** (own params only): calls soft-delete; row disappears immediately.
- Inherited params: toggle only — no edit, no delete.

### Row layout

```
[System] +7d · 2n · 2A                    [toggle]
[Chain]  +14d · 3n · 2A                   [toggle]
[Hotel]  +7d · 2n · 2A    [Edit] [Delete] [toggle]
```

### Section header update

"Inherited" section label becomes: "Inherited — you can activate or deactivate"

### Edit form

Inline form (same fields as Add form) pre-filled with the param's current values. Submit calls the existing `PUT .../search-params/:id`. Only shown for own-tier params.

---

## What Does NOT Change

- The run service (`compset-collect.service.ts`) — it calls `getEffectiveSearchParams` which handles filtering internally.
- The cron service.
- Competitor management.
- Results display.

---

## Out of Scope

- Editing inherited params at a lower level (not allowed; hotel can only toggle).
- Hard-deleting params (soft-delete only).
- Per-competitor param overrides.
