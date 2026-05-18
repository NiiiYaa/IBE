# Impersonate Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow super admins to impersonate any AdminUser, acting as that user in all API calls and UI, with a persistent bar to exit or switch targets.

**Architecture:** Cookie-swap approach — `POST /auth/impersonate` issues a new JWT with the target's identity plus `impersonatorId` pointing back to the real super admin. `GET /auth/me` augments the response with impersonator metadata when the field is in the JWT. No auth middleware changes needed — `request.admin` is always the effective user. The frontend detects impersonation via `admin.impersonatorId` and renders a red bar with a searchable user-switching dropdown and an Exit button.

**Tech Stack:** Fastify + @fastify/jwt, Next.js 14 App Router, React Query, Tailwind CSS, TypeScript with `exactOptionalPropertyTypes: true` (all optional fields need `?: T | undefined` in component props, not just `?: T`)

---

## File Structure

| File | Change |
|------|--------|
| `apps/api/src/services/auth.service.ts` | Add `impersonatorId?: number` to `AdminPayload`; export `canImpersonate()` and `buildImpersonatePayload()` helpers |
| `apps/api/src/services/__tests__/auth.impersonate.test.ts` | **Create** — unit tests for both helpers |
| `apps/api/src/routes/auth.route.ts` | Add `POST /auth/impersonate` + `POST /auth/impersonate/exit`; update `GET /auth/me` to include impersonator fields; add identity-field guard to `PUT /auth/me` |
| `apps/api/src/routes/user.route.ts` | Allow super-level user list when `request.admin.impersonatorId` is set |
| `apps/web/src/lib/api-client.ts` | Extend `AdminMe` with optional impersonator fields; add `impersonate()` and `exitImpersonation()` methods |
| `apps/web/src/app/admin/_layout-client.tsx` | Add impersonation bar (user dropdown + exit button) rendered when `admin.impersonatorId` is set |
| `apps/web/src/app/admin/users/page.tsx` | Add Impersonate button in the actions column |

---

### Task 1: Extend AdminPayload and add auth helpers

**Files:**
- Modify: `apps/api/src/services/auth.service.ts:5-11`
- Create: `apps/api/src/services/__tests__/auth.impersonate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/__tests__/auth.impersonate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { canImpersonate, buildImpersonatePayload } from '../auth.service.js'

describe('canImpersonate', () => {
  it('returns true for super role', () => {
    expect(canImpersonate({ adminId: 1, organizationId: null, role: 'super' })).toBe(true)
  })

  it('returns true when impersonatorId is set (mid-session switch)', () => {
    expect(canImpersonate({ adminId: 2, organizationId: 5, role: 'admin', impersonatorId: 1 })).toBe(true)
  })

  it('returns false for non-super without impersonatorId', () => {
    expect(canImpersonate({ adminId: 2, organizationId: 5, role: 'admin' })).toBe(false)
  })
})

describe('buildImpersonatePayload', () => {
  it('sets impersonatorId to caller adminId on first impersonation', () => {
    const caller = { adminId: 1, organizationId: null as null, role: 'super' }
    const target = { id: 2, organizationId: 5 as number | null, role: 'admin', propertyIds: undefined }
    const payload = buildImpersonatePayload(caller, target)
    expect(payload).toMatchObject({ adminId: 2, organizationId: 5, role: 'admin', impersonatorId: 1 })
  })

  it('preserves original super adminId when switching targets mid-session', () => {
    const caller = { adminId: 2, organizationId: 5 as number | null, role: 'admin', impersonatorId: 1 }
    const target = { id: 3, organizationId: 7 as number | null, role: 'observer', propertyIds: undefined }
    const payload = buildImpersonatePayload(caller, target)
    expect(payload).toMatchObject({ adminId: 3, organizationId: 7, role: 'observer', impersonatorId: 1 })
  })

  it('includes propertyIds when target is a user-role with assigned properties', () => {
    const caller = { adminId: 1, organizationId: null as null, role: 'super' }
    const target = { id: 4, organizationId: 5 as number | null, role: 'user', propertyIds: [10, 20] }
    const payload = buildImpersonatePayload(caller, target)
    expect(payload.propertyIds).toEqual([10, 20])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx vitest run src/services/__tests__/auth.impersonate.test.ts
```

