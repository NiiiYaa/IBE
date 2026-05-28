# OB Agent Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `ob_agent` role for HyperGuest onboarding staff — visible only in `user.route.ts` (API) and `_layout-client.tsx` (frontend), with no DB migration required.

**Architecture:** Role is a plain string in the DB. `ob_agent` users belong to the "HG OB" org (created once manually by a super admin). The existing org-scoped access control on onboarding routes already handles them correctly — only two files need changes. The admin layout shows only the Hotel Onboarding section for this role and redirects them there on login.

**Tech Stack:** TypeScript, Next.js 14, Fastify

---

## Task 1: API — add `ob_agent` to allowed roles

**Files:**
- Modify: `apps/api/src/routes/user.route.ts`

- [ ] **Step 1: Add `ob_agent` to `ALLOWED_ROLES` and gate to super-only on create**

In `apps/api/src/routes/user.route.ts`, make these two changes:

**Change 1** — line 6, add `'ob_agent'` to the array:
```typescript
const ALLOWED_ROLES = ['admin', 'observer', 'user', 'affiliate', 'ob_agent']
```

**Change 2** — in the `POST /admin/users` handler, add the super-only check after `const isSuper = request.admin.role === 'super'` (currently line 104):
```typescript
    const isSuper = request.admin.role === 'super'
    if (body.role === 'ob_agent' && !isSuper)
      return reply.status(403).send({ error: 'Only super admins can assign the OB Agent role' })
    const isAffiliate = body.role === 'affiliate'
```

**Change 3** — in the `PUT /admin/users/:id` handler, add the super-only check after the `ALLOWED_ROLES` validation (currently line 137-138):
```typescript
    if (body.role !== undefined && !ALLOWED_ROLES.includes(body.role))
      return reply.status(400).send({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` })
    if (body.role === 'ob_agent' && request.admin.role !== 'super')
      return reply.status(403).send({ error: 'Only super admins can assign the OB Agent role' })
    // Prevent self-demotion or self-deactivation
    if (isSelf && (body.role !== undefined || body.isActive === false))
      return reply.status(400).send({ error: 'You cannot change your own role or deactivate your own account' })
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @ibe/api exec tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/user.route.ts
git commit -m "feat(api): add ob_agent role — super-only assignment, org-scoped onboarding access"
```

---

## Task 2: Frontend — `_layout-client.tsx` role handling

**Files:**
- Modify: `apps/web/src/app/admin/_layout-client.tsx`

Six changes to this file. Make them all before running the type-check.

- [ ] **Step 1: Add `ob_agent` to `ROLE_LEVEL`**

Find line 156:
```typescript
const ROLE_LEVEL: Record<string, number> = { super: 2, admin: 1, observer: 0, user: 0, affiliate: -1 }
```
Replace with:
```typescript
const ROLE_LEVEL: Record<string, number> = { super: 2, admin: 1, ob_agent: 1, observer: 0, user: 0, affiliate: -1 }
```

- [ ] **Step 2: Change Onboarding section from `super` to `admin`**

Find the Onboarding section (lines 141-147):
```typescript
  {
    title: 'Onboarding',
    minRole: 'super',
    items: [
      { href: '/admin/hotel-onboarding', label: 'Hotel Onboarding', minRole: 'super' },
    ],
  },
```
Replace with:
```typescript
  {
    title: 'Onboarding',
    minRole: 'admin',
    items: [
      { href: '/admin/hotel-onboarding', label: 'Hotel Onboarding', minRole: 'admin' },
    ],
  },
```

- [ ] **Step 3: Update `filterSections` — only Onboarding visible for `ob_agent`**

Find `function filterSections(sections: Section[], role: string, isBuyerOrg: boolean): Section[]` (lines 158-171). Replace the entire function:
```typescript
function filterSections(sections: Section[], role: string, isBuyerOrg: boolean): Section[] {
  if (role === 'ob_agent') {
    return sections.filter(s => s.title === 'Onboarding').map(s => ({ ...s }))
  }
  const level = ROLE_LEVEL[role] ?? 0
  return sections
    .filter(s => !s.sellerOnly || !isBuyerOrg)
    .filter(s => s.comingSoon || (isBuyerOrg && s.buyerAccessible) || !s.minRole || level >= (s.minRole === 'super' ? 2 : 1))
    .map(s => ({
      ...s,
      items: s.items.filter(i =>
        ((!i.minRole || level >= (i.minRole === 'super' ? 2 : 1)) || (isBuyerOrg && i.buyerAccessible)) &&
        (!i.sellerOnly || !isBuyerOrg)
      ),
    }))
    .filter(s => s.comingSoon || s.href || s.items.length > 0)
}
```

- [ ] **Step 4: Update `RoleBadge` to support `ob_agent`**

Find `function RoleBadge({ role }: { role: 'admin' | 'super' })` (lines 173-186). Replace the entire function:
```typescript
function RoleBadge({ role }: { role: 'admin' | 'super' | 'ob_agent' }) {
  return (
    <span
      className={[
        'ml-1.5 inline-block rounded px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wide',
        role === 'super'
          ? 'bg-purple-100 text-purple-700'
          : role === 'ob_agent'
          ? 'bg-indigo-100 text-indigo-700'
          : 'bg-blue-100 text-blue-600',
      ].join(' ')}
    >
      {role === 'super' ? 'Super' : role === 'ob_agent' ? 'OB Agent' : 'Admin'}
    </span>
  )
}
```

- [ ] **Step 5: Update RoleBadge usage in the user profile header**

Find line 489:
```typescript
                {(admin.role === 'super' || admin.role === 'admin') && <RoleBadge role={admin.role as 'super' | 'admin'} />}
```
Replace with:
```typescript
                {(admin.role === 'super' || admin.role === 'admin' || admin.role === 'ob_agent') && <RoleBadge role={admin.role as 'super' | 'admin' | 'ob_agent'} />}
```

- [ ] **Step 6: Fix wizard-redirect guard + add `ob_agent` redirect**

Find the `useEffect` at line 344 that redirects users without a HG org ID to the hotel wizard:
```typescript
  useEffect(() => {
    if (isAuthenticated && !isAuthPage && !isOnboarding && orgData && !orgData.hyperGuestOrgId && role !== 'super' && orgData.orgType !== 'buyer') {
      router.replace('/admin/onboarding')
    }
  }, [isAuthenticated, isAuthPage, isOnboarding, orgData, role, router])
```
Replace with:
```typescript
  useEffect(() => {
    if (isAuthenticated && !isAuthPage && !isOnboarding && orgData && !orgData.hyperGuestOrgId && role !== 'super' && role !== 'ob_agent' && orgData.orgType !== 'buyer') {
      router.replace('/admin/onboarding')
    }
  }, [isAuthenticated, isAuthPage, isOnboarding, orgData, role, router])

  useEffect(() => {
    if (isAuthenticated && role === 'ob_agent' && !isAuthPage && pathname !== '/admin/hotel-onboarding') {
      router.replace('/admin/hotel-onboarding')
    }
  }, [isAuthenticated, role, isAuthPage, pathname, router])
```

- [ ] **Step 7: Type-check**

```bash
pnpm --filter @ibe/web type-check 2>/dev/null || pnpm --filter @ibe/web exec tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/admin/_layout-client.tsx
git commit -m "feat(web): ob_agent role — OB-only nav, hotel-onboarding redirect, indigo badge"
```
