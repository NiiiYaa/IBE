# Robust IBE Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the booking engine resolver work for non-English sites, button-driven navigation, iframes, and cookie-consent-blocked pages.

**Architecture:** Three layered additions: (1) cookie consent bypass in `withStealthPage` shared utility, (2) `collectBookingCandidates` replaces the current `<a href>`-only scan with a multi-source fast pass, (3) `clickAndObserve` fallback clicks the best booking-intent element when fast scan finds nothing.

**Tech Stack:** Playwright, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-05-30-robust-ibe-resolver-design.md`

---

## File Map

| File | Change |
|------|--------|
| `apps/onboarding-api/src/services/playwright-browser.service.ts` | Add `dismissCookieConsent(page)` + call it inside `withStealthPage` after networkidle |
| `apps/onboarding-api/src/services/ibe-resolver.service.ts` | Replace `<a href>` scan with `collectBookingCandidates`; add `BOOKING_URL_RE`; expand `BOOKING_TEXT_RE`; add `clickAndObserve` |
| `apps/onboarding-api/src/services/__tests__/ibe-resolver.service.test.ts` | Add tests for new candidate collection sources and click fallback |

---

## Task 1: Cookie consent bypass in `withStealthPage`

**Files:**
- Modify: `apps/onboarding-api/src/services/playwright-browser.service.ts`
- Test: `apps/onboarding-api/src/services/__tests__/ibe-resolver.service.test.ts` (integration — verified manually)

- [ ] **Step 1: Add `dismissCookieConsent` helper after the `STEALTH_SCRIPT` constant**

Open `apps/onboarding-api/src/services/playwright-browser.service.ts` and add this after the `STEALTH_SCRIPT` constant (after line 24):

```typescript
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
```

- [ ] **Step 2: Pre-seed consent cookies before navigation**

In `withStealthPage`, add pre-seeding inside `newContext` after `addInitScript`. Replace:

```typescript
    await context.addInitScript(STEALTH_SCRIPT);
    const page = await context.newPage();
    options?.beforeNavigate?.(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options?.navigationTimeout ?? 30000 });
```

With:

```typescript
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
```

- [ ] **Step 3: Call `dismissCookieConsent` after networkidle**

In `withStealthPage`, after the `waitForLoadState` call, add:

```typescript
    await page.waitForLoadState('networkidle', { timeout: options?.idleTimeout ?? 15000 }).catch(() => {});
    await dismissCookieConsent(page);
    return await fn(page);
```

- [ ] **Step 4: Type-check**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/onboarding-api tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git -C /home/nir/ibe add apps/onboarding-api/src/services/playwright-browser.service.ts
git -C /home/nir/ibe commit -m "feat(onboarding): cookie consent bypass in withStealthPage"
```

---

## Task 2: Expand booking-intent signals — regex + URL pattern

**Files:**
- Modify: `apps/onboarding-api/src/services/ibe-resolver.service.ts` (lines 26-27)

- [ ] **Step 1: Replace `BOOKING_TEXT_RE` and add `BOOKING_URL_RE`**

Replace lines 26-27 in `apps/onboarding-api/src/services/ibe-resolver.service.ts`:

```typescript
const BOOKING_TEXT_RE = /book(?:ing|now)?|r[eé]serv(?:e|er|ation|ations|ar|are|ieren)?|check.?avail|rooms?.?rates?|availab(?:il)?it|prenot(?:a|are|azione)?|buchen?|beschikbaar|reserveren|tarif(?:fs?|aux)?|disponib(?:il)?it|бронир|забронир|预订|预定|訂房|予約|예약|จอง|rezerv(?:asyon|ation)?|foglal(?:ás|jon)?|rezerv(?:ace|ovat)?|kr[aá]tit|κράτηση|הזמנה|rezerv(?:are|ați)?|boka|bestill/iu

// URL path patterns — detect booking links regardless of button text (e.g. icon buttons)
const BOOKING_URL_RE = /\/book(?:ing|-now|-online)?(?:\/|$|\?)|\/reserv(?:e|ation|ations?|ar)?(?:\/|$|\?)|\/check.?avail|\/rates?(?:\/|$|\?)|\/rooms?(?:\/|$|\?)|\/availability(?:\/|$|\?)|\/tarif(?:fs?|aux)?(?:\/|$|\?)|\/prenot|\/buchen|booking-engine|reservation-engine|\/accommodation(?:\/|$|\?)/i
```

