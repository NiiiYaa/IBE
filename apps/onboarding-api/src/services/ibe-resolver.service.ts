import { detectKnownIBE } from '@ibe/shared';
import type { Page } from 'playwright';
import { withStealthPage } from './playwright-browser.service.js';

export interface ResolvedIBE {
  ibeName: string;
  ibeUrl: string;
  hotelId: string | null;
}

export async function resolveIbeUrl(url: string): Promise<ResolvedIBE | null> {
  // Tier 1: fast URL-pattern check — no browser needed
  const t1 = tryTier1(url);
  if (t1) return t1;

  // Tier 2: open the page and look for booking links / embedded IBE scripts
  return followBookingLinks(url);
}

function tryTier1(url: string): ResolvedIBE | null {
  // Check known IBE registry first (includes hotelId extraction)
  const d = detectKnownIBE(url);
  if (d) return { ibeName: d.name, ibeUrl: url, hotelId: d.externalHotelId };
  // Also check vendor fingerprint patterns against the URL itself —
  // catches known IBE domains when the URL is passed directly (e.g. secure-hotel-booking.com)
  for (const fp of RESOURCE_FINGERPRINTS) {
    if (fp.pattern.test(url)) return { ibeName: fp.ibeName, ibeUrl: url, hotelId: null };
  }
  return null;
}

const BOOKING_TEXT_RE = /book(?:ing(?:s|now)?|now)?|r[eé]serv(?:e|er|ations?|ar|are|ieren)?|check.?avail|rooms?.?rates?|availab(?:il)?it|prenot(?:a|are|azione)?|buchen?|beschikbaar|reserveren|tarif(?:fs?|aux)?|disponib(?:il)?it|бронир|забронир|预订|预定|訂房|予約|예약|จอง|rezerv(?:asyon|ations?)?|foglal(?:ás|jon)?|rezerv(?:ace|ovat)?|kr[aá]tit|κράτηση|הזמנה|rezerv(?:are|ați)?|boka|bestill|pric(?:e|es|ing)\s+rooms?|best\s+rates?|offers?|deals?|vacanc(?:y|ies)|book\s+suites?|accommodation/iu

// URL path patterns — detect booking links regardless of button text (e.g. icon buttons)
const BOOKING_URL_RE = /\/book(?:ing|-now|-online)?(?:\/|$|\?)|\/reserv(?:e|ation|ations?|ar)?(?:\/|$|\?)|\/check.?avail|\/rates?(?:\/|$|\?)|\/rooms?(?:\/|$|\?)|\/availability(?:\/|$|\?)|\/tarif(?:fs?|aux)?(?:\/|$|\?)|\/prenot|\/buchen|booking-engine|reservation-engine|\/accommodation(?:\/|$|\?)|\/offers?(?:\/|$|\?)|\/deals?(?:\/|$|\?)|\/suites?(?:\/|$|\?)|\/stay(?:\/|$|\?)|secure-hotel-booking\.com|be\.synxis\.com|booking\.d-edge\.com/i
const MAX_HOPS = 5;

// Vendor fingerprints detected from page <script>/<link> resource URLs.
// Each entry: { pattern: regex on the resource src/href, ibeName }
// These catch IBEs that are embedded on the hotel's own domain (not externally hosted).
const RESOURCE_FINGERPRINTS: Array<{ pattern: RegExp; ibeName: string }> = [
  { pattern: /clock-software\.com/i,                                  ibeName: 'Clock PMS' },
  { pattern: /dlkhost\.com|\/ctws\.js|\/book\/js\/ctws/i,           ibeName: 'CTWS (DLK Host)' },
  { pattern: /avvio\.com/i,                                           ibeName: 'Avvio' },
  { pattern: /motor\.mirai\.com|secure\.mirai\.com/i,                ibeName: 'Mirai' },
  { pattern: /booking\.profitroom\.com|profitroom\.com/i,            ibeName: 'Profitroom' },
  { pattern: /availpro\.com|booking\.d-edge\.com|secure-hotel-booking\.com\/d-edge/i, ibeName: 'D-Edge / Availpro' },
  { pattern: /booking\.omnibees\.com/i,                              ibeName: 'Omnibees' },
  { pattern: /reservit\.com/i,                                        ibeName: 'Reservit' },
  { pattern: /amenitiz\.io|engine\.amenitiz\.io/i,                   ibeName: 'Amenitiz' },
  { pattern: /lodgify\.com/i,                                         ibeName: 'Lodgify' },
  { pattern: /cloudbeds\.com|hotels\.cloudbeds\.com/i,               ibeName: 'Cloudbeds' },
  { pattern: /beds24\.com/i,                                          ibeName: 'Beds24' },
  { pattern: /eviivo\.com/i,                                          ibeName: 'Eviivo' },
  { pattern: /roomraccoon\.com/i,                                     ibeName: 'RoomRaccoon' },
  { pattern: /mews\.com|app\.mews\.com/i,                            ibeName: 'Mews' },
]

