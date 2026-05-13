import { logger } from '../utils/logger.js'
import { withStealthPage } from './playwright-browser.service.js'

import type { Page } from 'playwright'

// ── Strategy 1: JSON-LD / schema.org structured data ─────────────────────────
// Most OTAs embed machine-readable price data — this is the most stable signal.

async function extractJsonLdPrice(page: Page): Promise<number | null> {
  try {
    // page.evaluate() runs in browser — use string form to avoid DOM type conflicts
    const prices = await page.evaluate(`
      (() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        const found = [];
        for (const s of scripts) {
          try {
            const data = JSON.parse(s.textContent || '');
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              const price = item?.offers?.price ?? item?.offers?.[0]?.price
                ?? (item?.priceRange || '').replace(/[^\\d.]/g, '');
              if (price && !isNaN(Number(price)) && Number(price) > 0) found.push(Number(price));
            }
          } catch(e) {}
        }
        return found;
      })()
    `) as number[]
    return prices.length > 0 ? Math.min(...prices) : null
  } catch {
    return null
  }
}

// ── Strategy 2: OTA-specific CSS selectors ────────────────────────────────────

type Extractor = (page: Page) => Promise<number | null>

const EXTRACTORS: Record<string, Extractor> = {
  'booking.com': async (page) => {
    // Wait for any price element to appear
    const priceSelector = [
      '[data-testid="price-and-discounted-price"]',
      '[data-testid="recommended-units"] [data-testid="price-for-x-nights"]',
      '.hprt-price-block',
      '[class*="priceValue"]',
      '.bui-price-display__value',
    ].join(', ')
    try {
      await page.waitForSelector(priceSelector, { timeout: 20000 })
    } catch { /* fall through to text scan */ }

    const raw = await page.$$eval(
      priceSelector + ', [class*="price__value"], [data-testid*="price"]',
      els => els.map(el => el.textContent?.trim() ?? ''),
    ).catch(() => [] as string[])
    return pickLowest(raw)
  },

  'expedia.com': async (page) => {
    const priceSelector = [
      '[data-stid="price-lockup-wrapper"]',
      '[class*="uitk-price-lockup"]',
      '[class*="PriceSummary"]',
    ].join(', ')
    try {
      await page.waitForSelector(priceSelector, { timeout: 20000 })
    } catch { /* fall through */ }

    const raw = await page.$$eval(
      '[class*="uitk-lockup-price"], [class*="uitk-price-lockup__price"], [class*="PriceSummary"] [class*="price"]',
      els => els.map(el => el.textContent?.trim() ?? ''),
    ).catch(() => [] as string[])
    return pickLowest(raw)
  },

  'hotels.com': async (page) => {
    return EXTRACTORS['expedia.com']?.(page) ?? null
  },

  'agoda.com': async (page) => {
    const priceSelector = [
      '[class*="PropertyCard__Price"]',
      '[class*="price-info"]',
      '[data-testid="price-info"]',
      '[class*="MasterRoom__Price"]',
    ].join(', ')
    try {
      await page.waitForSelector(priceSelector, { timeout: 20000 })
    } catch { /* fall through */ }

    const raw = await page.$$eval(
      priceSelector + ', [class*="Price__price"], [class*="discounted-price"]',
      els => els.map(el => el.textContent?.trim() ?? ''),
    ).catch(() => [] as string[])
    return pickLowest(raw)
  },

  'airbnb.com': async (page) => {
    const priceSelector = [
      '[data-testid="price-summary"]',
      '[data-testid="book-it-default"]',
      '[class*="totalPrice"]',
    ].join(', ')
    try {
      await page.waitForSelector(priceSelector, { timeout: 20000 })
    } catch { /* fall through */ }

    const raw = await page.$$eval(
      priceSelector + ' span, [data-testid="book-it-default"] [class*="price"]',
      els => els.map(el => el.textContent?.trim() ?? ''),
    ).catch(() => [] as string[])
    return pickLowest(raw)
  },

  'tripadvisor.com': async (page) => {
    const priceSelector = [
      '[data-automation="price"]',
      '[class*="priceTag"]',
      '[class*="price-wrap"]',
    ].join(', ')
    try {
      await page.waitForSelector(priceSelector, { timeout: 20000 })
    } catch { /* fall through */ }

    const raw = await page.$$eval(
      priceSelector + ', [data-automation*="price"]',
      els => els.map(el => el.textContent?.trim() ?? ''),
    ).catch(() => [] as string[])
    return pickLowest(raw)
  },
}

// ── Strategy 3: Full-page text scan for currency + number patterns ─────────────
// Last resort — scans all visible text for price-like strings near currency symbols.

async function extractByTextScan(page: Page): Promise<number | null> {
  try {
    const bodyText = await page.evaluate(`
      Array.from(document.querySelectorAll(
        'main, [role="main"], [class*="price"], [class*="rate"], [class*="cost"], [data-testid*="price"]'
      )).slice(0, 50).map(el => el.textContent?.trim() || '').join('\\n')
    `) as string
    // Look for patterns like: $739, €702, USD 702, 739.00
    const matches = bodyText.match(/(?:[$€£¥₹]|USD|EUR|GBP)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:[$€£¥]|USD|EUR|GBP)/g)
    if (!matches) return null
    return pickLowest(matches)
  } catch {
    return null
  }
}

// ── Price parsing ─────────────────────────────────────────────────────────────

function parsePrice(text: string): number | null {
  if (!text) return null
  const cleaned = text.replace(/[^\d.,]/g, '')
  if (!cleaned) return null
  // European format: 1.234,56 → 1234.56
  const normalised = cleaned.includes(',') && cleaned.indexOf(',') > cleaned.indexOf('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '')
  const value = parseFloat(normalised)
  // Sanity check: hotel prices should be > $1 and < $100,000/night
  return isNaN(value) || value <= 1 || value > 100000 ? null : value
}

function pickLowest(texts: string[]): number | null {
  const prices = texts.map(parsePrice).filter((n): n is number => n !== null)
  return prices.length > 0 ? Math.min(...prices) : null
}

// ── Main scrape function ──────────────────────────────────────────────────────

export interface ScrapeResult {
  price: number | null
  currency: string
}

export async function scrapeOtaPrice(url: string): Promise<ScrapeResult> {
  const hostname = new URL(url).hostname.replace(/^www\./, '')
  const extractor = Object.entries(EXTRACTORS).find(([key]) => hostname.includes(key))?.[1]

  try {
    return await withStealthPage(url, async (page) => {
      // Detect currency
      const currency = await page.$eval(
        'meta[name="currency"], meta[itemprop="priceCurrency"]',
        el => el.getAttribute('content') ?? '',
      ).catch(() => '')

      const pageTitle = await page.title().catch(() => '')
      logger.debug({ url, pageTitle }, '[PriceComparison] Page loaded')

      // Strategy cascade: JSON-LD → OTA-specific CSS → full-page text scan
      let price: number | null = await extractJsonLdPrice(page)

      if (price === null && extractor) {
        price = await extractor(page)
      }

      if (price === null) {
        price = await extractByTextScan(page)
      }

      logger.info({ url, price, currency: currency || 'USD', pageTitle }, '[PriceComparison] Scraped OTA price')
      return { price, currency: currency || 'USD' }
    })
  } catch (err) {
    logger.warn({ url, err }, '[PriceComparison] Scrape failed')
    return { price: null, currency: 'USD' }
  }
}