- [ ] **Step 2: Type-check**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/onboarding-api tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git -C /home/nir/ibe add apps/onboarding-api/src/services/ibe-resolver.service.ts
git -C /home/nir/ibe commit -m "feat(onboarding): multilingual booking regex + URL pattern matching"
```

---

## Task 3: `collectBookingCandidates` — multi-source fast scan

**Files:**
- Modify: `apps/onboarding-api/src/services/ibe-resolver.service.ts`
- Test: `apps/onboarding-api/src/services/__tests__/ibe-resolver.service.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `apps/onboarding-api/src/services/__tests__/ibe-resolver.service.test.ts`:

```typescript
describe('resolveIbeUrl — multi-source candidate collection', () => {
  it('finds IBE via <button data-href>', async () => {
    vi.mocked(detectKnownIBE).mockReturnValueOnce(null) // initial URL
    vi.mocked(detectKnownIBE).mockReturnValueOnce({
      name: 'Profitroom',
      externalHotelId: 'HOTEL1',
      searchTemplate: 'https://booking.profitroom.com/HOTEL1',
      bookingTemplate: 'https://booking.profitroom.com/HOTEL1',
    })
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        url: () => 'https://hotel.com',
        waitForTimeout: vi.fn(),
        goto: vi.fn(),
        evaluate: vi.fn().mockResolvedValue(['https://booking.profitroom.com/HOTEL1']),
        $: vi.fn().mockResolvedValue(null),
        $$: vi.fn().mockResolvedValue([]),
        waitForNavigation: vi.fn().mockRejectedValue(new Error('timeout')),
        context: () => ({ waitForEvent: vi.fn().mockRejectedValue(new Error('timeout')) }),
      }
      return fn(mockPage as any)
    })
    const result = await resolveIbeUrl('https://hotel.com')
    expect(result).toMatchObject({ ibeName: 'Profitroom' })
  })

  it('finds IBE via iframe src', async () => {
    vi.mocked(detectKnownIBE).mockReturnValueOnce(null) // initial URL
    vi.mocked(detectKnownIBE).mockReturnValueOnce({
      name: 'Cloudbeds',
      externalHotelId: null,
      searchTemplate: 'https://hotels.cloudbeds.com/reservation/HOTEL1',
      bookingTemplate: 'https://hotels.cloudbeds.com/reservation/HOTEL1',
    })
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        url: () => 'https://hotel.com',
        waitForTimeout: vi.fn(),
        goto: vi.fn(),
        evaluate: vi.fn().mockResolvedValue(['https://hotels.cloudbeds.com/reservation/HOTEL1']),
        $: vi.fn().mockResolvedValue(null),
        $$: vi.fn().mockResolvedValue([]),
        waitForNavigation: vi.fn().mockRejectedValue(new Error('timeout')),
        context: () => ({ waitForEvent: vi.fn().mockRejectedValue(new Error('timeout')) }),
      }
      return fn(mockPage as any)
    })
    const result = await resolveIbeUrl('https://hotel.com')
    expect(result).toMatchObject({ ibeName: 'Cloudbeds' })
  })

  it('finds IBE via URL-pattern href (icon button, no text)', async () => {
    vi.mocked(detectKnownIBE).mockReturnValueOnce(null)
    vi.mocked(detectKnownIBE).mockReturnValueOnce({
      name: 'Sabre SynXis',
      externalHotelId: 'HOTEL1',
      searchTemplate: 'https://be.synxis.com/?hotel=HOTEL1',
      bookingTemplate: 'https://be.synxis.com/?hotel=HOTEL1',
    })
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        url: () => 'https://hotel.com',
        waitForTimeout: vi.fn(),
        goto: vi.fn(),
        // Returns synxis booking URL found via URL pattern (no text match needed)
        evaluate: vi.fn().mockResolvedValue(['https://be.synxis.com/?hotel=HOTEL1&chain=ABC']),
        $: vi.fn().mockResolvedValue(null),
        $$: vi.fn().mockResolvedValue([]),
        waitForNavigation: vi.fn().mockRejectedValue(new Error('timeout')),
        context: () => ({ waitForEvent: vi.fn().mockRejectedValue(new Error('timeout')) }),
      }
      return fn(mockPage as any)
    })
    const result = await resolveIbeUrl('https://hotel.com')
    expect(result).toMatchObject({ ibeName: 'Sabre SynXis' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/onboarding-api test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|×|✓" | head -20
```

