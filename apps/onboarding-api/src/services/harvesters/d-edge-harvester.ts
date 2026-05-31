/**
 * D-Edge / Availpro harvester.
 *
 * Key design: ALL Playwright work (property info + room searches) runs in ONE browser session
 * so DataDome session cookies are preserved across requests. A fresh session per request
 * would be blocked by DataDome's bot protection on the RoomSelection page.
 */
import { detectKnownIBE, tryParseRooms, tryParsePropertyInfo, normaliseBoard } from '@ibe/shared'
import { chromium as chromiumExtra } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { env } from '../../env.js'
chromiumExtra.use(StealthPlugin())
import { lookupTaxes } from '../tax-lookup.service.js'
import { parseCancellationPolicy } from './cancellation-policy-parser.js'
import { probeOccupancy } from '../occupancy-probe.service.js'
import type { HarvestedHotelData, HarvestedRoom, DiscoveredRatePlanType } from '@ibe/onboarding-flows'
import type { IbeHarvester, HarvestContext } from './types.js'
import type { HarvestResumeContext } from '../ibe-harvester.service.js'
import type { Response as PlaywrightResponse, Page } from 'playwright'

const BROWSER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function addDays(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}

function collectJsonResponses(page: Page): unknown[] {
  const payloads: unknown[] = []
  page.on('response', (res: PlaywrightResponse) => {
    const ct = res.headers()['content-type'] ?? ''
    if (ct.includes('json')) res.json().then(d => payloads.push(d)).catch(() => {})
  })
  return payloads
}

async function extractRooms(page: Page, payloads: unknown[]): Promise<any[]> {
  for (const p of payloads) {
    const rooms = tryParseRooms(p)
    if (rooms.length > 0) return rooms
  }
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[class*="room-card"],[class*="RoomCard"],[class*="accommodation-card"]'))
    return cards.map(card => {
      const name = card.querySelector('h2,h3,h4,[class*="room-name"]')?.textContent?.trim() ?? ''
      if (!name || /select|choose|search/i.test(name)) return null
      const imgs = Array.from(card.querySelectorAll('img')).flatMap(i => {
        const s = (i as HTMLImageElement).src || i.getAttribute('data-src') || ''
        return s.startsWith('http') ? [s] : []
      })
      const desc = Array.from(card.querySelectorAll('[class*="description"],p')).map(e => (e as HTMLElement).innerText?.trim()).filter(t => t && t.length > 20).join(' ').slice(0, 500)
      const amenities = Array.from(card.querySelectorAll('[class*="facilit"] li,[class*="amenity"] li,[class*="feature"] li')).map(e => (e as HTMLElement).innerText?.trim()).filter(t => t && t.length < 60).slice(0, 30)
      const bedEl = card.querySelector('[class*="bed"],[class*="bedding"]')
      const bedConfig = bedEl ? (bedEl as HTMLElement).innerText?.trim().slice(0, 100) : null
      const cardText = card.textContent ?? ''
      const rateRows = Array.from(card.querySelectorAll('[class*="rate"],[class*="Rate"],[class*="plan"]'))
      const rates = rateRows.map(r => {
        const rowText = r.textContent ?? ''
        const mealBoard = (() => {
          if (/room\s+only|room-only|chambre\s+seule/i.test(rowText)) return 'Room Only'
          if (/all.?inclus|tout.?inclus/i.test(rowText)) return 'All Inclusive'
          if (/full.?board|pension.?compl/i.test(rowText)) return 'Full Board'
          if (/half.?board|demi.?pension/i.test(rowText)) return 'Half Board'
          if (/breakfast\s+with\s+charge|breakfast.*supplement/i.test(rowText)) return 'Room Only'
          if (/breakfast|petit.?d[eé]j|b&b/i.test(rowText)) return 'Bed & Breakfast'
          return 'Room Only'
        })()
        const cancelText = r.querySelector('[class*="cancel"],[class*="refund"]')?.textContent?.trim() ?? rowText.slice(0, 200)
        return { boardLabel: mealBoard, cancelText, isNonRefundable: /non.?refund|non.?rembours/i.test(rowText), pricePerNight: null, total: null, currency: null }
      })
      return { name, description: desc, images: imgs, amenities, bedConfig, rates: rates.length > 0 ? rates : [{ boardLabel: 'Room Only', cancelText: '', isNonRefundable: false, pricePerNight: null, total: null, currency: null }] }
    }).filter(Boolean)
  }).catch(() => [])
}

