# HG IBE — Functionality Overview

**HyperGuest Internet Booking Engine (IBE)** is a white-label, multi-tenant hotel booking platform. Each hotel or hotel chain gets a branded booking engine at their own subdomain or custom domain, powered by HyperGuest availability and Stripe payments. The admin panel at `/admin` gives hotel operators full control over every aspect of the booking experience.

---

## 1. Guest Booking Flow

### How a guest books a room

1. **Landing page** — The hotel's homepage shows a hero image (or carousel), tagline, logo, and a search bar. Multi-property chains show all properties with a city selector.
2. **Search** — The guest enters check-in/out dates and room occupancy (adults + child ages). The system calls HyperGuest for live availability.
3. **Search results** — Available room types are listed with rates, photos, board options, and cancellation policy. A price comparison bar shows rates from OTAs (Booking.com, Agoda, etc.) so the guest can see they are getting the best price direct.
4. **Room selection** — Single-room mode: selecting a rate goes directly to checkout. Multi-room mode: selecting a rate adds the room to a cart; the guest can add multiple rooms before checking out.
5. **Booking form** — The guest fills in lead guest name, email, phone, nationality, and any special requests. Payment is collected according to the property's payment policy (see Payment Methods below).
6. **Confirmation** — A booking confirmation page is shown with booking details, and a confirmation email is sent (if email is configured).

### Payment methods
- **Online charge** — Stripe PaymentIntent; card is authorised at booking and captured on confirmation.
- **Pay at hotel — guarantee** — Stripe SetupIntent; card details are stored as a guarantee but not charged.
- **Pay at hotel — no card** — No payment captured; booking is made on trust.

### URL parameters carried through the booking flow
| Parameter | Description |
|---|---|
| `promoCode=` | Pre-fills and applies a promo code discount |
| `affiliateId=` | Tracks the booking source for an affiliate and applies their guest discount |
| `campaignId=` | Tracks the booking source for a campaign and applies its guest discount |
| `checkIn=`, `checkOut=`, `rooms[n][adults]=` | Deep-link directly into search with pre-filled dates and occupancy |

### Guest accounts
Guests can register, log in (email/password or Google OAuth), view their booking history, and manage their profile. Registered guests have their details pre-filled on future bookings.

---

## 2. Multi-Tenant & Subdomain Routing

The IBE serves multiple hotels from a single deployment:

- `grandhotel.hyperguest.net` — routes to a single property IBE by subdomain
- `marriott.hyperguest.net` — routes to a chain/multi-property IBE by organisation slug
- `book.grandhotel.com` — routes to the IBE via a hotel's custom domain
- `www.hyperguest.net` — platform root, redirects to admin

Each property gets full design customisation: colours, fonts, logo, favicon, hero images, and language/currency settings.

---

## 3. Admin Panel

The admin panel is at `/admin`. Access is protected by email/password or Google OAuth login. Roles: **Super Admin**, **Admin**, **Observer**, **User**.

---

### 3.1 Bookings

Seven filtered views of the booking database, all using the same configurable table:

| View | What it shows |
|---|---|
| All Bookings | Every booking, all time, with full filter/sort |
| Booked Today | New bookings created today |
| Check-in Today | Guests arriving today |
| Check-out Today | Guests departing today |
| Staying In | Guests currently in-house |
| CNXL Today | Cancellation deadlines expiring today |
| Cancelled Today | Bookings cancelled today |

**Table columns** (toggleable per user): IBE ID, HyperGuest ID, Status, Account ID, Hotel ID, Hotel Name, Hotel Address, Booking Date, Cancellation Deadline, Check-in, Check-out, Nights, Cancellation Date, Guest Name, Guest Email, Currency, Original Price, Discounted Price, Promo Code, Promo Discount %, Affiliate, Affiliate Discount %, Commission %, Commission Value, Payment Method, Rooms, Agency Reference, Test flag.

Guest name and email are masked for Observer/User roles (PII protection). Admins see the full data.

Booking statuses: **Confirmed**, **Pending**, **Cancelled**.

---

### 3.2 Marketing

#### Promo Codes
Create and manage discount codes that guests enter at checkout.

- **Code** — alphanumeric, auto-generated or custom
- **Discount type** — percentage or fixed amount
- **Currency** — for fixed-amount codes
- **Validity window** — optional from/to dates
- **Max uses** — optional cap on total redemptions
- **Scope** — global (all properties) or property-specific
- **Property overrides** — a global promo code can be enabled or disabled per property independently
- Soft-deleted codes are deactivated but historical booking data is preserved

#### Price Comparison
Shows guests live OTA prices alongside the hotel's direct rate, demonstrating the best-price guarantee.

