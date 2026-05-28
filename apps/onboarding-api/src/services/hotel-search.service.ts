import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { withStealthPage } from './playwright-browser.service.js';
import { detectKnownIBE } from '@ibe/shared';
import { searchHotelsDataForSEO as _dfsSearch } from './dataforseo.service.js';
import { HotelCandidate, isOta, scoreCandidate } from './hotel-search-utils.js';

export { isOta, scoreCandidate, type HotelCandidate };

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

export async function searchHotelsBrave(hotelName: string, city: string, country: string): Promise<HotelCandidate[]> {
  const chainDomain = detectChain(hotelName); // e.g. "https://www.h10hotels.com"

  // Step 2: Brave Search (JS-rendered, better quality than DuckDuckGo HTML)
  const otaExcludes = '-booking.com -tripadvisor -expedia -agoda -hotels.com -kayak';
  const location = [city, country].filter(Boolean).join(' ');
  const q = encodeURIComponent(`"${hotelName}"${location ? ' ' + location : ''} official website ${otaExcludes}`);
  const braveUrl = `https://search.brave.com/search?q=${q}&source=web`;

  let rawResults: Array<{ url: string; title: string }> = [];
  try {
    // 40-second hard timeout — browser can hang indefinitely on rate-limited IPs
    const searchPromise = withStealthPage(braveUrl, async (page) => {
      // Brave is a JS SPA — wait longer for results to render
      try { await page.waitForSelector('a[href^="http"]', { timeout: 12000 }); } catch {}
      await page.waitForTimeout(4000);
      return page.evaluate((): Array<{ url: string; title: string }> => {
        const seenDomains = new Set<string>();
        const links: Array<{ url: string; title: string }> = [];

        // Extract URLs from Brave's AI-generated answer snippet (high confidence)
        const bodyText = document.body.innerText;
        const urlsInText = bodyText.match(/https?:\/\/[^\s"'<>()]+/g) ?? [];
        for (const url of urlsInText) {
          try {
            const clean = url.replace(/[.,)]+$/, '');
            const u = new URL(clean);
            if (u.hostname.includes('brave.com')) continue;
            if (seenDomains.has(u.hostname)) continue;
            seenDomains.add(u.hostname);
            links.push({ url: clean, title: `Brave answer: ${clean}` });
          } catch {}
        }

        // Then collect link elements (search results)
        for (const a of Array.from(document.querySelectorAll('a[href^="http"]'))) {
          const el = a as HTMLAnchorElement;
          try {
            const u = new URL(el.href);
            if (u.hostname.includes('brave.com')) continue;
            if (seenDomains.has(u.hostname)) continue;
            seenDomains.add(u.hostname);
            links.push({ url: el.href, title: el.textContent?.trim() ?? '' });
            if (links.length >= 14) break;
          } catch {}
        }
        return links;
      });
    }, { navigationTimeout: 25000, idleTimeout: 20000 });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('search timeout')), 40000));
    rawResults = await Promise.race([searchPromise, timeout]);
  } catch {
    return [];
  }

  // Brave returns real URLs — score, filter, screenshot
  const candidates = rawResults.filter(r => r.url && !isOta(r.url)).slice(0, 8);

  const scored = await Promise.all(candidates.map(async (c) => {
    const detection = detectKnownIBE(c.url);
    const detected = detection !== null;
    const score = scoreCandidate(c.url, c.title, hotelName, detected);
    const screenshotUrl = await takeScreenshot(c.url);
    return { url: c.url, title: c.title, detected, screenshotUrl, score };
  }));

  // Chain registry fallback — add only if no result from the chain domain was found
  if (chainDomain) {
    const chainHostname = new URL(chainDomain).hostname;
    const chainFound = scored.some(c => { try { return new URL(c.url).hostname.includes(chainHostname.replace('www.', '')); } catch { return false; } });
    if (!chainFound) {
      const screenshotUrl = await takeScreenshot(chainDomain);
      scored.push({ url: chainDomain, title: `${hotelName} — Official Website`, detected: false, screenshotUrl, score: 65 });
    }
  }

  return scored
    .filter(c => c.score >= 20)
    .sort((a, b) => {
      if (a.detected !== b.detected) return a.detected ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, 6);
}

export async function searchHotelsPrimary(
  hotelName: string,
  city: string,
  country: string,
): Promise<HotelCandidate[]> {
  const chainDomain = detectChain(hotelName)
  const results = await _dfsSearch(hotelName, city, country)

  if (chainDomain) {
    const chainHostname = new URL(chainDomain).hostname
    const chainFound = results.some(c => {
      try { return new URL(c.url).hostname.includes(chainHostname.replace('www.', '')) }
      catch { return false }
    })
    if (!chainFound) {
      // No screenshot in the fast DataForSEO path — screenshotUrl stays null to avoid Playwright latency
      results.push({ url: chainDomain, title: `${hotelName} — Official Website`, detected: false, screenshotUrl: null, score: 65 })
    }
  }

  return results
}
