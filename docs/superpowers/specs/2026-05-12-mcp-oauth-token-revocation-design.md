# MCP OAuth Token Revocation

**Date:** 2026-05-12
**Status:** Approved

## Problem

OAuth tokens issued to org connectors (Claude.ai, ChatGPT, etc.) are stateless JWTs. There is no way to invalidate them once issued — especially tokens with no expiry (`exp` omitted). An admin who wishes to cut off access must wait for natural expiry or change the expiry setting, which only affects future tokens.

## Goal

Add a "Revoke All Tokens" action per org that immediately invalidates all currently-issued OAuth tokens for that org. Tokens issued after the revocation are unaffected.

## Mechanism

Store a `tokensRevokedAt` timestamp on `OrgMcpConfig`. On every authenticated MCP request, after JWT signature validation, check whether the token was issued before that timestamp. If `iat < tokensRevokedAt`, the token is rejected as revoked.

This is O(1) — one timestamp comparison against a value already read from the DB during the existing org scope lookup.

## Schema Change

```prisma
model OrgMcpConfig {
  // existing fields ...
  tokensRevokedAt DateTime?  // null = never revoked; tokens issued before this are rejected
}
```

One migration, no new tables.

## Service Layer

### `validateMcpJwt` (`oauth.service.ts`)

Extend return type to include `iat`:

```ts
// before
{ sub: string; org?: number } | null

// after
{ sub: string; org?: number; iat: number } | null
```

Extract `payload.iat` (number of seconds since epoch, always present in tokens we issue via `.setIssuedAt()`).

### `getOAuthScope` (`oauth.service.ts`)

Add `iat: number` parameter. After confirming the user is active, read `OrgMcpConfig.tokensRevokedAt` for the org and reject if `iat < revokedAt.getTime() / 1000`.

```ts
export async function getOAuthScope(
  sub: string,
  iat: number,
  org?: number
): Promise<McpScope | null>
```

### `revokeOrgTokens` (`mcp.service.ts`)

New function. Upserts `OrgMcpConfig` with `tokensRevokedAt = new Date()`.

```ts
export async function revokeOrgTokens(orgId: number): Promise<void>
```

## Route Changes

### MCP Auth Middleware (`routes/mcp.route.ts` or equivalent)

Pass `iat` from `validateMcpJwt` result through to `getOAuthScope`.

### New endpoint (`admin-mcp.route.ts`)

```
POST /admin/mcp-config/revoke-tokens
```

- Org admin scope only (system admins can impersonate an org if needed)
- No request body required
- Calls `revokeOrgTokens(orgId)`
- Returns `{ revokedAt: string }` (ISO timestamp)

## Shared Types

Extend `OrgMcpConfigResponse` in `packages/shared/src/types/`:

```ts
interface OrgMcpConfigResponse {
  // existing ...
  tokensRevokedAt: string | null   // ISO timestamp of last revocation, null if never
}
```

No new mutation type needed — the revoke action is its own `POST` endpoint.

## Admin API Client (`apps/web/src/lib/api-client.ts`)

Add:

```ts
revokeOrgTokens(): Promise<{ revokedAt: string }>
```

## UI — MCP Admin Page

Add to the org-level MCP settings card (hidden on property view, same as the token expiry row):

- **"Revoke All Tokens" button** — destructive styling (red/outline)
- **Confirm dialog** — "This will immediately invalidate all active OAuth tokens for this org. Connectors will need to re-authenticate. Continue?"
- **Post-revocation state** — show a note below the button: *"All tokens issued before [formatted date] have been revoked."* Populated from `tokensRevokedAt` in the config response.

The button is always enabled (you can revoke multiple times; each revocation sets a new timestamp).

## Error Handling

- If `OrgMcpConfig` row doesn't exist for the org, `revokeOrgTokens` creates it (upsert).
- If `tokensRevokedAt` DB read fails during validation, log a warning and allow the token (fail-open on revocation check, same principle as expiry lookup).

## Out of Scope

- System-level "revoke all orgs" action
- Per-token revocation (would require a blocklist)
- Revoking the OAuth client credentials (separate concept)