Expected: FAIL — `canImpersonate` and `buildImpersonatePayload` are not exported.

- [ ] **Step 3: Add impersonatorId to AdminPayload and export the two helpers**

In `apps/api/src/services/auth.service.ts`, update the `AdminPayload` interface and add the two helpers directly after the type:

```ts
export interface AdminPayload {
  adminId: number
  organizationId: number | null  // null for super admins
  role: string
  propertyIds?: number[]  // populated for 'user' role
  mustChangePassword?: boolean
  impersonatorId?: number  // present only during impersonation; holds the real super admin's adminId
}

export function canImpersonate(caller: AdminPayload): boolean {
  return caller.role === 'super' || caller.impersonatorId !== undefined
}

export function buildImpersonatePayload(
  caller: AdminPayload,
  target: { id: number; organizationId: number | null; role: string; propertyIds?: number[] | undefined },
): AdminPayload {
  const realSuperAdminId = caller.impersonatorId ?? caller.adminId
  const payload: AdminPayload = {
    adminId: target.id,
    organizationId: target.organizationId,
    role: target.role,
    impersonatorId: realSuperAdminId,
  }
  if (target.propertyIds !== undefined) {
    payload.propertyIds = target.propertyIds
  }
  return payload
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/api && npx vitest run src/services/__tests__/auth.impersonate.test.ts
```

Expected: PASS — 6 tests pass.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/auth.service.ts apps/api/src/services/__tests__/auth.impersonate.test.ts
git commit -m "feat: add impersonatorId to AdminPayload + canImpersonate/buildImpersonatePayload helpers"
```

---

### Task 2: Backend API endpoints

**Files:**
- Modify: `apps/api/src/routes/auth.route.ts`
- Modify: `apps/api/src/routes/user.route.ts`

- [ ] **Step 1: Update the import in auth.route.ts**

In `apps/api/src/routes/auth.route.ts` line 2, update the import to include the two new helpers:

```ts
import { resolveAdminLogin, signUpAdmin, findOrCreateGoogleUser, getAdminById, updateAdminProfile, canImpersonate, buildImpersonatePayload, type AdminPayload } from '../services/auth.service.js'
```

- [ ] **Step 2: Update GET /auth/me to include impersonator fields**

Replace the entire `GET /auth/me` handler (lines 92–99) with:

```ts
fastify.get('/auth/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const admin = await getAdminById(request.admin.adminId)
  if (!admin || !admin.isActive) {
    reply.clearCookie(COOKIE_NAME, { path: '/', ...(_adminCookieDomain ? { domain: _adminCookieDomain } : {}) })
    return reply.status(401).send({ error: 'Unauthorized', code: 'IBE.AUTH.001' })
  }
  if (request.admin.impersonatorId === undefined) {
    return reply.send(admin)
  }
  const impersonator = await getAdminById(request.admin.impersonatorId)
  return reply.send({
    ...admin,
    impersonatorId: request.admin.impersonatorId,
    ...(impersonator ? { impersonatorName: impersonator.name } : {}),
  })
})
```

- [ ] **Step 3: Add identity-field guard to PUT /auth/me**

In the `PUT /auth/me` handler (line 101), add the guard as the first thing in the handler body, before the `try` block:

```ts
fastify.put('/auth/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const body = request.body as { name?: string; email?: string; currentPassword?: string; newPassword?: string }

  if (request.admin.impersonatorId !== undefined && (body.email !== undefined || body.newPassword !== undefined)) {
    return reply.status(403).send({
      error: 'Identity fields cannot be changed during impersonation',
      code: 'IBE.AUTH.010',
    })
  }

  try {
    const updated = await updateAdminProfile(request.admin.adminId, {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.currentPassword !== undefined && { currentPassword: body.currentPassword }),
      ...(body.newPassword !== undefined && { newPassword: body.newPassword }),
    })
    return reply.send(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    const status = message === 'Current password is incorrect' ? 401
      : message === 'Email already in use' ? 409
      : 400
    return reply.status(status).send({ error: message })
  }
})
```

- [ ] **Step 4: Add POST /auth/impersonate**

Add the following route after the `PUT /auth/me` handler and before the Google OAuth block (before line 122):

```ts
// ── Impersonate ────────────────────────────────────────────────────────────

