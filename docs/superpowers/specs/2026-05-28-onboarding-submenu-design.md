# Onboarding Sub-Menu Pages — Design Spec

## Summary

Add two sub-menu pages under the Onboarding nav section: ARI Sources and IBEs. Both show static config data enriched with live DB statistics (invitation counts per ARI source / IBE pattern). A new stats API endpoint provides the counts. IBE rows include a hardcoded sample URL (the specific hotel IBE that was used for investigation).

## Navigation Changes (`_layout-client.tsx`)

### Sub-menu items

```typescript
{
  title: 'Onboarding',
  minRole: 'admin',
  items: [
    { href: '/admin/hotel-onboarding', label: 'Invitations', minRole: 'admin' },
    { href: '/admin/hotel-onboarding/ari-sources', label: 'ARI Sources', minRole: 'admin' },
    { href: '/admin/hotel-onboarding/ibes', label: 'IBEs', minRole: 'admin' },
  ],
},
```

### ob_agent redirect fix

Change `pathname !== '/admin/hotel-onboarding'` to `!pathname.startsWith('/admin/hotel-onboarding')` so OB agents can navigate to the sub-pages.

## Stats API Endpoint

Add `GET /api/v1/admin/hotel-onboarding/stats` to `apps/api/src/routes/onboarding-admin.route.ts`.

- Auth: requires `organizationId` (same guard as other onboarding routes — `super` sees all orgs, `ob_agent` sees own org)
- Response:

```typescript
{
  ariStats: Record<number, { total: number; approved: number }>  // keyed by pmsId
  ibeStats: Record<string, { total: number; approved: number }>  // keyed by ibePattern
}
```

- `total` = count of all invitations for that pmsId/ibePattern
- `approved` = count of sessions with `status = 'approved'` for that pmsId/ibePattern
- `super` admins see global counts (across all orgs); `ob_agent` sees only their org

Implementation uses two Prisma `groupBy` queries on `OnboardingInvitation`:
```typescript
// ariStats: group by pmsId
const ariGroups = await prisma.onboardingInvitation.groupBy({
  by: ['pmsId'],
  _count: { id: true },
  where: orgFilter,  // { organizationId: me.organizationId } for non-super, undefined for super
})
// ibeStats: group by ibePattern
const ibeGroups = await prisma.onboardingInvitation.groupBy({
  by: ['ibePattern'],
  _count: { id: true },
  where: { ...orgFilter, ibePattern: { not: null } },
})
// approved counts: join session status
const approvedAri = await prisma.onboardingSession.groupBy({
  by: ['invitationId'],  // need pmsId via join
  ...
})
```

Note: because `approved` requires a join to `OnboardingSession`, use two separate queries: one for total invitation counts (groupBy pmsId/ibePattern) and one for approved session counts (findMany with include).

Simpler approach (avoids complex joins): 

```typescript
// Total invitations per pmsId
const allInvitations = await prisma.onboardingInvitation.findMany({
  where: orgFilter,
  select: { pmsId: true, ibePattern: true, session: { select: { status: true } } },
})
// Then aggregate in JS
```

Use the `findMany` + JS aggregation approach for simplicity.

## ARI Sources Page (`/admin/hotel-onboarding/ari-sources/page.tsx`)

**Columns:** Name, pmsId, Data Flow, Default Codes, Region Aware, Steps, Invitations, Approved

**Static data:**

| Name | pmsId | dataFlow | useDefaultCodes | regionAware | steps |
|------|-------|----------|-----------------|-------------|-------|
| SiteMinder | 12 | blank | No | Yes | 13 |
| TravelClick | 25 | blank | Yes | Yes | 13 |

**Invitations / Approved:** fetched from the stats endpoint (`ariStats[pmsId].total` / `ariStats[pmsId].approved`). Show `—` while loading, `0` if not in stats.

**Filter:** text input filters by name.

**apiClient method to add:**
```typescript
getOnboardingStats(): Promise<{
  ariStats: Record<number, { total: number; approved: number }>
  ibeStats: Record<string, { total: number; approved: number }>
}>
```

## IBEs Page (`/admin/hotel-onboarding/ibes/page.tsx`)

**Columns:** Name, Detection, Scraping, Harvester, Invitations, Approved, View

**Static data (13 rows):**

| Name | Detection | Scraping | Harvester | sampleUrl |
|------|-----------|----------|-----------|-----------|
| Sentec | Domain | Full | ✅ | null (fill in) |
| SimpleBooking.it | Domain | Full | ✅ | null (fill in) |
| direct-book.com | Domain | Full | ✅ | null (fill in) |
| BookingExpert | Domain+Params | Search only | ❌ | null |
| Falkensteiner | Domain | Search only | ❌ | null |
| BookSecure | Domain | Search only | ❌ | null |
| Sabre SynXis | Params | Search only | ✅ | null (fill in) |
| WebHotelier | Domain | Search only | ❌ | null |
| Hotels of Mykonos | Domain | Search only | ❌ | null |
| Zenith Hotels (MY) | Domain | Search only | ❌ | null |
| Lighthouse | Domain | Search only | ❌ | null |
| TravelClick | Params | Search only | ❌ | null |
| Hotetec | Params | Search only | ❌ | null |

**sampleUrl:** hardcoded per IBE (null = no View link shown). These are the specific hotel IBE URLs used during investigation. The user fills these in at the time of implementation or later.

**View column:** renders an external link (opens in new tab) when `sampleUrl` is set; "—" otherwise.

**Invitations / Approved:** from `ibeStats[ibePattern].total` / `ibeStats[ibePattern].approved`.

**Filter:** text input filters by name.

## Rename: "Hotel Onboarding" → "Invitations"

- Nav label in `_layout-client.tsx`: `label: 'Invitations'`
- Page `<h1>` in `hotel-onboarding/page.tsx`: change `Hotel Onboarding` heading to `Invitations`
- Page `<p>` subtitle: change to `Generate invitation links and monitor self-onboarding sessions.` (keep as is)

## Files

| Action | Path |
|--------|------|
| Create | `apps/web/src/app/admin/hotel-onboarding/ari-sources/page.tsx` |
| Create | `apps/web/src/app/admin/hotel-onboarding/ibes/page.tsx` |
| Modify | `apps/api/src/routes/onboarding-admin.route.ts` |
| Modify | `apps/web/src/lib/api-client.ts` |
| Modify | `apps/web/src/app/admin/_layout-client.tsx` |
