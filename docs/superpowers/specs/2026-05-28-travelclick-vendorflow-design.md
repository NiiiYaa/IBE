# TravelClick VendorFlow — Design Spec

## Summary

Add TravelClick (Amadeus iHotelier) as a supported ARI source in the self-onboarding wizard. Also fix the SiteMinder `pmsId` placeholder (currently `3`, should be `12`).

## Source

- CSV: `ARI_Source_Id: 25`, `ARI_Source_Name: TravelClick`, `Has_Static_Data: 0`, `Form_Type: TRAVELCLICK`
- Zoho KB: "No need to match rate plans or room codes — use default codes (ROOM-01 for rooms, FLEX-AI/NRF-AI etc. for rate plans)"
- Zoho KB: "Mandatory to check price inclusive/exclusive on every TravelClick onboarding"

## VendorFlow Fields

| Field | Value |
|-------|-------|
| `pmsId` | `25` |
| `pmsName` | `'TravelClick'` |
| `dataFlow` | `'blank'` — ARI-only, no static data from CM |
| `useDefaultCodes` | `true` — HG generates room/rate codes; hotel doesn't enter them |
| `requiresStaffChannelSetup` | `false` |
| `regionAware` | `true` |
## Credentials

Single field: `propertyId: z.string().min(1)` — the hotel's TravelClick property identifier. No Booking.com URL needed (IBE scraping replaces that entirely).

## cm_settings

Because `useDefaultCodes: true`, **no rate plan code mapping is shown** in the cm_settings step. The step only asks:
- Currency
- Pricing model (`per_room` / `per_occupancy` / `per_person`)
- Tax relation per tax/fee (mandatory for TravelClick — rates may be tax-inclusive or exclusive)

## Wizard Flow (13 steps, same structure as SiteMinder)

| # | Step ID | Kind |
|---|---------|------|
| 1 | candidate_search | candidate_search |
| 2 | harvest_data | automated |
| 3 | review_data | data_review |
| 4 | ari_source_selection | ari_source_selection |
| 5 | collect_credentials | credentials |
| 6 | cm_settings | cm_settings |
| 7 | create_hg_property | automated |
| 8 | create_rooms | automated |
| 9 | create_rateplans | automated |
| 10 | create_policies | automated |
| 11 | create_taxes | automated |
| 12 | connect_channel | user_action |
| 13 | trigger_ari_sync | automated |

Steps 3, 6: `useDefaultCodes: true` signals to both the frontend and step-executor that room/rate codes are auto-generated — no mapping UI shown, no code entry in data review.

The `connect_channel` user_action message: "Log in to your TravelClick dashboard and add HyperGuest as a channel using your HyperGuest property code. Once done, click Continue."

## `getHGPropertyPayload`

Same shape as SiteMinder but `pmsId: 25` and `hasStaticData: false`.

## SiteMinder pmsId Fix

`packages/onboarding-flows/src/vendors/siteminder.ts` currently has `SITEMINDER_PMS_ID = 3` (placeholder). CSV shows actual value is `12`. Fix it in the same PR.

## `useDefaultCodes` Implementation (new work)

`useDefaultCodes` exists in `VendorFlow` type but is currently unread. Three places need to act on it:

**1. Step executor (`create_rooms`):** When `useDefaultCodes: true`, generate room code as `ROOM-{N:02}` (e.g. `ROOM-01`, `ROOM-02`) instead of using the staff-entered code from `cmSettings`.

**2. Step executor (`create_rateplans`):** When `useDefaultCodes: true`, generate rate plan code from board code + refundability: `FLEX-{BOARD}` for refundable, `NRF-{BOARD}` for non-refundable (e.g. `FLEX-BB`, `NRF-RO`). No `pmsRateplanCode` from `cmSettings.ratePlans` needed.

**3. DataReviewStep frontend:** When `flow.useDefaultCodes === true`, hide the room code entry column. Hotel sees room names only — no code input.

**4. CmSettingsStep frontend:** When `flow.useDefaultCodes === true`, hide the rate plan code mapping column. Hotel configures pricing model + tax relations only.

The wizard session's `dataFlow` endpoint already exposes `flow` fields — add `useDefaultCodes` to the response so the frontend can read it.

## Files

| Action | Path |
|--------|------|
| Create | `packages/onboarding-flows/src/vendors/travelclick.ts` |
| Modify | `packages/onboarding-flows/src/registry.ts` — register TravelClick |
| Modify | `packages/onboarding-flows/src/vendors/siteminder.ts` — fix pmsId 3 → 12 |
| Modify | `apps/web/src/app/admin/hotel-onboarding/page.tsx` — add TravelClick to `PMS_OPTIONS`, fix SiteMinder id 3→12 |
| Modify | `apps/onboarding-api/src/routes/wizard.route.ts` — expose `useDefaultCodes` in state response |
| Modify | `apps/onboarding-api/src/services/step-executor.service.ts` — implement `useDefaultCodes` in create_rooms + create_rateplans |
| Modify | `apps/onboarding/src/components/steps/DataReviewStep.tsx` — hide room code column when `useDefaultCodes` |
| Modify | `apps/onboarding/src/components/steps/CmSettingsStep.tsx` — hide rate plan code column when `useDefaultCodes` |
