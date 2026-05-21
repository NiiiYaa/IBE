# Show Name On Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `showNameOnPage` boolean that lets admins hide the property/chain display name from the hero section while keeping it available for WhatsApp greetings and other non-visual uses.

**Architecture:** Add the field to `HotelConfig` (property level) and `OrgDesignDefaults` (chain level) in the DB; thread it through the config service → shared types → `page.tsx` → `HomePageClient`; expose toggles in the chain and hotel homepage admin pages.

**Tech Stack:** Prisma (schema + migration), Fastify API (`config.service.ts`), shared Zod types (`packages/shared`), Next.js 14 App Router (`HomePageClient.tsx`, admin pages).

---

## File Map

| File | Change |
|------|--------|
| `apps/api/prisma/schema.prisma` | Add `showNameOnPage` to `HotelConfig` and `OrgDesignDefaults` |
| `packages/shared/src/types/api.ts` | Add field to `HotelDesignConfig`, `UpdateDesignConfigRequest`, `OrgDesignDefaultsConfig` |
| `apps/api/src/services/config.service.ts` | Thread through read/write helpers for both hotel and org levels |
| `apps/web/src/app/(main)/page.tsx` | Extract field, pass to `HomePageClient` |
| `apps/web/src/components/home/HomePageClient.tsx` | Add prop, wrap all four `<h1>{displayName}</h1>` renders |
| `apps/web/src/app/admin/design/chain/page.tsx` | Add Toggle next to displayName field |
| `apps/web/src/app/admin/design/homepage/page.tsx` | Add OverrideToggleRow next to displayName field |

---

## Task 1: DB Schema — add `showNameOnPage` to both models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add field to HotelConfig**

Find the `displayName` line in `HotelConfig` (~line 367) and add the field directly after it:

```prisma
  displayName                     String?
  showNameOnPage                  Boolean  @default(true)
```

- [ ] **Step 2: Add field to OrgDesignDefaults**

Find the `displayName` line in `OrgDesignDefaults` (~line 504) and add the field directly after it:

```prisma
  displayName       String?
  showNameOnPage    Boolean?
```

Note: `HotelConfig` uses non-nullable with a default (property always has an explicit setting). `OrgDesignDefaults` uses nullable (null means "not configured → use default true").

- [ ] **Step 3: Run migration**

```bash
cd apps/api && npx prisma migrate dev --name add_show_name_on_page
```

Expected: Migration created and applied. `prisma generate` runs automatically.

- [ ] **Step 4: Rebuild shared types from Prisma**

```bash
cd apps/api && npx prisma generate
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add showNameOnPage to HotelConfig and OrgDesignDefaults"
```

---

## Task 2: Shared Types — add field to API type interfaces

**Files:**
- Modify: `packages/shared/src/types/api.ts`

- [ ] **Step 1: Add to HotelDesignConfig**

Locate `aiLayoutDefault: boolean` in `HotelDesignConfig` and add `showNameOnPage` immediately after `aiLayoutDefault`:

```typescript
  aiLayoutDefault: boolean
  searchAiLayoutDefault: boolean
  showNameOnPage: boolean
```

- [ ] **Step 2: Add to UpdateDesignConfigRequest**

Locate `aiLayoutDefault?: boolean | null` in `UpdateDesignConfigRequest` and add after it:

```typescript
  aiLayoutDefault?: boolean | null
  searchAiLayoutDefault?: boolean | null
  showNameOnPage?: boolean | null
```

- [ ] **Step 3: Add to OrgDesignDefaultsConfig**

Locate `aiLayoutDefault: boolean | null` in `OrgDesignDefaultsConfig` and add after it:

```typescript
  aiLayoutDefault: boolean | null
  searchAiLayoutDefault: boolean | null
  showNameOnPage: boolean | null
```

- [ ] **Step 4: Build shared package to verify no type errors**

```bash
cd packages/shared && npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/api.ts packages/shared/dist/
git commit -m "feat: add showNameOnPage to shared API types"
```

---

## Task 3: Config Service — thread through read/write paths

**Files:**
- Modify: `apps/api/src/services/config.service.ts`

There are five places to update:

### 3a. `rowToSystemDesign` — return `showNameOnPage: null`

The inline parameter type for `rowToSystemDesign` describes `SystemDesignConfig` which does not have this field. Add `showNameOnPage: null` to its return object (it always resolves to the default `true` via fallback later):

- [ ] **Step 1: Add to rowToSystemDesign return**

Find the line `aiLayoutDefault: row?.aiLayoutDefault ?? null,` in `rowToSystemDesign` and add after `searchAiLayoutDefault`:

```typescript
    aiLayoutDefault: row?.aiLayoutDefault ?? null,
    searchAiLayoutDefault: row?.searchAiLayoutDefault ?? null,
    showNameOnPage: null,
```

### 3b. `fetchConfig` (property-level) — add to resolved return

- [ ] **Step 2: Add to fetchConfig return**

