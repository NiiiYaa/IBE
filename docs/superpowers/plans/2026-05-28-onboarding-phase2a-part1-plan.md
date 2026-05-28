# Self-Onboarding Phase 2-A Part 1: Harvester Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SynXis IBE harvester end-to-end: stealth browser service, cancellation policy parser, URL resolver, harvester implementation, and wiring into the internal harvest route + wizard SSE executor.

**Architecture:** Plugin-style harvesters (`IbeHarvester` interface, `ibe-harvester-map.ts` registry). IBE URL resolver is a 2-tier pipeline: fast detection via `detectKnownIBE()` from `@ibe/shared`, then stealth browser with booking-button follower (up to 5 hops). SynXis search page is scrapeable; payment page is blocked by Kasada so taxes fall back to `tax-lookup.service.ts`.

**Tech Stack:** Playwright (chromium stealth), Vitest, TypeScript ESM, `@ibe/shared` (`detectKnownIBE`), `@ibe/onboarding-flows` (`HarvestedHotelData`, `HarvestedFee` etc.)

**Prerequisite:** Part 2 (`2026-05-28-onboarding-phase2a-part2-plan.md`) builds on top of this.

---

## Task 1: Playwright browser service + dependency

**Files:**
- Create: `apps/onboarding-api/src/services/playwright-browser.service.ts`
- Modify: `apps/onboarding-api/package.json`

- [ ] **Step 1: Add playwright to package.json**

In `apps/onboarding-api/package.json`, add to `"dependencies"`:
```json
"playwright": "^1.44.0"
```

- [ ] **Step 2: Install**
```bash
cd /home/nir/ibe && pnpm install
cd apps/onboarding-api && npx playwright install chromium
```

- [ ] **Step 3: Create the browser service**

Create `apps/onboarding-api/src/services/playwright-browser.service.ts` — exact copy from `apps/api`:

```typescript
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

export async function withStealthPage<T>(
  url: string,
  fn: (page: Page) => Promise<T>,
  options?: { navigationTimeout?: number; idleTimeout?: number },
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options?.navigationTimeout ?? 30000 });
    await page.waitForLoadState('networkidle', { timeout: options?.idleTimeout ?? 15000 }).catch(() => {});
    return await fn(page);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Type check**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm type-check 2>&1
```
Expected: no errors.

- [ ] **Step 5: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/package.json apps/onboarding-api/src/services/playwright-browser.service.ts
git commit -m "feat(onboarding): add playwright browser service to onboarding-api"
```

---

## Task 2: Cancellation policy parser (TDD)

**Files:**
- Create: `apps/onboarding-api/src/services/harvesters/cancellation-policy-parser.ts`
- Create: `apps/onboarding-api/src/services/__tests__/cancellation-policy-parser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/cancellation-policy-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseCancellationPolicy } from '../harvesters/cancellation-policy-parser.js';

describe('parseCancellationPolicy', () => {
  it('returns null for null input', () => {
    expect(parseCancellationPolicy(null)).toBeNull();
  });

  it('parses non-refundable', () => {
    expect(parseCancellationPolicy('Non-Refundable')).toEqual({ type: 'non_refundable' });
    expect(parseCancellationPolicy('Fully Non-Refundable')).toEqual({ type: 'non_refundable' });
    expect(parseCancellationPolicy('Non Refundable Rate')).toEqual({ type: 'non_refundable' });
  });

  it('parses free cancellation N days', () => {
    const result = parseCancellationPolicy('Free cancellation until 3 days before arrival');
    expect(result).toEqual({
      type: 'custom',
      deadlineDays: 3,
      noShowPenalty: { value: 100, chargeType: 'percent' },
      frames: [],
    });
  });

  it('parses free cancellation in hours (rounds up to days)', () => {
    const result = parseCancellationPolicy('Free cancellation until 48h before check-in');
    expect(result).toMatchObject({ type: 'custom', deadlineDays: 2 });
  });

  it('parses 72h as 3 days', () => {
    const result = parseCancellationPolicy('Cancel free until 72 hours before arrival');
    expect(result).toMatchObject({ type: 'custom', deadlineDays: 3 });
  });

  it('parses percentage penalty within N days', () => {
    const result = parseCancellationPolicy('50% charge if cancelled within 7 days');
    expect(result).toEqual({
      type: 'custom',
      deadlineDays: 7,
      noShowPenalty: { value: 100, chargeType: 'percent' },
      frames: [{ daysBeforeCheckin: 7, penaltyValue: 50, chargeType: 'percent' }],
    });
  });

  it('returns null for unrecognised text', () => {
    expect(parseCancellationPolicy('Best available rate')).toBeNull();
  });
});
```

- [ ] **Step 2: Run failing test**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/cancellation-policy-parser.test.ts 2>&1 | tail -8
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the parser**

Create `apps/onboarding-api/src/services/harvesters/cancellation-policy-parser.ts`:

```typescript
import type { HarvestedCancellationPolicy } from '@ibe/onboarding-flows';