async function collectBookingCandidates(page: Page, currentUrl: string): Promise<string[]> {
  return page.evaluate(
    (args: { textSrc: string; urlSrc: string; currentOrigin: string }) => {
      const textRe = new RegExp(args.textSrc, 'iu')
      const urlRe = new RegExp(args.urlSrc, 'i')
      const seen = new Set<string>()
      const candidates: string[] = []

      function add(url: string) {
        if (!url || !url.startsWith('http')) return
        const clean = url.split('#')[0] ?? url
        if (!seen.has(clean)) { seen.add(clean); candidates.push(clean) }
      }

      function isVisible(el: Element) {
        const r = (el as HTMLElement).getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }

      function extractText(el: Element) {
        return (
          (el as HTMLElement).innerText?.trim() ||
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.getAttribute('alt') ||
          ''
        )
      }

      // 1. <a href> — URL-pattern matches (known IBE domains) always included regardless of visibility;
      //    text-based matches require visibility (avoids picking up hidden nav duplicates)
      for (const el of Array.from(document.querySelectorAll('a[href]'))) {
        const a = el as HTMLAnchorElement
        const href = a.href
        if (!href?.startsWith('http')) continue
        if (urlRe.test(href)) { add(href); continue } // known IBE domain — always include
        if (!isVisible(el)) continue
        const text = extractText(el)
        if (textRe.test(text)) add(href)
      }

      // 2. <button> / [role="button"] — extract URL from data-* or onclick
      for (const el of Array.from(document.querySelectorAll('button, [role="button"]'))) {
        if (!isVisible(el)) continue
        const text = extractText(el)
        if (!textRe.test(text)) continue
        for (const attr of ['data-href', 'data-url', 'data-link', 'data-target', 'data-book-url']) {
          const val = el.getAttribute(attr)
          if (val?.startsWith('http')) { add(val); break }
        }
        const onclick = el.getAttribute('onclick') ?? ''
        const m = onclick.match(/https?:\/\/[^\s'"]+/)
        if (m) add(m[0]!)
      }

      // 3. <iframe src> on a different origin — likely embedded booking widget.
      // Skip known non-booking embeds (maps, social, analytics, video, consent).
      const NON_BOOKING_IFRAME = /google\.(com|co\.|maps)|youtube\.com|facebook\.com|twitter\.com|instagram\.com|linkedin\.com|vimeo\.com|googletagmanager\.com|analytics\.|hotjar\.|cookiebot\.|onetrust\.|maps\.googleapis/i
      for (const el of Array.from(document.querySelectorAll('iframe[src]'))) {
        const src = (el as HTMLIFrameElement).src
        if (src?.startsWith('http') && !src.startsWith(args.currentOrigin) && !NON_BOOKING_IFRAME.test(src)) add(src)
      }

      // 4. <form action> matching booking URL pattern
      for (const el of Array.from(document.querySelectorAll('form[action]'))) {
        const action = (el as HTMLFormElement).action
        if (action?.startsWith('http') && urlRe.test(action)) add(action)
      }

      // 5. JSON-LD schema — ReserveAction / BookAction target
      for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          const data = JSON.parse(script.textContent ?? '{}')
          const check = (obj: unknown) => {
            if (!obj || typeof obj !== 'object') return
            const o = obj as Record<string, unknown>
            for (const key of ['url', 'target', 'urlTemplate']) {
              const v = o[key]
              if (typeof v === 'string' && v.startsWith('http')) add(v)
            }
            for (const v of Object.values(o)) if (v && typeof v === 'object') check(v)
          }
          check(data)
        } catch {}
      }

      return candidates.slice(0, 12)
    },
    { textSrc: BOOKING_TEXT_RE.source, urlSrc: BOOKING_URL_RE.source, currentOrigin: (() => { try { return new URL(currentUrl).origin } catch { return '' } })() },
  ).catch(() => [] as string[])
}

