# Cross-Sell: Amadeus Activities & Tours Section

**Date:** 2026-05-16

## Summary

Add a separate "Activities & Tours" section to the cross-sell page (`/booking/cross-sell/[bookingId]`) showing Amadeus activities below the existing Ticketmaster "Events Near Hotel" section.

## Changes

### API call
Replace the separate `/api/v1/events` query with a single `/api/v1/activities-and-events` call (already returns both `ticketmaster` and `amadeus` fields). No backend changes required.

### Ticketmaster section
Unchanged. Driven by `tmResult` (the `ticketmaster` field of the combined response). Conditional on `data?.showExternalEvents && tmResult.enabled`.

### New Amadeus section
- Shown when `amadeusResult.enabled && activities.length > 0`
- Heading: "Activities & Tours" (translation key `activitiesAndTours`, already in en.json)
- Max 6 activities
- Same 2-col / 3-col grid as events section
- Card contents: thumb image, name, description (2-line clamp), price + currency (if available), duration (if available), "Book Now" link (if `showBookButton && bookingUrl`)
- Cards open booking URL in new tab
- Styled consistently with `EventCard`

## Files Changed

- `apps/web/src/app/(main)/booking/cross-sell/[bookingId]/page.tsx` — replace events query, add `AmadeusActivityCard` component, add Activities & Tours section
