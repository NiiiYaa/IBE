# External IBE 2-Stage Booking Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an external IBE booking URL requires a session-specific `{solutionId}` UUID (e.g. Sentec's `/solution/{UUID}/guest` pattern), automatically navigate the external IBE search page using Playwright, extract the solutionId from the page's booking links, and return a fully resolved booking URL.

**Architecture:** A shared `playwright-browser.service.ts` owns all browser lifecycle/stealth infrastructure (used by the OTA price scraper today and the new external IBE scraper). `external-ibe-scraper.service.ts` owns regex derivation and the scraping logic. A public API route handles widget clients. MCP's `create_booking_link` gains 2-stage logic. The widget gets an async resolve flow with proper loading UX.

**Tech Stack:** TypeScript, Playwright (already installed at `^1.59.1`), Fastify, Vitest.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `apps/api/src/services/playwright-browser.service.ts` | Shared `withStealthPage<T>` helper — browser launch, stealth context, navigation |
| Modify | `apps/api/src/services/ota-scraper.service.ts` | Use `withStealthPage` (remove duplicated Playwright infra) |
| Create | `apps/api/src/services/external-ibe-scraper.service.ts` | `deriveBookingLinkRegex` + `resolveExternalBookingUrl` |
| Create | `apps/api/src/services/__tests__/external-ibe-scraper.service.test.ts` | Unit tests (regex + mocked `withStealthPage`) |
| Modify | `packages/shared/src/types/external-ibe.ts` | Add `ExternalIBEResolveRequest` / `ExternalIBEResolveResponse` |
| Create | `apps/api/src/routes/external-ibe-resolve.route.ts` | Public POST route for widget clients |
| Modify | `apps/api/src/app.ts` | Register the new public resolve route |
| Modify | `apps/api/src/routes/mcp.route.ts` | 2-stage `create_booking_link` + widget `needsSolutionId` flag |

---

## Task 1: Shared Playwright browser service

**Files:**
- Create: `apps/api/src/services/playwright-browser.service.ts`
- Modify: `apps/api/src/services/ota-scraper.service.ts`

All Playwright browser setup (launch args, stealth script, user-agent, context options, navigation) lives here as a single `withStealthPage<T>` helper. Callers provide a URL and a function that receives a fully loaded page; the helper owns the entire browser lifecycle.

The OTA scraper currently duplicates all this. This task migrates it to use the shared helper.

- [ ] **Step 1: Create `playwright-browser.service.ts`**

```ts
import { chromium } from 'playwright'
import type { Page } from 'playwright'

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--window-size=1280,900',
]

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  Object.defineProperty(navigator, 'permissions', {
    get: () => ({ query: () => Promise.resolve({ state: 'granted' }) })
  });
  window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
`

/**
 * Launches a stealth Chromium browser, navigates to `url`, waits for network
 * idle, then calls `fn(page)`. Always closes the browser when done.
 *
 * Throws if navigation or `fn` throws — callers decide their own error handling.
 */