// Attribute patterns that identify check-in / check-out date fields
const CHECKIN_ATTRS  = ['checkin', 'check_in', 'check-in', 'arrival', 'datefrom', 'date_from', 'startdate', 'start_date', 'from', 'date1', 'in']
const CHECKOUT_ATTRS = ['checkout', 'check_out', 'check-out', 'departure', 'dateto', 'date_to', 'enddate', 'end_date', 'to', 'date2', 'out']

async function submitSearchWidget(page: Page): Promise<string | null> {
  try {
    // Tomorrow and day-after as ISO date strings (YYYY-MM-DD)
    const d1 = new Date(); d1.setDate(d1.getDate() + 1)
    const d2 = new Date(); d2.setDate(d2.getDate() + 3)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const checkIn = fmt(d1), checkOut = fmt(d2)

    // Inject dates into all recognisable date inputs, return true if any were found
    const found = await page.evaluate(
      (args: { checkinAttrs: string[]; checkoutAttrs: string[]; checkIn: string; checkOut: string }) => {
        function matchesAttr(el: Element, patterns: string[]) {
          const haystack = [
            el.getAttribute('name'), el.getAttribute('id'),
            el.getAttribute('placeholder'), el.getAttribute('class'),
            el.getAttribute('data-field'), el.getAttribute('data-type'),
          ].join(' ').toLowerCase()
          return patterns.some(p => haystack.includes(p))
        }

        let filled = 0
        for (const input of Array.from(document.querySelectorAll('input'))) {
          const isDate = input.type === 'date' || input.type === 'text' || input.type === 'hidden' || input.type === ''
          if (!isDate) continue
          if (matchesAttr(input, args.checkinAttrs)) {
            // Try native value setter (works for React/Vue controlled inputs)
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
            nativeSetter?.call(input, args.checkIn)
            input.value = args.checkIn
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
            filled++
          } else if (matchesAttr(input, args.checkoutAttrs)) {
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
            nativeSetter?.call(input, args.checkOut)
            input.value = args.checkOut
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
            filled++
          }
        }
        return filled >= 2
      },
      { checkinAttrs: CHECKIN_ATTRS, checkoutAttrs: CHECKOUT_ATTRS, checkIn: checkIn, checkOut: checkOut },
    ).catch(() => false)

    if (!found) return null

    // Short pause so JS frameworks react to the change events
    await page.waitForTimeout(600)

    // Find and click the search/submit button inside or near a booking form
    const submitted = await page.evaluate((reSource: string) => {
      const re = new RegExp(reSource, 'iu')
      // Prefer [type="submit"] first, then buttons with booking text
      const candidates: HTMLElement[] = []
      for (const el of Array.from(document.querySelectorAll('[type="submit"], button, [role="button"]'))) {
        const h = el as HTMLElement
        if (h.offsetParent === null) continue
        const text = h.innerText?.trim() || h.getAttribute('aria-label') || h.getAttribute('value') || ''
        if (el.getAttribute('type') === 'submit' || re.test(text)) candidates.push(h)
      }
      if (candidates.length === 0) return false
      candidates[0]!.click()
      return true
    }, BOOKING_TEXT_RE.source).catch(() => false)

    if (!submitted) return null

    // Observe navigation result — filter same-origin navigations, wait for first non-null
    const submitOrigin = (() => { try { return new URL(page.url()).origin } catch { return '' } })()
    const submitNavPromise = page.waitForNavigation({ timeout: 8000 })
      .then(() => { const u = page.url(); try { if (new URL(u).origin === submitOrigin) return null } catch {}; return u })
      .catch(() => null)
    const submitPopupPromise = page.context().waitForEvent('page', { timeout: 8000 })
      .then(async (p) => {
        await (p as any).waitForLoadState?.('domcontentloaded', { timeout: 6000 }).catch(() => {})
        const u = (p as { url(): string }).url()
        return u === 'about:blank' ? null : u
      }).catch(() => null)

    const result = await new Promise<string | null>((resolve) => {
      let settled = 0
      const check = (val: string | null) => { if (val) { resolve(val); return }; if (++settled >= 2) resolve(null) }
      submitNavPromise.then(check)
      submitPopupPromise.then(check)
      setTimeout(() => resolve(null), 9000)
    })
    if (result && result !== 'about:blank') return result

    // Check for new iframe after submission (some widgets load the IBE in an iframe)
    return page.evaluate(() => {
      for (const f of Array.from(document.querySelectorAll('iframe[src]'))) {
        const src = (f as HTMLIFrameElement).src
        if (src?.startsWith('http')) return src
      }
      return null
    }).catch(() => null)
  } catch {
    return null
  }
}

