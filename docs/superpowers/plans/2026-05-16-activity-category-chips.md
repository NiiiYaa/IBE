# Activity Category Filter Chips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add horizontal category filter chips to the Amadeus activities and Ticketmaster events strips so guests can filter cards by category in both separate and merged modes.

**Architecture:** All logic lives in `EventsStrip.tsx` — chip computation helpers derive unique labels from activity/event data, per-strip state tracks the active chip, and filtered arrays are passed as `children` to `StripSection`. `StripSection` gains three optional props (`chips`, `activeChip`, `onChipChange`) and renders a scrollable chip row between the header and the card carousel.

**Tech Stack:** React (useState, client component), TypeScript, Tailwind CSS via CSS variables. No backend changes. No new files.

---

### Task 1: Add chip row to `StripSection` + chip computation helpers

**Files:**
- Modify: `apps/web/src/components/weather/EventsStrip.tsx`

- [ ] **Step 1: Add three optional props to `StripSection`**

In `EventsStrip.tsx`, find the `StripSection` function signature (currently ends with `children: React.ReactNode`). Replace the entire props destructuring and type annotation with:

```tsx
function StripSection({
  label,
  icon,
  hasItems,
  stripDefaultFolded,
  stripAutoFoldSecs,
  onDismiss,
  chips,
  activeChip,
  onChipChange,
  children,
}: {
  label: React.ReactNode
  icon?: React.ReactNode
  hasItems: boolean
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
  onDismiss: () => void
  chips?: string[]
  activeChip?: string
  onChipChange?: (chip: string) => void
  children: React.ReactNode
})
```

- [ ] **Step 2: Render the chip row inside `StripSection`**

Find this block inside `StripSection`:

```tsx
      {/* Cards */}
      {hasItems && !folded && (
        <div className="flex overflow-x-auto px-2 py-1.5 gap-1.5 scrollbar-hide border-t border-[var(--color-border)]">
          {children}
        </div>
      )}
```

Replace it with:

```tsx
      {/* Chip row */}
      {!folded && chips && chips.length > 1 && (
        <div className="flex overflow-x-auto gap-1.5 px-3 py-1.5 scrollbar-hide border-t border-[var(--color-border)]">
          {chips.map(chip => (
            <button
              key={chip}
              type="button"
              onClick={() => onChipChange?.(chip)}
              className={[
                'rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors',
                chip === (activeChip ?? 'All')
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
              ].join(' ')}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      {hasItems && !folded && (
        <div className="flex overflow-x-auto px-2 py-1.5 gap-1.5 scrollbar-hide border-t border-[var(--color-border)]">
          {children}
        </div>
      )}
```

- [ ] **Step 3: Add chip computation helpers above `EventsStrip`**

Add these three functions directly above the `EventsStrip` function declaration (after the `StripSection` function):

```ts
function computeAmChips(activities: AmadeusActivity[]): string[] {
  const set = new Set<string>()
  for (const a of activities) {
    if (a.category) set.add(a.category)
  }
  return ['All', ...Array.from(set).sort()]
}

function computeTmChips(events: TmEvent[]): string[] {
  const set = new Set<string>()
  for (const e of events) {
    if (e.category) set.add(e.category)
    if (e.genre && e.genre !== 'Undefined') set.add(e.genre)
  }
  return ['All', ...Array.from(set).sort()]
}

function computeMergedChips(activities: AmadeusActivity[], events: TmEvent[]): string[] {
  const set = new Set<string>()
  for (const a of activities) {
    if (a.category) set.add(a.category)
  }
  for (const e of events) {
    if (e.category) set.add(e.category)
    if (e.genre && e.genre !== 'Undefined') set.add(e.genre)
  }
  return ['All', ...Array.from(set).sort()]
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/nir/ibe
pnpm --filter @ibe/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/weather/EventsStrip.tsx
git commit -m "feat: chip row in StripSection + chip computation helpers"
```

---

### Task 2: Wire category filtering in separate mode

**Files:**
- Modify: `apps/web/src/components/weather/EventsStrip.tsx`

- [ ] **Step 1: Add chip state variables to `EventsStrip`**

Inside `EventsStrip`, find the existing state declarations (`tmDismissed`, `amDismissed`). Add two new state variables directly after them:

```ts
  const [activeTmChip, setActiveTmChip] = useState('All')
  const [activeAmChip, setActiveAmChip] = useState('All')
```

- [ ] **Step 2: Compute chip lists and filtered arrays**

After the lines that compute `tmEvents` and `amActivities` (currently: `const tmEvents = data.ticketmaster?.events ?? []` and `const amActivities = data.amadeus?.activities ?? []`), add:

```ts
  const tmChips = computeTmChips(tmEvents)
  const amChips = computeAmChips(amActivities)

  const filteredTmEvents = activeTmChip === 'All'
    ? tmEvents
    : tmEvents.filter(e => e.category === activeTmChip || e.genre === activeTmChip)

  const filteredAmActivities = activeAmChip === 'All'
    ? amActivities
    : amActivities.filter(a => a.category === activeAmChip)
```

- [ ] **Step 3: Pass chips props to the Ticketmaster `StripSection`**

Find the separate-mode Ticketmaster `StripSection` (the one with `onDismiss={() => setTmDismissed(true)}`). Add the three chip props and swap `tmEvents` for `filteredTmEvents` in the `.map()`:

```tsx
      {tmEnabled && !tmDismissed && (
        <StripSection
          label={
            <>
              <span>{t('eventsNearby')}</span>
              {(data.ticketmaster?.events?.length ?? 0) === 0 && (
                <span className="text-[10px] text-[var(--color-text-muted)]">{t('noEventsFound')}</span>
              )}
            </>
          }
          icon={ticketIcon}
          hasItems={tmEvents.length > 0}
          {...(data.ticketmaster?.stripDefaultFolded !== undefined && { stripDefaultFolded: data.ticketmaster.stripDefaultFolded })}
          {...(data.ticketmaster?.stripAutoFoldSecs !== undefined && { stripAutoFoldSecs: data.ticketmaster.stripAutoFoldSecs })}
          onDismiss={() => setTmDismissed(true)}
          chips={tmChips}
          activeChip={activeTmChip}
          onChipChange={setActiveTmChip}
        >
          {filteredTmEvents.map((event, i) => (
            <TicketmasterEventCard key={i} event={event} locale={locale} showBookButton={tmShowBook} />
          ))}
        </StripSection>
      )}
```

- [ ] **Step 4: Pass chips props to the Amadeus `StripSection`**

Find the separate-mode Amadeus `StripSection` (the one with `onDismiss={() => setAmDismissed(true)}`). Add the three chip props and swap `amActivities` for `filteredAmActivities` in the `.map()`:

```tsx
      {amEnabled && !amDismissed && (
        <StripSection
          label={data.amadeus?.stripLabel ?? t('activitiesAndTours')}
          icon={activityIcon}
          hasItems={amActivities.length > 0}
          {...(data.amadeus?.stripDefaultFolded !== undefined && { stripDefaultFolded: data.amadeus.stripDefaultFolded })}
          {...(data.amadeus?.stripAutoFoldSecs !== undefined && { stripAutoFoldSecs: data.amadeus.stripAutoFoldSecs })}
          onDismiss={() => setAmDismissed(true)}
          chips={amChips}
          activeChip={activeAmChip}
          onChipChange={setActiveAmChip}
        >
          {filteredAmActivities.map((activity, i) => (
            <ActivityCard key={i} activity={activity} showBookButton={amShowBook} />
          ))}
        </StripSection>
      )}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /home/nir/ibe
pnpm --filter @ibe/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/weather/EventsStrip.tsx
git commit -m "feat: category filter chips in separate-mode strips"
```

---

### Task 3: Wire category filtering in merged mode

**Files:**
- Modify: `apps/web/src/components/weather/EventsStrip.tsx`

- [ ] **Step 1: Add merged chip state variable**

Inside `EventsStrip`, add alongside `activeTmChip`/`activeAmChip`:

```ts
  const [activeMergedChip, setActiveMergedChip] = useState('All')
```

- [ ] **Step 2: Compute merged chips and filtered merged items**

Find the merged-mode block (starts with `if (stripMode === 'merged' ...)`). Inside this block, after the `mergedItems` array is built, add:

```ts
    const mergedChips = computeMergedChips(amActivities, tmEvents)

    const filteredMergedItems = activeMergedChip === 'All'
      ? mergedItems
      : mergedItems.filter(item => {
          if (item.kind === 'activity') return item.item.category === activeMergedChip
          return item.item.category === activeMergedChip || item.item.genre === activeMergedChip
        })
```

- [ ] **Step 3: Pass chips props to the merged `StripSection` and use filtered items**

Find the merged-mode `StripSection` return. Add chip props and swap `mergedItems` for `filteredMergedItems` in the `.map()`:

```tsx
    return (
      <StripSection
        label={mergedLabel}
        icon={activityIcon}
        hasItems={mergedItems.length > 0}
        {...(data.amadeus?.stripDefaultFolded !== undefined && { stripDefaultFolded: data.amadeus.stripDefaultFolded })}
        {...(data.amadeus?.stripAutoFoldSecs !== undefined && { stripAutoFoldSecs: data.amadeus.stripAutoFoldSecs })}
        onDismiss={() => { setTmDismissed(true); setAmDismissed(true) }}
        chips={mergedChips}
        activeChip={activeMergedChip}
        onChipChange={setActiveMergedChip}
      >
        {filteredMergedItems.map((item, i) =>
          item.kind === 'event'
            ? <TicketmasterEventCard key={`event-${i}`} event={item.item} locale={locale} showBookButton={tmShowBook} />
            : <ActivityCard key={`activity-${i}`} activity={item.item} showBookButton={amShowBook} />
        )}
      </StripSection>
    )
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/nir/ibe
pnpm --filter @ibe/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Browser verify**

Start the dev server if not already running:
```bash
pnpm --filter @ibe/web dev
```

Open a search page for a property that has Amadeus activities enabled (requires a configured Channel UUID + coordinates).

Check:
1. **Separate mode** — Amadeus strip shows chips below its header. "All" is selected by default and highlighted. Clicking a category chip filters the card row to only show that category. Clicking "All" restores all cards.
2. **TM strip** — same behaviour; genres appear as chips alongside category names (e.g. "Music" and "Rock" both appear if present).
3. **Merged mode** — set `stripMode` to `'merged'` in admin config, reload. Single strip shows pooled chips from both sources. Filtering works the same way.
4. **No categories** — if all activities have `category: null`, no chip row appears (just the cards, same as before).
5. **Folded strip** — chip row is hidden when strip is folded, reappears when unfolded.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/weather/EventsStrip.tsx
git commit -m "feat: category filter chips in merged-mode strip"
```