export function parseCancellationPolicy(text: string | null): HarvestedCancellationPolicy | null {
  if (!text) return null;
  const t = text.trim();

  if (/non.?refundable|no.?refund/i.test(t)) {
    return { type: 'non_refundable' };
  }

  // "free cancellation until N days"
  const dayMatch = t.match(/free\s+cancel\w*\s+(?:until\s+)?(\d+)\s*day/i)
    ?? t.match(/cancel\w*\s+(?:free|no.?charge|no.?penalty)[^.]*?(\d+)\s*day/i);
  if (dayMatch) {
    return {
      type: 'custom',
      deadlineDays: parseInt(dayMatch[1]!),
      noShowPenalty: { value: 100, chargeType: 'percent' },
      frames: [],
    };
  }

  // "until Xh" — convert hours to days (ceil)
  const hourMatch = t.match(/(?:free\s+cancel\w*|cancel\w*\s+free)[^.]*?(\d+)\s*h(?:our)?s?/i);
  if (hourMatch) {
    return {
      type: 'custom',
      deadlineDays: Math.ceil(parseInt(hourMatch[1]!) / 24),
      noShowPenalty: { value: 100, chargeType: 'percent' },
      frames: [],
    };
  }

  // "N% charge if cancelled within X days"
  const penaltyMatch = t.match(/(\d+)%\s+(?:charge|penalty|fee)\s+if\s+cancel\w+\s+within\s+(\d+)\s*day/i);
  if (penaltyMatch) {
    const penaltyValue = parseInt(penaltyMatch[1]!);
    const deadlineDays = parseInt(penaltyMatch[2]!);
    return {
      type: 'custom',
      deadlineDays,
      noShowPenalty: { value: 100, chargeType: 'percent' },
      frames: [{ daysBeforeCheckin: deadlineDays, penaltyValue, chargeType: 'percent' }],
    };
  }

  return null;
}
```

- [ ] **Step 4: Run tests — expect all pass**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/cancellation-policy-parser.test.ts 2>&1 | tail -8
```
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/src/services/harvesters/cancellation-policy-parser.ts \
        apps/onboarding-api/src/services/__tests__/cancellation-policy-parser.test.ts
git commit -m "feat(onboarding): cancellation policy text parser"
```

---

## Task 3: IBE URL Resolver (TDD)

**Files:**
- Create: `apps/onboarding-api/src/services/ibe-resolver.service.ts`
- Create: `apps/onboarding-api/src/services/__tests__/ibe-resolver.service.test.ts`

Tier 1: `detectKnownIBE()` from `@ibe/shared`. Tier 2 (DB hostname registry) is deferred to Phase 2-B — skipped here. Tier 3: stealth browser with booking-button follower, max 5 hops.

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/ibe-resolver.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../playwright-browser.service.js', () => ({
  withStealthPage: vi.fn(),
}));

vi.mock('@ibe/shared', () => ({
  detectKnownIBE: vi.fn(),
}));

import { withStealthPage } from '../playwright-browser.service.js';
import { detectKnownIBE } from '@ibe/shared';
import { resolveIbeUrl } from '../ibe-resolver.service.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('resolveIbeUrl — Tier 1', () => {
  it('returns immediately when detectKnownIBE matches', async () => {
    vi.mocked(detectKnownIBE).mockReturnValue({
      name: 'Sabre SynXis',
      externalHotelId: 'HOTEL1',
      searchTemplate: 'https://be.synxis.com/?hotel=HOTEL1',
      bookingTemplate: 'https://be.synxis.com/?hotel=HOTEL1',
    });
    const result = await resolveIbeUrl('https://be.synxis.com/?hotel=HOTEL1&chain=ABC');
    expect(result).toEqual({ ibeName: 'Sabre SynXis', ibeUrl: 'https://be.synxis.com/?hotel=HOTEL1&chain=ABC', hotelId: 'HOTEL1' });
    expect(withStealthPage).not.toHaveBeenCalled();
  });
});

describe('resolveIbeUrl — Tier 3 browser', () => {
  it('launches browser when Tier 1 misses', async () => {
    vi.mocked(detectKnownIBE).mockReturnValue(null);
    vi.mocked(withStealthPage).mockResolvedValue(null);
    const result = await resolveIbeUrl('https://grandhotel.com');
    expect(withStealthPage).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  it('returns resolved IBE found via booking button href', async () => {
    // First call (direct URL): no match
    vi.mocked(detectKnownIBE).mockReturnValueOnce(null);
    // Second call (on href): match
    vi.mocked(detectKnownIBE).mockReturnValueOnce({
      name: 'Sabre SynXis',
      externalHotelId: 'HOTEL1',
      searchTemplate: 'https://reservations.grandhotel.com/?hotel=HOTEL1',
      bookingTemplate: 'https://reservations.grandhotel.com/?hotel=HOTEL1',
    });

    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        url: () => 'https://grandhotel.com',
        waitForTimeout: vi.fn(),
        evaluate: vi.fn().mockResolvedValue(['https://reservations.grandhotel.com/?hotel=HOTEL1&chain=ABC']),
        goto: vi.fn(),
      };
      return fn(mockPage as any);
    });

    const result = await resolveIbeUrl('https://grandhotel.com');
    expect(result).toMatchObject({ ibeName: 'Sabre SynXis', hotelId: 'HOTEL1' });
  });
});
```

- [ ] **Step 2: Run failing test**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/ibe-resolver.service.test.ts 2>&1 | tail -8
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the resolver**

