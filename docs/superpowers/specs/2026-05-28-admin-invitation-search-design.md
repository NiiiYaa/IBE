# Admin Invitation Search — Design Spec

## Summary

Upgrade the "New Invitation" form on `/admin/hotel-onboarding` from a static URL field to a two-step search-and-pick flow. Staff enter hotel name + city + country, see search results with screenshots, pick the correct hotel site, then complete the invitation.

## Backend — New Proxy Endpoint

Add `POST /api/v1/admin/hotel-onboarding/search` to `apps/api/src/routes/onboarding-admin.route.ts`.

- Auth: requires `organizationId` (same guard as invitation creation — works for `ob_agent` and `super`)
- Body: `{ hotelName: string; city: string; country?: string }`
- Behaviour: proxies to `${ONBOARDING_API_INTERNAL_URL}/hotel-search` using `undici.fetch`, returns `{ candidates }` as-is
- Error: if onboarding-api is unreachable, return 502

The `ONBOARDING_API_INTERNAL_URL` env var is already used by `apps/api` for harvest triggers.

Response shape (from existing `/hotel-search`):
```typescript
{
  candidates: Array<{
    url: string
    title: string
    detected: boolean       // true when IBE type was recognised
    screenshotUrl: string | null  // path like /screenshots/filename.png
  }>
}
```

## Frontend — Two-Step Inline Form

Replace the current "New Invitation" card in `apps/web/src/app/admin/hotel-onboarding/page.tsx`.

### Step 1: Search

Fields:
- Hotel Name (required text input)
- City (required text input)
- Country (optional text input)
- "Search" button

On submit: POST to `/api/v1/admin/hotel-onboarding/search` (through `apiClient`). Show loading state. Results appear below as a grid of cards:
- Screenshot thumbnail (img src = `${NEXT_PUBLIC_ONBOARDING_API_URL}/screenshots/...`, fallback grey box)
- Hotel/page title
- URL (truncated)
- Green "IBE detected" badge when `detected: true`
- Clicking a card selects that URL → advances to Step 2

Below the grid: a "Paste URL manually" text input + "Use this URL" button for cases where search doesn't find the right result.

### Step 2: Complete & Create

Shown after a URL is selected. Fields:
- Selected URL shown in a highlighted row with the IBE name (if detected) + "✕ Change" link to go back
- Contact Email (optional)
- Channel Manager dropdown (SiteMinder / TravelClick — from `PMS_OPTIONS`)
- "Generate Invitation Link" button

On submit: calls existing `apiClient.createOnboardingInvitation({ pmsId, hotelName, contactEmail, ibeUrl: selectedUrl })`. On success, shows the invitation link with Copy button as before.

### `apiClient` addition

Add to `apps/web/src/lib/api-client.ts`:
```typescript
searchOnboardingHotel(body: { hotelName: string; city: string; country?: string }): Promise<{
  candidates: Array<{ url: string; title: string; detected: boolean; screenshotUrl: string | null }>
}>
```
Calls `POST /api/v1/admin/hotel-onboarding/search`.

## Env Var

`NEXT_PUBLIC_ONBOARDING_API_URL` must be set in `apps/web/.env.local` (dev: `http://localhost:3003`). Already used by `apps/onboarding` — just needs to be added to `apps/web` env too. Used only for screenshot image `src` attributes.

## Files

| Action | Path |
|--------|------|
| Modify | `apps/api/src/routes/onboarding-admin.route.ts` |
| Modify | `apps/web/src/lib/api-client.ts` |
| Modify | `apps/web/src/app/admin/hotel-onboarding/page.tsx` |
| Modify | `apps/web/.env.local` (add `NEXT_PUBLIC_ONBOARDING_API_URL`) |
