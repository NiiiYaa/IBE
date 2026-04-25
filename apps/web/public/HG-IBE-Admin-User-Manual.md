# HyperGuest IBE — Admin Panel User Manual

**Version:** 1.0 | **Audience:** Hotel Administrators & Platform Operators

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Bookings](#2-bookings)
3. [Marketing](#3-marketing)
   - 3.1 Promo Codes
   - 3.2 Price Comparison
   - 3.3 Onsite Conversion
   - 3.4 Affiliates
   - 3.5 Campaigns
4. [Display & Design](#4-display--design)
   - 4.1 Chain Page
   - 4.2 Hotel Homepage
   - 4.3 Rooms & Search Page
   - 4.4 Header & Footer
   - 4.5 Currency & Language
   - 4.6 Brand Settings
5. [Guests](#5-guests)
   - 5.1 Guest List
   - 5.2 Guest Detail
   - 5.3 Communication Rules
6. [Configuration](#6-configuration)
   - 6.1 Properties
   - 6.2 Organisation
   - 6.3 Custom Domain
   - 6.4 Offers & Constraints
   - 6.5 Tracking & Analytics
   - 6.6 Payment Gateway
   - 6.7 Email
   - 6.8 WhatsApp
   - 6.9 SMS
7. [Team](#7-team)
   - 7.1 Users
   - 7.2 Organisations (Super Admin)
8. [Roles & Permissions Reference](#8-roles--permissions-reference)

---

## 1. Getting Started

### Accessing the Admin Panel

1. Open your browser and navigate to your IBE URL followed by `/admin`
   - Example: `https://grandhotel.hyperguest.net/admin`
2. Log in with your email and password, or click **Continue with Google** if Google OAuth is enabled for your account.
3. After login you will land on the **Bookings** section.

### Navigation

The left sidebar gives access to all admin sections. On smaller screens, the sidebar collapses — click the menu icon at the top left to expand it.

The top of the sidebar shows your organisation name and currently selected property. If you manage multiple properties, use the property selector to switch between them.

### Roles Overview

Your role determines what you can see and do:

| Role | Access level |
|---|---|
| **Super Admin** | Full access across all organisations and properties on the platform |
| **Admin** | Full access within your organisation |
| **Observer** | Read-only; guest name and email are masked |
| **User** | Limited access based on property assignment |

---

## 2. Bookings

The Bookings section gives you a real-time view of all reservations. Seven pre-filtered views help you focus on what matters right now.

### Views

| View | Use it for |
|---|---|
| **All Bookings** | Full booking history with free-form filtering and sorting |
| **Booked Today** | New reservations created today |
| **Check-in Today** | Guests arriving today |
| **Check-out Today** | Guests departing today |
| **Staying In** | Guests currently checked in |
| **CNXL Today** | Bookings whose cancellation deadline expires today |
| **Cancelled Today** | Bookings cancelled today |

### Using the Bookings Table

**Filtering:** Use the filter bar at the top to narrow results by date range, status, hotel, or guest name.

**Sorting:** Click any column header to sort ascending or descending.

**Toggling columns:** Click the **Columns** button to show or hide columns. The table remembers your preferences per session. Available columns include:

- IBE ID, HyperGuest ID, Status
- Account ID, Hotel ID, Hotel Name, Hotel Address
- Booking Date, Cancellation Deadline, Check-in, Check-out, Nights, Cancellation Date
- Guest Name, Guest Email *(masked for Observer/User roles)*
- Currency, Original Price, Discounted Price
- Promo Code, Promo Discount %, Affiliate, Affiliate Discount %
- Commission %, Commission Value
- Payment Method, Rooms, Agency Reference, Test flag

**Booking statuses:**
- **Confirmed** — Booking is active and payment (if applicable) is captured or guaranteed
- **Pending** — Booking initiated but not yet fully confirmed
- **Cancelled** — Booking has been cancelled

### Viewing a Booking

Click any row to open the full booking detail, including guest information, room breakdown, payment details, and the HyperGuest reference ID.

---

## 3. Marketing

### 3.1 Promo Codes

Promo codes let you offer discounts to guests at checkout.

#### Creating a Promo Code

1. Go to **Marketing → Promo Codes** and click **New Promo Code**.
2. Fill in the fields:
   - **Code** — Enter a custom code (e.g. `SUMMER25`) or leave blank to auto-generate one.
   - **Discount type** — Choose **Percentage** or **Fixed amount**.
   - **Discount value** — Enter the percentage or amount.
   - **Currency** — Required for fixed-amount codes; select the billing currency.
   - **Valid from / Valid to** — Optional date window; leave blank for no expiry.
   - **Max uses** — Optional cap on total redemptions; leave blank for unlimited.
   - **Scope** — **Global** (applies to all properties) or **Property-specific**.
3. Click **Save**.

#### Managing Promo Codes

- **Edit** — Click the edit icon on any code row to update its settings.
- **Deactivate** — Soft-deletes the code so it can no longer be redeemed. Historical booking data linked to the code is preserved.
- **Property overrides** — For global codes, each property can independently enable or disable the code without modifying the global setting. Open the code and use the property overrides table.

#### How Guests Use Promo Codes

Guests enter the code in the promo code field on the booking form. The discount is applied immediately and shown in the price breakdown.

You can also deep-link with a pre-applied code: add `?promoCode=CODE` to the booking URL.

---

### 3.2 Price Comparison

The price comparison widget shows guests live OTA prices alongside your direct rate, reinforcing your best-price guarantee.

#### Setting Up Price Comparison

1. Go to **Marketing → Price Comparison**.
2. **TripAdvisor key** — Paste your hotel's TripAdvisor URL into the field. The key (e.g. `g293916-d305496`) is extracted automatically.
3. **Add OTA entries** — Click **Add OTA**, enter a display name (e.g. `Booking.com`) and the URL of your hotel's page on that OTA. Enable the toggle to activate it.
4. Click **Save**.

#### How It Works

- Rates are fetched via the Xotelo API from Booking.com, Agoda, Trip.com, Vio.com, and others.
- Results are cached: 2 hours for successful fetches, 5 minutes on failure.
- The guest-facing widget polls every 5 seconds while loading, then displays OTA prices in pink and "This website" in green with a savings percentage highlighted.

> **Note:** Price comparison requires a TripAdvisor hotel key and is only available in single-property context (not on the chain homepage).

---

### 3.3 Onsite Conversion

Onsite conversion widgets show real-time social proof to guests while they browse and book.

#### Widgets Available

- **Presence alerts** — Displays a notification such as "12 people are viewing this hotel right now."
- **Recent bookings popup** — Displays a popup such as "Someone from Tel Aviv just booked Deluxe Room."

#### Configuring Onsite Conversion

1. Go to **Marketing → Onsite Conversion**.
2. For each widget:
   - **Enable/disable** the widget with the toggle.
   - Set the **display interval** (how often the notification appears, in seconds).
   - Set the **display duration** (how long each notification stays visible).
3. Use **Global settings** to apply defaults across all properties.
4. Per-property overrides are available under each property's settings tab.
5. Click **Save**.

---

### 3.4 Affiliates

Affiliates are referral partners who send traffic to your booking engine via a unique link.

#### Creating an Affiliate

1. Go to **Marketing → Affiliates** and click **New Affiliate**.
2. Fill in the fields:
   - **Code** — Unique identifier used in the booking URL (e.g. `PARTNER01`).
   - **Commission rate** — Percentage of the total booking value recorded at the time of booking.
   - **Guest discount** — Optional percentage discount given to guests arriving via the affiliate link.
   - **Display text** — Shown to the guest as "Special for [display text]" on the search results page.
   - **Notes** — Internal memo (not visible to guests).
   - **Status** — Active or Inactive.
   - **Scope** — Global or property-specific.
3. Click **Save**.

#### Sharing the Affiliate Link

After saving, click **Copy URL** on the affiliate row. The generated link includes `?affiliateId=CODE` and is ready to share with the affiliate partner.

#### Tracking Commissions

Commission is recorded at the moment of booking as a snapshot of the rate and calculated amount. View commission data in the Bookings table (Commission % and Commission Value columns).

#### Property Overrides

For global affiliates, each property can independently be enabled or disabled without changing the global affiliate record. Open the affiliate and use the property overrides section.

---

### 3.5 Campaigns

Campaigns work identically to Affiliates but are designed for marketing campaigns rather than individual referral partners.

#### Additional Field

- **Media** — Optional field to record the campaign channel (e.g. `Google Ads`, `Facebook`, `Newsletter`).

#### Creating a Campaign

Follow the same steps as for Affiliates (section 3.4), using **Marketing → Campaigns**. The booking URL uses `?campaignId=CODE`.

> Campaign commissions are recorded separately from affiliate commissions — a booking can have both an affiliate and a campaign attached to it.

---

## 4. Display & Design

All visual settings for the guest-facing booking engine are managed here. Chain-level defaults cascade down to properties, which can inherit or override them.

---

### 4.1 Chain Page

The chain page is the multi-property landing page shown at `/?chain=<orgId>` (or your custom domain root for multi-property organisations).

1. Go to **Design → Chain**.
2. Configure:
   - **Display name** — The name shown in the hero section.
   - **Tagline** — Short subtitle displayed under the name.
   - **Logo** — Upload or provide a URL for the chain logo.
   - **Favicon** — Upload a favicon image.
   - **Hero style** — Choose the layout template for the hero section.
   - **Hero image mode** — **Fixed** (single image) or **Carousel** (auto-playing slideshow).
   - **Hero image** — Select from images across all properties in the organisation.
   - **City selector** — Toggle the city filter widget on or off.
   - **Colours and fonts** — Primary colour, text colour, button colour, border radius, font family.
3. Click **Save**.

---

### 4.2 Hotel Homepage

Configures the individual hotel's landing page.

1. Go to **Design → Homepage**.
2. Configure:
   - **Hero style** — Choose from available layout templates.
   - **Hero image mode** — **Fixed** or **Carousel**.
   - **Carousel interval** — Time in seconds between image transitions (carousel mode only).
   - **Hero image** — Select the primary hero image.
   - **Excluded images** — Select any images you want to hide from the carousel.
3. A live thumbnail preview updates in real time as you change settings.
4. Click **Save**.

---

### 4.3 Rooms & Search Page

Configures the search results page and room display.

1. Go to **Design → Search**.
2. Configure:

   **Banner:**
   - Toggle the banner on or off.
   - Set banner mode: **Fixed** or **Carousel**, with interval.
   - Select and exclude banner images.

   **Room images:**
   - For each room type, select the primary image.
   - Exclude unwanted images from the room image gallery.

   **Guest age groups:**
   - Define age bands used for child pricing: e.g. Infant (0–2), Child (3–11), Teen (12–17).
   - These must match your HyperGuest rate configuration.

   **Rate expansion:**
   - Choose whether rate plan cards are **expanded** (full detail visible by default) or **collapsed** (guest clicks to expand).

3. Click **Save**.

---

### 4.4 Header & Footer

#### Header

The header appears on every guest-facing page.

1. Go to **Design → Header**.
2. Click **Add item** to create a navigation link:
   - **Label** — The text shown in the menu.
   - **URL** — The destination link, or a content block.
3. Drag items to reorder them.
4. Remove items with the delete icon.
5. Organisation-level items can be overridden per property.
6. Click **Save**.

#### Footer

1. Go to **Design → Footer**.
2. Add, edit, and order footer links the same way as header items.
3. Click **Save**.

---

### 4.5 Currency & Language

#### Currency

1. Go to **Design → Currency**.
2. Enable or disable each currency using the toggles.
3. Select the **default currency** from the dropdown — this is what guests see on first load.
4. Click **Save**.

#### Language

1. Go to **Design → Language**.
2. Enable or disable each locale (e.g. `en`, `he`, `ar`, `de`).
3. Set the **text direction**: **LTR** (left-to-right) or **RTL** (right-to-left). RTL is recommended for Arabic and Hebrew.
4. Click **Save**.

---

### 4.6 Brand Settings

Brand settings control the property's visual identity across all guest-facing pages.

1. Go to **Design → Brand**.
2. Configure:
   - **Display name** — Property name shown to guests.
   - **Tagline** — Short description.
   - **Tab / browser title** — Text shown in the browser tab.
   - **Logo URL** — Direct link to the hotel logo image.
   - **Favicon** — Upload a favicon image file.
   - **Primary colour** — Main accent colour (hex or colour picker).
   - **Text colour** — Body text colour.
   - **Button colour** — CTA button colour.
   - **Border radius** — Controls how rounded corners are (0 = sharp, higher = more rounded).
3. Click **Save**.

---

## 5. Guests

### 5.1 Guest List

The guest list shows all registered guests across your organisation.

1. Go to **Guests → Guest List**.
2. Use the **search bar** to find guests by name or email.
3. Use pagination controls to browse large lists.

#### Inline Actions

Without leaving the list, you can:

- **Edit** — Click the edit icon to open a modal and update the guest's first name, last name, phone number, or nationality.
- **Block** — Click the block icon, optionally enter a reason, and confirm. A blocked guest cannot log in or make new bookings.
- **Unblock** — Click the unblock icon on a currently blocked guest.
- **Delete** — Click the delete icon and confirm the dialog. This permanently deletes the guest record.

---

### 5.2 Guest Detail Page

Click any guest row to open their full profile.

The detail page shows:
- **Personal details** — Name, email, phone, nationality, registration date.
- **Email verification status** — Whether the guest has verified their email address.
- **Block status** — Whether the guest is blocked and the reason if set.
- **Booking history** — All bookings made by this guest.
- **Admin notes** — Internal notes visible only to admin users.

#### Adding a Note

1. Scroll to the **Notes** section.
2. Type your note in the text field.
3. Click **Add Note**. The note is saved with a timestamp and your username.
4. Multiple notes per guest are supported and displayed in reverse chronological order.

---

### 5.3 Communication Rules

Communication rules automatically send messages to guests when booking events occur.

1. Go to **Guests → Messages**.
2. Click **New Rule** to create a rule.
3. Configure:
   - **Trigger event** — Choose when the message is sent:
     - Booking confirmed
     - Check-in reminder
     - Check-out follow-up
     - Cancellation
   - **Timing** — Send immediately, or set an offset: e.g. "2 days before check-in" or "1 day after check-out."
   - **Channels** — Enable one or more channels: **Email**, **WhatsApp**, **SMS**.
   - **Message content** — Enter the message text for each enabled channel. You can use placeholders for guest name, hotel name, check-in date, etc.
   - **Enable/disable** — Toggle the rule active or inactive.
4. Click **Save**.

#### Property Overrides

Global communication rules can be toggled on or off per property without modifying the global rule. Open the rule and use the property overrides section.

> **Note:** Channels must be configured in **Configuration → Email / WhatsApp / SMS** before messages can be sent.

---

## 6. Configuration

### 6.1 Properties

Manage which HyperGuest properties are connected to your organisation.

1. Go to **Config → Properties**.
2. **Add a property** — Click **Add Property** and enter the HyperGuest property ID.
3. **Set subdomain** — Enter a subdomain (e.g. `grandhotel`) to route `grandhotel.hyperguest.net` to this property.
4. **Demo properties** — Toggle the visibility of demo properties.
5. **Sync** — Click the **Sync** button next to a property to trigger a fresh pull of static property data from HyperGuest.
6. **Single vs. multi-property mode** — Toggle whether the booking engine shows a single property or a multi-property chain view.
7. Click **Save**.

---

### 6.2 Organisation

Organisation-level HyperGuest API settings. Requires **Admin** role.

1. Go to **Config → Organisation**.
2. Configure:
   - **HyperGuest demand organisation ID** — Your organisation's ID in the HyperGuest platform.
   - **API bearer token** — Authentication token for HyperGuest API calls.
   - **Static domain** — HyperGuest static data API endpoint.
   - **Search domain** — HyperGuest availability search API endpoint.
   - **Booking domain** — HyperGuest booking API endpoint.
   - **Rate provider** — Select the rate provider to use.
3. Click **Save**.

---

### 6.3 Custom Domain

Point your own domain (e.g. `book.grandhotel.com`) to your IBE.

1. Go to **Config → Domain**.
2. Enter your **web domain URL** (include `https://`).
3. Upload your **SSL/TLS certificate** in PEM format.
4. Upload your **TLS private key** (write-only — the key is stored securely and never shown again after saving).
5. Click **Save**.

> **Note:** You must also configure a DNS CNAME record pointing your domain to the HyperGuest IBE platform. Contact your HyperGuest account manager for the target hostname.

---

### 6.4 Offers & Constraints

Control which rates are displayed and how the booking flow works.

1. Go to **Config → Offers & Constraints**.
2. Configure the filters and limits:

   **Stay length:**
   - **Min nights** — Hide rates requiring fewer nights than this.
   - **Max nights** — Hide rates requiring more nights than this.

   **Room limits:**
   - **Min rooms** — Minimum rooms per booking.
   - **Max rooms** — Maximum rooms per booking.

   **Rate filters:**
   - **Cancellation policy** — Only show rates matching specific cancellation terms (e.g. free cancellation only).
   - **Board type** — Only show specific board types (e.g. room only, breakfast included).
   - **Charge party** — Filter by who is charged (guest or hotel).
   - **Payment method** — Limit to specific payment flows.
   - **Minimum offer value** — Hide rates below this price threshold.

   **Booking mode:**
   - **Single** — Selecting a rate goes directly to checkout.
   - **Multi** — Selecting a rate adds it to a cart; the guest can add multiple rooms before checking out.

   **Multi-room limit** (multi mode only):
   - **Hotel maximum** — Cap rooms at the hotel's configured maximum.
   - **Search query** — Cap rooms at the number of rooms in the guest's search query.

3. Click **Save**.

---

### 6.5 Tracking & Analytics

Add marketing and analytics pixels that fire on guest-facing pages.

1. Go to **Config → Tracking**.
2. Click **Add Pixel**.
3. Configure:
   - **Name** — Internal label for the pixel.
   - **Code** — Paste the JavaScript/pixel snippet provided by your analytics platform.
   - **Pages** — Select which pages the pixel fires on: Homepage, Search, Booking, Confirmation.
   - **Scope** — Global (all properties) or property-specific.
   - **Enable/disable** toggle.
4. Click **Save**.

---

### 6.6 Payment Gateway

Configure Stripe integration. Requires **Admin** role.

1. Go to **Config → Payment Gateway**.
2. Enter your **Stripe publishable key** and **Stripe secret key**.
3. Enable the payment methods you want to offer guests:
   - **Online charge** — Card is authorised and captured at booking time.
   - **Pay at hotel — guarantee** — Card details are saved via Stripe SetupIntent but not charged.
   - **Pay at hotel — no card** — No payment information collected; booking on trust.
4. Click **Save**.

> **Security note:** Stripe keys are stored encrypted. The secret key is write-only and is never returned by the API after saving.

---

### 6.7 Email

Configure transactional email delivery for booking confirmations and communication rules.

1. Go to **Config → Emails**.
2. Toggle email sending **on** or **off**.
3. Choose your **provider**: SMTP, SendGrid, or Mailgun.
4. Enter your **From name** and **From address**.
5. Enter your provider credentials:
   - **SMTP** — Host, port, username, password.
   - **SendGrid** — API key.
   - **Mailgun** — API key and domain.
6. Click **Save**.

> Credentials are write-only — after saving, the admin panel only shows whether they have been set, not their values.

---

### 6.8 WhatsApp

Configure WhatsApp Business messaging.

1. Go to **Config → WhatsApp**.
2. Toggle WhatsApp **on** or **off**.
3. Choose your **provider**: Meta Cloud API or Twilio.
4. Enter your provider credentials.
5. Click **Save**.

---

### 6.9 SMS

Configure SMS messaging.

1. Go to **Config → SMS**.
2. Toggle SMS **on** or **off**.
3. Choose your **provider**: Twilio, Vonage, or AWS SNS.
4. Enter your provider credentials.
5. Click **Save**.

---

## 7. Team

### 7.1 Users

Manage admin panel users within your organisation. Requires **Admin** role.

#### Inviting a User

1. Go to **Team → Users** and click **Invite User**.
2. Enter the user's **email address**.
3. Assign a **role**: Admin, Observer, or User.
4. Assign **properties** — select which hotel(s) this user can administer. Leave unassigned for access to all properties.
5. Click **Send Invite**. The user will receive an email invitation.

#### Managing Users

- **Edit** — Click the edit icon to change a user's role or property assignments.
- **Deactivate** — Prevents the user from logging in without deleting their record.
- **Delete** — Permanently removes the user.

---

### 7.2 Organisations (Super Admin Only)

Platform-level management of all organisations on the system.

1. Go to **Team → Organisations**.
2. The list shows all organisations on the platform.
3. **Create** — Click **New Organisation** to onboard a new hotel group.
4. **Edit** — Click an organisation to view and edit its settings, properties, and users.

---

## 8. Roles & Permissions Reference

| Feature | Super Admin | Admin | Observer | User |
|---|---|---|---|---|
| View all bookings | ✓ | ✓ | ✓ (masked PII) | ✓ (masked PII) |
| View guest name & email | ✓ | ✓ | — | — |
| Manage bookings | ✓ | ✓ | — | — |
| Manage promo codes | ✓ | ✓ | — | — |
| Manage affiliates & campaigns | ✓ | ✓ | — | — |
| Manage price comparison | ✓ | ✓ | — | — |
| Manage onsite conversion | ✓ | ✓ | — | — |
| Manage design & brand | ✓ | ✓ | — | — |
| View guests | ✓ | ✓ | ✓ | — |
| Edit / block / delete guests | ✓ | ✓ | — | — |
| Add guest notes | ✓ | ✓ | — | — |
| Manage communication rules | ✓ | ✓ | — | — |
| Manage properties & domain | ✓ | ✓ | — | — |
| Manage organisation (API keys) | ✓ | ✓ | — | — |
| Manage payment gateway | ✓ | ✓ | — | — |
| Manage email / WhatsApp / SMS | ✓ | ✓ | — | — |
| Manage tracking pixels | ✓ | ✓ | — | — |
| Manage users | ✓ | ✓ | — | — |
| Manage all organisations | ✓ | — | — | — |

---

*HyperGuest IBE Admin Panel — User Manual v1.0*