- **TripAdvisor hotel key** — paste a TripAdvisor URL and the key is auto-extracted (e.g. `g293916-d305496`)
- **OTA entries** — CRUD list of OTA names + hotel page URLs; each can be enabled/disabled
- Data is fetched via the Xotelo API (free, no API key required) which returns rates from Booking.com, Agoda, Trip.com, Vio.com, and others
- Results are cached for 2 hours (success) or 5 minutes (failure); in-flight requests are deduplicated
- Guest-facing widget polls every 5 seconds while fetching, then shows OTA prices in pink and "This website" in green with a savings percentage
- Only available in single-property context (requires a TripAdvisor hotel key per property)

#### Onsite Conversion
Real-time social proof widgets shown to guests during search and booking.

- **Presence alerts** — "X people are viewing this hotel right now" style notifications
- **Recent bookings popup** — "Someone from [City] just booked [Room]" style popups
- Global settings with property-level overrides
- Each feature can be independently enabled/disabled and timed

#### Affiliates
Track and reward referral partners who send traffic via affiliate links.

- **Code** — unique per organisation, used in the booking URL as `?affiliateId=CODE`
- **Commission rate** — percentage of total booking amount recorded at booking time (snapshot)
- **Guest discount** — optional price reduction shown to guests arriving via the affiliate link
- **Display text** — shown as a "Special for [text]" label on the search results page
- **Notes** — internal memo
- **Status** — Active / Inactive
- **Scope** — global or property-specific
- **Property overrides** — global affiliates can be enabled/disabled per property
- **Copy URL** button generates the ready-to-share affiliate link
- Commission is recorded in `AffiliateBooking` at the time of booking (rate + calculated amount + currency snapshot)

#### Campaigns
Identical structure and functionality to Affiliates, designed for marketing campaigns rather than individual affiliate partners.

- **Code** — unique per organisation, used as `?campaignId=CODE`
- **Media** — optional field to note the campaign channel (e.g. Google Ads, Facebook, Newsletter)
- **Commission rate**, **Guest discount**, **Display text**, **Notes**, **Status**, **Scope** — same as Affiliates
- **Property overrides** — same override mechanism as Affiliates
- Commission is recorded in `CampaignBooking` independently from affiliate commissions

---

### 3.3 Display & Design

Full visual customisation per property, with chain-level defaults that properties can inherit or override.

#### Chain Page (`/admin/design/chain`)
Configures the multi-property landing page shown at `/?chain=<orgId>`.

- **Hero style** — layout style for the hero section (multiple options)
- **Hero image mode** — fixed single image or auto-playing carousel
- **Chain hero image** — select from all images across all properties in the organisation
- **Display name, tagline, logo, favicon**
- **Colours and fonts** — primary colour, text colour, button colour, border radius, font family
- **City selector** — toggle the city filter widget on the chain homepage

#### Hotel Page (`/admin/design/homepage`)
Configures the individual hotel's homepage.

- **Hero style** — choose from multiple layout templates
- **Hero image mode** — fixed or carousel with configurable interval
- **Hero image** — select primary image; exclude unwanted images from the carousel
- **Live preview** — thumbnail preview updates in real time as settings change

#### Rooms & Search Page (`/admin/design/search`)
Configures the search results page.

- **Banner** — toggle on/off; choose fixed or carousel mode with interval
- **Banner image** — select from property images; exclude unwanted ones
- **Room images** — per-room primary image selection and image exclusion
- **Guest age groups** — configure age bands for child pricing (infant, child, teen)
- **Rate expansion** — whether rate plans are expanded or collapsed by default

#### Header
Navigation items shown in the hotel's header across all guest-facing pages.

- Add/edit/delete nav items (label + URL or content)
- Organisation-level nav items with property-level override support

#### Footer
Footer content and links.

#### Currency
- Enable or disable specific currencies for the booking engine
- Set the default display currency

#### Language
- Enable or disable specific locales (e.g. en, he, ar, de)
- Set text direction: LTR or RTL (full RTL layout support for Arabic/Hebrew)

#### Brand (`/admin/design/brand`)
Per-property brand settings:

- Primary colour, text colour, button colour, border radius
- Logo URL
- Favicon (uploaded as image, stored as base64 or URL)
- Display name, tagline, tab/browser title

---

### 3.4 Guests

#### Guest List
Searchable, paginated list of all registered guests.

Inline actions without leaving the list:
- **Edit** — modal to update first name, last name, phone, nationality
- **Block / Unblock** — with optional reason; blocked guests cannot log in or book
- **Delete** — confirmation dialog; permanent deletion

#### Guest Detail Page
Full guest profile including:
- Personal details (name, email, phone, nationality, registration date)
- Email verification status
- Block status and block reason
- Booking history
- **Notes** — admins can add timestamped internal notes per guest; multiple notes per guest are supported