Create `apps/onboarding-api/src/services/ibe-resolver.service.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests — expect pass**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/ibe-resolver.service.test.ts 2>&1 | tail -8
```
Expected: 3 tests PASS.

- [ ] **Step 5: Type check**
```bash
pnpm type-check 2>&1
```
Expected: no errors.

- [ ] **Step 6: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/src/services/ibe-resolver.service.ts \
        apps/onboarding-api/src/services/__tests__/ibe-resolver.service.test.ts
git commit -m "feat(onboarding): IBE URL resolver (Tier 1 + browser booking-button follower)"
```

---

## Task 4: SynXis DOM Investigation

**Files:**
- Create (temp, not committed): `/tmp/synxis-investigate.ts`

Before implementing the harvester you must discover the real SynXis DOM selectors. This task runs a Playwright script against a live SynXis hotel and documents the findings.

- [ ] **Step 1: Find a real SynXis hotel URL**

SynXis URLs match the pattern: `/?hotel=XXXXX&chain=YYYYY&arrive=...&depart=...`  
White-labeled examples: `reservations.{hotel}.com/?chain=...&hotel=...`

To confirm a URL is SynXis, check it has `chain=` AND `hotel=` params, or has `sbe_rc` param, or the DuckDuckGo fingerprint matches.

Example test URL (use any real SynXis hotel you know):
```
https://be.synxis.com/?hotel=REPLACEME&chain=REPLACEME&arrive=2026-07-01&depart=2026-07-02&adult=2&child=0&rooms=1&level=hotel&locale=en-US&currency=USD
```

- [ ] **Step 2: Run the investigation script**

Create `/tmp/synxis-investigate.ts`:

```typescript
// Run: cd /home/nir/ibe/apps/onboarding-api && node --import tsx/esm /tmp/synxis-investigate.ts

import { chromium } from 'playwright';

const TEST_URL = 'REPLACE_WITH_REAL_SYNXIS_URL';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

console.log('Navigating to:', TEST_URL);
await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

// Find repeating room-card elements
const roomCards = await page.evaluate(() => {
  const results: Array<{ selector: string; count: number; sampleText: string }> = [];
  const testSelectors = [
    '[data-testid*="room"]', '[data-testid*="rate"]', '[data-testid*="product"]',
    '[class*="room"]', '[class*="Room"]', '[class*="rate"]', '[class*="Rate"]',
    '[class*="accommodation"]', '.result', '[class*="Result"]',
  ];
  for (const sel of testSelectors) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      results.push({ selector: sel, count: els.length, sampleText: (els[0] as HTMLElement).innerText?.slice(0, 120) ?? '' });
    }
  }
  return results;
});
console.log('\n=== ROOM CARD CANDIDATES ===');
roomCards.forEach(r => console.log(`  ${r.selector} (${r.count} found): "${r.sampleText}"`));

// Find board type / meal plan labels
const boardLabels = await page.evaluate(() => {
  const labels: string[] = [];
  document.querySelectorAll('*').forEach(el => {
    const text = (el as HTMLElement).innerText?.trim() ?? '';
    if (/\b(room only|bed.?breakfast|half board|full board|all inclusive|non.?refundable|free cancel|flexible)\b/i.test(text)
      && text.length < 80 && el.children.length === 0) {
      labels.push(`<${el.tagName} class="${el.className.slice(0, 60)}"> "${text}"`);
    }
  });
  return [...new Set(labels)].slice(0, 30);
});
console.log('\n=== BOARD/CANCEL LABELS ===');
boardLabels.forEach(l => console.log(' ', l));

// Find hotel name + star rating
const hotelInfo = await page.evaluate(() => {
  const h1s = Array.from(document.querySelectorAll('h1')).map(h => `<h1> "${h.innerText.trim()}"`);
  const stars = Array.from(document.querySelectorAll('[class*="star"], [aria-label*="star"]')).slice(0, 3)
    .map(el => `class="${el.className.slice(0, 60)}" aria="${el.getAttribute('aria-label')}"`);
  return { h1s, stars };
});
console.log('\n=== HOTEL INFO ===', hotelInfo);