export async function withStealthPage<T>(
  url: string,
  fn: (page: Page) => Promise<T>,
  options?: { navigationTimeout?: number; idleTimeout?: number },
): Promise<T> {
  const browser = await chromium.launch({ headless: true, args: BROWSER_ARGS })
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
    })
    await context.addInitScript(STEALTH_SCRIPT)
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options?.navigationTimeout ?? 30000 })
    await page.waitForLoadState('networkidle', { timeout: options?.idleTimeout ?? 15000 }).catch(() => {})
    return await fn(page)
  } finally {
    await browser.close()
  }
}
```

- [ ] **Step 2: Migrate `ota-scraper.service.ts` to use `withStealthPage`**

Read the current file at `apps/api/src/services/ota-scraper.service.ts`.

Remove:
- The `BROWSER_ARGS` constant
- The `USER_AGENT` constant  
- The `STEALTH_SCRIPT` constant
- The `import { chromium } from 'playwright'` line (no longer needed directly)

Add at top:
```ts
import { withStealthPage } from './playwright-browser.service.js'
```

Replace the `scrapeOtaPrice` function body. The current code launches a browser, creates a context, adds stealth, navigates, then runs a strategy cascade. After migration:

```ts
export async function scrapeOtaPrice(url: string): Promise<ScrapeResult> {
  const hostname = new URL(url).hostname.replace(/^www\./, '')
  const extractor = Object.entries(EXTRACTORS).find(([key]) => hostname.includes(key))?.[1]

  try {
    return await withStealthPage(url, async (page) => {
      const currency = await page.$eval(
        'meta[name="currency"], meta[itemprop="priceCurrency"]',
        el => el.getAttribute('content') ?? '',
      ).catch(() => '')

      const pageTitle = await page.title().catch(() => '')
      logger.debug({ url, pageTitle }, '[PriceComparison] Page loaded')

      let price: number | null = await extractJsonLdPrice(page)
      if (price === null && extractor) price = await extractor(page)
      if (price === null) price = await extractByTextScan(page)

      logger.info({ url, price, currency: currency || 'USD', pageTitle }, '[PriceComparison] Scraped OTA price')
      return { price, currency: currency || 'USD' }
    })
  } catch (err) {
    logger.warn({ url, err }, '[PriceComparison] Scrape failed')
    return { price: null, currency: 'USD' }
  }
}
```

Note: `extractJsonLdPrice`, `extractByTextScan`, `pickLowest`, `parsePrice`, and the `EXTRACTORS` map remain unchanged — they all take a `Page` argument and are called inside the `fn` callback.

- [ ] **Step 3: Check for existing OTA scraper tests**

```bash
ls /home/nir/ibe/apps/api/src/services/__tests__/ota-scraper* 2>/dev/null || echo "no test file"
```

If a test file exists and mocks `playwright` directly, update it to mock `./playwright-browser.service.js` instead. If no test file exists, nothing to do.

- [ ] **Step 4: Compile check**

```bash
cd /home/nir/ibe
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | grep -E 'ota-scraper|playwright-browser' | head -20
```

Expected: No errors on these files.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/playwright-browser.service.ts apps/api/src/services/ota-scraper.service.ts
git commit -m "refactor: extract shared withStealthPage helper; migrate ota-scraper to use it"
```

---

## Task 2: `deriveBookingLinkRegex` — regex derivation utility

**Files:**
- Create: `apps/api/src/services/external-ibe-scraper.service.ts`
- Create: `apps/api/src/services/__tests__/external-ibe-scraper.service.test.ts`

**How the regex works:**
Given `bookingTemplate = "https://ext.com/solution/{solutionId}/guest?hotel={externalHotelId}&from={checkIn}"`:
1. Slice up to and including `{solutionId}` → `"https://ext.com/solution/{solutionId}"`
2. Escape all regex special chars → `"https://ext\.com/solution/\{solutionId\}"`
3. Replace escaped `\{solutionId\}` → `([^/?&#]+)` (capture group)
4. Replace any remaining `\{token\}` → `[^/?&#]*` (non-capturing)
5. Result regex matches `https://ext.com/solution/<any-value>` and captures the value

Only the template prefix up to `{solutionId}` is used — this makes matching robust against different query-parameter orderings on real pages.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/__tests__/external-ibe-scraper.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveBookingLinkRegex } from '../external-ibe-scraper.service.js'