#### Messages (Communication Rules)
Automated message rules triggered by booking events.

- **Trigger events**: booking confirmed, check-in reminder, check-out follow-up, cancellation
- **Timing**: immediate, or offset before/after the trigger (e.g. "2 days before check-in")
- **Channels**: Email, WhatsApp, SMS — multiple channels per rule
- **Enable/disable** per rule
- **Property overrides** — global rules can be toggled per property without modifying the global rule

---

### 3.5 Configuration

#### Properties
Manage which HyperGuest properties are connected to the organisation.

- Add or remove properties by HyperGuest property ID
- Set a subdomain per property (e.g. `grandhotel` → `grandhotel.hyperguest.net`)
- Toggle demo property visibility
- HyperGuest sync button per property (triggers a fresh pull of static property data)
- Single-property vs. multi-property mode toggle

#### Organisation
Organisation-level settings (Admin role required):

- HyperGuest demand organisation ID
- HyperGuest API credentials (bearer token, static/search/booking domain)
- Rate provider selection

#### Domain
Custom domain for the booking engine:

- Web domain URL (e.g. `https://book.grandhotel.com`)
- SSL/TLS certificate upload (PEM format, with DER expiry parsing)
- TLS private key (write-only — never returned by the API)

#### Offers & Constraints
Global and per-property rules controlling which rates are shown and how booking works.

- **Min/max nights** — hide rates that don't meet the stay length requirements
- **Min/max rooms** — limits on how many rooms can be booked
- **Cancellation policy filter** — only show rates with specific cancellation terms (e.g. free cancellation only)
- **Board type filter** — only show specific board types (e.g. room only, breakfast included)
- **Charge party filter** — filter by who is charged (guest vs. hotel)
- **Payment method filter** — limit to specific payment flows
- **Minimum offer value** — hide rates below a price threshold
- **Booking mode** — Single (direct to checkout on rate selection) or Multi (cart-based multi-room selection)
- **Multi-room limit** — cap rooms by hotel maximum or by number of rooms in the search query

#### Tracking & Analytics
Manage tracking pixels for marketing and analytics platforms.

- Name, JavaScript/pixel code snippet
- Pages — configure which pages the pixel fires on (homepage, search, booking, confirmation)
- Scope — global (all properties) or property-specific
- Enable/disable per pixel

#### Payment Gateway (Admin role required)
Stripe integration settings.

- Stripe publishable and secret key configuration
- Payment method toggles:
  - Online charge (card captured at booking)
  - Pay at hotel with card guarantee (card saved, not charged)
  - Pay at hotel without card

#### Emails
SMTP / transactional email configuration.

- Enable/disable email sending
- Provider: SMTP, SendGrid, or Mailgun
- From name and from address
- Provider credentials (write-only — stored encrypted, API shows only whether they are set)

#### WhatsApp
WhatsApp Business messaging configuration.

- Enable/disable
- Provider: Meta Cloud API or Twilio
- Provider credentials (write-only)

#### SMS
SMS messaging configuration.

- Enable/disable
- Provider: Twilio, Vonage, or AWS SNS
- Provider credentials (write-only)

---

### 3.6 Team

#### Users (Admin role required)
Manage admin panel users within the organisation.

- Invite/create admin users by email
- Assign roles: Admin, Observer, User
- Assign properties (controls which hotel(s) a user can administer)
- Deactivate or delete users

#### Organisations (Super Admin only)
Platform-level management of all organisations on the system.

- List all organisations
- Create new organisations
- View/edit organisation settings across tenants

---

## 4. Roles & Permissions

| Role | Capabilities |
|---|---|
| **Super Admin** | Full access to all organisations and all admin features. Can view and manage every property across the platform. |
| **Admin** | Full access within their organisation: all bookings, design, config, payments, users. |
| **Observer** | Read-only access. Guest name/email columns are masked. Cannot make changes. |
| **User** | Limited access. Specific permissions depend on property assignments. |

---

## 5. Multi-Language & Multi-Currency

- **Languages**: Any number of locales can be enabled per property. Supported: English, Hebrew, Arabic, German, and others via `next-intl`.
- **RTL layout**: Full right-to-left layout support for Arabic and Hebrew.
- **Currencies**: Any combination of currencies can be enabled. Live exchange rates are applied.
- **Text direction**: Configurable per property (LTR / RTL).

---

## 6. Coming Soon

The following modules are planned and visible in the admin panel as placeholders:

- **Dashboards** — Analytics and reporting dashboards (booking trends, revenue, occupancy)
- **AI** — AI-powered tools and automation (smart pricing suggestions, guest communication drafts, etc.)
