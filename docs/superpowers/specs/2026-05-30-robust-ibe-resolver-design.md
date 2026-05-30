# Robust IBE Resolver Design

**Date:** 2026-05-30  
**File:** `apps/onboarding-api/src/services/ibe-resolver.service.ts`  
**Related:** `apps/onboarding-api/src/services/playwright-browser.service.ts`

---

## Problem

The current booking engine resolver misses booking buttons that use:
- Non-English text (e.g. French "Réserver", Italian "Prenota", German "Buchen")
- `<button>` elements instead of `<a href>` links
- Iframes embedding a booking widget
- JS-triggered navigation (onclick, data-href)
- Pages blocked by cookie consent banners before content is reachable

---

## Architecture

Three focused changes, each independent:

1. **Cookie consent bypass** — in `withStealthPage` (shared, benefits all Playwright calls)
2. **Fast candidate collection** — replaces the current `<a href>` scan in `followBookingLinks`
3. **Click-and-observe fallback** — new function, called only when fast scan finds nothing

---

## 1. Cookie Consent Bypass

**Location:** `playwright-browser.service.ts` — runs inside `withStealthPage` after `networkidle`.

### Pre-seed (before navigation)
Inject known CMP acceptance signals into browser storage before the page loads:

| CMP | Cookie/Storage key | Value |
|-----|--------------------|-------|
| OneTrust | `OptanonAlertBoxClosed` | current ISO date |
| OneTrust | `OptanonConsent` | `isGpcEnabled=0&datestamp=...&version=...&isIABGlobal=false&consentId=...&interactionCount=1&landingPath=NotLandingPage&groups=C0001:1,C0002:1,C0003:1,C0004:1` |
| Cookiebot | `CookieConsent` | `{stamp:'-1',necessary:true,preferences:true,statistics:true,marketing:true,ver:1}` |
| Axeptio | `axeptio_cookies` | `{$$completed:true,$$token:''}` |
| Quantcast | `euconsent-v2` | any non-empty string |
| TrustArc | `notice_behavior` | `implied,eu` |
| Generic | `cookie_consent` | `true` |
| Generic | `cookieconsent_status` | `dismiss` |
| Generic | `gdpr` | `1` |

### Post-load dismiss
After `networkidle`, attempt to click a consent button using:

1. **Known CMP selectors** (specific, reliable):
   - OneTrust: `#onetrust-accept-btn-handler`
   - Cookiebot: `#CybotCookiebotDialogBodyButtonAccept`
   - Axeptio: `.axeptio_btn--accept`
   - Quantcast: `.qc-cmp2-summary-buttons button:last-child`
   - TrustArc: `#truste-consent-button`
   - Didomi: `#didomi-notice-agree-button`
   - iubenda: `.iubenda-cs-accept-btn`
   - Osano: `.osano-cm-accept-all`

2. **Multilingual accept button text** (fallback regex):
   Accept / Accepter / Aceptar / Accetta / Akzeptieren / Aceitar / Accepteren / Принять / قبول / 接受 / 同意 / Alle akzeptieren / Tout accepter / Accetta tutto / Aceptar todo / OK / Got it / I agree / J'accepte / Ich stimme zu / Zgadzam się / Souhlasím / Αποδοχή / אישור / Elfogadom / Accept all / Allow all / Allow cookies

3. Wait 800ms after clicking before proceeding.

---

## 2. Fast Candidate Collection

**New function:** `collectBookingCandidates(page, currentUrl): Promise<string[]>`

Runs entirely in `page.evaluate` — no navigation, no clicking. Returns deduplicated list of candidate URLs.

### Booking text regex (multilingual)

```
/book(?:ing|now)?|r[eé]serv(?:e|er|ation|ations|ar|are|ieren)?|check.?avail|rooms?.?rates?|availab(?:il)?it|prenot(?:a|are|azione)?|buchen?|beschikbaar|reserveren|tarif|disponib(?:il)?it|бронир|забронир|预订|预定|訂房|予約|예약|จอง|rezerv(?:asyon|ation)?|foglal|rezerv(?:ace|ovat)?/iu
```

### URL pattern regex (href-based, no text needed)
```
/\/book(?:ing)?|\/reserv(?:e|ation)?|\/check.?avail|\/rates?(?:\/|$)|\/rooms?(?:\/|$)|\/availability|\/tarif|\/prenot|\/buchen|booking-engine|reservation-system/i
```

### Sources scanned

| Source | How |
|--------|-----|
| `<a href>` | Text matches booking-text-re OR href matches URL-pattern-re |
| `<button>` / `[role="button"]` | Text matches booking-text-re → extract `data-href`, `data-url`, `data-link`, `onclick` URL |
| `<iframe src>` | src is external domain → add directly |
| `<form action>` | action matches URL-pattern-re |
| `<meta>` / JSON-LD | `og:url`, schema.org `ReserveAction` / `BookAction` target |

Skip hidden elements (`offsetParent === null`). Deduplicate by URL. Return up to 12 candidates.

### Tier 1 check
Each candidate URL is immediately checked against the known-IBE registry. First match wins — return without navigating.

---

## 3. Click-and-Observe Fallback

**New function:** `clickAndObserve(page): Promise<string | null>`

Called only when `collectBookingCandidates` returned no candidates (or all candidates were non-matching after Tier 1 checks).

### Steps

1. **Find best target** — visible booking-intent element, scored by:
   - Position: above the fold scores higher
   - Location: inside `<nav>` or `<header>` scores higher
   - Element type: `<a>` > `<button>` > `[role="button"]`
   - Text confidence: exact match on "Book" / "Reserve" scores higher than partial

2. **Set up observers** before clicking:
   - `page.waitForNavigation` (new URL)
   - `context.waitForEvent('page')` (popup window)
   - `page.waitForSelector('iframe[src*="http"]')` (new iframe)

3. **Click** the element

4. **Race** the observers with a 4s timeout. First result wins:
   - Navigation → return `page.url()` after settling
   - Popup → return popup URL
   - New iframe → return iframe src
   - Timeout → return null

5. Scan the returned URL via Tier 1 + resource fingerprints.

---

## Updated `followBookingLinks` Orchestration

```
for each hop (max 5):
  1. tryTier1(currentUrl)                    — URL registry check
  2. scanPageResources(page, currentUrl)     — script/link fingerprints (existing)
  3. candidates = collectBookingCandidates() — fast multi-source scan (NEW)
     → tier1 check each candidate
     → if none matched, store first as firstBookingUrl fallback
     → navigate to first candidate, continue hop loop

after loop:
  4. clickAndObserve(page)                   — click fallback (NEW)
     → tier1 + resource scan on result

final fallback:
  5. return { ibeName: 'Unknown IBE', ibeUrl: firstBookingUrl } if found
```

---

## Files Changed

| File | Change |
|------|--------|
| `playwright-browser.service.ts` | Add `dismissCookieConsent(page)` helper; call it inside `withStealthPage` after networkidle |
| `ibe-resolver.service.ts` | Replace `<a href>` scan with `collectBookingCandidates`; add `clickAndObserve`; expand `BOOKING_TEXT_RE` and add `BOOKING_URL_RE` |

No schema changes. No new dependencies.

---

## Testing

- Unit: mock `page.evaluate` for `collectBookingCandidates` with fixture HTML covering each source type (anchor, button, iframe, form, meta)
- Integration: existing `ibe-resolver` tests cover the hop loop; add a test fixture for a page with only a `<button>` booking element (no `<a href>`)
- Manual: re-test `hotel-moliere.com` — "Réserver" button should now be found in fast scan
