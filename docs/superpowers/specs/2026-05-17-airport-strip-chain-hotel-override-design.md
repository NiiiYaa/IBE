# Airport Strip Display — Chain/Hotel Override

**Date:** 2026-05-17
**Status:** Approved

## Problem

`stripDefaultFolded` and `stripAutoFoldSecs` on the airport strip are currently system-level only. Chain (org) and hotel (property) admins see the controls grayed out in the admin UI and cannot override them.

## Goal

Chain and hotel admins can override all strip display behaviour settings, with full inheritance: property → chain → system.

## Changes

### 1. DB Schema

Add two nullable columns to `OrgAirportConfig` and `PropertyAirportConfig`:

```
stripDefaultFolded  Boolean?   -- null = inherit from parent
stripAutoFoldSecs   Int?       -- null = inherit from parent
```

One migration adds both columns to both tables.

### 2. Service (`airport-config.service.ts`)

`childToResponse` — change from always inheriting parent strip values to own-or-inherit:

```ts
stripDefaultFolded: row?.stripDefaultFolded ?? parent.stripDefaultFolded,
stripAutoFoldSecs:  row?.stripAutoFoldSecs  ?? parent.stripAutoFoldSecs,
```

`upsertOrgAirportConfig` and `upsertPropertyAirportConfig` — add handling for both new fields (same pattern as `enabled`, `radiusKm`, `maxCount`):

```ts
if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
if (data.stripAutoFoldSecs  !== undefined) update.stripAutoFoldSecs  = data.stripAutoFoldSecs
```

The `upsertSystemAirportConfig` function is unchanged.

### 3. Shared Types (`airport-config.ts`)

Remove "system tier only" comments from `AirportConfigResponse`. No type shape changes needed — `AirportConfigUpdate` already carries both fields.

### 4. Admin UI (`design/airports/page.tsx`)

In `AirportConfigForm`, remove:
- The `!isSystem ? 'pointer-events-none opacity-50' : ''` wrappers on the strip controls
- The `{!isSystem && <p>Configured at system level.</p>}` note

The `onSave` call already includes `stripDefaultFolded` and `stripAutoFoldSecs` unconditionally (no `isSystem &&` guard needed since system already works).

## Inheritance

```
system (always set)
  └── chain org  (null = use system value)
        └── property (null = use chain/system value)
```

Same pattern as the existing `enabled`, `radiusKm`, `maxCount` fields.

## Out of Scope

- No UI for "reset to inherited" (null the value) — admins just match the parent value manually if they want to revert. Can be added later.
- No changes to `NearestAirports` frontend component — it already reads `stripDefaultFolded`/`stripAutoFoldSecs` from the API response.