await browser.close();
console.log('\nDone. Update SYNXIS_SELECTORS in synxis-harvester.ts with findings above.');
```

Run it:
```bash
cd /home/nir/ibe/apps/onboarding-api && node --import tsx/esm /tmp/synxis-investigate.ts 2>&1
```

- [ ] **Step 3: Document findings**

After running, record the actual selectors in a comment block at the top of `synxis-harvester.ts` (created in Task 5). The next task provides placeholder selectors — update them to match what the investigation found.

---

## Task 5: SynXis Harvester

**Files:**
- Create: `apps/onboarding-api/src/services/harvesters/synxis-harvester.ts`
- Create: `apps/onboarding-api/src/services/__tests__/synxis-harvester.test.ts`

**Important:** Update `SYNXIS_SELECTORS` constants at the top of the file using findings from Task 4 before running tests.

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/synxis-harvester.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../playwright-browser.service.js', () => ({
  withStealthPage: vi.fn(),
}));
vi.mock('../tax-lookup.service.js', () => ({
  lookupTaxes: vi.fn().mockReturnValue([{ name: 'VAT', amount: '9%', notes: null, source: 'lookup' }]),
}));
vi.mock('@ibe/shared', () => ({
  detectKnownIBE: vi.fn().mockReturnValue({
    name: 'Sabre SynXis',
    externalHotelId: 'HOTEL1',
    searchTemplate: (url: string) => `${new URL(url).origin}/?adult={adults}&arrive={checkIn}&chain=ABC&child=0&depart={checkOut}&hotel=HOTEL1&level=hotel&locale=en-US`,
    bookingTemplate: (url: string) => `${new URL(url).origin}/?adult={adults}&arrive={checkIn}&chain=ABC`,
  }),
}));

import { withStealthPage } from '../playwright-browser.service.js';
import { SynXisHarvester } from '../harvesters/synxis-harvester.js';

const mockPage = (rooms: Array<{ name: string; boardLabels: string[] }>) => ({
  url: () => 'https://be.synxis.com/?hotel=HOTEL1&chain=ABC&arrive=2026-07-01&depart=2026-07-02&adult=2&child=0',
  waitForSelector: vi.fn(),
  waitForTimeout: vi.fn(),
  goto: vi.fn(),
  evaluate: vi.fn().mockImplementation((fn: Function) => {
    // Return mock room data for each page.evaluate() call
    return Promise.resolve(rooms.map(r => ({
      name: r.name,
      description: 'A comfortable room',
      images: ['https://example.com/img.jpg'],
      bedConfiguration: '1 King bed',
      amenities: ['WiFi'],
      rateOptions: r.boardLabels.map(label => ({
        boardLabel: label,
        cancelText: label.includes('Non') ? 'Non-Refundable' : 'Free cancellation until 3 days before',
        price: '150',
      })),
    })));
  }),
  $: vi.fn().mockResolvedValue(null),
  $$: vi.fn().mockResolvedValue([]),
  title: vi.fn().mockResolvedValue('Grand Hotel'),
});

beforeEach(() => { vi.clearAllMocks(); });

describe('SynXisHarvester.harvest', () => {
  it('returns HarvestedHotelData with rooms and rate plan types', async () => {
    const rooms = [
      { name: 'Standard Double', boardLabels: ['Bed & Breakfast', 'Non-Refundable'] },
      { name: 'Superior King', boardLabels: ['Room Only', 'Bed & Breakfast'] },
    ];

    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => fn(mockPage(rooms) as any));

    const harvester = new SynXisHarvester();
    const result = await harvester.harvest(
      'https://be.synxis.com/?hotel=HOTEL1&chain=ABC',
      { checkIn: '2026-07-01', checkOut: '2026-07-02' },
      vi.fn()
    );

    expect(result.rooms.length).toBeGreaterThan(0);
    expect(result.discoveredRatePlanTypes.length).toBeGreaterThan(0);
    const bb = result.discoveredRatePlanTypes.find(r => r.boardCode === 'BB');
    expect(bb).toBeDefined();
    expect(result.taxesAndFees[0]?.source).toBe('lookup');
  });

  it('deduplicates rooms seen in multiple passes', async () => {
    const rooms = [{ name: 'Standard Double', boardLabels: ['Room Only'] }];
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => fn(mockPage(rooms) as any));

    const harvester = new SynXisHarvester();
    const result = await harvester.harvest(
      'https://be.synxis.com/?hotel=HOTEL1&chain=ABC',
      { checkIn: '2026-07-01', checkOut: '2026-07-02' },
      vi.fn()
    );

    const names = result.rooms.map(r => r.name);
    expect(new Set(names).size).toBe(names.length); // no duplicates
  });
});
```

- [ ] **Step 2: Run failing test**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/synxis-harvester.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the harvester**

Create `apps/onboarding-api/src/services/harvesters/synxis-harvester.ts`:

```typescript
import { detectKnownIBE } from '@ibe/shared';
import { withStealthPage } from '../playwright-browser.service.js';
import { lookupTaxes } from '../tax-lookup.service.js';
import { parseCancellationPolicy } from './cancellation-policy-parser.js';
import type {
  HarvestedHotelData, HarvestedRoom, DiscoveredRatePlanType, HarvestedOccupancy,
} from '@ibe/onboarding-flows';
import type { IbeHarvester, HarvestContext } from './types.js';

// ── Selector constants — update with findings from Task 4 DOM investigation ──
const SELECTORS = {
  roomCard:       '[data-testid*="room"], [class*="RoomCard"], [class*="room-card"]',
  roomName:       '[data-testid*="room-name"], [class*="RoomName"], h3, h4',
  roomDesc:       '[data-testid*="room-desc"], [class*="RoomDesc"], [class*="description"] p',
  roomImage:      'img[src*="images"], img[src*="photo"], img[src*="room"]',
  rateOption:     '[data-testid*="rate"], [class*="RateOption"], [class*="rate-item"]',
  boardLabel:     '[data-testid*="board"], [class*="BoardType"], [class*="meal-plan"]',
  cancelText:     '[data-testid*="cancel"], [class*="CancelPolicy"], [class*="refund"]',
  hotelName:      '[data-testid*="hotel-name"], [class*="PropertyName"], h1',
  amenityItem:    '[data-testid*="amenity"], [class*="Amenity"], [class*="amenity"] li',
};

const BOARD_NORM: Record<string, DiscoveredRatePlanType['boardCode']> = {
  'room only': 'RO', 'no meals': 'RO', 'accommodation only': 'RO', 'bed only': 'RO',
  'bed & breakfast': 'BB', 'bed and breakfast': 'BB', 'b&b': 'BB', 'breakfast included': 'BB',
  'half board': 'HB', 'half-board': 'HB', 'demi-pension': 'HB',
  'full board': 'FB', 'full-board': 'FB', 'all meals': 'FB',
  'all inclusive': 'AI', 'all-inclusive': 'AI',
};

function normaliseBoard(label: string): DiscoveredRatePlanType['boardCode'] | null {
  const key = label.toLowerCase().trim();
  for (const [pattern, code] of Object.entries(BOARD_NORM)) {
    if (key.includes(pattern)) return code;
  }
  return null;
}

// Occupancy search patterns: [adults, children, childAge]
const OCCUPANCY_PATTERNS: [number, number, number][] = [
  [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0],
  [2, 1, 8], [2, 2, 8],
];

const DATE_WINDOWS = [7, 30]; // days from today

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildUrl(template: string, hotelId: string, adults: number, children: number, childAge: number, checkIn: string, checkOut: string): string {
  let url = template
    .replace('{externalHotelId}', hotelId)
    .replace('{adults}', String(adults))
    .replace('{checkIn}', checkIn)
    .replace('{checkOut}', checkOut)
    .replace('{currency}', 'USD')
    .replace('child=0', `child=${children}`);
  if (children > 0) url += `&childAge[]=${childAge}`.repeat(children);
  return url;
}

interface RawRateOption { boardLabel: string; cancelText: string; price: string }
interface RawRoomCard {
  name: string; description: string; images: string[];
  bedConfiguration: string; amenities: string[]; rateOptions: RawRateOption[];
}

export class SynXisHarvester implements IbeHarvester {
  async harvest(ibeUrl: string, ctx: HarvestContext, onProgress: (m: string) => void): Promise<HarvestedHotelData> {
    const detected = detectKnownIBE(ibeUrl);
    if (!detected) throw new Error('Not a SynXis URL');
    const template = typeof detected.searchTemplate === 'function'
      ? detected.searchTemplate(ibeUrl)
      : detected.searchTemplate;
    const hotelId = detected.externalHotelId;

    onProgress('Extracting hotel info...');
    const hotelInfo = await this.extractHotelInfo(template, hotelId, ctx);

    onProgress('Discovering rooms and rate plans...');
    const roomsMap = new Map<string, HarvestedRoom>();
    const ratePlanMap = new Map<string, DiscoveredRatePlanType>();

    for (const offsetDays of DATE_WINDOWS) {
      const checkIn = addDays(offsetDays);
      const checkOut = addDays(offsetDays + 1);
      let newRoomsInWindow = 0;
      let consecutiveEmpty = 0;

      for (const [adults, children, childAge] of OCCUPANCY_PATTERNS) {
        const url = buildUrl(template, hotelId, adults, children, childAge, checkIn, checkOut);
        onProgress(`Searching ${adults}A${children > 0 ? `+${children}C` : ''} (${offsetDays}d out)...`);

        const cards = await this.scrapeRoomCards(url, adults, children);
        let foundNew = false;

        for (const card of cards) {
          if (!roomsMap.has(card.name)) {
            foundNew = true;
            newRoomsInWindow++;
            roomsMap.set(card.name, {
              name: card.name, description: card.description,
              images: card.images, bedConfiguration: card.bedConfiguration || null,
              amenities: card.amenities,
              supportedOccupancies: [{ adults, children }],
              maxAdults: adults, maxOccupancy: adults + children,
            });
          } else {
            // Update occupancies on existing room
            const existing = roomsMap.get(card.name)!;
            const occ: HarvestedOccupancy = { adults, children };
            if (!existing.supportedOccupancies.some(o => o.adults === adults && o.children === children)) {
              existing.supportedOccupancies.push(occ);
              existing.maxAdults = Math.max(existing.maxAdults ?? 0, adults);
              existing.maxOccupancy = Math.max(existing.maxOccupancy ?? 0, adults + children);
            }
          }

          for (const rate of card.rateOptions) {
            const boardCode = normaliseBoard(rate.boardLabel);
            if (!boardCode) continue;
            const isNR = /non.?refund/i.test(rate.cancelText);
            const key = `${boardCode}:${isNR ? 'NR' : 'R'}`;
            if (!ratePlanMap.has(key)) {
              ratePlanMap.set(key, {
                boardCode, boardCodeRawName: rate.boardLabel,
                hasRefundable: !isNR, hasNonRefundable: isNR,
                refundableCancellationPolicy: isNR ? null : parseCancellationPolicy(rate.cancelText),
                refundableExampleName: isNR ? null : rate.boardLabel,
                nonRefundableExampleName: isNR ? rate.boardLabel : null,
              });
            } else {
              const existing = ratePlanMap.get(key)!;
              if (!isNR) existing.hasRefundable = true;
              else existing.hasNonRefundable = true;
            }
          }
        }

        if (!foundNew) consecutiveEmpty++;
        else consecutiveEmpty = 0;
        if (consecutiveEmpty >= 3) break; // early-stop
      }
    }

    onProgress('Running age sweep...');
    const agePolicy = await this.runAgeSweep(template, hotelId, ctx);

    onProgress('Looking up taxes...');
    const taxesAndFees = lookupTaxes(hotelInfo.country ?? '', hotelInfo.city ?? '');

    return {
      ...hotelInfo,
      rooms: Array.from(roomsMap.values()),
      discoveredRatePlanTypes: Array.from(ratePlanMap.values()),
      agePolicy,
      taxesAndFees,
    };
  }

  private async extractHotelInfo(template: string, hotelId: string, ctx: HarvestContext): Promise<Omit<HarvestedHotelData, 'rooms' | 'discoveredRatePlanTypes' | 'agePolicy' | 'taxesAndFees'>> {
    const url = buildUrl(template, hotelId, 2, 0, 0, ctx.checkIn, ctx.checkOut);
    return withStealthPage(url, async (page) => {
      await page.waitForTimeout(3000);
      return page.evaluate((sel: typeof SELECTORS) => {
        const name = document.querySelector(sel.hotelName)?.textContent?.trim() ?? '';
        const images = Array.from(document.querySelectorAll(sel.roomImage) as NodeListOf<HTMLImageElement>)
          .map(img => img.src).filter(s => s.startsWith('http')).slice(0, 10);
        const amenities = Array.from(document.querySelectorAll(sel.amenityItem))
          .map(el => (el as HTMLElement).textContent?.trim() ?? '').filter(Boolean).slice(0, 20);
        // Try to get address from meta or structured data
        const address = document.querySelector('[itemprop="streetAddress"]')?.textContent?.trim()
          ?? document.querySelector('[class*="address"], [class*="Address"]')?.textContent?.trim()
          ?? null;
        return {
          name, starRating: null, address, city: null, country: null,
          phone: null, email: null, website: null,
          description: document.querySelector('[class*="description"], [class*="Description"]')
            ?.textContent?.trim()?.slice(0, 500) ?? '',
          images, amenities, policies: [],
        };
      }, SELECTORS);
    });
  }

  private async scrapeRoomCards(url: string, adults: number, children: number): Promise<RawRoomCard[]> {
    try {
      return withStealthPage(url, async (page) => {
        await page.waitForSelector(SELECTORS.roomCard, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2000);
        return page.evaluate((sel: typeof SELECTORS): RawRoomCard[] => {
          return Array.from(document.querySelectorAll(sel.roomCard)).map(card => ({
            name: card.querySelector(sel.roomName)?.textContent?.trim() ?? 'Unknown Room',
            description: card.querySelector(sel.roomDesc)?.textContent?.trim() ?? '',
            images: Array.from(card.querySelectorAll(sel.roomImage) as NodeListOf<HTMLImageElement>)
              .map(img => img.src).filter(s => s.startsWith('http')),
            bedConfiguration: (card as HTMLElement).innerText?.match(/\d+\s+(king|queen|twin|single|double)\s+bed/i)?.[0] ?? '',
            amenities: [],
            rateOptions: Array.from(card.querySelectorAll(sel.rateOption)).map(rate => ({
              boardLabel: rate.querySelector(sel.boardLabel)?.textContent?.trim() ?? '',
              cancelText: rate.querySelector(sel.cancelText)?.textContent?.trim() ?? '',
              price: rate.querySelector('[class*="price"], [class*="Price"]')?.textContent?.trim() ?? '',
            })),
          })).filter(r => r.name !== 'Unknown Room' && r.rateOptions.length > 0);
        }, sel);
      }, { navigationTimeout: 20000 });
    } catch {
      return []; // navigation errors treated as empty — early-stop kicks in
    }
  }

  private async runAgeSweep(template: string, hotelId: string, ctx: HarvestContext) {
    const basePrices: number[] = [];
    for (let age = 0; age <= 17; age++) {
      const url = buildUrl(template, hotelId, 2, 1, age, ctx.checkIn, ctx.checkOut);
      try {
        const price = await withStealthPage(url, async (page) => {
          await page.waitForTimeout(2000);
          return page.evaluate(() => {
            const priceEl = document.querySelector('[class*="total"], [class*="Total"], [class*="price"]');
            const text = priceEl?.textContent?.replace(/[^0-9.]/g, '') ?? '';
            return text ? parseFloat(text) : null;
          }) as Promise<number | null>;
        });
        basePrices.push(price ?? 0);
      } catch {
        basePrices.push(0);
      }
    }

    // Find age boundaries where price changes
    const categories = [];
    let bracketStart = 0;
    for (let i = 1; i <= 17; i++) {
      const prev = basePrices[i - 1] ?? 0;
      const curr = basePrices[i] ?? 0;
      const changed = prev > 0 && curr > 0 && Math.abs(curr - prev) / prev > 0.05;
      if (changed || i === 17) {
        categories.push({ name: i === 17 ? 'Child' : `Child (${bracketStart}-${i - 1})`, minAge: bracketStart, maxAge: i - 1 });
        bracketStart = i;
      }
    }
    if (categories.length === 0) return null;

    return {
      categories,
      hasTieredChildPricing: categories.length > 1,
      source: 'price_sweep' as const,
      rawText: null,
    };
  }
}
```

