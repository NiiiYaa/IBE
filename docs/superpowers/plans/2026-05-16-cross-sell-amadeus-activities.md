# Cross-Sell: Amadeus Activities & Tours Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Activities & Tours" section to the cross-sell page showing Amadeus activities below the existing Ticketmaster events section.

**Architecture:** Replace the separate `/events` fetch with a single `apiClient.getActivitiesAndEvents()` call (already returns both `ticketmaster` and `amadeus`). Derive TM events and Amadeus activities from the combined response. Add `AmadeusActivityCard` component and a new section in the JSX.

**Tech Stack:** Next.js 14 (client component), TanStack Query, `@ibe/shared` types, Tailwind CSS via CSS variables.

---

### Task 1: Add translation keys

**Files:**
- Modify: `apps/api/src/translations/en.json`

- [ ] **Step 1: Add `activitiesAndTours` and `bookNow` to `crossSell` namespace**

In `en.json`, find the `"crossSell"` block and add two keys:

```json
"crossSell": {
    "enhanceYourStay": "Enhance Your Stay",
    "addExtras": "Add extras to your booking #{id}",
    "addToYourStay": "Add to your stay",
    "eventsNearHotel": "Events near the hotel",
    "activitiesAndTours": "Activities & Tours",
    "bookNow": "Book now",
    "loadingOffers": "Loading offers…",
    "noExtrasAvailable": "No extras available at this time.",
    "perNight": "{amount} × {nights} nights = {total}",
    "selectedExtrasTotal": "Selected extras total",
    "payableAtHotel": "Payable at the hotel on arrival",
    "addToMyStay": "Add to my stay →",
    "skipConfirmation": "No thanks, skip to confirmation →",
    "getTickets": "Get tickets →",
    "includesTax": "Includes {pct}% tax"
  }
```

- [ ] **Step 2: Verify the API server reloaded (it uses `--watch`)**

Check the terminal running the dev server — it should auto-reload on `.json` change. No manual restart needed.

---

### Task 2: Update the cross-sell page

**Files:**
- Modify: `apps/web/src/app/(main)/booking/cross-sell/[bookingId]/page.tsx`

- [ ] **Step 1: Update imports**

Replace:
```ts
import type { CrossSellProduct, PublicCrossellResponse } from '@ibe/shared'
```
With:
```ts
import type { CrossSellProduct, PublicCrossellResponse, AmadeusActivity, ActivitiesAndEventsResponse } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
```

(`apiClient` is already imported — just add the new types.)

- [ ] **Step 2: Add `AmadeusActivityCard` component** (above `EventCard`)

```tsx
function AmadeusActivityCard({ activity, showBookButton }: { activity: AmadeusActivity; showBookButton: boolean }) {
  const t = useT('crossSell')
  return (
    <a
      href={showBookButton && activity.bookingUrl ? activity.bookingUrl : '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden hover:border-[var(--color-primary)] hover:shadow-md transition-all"
    >
      {activity.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={activity.thumb} alt={activity.name} className="h-28 w-full object-cover" />
      ) : (
        <div className="h-10 flex items-center justify-center bg-[var(--color-background)]">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {activity.category ?? 'Activity'}
          </span>
        </div>
      )}
      <div className="px-3 py-2.5 flex flex-col gap-1 flex-1">
        <p className="text-sm font-semibold text-[var(--color-text)] line-clamp-2 leading-snug">{activity.name}</p>
        {activity.description && (
          <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">{activity.description}</p>
        )}
        {activity.duration && (
          <p className="text-xs text-[var(--color-text-muted)]">{activity.duration}</p>
        )}
        {activity.price != null && activity.currency && (
          <p className="text-xs font-medium text-[var(--color-primary)]">
            {new Intl.NumberFormat(undefined, { style: 'currency', currency: activity.currency }).format(activity.price)}
          </p>
        )}
        {showBookButton && activity.bookingUrl && (
          <span className="mt-auto pt-1.5 text-xs font-semibold text-[var(--color-primary)]">{t('bookNow')}</span>
        )}
      </div>
    </a>
  )
}
```

- [ ] **Step 3: Replace the events query with a combined query**

Replace:
```ts
  const { data: eventsData } = useQuery<{ enabled: boolean; events?: Array<{ name: string; date: string | null; time: string | null; category: string | null; genre: string | null; venue: string | null; ticketUrl: string | null; thumb: string | null }> }>({
    queryKey: ['events-public', propertyId],
    queryFn: () => fetch(`/api/v1/events?propertyId=${propertyId}`).then(r => r.ok ? r.json() : { enabled: false }),
    enabled: propertyId > 0,
  })
```
With:
```ts
  const { data: combinedData } = useQuery<ActivitiesAndEventsResponse>({
    queryKey: ['activities-and-events', propertyId],
    queryFn: () => apiClient.getActivitiesAndEvents(propertyId),
    enabled: propertyId > 0,
  })
```

- [ ] **Step 4: Update derived data**

Replace:
```ts
  const externalEvents = (data?.showExternalEvents && eventsData?.enabled) ? (eventsData.events ?? []) : []
```
With:
```ts
  const externalEvents = (data?.showExternalEvents && combinedData?.ticketmaster?.enabled) ? (combinedData.ticketmaster.events ?? []) : []
  const amActivities = combinedData?.amadeus?.enabled ? (combinedData.amadeus.activities ?? []) : []
  const amShowBook = combinedData?.amadeus?.showBookButton ?? true
```

- [ ] **Step 5: Update `hasContent`**

Replace:
```ts
  const hasContent = activeProducts.length > 0 || externalEvents.length > 0
```
With:
```ts
  const hasContent = activeProducts.length > 0 || externalEvents.length > 0 || amActivities.length > 0
```

- [ ] **Step 6: Add Activities & Tours section** (after the Ticketmaster `{externalEvents.length > 0 && ...}` section, before the Skip link)

```tsx
      {/* Amadeus activities */}
      {amActivities.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{t('activitiesAndTours')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {amActivities.slice(0, 6).map(activity => (
              <AmadeusActivityCard key={activity.id} activity={activity} showBookButton={amShowBook} />
            ))}
          </div>
        </section>
      )}
```

- [ ] **Step 7: Verify in browser**

Open `http://localhost:3000/booking/cross-sell/test` (or navigate through a booking flow). With Amadeus configured for the property, the "Activities & Tours" section should appear below "Events Near Hotel". With no Amadeus config or `enabled=false`, it should be absent. No console errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/\(main\)/booking/cross-sell/\[bookingId\]/page.tsx apps/api/src/translations/en.json
git commit -m "feat: add Amadeus activities section to cross-sell page"
```