Find `aiLayoutDefault: config?.aiLayoutDefault ?? o?.aiLayoutDefault ?? false,` in `fetchConfig` and add after `searchAiLayoutDefault`:

```typescript
    aiLayoutDefault: config?.aiLayoutDefault ?? o?.aiLayoutDefault ?? false,
    searchAiLayoutDefault: config?.searchAiLayoutDefault ?? o?.searchAiLayoutDefault ?? false,
    showNameOnPage: config?.showNameOnPage ?? true,
```

Note: `showNameOnPage` is NOT inherited from org → property; each level has its own setting. Property defaults to `true`.

### 3c. `fetchOrgConfig` (chain-level) — add to resolved return

- [ ] **Step 3: Add to fetchOrgConfig return**

Find `aiLayoutDefault: o?.aiLayoutDefault ?? false,` in the `fetchOrgConfig` return block and add after `searchAiLayoutDefault`:

```typescript
    aiLayoutDefault: o?.aiLayoutDefault ?? false,
    searchAiLayoutDefault: o?.searchAiLayoutDefault ?? false,
    showNameOnPage: o?.showNameOnPage ?? true,
```

### 3d. `upsertHotelDesignConfig` — handle incoming update

- [ ] **Step 4: Add to upsertHotelDesignConfig data object**

Find `...(updates.aiLayoutDefault != null && { aiLayoutDefault: updates.aiLayoutDefault }),` in `upsertHotelDesignConfig` and add after `searchAiLayoutDefault`:

```typescript
    ...(updates.aiLayoutDefault != null && { aiLayoutDefault: updates.aiLayoutDefault }),
    ...(updates.searchAiLayoutDefault != null && { searchAiLayoutDefault: updates.searchAiLayoutDefault }),
    ...(updates.showNameOnPage != null && { showNameOnPage: updates.showNameOnPage }),
```

### 3e. `upsertOrgDesignDefaults` and `rowToOrgDefaults` — org-level

- [ ] **Step 5: Add to upsertOrgDesignDefaults fields array**

Find the `fields` array in `upsertOrgDesignDefaults`. Add `'showNameOnPage'` to the list alongside other boolean fields:

```typescript
    'onlinePaymentEnabled', 'payAtHotelEnabled', 'payAtHotelCardGuaranteeRequired',
    'aiLayoutDefault', 'searchAiLayoutDefault',
    'showNameOnPage',
```

- [ ] **Step 6: Add to rowToOrgDefaults input type**

Find `aiLayoutDefault?: boolean | null; searchAiLayoutDefault?: boolean | null` in the inline parameter type of `rowToOrgDefaults` and add:

```typescript
  aiLayoutDefault?: boolean | null; searchAiLayoutDefault?: boolean | null
  showNameOnPage?: boolean | null
```

- [ ] **Step 7: Add to rowToOrgDefaults return**

Find `aiLayoutDefault: row?.aiLayoutDefault ?? null,` in the `rowToOrgDefaults` return and add after `searchAiLayoutDefault`:

```typescript
    aiLayoutDefault: row?.aiLayoutDefault ?? null,
    searchAiLayoutDefault: row?.searchAiLayoutDefault ?? null,
    showNameOnPage: row?.showNameOnPage ?? null,
```

- [ ] **Step 8: Build API to verify no TypeScript errors**

```bash
cd apps/api && npm run build 2>&1 | grep -E "error|warning" | head -20
```

Expected: No type errors. (Restart dev server after.)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/config.service.ts
git commit -m "feat: thread showNameOnPage through config service read/write paths"
```

---

## Task 4: Frontend page.tsx — extract and forward prop

**Files:**
- Modify: `apps/web/src/app/(main)/page.tsx`

- [ ] **Step 1: Extract showNameOnPage**

Find the line:
```typescript
const displayName = config?.displayName?.trim() || property?.name || 'Welcome'
```

Add immediately after it:
```typescript
const showNameOnPage = config?.showNameOnPage ?? true
```

- [ ] **Step 2: Pass to HomePageClient**

Find the `<HomePageClient` JSX block (around line 387). Add `showNameOnPage` next to `displayName`:

```tsx
      displayName={displayName}
      showNameOnPage={showNameOnPage}
      chainName={chainName}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(main\)/page.tsx
git commit -m "feat: forward showNameOnPage from page config to HomePageClient"
```

---

## Task 5: HomePageClient — conditionally render name

**Files:**
- Modify: `apps/web/src/components/home/HomePageClient.tsx`

There are four `<h1>{displayName}</h1>` renders — one per hero style (quilt, rectangle, fullpage-mobile, fullpage-desktop). Each needs to be gated.

- [ ] **Step 1: Add showNameOnPage to Props interface**

Find `displayName: string` in `HomePageClientProps` and add `showNameOnPage` after it:

```typescript
  displayName: string
  showNameOnPage: boolean
  chainName?: string | null