async function clickAndObserve(page: Page): Promise<string | null> {
  try {
    // Find the best booking-intent element and return a unique CSS selector for it.
    // We separate find from click so we can set up Playwright listeners before clicking.
    const selector = await page.evaluate((reSource: string) => {
      const re = new RegExp(reSource, 'iu')
      interface Candidate { el: HTMLElement; score: number }
      const candidates: Candidate[] = []

      for (const el of Array.from(document.querySelectorAll('a[href], button, [role="button"]'))) {
        const h = el as HTMLElement
        const rect = h.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue // hidden
        const text = h.innerText?.trim() || h.getAttribute('aria-label') || h.getAttribute('title') || ''
        if (!re.test(text)) continue
        let score = 0
        if (rect.top < window.innerHeight) score += 20
        if (el.closest('header, nav, [role="navigation"]')) score += 30
        score += Math.min(rect.width * rect.height / 1000, 20)
        candidates.push({ el: h, score })
      }

      if (candidates.length === 0) return null
      candidates.sort((a, b) => b.score - a.score)
      const best = candidates[0]!.el

      // Return enough info for Playwright to identify the element uniquely
      const text = best.innerText?.trim().slice(0, 40) || ''
      const href = (best as HTMLAnchorElement).href || ''
      const tag = best.tagName.toLowerCase()
      if (best.id) return JSON.stringify({ type: 'css', selector: `#${CSS.escape(best.id)}` })
      if (href) return JSON.stringify({ type: 'href', href, tag })
      if (text) return JSON.stringify({ type: 'text', text, tag })
      const cls = Array.from(best.classList).slice(0, 2).map(c => `.${CSS.escape(c)}`).join('')
      return JSON.stringify({ type: 'css', selector: `${tag}${cls}` || tag })
    }, BOOKING_TEXT_RE.source).catch(() => null)

    if (!selector) return null

    // If the element has a direct href to a known IBE, return it immediately without clicking
    try {
      const desc = JSON.parse(selector) as { type: string; href?: string }
      if (desc.type === 'href' && desc.href) {
        const t1 = tryTier1(desc.href)
        if (t1) return desc.href
        // Also check if it matches BOOKING_URL_RE — if so, return for Tier1 check by caller
        const urlRe = /secure-hotel-booking\.com|be\.synxis\.com|booking\.d-edge\.com/i
        if (urlRe.test(desc.href)) return desc.href
      }
    } catch {}

    // Parse the element descriptor and build a Playwright-compatible locator string
    let playwrightSelector: string
    try {
      const desc = JSON.parse(selector) as { type: string; selector?: string; href?: string; text?: string; tag?: string }
      if (desc.type === 'css') {
        playwrightSelector = desc.selector!
      } else if (desc.type === 'href') {
        playwrightSelector = `${desc.tag ?? 'a'}[href="${desc.href}"]`
      } else {
        // text-based: use Playwright's text= selector
        playwrightSelector = `${desc.tag ?? 'a'}:has-text("${desc.text!.replace(/"/g, '\\"')}")`
      }
    } catch {
      playwrightSelector = selector
    }
    console.log(`[IBE v2] clickAndObserve playwrightSelector=${playwrightSelector}`)

    const pageOrigin = (() => { try { return new URL(page.url()).origin } catch { return '' } })()

    // Set up listeners BEFORE clicking.
    // Use a custom race that waits for the first non-null, non-same-origin, non-about:blank result.
    // navPromise returns null for same-origin navigations (fragment changes like #home)
    // so the popup (new tab) can still win even if a fragment change fires first.
    const navPromise = page.waitForNavigation({ timeout: 8000 })
      .then(() => {
        const u = page.url()
        try { if (new URL(u).origin === pageOrigin) return null } catch {}
        return u
      }).catch(() => null)
    const popupPromise = page.context().waitForEvent('page', { timeout: 8000 })
      .then(async (p) => {
        await (p as any).waitForLoadState?.('domcontentloaded', { timeout: 6000 }).catch(() => {})
        const u = (p as { url(): string }).url()
        return u === 'about:blank' ? null : u
      }).catch(() => null)

    await page.click(playwrightSelector, { timeout: 3000 }).catch(() => {})

    // Wait for the first non-null result from either promise
    const result = await new Promise<string | null>((resolve) => {
      let settled = 0
      const check = (val: string | null) => {
        if (val) { resolve(val); return }
        if (++settled >= 2) resolve(null)
      }
      navPromise.then(check)
      popupPromise.then(check)
      setTimeout(() => resolve(null), 9000)
    })
    if (result) return result

    // Check if a new iframe appeared after the click
    return page.evaluate(() => {
      for (const f of Array.from(document.querySelectorAll('iframe[src]'))) {
        const src = (f as HTMLIFrameElement).src
        if (src?.startsWith('http')) return src
      }
      return null
    }).catch(() => null)
  } catch {
    return null
  }
}