Expected: the 3 new tests fail (existing tests still pass).

- [ ] **Step 3: Add `collectBookingCandidates` to `ibe-resolver.service.ts`**

Add this function after the `RESOURCE_FINGERPRINTS` array (after the closing `]` on the last fingerprint):

```typescript
async function collectBookingCandidates(page: Page, currentUrl: string): Promise<string[]> {
  return page.evaluate(
    (args: { textSrc: string; urlSrc: string; currentOrigin: string }) => {
      const textRe = new RegExp(args.textSrc, 'iu')
      const urlRe = new RegExp(args.urlSrc, 'i')
      const seen = new Set<string>()
      const candidates: string[] = []

      function add(url: string) {
        if (!url || !url.startsWith('http')) return
        const clean = url.split('#')[0] ?? url
        if (!seen.has(clean)) { seen.add(clean); candidates.push(clean) }
      }

      function isVisible(el: Element) {
        return (el as HTMLElement).offsetParent !== null
      }

      function extractText(el: Element) {
        return (
          (el as HTMLElement).innerText?.trim() ||
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.getAttribute('alt') ||
          ''
        )
      }

      // 1. <a href> — by booking text OR booking URL pattern
      for (const el of Array.from(document.querySelectorAll('a[href]'))) {
        if (!isVisible(el)) continue
        const a = el as HTMLAnchorElement
        const href = a.href
        if (!href?.startsWith('http')) continue
        const text = extractText(el)
        if (textRe.test(text) || urlRe.test(href)) add(href)
      }

      // 2. <button> / [role="button"] — extract URL from data-* or onclick
      for (const el of Array.from(document.querySelectorAll('button, [role="button"]'))) {
        if (!isVisible(el)) continue
        const text = extractText(el)
        if (!textRe.test(text)) continue
        for (const attr of ['data-href', 'data-url', 'data-link', 'data-target', 'data-book-url']) {
          const val = el.getAttribute(attr)
          if (val?.startsWith('http')) { add(val); break }
        }
        const onclick = el.getAttribute('onclick') ?? ''
        const m = onclick.match(/https?:\/\/[^\s'"]+/)
        if (m) add(m[0]!)
      }

      // 3. <iframe src> on a different origin — likely embedded booking widget
      for (const el of Array.from(document.querySelectorAll('iframe[src]'))) {
        const src = (el as HTMLIFrameElement).src
        if (src?.startsWith('http') && !src.startsWith(args.currentOrigin)) add(src)
      }

      // 4. <form action> matching booking URL pattern
      for (const el of Array.from(document.querySelectorAll('form[action]'))) {
        const action = (el as HTMLFormElement).action
        if (action?.startsWith('http') && urlRe.test(action)) add(action)
      }

      // 5. JSON-LD schema — ReserveAction / BookAction target
      for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          const data = JSON.parse(script.textContent ?? '{}')
          const check = (obj: unknown) => {
            if (!obj || typeof obj !== 'object') return
            const o = obj as Record<string, unknown>
            for (const key of ['url', 'target', 'urlTemplate']) {
              const v = o[key]
              if (typeof v === 'string' && v.startsWith('http')) add(v)
            }
            for (const v of Object.values(o)) if (v && typeof v === 'object') check(v)
          }
          check(data)
        } catch {}
      }

      return candidates.slice(0, 12)
    },
    { textSrc: BOOKING_TEXT_RE.source, urlSrc: BOOKING_URL_RE.source, currentOrigin: (() => { try { return new URL(currentUrl).origin } catch { return '' } })() },
  ).catch(() => [] as string[])
}
```

