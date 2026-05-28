import { chromium } from 'playwright';
import type { Page } from 'playwright';

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--window-size=1280,900',
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const STEALTH_SCRIPT = `

  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  Object.defineProperty(navigator, 'permissions', {
    get: () => ({ query: () => Promise.resolve({ state: 'granted' }) })
  });
  window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
`;

/**
 * Launches a stealth Chromium browser, navigates to `url`, waits for network
 * idle, then calls `fn(page)`. Always closes the browser when done.
 *
 * Throws if navigation or `fn` throws — callers decide their own error handling.
 */
export async function withStealthPage<T>(
  url: string,
  fn: (page: Page) => Promise<T>,
  options?: { navigationTimeout?: number; idleTimeout?: number; beforeNavigate?: (page: Page) => void },
): Promise<T> {
  const browser = await chromium.launch({ headless: true, args: BROWSER_ARGS });
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    });
    await context.addInitScript(STEALTH_SCRIPT);
    const page = await context.newPage();
    options?.beforeNavigate?.(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options?.navigationTimeout ?? 30000 });
    await page.waitForLoadState('networkidle', { timeout: options?.idleTimeout ?? 15000 }).catch(() => {
      // networkidle can timeout on pages with constant polling — that's ok
    });
    return await fn(page);
  } finally {
    await browser.close();
  }
}
