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

const CMP_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyButtonAccept',
  '.axeptio_btn--accept',
  '.qc-cmp2-summary-buttons button:last-child',
  '#truste-consent-button',
  '#didomi-notice-agree-button',
  '.iubenda-cs-accept-btn',
  '.osano-cm-accept-all',
  '[id*="cookie"] button[class*="accept"]',
  '[id*="consent"] button[class*="accept"]',
  '[class*="cookie"] button[class*="accept"]',
  '[class*="consent"] button[class*="accept"]',
]

const CONSENT_ACCEPT_TEXT_RE = /^(accept(\s+all)?|allow(\s+(all|cookies))?|agree|got\s+it|i\s+agree|ok|tout\s+accepter|accepter|akzeptieren|alle\s+akzeptieren|aceptar(\s+todo)?|accetta(\s+tutto)?|aceitar|accepteren|принять|принимаю|قبول|接受|同意|すべて同意|동의|ยอมรับ|zgadzam\s+si[eę]|souhlas[ií]m|αποδοχ[ήη]|אישור|elfogadom|accepto)$/iu

async function dismissCookieConsent(page: Page): Promise<void> {
  try {
    // 1. Try known CMP selectors first
    for (const selector of CMP_SELECTORS) {
      const el = await page.$(selector).catch(() => null)
      if (el) {
        const visible = await el.isVisible().catch(() => false)
        if (visible) {
          await el.click().catch(() => {})
          await page.waitForTimeout(800)
          return
        }
      }
    }

    // 2. Fallback: any visible button whose text matches accept pattern
    const clicked = await page.evaluate((reSource: string) => {
      const re = new RegExp(reSource, 'iu')
      for (const el of Array.from(document.querySelectorAll('button, [role="button"]'))) {
        const text = (el as HTMLElement).innerText?.trim() ?? ''
        const visible = (el as HTMLElement).offsetParent !== null
        if (visible && re.test(text)) {
          ;(el as HTMLElement).click()
          return true
        }
      }
      return false
    }, CONSENT_ACCEPT_TEXT_RE.source).catch(() => false)

    if (clicked) await page.waitForTimeout(800)
  } catch {
    // non-critical — proceed even if dismissal fails
  }
}

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

    // Pre-seed consent so CMPs don't show banners
    const consentCookies = [
      { name: 'OptanonAlertBoxClosed', value: new Date().toISOString() },
      { name: 'cookieconsent_status', value: 'dismiss' },
      { name: 'cookie_consent', value: 'true' },
      { name: 'gdpr', value: '1' },
      { name: 'notice_behavior', value: 'implied,eu' },
    ]
    const { hostname } = new URL(url)
    for (const c of consentCookies) {
      await context.addCookies([{ ...c, domain: hostname, path: '/' }]).catch(() => {})
    }
    await context.addInitScript(() => {
      try {
        localStorage.setItem('OptanonAlertBoxClosed', new Date().toISOString())
        localStorage.setItem('CookieConsent', JSON.stringify({ stamp: '-1', necessary: true, preferences: true, statistics: true, marketing: true, ver: 1 }))
        localStorage.setItem('axeptio_cookies', JSON.stringify({ $$completed: true, $$token: '' }))
        localStorage.setItem('cookieconsent_status', 'dismiss')
        localStorage.setItem('gdpr', '1')
      } catch {}
    })

    options?.beforeNavigate?.(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options?.navigationTimeout ?? 30000 });
    await page.waitForLoadState('networkidle', { timeout: options?.idleTimeout ?? 15000 }).catch(() => {
      // networkidle can timeout on pages with constant polling — that's ok
    });
    await dismissCookieConsent(page);
    return await fn(page);
  } finally {
    await browser.close();
  }
}
