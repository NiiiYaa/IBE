# Onboarding Sub-Menu Pages — Design Spec

## Summary

Add two sub-menu pages under the Onboarding nav section: ARI Sources (lists registered VendorFlows) and IBEs (lists known IBE patterns from the registry). Both are static, frontend-only pages with a search filter at the top. No new API endpoints needed.

## Navigation Changes (`_layout-client.tsx`)

### Sub-menu items

Add two items to the Onboarding section (currently only has Hotel Onboarding):

```typescript
{
  title: 'Onboarding',
  minRole: 'admin',
  items: [
    { href: '/admin/hotel-onboarding', label: 'Hotel Onboarding', minRole: 'admin' },
    { href: '/admin/hotel-onboarding/ari-sources', label: 'ARI Sources', minRole: 'admin' },
    { href: '/admin/hotel-onboarding/ibes', label: 'IBEs', minRole: 'admin' },
  ],
},
```

### ob_agent redirect fix

The current ob_agent redirect checks `pathname !== '/admin/hotel-onboarding'` — this would redirect OB agents away from the new sub-pages. Change to `!pathname.startsWith('/admin/hotel-onboarding')`.

## ARI Sources Page (`/admin/hotel-onboarding/ari-sources/page.tsx`)

Static data hardcoded in the component — the VendorFlow registry is code, not DB rows.

**Data (2 rows, expandable as new CMs are registered):**

| Field | SiteMinder | TravelClick |
|-------|-----------|-------------|
| pmsId | 12 | 25 |
| dataFlow | blank | blank |
| useDefaultCodes | No | Yes |
| regionAware | Yes | Yes |
| requiresStaffChannelSetup | No | No |
| steps | 13 | 13 |

**Columns displayed:** Name, pmsId, Data Flow (badge: amber=blank, green=hg_pulls), Default Codes (Yes/No), Region Aware (Yes/No), Steps count.

**Filter:** single text input at top, filters by name (case-insensitive).

## IBEs Page (`/admin/hotel-onboarding/ibes/page.tsx`)

Static data — 13 entries from `known-ibe-registry.ts`. Data hardcoded in the component.

**Columns:** Name, Detection (Domain / Params / Domain+Params), Scraping (✓ Full / ⚠ Search only), Harvester (✅ / ❌), View (external link or "—").

**Scraping badge:** "✓ Full" when `noScraping` is absent/false; "⚠ Search only" when `noScraping: true`.

**Harvester:** ✅ when entry is in `ibeHarvesterMap` (currently: Sabre SynXis, direct-book.com, SimpleBooking.it); ❌ otherwise.

**View link:** canonical domain URL for domain-based IBEs; "—" for white-labeled/param-based IBEs.

| Name | Detection | noScraping | Harvester | View |
|------|-----------|-----------|-----------|------|
| Sentec | Domain | No | ✅ | https://booking.sentec.io |
| SimpleBooking.it | Domain | No | ✅ | https://www.simplebooking.it |
| direct-book.com | Domain | No | ✅ | https://direct-book.com |
| BookingExpert | Domain+Params | Yes | ❌ | https://be.bookingexpert.it |
| Falkensteiner | Domain | Yes | ❌ | https://www.falkensteiner.com |
| BookSecure | Domain | Yes | ❌ | https://www.book-secure.com |
| Sabre SynXis | Params | Yes | ✅ | — |
| WebHotelier | Domain | Yes | ❌ | https://reserve-online.net |
| Hotels of Mykonos | Domain | Yes | ❌ | https://hotelsofmykonos.com |
| Zenith Hotels (MY) | Domain | Yes | ❌ | https://www.thezenithhotel.com |
| Lighthouse | Domain | Yes | ❌ | https://bookingengine.mylighthouse.com |
| TravelClick | Params | Yes | ❌ | — |
| Hotetec | Params | Yes | ❌ | — |

**Filter:** single text input at top, filters by name (case-insensitive).

## Files

| Action | Path |
|--------|------|
| Create | `apps/web/src/app/admin/hotel-onboarding/ari-sources/page.tsx` |
| Create | `apps/web/src/app/admin/hotel-onboarding/ibes/page.tsx` |
| Modify | `apps/web/src/app/admin/_layout-client.tsx` |
