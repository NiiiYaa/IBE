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

const BOOKING_TEXT_RE = /book(?:ing|now)?|r[eé]serv(?:e|er|ation|ations|ar|are|ieren)?|check.?avail|rooms?.?rates?|availab(?:il)?it|prenot(?:a|are|azione)?|buchen?|beschikbaar|reserveren|tarif(?:fs?|aux)?|disponib(?:il)?it|бронир|забронир|预订|预定|訂房|予約|예약|จอง|rezerv(?:asyon|ation)?|foglal(?:ás|jon)?|rezerv(?:ace|ovat)?|kr[aá]tit|κράτηση|הזמנה|rezerv(?:are|ați)?|boka|bestill/iu

// URL path patterns — detect booking links regardless of button text (e.g. icon buttons)
const BOOKING_URL_RE = /\/book(?:ing|-now|-online)?(?:\/|$|\?)|\/reserv(?:e|ation|ations?|ar)?(?:\/|$|\?)|\/check.?avail|\/rates?(?:\/|$|\?)|\/rooms?(?:\/|$|\?)|\/availability(?:\/|$|\?)|\/tarif(?:fs?|aux)?(?:\/|$|\?)|\/prenot|\/buchen|booking-engine|reservation-engine|\/accommodation(?:\/|$|\?)/i
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
    let firstBookingIbeName: string | null = null;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      // Check current URL against registry
      const urlMatch = tryTier1(currentUrl);
      if (urlMatch) return urlMatch;

      // Scan page resources (scripts, links, inline scripts) for IBE vendor fingerprints
      const resourceMatch = await scanPageResources(page, currentUrl);
      if (resourceMatch) return resourceMatch;

      // Collect booking-intent <a href> candidates (browser resolves relative → absolute)
      const hrefs: string[] = await page.evaluate((reSource: string) => {
        const re = new RegExp(reSource, 'iu');
        const found: string[] = [];
        document.querySelectorAll('a[href]').forEach(el => {
          const anchor = el as HTMLAnchorElement;
          const text = anchor.innerText?.trim() || anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '';
          const href = anchor.href; // browser resolves relative URLs automatically
          if (re.test(text) && href?.startsWith('http')) found.push(href);
        });
        return found.slice(0, 8);
      }, BOOKING_TEXT_RE.source).catch(() => [] as string[]);

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
        if (!firstBookingIbeName) firstBookingUrl = currentUrl;
      } catch {
        break;
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