- [ ] **Step 4: Replace the old `<a href>` scan in `followBookingLinks` with `collectBookingCandidates`**

In `followBookingLinks`, replace the block from the comment `// Collect booking-intent <a href> candidates` to `}, BOOKING_TEXT_RE.source).catch(() => [] as string[]);` with:

```typescript
      // Collect booking-intent candidates from all sources
      const hrefs = await collectBookingCandidates(page, currentUrl)
```

Also remove the unused variable `firstBookingIbeName` (line 87 in the original):

```typescript
    let firstBookingUrl: string | null = null;
```

(delete the `let firstBookingIbeName` line entirely since it was never read)

- [ ] **Step 5: Run tests**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/onboarding-api test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|×|✓" | head -30
```

Expected: all tests pass including the 3 new ones.

- [ ] **Step 6: Type-check**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/onboarding-api tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git -C /home/nir/ibe add apps/onboarding-api/src/services/ibe-resolver.service.ts apps/onboarding-api/src/services/__tests__/ibe-resolver.service.test.ts
git -C /home/nir/ibe commit -m "feat(onboarding): multi-source booking candidate collection"
```

---

## Task 4: `clickAndObserve` fallback

**Files:**
- Modify: `apps/onboarding-api/src/services/ibe-resolver.service.ts`
- Test: `apps/onboarding-api/src/services/__tests__/ibe-resolver.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/onboarding-api/src/services/__tests__/ibe-resolver.service.test.ts`:

```typescript
describe('resolveIbeUrl — click-and-observe fallback', () => {
  it('clicks a booking button when fast scan finds nothing, returns navigated URL', async () => {
    vi.mocked(detectKnownIBE).mockReturnValueOnce(null) // initial URL
    vi.mocked(detectKnownIBE).mockReturnValueOnce({    // after click navigation
      name: 'Mews',
      externalHotelId: 'MEWS1',
      searchTemplate: 'https://app.mews.com/distributor/MEWS1',
      bookingTemplate: 'https://app.mews.com/distributor/MEWS1',
    })

    const mockClick = vi.fn().mockResolvedValue(undefined)
    const mockEl = { click: mockClick, isVisible: vi.fn().mockResolvedValue(true), boundingBox: vi.fn().mockResolvedValue({ y: 100 }) }

    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      let callCount = 0
      const mockPage = {
        url: vi.fn().mockImplementation(() =>
          callCount++ === 0 ? 'https://hotel.com' : 'https://app.mews.com/distributor/MEWS1'
        ),
        waitForTimeout: vi.fn(),
        goto: vi.fn(),
        // First evaluate (collectBookingCandidates): returns empty → triggers click fallback
        // Second evaluate (findBestBookingElement): returns true (found + clicked)
        evaluate: vi.fn()
          .mockResolvedValueOnce([])   // collectBookingCandidates hop 0
          .mockResolvedValueOnce(true), // clickAndObserve finds element
        $: vi.fn().mockResolvedValue(null),
        $$: vi.fn().mockResolvedValue([mockEl]),
        waitForNavigation: vi.fn().mockResolvedValue(undefined),
        context: () => ({ waitForEvent: vi.fn().mockRejectedValue(new Error('no popup')) }),
      }
      return fn(mockPage as any)
    })

    const result = await resolveIbeUrl('https://hotel.com')
    expect(result).toMatchObject({ ibeName: 'Mews' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/onboarding-api test -- --reporter=verbose 2>&1 | grep -E "click-and-observe|FAIL|×" | head -10
```

Expected: the new test fails.

- [ ] **Step 3: Add `clickAndObserve` function to `ibe-resolver.service.ts`**

Add after `collectBookingCandidates` (before `followBookingLinks`):

