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
  'hoteldirect.co.uk', 'hoteldirect.com', 'bedandbreakfast', 'bnb.com',
  'barcelonahotels.', 'mybarcelona.', 'spain-holiday.com',
];

// Known hotel chain registry — matched against hotel name (case-insensitive)
const CHAIN_REGISTRY: Array<{ keywords: string[]; domain: string }> = [
  { keywords: ['h10'], domain: 'h10hotels.com' },
  { keywords: ['nh hotel', 'nh-hotel', ' nh '], domain: 'nh-hotels.com' },
  { keywords: ['marriott', 'westin', 'sheraton', 'autograph', 'renaissance', 'le méridien', 'w hotel', 'st. regis'], domain: 'marriott.com' },
  { keywords: ['hilton', 'doubletree', 'hampton inn', 'curio', 'waldorf'], domain: 'hilton.com' },
  { keywords: ['hyatt', 'park hyatt', 'grand hyatt', 'andaz', 'alila'], domain: 'hyatt.com' },
  { keywords: ['accor', 'ibis', 'sofitel', 'novotel', 'mercure', 'pullman', 'mgallery'], domain: 'accor.com' },
  { keywords: ['melia', 'sol melia', 'me by melia', 'paradisus', 'innside'], domain: 'melia.com' },
  { keywords: ['barcelo', 'barceló'], domain: 'barcelo.com' },
  { keywords: ['riu'], domain: 'riu.com' },
  { keywords: ['pestana'], domain: 'pestana.com' },
  { keywords: ['wyndham', 'ramada', 'days inn', 'super 8', 'la quinta'], domain: 'wyndhamhotels.com' },
  { keywords: ['ihg', 'intercontinental', 'holiday inn', 'crowne plaza', 'kimpton', 'indigo'], domain: 'ihg.com' },
  { keywords: ['best western'], domain: 'bestwestern.com' },
  { keywords: ['radisson', 'park inn'], domain: 'radissonhotels.com' },
  { keywords: ['mgm', 'bellagio', 'aria', 'vdara', 'venetian', 'palazzo'], domain: 'mgmresorts.com' },
  { keywords: ['four seasons'], domain: 'fourseasons.com' },
  { keywords: ['ritz-carlton', 'ritz carlton'], domain: 'ritzcarlton.com' },
  { keywords: ['kempinski'], domain: 'kempinski.com' },
  { keywords: ['fairmont'], domain: 'fairmont.com' },
  { keywords: ['mandarin oriental'], domain: 'mandarinoriental.com' },
  { keywords: ['loews'], domain: 'loewshotels.com' },
];

function detectChain(hotelName: string): string | null {
  const lower = hotelName.toLowerCase();
  for (const chain of CHAIN_REGISTRY) {
    if (chain.keywords.some(k => lower.includes(k))) {
      return `https://www.${chain.domain}`;
    }
  }
  return null;
}

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
  const results: HotelCandidate[] = [];

  // Step 1: Chain registry — instant result for known chains
  const chainUrl = detectChain(hotelName);
  if (chainUrl) {
    const detection = detectKnownIBE(chainUrl);
    const score = scoreCandidate(chainUrl, hotelName, hotelName, detection !== null);
    const screenshotUrl = await takeScreenshot(chainUrl);
    results.push({ url: chainUrl, title: `${hotelName} — Official Website`, detected: detection !== null, screenshotUrl, score: Math.max(score, 65) });
  }

  // Step 2: Brave Search (JS-rendered, better quality than DuckDuckGo HTML)
  const otaExcludes = '-booking.com -tripadvisor -expedia -agoda -hotels.com -kayak';
  const q = encodeURIComponent(`"${hotelName}" ${city} official website ${otaExcludes}`);
  const braveUrl = `https://search.brave.com/search?q=${q}&source=web`;

  let rawResults: Array<{ url: string; title: string }> = [];
  try {
    rawResults = await withStealthPage(braveUrl, async (page) => {
      try { await page.waitForSelector('a[href^="http"]', { timeout: 8000 }); } catch {}
      await page.waitForTimeout(2000);
      return page.evaluate((): Array<{ url: string; title: string }> => {
        const seenDomains = new Set<string>();
        const links: Array<{ url: string; title: string }> = [];
        for (const a of Array.from(document.querySelectorAll('a[href^="http"]'))) {
          const el = a as HTMLAnchorElement;
          try {
            const u = new URL(el.href);
            if (u.hostname.includes('brave.com')) continue;
            if (seenDomains.has(u.hostname)) continue;
            seenDomains.add(u.hostname);
            links.push({ url: el.href, title: el.textContent?.trim() ?? '' });
            if (links.length >= 12) break;
          } catch {}
        }
        return links;
      });
    }, { navigationTimeout: 20000, idleTimeout: 10000 });
  } catch {
    return results;
  }

  // Brave returns real URLs already — no DDG redirect decoding needed
  const decoded = rawResults;
  // Deduplicate against chain result
  const seen = new Set(results.map(r => r.url));
  const candidates = decoded
    .filter(r => r.url && !isOta(r.url) && !seen.has(r.url))
    .slice(0, 8);

  const scored = await Promise.all(candidates.map(async (c) => {
    const detection = detectKnownIBE(c.url);
    const detected = detection !== null;
    const score = scoreCandidate(c.url, c.title, hotelName, detected);
    const screenshotUrl = await takeScreenshot(c.url);
    return { url: c.url, title: c.title, detected, screenshotUrl, score };
  }));

  // Merge chain result (first) + DuckDuckGo results, sort by score
  const all = [...results, ...scored].sort((a, b) => {
    if (a.detected !== b.detected) return a.detected ? -1 : 1;
    return b.score - a.score;
  });

  return all.slice(0, 6);
}
