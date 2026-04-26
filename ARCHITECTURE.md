# IBE — Architecture Overview

## What It Is

IBE is a production-grade hotel internet booking engine. It integrates with the HyperGuest property management system for availability and reservations, and Stripe for payment processing. It supports multi-property, multi-currency, multi-locale configurations with per-hotel design customization.

---

## Repository Structure

The project is a **pnpm monorepo** with two apps and one shared package:

```
ibe/
├── apps/
│   ├── api/        — Fastify backend (port 3001)
│   └── web/        — Next.js 14 frontend (port 3000)
└── packages/
    └── shared/     — Shared types, schemas, enums, utilities
```

Apps communicate through a typed API client. The web app proxies all `/api/*` requests to the backend via Next.js rewrites, so the browser never hits the backend directly.

---

## Backend — `apps/api`

**Framework:** Fastify 4 (Node.js 20, TypeScript, ESM)

**Responsibilities:** Business logic, external API integrations, database access, caching, payment orchestration.

### Folder Structure

```
src/
├── server.ts                  — Entry point, graceful shutdown
├── app.ts                     — Plugin registration, route mounting
├── config/env.ts              — Zod-validated environment config
├── adapters/hyperguest/       — HyperGuest HTTP client (search, booking, static, mock)
├── services/                  — Business logic (one file per domain)
├── routes/                    — Route handlers (13 groups)
├── middleware/error-handler.ts — Global error formatting
├── db/client.ts               — Prisma singleton
└── utils/                     — Logger (Pino), Redis wrapper
```

### Key Plugins

| Plugin | Purpose |
|--------|---------|
| `@fastify/cors` | Cross-origin requests |
| `@fastify/helmet` | Security headers |
| `@fastify/rate-limit` | 100 req/min per IP |
| `@fastify/sensible` | Error shorthand utilities |

### API Routes

| Route Group | Endpoints |
|-------------|-----------|
| Search | `GET /api/v1/search` |
| Booking | `POST /api/v1/bookings`, confirmation |
| Static | `GET /api/v1/properties/:id` |
| Payment | `POST /api/v1/payments/intent` |
| Config | `GET/PUT /api/v1/config/property/:id` |
| Nav | `GET/POST/PUT/DELETE /api/v1/nav` |
| Sync | `POST /api/v1/sync/property/:id` (cache invalidation) |
| Admin | Org, properties, settings management |
| Admin Bookings | Booking management for admin panel |
| Admin Guests | Guest list, detail, notes, block/unblock |
| Auth | Admin login, Google OAuth, password reset |
| B2B Auth | B2B JWT login for travel agent portals |
| B2B Access | Super-admin buyer–seller org relationships |
| Rates | `GET /api/v1/rates` (exchange rates) |
| Promo | `GET/POST/PUT/DELETE /api/v1/promo-codes` |
| Affiliates | Affiliate CRUD + property overrides |
| Campaigns | Campaign CRUD + property overrides |
| Communication | Email/WhatsApp/SMS settings |
| WhatsApp | WhatsApp provider config |
| Messages | Message rule management |
| Offers | Offers & constraints config (global + property) |
| Marketing | Marketing channel feature toggles |
| Price Comparison | OTA price results |
| Onsite Conversion | Social proof widget config + public data |
| Tracking Pixels | Pixel CRUD per org/property |
| Cross-Sell | Post-booking upsell products + Ticketmaster |
| Groups | Group booking config (chain + property level) |
| AI Config | AI provider config (system/org/property) |
| AI Channels | AI channel toggles per sales model |
| AI Chat | Conversational AI search (SSE streaming) |
| MCP (public) | MCP tool endpoint for external AI platforms |
| Admin MCP | MCP config management |
| Maps Config | Map provider + POI settings |
| Maps Public | POI data served to guest-facing pages |
| Weather Config | Weather provider settings |
| Weather Public | Forecast data served to guest-facing pages |
| Events Config | Ticketmaster integration settings |
| Events Public | Nearby events served to guest-facing pages |
| Manual | PDF user manual upload/download |
| Users | Admin user invite, role, property assignment |
| Property Override | Per-property setting overrides |

### Payment Flows

Three supported flows, determined per rate plan:

| Flow | Stripe Mechanism | When Charged |
|------|-----------------|--------------|
| `online_charge` | PaymentIntent | At booking |
| `pay_at_hotel_guarantee` | SetupIntent (card tokenization) | Never captured |
| `pay_at_hotel_no_card` | None | No card required |

### Authentication

- **HyperGuest:** Bearer token (`HYPERGUEST_BEARER_TOKEN`)
- **Stripe webhooks:** Signature validation (`STRIPE_WEBHOOK_SECRET`)
- **Admin routes:** Email/password + Google OAuth; JWT session cookie
- **B2B routes:** Separate JWT flow (`JWT_SECRET`) for travel agent portals

---

## Frontend — `apps/web`

**Framework:** Next.js 14.2 with App Router (React 18, TypeScript)

**Responsibilities:** Guest-facing booking flow, admin dashboard, per-hotel theming.

### Folder Structure

```
src/
├── app/
│   ├── (main)/          — Guest-facing: homepage, search, booking, confirmation
│   └── admin/           — Admin dashboard (design, config, payments, communication, conversion)
├── components/          — Reusable UI (home, search, booking, payment, layout, ui)
├── hooks/               — React Query hooks (search, config, property, rates, etc.)
├── context/             — PreferencesContext (locale, currency in localStorage)
└── lib/                 — api-client, stripe, search-params, currencies, locales
```

### State Management

| Layer | Tool | What It Manages |
|-------|------|----------------|
| Server state | React Query (TanStack) | API data: search, config, property, bookings |
| Client preferences | React Context + localStorage | Locale, currency selection |
| Form state | react-hook-form + Zod | Booking form, admin config forms |
| Theme | CSS variables from HotelConfig | Per-property colors, fonts, border radius |

### i18n

- **Library:** `next-intl`
- **Locale storage:** localStorage (`ibe-locale`) + context
- **Enabled locales:** Per-property config in database
- **RTL support:** Configurable per property (`textDirection: ltr | rtl`)

### API Communication

All backend calls go through `lib/api-client.ts` — a centralized, fully typed HTTP client. The browser hits Next.js at port 3000; Next.js rewrites `/api/*` to the Fastify backend at port 3001.

---

## Shared Package — `packages/shared`

Consumed by both `apps/api` and `apps/web`. Defines the contract between frontend and backend.

| Module | Contents |
|--------|---------|
| `enums.ts` | BookingStatus, PaymentFlow, BoardType, GuestTitle, etc. |
| `types/api.ts` | SearchParams, SearchResponse, CreateBookingRequest, HotelDesignConfig, etc. |
| `types/hyperguest.ts` | HyperGuest API response shapes |
| `schemas/` | Zod validation schemas for search, booking, payment |
| `utils/` | Date helpers (nightsBetween), currency formatting, guest occupancy |
| `constants.ts` | Board labels, payment flow descriptions, error codes |

---

## Database

**Production:** PostgreSQL 16
**Development:** SQLite (no Docker required)
**ORM:** Prisma 5.12

Schema files:
- `apps/api/prisma/schema.prisma` — production (PostgreSQL)
- `apps/api/prisma/schema.dev.prisma` — development (SQLite)

### Models