fastify.post('/auth/impersonate', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  if (!canImpersonate(request.admin)) {
    return reply.status(403).send({ error: 'Forbidden', code: 'IBE.AUTH.011' })
  }
  const { targetAdminId } = request.body as { targetAdminId?: number }
  if (typeof targetAdminId !== 'number') {
    return reply.status(400).send({ error: 'targetAdminId is required' })
  }
  const target = await getAdminById(targetAdminId)
  if (!target || !target.isActive) {
    return reply.status(404).send({ error: 'User not found or inactive' })
  }
  const payload = buildImpersonatePayload(request.admin, {
    id: target.id,
    organizationId: target.organizationId,
    role: target.role,
    propertyIds: target.propertyIds,
  })
  setCookieAndRespond(fastify, reply, payload)
  return reply.send({ ok: true })
})

fastify.post('/auth/impersonate/exit', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const { impersonatorId } = request.admin
  if (impersonatorId === undefined) {
    return reply.status(400).send({ error: 'Not in an impersonation session' })
  }
  const superAdmin = await getAdminById(impersonatorId)
  if (!superAdmin || !superAdmin.isActive) {
    reply.clearCookie(COOKIE_NAME, { path: '/', ...(_adminCookieDomain ? { domain: _adminCookieDomain } : {}) })
    return reply.status(401).send({ error: 'Original session is no longer valid', code: 'IBE.AUTH.001' })
  }
  setCookieAndRespond(fastify, reply, {
    adminId: superAdmin.id,
    organizationId: superAdmin.organizationId,
    role: superAdmin.role,
    mustChangePassword: superAdmin.mustChangePassword,
  })
  return reply.send({ ok: true })
})
```

- [ ] **Step 5: Fix user list scoping in user.route.ts**

In `apps/api/src/routes/user.route.ts` lines 11–13, replace:

```ts
const users = request.admin.role === 'super'
  ? await listAllUsers(onlyDeleted)
  : await listUsers(request.admin.organizationId!, onlyDeleted)
```

with:

```ts
const isEffectiveSuper = request.admin.role === 'super' || request.admin.impersonatorId !== undefined
const users = isEffectiveSuper
  ? await listAllUsers(onlyDeleted)
  : await listUsers(request.admin.organizationId!, onlyDeleted)
```

This ensures the impersonation bar dropdown can load all users regardless of the impersonated user's role.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Manual API smoke test**

Start the API server. Adjust the email/password/IDs for your dev data:

```bash
# Login as super
curl -s -c /tmp/super.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"super@example.com","password":"changeme"}' | jq .

# Verify /auth/me — should show super, no impersonatorId
curl -s -b /tmp/super.txt http://localhost:3001/api/v1/auth/me | jq '{id,name,role,impersonatorId}'

# Impersonate user ID 2 (replace with a real chain-admin ID in your dev DB)
curl -s -c /tmp/imp.txt -b /tmp/super.txt -X POST \
  http://localhost:3001/api/v1/auth/impersonate \
  -H 'Content-Type: application/json' -d '{"targetAdminId":2}' | jq .

# /auth/me — should now show the chain admin's identity + impersonatorId + impersonatorName
curl -s -b /tmp/imp.txt http://localhost:3001/api/v1/auth/me | jq '{id,name,role,impersonatorId,impersonatorName}'

# Identity guard — should return 403
curl -s -b /tmp/imp.txt -X PUT http://localhost:3001/api/v1/auth/me \
  -H 'Content-Type: application/json' -d '{"email":"hack@example.com"}' | jq .