describe('deriveBookingLinkRegex', () => {
  it('returns null when bookingTemplate has no {solutionId}', () => {
    expect(deriveBookingLinkRegex(
      'https://ext.com/book?hotel={externalHotelId}&from={checkIn}',
    )).toBeNull()
  })

  it('extracts solutionId from path segment', () => {
    const regex = deriveBookingLinkRegex(
      'https://ext.com/solution/{solutionId}/guest?hotel={externalHotelId}&from={checkIn}',
    )!
    expect(regex).not.toBeNull()
    const match = regex.exec(
      'https://ext.com/solution/88980bd0-1234-5678-abcd-ef0123456789/guest?hotel=4521&from=2024-06-01',
    )
    expect(match?.[1]).toBe('88980bd0-1234-5678-abcd-ef0123456789')
  })

  it('extracts solutionId from query string', () => {
    const regex = deriveBookingLinkRegex(
      'https://ext.com/book?token={solutionId}&hotel={externalHotelId}',
    )!
    const match = regex.exec('https://ext.com/book?token=abc-123&hotel=4521')
    expect(match?.[1]).toBe('abc-123')
  })

  it('does not match a URL whose domain differs from the template', () => {
    const regex = deriveBookingLinkRegex(
      'https://ext.com/solution/{solutionId}/guest',
    )!
    expect(regex.exec('https://other.com/solution/uuid/guest')).toBeNull()
  })

  it('handles {solutionId} immediately after domain slash', () => {
    const regex = deriveBookingLinkRegex(
      'https://ext.com/{solutionId}?hotel={externalHotelId}',
    )!
    const match = regex.exec('https://ext.com/my-session-token?hotel=99')
    expect(match?.[1]).toBe('my-session-token')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/nir/ibe
npx vitest run apps/api/src/services/__tests__/external-ibe-scraper.service.test.ts 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../external-ibe-scraper.service.js'`

- [ ] **Step 3: Implement `deriveBookingLinkRegex`**

Create `apps/api/src/services/external-ibe-scraper.service.ts`:

```ts
/**
 * Derives a RegExp from bookingTemplate that captures {solutionId} from real page URLs.
 *
 * Only the portion of the template up to (and including) {solutionId} is used —
 * robust against different query-param orderings on real pages.
 *
 * Returns null when the template has no {solutionId} token (no scraping needed).
 */
export function deriveBookingLinkRegex(bookingTemplate: string): RegExp | null {
  const marker = '{solutionId}'
  const idx = bookingTemplate.indexOf(marker)
  if (idx === -1) return null

  const prefix = bookingTemplate.slice(0, idx + marker.length)

  // Escape all regex special chars, then replace our token markers
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, c => `\\${c}`)

  const pattern = escaped
    .replace(/\\\{solutionId\\\}/g, '([^/?&#]+)')
    .replace(/\\\{[^}\\]+\\\}/g, '[^/?&#]*')

  return new RegExp(pattern)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/nir/ibe
npx vitest run apps/api/src/services/__tests__/external-ibe-scraper.service.test.ts 2>&1 | tail -20
```

Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/external-ibe-scraper.service.ts apps/api/src/services/__tests__/external-ibe-scraper.service.test.ts
git commit -m "feat: add deriveBookingLinkRegex — extracts solutionId regex from booking template"
```

---

## Task 3: Add shared types for the public resolve endpoint

**Files:**
- Modify: `packages/shared/src/types/external-ibe.ts`

- [ ] **Step 1: Append to `packages/shared/src/types/external-ibe.ts`**

```ts
export interface ExternalIBEResolveRequest {
  propertyId: number
  checkIn: string
  checkOut: string
  adults?: number
  roomName?: string    // hint for room matching (widget passes displayed room name)
  lowestPrice?: number // hint for price-based matching
}

export interface ExternalIBEResolveResponse {
  bookingUrl: string
  fallback: boolean   // true when solutionId could not be resolved; URL is the search URL
}
```

- [ ] **Step 2: Verify `packages/shared/src/index.ts` already re-exports all external-ibe types**

```bash
grep 'external-ibe' /home/nir/ibe/packages/shared/src/index.ts
```

If it exports as `export * from './types/external-ibe.js'`, nothing extra is needed. If each type is named individually, add the two new names.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/external-ibe.ts
git commit -m "feat: add ExternalIBEResolveRequest/Response shared types"
```

---

## Task 4: `resolveExternalBookingUrl` Playwright scraper

**Files:**
- Modify: `apps/api/src/services/external-ibe-scraper.service.ts`
- Modify: `apps/api/src/services/__tests__/external-ibe-scraper.service.test.ts`

Uses `withStealthPage` from the shared browser service. Tests mock `../playwright-browser.service.js` (not `playwright` directly) — this is the correct mock target since the scraper imports `withStealthPage`, not `chromium`.

**Match strategy:**
1. `roomName` hint provided → pick candidate whose DOM card text contains the room name (case-insensitive)
2. No match or no hint → first candidate
3. No candidates → return `searchUrl` as fallback

- [ ] **Step 1: Write failing tests for `resolveExternalBookingUrl`**

Add to `apps/api/src/services/__tests__/external-ibe-scraper.service.test.ts` (after existing `deriveBookingLinkRegex` tests):

```ts
import { vi, beforeEach } from 'vitest'

const mockPage = { $$eval: vi.fn() }

vi.mock('../playwright-browser.service.js', () => ({
  withStealthPage: vi.fn(async (_url: string, fn: (page: unknown) => Promise<unknown>) => fn(mockPage)),
}))

import { withStealthPage } from '../playwright-browser.service.js'
import { resolveExternalBookingUrl } from '../external-ibe-scraper.service.js'

beforeEach(() => {
  vi.clearAllMocks()
  // Reset withStealthPage to the default pass-through each test
  ;(withStealthPage as ReturnType<typeof vi.fn>).mockImplementation(
    async (_url: string, fn: (page: unknown) => Promise<unknown>) => fn(mockPage),
  )
})

describe('resolveExternalBookingUrl', () => {
  const baseOpts = {
    searchUrl:       'https://ext.com/search?hotel=4521&from=2024-06-01&to=2024-06-07',
    bookingTemplate: 'https://ext.com/solution/{solutionId}/guest?hotel={externalHotelId}&from={checkIn}&to={checkOut}',
    externalHotelId: '4521',
    checkIn:         '2024-06-01',
    checkOut:        '2024-06-07',
    adults:          2,
  }

  it('resolves solutionId from first matching link when no roomName hint', async () => {
    mockPage.$$eval.mockResolvedValue([
      { href: 'https://ext.com/solution/uuid-aaa/guest?hotel=4521', cardText: 'Standard Room' },
      { href: 'https://ext.com/solution/uuid-bbb/guest?hotel=4521', cardText: 'Deluxe Room' },
    ])

    const result = await resolveExternalBookingUrl(baseOpts)

    expect(result.fallback).toBe(false)
    expect(result.solutionId).toBe('uuid-aaa')
    expect(result.bookingUrl).toContain('/solution/uuid-aaa/guest')
    expect(result.bookingUrl).toContain('hotel=4521')
    expect(result.bookingUrl).toContain('from=2024-06-01')
  })

  it('picks the link whose cardText matches roomName hint', async () => {
    mockPage.$$eval.mockResolvedValue([
      { href: 'https://ext.com/solution/uuid-aaa/guest?hotel=4521', cardText: 'Standard Room from $100' },
      { href: 'https://ext.com/solution/uuid-bbb/guest?hotel=4521', cardText: 'Deluxe Suite from $250' },
    ])

    const result = await resolveExternalBookingUrl({ ...baseOpts, roomName: 'Deluxe Suite' })

    expect(result.solutionId).toBe('uuid-bbb')
    expect(result.fallback).toBe(false)
  })

  it('falls back to search URL when no links match the regex', async () => {
    mockPage.$$eval.mockResolvedValue([
      { href: 'https://ext.com/info/4521', cardText: 'Hotel info page' },
    ])

    const result = await resolveExternalBookingUrl(baseOpts)

    expect(result.fallback).toBe(true)
    expect(result.bookingUrl).toBe(baseOpts.searchUrl)
    expect(result.solutionId).toBeUndefined()
  })

  it('falls back to search URL when withStealthPage throws', async () => {
    ;(withStealthPage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Browser crash'))

    const result = await resolveExternalBookingUrl(baseOpts)

    expect(result.fallback).toBe(true)
    expect(result.bookingUrl).toBe(baseOpts.searchUrl)
  })

  it('skips scraping when template has no {solutionId} — builds URL directly', async () => {
    const result = await resolveExternalBookingUrl({
      ...baseOpts,
      bookingTemplate: 'https://ext.com/book?hotel={externalHotelId}&from={checkIn}&to={checkOut}',
    })

    expect(withStealthPage).not.toHaveBeenCalled()
    expect(result.fallback).toBe(false)
    expect(result.bookingUrl).toContain('hotel=4521')
    expect(result.bookingUrl).toContain('from=2024-06-01')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/nir/ibe
npx vitest run apps/api/src/services/__tests__/external-ibe-scraper.service.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: FAIL — `resolveExternalBookingUrl is not a function`

- [ ] **Step 3: Implement `resolveExternalBookingUrl`**

Append to `apps/api/src/services/external-ibe-scraper.service.ts`:

```ts
import { logger } from '../utils/logger.js'
import { withStealthPage } from './playwright-browser.service.js'
import { buildExternalUrl } from './external-ibe.service.js'

export interface ScrapeBookingOptions {
  searchUrl: string
  bookingTemplate: string
  externalHotelId: string | null
  checkIn: string
  checkOut: string
  adults: number
  roomName?: string
  lowestPrice?: number
}

export interface ScrapeBookingResult {
  bookingUrl: string
  fallback: boolean
  solutionId?: string
}

export async function resolveExternalBookingUrl(opts: ScrapeBookingOptions): Promise<ScrapeBookingResult> {
  const { searchUrl, bookingTemplate, externalHotelId, checkIn, checkOut, adults } = opts

  const regex = deriveBookingLinkRegex(bookingTemplate)

  if (!regex) {
    return {
      bookingUrl: buildExternalUrl(bookingTemplate, { externalHotelId, checkIn, checkOut, adults, rooms: 1 }),
      fallback: false,
    }
  }

  try {
    return await withStealthPage(searchUrl, async (page) => {
      const regexSource = regex.source
      const candidates = await (page as import('playwright').Page).$$eval(
        'a[href]',
        (els, pattern) => {
          const re = new RegExp(pattern)
          return els
            .filter(el => re.test((el as HTMLAnchorElement).href))
            .map(el => {
              let node: Element | null = el
              let cardText = ''
              for (let i = 0; i < 6 && node; i++) {
                node = node.parentElement
                const text = node?.textContent?.trim() ?? ''
                if (text.length >= 10 && text.length <= 500) { cardText = text; break }
              }
              return { href: (el as HTMLAnchorElement).href, cardText }
            })
        },
        regexSource,
      ) as Array<{ href: string; cardText: string }>

      if (candidates.length === 0) {
        logger.info({ searchUrl }, '[ExternalIBE] no booking links matched — fallback')
        return { bookingUrl: searchUrl, fallback: true }
      }

      let best = candidates[0]!
      if (opts.roomName) {
        const nameLower = opts.roomName.toLowerCase()
        const nameMatch = candidates.find(c => c.cardText.toLowerCase().includes(nameLower))
        if (nameMatch) best = nameMatch
      }

      const match = regex.exec(best.href)
      const solutionId = match?.[1]
      if (!solutionId) return { bookingUrl: searchUrl, fallback: true }

      const bookingUrl = buildExternalUrl(bookingTemplate, {
        externalHotelId, checkIn, checkOut, adults, rooms: 1, solutionId,
      })

      logger.info({ searchUrl, solutionId, cardText: best.cardText }, '[ExternalIBE] resolved solutionId')
      return { bookingUrl, fallback: false, solutionId }
    })
  } catch (err) {
    logger.warn({ err, searchUrl }, '[ExternalIBE] scrape failed — fallback to search URL')
    return { bookingUrl: searchUrl, fallback: true }
  }
}
```

- [ ] **Step 4: Run all scraper tests**

```bash
cd /home/nir/ibe
npx vitest run apps/api/src/services/__tests__/external-ibe-scraper.service.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: PASS — all 10 tests green (5 regex + 5 scraper)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/external-ibe-scraper.service.ts apps/api/src/services/__tests__/external-ibe-scraper.service.test.ts
git commit -m "feat: add resolveExternalBookingUrl — uses withStealthPage to scrape solutionId"
```

---

## Task 5: Public resolve API route

**Files:**
- Create: `apps/api/src/routes/external-ibe-resolve.route.ts`
- Modify: `apps/api/src/app.ts`

Public endpoint (no auth) called by the widget, which runs in an AI chat iframe with no session token. Returns 404 if the property hasn't configured external IBE with `widgetEnabled`.

- [ ] **Step 1: Write the route**

Create `apps/api/src/routes/external-ibe-resolve.route.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { getEffectiveExternalIBEConfig, buildExternalUrl } from '../services/external-ibe.service.js'
import { resolveExternalBookingUrl } from '../services/external-ibe-scraper.service.js'
import type { ExternalIBEResolveResponse } from '@ibe/shared'

export async function externalIBEResolveRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      propertyId: number
      checkIn: string
      checkOut: string
      adults?: number
      roomName?: string
      lowestPrice?: number
    }
  }>('/external-ibe/resolve', async (request, reply) => {
    const { propertyId, checkIn, checkOut, adults = 2, roomName, lowestPrice } = request.body

    if (!propertyId || !checkIn || !checkOut) {
      return reply.status(400).send({ error: 'propertyId, checkIn, checkOut are required' })
    }

    const extConfig = await getEffectiveExternalIBEConfig(propertyId)
    if (!extConfig?.widgetEnabled || !extConfig.searchTemplate || !extConfig.bookingTemplate) {
      return reply.status(404).send({ error: 'External IBE not configured for this property' })
    }

    const searchUrl = buildExternalUrl(extConfig.searchTemplate, {
      externalHotelId: extConfig.externalHotelId,
      checkIn,
      checkOut,
      adults,
      rooms: 1,
    })

    const result = await resolveExternalBookingUrl({
      searchUrl,
      bookingTemplate: extConfig.bookingTemplate,
      externalHotelId: extConfig.externalHotelId,
      checkIn,
      checkOut,
      adults,
      roomName,
      lowestPrice,
    })

    const response: ExternalIBEResolveResponse = {
      bookingUrl: result.bookingUrl,
      fallback: result.fallback,
    }
    return reply.send(response)
  })
}
```

- [ ] **Step 2: Register the route in `apps/api/src/app.ts`**

Check where public routes are registered:
```bash
grep -n 'publicApp\|public/' /home/nir/ibe/apps/api/src/app.ts | head -20
```

Add import:
```ts
import { externalIBEResolveRoutes } from './routes/external-ibe-resolve.route.js'
```

Register using the same prefix pattern as existing public routes (e.g., `await publicApp.register(externalIBEResolveRoutes, { prefix: '/public' })`).

- [ ] **Step 3: Smoke-test the route**

```bash
curl -s -X POST http://localhost:3001/api/v1/public/external-ibe/resolve \
  -H 'Content-Type: application/json' \
  -d '{"propertyId":999999,"checkIn":"2024-06-01","checkOut":"2024-06-07","adults":2}' | jq .
```

Expected: `{"error":"External IBE not configured for this property"}` with HTTP 404 (not 401, confirming no auth required).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/external-ibe-resolve.route.ts apps/api/src/app.ts
git commit -m "feat: add public /external-ibe/resolve endpoint for widget 2-stage booking flow"
```

---

## Task 6: MCP `create_booking_link` 2-stage flow

**Files:**
- Modify: `apps/api/src/routes/mcp.route.ts`

When `mcpEnabled` and the `bookingTemplate` contains `{solutionId}`, scrape the search page first. Falls back to search URL on failure (the scraper already returns the search URL in `result.bookingUrl` on failure, so the fall-through to local IBE only triggers when external IBE isn't configured at all).

- [ ] **Step 1: Add import**

In `apps/api/src/routes/mcp.route.ts`, after the existing `getEffectiveExternalIBEConfig` import line:

```ts
import { resolveExternalBookingUrl } from '../services/external-ibe-scraper.service.js'
```

- [ ] **Step 2: Replace the `create_booking_link` external IBE block**

Find (around line 869):
```ts
    try {
      const extConfig = await getEffectiveExternalIBEConfig(pid)
      if (extConfig?.mcpEnabled && extConfig.bookingTemplate) {
        url = buildExternalUrl(extConfig.bookingTemplate, {
          hotelId:         pid,
          externalHotelId: extConfig.externalHotelId,
          checkIn:         checkIn,
          checkOut:        checkOut,
          adults:          adults,
          rooms:           1,
          nationality:     null,
          currency:        null,
          roomId:          roomId ?? null,
          ratePlanId:      ratePlanId ?? null,
        })
      }
    } catch (err) {
      logger.warn({ err, pid }, '[MCP] getEffectiveExternalIBEConfig failed — falling back to local IBE URL')
    }
```

Replace with:
```ts
    try {
      const extConfig = await getEffectiveExternalIBEConfig(pid)
      if (extConfig?.mcpEnabled && extConfig.bookingTemplate) {
        const needsSolutionId = extConfig.bookingTemplate.includes('{solutionId}')

        if (needsSolutionId && extConfig.searchTemplate) {
          const searchUrl = buildExternalUrl(extConfig.searchTemplate, {
            hotelId:         pid,
            externalHotelId: extConfig.externalHotelId,
            checkIn,
            checkOut,
            adults,
            rooms:           1,
            nationality:     null,
            currency:        null,
          })
          const resolved = await resolveExternalBookingUrl({
            searchUrl,
            bookingTemplate: extConfig.bookingTemplate,
            externalHotelId: extConfig.externalHotelId,
            checkIn,
            checkOut,
            adults,
          })
          url = resolved.bookingUrl
        } else {
          url = buildExternalUrl(extConfig.bookingTemplate, {
            hotelId:         pid,
            externalHotelId: extConfig.externalHotelId,
            checkIn,
            checkOut,
            adults,
            rooms:           1,
            nationality:     null,
            currency:        null,
            roomId:          roomId ?? null,
            ratePlanId:      ratePlanId ?? null,
          })
        }
      }
    } catch (err) {
      logger.warn({ err, pid }, '[MCP] getEffectiveExternalIBEConfig failed — falling back to local IBE URL')
    }
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/mcp.route.ts
git commit -m "feat: MCP create_booking_link uses 2-stage scrape when bookingTemplate has {solutionId}"
```

---

## Task 7: Widget 2-stage booking flow

**Files:**
- Modify: `apps/api/src/routes/mcp.route.ts` (two sections: `search_availability` meta + `WIDGET_HTML`)

When `widgetEnabled` and the booking template has `{solutionId}`, the server adds `needsSolutionId: true` + `resolveEndpoint` to `_meta`. The widget renders a `<button>` instead of `<a>` for those rooms, makes an async resolve call on click, and shows a loading state while the server scrapes.

- [ ] **Step 1: Update `search_availability` `_meta` to include `needsSolutionId`**

Find the `externalIBEConfig` block in the `search_availability` handler (around lines 804–816):

```ts
      let externalIBEConfig: { searchTemplate: string | null; bookingTemplate: string | null; externalHotelId: string | null } | null = null
      try {
        const extConfig = await getEffectiveExternalIBEConfig(pid)
        if (extConfig?.widgetEnabled && extConfig.bookingTemplate) {
          externalIBEConfig = {
            searchTemplate:  extConfig.searchTemplate,
            bookingTemplate: extConfig.bookingTemplate,
            externalHotelId: extConfig.externalHotelId,
          }
        }
      } catch (extErr) {
        logger.warn({ extErr, pid }, '[MCP] getEffectiveExternalIBEConfig failed — widget will use local IBE URL')
      }
```

Replace with:

```ts
      let externalIBEConfig: {
        searchTemplate:  string | null
        bookingTemplate: string | null
        externalHotelId: string | null
        needsSolutionId: boolean
        resolveEndpoint?: string
      } | null = null
      try {
        const extConfig = await getEffectiveExternalIBEConfig(pid)
        if (extConfig?.widgetEnabled && extConfig.bookingTemplate) {
          const needsSolutionId = extConfig.bookingTemplate.includes('{solutionId}')
          externalIBEConfig = {
            searchTemplate:  extConfig.searchTemplate,
            bookingTemplate: extConfig.bookingTemplate,
            externalHotelId: extConfig.externalHotelId,
            needsSolutionId,
            ...(needsSolutionId ? { resolveEndpoint: '/api/v1/public/external-ibe/resolve' } : {}),
          }
        }
      } catch (extErr) {
        logger.warn({ extErr, pid }, '[MCP] getEffectiveExternalIBEConfig failed — widget will use local IBE URL')
      }
```

- [ ] **Step 2: Update `WIDGET_HTML` — replace `bookingUrl` function and `render` function**

In `WIDGET_HTML`, find and replace the existing `function bookingUrl(room, rate, meta)` (lines ~191–216) with these two functions:

```js
    function directBookingUrl(room, rate, meta) {
      var extCfg = meta.externalIBEConfig
      if (extCfg && extCfg.bookingTemplate && !extCfg.needsSolutionId) {
        return buildExternalUrl(extCfg.bookingTemplate, {
          hotelId:         meta.propertyId,
          externalHotelId: extCfg.externalHotelId,
          checkIn:         meta.checkIn  ?? '',
          checkOut:        meta.checkOut ?? '',
          adults:          meta.adults ?? 2,
          rooms:           1,
          roomId:          room.roomId,
          ratePlanId:      rate.ratePlanId,
        })
      }
      if (extCfg && extCfg.needsSolutionId) return null
      if (!meta.webBaseUrl || !meta.propertyId) return null
      var p = new URLSearchParams({
        hotelId:            String(meta.propertyId),
        checkIn:            meta.checkIn  ?? '',
        checkOut:           meta.checkOut ?? '',
        'rooms[0][adults]': String(meta.adults ?? 2),
        roomId:             String(room.roomId),
        ratePlanId:         String(rate.ratePlanId),
        searchId:           meta.searchId ?? '',
      })
      return meta.webBaseUrl + '/booking?' + p
    }

    function resolveAndOpen(btn, room, meta) {
      var extCfg = meta.externalIBEConfig
      if (!extCfg || !extCfg.resolveEndpoint) return
      btn.disabled = true
      btn.textContent = 'Searching...'
      fetch(extCfg.resolveEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId:  meta.propertyId,
          checkIn:     meta.checkIn,
          checkOut:    meta.checkOut,
          adults:      meta.adults ?? 2,
          roomName:    room.roomName,
          lowestPrice: room.lowestRate,
        }),
      })
      .then(function(r) { return r.json() })
      .then(function(data) { window.open(data.bookingUrl, '_blank', 'noopener,noreferrer') })
      .catch(function() {
        if (extCfg.searchTemplate) {
          var fallback = buildExternalUrl(extCfg.searchTemplate, {
            externalHotelId: extCfg.externalHotelId,
            checkIn:  meta.checkIn  ?? '',
            checkOut: meta.checkOut ?? '',
            adults:   meta.adults ?? 2,
            rooms:    1,
          })
          window.open(fallback, '_blank', 'noopener,noreferrer')
        }
      })
      .finally(function() { btn.disabled = false; btn.textContent = 'Book now' })
    }
```

Then replace the existing `function render(rooms, meta)` with:

```js
    function render(rooms, meta) {
      const app = document.getElementById('app')
      if (!rooms.length) {
        app.innerHTML = '<p class="status">No rooms available for your selection.</p>'
        return
      }
      const currency = meta.currency ?? 'USD'
      const extCfg = meta.externalIBEConfig

      app.innerHTML = rooms.map(function(room) {
        const bestRate = room.rates && room.rates[0]
        const needsResolve = extCfg && extCfg.needsSolutionId
        const directUrl = bestRate ? directBookingUrl(room, bestRate, meta) : null
        const low = room.availableCount <= 3
        const availLabel = low ? 'Only ' + room.availableCount + ' left' : room.availableCount + ' available'
        const ratesHtml = (room.rates ?? []).slice(0, 3).map(function(r) {
          return '<div class="rate-row"><span class="rate-name">' + r.ratePlanName + (r.boardType ? ' &middot; ' + r.boardType : '') + '</span><span class="rate-amount">' + fmt(r.amount, currency) + '</span></div>'
        }).join('')
        var btnHtml
        if (bestRate && (directUrl || needsResolve)) {
          btnHtml = needsResolve
            ? '<button class="book-btn" data-room-idx="' + rooms.indexOf(room) + '">Book now</button>'
            : '<a href="' + directUrl + '" target="_blank" rel="noopener noreferrer" class="book-btn">Book now</a>'
        } else {
          btnHtml = '<span style="font-size:12px;color:#6b7280">Contact hotel</span>'
        }
        return '<div class="card"><div class="card-body"><div><p class="room-name">' + room.roomName + '</p><p class="room-meta"><span class="avail-badge' + (low ? ' low' : '') + '">' + availLabel + '</span></p></div><div class="rates">' + ratesHtml + '</div></div><div class="card-footer"><div class="lowest-price">From <strong>' + fmt(room.lowestRate, currency) + '</strong><br><span style="font-size:11px">per night</span></div>' + btnHtml + '</div></div>'
      }).join('')

      if (extCfg && extCfg.needsSolutionId) {
        app.querySelectorAll('button.book-btn[data-room-idx]').forEach(function(btn) {
          var idx = parseInt(btn.getAttribute('data-room-idx') ?? '0', 10)
          var room = rooms[idx]
          if (room) btn.addEventListener('click', function() { resolveAndOpen(btn, room, meta) })
        })
      }
    }
```

- [ ] **Step 3: Run full API test suite**

```bash
cd /home/nir/ibe
npx vitest run apps/api/src 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/mcp.route.ts
git commit -m "feat: widget uses async 2-stage resolve when bookingTemplate requires {solutionId}"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd /home/nir/ibe
npx vitest run 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3: Confirm public route requires no auth**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/v1/public/external-ibe/resolve \
  -H 'Content-Type: application/json' \
  -d '{"propertyId":999999,"checkIn":"2024-06-01","checkOut":"2024-06-07"}'
```

Expected: `404` (not `401`).

---

## Self-Review

**Spec coverage:**
- ✅ Shared Playwright infra in `playwright-browser.service.ts` — used by OTA scraper + external IBE scraper
- ✅ 2-stage flow: scrape search page → extract solutionId → build final URL
- ✅ Channels: MCP `create_booking_link` + widget (`widgetEnabled`); affiliate excluded
- ✅ Fallback to search URL on scrape failure or no match
- ✅ Match strategy: roomName hint → first found
- ✅ Generic regex derivation (no per-IBE-system coding)
- ✅ Widget: async UX (loading state, error fallback)

**Type consistency:**
- `withStealthPage<T>` in `playwright-browser.service.ts` — imported by `external-ibe-scraper.service.ts` and `ota-scraper.service.ts`
- `ScrapeBookingOptions` / `ScrapeBookingResult` in `external-ibe-scraper.service.ts`
- `ExternalIBEResolveRequest` / `ExternalIBEResolveResponse` in `packages/shared/src/types/external-ibe.ts`
- `buildExternalUrl` imported from `external-ibe.service.ts` (not duplicated)

**Mock target in tests:** `../playwright-browser.service.js` (not `playwright`) — correct because the scraper imports `withStealthPage`, not `chromium` directly.
