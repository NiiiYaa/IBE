import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { withStealthPage } from './playwright-browser.service.js';
import { detectKnownIBE } from '@ibe/shared';

const OTA_BLOCKLIST = [
  // Major OTAs
  'booking.com', 'expedia.com', 'hotels.com', 'tripadvisor.com', 'agoda.com',
  'airbnb.com', 'kayak.com', 'trivago.com', 'orbitz.com', 'priceline.com',
  'hotelscombined.com', 'travelocity.com', 'getaroom.com', 'wotif.com',
  // Search engines & aggregators
  'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com',
  // Travel agencies & resellers
  'lastminute.com', 'momondo.com', 'skyscanner.com', 'hrs.com',
  'onthebeach.co.uk', 'laterooms.com', 'edreams.com', 'destinia.com',
  'rumbo.com', 'logitravel.com', 'atrápalo.com', 'liligo.com',
  // Hotel directories & portals
  'hotel-ds.com', 'hotel.de', 'hotelebarcelona.net', 'barcelonahotel.org',
  'hotel-bb.com', 'hotelworld.com', 'hostelworld.com', 'hotel-info.com',
  'venere.com', 'hotelbeds.com', 'hrs.de', 'hotel.com',
];

export const SCREENSHOTS_DIR = path.join(process.cwd(), 'uploads', 'screenshots');

export interface HotelCandidate {
  url: string;
  title: string;
  detected: boolean;
  screenshotUrl: string | null;
  score: number; // 0-100 confidence this is the hotel's own website/IBE
}

function decodeDdgUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('duckduckgo.com')) {
      const uddg = u.searchParams.get('uddg');
      if (uddg) return uddg;
    }
    return url;
  } catch { return url; }
}

const DIRECTORY_PATTERNS = [
  'hotel-ds.com', 'barcelonahotel.org', 'hotelebarcelona.net', 'hotel-bb.com',
  'hotel.de', 'hotelworld.com', 'hostelworld.com', 'hotel-info.com', 'venere.com',
  'destinia.com', 'rumbo.com', 'logitravel.com',
];

function scoreCandidate(url: string, title: string, hotelName: string, detected: boolean): number {
  if (detected) return 92;
  try {
    const u = new URL(url);
    const domain = u.hostname.toLowerCase().replace(/^www\./, '');
    const pathLower = u.pathname.toLowerCase();
    const words = hotelName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    // Penalise known directory/reseller domains
    if (DIRECTORY_PATTERNS.some(d => domain.includes(d))) return 10;
    let score = 20;
    // Words from hotel name in domain
    const matchCount = words.filter(w => domain.includes(w)).length;
    if (matchCount >= 2) score += 40;
    else if (matchCount === 1) score += 25;
    // Words in title
    const titleMatchCount = words.filter(w => title.toLowerCase().includes(w)).length;
    if (titleMatchCount >= 2) score += 10;
    // Booking-related path → direct booking engine
    if (/book|reserv|book-now|direct/i.test(pathLower)) score += 10;
    // Looks like a hotel chain or brand site (short domain, e.g. h10hotels.com)
    if (domain.split('.').length === 2) score += 5;
    return Math.min(score, 89); // cap below IBE-detected
  } catch { return 20; }
}

function isOta(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return OTA_BLOCKLIST.some(ota => hostname.includes(ota));
  } catch { return false; }
}

export async function ensureScreenshotsDir(): Promise<void> {
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
}

export async function takeScreenshot(url: string): Promise<string | null> {
  try {
    await ensureScreenshotsDir();
    const ts = Date.now();
    const filename = `${ts}_${randomUUID()}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);

    await withStealthPage(url, async (page) => {
      await page.waitForTimeout(1500);
      // Try to dismiss cookie consent
      for (const btnText of ['Accept all', 'Accept', 'Agree', 'Continue', 'OK']) {
        const btn = await page.$(`button:has-text("${btnText}")`).catch(() => null);
        if (btn) { await btn.click().catch(() => {}); await page.waitForTimeout(500); break; }
      }
      const buffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1280, height: 800 } });
      await fs.writeFile(filepath, buffer);
    }, { navigationTimeout: 15000, idleTimeout: 8000 });

    return `/screenshots/${filename}`;
  } catch {
    return null;
  }
}

export async function cleanExpiredScreenshots(): Promise<void> {
  const TTL_MS = 60 * 60 * 1000; // 1 hour
  try {
    await ensureScreenshotsDir();
    const files = await fs.readdir(SCREENSHOTS_DIR);
    for (const file of files) {
      const ts = parseInt(file.split('_')[0] ?? '0');
      if (Date.now() - ts > TTL_MS) {
        await fs.unlink(path.join(SCREENSHOTS_DIR, file)).catch(() => {});
      }
    }
  } catch { /* non-critical */ }
}

export async function searchHotels(hotelName: string, city: string, country: string): Promise<HotelCandidate[]> {
  // Two searches: one for direct booking engine, one for official website
  const q1 = encodeURIComponent(`"${hotelName}" book direct official website`);
  const q2 = encodeURIComponent(`"${hotelName}" ${city} booking engine`);
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${q1}`;

  let rawResults: Array<{ url: string; title: string }> = [];
  try {
    rawResults = await withStealthPage(ddgUrl, async (page) => {
      await page.waitForTimeout(2000);
      return page.evaluate((): Array<{ url: string; title: string }> => {
        return Array.from(document.querySelectorAll('.result__a')).slice(0, 10).map(a => ({
          url: (a as HTMLAnchorElement).href,
          title: (a as HTMLAnchorElement).textContent?.trim() ?? '',
        }));
      });
    }, { navigationTimeout: 20000 });
  } catch {
    return [];
  }

  const decoded = rawResults.map(r => ({ ...r, url: decodeDdgUrl(r.url) }));
  const candidates = decoded.filter(r => r.url && !isOta(r.url)).slice(0, 8);

  const scored = await Promise.all(candidates.map(async (c) => {
    const detection = detectKnownIBE(c.url);
    const detected = detection !== null;
    const score = scoreCandidate(c.url, c.title, hotelName, detected);
    const screenshotUrl = await takeScreenshot(c.url);
    return { url: c.url, title: c.title, detected, screenshotUrl, score };
  }));

  // Sort: detected IBEs first, then by score descending
  return scored.sort((a, b) => {
    if (a.detected !== b.detected) return a.detected ? -1 : 1;
    return b.score - a.score;
  }).slice(0, 6);
}
