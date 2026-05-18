# Impersonate Feature — Design Spec

**Date:** 2026-05-18  
**Status:** Approved

---

## Overview

Super admins can impersonate any user in the system — seeing and acting exactly as that user — without knowing their password. The impersonation session is reflected in all API calls and the admin UI. A persistent bar shows the active impersonation and provides a one-click exit back to the super admin's real session.

---

## Scope & Constraints

- **Who can impersonate:** Super admins only (for now).
- **Who can be impersonated:** Any `AdminUser` in the system, regardless of role.
- **Blocked actions during impersonation:** Changing the impersonated user's `email` or `password` is rejected with `403`. All other actions are permitted.
- **Audit logging:** Deferred. When a general audit log is added in the future, it must record both the impersonated user and the real super admin actor for any actions taken during an impersonation session.

---

## Section 1 — JWT & Auth Layer

### AdminPayload (JWT contents)

```ts
interface AdminPayload {
  adminId: number
  organizationId: number | null
  role: string
  mustChangePassword?: boolean
  impersonatorId?: number  // present only during impersonation; holds the super admin's real adminId
}
```

During impersonation, the cookie contains the **impersonated user's** `adminId`, `organizationId`, and `role`. Every API route naturally operates as that user with no changes to existing middleware. The `impersonatorId` field is the only signal that impersonation is active.

### AdminMe response

`GET /auth/me` gains two optional fields:

```ts
interface AdminMe {
  // ...existing fields...
  impersonatorId?: number
  impersonatorName?: string  // name of the super admin doing the impersonating
}
```

These are returned only when `impersonatorId` is present in the JWT. The `auth/me` handler fetches the impersonator's name from DB to populate `impersonatorName`.

The auth middleware requires **no changes** — `request.admin` is always the effective user.

---

## Section 2 — API Endpoints

### `POST /api/v1/auth/impersonate`

**Auth:** Caller must have `role === 'super'` or `impersonatorId` set (to allow switching targets mid-session).

**Body:** `{ targetAdminId: number }`

**Logic:**
1. Verify caller is super (via `impersonatorId` or `role`).
2. Fetch target user; reject if not found or `isActive === false`.
3. Resolve the real super admin's `adminId`: use `request.admin.impersonatorId` if already impersonating, else `request.admin.adminId`.
4. Issue new JWT cookie: `{ adminId: target.id, organizationId: target.organizationId, role: target.role, impersonatorId: <real super adminId> }`.
5. Return `{ ok: true }`.

### `POST /api/v1/auth/impersonate/exit`

**Auth:** `impersonatorId` must be present in current JWT.

**Logic:**
1. Fetch the original super admin by `impersonatorId`; reject if not found or inactive.
2. Issue new JWT cookie restoring the super admin's real session (no `impersonatorId`).
3. Return `{ ok: true }`.

### `PUT /auth/me` — identity field guard

If `request.admin.impersonatorId` is set and the request body contains `email` or `password`, reject with:

```json
{ "error": "Identity fields cannot be changed during impersonation", "code": "IBE.AUTH.010" }
```
Status: `403`.

---

## Section 3 — Frontend

### Entry point: Users/Team admin page

Each user row shows an **"Impersonate"** button, visible only to super admins. On click:
1. Call `POST /auth/impersonate` with `targetAdminId`.
2. On success, `window.location.href = '/admin'` — full page reload clears React Query cache and starts the session fresh as the impersonated user.

### Impersonation bar

Mounted once in the admin layout. Rendered only when `admin.impersonatorId` is set (hidden entirely otherwise — no change to the existing bar for normal usage).

The bar sits alongside the existing "Configuring: ..." context bar:

```
Configuring as: [Jane Smith ▼]  [Exit]  |  Configuring: Minor-NH — chain level
```

**`[Jane Smith ▼]` dropdown**
- Lists users belonging to the **currently selected org** in context.
- If no org is selected (system level), lists **all users** in the system.
- Searchable (same pattern as the existing org/property selector).
- Selecting a user calls `POST /auth/impersonate` + full page reload.

**`[Exit]` button**
- Always visible directly on the bar — no need to open the dropdown.
- Calls `POST /auth/impersonate/exit` + full page reload to `/admin`.

### Session reload strategy

Both starting and ending impersonation use `window.location.href` (full reload) rather than React Query invalidation. This guarantees no stale cache from the previous session bleeds into the new one.

---

## Data Flow Summary

```
Super clicks Impersonate (user row)
  → POST /auth/impersonate { targetAdminId }
    → new JWT cookie: { adminId: target, organizationId: target, role: target, impersonatorId: super }
  → full page reload
  → GET /auth/me returns target's identity + impersonatorId + impersonatorName
  → impersonation bar renders

Super clicks [Exit]
  → POST /auth/impersonate/exit
    → new JWT cookie: { adminId: super, organizationId: null, role: 'super' }
  → full page reload
  → GET /auth/me returns super's real identity (no impersonatorId)
  → impersonation bar hidden
```

---

## Out of Scope

- Audit logging (tracked in open tasks — must account for impersonation when implemented).
- Impersonation for non-super roles.
- Nested impersonation (impersonating while already impersonating another super is handled by resolving the original `impersonatorId`, not chaining).