| Model | Purpose |
|-------|---------|
| `Organization` | Top-level tenant — org type (seller/buyer), slug, name |
| `AdminUser` | Admin panel users — role, email, Google OAuth, password hash |
| `AdminUserProperty` | Many-to-many: admin user ↔ assigned properties |
| `Booking` | Confirmed reservations — guest info, dates, amounts, Stripe intent ID, HyperGuest booking ID |
| `BookingRoom` | Individual rooms within a booking |
| `Guest` | Registered guest accounts — email, name, phone, block status |
| `GuestNote` | Timestamped admin notes per guest |
| `SearchSession` | Short-lived search replay cache (expires via TTL) |
| `HotelConfig` | Per-property design tokens, enabled currencies/locales, branding, carousel settings |
| `OrgSettings` | Organization-wide config — HyperGuest credentials, domain, TLS cert, property mode |
| `OrgDesignDefaults` | Chain-level design defaults inherited by properties |
| `SystemDesignConfig` | Platform-level design defaults (super admin) |
| `Property` | Registry of active HyperGuest property IDs |
| `PromoCode` | Discount codes — type (fixed/percent), validity window, max uses, soft delete |
| `NavItem` | Custom header navigation links per property |
| `OrgNavItem` | Organisation-level nav items |
| `OrgNavItemOverride` / `PropertyItemOverride` | Per-property nav overrides |
| `StripePaymentRecord` | Stripe intent state tracking per booking |
| `CommunicationSettings` | Email/WhatsApp/SMS provider credentials and toggles |
| `SystemCommunicationSettings` | Platform-level communication defaults |
| `MessageRule` | Transactional message triggers — channel, timing, offset from booking event |
| `OnsiteConversionSettings` | Social proof widget config (org level) |
| `PropertyOnsiteConversionSettings` | Property-level onsite conversion overrides |
| `OrgOffersSettings` | Offers & constraints config (org level) |
| `PropertyOffersSettings` | Per-property offers overrides |
| `PriceComparisonOta` | OTA registry for price comparison (name, URL, enabled) |
| `PriceComparisonCache` | Cached OTA price results with TTL-based expiry |
| `Affiliate` | Affiliate partners — commission rate, guest discount, scope |
| `AffiliateBooking` | Commission snapshot recorded at booking time |
| `Campaign` | Marketing campaigns — same structure as affiliates + media field |
| `CampaignBooking` | Campaign commission snapshot recorded at booking time |
| `TrackingPixel` | Marketing pixel snippets — pages, scope, enable/disable |
| `OrgMarketingSettings` | Marketing channel feature toggles (B2C/B2B) per org |
| `PropertyMarketingSettings` | Property-level marketing overrides |
| `OrgB2BAccess` | Buyer–seller organisation relationships |
| `SystemAIConfig` | Platform-level AI provider defaults |
| `OrgAIConfig` | Org-level AI provider config (inherits from system) |
| `PropertyAIConfig` | Property-level AI config overrides |
| `OrgAIChannels` | AI channel toggles per sales model (B2C/B2B) per org |
| `SystemMcpConfig` | Platform-level MCP defaults |
| `OrgMcpConfig` | Org-level MCP config — API key, channel access |
| `PropertyMcpConfig` | Property-level MCP overrides |
| `SystemMapsConfig` | Platform-level maps defaults |
| `OrgMapsConfig` | Org-level map provider + POI settings |
| `SystemWeatherConfig` | Platform-level weather defaults |
| `OrgWeatherConfig` | Org-level weather provider settings |
| `SystemEventsConfig` | Platform-level events (Ticketmaster) defaults |
| `OrgEventsConfig` | Org-level Ticketmaster API config |
| `CrossSellConfig` | Org-level cross-sell enable/disable + payment mode |
| `CrossSellProduct` | Internal add-on product catalog |
| `PropertyCrossSellConfig` | Property-level cross-sell overrides |
| `GroupConfig` | Chain-level group booking settings (pricing, meals, policies) |
| `PropertyGroupConfig` | Property-level group config overrides |

---

## Cache Layer — Redis

**Client:** ioredis 5
**Connection:** `REDIS_URL` env var (optional — in-memory fallback if not set)
**Wrapper:** `apps/api/src/utils/redis.ts` — `cacheGet`, `cacheSet`, `cacheDel`

| What's Cached | TTL | Notes |
|---------------|-----|-------|
| Search results | 5 min (configurable) | Keyed by property + dates + guests + currency |
| Property static data | 24 h (configurable) | Rooms, images, amenities from HyperGuest |
| Exchange rates | 6 h | Frankfurter API response |
| Hotel config | 1 h | Design tokens, per-property settings |
| OTA price comparison | 2 h (success) / 5 min (failure) | Per OTA + check-in/out dates |

Cache invalidation: TTL-based auto-expiry + manual flush via `POST /api/v1/sync/property/:id`.

---

## External Integrations

