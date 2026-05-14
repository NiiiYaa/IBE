# External IBE Bulk Hotel ID Mapping

**Date:** 2026-05-14
**Status:** Approved

## Overview

Chain admins need to map each hotel in the chain to its External IBE ID (`externalHotelId`). Doing this one hotel at a time (by pasting a sample URL per hotel) is tedious for large chains. This feature lets the chain admin upload an Excel file with the mapping in bulk, applied immediately with error reporting and a "still missing" summary.

## Scope

- Chain level only (shown in `FullTemplateUI` when `scope` is org-scoped, not property-scoped)
- Placed at the bottom of the chain External IBE page
- No preview step — apply immediately on upload

## Excel Format

**Required columns (matched by header name, case-insensitive):**
- `Property ID` — HyperGuest numeric property ID (integer)
- `External IBE ID` — the hotel's ID in the external booking engine (string)

**Optional columns (ignored):**
- `Hotel Name` or any other column

**Rules:**
- Row 1 is always treated as the header row
- Column order does not matter
- Rows with a blank `External IBE ID` are skipped
- Rows with a non-numeric or missing `Property ID` are reported as parse errors

## Client-Side Parsing

Using the `xlsx` (SheetJS) library, already available or added as a dependency.

1. User selects a `.xlsx` or `.xls` file
2. Parse in the browser — read first sheet only
3. Row 0 = headers; find column indices for `property id` and `external ibe id` (case-insensitive trim)
4. If either required header is not found → show error immediately, do not call API
5. For each data row: extract `propertyId` (parse as integer) and `externalHotelId` (trim string)
6. Rows with invalid `propertyId` (non-numeric, zero, negative) → collected as parse errors
7. Valid rows → sent to API as `{ propertyId, externalHotelId }[]`

## API Endpoint

**`POST /api/external-ibe/bulk-map`**

Request body:
```ts
{ orgId: number, mappings: { propertyId: number, externalHotelId: string }[] }
```

Processing (sequential to avoid pool exhaustion):
1. For each mapping: upsert `ExternalIBEConfig` with `{ propertyId, externalHotelId }` using existing `upsertExternalIBEConfig`
2. Collect per-row errors (property not in org, DB error)
3. After all upserts: query all properties in the org and find those with no `externalHotelId` in their `ExternalIBEConfig`

Response:
```ts
{
  updated: number                                      // count of successfully upserted rows
  errors: { propertyId: number, message: string }[]   // rows that failed
  stillMissing: { propertyId: number, name: string }[] // org properties with no externalHotelId after upload
}
```

## UI

Located at the bottom of the chain `FullTemplateUI` (only rendered when `scope` has `orgId` and no `propertyId`).

**Section: "Bulk Hotel ID Mapping"**

Explanatory text:
> Upload an Excel file (.xlsx or .xls) with a header row containing at minimum two columns: **Property ID** (HyperGuest numeric property ID) and **External IBE ID**. A Hotel Name column is accepted but ignored. Each row maps one hotel.

File input (click to browse, accepts `.xlsx,.xls`).

**After upload:**
- Parse errors (client-side): shown in red before API call — e.g. "Missing required column: External IBE ID" or "Row 3: Property ID is not a number"
- On API success:
  - Green summary: "Updated N hotels"
  - If API errors: red list of failed rows with reason
  - "Still missing" section: list of hotel names + property IDs in the chain that have no External IBE ID yet

## Shared Types

Add to `packages/shared/src/types/external-ibe.ts`:

```ts
export interface ExternalIBEBulkMapRequest {
  orgId: number
  mappings: { propertyId: number; externalHotelId: string }[]
}

export interface ExternalIBEBulkMapResponse {
  updated: number
  errors: { propertyId: number; message: string }[]
  stillMissing: { propertyId: number; name: string }[]
}
```

## Security

- API route validates that each `propertyId` in the mappings belongs to the requesting org (same check as other org-scoped external IBE operations)
- Auth: same admin JWT as all other external IBE routes

## Out of Scope

- Template download (not needed — structure is explained in UI text)
- Preview before apply
- Undo / rollback
- CSV support (Excel only)