- [ ] **Step 4: Create the harvester types file**

Create `apps/onboarding-api/src/services/harvesters/types.ts`:

```typescript
import type { HarvestedHotelData } from '@ibe/onboarding-flows';

export interface HarvestContext {
  checkIn: string;  // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
}

export interface IbeHarvester {
  harvest(
    ibeUrl: string,
    ctx: HarvestContext,
    onProgress: (message: string) => void,
  ): Promise<HarvestedHotelData>;
}
```

- [ ] **Step 5: Run tests — expect pass**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/synxis-harvester.test.ts 2>&1 | tail -10
```
Expected: 2 tests PASS.

- [ ] **Step 6: Type check**
```bash
pnpm type-check 2>&1
```
Expected: no errors.

- [ ] **Step 7: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/src/services/harvesters/
git commit -m "feat(onboarding): SynXis Playwright harvester with multi-pass occupancy search"
```

---

## Task 6: IBE Harvester service + map

**Files:**
- Create: `apps/onboarding-api/src/services/ibe-harvester-map.ts`
- Create: `apps/onboarding-api/src/services/ibe-harvester.service.ts`
- Create: `apps/onboarding-api/src/services/__tests__/ibe-harvester.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/ibe-harvester.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./ibe-resolver.service.js', () => ({
  resolveIbeUrl: vi.fn(),
}));

import { resolveIbeUrl } from '../ibe-resolver.service.js';
import { harvestFromUrl } from '../ibe-harvester.service.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('harvestFromUrl', () => {
  it('throws when IBE cannot be resolved', async () => {
    vi.mocked(resolveIbeUrl).mockResolvedValue(null);
    await expect(harvestFromUrl('https://unknown.com', vi.fn())).rejects.toThrow('unresolved');
  });

  it('throws when no harvester registered for the IBE', async () => {
    vi.mocked(resolveIbeUrl).mockResolvedValue({
      ibeName: 'UnknownIBE', ibeUrl: 'https://unknown.com', hotelId: null,
    });
    await expect(harvestFromUrl('https://unknown.com', vi.fn())).rejects.toThrow('No harvester');
  });
});
```

