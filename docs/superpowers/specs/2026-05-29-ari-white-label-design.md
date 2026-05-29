# ARI Source White Label — Design Spec

**Date:** 2026-05-29  
**Status:** Approved

---

## Overview

Some ARI sources on HyperGuest are white-label variants of another (e.g. Isprava is a white-label of STAAH). These variants do not need their own VendorFlow — they reuse the master's wizard. This feature lets admins declare that relationship from the `/admin/hotel-onboarding/ari-sources` UI, persists it in the DB, and transparently redirects the onboarding wizard to the master's flow at runtime.

---

## Data Model

New Prisma model in the shared schema:

```prisma
model AriSourceWhiteLabel {
  pmsId             Int      @id
  whiteLabelOfPmsId Int
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

- `pmsId` — the white-label ARI source (e.g. 85 = Isprava)
- `whiteLabelOfPmsId` — the master ARI source whose flow to use (e.g. 30 = STAAH)
- No DB foreign keys — pmsIds are HG-managed integers, not rows in our DB
- Starts empty; a row's presence means the WL relationship is active; deleting the row clears it

---

## API

Two new super-admin routes on `ibe-api` under `/api/v1/admin/ari-sources/white-labels`:

### `GET /api/v1/admin/ari-sources/white-labels`
Returns all active WL mappings as a flat map:
```json
{ "85": 30, "169": 30 }
```
Used by the frontend on page load.

### `PUT /api/v1/admin/ari-sources/white-labels/:pmsId`
Body: `{ "whiteLabelOfPmsId": 30 }` — upserts the mapping.  
Body: `{ "whiteLabelOfPmsId": null }` — deletes the row (clears the WL).

Both routes are super-admin only (same auth guard as other `/admin` routes).

---

## Runtime Flow Resolution (`onboarding-api`)

When a hotel starts an onboarding session, the wizard looks up the VendorFlow for their pmsId. With WL support, this resolution becomes DB-aware:

```ts
async function resolveVendorFlow(pmsId: number, prisma: PrismaClient) {
  const wl = await prisma.ariSourceWhiteLabel.findUnique({ where: { pmsId } });
  return getVendorFlow(wl?.whiteLabelOfPmsId ?? pmsId);
}
```

- The invitation and session continue to store the **original pmsId** (e.g. 85 for Isprava) — this is important for knowing which CM the hotel actually uses
- Only the flow execution is redirected to the master (e.g. STAAH's flow)
- All existing direct calls to `getVendorFlow(pmsId)` in the session service are replaced with `resolveVendorFlow(pmsId, prisma)`

---

## Frontend (`/admin/hotel-onboarding/ari-sources`)

### Data loading
Both `listAriSources()` and `listAriWhiteLabels()` are fetched in parallel on mount. WL map is held in component state as `Record<number, number>`.

### New "WL" column
Added to the table after "Approved". Three display states per row:

| State | Display |
|---|---|
| Not set | `—` + "Set WL" button |
| Set | Badge showing master name (e.g. `STAAH`) + `✕` clear button |
| Editing | Inline combobox filtering the same ARI sources list |

### Set WL action
- Clicking "Set WL" or the master name badge opens an inline combobox on that row
- User types to filter the ARI sources list; selecting one calls `PUT` and closes the editor
- Pressing Escape or clicking away cancels without saving
- On save: optimistic update of local WL map state

### Clear WL action
- The `✕` button on a set WL calls `PUT` with `whiteLabelOfPmsId: null`
- Optimistic update removes the entry from local WL map state

### Column header
Includes an `ⓘ` info button (consistent with existing columns) with explanation:
> "White Label of — this ARI source is a variant of the listed master. The onboarding wizard will run the master's flow for hotels using this CM."

---

## `apiClient` additions

```ts
listAriWhiteLabels(): Promise<Record<number, number>>
setAriWhiteLabel(pmsId: number, masterPmsId: number | null): Promise<void>
```

---

## Scope / Out of scope

**In scope:**
- DB model + migration
- Two API endpoints (GET + PUT)
- WL column + Set/Clear action in the ari-sources page
- Runtime resolution in `onboarding-api` session service
- `apiClient` additions

**Out of scope:**
- Showing WL info on the invitation itself (future)
- Cascading WL (WL of a WL) — not needed, master must be a direct flow
- Validation that the master pmsId actually has a VendorFlow (admin responsibility)
