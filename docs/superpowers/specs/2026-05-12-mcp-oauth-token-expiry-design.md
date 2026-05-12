# MCP OAuth Token Expiry — Configurable Setting

**Date:** 2026-05-12
**Status:** Approved

## Problem

OAuth tokens issued to Claude.ai and ChatGPT connectors are currently hardcoded to 1 hour (bumped to 30 days as a stopgap). There is no way for system admins or org admins to control how long these tokens stay valid without a code change.

## Goal

Add `oauthTokenExpiryDays` to the MCP config models so system admins can set a platform default and org admins can override per-org. Default is **forever** (no expiry claim on the JWT).

## Inheritance

Follows the standard System → Chain → Hotel pattern:

- **System** (`SystemMcpConfig.oauthTokenExpiryDays`): platform default, `null` = forever
- **Org** (`OrgMcpConfig.oauthTokenExpiryDays`): org override, `null` = inherit from system

No property-level setting — OAuth tokens are org-scoped, not property-scoped.

## Schema Changes

```prisma
model SystemMcpConfig {
  // existing fields ...
  oauthTokenExpiryDays Int?  // null = forever
}

model OrgMcpConfig {
  // existing fields ...
  oauthTokenExpiryDays Int?  // null = inherit from system
}
```

One migration, no new tables.

## Service Layer

New function `getEffectiveMcpTokenExpiry(orgId: number): Promise<number | null>`:
1. Read `OrgMcpConfig.oauthTokenExpiryDays` for the org — if non-null, use it
2. Fall back to `SystemMcpConfig.oauthTokenExpiryDays`
3. Fall back to `null` (forever)

`signAccessToken(adminUserId, orgId)` in `oauth.service.ts`:
- Calls `getEffectiveMcpTokenExpiry(orgId)` before signing
- If `null`: omits `.setExpirationTime()` entirely — JWT has no `exp` claim
- If number: calls `.setExpirationTime(`${days}d`)`

`expires_in` in the token response (`oauth.route.ts`):
- `null` (forever) → `2147483647` (max 32-bit int, ~68 years — satisfies OAuth clients that require a numeric value)
- Otherwise → `days * 86400`

## Admin API

**System admin** (`GET /admin/system/mcp-config`, `PATCH /admin/system/mcp-config`):
- Add `oauthTokenExpiryDays: number | null` to response and update payload

**Org admin** (`GET /admin/mcp-config`, `PATCH /admin/mcp-config`):
- Add `oauthTokenExpiryDays: number | null` to response (with resolved effective value and source)
- Add `oauthTokenExpiryDays?: number | null` to update payload

## Shared Types

Extend `OrgMcpConfigResponse` (and system equivalent) in `packages/shared/src/types/`:

```ts
interface OrgMcpConfigResponse {
  // existing ...
  oauthTokenExpiryDays: number | null       // org-level setting (null = inherit)
  effectiveTokenExpiryDays: number | null   // resolved value (null = forever)
  tokenExpiryInheritedFromSystem: boolean
}
```

## UI — MCP Admin Page

Add an "OAuth Token Lifetime" row to the existing MCP settings card.

**Dropdown options:**

| Label | Days value |
|---|---|
| Forever (default) | `null` |
| 1 year | `365` |
| 90 days | `90` |
| 30 days | `30` |
| 7 days | `7` |
| 1 day | `1` |

When the org has not overridden (`oauthTokenExpiryDays === null`), the dropdown shows a greyed-out hint: e.g. *"Forever — inherited from system"*.

System admin sees the same dropdown on the system MCP config page, with no inheritance indicator.

## Error Handling

- If the org MCP config row doesn't exist yet, treat as `null` (inherit / forever)
- If the system MCP config row doesn't exist, treat as `null` (forever)
- `signAccessToken` must not fail if the DB lookup fails — log a warning and default to forever

## Out of Scope

- Per-property token expiry (OAuth is org-scoped)
- Token revocation / rotation UI
- Changing expiry of already-issued tokens (JWTs are stateless; existing tokens are unaffected)