```typescript
async function clickAndObserve(page: Page): Promise<string | null> {
  try {
    // Find the best visible booking-intent element, scored by position and type
    const clicked = await page.evaluate((reSource: string) => {
      const re = new RegExp(reSource, 'iu')
      interface Candidate { el: Element; score: number }
      const candidates: Candidate[] = []

      for (const el of Array.from(document.querySelectorAll('a[href], button, [role="button"]'))) {
        const h = el as HTMLElement
        if (h.offsetParent === null) continue // hidden
        const text = h.innerText?.trim() || h.getAttribute('aria-label') || h.getAttribute('title') || ''
        if (!re.test(text)) continue

        const rect = h.getBoundingClientRect()
        let score = 0
        // Above the fold scores higher
        if (rect.top < window.innerHeight) score += 20
        // In header/nav scores higher
        const parent = el.closest('header, nav, [role="navigation"]')
        if (parent) score += 30
        // Larger elements score higher (more prominent)
        score += Math.min(rect.width * rect.height / 1000, 20)

        candidates.push({ el, score })
      }

      if (candidates.length === 0) return false
      candidates.sort((a, b) => b.score - a.score)
      ;(candidates[0]!.el as HTMLElement).click()
      return true
    }, BOOKING_TEXT_RE.source).catch(() => false)

    if (!clicked) return null

    // Race: navigation, popup, or timeout
    const navPromise = page.waitForNavigation({ timeout: 4000 }).then(() => page.url()).catch(() => null)
    const popupPromise = page.context().waitForEvent('page', { timeout: 4000 })
      .then(p => p.url()).catch(() => null)

    const result = await Promise.race([navPromise, popupPromise])
    if (result && result !== 'about:blank') return result

    // Check if a new iframe appeared
    const iframeSrc = await page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll('iframe[src]'))
      for (const f of iframes) {
        const src = (f as HTMLIFrameElement).src
        if (src?.startsWith('http')) return src
      }
      return null
    }).catch(() => null)

    return iframeSrc
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Wire `clickAndObserve` into `followBookingLinks`**

After the hop loop ends (after the `}` closing the `for` loop, before `// Final checks`), add:

```typescript
    // Click-and-observe fallback — only reached when all hops found no candidates
    const clickedUrl = await clickAndObserve(page)
    if (clickedUrl) {
      const t1 = tryTier1(clickedUrl)
      if (t1) return t1
      const clickedPage = page // still on same page context
      const resourceMatch = await scanPageResources(clickedPage, clickedUrl)
      if (resourceMatch) return resourceMatch
      if (clickedUrl !== startUrl) {
        firstBookingUrl = clickedUrl
      }
    }
```

- [ ] **Step 5: Run all tests**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/onboarding-api test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|×|✓" | head -40
```

Expected: all tests pass.

- [ ] **Step 6: Type-check**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/onboarding-api tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git -C /home/nir/ibe add apps/onboarding-api/src/services/ibe-resolver.service.ts apps/onboarding-api/src/services/__tests__/ibe-resolver.service.test.ts
git -C /home/nir/ibe commit -m "feat(onboarding): click-and-observe fallback for JS-driven booking buttons"
```

---

## Task 5: DataForSEO sequential queries (already committed — verify)

This was implemented in a previous session. Verify it's correct:

- [ ] **Step 1: Confirm sequential logic is in place**

```bash
grep -A 6 "nonOtaFromQuoted" /home/nir/ibe/apps/onboarding-api/src/services/dataforseo.service.ts
```

Expected output:
```
    const nonOtaFromQuoted = quotedItems.filter(i => i.url && !isOta(i.url, country))

    const unquotedItems = nonOtaFromQuoted.length >= 2
      ? []
      : await fetchSerpItems(unquotedKeyword, credentials, locationCode)
```

If output matches → already done, skip to commit check. If not → the earlier change wasn't saved; re-apply it per Task 2 of that session.

- [ ] **Step 2: Type-check**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/onboarding-api tsc --noEmit
```

Expected: no errors.

---

## Task 6: Full test run + push

- [ ] **Step 1: Run full test suite**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/onboarding-api test 2>&1 | tail -20
```

Expected: all tests pass, 0 failures.

- [ ] **Step 2: Push**

```bash
git -C /home/nir/ibe push
```
