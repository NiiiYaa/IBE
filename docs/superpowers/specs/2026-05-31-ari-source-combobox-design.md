# ARI Source Combobox — Design Spec

**Date:** 2026-05-31
**Status:** Approved

## Problem

The current ARI source selection is split across two separate UI elements (a `pmsId` selector for known VendorFlows and an `unknownPmsName` free-text input for everything else) and two separate lists (`@ibe/onboarding-flows` VendorFlows and `apps/web/src/lib/ari-systems.ts`). This creates a 2-step flow for unknown systems and gives no visibility into whether an unknown system is a known-but-not-yet-integrated one or a truly unrecognised one.

## Goal

One unified combobox that covers all three tiers, used in both the admin invitation form and the hotel self-registration page.

---

## Data Layer

**Location:** `@ibe/shared`

Move `ARI_SYSTEMS` from `apps/web/src/lib/ari-systems.ts` into `@ibe/shared`. Add a merged export:

```ts
export type AriSourceOption =
  | { kind: 'hg_has';      pmsId: number; name: string; category: 'PMS' | 'CM' | 'CRS' }
  | { kind: 'to_be_added'; name: string;  category: 'PMS' | 'CM' | 'CRS' }

export function getAriSourceList(): AriSourceOption[]
```

`getAriSourceList()` merges VendorFlow names (imported from `@ibe/onboarding-flows`) with the `ARI_SYSTEMS` array. VendorFlows come first. The "to be checked" tier is not a stored list — it is created at runtime from the user's free-text input.

`apps/web` re-exports `ARI_SYSTEMS` from `@ibe/shared` to avoid breaking existing imports.

---

## DB Schema

New nullable column on `OnboardingInvitation`:

```prisma
unknownPmsStatus  String?  // 'to_be_added' | 'to_be_checked'
```

**Semantics:**

| pmsId | unknownPmsName | unknownPmsStatus | Meaning |
|-------|---------------|-----------------|---------|
| set   | null          | null            | HG has this system |
| null  | set           | `to_be_added`   | Known system, not yet integrated |
| null  | set           | `to_be_checked` | Free-text unknown system |
| null  | set           | null            | Legacy unknown (pre-migration) |

Existing invitations with `unknownPmsName` and no status remain as-is. The admin table displays them without a classification badge.

---

## API

File: `apps/api/src/routes/onboarding-admin.route.ts`

1. `createInvitationSchema` gains:
   ```ts
   unknownPmsStatus: z.enum(['to_be_added', 'to_be_checked']).optional()
   ```
2. Creation handler saves `unknownPmsStatus` alongside `unknownPmsName`.
3. Invitation list `GET` adds `unknownPmsStatus` to the Prisma select.

No new endpoints needed.

---

## Components

Two separate `AriSystemCombobox` components — one in `apps/admin`, one in `apps/onboarding` — both consuming `getAriSourceList()` from `@ibe/shared`.

### Behavior

- **Click/focus** → dropdown opens with full grouped list
- **Type** → real-time filter across both sections by name
- **No match** → third section appears with a single option: `Add "[typed text]"`
- **Select** → dropdown closes, `onChange` fires with the selection
- **Keyboard** → ↑ ↓ to navigate, Enter to select, Escape to close

### Dropdown sections (in order)

1. **✓ HG Connected** — VendorFlow items (`kind: 'hg_has'`)
2. **+ To Be Added** — ARI_SYSTEMS items (`kind: 'to_be_added'`)
3. **? Unknown** — appears only when typed text has no match; single `Add "..."` option (`kind: 'to_be_checked'`)

### Output type

```ts
type AriSelection =
  | { kind: 'hg_has';       pmsId: number; name: string }
  | { kind: 'to_be_added';  name: string }
  | { kind: 'to_be_checked'; name: string }
```

### Placement

- **`apps/admin`** — invitation creation form; replaces the separate `pmsId` selector and `unknownPmsName` text input
- **`apps/onboarding/src/app/page.tsx`** — self-registration form; replaces the hardcoded SiteMinder `<select>`

Both components are ~100–120 lines, no external combobox library. Built with a `<div>` wrapper, `<input>`, filtered list, and keyboard navigation.

---

## Out of Scope

- Editing the ARI source selection after an invitation is created (future)
- Displaying `unknownPmsStatus` in the HG staff Slack notification (future)
- Migrating legacy `unknownPmsName` rows to a status value (low value, null is fine)
