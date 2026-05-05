# Data Provider Admin UI — Design Spec

**Date:** 2026-05-05  
**Status:** Approved

---

## Overview

Build the admin UI for the Data Provider feature, which enriches hotel properties with scores from external providers (currently DataForSEO). This includes backend schema extensions to support per-org and per-property credentials, and a new admin config page with three context-sensitive sections (system / org / property).

---

## Backend Changes

### 1. Prisma Schema Migration

**`SystemDataProviderConfig`** — add:
- `openToAll Boolean @default(true)` — global toggle; when false, all orgs must define their own credentials and cannot inherit from system

**`OrgDataProviderConfig`** — add:
- `providerType String?` — nullable; overrides system providerType when org uses own config
- `login String?` — AES-256-CBC encrypted DataForSEO login
- `password String?` — AES-256-CBC encrypted DataForSEO password
- `systemServiceDisabled Boolean @default(false)` — super admin only; blocks this specific org from inheriting system config regardless of `openToAll`

**`PropertyDataProviderConfig`** — add:
- `providerType String?` — nullable; overrides org/system providerType when property uses own config
- `login String?` — AES-256-CBC encrypted DataForSEO login
- `password String?` — AES-256-CBC encrypted DataForSEO password
- `orgServiceDisabled Boolean @default(false)` — org/super admin only; blocks this property from inheriting org config

**Note:** System-level credentials remain in env vars (`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`). Only org and property levels store credentials in the DB.

### 2. Encryption

Follows the same pattern as `ai-config.service.ts`:
- Env var: `DATA_PROVIDER_ENCRYPTION_KEY`
- Helpers: `encryptCredential(value)` / `decryptCredential(value)` (AES-256-CBC)
- `maskLogin(stored)` → `****@domain.com` (domain kept visible)
- `maskPassword(stored)` → `****`
- Credentials are **never** returned in plain text in API responses

### 3. Service Changes

**`data-provider.service.ts`:**
- Add encryption/masking helpers
- `getEffectiveConfig(propertyId)` extended to cascade and return effective `login`/`password` (decrypted, for internal use only)
- CRUD methods for system/org/property updated to handle credential fields

**`data-provider-fetch.service.ts`:**
- `refreshProperty()` uses cascaded credentials from `getEffectiveConfig()` instead of reading `env.DATAFORSEO_LOGIN` / `env.DATAFORSEO_PASSWORD` directly

### 4. Route Changes

All routes under `/api/v1`, JWT-authenticated.

| Route | Change |
|---|---|
| `GET /admin/data-provider/system` | adds `openToAll` to response |
| `PUT /admin/data-provider/system` | accepts `openToAll` |
| `GET /admin/data-provider/global` | adds `loginSet`, `passwordMasked`, `providerType`, `systemServiceDisabled` |
| `PUT /admin/data-provider/global` | accepts `login`, `password`, `providerType`, `systemServiceDisabled` (super admin only) |
| `GET /admin/data-provider/property/:id` | `DataProviderAdminResponse.propertyConfig` adds `loginSet`, `passwordMasked`, `providerType`, `orgServiceDisabled` |
| `PUT /admin/data-provider/property/:id` | accepts `login`, `password`, `providerType`, `orgServiceDisabled` |

### 5. Shared Types (`@ibe/shared`)

Update `data-provider.ts` types to reflect new fields:
- `SystemDataProviderConfig` adds `openToAll: boolean`
- `OrgDataProviderConfig` adds `providerType: DataProviderType | null`, `loginSet: boolean`, `passwordMasked: string | null`, `systemServiceDisabled: boolean`
- `PropertyDataProviderConfig` adds `providerType: DataProviderType | null`, `loginSet: boolean`, `passwordMasked: string | null`, `orgServiceDisabled: boolean`

---

## Admin UI

### Navigation

Add "Data Provider" entry to Config section in `apps/web/src/app/admin/_layout-client.tsx`, alphabetically between "Cross-Sell" and "Domain".

### New Page

`apps/web/src/app/admin/config/data-provider/page.tsx`

Uses `useAdminAuth()` and `useAdminProperty()` to determine which section to render.

---

### System Level
_Rendered when: super admin, no org/property selected_

- **`openToAll` toggle** — "Allow lower levels to use system credentials"; shown prominently at top; when disabled, all orgs must configure their own credentials
- **Provider type selector** — `dataforseo` | `none`
- **Refresh interval** — number input (days)
- **Enabled toggle** — activates the daily cron
- **Credentials** — read-only status badges: "Login: configured via env" or "Not configured" (same for password); no editable credential fields at system level
- **SaveBar** — sticky, appears on dirty state

---

### Org Level
_Rendered when: org selected, no property selected_

**If system is accessible** (`openToAll=true` AND `systemServiceDisabled=false` for this org):
- `useSystem` toggle — "Use system configuration"
  - **When on:** inherited values shown read-only (providerType, refreshIntervalDays, enabled, login status)
  - **When off:** own credential form shown (see below)

**Own config form** (shown when `useSystem=false` or system not accessible):
- Provider type selector
- Login input
- Password input — when `loginSet=true`, shows `passwordMasked` value as placeholder; user enters new value to replace; leaving blank keeps existing password unchanged
- Refresh interval override (days)
- Enabled toggle

**Super admin only** (additional toggle):
- `systemServiceDisabled` — "Block system access for this org" — prevents this org from inheriting system config regardless of `openToAll`

**SaveBar** — sticky, appears on dirty state

---

### Property Level
_Rendered when: property selected_

**Score panel** (read-only, at top):
- Score value (e.g. "4.6 / 5")
- Review count
- Source (e.g. "dataforseo")
- Last fetched date (formatted)
- Status badge: `idle` | `fetching` | `done` | `error`
- Error message (if status = error)
- **Refresh Now button** (top-right of panel) — idle / syncing / done / error states, auto-resets after 3s; invalidates query on success

**Config section** (below score panel):

**If org config is accessible** (org has config and `orgServiceDisabled=false`):
- `useOrg` toggle — "Use org configuration"
  - **When on:** inherited values shown read-only
  - **When off:** own credential form shown

**Own config form** (when `useOrg=false` or org not accessible):
- Provider type selector
- Login input
- Password input
- Refresh interval override

**Super/org admin** (additional toggle):
- `orgServiceDisabled` — "Block org access for this property"

**SaveBar** — sticky, appears on dirty state

---

## Cascade Logic Summary

```
Property.useOrg=true  → inherit from Org (if not orgServiceDisabled)
Property.useOrg=false → use Property's own credentials/config

Org.useSystem=true  → inherit from System (if openToAll=true and not systemServiceDisabled)
Org.useSystem=false → use Org's own credentials/config

System credentials → env vars (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)
```

When a higher level disables access (closed or `*ServiceDisabled`), the lower level must define its own credentials to function.

---

## Out of Scope

- Per-hotel manual override of hotel name / location used for DataForSEO lookup (currently pulled from HyperGuest static data automatically)
- Guest-facing score display (separate future task)
- Additional DataForSEO fields beyond score and reviewCount