async function scanPageResources(page: Page, currentPageUrl: string): Promise<ResolvedIBE | null> {
  // Collect all external resource URLs from script/link tags
  const resources: string[] = await page.evaluate(() => {
    const urls: string[] = [];
    document.querySelectorAll('script[src], link[href]').forEach(el => {
      const src = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href || '';
      if (src.startsWith('http')) urls.push(src);
    });
    // Also check inline script content for IBE domain references
    document.querySelectorAll('script:not([src])').forEach(el => {
      const text = el.textContent ?? '';
      const matches = text.match(/https?:\/\/[a-z0-9._-]+\.[a-z]{2,}[^"'\s]*/gi) ?? [];
      urls.push(...matches.slice(0, 20));
    });
    return urls;
  }).catch(() => [] as string[]);

  for (const src of resources) {
    // Check against known-IBE URL registry first
    const t1 = tryTier1(src);
    if (t1) return { ...t1, ibeUrl: currentPageUrl };

    // Check vendor fingerprints
    for (const fp of RESOURCE_FINGERPRINTS) {
      if (fp.pattern.test(src)) {
        return { ibeName: fp.ibeName, ibeUrl: currentPageUrl, hotelId: null };
      }
    }
  }
  return null;
}

async function followBookingLinks(startUrl: string): Promise<ResolvedIBE | null> {
  return withStealthPage(startUrl, async (page) => {
    let currentUrl = startUrl;
    // Track first booking-intent URL found — fallback if no known IBE is detected
    let firstBookingUrl: string | null = null;
    const startOrigin = (() => { try { return new URL(startUrl).origin } catch { return '' } })()

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      // Check current URL against registry
      const urlMatch = tryTier1(currentUrl);
      if (urlMatch) return urlMatch;

      // Scan page resources (scripts, links, inline scripts) for IBE vendor fingerprints
      const resourceMatch = await scanPageResources(page, currentUrl);
      if (resourceMatch) return resourceMatch;

      // Collect booking-intent candidates from all sources
      const hrefs = await collectBookingCandidates(page, currentUrl)
      console.log(`[IBE resolver v2] hop=${hop} url=${currentUrl} candidates=${JSON.stringify(hrefs)}`)

      // Check each href via Tier 1 before navigating
      for (const href of hrefs) {
        const t1 = tryTier1(href);
        if (t1) return { ...t1, ibeUrl: href };
      }

      if (hrefs.length === 0) break;

      // Only follow external URLs (different origin) or same-origin paths that differ from start.
      // Skip pure same-origin anchor-only changes to avoid getting stuck on the hotel homepage.
      const externalHrefs = hrefs.filter(h => {
        try { return new URL(h).origin !== startOrigin } catch { return false }
      })
      const candidateUrl = externalHrefs[0] ?? hrefs.find(h => {
        try {
          const u = new URL(h)
          return u.origin === startOrigin && u.pathname !== new URL(startUrl).pathname
        } catch { return false }
      })

      if (!candidateUrl) break

      // Only track as booking URL if it's on a different domain (external IBE)
      if (!firstBookingUrl) {
        try {
          if (new URL(candidateUrl).origin !== startOrigin) firstBookingUrl = candidateUrl
        } catch {}
      }

      // Navigate to the candidate
      try {
        await page.goto(candidateUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        currentUrl = page.url();
        // Only update firstBookingUrl if we landed on a different domain
        try {
          if (new URL(currentUrl).origin !== startOrigin) firstBookingUrl = currentUrl
        } catch {}
      } catch {
        break;
      }
    }

    // Search-widget fallback — fill date fields and submit the booking search form
    const widgetUrl = await submitSearchWidget(page)
    console.log(`[IBE v2] widgetUrl=${widgetUrl}`)
    if (widgetUrl) {
      const t1 = tryTier1(widgetUrl)
      if (t1) return t1
      const resourceMatch = await scanPageResources(page, widgetUrl)
      if (resourceMatch) return resourceMatch
      try { if (new URL(widgetUrl).origin !== startOrigin) firstBookingUrl = widgetUrl } catch {}
    }

    // Click-and-observe fallback — only reached when all hops found no candidates
    const clickedUrl = await clickAndObserve(page)
    console.log(`[IBE v2] clickedUrl=${clickedUrl} firstBookingUrl=${firstBookingUrl}`)
    const clickedExternal = clickedUrl && (() => { try { return new URL(clickedUrl).origin !== startOrigin } catch { return false } })()
    if (clickedExternal) {
      const t1 = tryTier1(clickedUrl!)
      if (t1) return t1
      const resourceMatch = await scanPageResources(page, clickedUrl!)
      if (resourceMatch) return resourceMatch
      firstBookingUrl = clickedUrl!
    }
    if (!clickedUrl || !clickedExternal) {
      // null: nothing clicked, OR same-origin: click opened a calendar/overlay on the same page
      // clickAndObserve clicked something but navigation didn't happen.
      // Common pattern: "Book Now" opens a date-picker calendar on the same page.
      // Wait for it to appear, then try submitSearchWidget to fill dates and submit.
      await page.waitForTimeout(2000)

      // Try filling the date picker that appeared after clicking the booking button
      const postClickWidgetUrl = await submitSearchWidget(page)
      if (postClickWidgetUrl) {
        const t1 = tryTier1(postClickWidgetUrl)
        if (t1) return t1
        const resourceMatch = await scanPageResources(page, postClickWidgetUrl)
        if (resourceMatch) return resourceMatch
        try { if (new URL(postClickWidgetUrl).origin !== startOrigin) firstBookingUrl = postClickWidgetUrl } catch {}
      }

      // Also scan for new resources or iframes injected by the calendar widget
      const modalResourceMatch = await scanPageResources(page, currentUrl)
      if (modalResourceMatch) return modalResourceMatch
      const modalCandidates = await collectBookingCandidates(page, currentUrl)
      for (const href of modalCandidates) {
        const t1 = tryTier1(href)
        if (t1) return { ...t1, ibeUrl: href }
      }
    }

    // Final checks on the last page
    const finalUrlMatch = tryTier1(currentUrl);
    if (finalUrlMatch) return finalUrlMatch;

    const finalResourceMatch = await scanPageResources(page, currentUrl);
    if (finalResourceMatch) return finalResourceMatch;

    // Fallback: we navigated to a booking page but couldn't identify the IBE vendor.
    // Return the URL with ibeName='Unknown IBE' so the caller knows a booking system
    // was found — it goes into the HG review queue rather than returning nothing.
    if (firstBookingUrl && firstBookingUrl !== startUrl) {
      return { ibeName: 'Unknown IBE', ibeUrl: firstBookingUrl, hotelId: null };
    }

    return null;
  });
}
