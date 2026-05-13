# External IBE Configuration — Design Spec

**Date:** 2026-05-13
**Status:** Approved

## Overview

Some deployments use the IBE platform for features like MCP or affiliate management but route actual bookings to an external booking engine. This feature lets chain and hotel admins configure an external IBE URL structure. The platform uses AI to extract a URL template from sample URLs pasted by the admin. Generated booking and search links for configured channels point to the external IBE instead of the local one.

---

## 1. Data Model

One Prisma model `ExternalIBEConfig` supports both chain (org) and hotel (property) level. Exactly one of `organizationId` or `propertyId` is set per row.

```prisma
model ExternalIBEConfig {
  id                 Int           @id @default(autoincrement())
  organizationId     Int?          @unique
  propertyId         Int?          @unique

  searchTemplate     String?
  bookingTemplate    String?
  searchSampleUrls   Json          @default("[]")  // string[]
  bookingSampleUrls  Json          @default("[]")  // string[]

  externalHotelId    String?       // hotel-level only: the ID this property has in the external IBE

  mcpEnabled         Boolean       @default(false)
  affiliateEnabled   Boolean       @default(false)
  widgetEnabled      Boolean       @default(false)

  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  organization       Organization? @relation(fields: [organizationId], references: [id])
  property           Property?     @relation(fields: [propertyId], references: [propertyId])
}
```

**Placeholder vocabulary** — the fixed set of concepts the AI maps to:

| Placeholder | Meaning |
|---|---|
| `{hotelId}` | Property ID (HyperGuest internal) |
| `{externalHotelId}` | Property ID in the external IBE system (hotel-level only) |
| `{checkIn}` | Arrival date (YYYY-MM-DD) |
| `{checkOut}` | Departure date (YYYY-MM-DD) |
| `{adults}` | Adult guest count |
| `{rooms}` | Room count |
| `{nationality}` | Guest nationality (ISO 2-letter) |
| `{currency}` | Currency code |
| `{roomId}` | Room type ID (booking URL only) |
| `{ratePlanId}` | Rate plan ID (booking URL only) |

**`{externalHotelId}` semantics:** The external IBE assigns each property its own ID (e.g. `hotel=4521` in the URL). This ID is specific to each hotel and cannot be defined at chain level. Instead:
- **Chain-level config** defines the URL template structure (e.g. `https://ext.com/book?hotel={externalHotelId}&from={checkIn}`) — the AI detects the hotel-ID slot and marks it `{externalHotelId}`.
- **Hotel-level config** stores only `externalHotelId` — extracted by pasting one sample URL from that hotel's external IBE page. The hotel inherits the chain template and its `{externalHotelId}` is substituted at link-generation time.

---

## 2. Inheritance

`getEffectiveExternalIBEConfig(propertyId)` — three scenarios:

```
Scenario A — standalone hotel (no org / org has no chain config):
  Hotel config exists? → use it directly (hotel owns full templates + externalHotelId)
  No hotel config? → no external IBE (fall back to local IBE URL)

Scenario B — hotel within a chain (chain config exists):
  Hotel config exists?
    → merge: use chain templates (searchTemplate / bookingTemplate)
             but substitute externalHotelId from hotel record
    → if hotel has its own templates (full override), use those instead
  No hotel config?
    → use chain config as-is
       (links with {externalHotelId} token will be unresolvable until hotel ID is set)
  No chain config?
    → no external IBE (fall back to local IBE URL)
```

**Resolution priority for each field:**

| Field | Source |
|---|---|
| `searchTemplate` | Hotel override if set, else chain (standalone hotel always owns this) |
| `bookingTemplate` | Hotel override if set, else chain (standalone hotel always owns this) |
| `externalHotelId` | Hotel record only (never inherited) |
| `mcpEnabled` / `affiliateEnabled` / `widgetEnabled` | Hotel override if set, else chain |

---

## 3. AI Analysis Flow

**Endpoint:** `POST /api/admin/external-ibe/analyze`

**Request:**
```ts
{ urls: string[], type: 'search' | 'booking', orgId?: number, propertyId?: number }
```

**Claude prompt:** The API sends the sample URLs with a structured prompt instructing Claude to identify which URL parameters correspond to the placeholder vocabulary and return a filled template string plus a mapping table. The prompt includes the full vocabulary list so Claude knows exactly which concepts to look for. Claude is instructed to use `{externalHotelId}` (not `{hotelId}`) when it detects a hotel-identifier parameter that appears to be an external-system ID rather than a HyperGuest property ID.

**Response:**
```ts
{
  template: string            // e.g. "https://ext.com/search?hotel={externalHotelId}&from={checkIn}"
  mapping: Array<{
    concept: string           // e.g. "hotelId"
    detectedParam: string     // e.g. "hotel"
    exampleValue: string      // e.g. "12345"
  }>
  unmapped: string[]          // params present in URL but not mapped to any concept
}
```

The admin reviews this response before saving. The endpoint does **not** persist — it only returns analysis results. A separate save call persists to DB.

**Re-analysis:** Always available. Pasting new URLs and clicking Analyze overwrites the in-memory result; the admin must Save to persist.

---

## 4. URL Generation

