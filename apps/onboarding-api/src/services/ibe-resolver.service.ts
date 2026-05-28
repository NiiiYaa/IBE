import { detectKnownIBE } from '@ibe/shared';
import { withStealthPage } from './playwright-browser.service.js';

export interface ResolvedIBE {
  ibeName: string;
  ibeUrl: string;
  hotelId: string | null;
}

export async function resolveIbeUrl(url: string): Promise<ResolvedIBE | null> {
  // Tier 1: shared registry (fast, no browser)
  const t1 = tryTier1(url);
  if (t1) return t1;

  // Tier 3: browser with booking-button follower
  return followBookingButtons(url);
}

function tryTier1(url: string): ResolvedIBE | null {
  const d = detectKnownIBE(url);
  if (!d) return null;
  return { ibeName: d.name, ibeUrl: url, hotelId: d.externalHotelId };
}

const BOOKING_RE = /book|reserv|check.?avail|rooms?.?rates?|availability/i;
const MAX_HOPS = 5;

async function followBookingButtons(startUrl: string): Promise<ResolvedIBE | null> {
  return withStealthPage(startUrl, async (page) => {
    let currentUrl = startUrl;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      // Check current page URL
      const match = tryTier1(currentUrl);
      if (match) return match;

      // Collect booking-intent <a href> candidates without navigating
      const hrefs: string[] = await page.evaluate((reSource: string) => {
        const re = new RegExp(reSource, 'i');
        const found: string[] = [];
        document.querySelectorAll('a[href]').forEach((el) => {
          const text = (el as HTMLElement).innerText?.trim()
            ?? el.getAttribute('aria-label') ?? '';
          if (re.test(text)) {
            const href = (el as HTMLAnchorElement).href;
            if (href?.startsWith('http')) found.push(href);
          }
        });
        return found.slice(0, 5);
      }, BOOKING_RE.source);

      // Check each href via Tier 1 before navigating
      for (const href of hrefs) {
        const match = tryTier1(href);
        if (match) return { ...match, ibeUrl: href };
      }

      if (hrefs.length === 0) break;

      // Navigate to the first booking-intent href
      try {
        await page.goto(hrefs[0]!, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        currentUrl = page.url();
      } catch {
        break;
      }
    }

    return null;
  });
}