# Exit
curl -s -b /tmp/imp.txt -X POST http://localhost:3001/api/v1/auth/impersonate/exit | jq .
```

Expected outputs:
- Second `/auth/me`: `role: "admin"`, `impersonatorId: <super's id>`, `impersonatorName: "<super's name>"`
- Identity guard: `{ "error": "Identity fields cannot be changed during impersonation", "code": "IBE.AUTH.010" }`
- Exit: `{ "ok": true }`

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/auth.route.ts apps/api/src/routes/user.route.ts
git commit -m "feat: add impersonate/exit endpoints + auth/me impersonator fields + identity guard"
```

---

### Task 3: Frontend API client and types

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Extend AdminMe with impersonator fields**

In `apps/web/src/lib/api-client.ts`, update the `AdminMe` interface (at line 225) to add:

```ts
export interface AdminMe {
  id: number
  email: string
  name: string
  role: string  // 'super' | 'admin' | 'observer' | 'user'
  organizationId: number | null
  isActive: boolean
  mustChangePassword: boolean
  propertyIds?: number[]
  orgName: string | null
  orgHyperGuestOrgId: string | null
  impersonatorId?: number | undefined
  impersonatorName?: string | undefined
}
```

- [ ] **Step 2: Add impersonate and exitImpersonation methods**

After the `updateMyAdminProfile` method (after line 285), add:

```ts
impersonate(targetAdminId: number): Promise<{ ok: boolean }> {
  return apiRequest('/api/v1/auth/impersonate', {
    method: 'POST',
    body: JSON.stringify({ targetAdminId }),
  })
},

exitImpersonation(): Promise<{ ok: boolean }> {
  return apiRequest('/api/v1/auth/impersonate/exit', { method: 'POST' })
},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat: extend AdminMe + add impersonate/exitImpersonation to API client"
```

---

### Task 4: Impersonation bar in admin layout

**Files:**
- Modify: `apps/web/src/app/admin/_layout-client.tsx`

- [ ] **Step 1: Add useRef to the React import**

At the top of the file (line 5), update the React import to include `useRef`:

```ts
import { useState, useEffect, useMemo, useRef } from 'react'
```

- [ ] **Step 2: Add state, ref, and users query**

After the existing query hooks (around line 230, after all the `useQuery`/`useQueries` calls), add:

```ts
const isImpersonating = admin?.impersonatorId !== undefined

const [impersonateDropdownOpen, setImpersonateDropdownOpen] = useState(false)
const [impersonateSearch, setImpersonateSearch] = useState('')
const impersonateDropdownRef = useRef<HTMLDivElement>(null)