**Utility:** `buildExternalUrl(template: string, params: Record<string, string | number | null>): string`

- Replaces `{placeholder}` tokens with the corresponding value.
- Omits query parameters where the value is `null` or `undefined` (no `room=undefined` in output).
- Handles both path-segment and query-parameter placeholders.

**Resolver integration:** Each channel integration point calls `getEffectiveExternalIBEConfig(propertyId)`, checks the relevant channel flag (`mcpEnabled` / `affiliateEnabled` / `widgetEnabled`), and if true uses the appropriate template via `buildExternalUrl`. The `params` map passed to `buildExternalUrl` always includes `externalHotelId` from the resolved config (may be `null` if the hotel hasn't set it yet — the token will be omitted from the output). Falls back to the local IBE URL if unconfigured or channel flag is off.

**Integration points:**

| Channel | File | Template used |
|---|---|---|
| MCP booking tool | `apps/api/src/routes/mcp.route.ts` → `bookingUrl()` | `bookingTemplate` |
| MCP search tool | `apps/api/src/routes/mcp.route.ts` → search handler | `searchTemplate` |
| Affiliate link builder | `apps/api/src/services/affiliate.service.ts` | `bookingTemplate` |
| Widget/embed link | `apps/api/src/routes/mcp.route.ts` widget handler | `searchTemplate` or `bookingTemplate` |

---

## 5. Admin UI

**Location:** Config → External IBE (new sidebar entry, visible at chain and hotel levels)

**Three contexts, three layouts:**

| Context | Who sees it | Layout |
|---|---|---|
| Chain admin | Org-level admin | Full template UI |
| Standalone hotel | Hotel admin with no chain config | Full template UI (identical to chain) |
| Chain-member hotel | Hotel admin whose chain has a config | Simplified: inherited templates + hotel ID extraction only |

**Page structure:**

### Inheritance banner
- At chain-member hotel level: if no hotel-level config exists, shows "Using chain configuration" in a muted banner.
- If a hotel-level record exists, shows "Hotel-level override active" with a **Delete override** button that removes the hotel row and reverts to chain config.
- At chain level or standalone hotel: no banner.

### Full template UI (chain admin + standalone hotel)

#### Search URL section
- Textarea: "Paste one or more sample search page URLs (one per line)"
- **Analyze** button — calls `/api/admin/external-ibe/analyze` with `type: 'search'`, shows spinner
- Review panel (shown after analysis):
  - Mapping table: Concept | Detected param | Example value
  - Rendered template string (read-only display)
  - Unmapped params listed as a notice: "The following params were not mapped and will be ignored: lang, source"

#### Booking URL section
- Same structure as Search URL section with `type: 'booking'`

#### Channel toggles
- Three independent on/off toggles: **MCP**, **Affiliate**, **Widget**
- Disabled (greyed out) if neither template has been saved yet

#### Actions
- **Save** — persists both templates + sample URLs + channel toggles in one call. Creates or updates the config at this scope.
- **Delete config** — removes the entire config row at this level with confirmation.

---

### Simplified hotel UI (chain-member hotel only)

Shown only when a chain-level config already exists above this hotel. The hotel admin does not need to define templates — they only supply their external hotel ID.

#### Inherited templates panel (read-only)
- Shows the chain's search and booking template strings as non-editable text for reference.
- Label: "Templates inherited from chain configuration"

#### External Hotel ID section
- Single-URL input: "Paste one sample URL from your external booking page"
- **Extract ID** button — calls `/api/admin/external-ibe/analyze` with `type: 'search'` (or `'booking'`), single URL; the response mapping table highlights the `externalHotelId` concept
- Review confirmation: shows detected `externalHotelId` value (e.g. `4521`) with label "Your external hotel ID"
- Admin confirms and saves.

#### Channel toggles (hotel-level override)
- Same three toggles; if not overridden, inherit chain values.

#### Actions
- **Save** — persists `externalHotelId` + any channel overrides.
- **Delete override** — reverts to pure chain config (same as inheritance banner button).

---

### Full template override (chain-member hotel)
A chain-member hotel can optionally override the inherited templates entirely. This is surfaced as an "Advanced: override templates" expandable section at the bottom of the simplified hotel UI — it contains the same full template UI (search + booking URL analysis). When saved with custom templates, the hotel row behaves like a standalone config and the simplified hotel ID section is no longer shown.

---

## 6. API Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/external-ibe` | Get config at current scope (chain or hotel) |
| `POST` | `/api/admin/external-ibe/analyze` | Run AI analysis, return template + mapping (no persist) |
| `PUT` | `/api/admin/external-ibe` | Create or update config at current scope |
| `DELETE` | `/api/admin/external-ibe` | Delete config at current scope |

Scope is determined by query params: `?orgId=N` for chain level, `?propertyId=N` for hotel level.

---

## 7. Out of Scope

- System-level (super admin) default external IBE — not needed per spec.
- Date format transformation (e.g. YYYY-MM-DD vs DD/MM/YYYY) — if the external IBE requires a different format, the AI bakes the note into the template as a literal. Can be added later.
- Manual template editing in the UI — admin always goes through Analyze to update a template.
- Validation that generated URLs actually resolve — not checked at save time.
