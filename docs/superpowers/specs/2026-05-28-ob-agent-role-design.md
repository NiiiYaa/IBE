# OB Agent Role — Design Spec

## Summary

Add a new `ob_agent` role for HyperGuest onboarding staff. All OB agents belong to a dedicated "HG OB" org. Hotels created during self-onboarding are placed under this org. OB agents see only the Hotel Onboarding admin section.

## One-Time Setup (manual)

A super admin creates the "HG OB" org once via `/admin/organizations`. All `ob_agent` users are then created under this org. This org's `organizationId` is used as the default for all invitations created by OB agents.

## `ob_agent` Role

- **DB value:** `'ob_agent'` (plain string, no migration needed)
- **Who can assign it:** `super` admins only (gate in `user.route.ts`)
- **Org requirement:** must have `organizationId = HG-OB org` (enforced at user creation by super admin)
- **Access level:** level 1 in `ROLE_LEVEL` (same as `admin`) — allows nav items with `minRole: 'admin'`

## What OB Agents Can Do

| Action | Allowed |
|--------|---------|
| Create invitations (scoped to HG-OB org) | ✅ |
| List invitations (scoped to HG-OB org) | ✅ |
| Revoke invitations (own org only) | ✅ |
| Approve completed sessions (own org only) | ✅ |
| Access any other admin section | ❌ |
| Manage users / orgs | ❌ |

## Invitation & Hotel Org Scoping

When an `ob_agent` creates an invitation, `organizationId = me.organizationId` (HG-OB org) is set automatically — no code change needed in `createInvitation`. Hotels onboarded through this flow are placed under HG-OB org. Super admins can later move them to a proper org.

## Navigation Changes (`_layout-client.tsx`)

1. Add `ob_agent: 1` to `ROLE_LEVEL`
2. `filterSections`: when role is `ob_agent`, return ONLY the section containing `hotel-onboarding`
3. Login redirect: when `role === 'ob_agent'`, redirect to `/admin/hotel-onboarding`. Add `&& role !== 'ob_agent'` to the existing wizard-redirect guard (line ~345) that checks `!orgData.hyperGuestOrgId` — otherwise OB agents get sent to the hotel wizard instead of the onboarding admin.
4. `RoleBadge`: add "OB Agent" badge in indigo (alongside existing super/admin badges)
5. Change `hotel-onboarding` nav item from `minRole: 'super'` to `minRole: 'admin'`

## API Changes

### `user.route.ts`
- Add `'ob_agent'` to `ALLOWED_ROLES`
- Add check: `if (body.role === 'ob_agent' && !isSuper) return 403`

### `onboarding-admin.route.ts`
- Revoke route (line ~48): change `role !== 'super'` → `role !== 'super' && role !== 'ob_agent'`
- Approve route (line ~70): same change
- The ownership check `invitation.organizationId !== me.organizationId` already handles org scoping correctly for `ob_agent`

## Files

| Action | Path |
|--------|------|
| Modify | `apps/api/src/routes/user.route.ts` |
| Modify | `apps/api/src/routes/onboarding-admin.route.ts` |
| Modify | `apps/web/src/app/admin/_layout-client.tsx` |