const { data: allImpersonateUsers } = useQuery({
  queryKey: ['admin-users-impersonate'],
  queryFn: () => apiClient.listAdminUsers(false),
  enabled: isImpersonating,
})
```

- [ ] **Step 3: Add click-outside handler**

After the existing `useEffect` hooks, add:

```ts
useEffect(() => {
  function handleClickOutside(e: MouseEvent) {
    if (impersonateDropdownRef.current && !impersonateDropdownRef.current.contains(e.target as Node)) {
      setImpersonateDropdownOpen(false)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [])
```

- [ ] **Step 4: Add the impersonation bar JSX**

Immediately **before** the existing Configuring bar block (before the `{(showPropertySelector || b2cUrl || b2bUrl) && (` line at line 464), add:

```tsx
{/* ── Impersonation bar ─────────────────────────────────────────── */}
{isImpersonating && (
  <div className="flex shrink-0 items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-2 text-xs">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-500">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
    <span className="text-red-700 shrink-0">Configuring as:</span>

    {/* Searchable user-switcher dropdown */}
    <div className="relative" ref={impersonateDropdownRef}>
      <button
        onClick={() => { setImpersonateDropdownOpen(o => !o); setImpersonateSearch('') }}
        className="flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-0.5 font-medium text-red-700 transition-colors hover:bg-red-100"
      >
        {admin?.name ?? '…'}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {impersonateDropdownOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          <div className="border-b border-[var(--color-border)] p-2">
            <input
              autoFocus
              type="text"
              placeholder="Search users…"
              value={impersonateSearch}
              onChange={e => setImpersonateSearch(e.target.value)}
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-text)] focus:outline-none"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {(allImpersonateUsers ?? [])
              .filter(u => {
                if (orgId !== null && u.orgId !== orgId) return false
                const q = impersonateSearch.toLowerCase()
                return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
              })
              .map(u => (
                <li key={u.id}>
                  <button
                    onClick={async () => {
                      setImpersonateDropdownOpen(false)
                      await apiClient.impersonate(u.id)
                      window.location.href = '/admin'
                    }}
                    className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-[var(--color-background)]"
                  >
                    <span className="font-medium text-[var(--color-text)]">{u.name}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">{u.email} · {u.role}</span>
                  </button>
                </li>
              ))
            }
          </ul>
        </div>
      )}
    </div>

    <button
      onClick={async () => {
        await apiClient.exitImpersonation()
        window.location.href = '/admin'
      }}
      className="rounded border border-red-300 bg-white px-2 py-0.5 font-medium text-red-700 transition-colors hover:bg-red-100"
    >
      Exit
    </button>

    {admin?.impersonatorName && (
      <span className="ml-auto text-[10px] text-red-400">
        Signed in as: {admin.impersonatorName}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors. If you see an error about `orgId` not being in scope, confirm that `orgId` is already declared via `useAdminProperty()` at the top of the component — it should be available at line 169.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/_layout-client.tsx
git commit -m "feat: add impersonation bar to admin layout"
```

---

### Task 5: Impersonate button in users page

**Files:**
- Modify: `apps/web/src/app/admin/users/page.tsx`

- [ ] **Step 1: Add the impersonate handler**

After the existing `handleReviveUser` function, add:

```ts
async function handleImpersonate(userId: number) {
  await apiClient.impersonate(userId)
  window.location.href = '/admin'
}
```

- [ ] **Step 2: Add the Impersonate button to the actions column**

In the non-editing, non-deleted actions section (the `<>` block that starts at line ~581, after the `showDeleted` branch), add the Impersonate button between the `Edit` button and the `Delete` block. The full actions section becomes:

```tsx
<>
  {!isMe && (
    <button onClick={() => handleResetPassword(u)}
      className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]">
      Reset pwd
    </button>
  )}
  <button onClick={() => { setEditingId(u.id); setEditForm({ name: u.name, role: u.role, isActive: u.isActive, phone: u.phone ?? '' }); setEditPropertyIds(u.propertyIds ?? []); setSaveError(null) }}
    className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]">
    Edit
  </button>
  {(me?.role === 'super' || me?.impersonatorId !== undefined) && !isMe && (
    <button onClick={() => handleImpersonate(u.id)}
      className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)]">
      Impersonate
    </button>
  )}
  {!isMe && (
    deleteConfirm === u.id ? (
      <>
        <button onClick={() => handleDelete(u.id)} disabled={deleting === u.id}
          className="rounded-md bg-[var(--color-error)] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {deleting === u.id ? '…' : 'Confirm'}
        </button>
        <button onClick={() => setDeleteConfirm(null)}
          className="rounded-md px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          Cancel
        </button>
      </>
    ) : (
      <button onClick={() => setDeleteConfirm(u.id)}
        className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-error)]/70 transition-colors hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]">
        Delete
      </button>
    )
  )}
</>
```

The key addition is the `Impersonate` button block gated on `(me?.role === 'super' || me?.impersonatorId !== undefined) && !isMe`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: End-to-end manual test**

Start both servers. Test the full flow:

1. Log in as super admin → go to Users page
2. Confirm **Impersonate** button appears on every row except your own
3. Confirm it does NOT appear for non-super users (log in as a chain admin and verify)
4. As super: click **Impersonate** on a chain-admin user → full page reload
5. Confirm red bar appears: "Configuring as: [chain admin name ▼]  Exit  Signed in as: [super name]"
6. Navigate around — confirm you're scoped to the chain admin's org and settings
7. Open the dropdown in the bar — confirm it shows users from the chain admin's org; confirm search filters work
8. Click another user in the dropdown → confirm it switches (page reloads as the new user)
9. Click **Exit** → confirm full reload, red bar disappears, you're back as super
10. As super at system level (no org selected): open bar dropdown → confirm it shows ALL users
11. Try editing the impersonated user's email or password → confirm 403 response

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/users/page.tsx
git commit -m "feat: add Impersonate button to users page actions"
```