- [ ] **Step 2: Run failing test**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/ibe-harvester.service.test.ts 2>&1 | tail -8
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the harvester map**

Create `apps/onboarding-api/src/services/ibe-harvester-map.ts`:

```typescript
import type { IbeHarvester } from './harvesters/types.js';
import { SynXisHarvester } from './harvesters/synxis-harvester.js';

export const ibeHarvesterMap = new Map<string, IbeHarvester>([
  ['Sabre SynXis', new SynXisHarvester()],
]);
```

- [ ] **Step 4: Create the harvester orchestrator**

Create `apps/onboarding-api/src/services/ibe-harvester.service.ts`:

```typescript
import type { HarvestedHotelData } from '@ibe/onboarding-flows';
import { resolveIbeUrl } from './ibe-resolver.service.js';
import { ibeHarvesterMap } from './ibe-harvester-map.js';

function dummyDates(): { checkIn: string; checkOut: string } {
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + 30);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 1);
  return {
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
  };
}

export async function harvestFromUrl(
  rawUrl: string,
  onProgress: (msg: string) => void,
): Promise<HarvestedHotelData> {
  onProgress('Identifying booking engine...');
  const resolved = await resolveIbeUrl(rawUrl);
  if (!resolved) throw new Error('IBE URL unresolved — could not identify booking engine');

  const harvester = ibeHarvesterMap.get(resolved.ibeName);
  if (!harvester) throw new Error(`No harvester registered for IBE: ${resolved.ibeName}`);

  onProgress(`Detected: ${resolved.ibeName}. Starting harvest...`);
  return harvester.harvest(resolved.ibeUrl, dummyDates(), onProgress);
}
```

- [ ] **Step 5: Run tests — expect pass**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/ibe-harvester.service.test.ts 2>&1 | tail -8
```
Expected: 2 tests PASS.

- [ ] **Step 6: Type check**
```bash
pnpm type-check 2>&1
```
Expected: no errors.

- [ ] **Step 7: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/src/services/ibe-harvester-map.ts \
        apps/onboarding-api/src/services/ibe-harvester.service.ts \
        apps/onboarding-api/src/services/__tests__/ibe-harvester.service.test.ts
git commit -m "feat(onboarding): IBE harvester map + orchestrator service"
```

---

## Task 7: Wire harvest into routes

**Files:**
- Modify: `apps/onboarding-api/src/routes/internal.route.ts`
- Modify: `apps/onboarding-api/src/services/step-executor.service.ts`

### Part A — internal.route.ts

- [ ] **Step 1: Replace the null stub**

Edit `apps/onboarding-api/src/routes/internal.route.ts`. Replace the entire `setImmediate` block:

```typescript
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { harvestFromUrl } from '../services/ibe-harvester.service.js';

export async function internalRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    const secret = request.headers['x-internal-secret'];
    if (secret !== env.INTERNAL_API_SECRET) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.post<{ Body: { invitationId: number; ibeUrl: string } }>(
    '/internal/harvest',
    async (request, reply) => {
      const { invitationId, ibeUrl } = request.body;
      if (!invitationId || !ibeUrl) return reply.badRequest('invitationId and ibeUrl required');

      const callbackBase = process.env['IBE_API_CALLBACK_URL'] ?? 'http://localhost:3000';
      const secret = env.INTERNAL_API_SECRET;

      setImmediate(async () => {
        try {
          const harvestedData = await harvestFromUrl(ibeUrl, (msg) => {
            console.log(`[harvest:${invitationId}] ${msg}`);
          });
          await fetch(`${callbackBase}/internal/onboarding/harvest-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
            body: JSON.stringify({ invitationId, harvestedData }),
          });
        } catch (err: unknown) {
          const reason = err instanceof Error ? err.message : 'Unknown harvest error';
          await fetch(`${callbackBase}/internal/onboarding/harvest-failed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
            body: JSON.stringify({ invitationId, reason }),
          }).catch(() => {});
        }
      });

      return reply.code(202).send({ ok: true });
    }
  );
}
```

### Part B — step-executor.service.ts harvest_data case

- [ ] **Step 2: Add harvest_data case to step-executor**

In `apps/onboarding-api/src/services/step-executor.service.ts`, add the import at the top:

```typescript
import { harvestFromUrl } from './ibe-harvester.service.js';
```

Then add the `harvest_data` case inside the `try` block (after the existing `enrich_data` case):

```typescript
} else if (step.id === 'harvest_data') {
  if (!invitation.ibeUrl) throw new Error('No IBE URL on invitation — cannot harvest');
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  const harvestedData = await harvestFromUrl(
    invitation.ibeUrl,
    (msg: string) => sseEvent(reply, { type: 'progress', message: msg }),
  );

  await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: { harvestedData: harvestedData as any },
  });
  await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
  sseEvent(reply, { type: 'complete', stepId: step.id });
```

- [ ] **Step 3: Type check**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm type-check 2>&1
```
Expected: no errors.

- [ ] **Step 4: Run all tests**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run 2>&1 | tail -12
```
Expected: all tests pass.

- [ ] **Step 5: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/src/routes/internal.route.ts \
        apps/onboarding-api/src/services/step-executor.service.ts
git commit -m "feat(onboarding): wire SynXis harvester into internal route + wizard SSE executor"
```

---

## Task 8: Session init — auto-complete ari_source_selection when pmsId known

**Files:**
- Modify: `apps/onboarding-api/src/services/session.service.ts`

The `defaultStepsFor('blank')` now includes an `ari_source_selection` step. For staff invitations, `invitation.pmsId` is already set — the hotel doesn't need to pick their CM. The session initialiser must mark this step completed automatically.

- [ ] **Step 1: Update the test**

In `apps/onboarding-api/src/services/__tests__/session.service.test.ts`, add to the `initSession` suite:

```typescript
it('auto-completes ari_source_selection when pmsId is already set', async () => {
  vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue({
    id: 1, revokedAt: null, usedAt: null,
    expiresAt: futureDate,
    pmsId: 3, pmsName: 'SiteMinder', organizationId: 5,
    harvestStatus: 'pending', harvestedData: null,
    session: null,
  } as any);
  vi.mocked(prisma.onboardingInvitation.update).mockResolvedValue({} as any);
  vi.mocked(prisma.onboardingSession.create).mockResolvedValue({ id: 42 } as any);

  await initSession('valid-token');

  const createCall = vi.mocked(prisma.onboardingSession.create).mock.calls[0]![0];
  const steps = createCall.data.stepsJson as Array<{ id: string; status: string }>;
  const ariStep = steps.find(s => s.id === 'ari_source_selection');
  expect(ariStep?.status).toBe('completed');
});
```

- [ ] **Step 2: Run failing test**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/session.service.test.ts 2>&1 | tail -10
```
Expected: 1 new test FAIL (ari_source_selection not auto-completed yet).

- [ ] **Step 3: Update initSession**

In `apps/onboarding-api/src/services/session.service.ts`, update the `initialSteps` mapping inside `initSession`:

```typescript
const initialSteps = flow.steps.map((s) => {
  const isHarvestStep = s.kind === 'automated' && s.id === 'harvest_data';
  const isSearchStep = s.id === 'candidate_search';
  const isAriSelection = s.id === 'ari_source_selection';
  // ari_source_selection is auto-completed when pmsId was set by staff upfront
  const pmsAlreadyKnown = invitation.pmsId != null;
  if (hasPreHarvestedData && (isHarvestStep || isSearchStep)) {
    return { ...s, status: 'completed' };
  }
  if (pmsAlreadyKnown && isAriSelection) {
    return { ...s, status: 'completed' };
  }
  return { ...s, status: 'pending' };
});
```

- [ ] **Step 4: Run all session tests — expect pass**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/session.service.test.ts 2>&1 | tail -8
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/src/services/session.service.ts \
        apps/onboarding-api/src/services/__tests__/session.service.test.ts
git commit -m "fix(onboarding): auto-complete ari_source_selection step when pmsId already known"
```

---

## Verification

After all 8 tasks:

```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run 2>&1 | tail -10
pnpm type-check 2>&1
```

Expected: all tests pass, no type errors.

**Continue with:** `docs/superpowers/plans/2026-05-28-onboarding-phase2a-part2-plan.md`
