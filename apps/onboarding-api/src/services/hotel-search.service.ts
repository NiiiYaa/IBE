import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { withStealthPage } from './playwright-browser.service.js';
import { detectKnownIBE } from '@ibe/shared';

const OTA_BLOCKLIST = [
  'booking.com', 'expedia.com', 'hotels.com', 'tripadvisor.com', 'agoda.com',
  'airbnb.com', 'kayak.com', 'trivago.com', 'orbitz.com', 'priceline.com',
  'hotelscombined.com', 'google.com', 'hotel-ds.com', 'hotel.de',
  'lastminute.com', 'momondo.com', 'skyscanner.com', 'hotelbeds.com',
  'hrs.com', 'hotel-bb.com', 'hotelworld.com', 'hostelworld.com',
  'travelocity.com', 'getaroom.com', 'hotelebarcelona.net',
];

export const SCREENSHOTS_DIR = path.join(process.cwd(), 'uploads', 'screenshots');

export interface HotelCandidate {
  url: string;
  title: string;
  detected: boolean;
  screenshotUrl: string | null;
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
  const query = encodeURIComponent(`"${hotelName}" ${city} book`);
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${query}`;

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
  const candidates = decoded.filter(r => r.url && !isOta(r.url)).slice(0, 5);

  return Promise.all(candidates.map(async (c) => {
    const detection = detectKnownIBE(c.url);
    const screenshotUrl = await takeScreenshot(c.url);
    return { url: c.url, title: c.title, detected: detection !== null, screenshotUrl };
  }));
}