export class DEdgeHarvester implements IbeHarvester {
  async harvest(
    ibeUrl: string,
    _ctx: HarvestContext,
    onProgress: (m: string) => void,
    _resume?: HarvestResumeContext,
  ): Promise<HarvestedHotelData> {
    const detected = detectKnownIBE(ibeUrl)
    if (!detected) throw new Error('Not a recognised D-Edge / Availpro URL')

    const hotelId = detected.externalHotelId && /^\d+$/.test(detected.externalHotelId) ? detected.externalHotelId : null

    let hotelInfo = { name: '', starRating: null as number | null, address: null as string | null, city: null as string | null, country: null as string | null, phone: null as string | null, email: null as string | null, website: ibeUrl, description: '', images: [] as string[], amenities: [] as string[] }

    const propertyBase = (() => {
      try {
        const u = new URL(ibeUrl)
        u.pathname = u.pathname.replace(/\/(RoomSelection|HotelSelection|en-US)[^/]*$/, '').replace(/\/$/, '') + '/'
        return `${u.origin}${u.pathname}`
      } catch { return ibeUrl }
    })()

    const roomsMap = new Map<string, HarvestedRoom>()
    const ratePlanMap = new Map<string, DiscoveredRatePlanType>()

    // Single browser session — DataDome cookies persist across all page navigations
    const proxyUrl = env.RESIDENTIAL_PROXY_URL
    if (proxyUrl) onProgress(`  → Using residential proxy for DataDome bypass`)
    const chromeDebugUrl = process.env['CHROME_DEBUG_URL'] ?? 'http://localhost:9222'
    let browser
    let connectedToCDP = false

    // Try to connect to user's running Chrome (bypasses DataDome completely)
    try {
      const { chromium: plainChromium } = await import('playwright')
      browser = await plainChromium.connectOverCDP(chromeDebugUrl)
      connectedToCDP = true
      onProgress('  → Connected to your Chrome browser (DataDome bypassed)')
    } catch {
      // Fallback: launch headless Playwright
      browser = await chromiumExtra.launch({
        headless: true,
        args: [...BROWSER_ARGS, '--window-size=1280,900'],
        ...(proxyUrl ? { proxy: { server: proxyUrl } } : {}),
      })
    }
    try {
      // CDP connection uses existing contexts; new launch creates a fresh one
      const context = connectedToCDP
        ? browser.contexts()[0] ?? await browser.newContext()
        : await browser.newContext({
            userAgent: USER_AGENT,
            viewport: { width: 1280, height: 900 },
            locale: 'en-US',
            extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
          })
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'fr'] })
        ;(window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} }
        // Pre-seed consent cookies
        try {
          localStorage.setItem('OptanonAlertBoxClosed', new Date().toISOString())
          localStorage.setItem('cookieconsent_status', 'dismiss')
        } catch {}
      })

      if (!connectedToCDP) {
        // Only inject DataDome cookie when NOT using real browser CDP connection
        const ddRes = await fetch(`http://localhost:${process.env['PORT'] ?? '3003'}/datadome-cookie/secure-hotel-booking.com`).catch(() => null)
        const ddCookie = ddRes?.ok ? ((await ddRes.json()) as { cookie: string | null }).cookie : (process.env['DATADOME_COOKIE'] ?? null)
        if (ddCookie) {
          onProgress('  → DataDome cookie loaded — bypassing bot detection')
          await context.addCookies([{
            name: 'datadome', value: ddCookie,
            domain: '.secure-hotel-booking.com', path: '/',
            httpOnly: true, secure: true, sameSite: 'Lax',
          }])
        }
      }
      const page = await context.newPage()

      // Step 1: Load property base (establishes DataDome session cookie)
      onProgress('Fetching hotel info and discovering room selection URL...')
      const payloads1 = collectJsonResponses(page)
      await page.goto(propertyBase, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {})
      // Wait for DataDome JS challenge to complete before navigating to search page
      await page.waitForTimeout(4000)
      const propTitle = await page.title().catch(() => '')
      const dataDomeBlocked = /error|blocked|datadome/i.test(propTitle)
      onProgress(`  → property page: "${propTitle.slice(0, 60)}"`)
      if (dataDomeBlocked) {
        onProgress('  → DataDome bot protection detected — room data cannot be scraped automatically')
        onProgress('  → Use the "Open D-Edge in My Browser" button below to harvest rooms via your browser')
      }

      // Try to extract property info from JSON API
      for (const p of payloads1) {
        const info = tryParsePropertyInfo(p)
        if (info?.name) { hotelInfo = { ...hotelInfo, ...info, description: info.description ?? hotelInfo.description }; break }
      }
      const domInfo = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img')).map(i => (i as HTMLImageElement).src).filter(s => s.startsWith('http')).slice(0, 20)
        return { images: imgs }
      }).catch(() => ({ images: [] as string[] }))
      if (domInfo.images.length > 0 && hotelInfo.images.length === 0) hotelInfo.images = domInfo.images
      onProgress(`  → info retrieved · ${hotelInfo.images.length} image(s)`)

      // Find the View Rates / search URL — navigate to HotelSelection
      const ratesUrl = await page.evaluate(() => {
        const re = /view\s+rates?|check\s+avail|search\s+rooms?|voir\s+tarif|tarifs?/i
        for (const el of Array.from(document.querySelectorAll('a[href],button'))) {
          const text = (el as HTMLElement).innerText?.trim() || ''
          const href = (el as HTMLAnchorElement).href
          if (re.test(text) && href?.startsWith('http')) return href
        }
        return null
      }).catch(() => null)

      if (ratesUrl) _resume?.reportIbeUrl?.(ratesUrl)

      // Build RoomSelection URL with hotelId
      const buildSearchUrl = (adults: number, children: number): string => {
        const base = ratesUrl ?? propertyBase
        const u = new URL(base)
        u.pathname = u.pathname.replace(/\/HotelSelection.*$|\/en-US.*$/, '/RoomSelection')
        if (!u.pathname.includes('RoomSelection')) u.pathname = u.pathname.replace(/\/$/, '') + '/RoomSelection'
        if (hotelId) u.searchParams.set('hotelId', hotelId)
        u.searchParams.set('currency', 'EUR')
        u.searchParams.set('language', 'en-US')
        u.searchParams.set('selectedAdultCount', String(adults))
        u.searchParams.set('selectedChildCount', String(children))
        u.searchParams.set('selectedInfantCount', '0')
        u.searchParams.set('arrivalDate', addDays(30))
        u.searchParams.set('departureDate', addDays(31))
        return u.toString()
      }

      // Step 2: Room searches — reuse same session (DataDome cookies preserved!)
      // Set up single JSON collector for all searches — clear between searches
      let currentPayloads: unknown[] = []
      page.on('response', (res: PlaywrightResponse) => {
        const ct = res.headers()['content-type'] ?? ''
        if (ct.includes('json')) res.json().then(d => currentPayloads.push(d)).catch(() => {})
      })

      if (dataDomeBlocked) {
        onProgress('✓ D-Edge harvest complete (hotel info only — DataDome blocks room scraping)')
        return { name: hotelInfo.name, starRating: hotelInfo.starRating, address: hotelInfo.address, city: hotelInfo.city, country: hotelInfo.country, phone: hotelInfo.phone, email: hotelInfo.email, website: hotelInfo.website, description: hotelInfo.description, images: hotelInfo.images, amenities: hotelInfo.amenities, rooms: [], discoveredRatePlanTypes: [], agePolicy: null, taxesAndFees: lookupTaxes(hotelInfo.country ?? '', hotelInfo.city ?? ''), policies: [] }
      }

      const OCCUPANCY_PATTERNS: [number, number][] = [[1, 0], [2, 0], [3, 0], [2, 1]]
      for (const [adults, children] of OCCUPANCY_PATTERNS) {
        const adultStr = `${adults} adult${adults !== 1 ? 's' : ''}`
        const childStr = children > 0 ? `, ${children} child${children !== 1 ? 'ren' : ''}` : ', 0 children'
        const searchUrl = buildSearchUrl(adults, children)
        onProgress(`Searching ${adultStr}${childStr}, 0 infants (d+30, 1 night) [url:${searchUrl}]`)

        try {
          const payloads = currentPayloads = []  // fresh payloads per search
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
          await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {})
          await page.waitForTimeout(3000)

          const pageTitle = await page.title().catch(() => '')
          const isBlocked = /error|blocked|datadome|access denied/i.test(pageTitle)
          if (isBlocked) onProgress(`  → page blocked by DataDome: "${pageTitle}"`)

          const parsed = await extractRooms(page, payloads)
          const newRooms = (parsed as any[]).filter(r => r?.name).length
          onProgress(`  → ${newRooms} room type(s) found`)

          for (const room of (parsed as any[])) {
            if (!room?.name) continue
            if (!roomsMap.has(room.name)) {
              roomsMap.set(room.name, { name: room.name, description: room.description, images: room.images, bedConfiguration: room.bedConfig, amenities: room.amenities, supportedOccupancies: [{ adults, children }], maxAdults: adults, maxOccupancy: adults + children, maxChildren: children > 0 ? children : null, maxInfants: null, baseOccupancy: null, baseAdults: null, baseChildren: null, baseInfants: null, adultsAgeFrom: null, childrenAgeFrom: null, childrenAgeTo: null, infantsAgeTo: null })
            } else {
              const ex = roomsMap.get(room.name)!
              if (!ex.supportedOccupancies.some(o => o.adults === adults && o.children === children)) {
                ex.supportedOccupancies.push({ adults, children })
                ex.maxAdults = Math.max(ex.maxAdults ?? 0, adults)
                ex.maxOccupancy = Math.max(ex.maxOccupancy ?? 0, adults + children)
              }
            }
            for (const rate of (room.rates ?? [])) {
              const boardCode = normaliseBoard(rate.boardLabel) ?? 'RO'
              const key = `${boardCode}:${rate.isNonRefundable ? 'NR' : 'R'}`
              if (!ratePlanMap.has(key)) {
                ratePlanMap.set(key, { boardCode, boardCodeRawName: rate.boardLabel, hasRefundable: !rate.isNonRefundable, hasNonRefundable: rate.isNonRefundable, refundableCancellationPolicy: rate.isNonRefundable ? null : parseCancellationPolicy(rate.cancelText), refundableExampleName: rate.isNonRefundable ? null : rate.boardLabel, nonRefundableExampleName: rate.isNonRefundable ? rate.boardLabel : null })
              } else {
                const ex = ratePlanMap.get(key)!
                if (!rate.isNonRefundable) ex.hasRefundable = true
                else ex.hasNonRefundable = true
              }
            }
          }
        } catch { onProgress(`  → ${adultStr} search failed`) }
      }

      // Derive occupancy from search results
      for (const room of roomsMap.values()) {
        const occs = room.supportedOccupancies
        room.maxAdults = Math.max(...occs.map(o => o.adults))
        room.maxChildren = Math.max(...occs.map(o => o.children)) || null
        room.maxOccupancy = Math.max(...occs.map(o => o.adults + o.children))
        room.maxInfants = 0; room.baseAdults = Math.min(...occs.map(o => o.adults)); room.baseChildren = 0; room.baseInfants = 0; room.baseOccupancy = room.baseAdults
      }

      onProgress(`  → ${roomsMap.size} room type(s) · ${ratePlanMap.size} rate plan(s)`)
    } finally {
      // Don't close CDP-connected browser — it belongs to the user
      if (!connectedToCDP) await browser.close()
    }

    const taxesAndFees = lookupTaxes(hotelInfo.country ?? '', hotelInfo.city ?? '')
    onProgress('✓ D-Edge harvest complete')

    return { name: hotelInfo.name, starRating: hotelInfo.starRating, address: hotelInfo.address, city: hotelInfo.city, country: hotelInfo.country, phone: hotelInfo.phone, email: hotelInfo.email, website: hotelInfo.website, description: hotelInfo.description, images: hotelInfo.images, amenities: hotelInfo.amenities, rooms: Array.from(roomsMap.values()), discoveredRatePlanTypes: Array.from(ratePlanMap.values()), agePolicy: null, taxesAndFees, policies: [] }
  }
}
