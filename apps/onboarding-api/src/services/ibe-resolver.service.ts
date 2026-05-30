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
  const d = detectKnownIBE(url);
  if (!d) return null;
  return { ibeName: d.name, ibeUrl: url, hotelId: d.externalHotelId };
}

const BOOKING_TEXT_RE = /book(?:ing(?:s|now)?|now)?|r[eé]serv(?:e|er|ations?|ar|are|ieren)?|check.?avail|rooms?.?rates?|availab(?:il)?it|prenot(?:a|are|azione)?|buchen?|beschikbaar|reserveren|tarif(?:fs?|aux)?|disponib(?:il)?it|бронир|забронир|预订|预定|訂房|予約|예약|จอง|rezerv(?:asyon|ations?)?|foglal(?:ás|jon)?|rezerv(?:ace|ovat)?|kr[aá]tit|κράτηση|הזמנה|rezerv(?:are|ați)?|boka|bestill|pric(?:e|es|ing)|rates?|offers?|deals?|vacanc(?:y|ies)|suites?|stay(?:s|ing)?|accommodation|check.in|check.out|arrival|departure/iu

// URL path patterns — detect booking links regardless of button text (e.g. icon buttons)
const BOOKING_URL_RE = /\/book(?:ing|-now|-online)?(?:\/|$|\?)|\/reserv(?:e|ation|ations?|ar)?(?:\/|$|\?)|\/check.?avail|\/rates?(?:\/|$|\?)|\/rooms?(?:\/|$|\?)|\/availability(?:\/|$|\?)|\/tarif(?:fs?|aux)?(?:\/|$|\?)|\/prenot|\/buchen|booking-engine|reservation-engine|\/accommodation(?:\/|$|\?)|\/offers?(?:\/|$|\?)|\/deals?(?:\/|$|\?)|\/suites?(?:\/|$|\?)|\/stay(?:\/|$|\?)/i
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
  { pattern: /availpro\.com|booking\.d-edge\.com/i,                  ibeName: 'D-Edge / Availpro' },
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
        return (el as HTMLElement).offsetParent !== null
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

      // 1. <a href> — by booking text OR booking URL pattern
      for (const el of Array.from(document.querySelectorAll('a[href]'))) {
        if (!isVisible(el)) continue
        const a = el as HTMLAnchorElement
        const href = a.href
        if (!href?.startsWith('http')) continue
        const text = extractText(el)
        if (textRe.test(text) || urlRe.test(href)) add(href)
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

      // 3. <iframe src> on a different origin — likely embedded booking widget
      for (const el of Array.from(document.querySelectorAll('iframe[src]'))) {
        const src = (el as HTMLIFrameElement).src
        if (src?.startsWith('http') && !src.startsWith(args.currentOrigin)) add(src)
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

    // Observe navigation result
    const navPromise = page.waitForNavigation({ timeout: 5000 }).then(() => page.url()).catch(() => null)
    const popupPromise = page.context().waitForEvent('page', { timeout: 5000 })
      .then((p: { url(): string }) => p.url()).catch(() => null)

    const result = await Promise.race([navPromise, popupPromise])
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
    // Find the best visible booking-intent element, scored by position and type
    const clicked = await page.evaluate((reSource: string) => {
      const re = new RegExp(reSource, 'iu')
      interface Candidate { el: Element; score: number }
      const candidates: Candidate[] = []

      for (const el of Array.from(document.querySelectorAll('a[href], button, [role="button"]'))) {
        const h = el as HTMLElement
        if (h.offsetParent === null) continue // hidden
        const text = h.innerText?.trim() || h.getAttribute('aria-label') || h.getAttribute('title') || ''
        if (!re.test(text)) continue

        const rect = h.getBoundingClientRect()
        let score = 0
        if (rect.top < window.innerHeight) score += 20   // above the fold
        if (el.closest('header, nav, [role="navigation"]')) score += 30  // in nav
        score += Math.min(rect.width * rect.height / 1000, 20)  // size

        candidates.push({ el, score })
      }

      if (candidates.length === 0) return false
      candidates.sort((a, b) => b.score - a.score)
      ;(candidates[0]!.el as HTMLElement).click()
      return true
    }, BOOKING_TEXT_RE.source).catch(() => false)

    if (!clicked) return null

    // Race: navigation vs popup, 4s timeout each
    const navPromise = page.waitForNavigation({ timeout: 4000 }).then(() => page.url()).catch(() => null)
    const popupPromise = page.context().waitForEvent('page', { timeout: 4000 })
      .then((p: { url(): string }) => p.url()).catch(() => null)

    const result = await Promise.race([navPromise, popupPromise])
    if (result && result !== 'about:blank') return result

    // Check if a new iframe appeared
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

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      // Check current URL against registry
      const urlMatch = tryTier1(currentUrl);
      if (urlMatch) return urlMatch;

      // Scan page resources (scripts, links, inline scripts) for IBE vendor fingerprints
      const resourceMatch = await scanPageResources(page, currentUrl);
      if (resourceMatch) return resourceMatch;

      // Collect booking-intent candidates from all sources
      const hrefs = await collectBookingCandidates(page, currentUrl)

      // Check each href via Tier 1 before navigating
      for (const href of hrefs) {
        const t1 = tryTier1(href);
        if (t1) return { ...t1, ibeUrl: href };
      }

      if (hrefs.length === 0) break;

      // Remember the first booking URL we encountered (for unknown-IBE fallback)
      const candidateUrl = hrefs[0]!;
      if (!firstBookingUrl && candidateUrl !== startUrl) {
        firstBookingUrl = candidateUrl;
      }

      // Navigate to the first booking-intent link
      try {
        await page.goto(candidateUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        currentUrl = page.url();
        // Update firstBookingUrl to the resolved URL after navigation
        firstBookingUrl = currentUrl;
      } catch {
        break;
      }
    }

    // Search-widget fallback — fill date fields and submit the booking search form
    const widgetUrl = await submitSearchWidget(page)
    if (widgetUrl) {
      const t1 = tryTier1(widgetUrl)
      if (t1) return t1
      const resourceMatch = await scanPageResources(page, widgetUrl)
      if (resourceMatch) return resourceMatch
      if (widgetUrl !== startUrl) firstBookingUrl = widgetUrl
    }

    // Click-and-observe fallback — only reached when all hops found no candidates
    const clickedUrl = await clickAndObserve(page)
    if (clickedUrl) {
      const t1 = tryTier1(clickedUrl)
      if (t1) return t1
      const resourceMatch = await scanPageResources(page, clickedUrl)
      if (resourceMatch) return resourceMatch
      if (clickedUrl !== startUrl) {
        firstBookingUrl = clickedUrl
      }
    } else {
      // clickAndObserve clicked something but navigation didn't happen — the click may have
      // opened an in-page modal/overlay that injected IBE scripts. Wait and re-scan.
      await page.waitForTimeout(2500)
      const modalResourceMatch = await scanPageResources(page, currentUrl)
      if (modalResourceMatch) return modalResourceMatch
      // Also look for new iframes that appeared after the click
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
