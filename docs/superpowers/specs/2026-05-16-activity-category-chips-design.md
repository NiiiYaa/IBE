# Activity Category Filter Chips — Design Spec

**Date:** 2026-05-16

## Overview

Add horizontal category filter chips to the Amadeus activities and Ticketmaster events strips in `EventsStrip`. Clicking a chip filters the visible cards to that category. Works in both separate and merged strip modes.

---

## Chip Sources

| Strip | Source fields |
|-------|---------------|
| Amadeus activities | `activity.category` |
| Ticketmaster events | `event.category` AND `event.genre` (both pooled) |
| Merged mode | All of the above pooled together |

Rules:
- Null/empty values are skipped
- Values deduplicated (case-sensitive, as received from API)
- Sorted alphabetically
- "All" prepended as the first chip (always selected by default)
- Chip row only rendered when there is at least one real category chip (i.e., `chips.length > 1`)

---

## Filtering Logic

- `"All"` → show all items (no filter)
- Amadeus activity matches chip if `activity.category === activeChip`
- Ticketmaster event matches chip if `event.category === activeChip || event.genre === activeChip`
- Merged mode applies the same per-item-type matching

---

## State

| Mode | State variable | Default |
|------|---------------|---------|
| Separate — TM strip | `activeTmChip: string` | `'All'` |
| Separate — Amadeus strip | `activeAmChip: string` | `'All'` |
| Merged strip | `activeMergedChip: string` | `'All'` |

State lives in `EventsStrip` (sibling to `tmDismissed`/`amDismissed`).

---

## Component Changes

### `StripSection` — three new props

```ts
chips?: string[]          // full list including 'All'; omit or pass [] to hide chip row
activeChip?: string       // currently selected chip
onChipChange?: (chip: string) => void
```

- Chip row renders between the header and the card carousel
- Only rendered when `chips && chips.length > 1`
- Chip row is horizontally scrollable (`overflow-x-auto scrollbar-hide`)
- Same border-top separator as the cards row
- Active chip: `bg-[var(--color-primary)] text-white`
- Inactive chip: `border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]`
- Chip style: `rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap`

### `EventsStrip` — filtering + chip computation

Three helper functions (inline, not exported):

```ts
function amChips(activities: AmadeusActivity[]): string[]
function tmChips(events: TmEvent[]): string[]
function mergedChips(activities: AmadeusActivity[], events: TmEvent[]): string[]
```

Each: collect relevant fields (handling `string | null | undefined`) → filter null/empty → deduplicate via `Set` → sort → prepend `'All'`.

Filtering happens before passing `children` to `StripSection`:

```ts
const filteredAmActivities = activeAmChip === 'All'
  ? amActivities
  : amActivities.filter(a => a.category === activeAmChip)

const filteredTmEvents = activeTmChip === 'All'
  ? tmEvents
  : tmEvents.filter(e => e.category === activeTmChip || e.genre === activeTmChip)
```

Merged mode uses `activeMergedChip` and applies both filters.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/components/weather/EventsStrip.tsx` | Add chip props to `StripSection`, chip computation + filter state to `EventsStrip` |

No backend changes. No new files. No translation keys needed (chip labels come directly from the API data).

---

## Out of Scope

- Persisting the selected chip across page navigations
- Multi-select (only one chip active at a time)
- Admin control over which categories appear