```

- [ ] **Step 2: Add showNameOnPage to destructure**

Find `displayName,` in the function destructure and add `showNameOnPage` after it:

```typescript
  displayName,
  showNameOnPage,
  chainName,
```

- [ ] **Step 3: Gate the quilt h1 (mobile + desktop)**

Find the quilt hero `<div className="mb-3 sm:mb-4 text-center">` block:

```tsx
            <div className="mb-3 sm:mb-4 text-center">
              <h1 className="text-2xl font-bold text-[var(--color-text)] sm:text-4xl">{displayName}</h1>
              {chainLabel && <p ...>{chainLabel}</p>}
              {tagline && <p ...>{tagline}</p>}
            </div>
```

Replace the `<h1>` line:

```tsx
              {showNameOnPage && <h1 className="text-2xl font-bold text-[var(--color-text)] sm:text-4xl">{displayName}</h1>}
```

- [ ] **Step 4: Gate the rectangle h1**

Find the rectangle hero `<div className="mb-3 sm:mb-4 text-center">` block and apply the same change:

```tsx
              {showNameOnPage && <h1 className="text-2xl font-bold text-[var(--color-text)] sm:text-4xl">{displayName}</h1>}
```

- [ ] **Step 5: Gate the fullpage mobile h1**

Find the mobile fullpage hero `<div className="mb-3 text-center">` block:

```tsx
              {showNameOnPage && <h1 className="text-2xl font-bold text-[var(--color-text)]">{displayName}</h1>}
```

- [ ] **Step 6: Gate the fullpage desktop h1**

Find the desktop fullpage hero `<div className="w-full text-center">` block:

```tsx
              {showNameOnPage && <h1 className="text-5xl font-bold text-white drop-shadow-lg lg:text-6xl">{displayName}</h1>}
```

- [ ] **Step 7: Verify no TypeScript errors**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "error" | head -20
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/home/HomePageClient.tsx
git commit -m "feat: gate hero h1 name display behind showNameOnPage prop"
```

---

## Task 6: Admin — chain design page toggle

**Files:**
- Modify: `apps/web/src/app/admin/design/chain/page.tsx`

The chain design page uses a `draft` typed as `OrgDesignDefaultsConfig`. It already imports `Toggle`.

- [ ] **Step 1: Add Toggle after displayName field**

Find the existing displayName `TextInput` in the chain page:

```tsx
<TextInput value={draft.displayName ?? ''} onChange={v => set('displayName', v || null)} placeholder="e.g. Grand Hotels Collection" />
```

Add the toggle immediately after it (inside the same `Section` or `FormRow` group):

```tsx
<TextInput value={draft.displayName ?? ''} onChange={v => set('displayName', v || null)} placeholder="e.g. Grand Hotels Collection" />
<FormRow label="Show name on page">
  <Toggle
    checked={draft.showNameOnPage ?? true}
    onChange={v => set('showNameOnPage', v)}
  />
</FormRow>
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "error" | head -10
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/design/chain/page.tsx
git commit -m "feat: add showNameOnPage toggle to chain design admin"
```

---

## Task 7: Admin — hotel homepage design page toggle

**Files:**
- Modify: `apps/web/src/app/admin/design/homepage/page.tsx`

This page uses the override-row pattern (`OverrideToggleRow`) which shows the system default and allows the hotel to override it.

- [ ] **Step 1: Add OverrideToggleRow after the displayName OverrideTextRow**

Find:

```tsx
          <OverrideTextRow label="Hotel name" fieldKey="displayName"
```

Add after the entire `OverrideTextRow` for displayName closes:

```tsx
          <OverrideToggleRow
            label="Show name on page"
            fieldKey="showNameOnPage"
            systemDefault={true}
            draft={draft}
            sysDefs={sysDefs}
            set={set}
            clear={clear}
          />
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "error" | head -10
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/design/homepage/page.tsx
git commit -m "feat: add showNameOnPage override toggle to hotel homepage design admin"
```

---

## Self-Review Checklist

- [x] **Schema**: Both `HotelConfig` and `OrgDesignDefaults` get the field — different nullability follows existing patterns
- [x] **Types**: All three relevant shared interfaces updated (`HotelDesignConfig`, `UpdateDesignConfigRequest`, `OrgDesignDefaultsConfig`)
- [x] **Service reads**: `fetchConfig` and `fetchOrgConfig` both return resolved booleans with `?? true` fallback
- [x] **Service writes**: `upsertHotelDesignConfig` and `upsertOrgDesignDefaults` handle incoming updates
- [x] **Frontend**: `showNameOnPage` extracted in `page.tsx`, forwarded to `HomePageClient`, all four `<h1>` renders gated
- [x] **Admin**: Toggle added to both chain page and hotel homepage page
- [x] **WA greeting unaffected**: `whatsappPrefilledMessage` uses `displayName` directly in `page.tsx`, not touched by this feature
- [x] **Default is true**: Existing deployments show the name without any DB changes
