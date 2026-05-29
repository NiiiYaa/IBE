# direct-book.com IBE Harvester — Design Spec

## Summary

Add a Playwright-based IBE harvester for `direct-book.com` hotel booking pages. It plugs into the existing self-onboarding pipeline via the `IbeHarvester` interface and produces `HarvestedHotelData` in the same shape as the existing SynXis harvester.

## Detection

direct-book.com is already registered in `packages/shared/src/utils/known-ibe-registry.ts` with a `domainPattern` and templates. `detectKnownIBE(url)` returns `{ name: 'direct-book.com', externalHotelId, searchTemplate, bookingTemplate }` for any `/properties/{slug}` URL.

## Approach: JSON Response Interception (with DOM Fallback)

direct-book.com is a React SPA that fetches availability and property data from its own internal REST API. The harvester intercepts all JSON responses during page navigation using `page.on('response', ...)`.

**Why interception over DOM scraping:** React class names are minified and unstable. The underlying API response gives structured, clean data. This is more resilient to UI updates.

**Enabling interception:** `withStealthPage` is called with a new `beforeNavigate` option (a callback invoked on the page before `goto` fires). This lets us register `page.on('response', ...)` before the initial page load so we capture all responses.

**Parsing by shape:** Rather than hardcoded field paths, helpers (`tryParsePropertyInfo`, `tryParseRooms`) detect data by structural signature — e.g., an object with a `name` string and any of `address`/`description`/`city` is treated as property info. This survives minor API renames.

**DOM fallback:** If shape detection finds no rooms data (bot protection, unexpected structure), falls back to CSS selector scraping of room cards and rate rows.

## withStealthPage Extension

Add `beforeNavigate?: (page: Page) => void` to the options type. Called after page creation, before `goto`. Backwards-compatible — all existing callers are unaffected.

## Multi-Search Strategy

Six occupancy patterns `[1,0],[2,0],[3,0],[4,0],[2,1],[2,2]` × two date windows (7d and 30d out) = up to 12 page loads. Stops early after 3 consecutive occupancy passes with no new rooms.

URL building: replace `items[0][adults]=0` and `items[0][children]=0` in the template.

## Shared Utility: `board-normalizer.ts`

`normaliseBoard(label)` is currently inlined in `synxis-harvester.ts`. Extract it to `harvesters/board-normalizer.ts` so both harvesters share it. SynXis imports the same function after extraction.

## Data Output

`HarvestedHotelData` with:
- **Hotel info:** name, stars, address, city, country, description, images (up to 20), amenities
- **Rooms:** name, description, images, amenities, bed config, supported occupancies, maxAdults, maxOccupancy
- **Rate plan types:** boardCode (`RO`/`BB`/`HB`/`FB`/`AI`) × refundable/NR; cancellation policy text parsed via existing `parseCancellationPolicy`
- **Taxes:** from API response if present, else `lookupTaxes(country, city)` fallback
- **Age policy:** `null` — age sweep is resource-intensive; deferred to a later iteration

## Files

`known-ibe-registry.ts` is NOT touched — all 13 IBE patterns stay as-is.

| Action | Path |
|--------|------|
| Create | `packages/shared/src/utils/ibe-extractors/board-normalizer.ts` |
| Create | `packages/shared/src/utils/ibe-extractors/direct-book.ts` |
| Create | `packages/shared/src/utils/ibe-extractors/index.ts` |
| Modify | `packages/shared/src/index.ts` — add 1 export line |
| Create | `packages/shared/src/__tests__/ibe-extractors.test.ts` |
| Modify | `apps/onboarding-api/src/services/playwright-browser.service.ts` — add `beforeNavigate` option |
| Create | `apps/onboarding-api/src/services/harvesters/direct-book-harvester.ts` |
| Create | `apps/onboarding-api/src/services/__tests__/direct-book-harvester.test.ts` |
| Modify | `apps/onboarding-api/src/services/harvesters/synxis-harvester.ts` — use shared `normaliseBoard` |
| Modify | `apps/onboarding-api/src/services/ibe-harvester-map.ts` — register DirectBookHarvester |
| Modify | `apps/api/src/services/compset-collect.service.ts` — add direct-book.com extractor |