| Service | Purpose | How Credentials Are Stored |
|---------|---------|--------------------------|
| **HyperGuest** | Core PMS — availability search, booking creation, property static data | `HYPERGUEST_BEARER_TOKEN` env var + domain URLs |
| **Stripe** | Payment processing — PaymentIntent, SetupIntent, webhook capture | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` env vars |
| **Frankfurter** | Currency exchange rates | No credentials (public API) |
| **SendGrid / Mailgun / SMTP** | Transactional email | Encrypted in `CommunicationSettings` DB record |
| **Meta WhatsApp Cloud API** | WhatsApp notifications | Encrypted in `CommunicationSettings` DB record |
| **Twilio** | SMS + WhatsApp fallback | Encrypted in `CommunicationSettings` DB record |
| **Vonage / AWS SNS** | SMS alternatives | Encrypted in `CommunicationSettings` DB record |
| **Xotelo** | OTA price data (TripAdvisor aggregator API) | No credentials (free public API) |
| **Playwright** | Fallback OTA scraper (when Xotelo key unavailable) | No credentials |
| **OpenAI / Anthropic / others** | AI assistant and conversational search | Encrypted in `OrgAIConfig` / `SystemAIConfig` DB records |
| **Open-Meteo** | Weather forecasts for guest-facing weather strip | No credentials (free public API) |
| **Ticketmaster** | Local events near property | API key in `OrgEventsConfig` DB record; system key as fallback |
| **OpenStreetMap / Google Maps / Mapbox** | Map tiles and points of interest | Provider-dependent; config in `OrgMapsConfig` DB record |

---

## Infrastructure

**Docker Compose** provides local infrastructure dependencies:

| Container | Image | Port | Persistence |
|-----------|-------|------|-------------|
| `ibe_postgres` | postgres:16-alpine | 5432 | `postgres_data` volume |
| `ibe_redis` | redis:7-alpine | 6379 | `redis_data` volume (AOF) |

Both containers have health checks and restart unless stopped.

The application itself (API + web) runs directly on the host via Node.js — no Dockerfiles yet.

---

## Environment Variables

```
# Database
DATABASE_URL=postgresql://ibe_user:ibe_pass@localhost:5432/ibe_db
REDIS_URL=redis://localhost:6379

# API Server
API_PORT=3001
API_HOST=0.0.0.0
NODE_ENV=development

# HyperGuest
HYPERGUEST_BEARER_TOKEN=
HYPERGUEST_SEARCH_DOMAIN=
HYPERGUEST_BOOKING_DOMAIN=
HYPERGUEST_STATIC_DOMAIN=
HYPERGUEST_MOCK=false          # set true for local mock testing

# Security
CORS_ORIGINS=http://localhost:3000
JWT_SECRET=                    # min 32 chars, for future B2B auth
JWT_EXPIRES_IN=7d

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_DEFAULT_LOCALE=en
NEXT_PUBLIC_DEFAULT_CURRENCY=EUR

# Cache TTLs (seconds)
SEARCH_CACHE_TTL=300
STATIC_DATA_CACHE_TTL=86400
```

---

## Data Flow — Booking

```
Guest                   Web (Next.js)              API (Fastify)            External
  │                          │                          │                       │
  ├─ Search ────────────────►│                          │                       │
  │                          ├─ GET /api/v1/search ────►│                       │
  │                          │                          ├─ Redis cache check    │
  │                          │                          ├─ POST HyperGuest ────►│
  │                          │                          │◄─ availability ───────┤
  │◄─ results ───────────────┤◄─ SearchResponse ────────┤                       │
  │                          │                          │                       │
  ├─ Select room ───────────►│                          │                       │
  ├─ Fill guest info ────────►│                          │                       │
  │                          ├─ POST /api/v1/payments ─►│                       │
  │                          │                          ├─ Stripe intent ──────►│
  │                          │◄─ clientSecret ──────────┤◄─ intent created ─────┤
  │                          │                          │                       │
  ├─ Card entry (Stripe.js) ─►│ (Stripe Elements)        │                       │
  │                          ├─ POST /api/v1/bookings ─►│                       │
  │                          │                          ├─ POST HyperGuest ────►│
  │                          │                          │◄─ booking ID ─────────┤
  │                          │                          ├─ Capture/Save to DB   │
  │◄─ confirmation ──────────┤◄─ BookingConfirmation ───┤                       │
```

---

## TypeScript Configuration

All apps extend `tsconfig.base.json` (root):
- Target: ES2022, Module: NodeNext
- Strict mode + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- Source maps + declaration files enabled

Frontend additionally: `jsx: preserve`, `moduleResolution: bundler`, `@/*` path alias → `src/*`
