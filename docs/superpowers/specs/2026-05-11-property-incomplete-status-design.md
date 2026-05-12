# Property Incomplete Status — Design Spec

**Date:** 2026-05-11

## Problem

When the HyperGuest backfill fails to retrieve essential data for a property (name, rooms, or address), the property is silently left in its current state. There is no way to distinguish properties that are intentionally inactive from those that are incomplete due to a data retrieval failure.

## Goal

Introduce an `'incomplete'` status that is automatically applied when backfill detects missing critical data, and automatically cleared when the data is later successfully retrieved. Admins can filter, identify, and manually override incomplete properties.

## Data Model

Replace `isActive: Boolean @default(true)` on the `Property` Prisma model with:

```prisma
status  String  @default("active")  // 'active' | 'inactive' | 'incomplete'
```

Migration:

```sql
ALTER TABLE "Property" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
UPDATE "Property" SET status = CASE WHEN "isActive" = true THEN 'active' ELSE 'inactive' END;
ALTER TABLE "Property" DROP COLUMN "isActive";
```

Shared type (`packages/shared/src/types/api.ts`):

```typescript
export type PropertyStatus = 'active' | 'inactive' | 'incomplete'

// In PropertyRecord: replace isActive: boolean with status: PropertyStatus
```

## Backfill Logic

The existing SSE route `POST /admin/properties/backfill-names` is expanded to check completeness after fetching HyperGuest data.

**Completeness criteria** — a property is complete when it has all three:
- Non-empty name
- At least one room
- Non-empty address

**Status transition rules:**

| Completeness check | Current status | New status |
|--------------------|---------------|------------|
| Fails | any | `'incomplete'` |
| Passes | `'incomplete'` | `'active'` |
| Passes | `'inactive'` | `'inactive'` (no change — admin decision) |
| Passes | `'active'` | `'active'` (no change) |

Only properties that were auto-marked incomplete are auto-recovered. Admin manual deactivations are respected.

## API Changes

### Route

`PUT /admin/properties/:id/active` → `PUT /admin/properties/:id/status`

Request body: `{ status: 'active' | 'inactive' }` — admins can only set active or inactive; `'incomplete'` is system-only and cannot be set via this route.

### Service

`setPropertyActive(id, active: boolean)` → `setPropertyStatus(id, status: 'active' | 'inactive')`

The backfill service uses internal helpers (not the admin route) to apply `'incomplete'` or recover to `'active'`.

### Query filters

All `where: { isActive: true }` → `where: { status: 'active' }`

Guest-facing IBE queries that exclude non-active properties: `where: { status: { in: ['inactive', 'incomplete'] } }` (both treated as inactive for guests).

## Admin UI

File: `apps/web/src/app/admin/config/properties/page.tsx`

### Filter dropdown

Add fourth option:

```
All statuses | Active | Inactive | Incomplete
```

`FilterStatus = 'all' | 'active' | 'inactive' | 'incomplete'`

### Status badge

New amber "Incomplete" badge displayed in the property row alongside existing Demo/Default/Secondary badges. Replaces the current boolean-driven green/muted enabled state display for incomplete properties.

### Toggle button

The Enabled/Disabled toggle continues to work for all properties including incomplete ones. Calling it with `'active'` or `'inactive'` via the updated route clears the incomplete state. The Incomplete badge disappears once an admin manually sets a status.

## Out of Scope

- Notifying admins of newly incomplete properties (no email/alert)
- Tracking the reason for incompleteness (which field was missing)
- A separate "incomplete" page or report view
