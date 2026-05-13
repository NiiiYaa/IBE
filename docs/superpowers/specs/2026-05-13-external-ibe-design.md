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
| `{hotelId}` | Property ID |
| `{checkIn}` | Arrival date (YYYY-MM-DD) |
| `{checkOut}` | Departure date (YYYY-MM-DD) |
| `{adults}` | Adult guest count |
| `{rooms}` | Room count |
| `{nationality}` | Guest nationality (ISO 2-letter) |
| `{currency}` | Currency code |
| `{roomId}` | Room type ID (booking URL only) |
| `{ratePlanId}` | Rate plan ID (booking URL only) |

---

## 2. Inheritance

`getEffectiveExternalIBEConfig(propertyId)` — hotel level takes precedence over chain level.

```
Hotel config exists? → use it
Otherwise → look up property's organizationId → use chain config
No chain config? → no external IBE (fall back to local IBE URL)
```

---

## 3. AI Analysis Flow

**Endpoint:** `POST /api/admin/external-ibe/analyze`

**Request:**
```ts
{ urls: string[], type: 'search' | 'booking', orgId?: number, propertyId?: number }
```

**Claude prompt:** The API sends the sample URLs with a structured prompt instructing Claude to identify which URL parameters correspond to the placeholder vocabulary and return a filled template string plus a mapping table. The prompt includes the full vocabulary list so Claude knows exactly which concepts to look for.

**Response:**
```ts
{
  template: string            // e.g. "https://ext.com/search?hotel={hotelId}&from={checkIn}"
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

**Resolver integration:** Each channel integration point calls `getEffectiveExternalIBEConfig(propertyId)`, checks the relevant channel flag (`mcpEnabled` / `affiliateEnabled` / `widgetEnabled`), and if true uses the appropriate template via `buildExternalUrl`. Falls back to the local IBE URL if unconfigured or channel flag is off.

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

**Page structure:**

### Inheritance banner
- At hotel level: if no hotel-level config exists, shows "Using chain configuration" in a muted banner.
- If a hotel-level override exists, shows "Hotel-level override active" with a **Delete override** button that removes the hotel row and reverts to chain config.
- At chain level: no banner.

### Search URL section
- Textarea: "Paste one or more sample search page URLs (one per line)"
- **Analyze** button — calls `/api/admin/external-ibe/analyze` with `type: 'search'`, shows spinner
- Review panel (shown after analysis):
  - Mapping table: Concept | Detected param | Example value
  - Rendered template string (read-only display)
  - Unmapped params listed as a notice: "The following params were not mapped and will be ignored: lang, source"

### Booking URL section
- Same structure as Search URL section with `type: 'booking'`

### Channel toggles
- Three independent on/off toggles: **MCP**, **Affiliate**, **Widget**
- Disabled (greyed out) if neither template has been saved yet

### Actions
- **Save** — persists both templates + sample URLs + channel toggles in one call. Creates or updates the config at this scope (chain or hotel).
- **Delete config** — removes the entire config row at this level with confirmation. At hotel level this reverts to chain config. At chain level this removes external IBE entirely.

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
