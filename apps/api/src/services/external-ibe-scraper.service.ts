import { logger } from '../utils/logger.js'
import { withStealthPage } from './playwright-browser.service.js'
import { buildExternalUrl } from './external-ibe.service.js'

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

  return new RegExp('^' + pattern)
}

// ── resolveExternalBookingUrl ─────────────────────────────────────────────

export interface ScrapeBookingOptions {
  searchUrl: string
  bookingTemplate: string
  externalHotelId: string | null
  checkIn: string
  checkOut: string
  adults: number
  children?: number
  childrenAges?: number[]
  roomName?: string
  lowestPrice?: number // reserved for future price-based link ranking
}

export interface ScrapeBookingResult {
  bookingUrl: string
  fallback: boolean
  solutionId?: string
}

/**
 * Attempts to resolve a direct booking URL by scraping the external IBE's
 * search results page for a link matching the booking template pattern.
 *
 * When the template has no `{solutionId}` token, builds the URL directly
 * without launching a browser.
 *
 * Falls back to `searchUrl` on any scraping error.
 */
export async function resolveExternalBookingUrl(opts: ScrapeBookingOptions): Promise<ScrapeBookingResult> {
  const { searchUrl, bookingTemplate, externalHotelId, checkIn, checkOut, adults } = opts
  const childrenAges = opts.childrenAges ?? []
  const children = opts.children ?? childrenAges.length
  const guests = [...Array(adults).fill('A'), ...childrenAges.map(String)].join(',') || undefined

  const regex = deriveBookingLinkRegex(bookingTemplate)

  if (!regex) {
    return {
      bookingUrl: buildExternalUrl(bookingTemplate, { externalHotelId, checkIn, checkOut, adults, children, guests, rooms: 1 }),
      fallback: false,
    }
  }

  try {
    return await withStealthPage(searchUrl, async (page) => {
      const typedPage = page as import('playwright').Page
      const regexSource = regex.source

      // Strategy 1: look for anchor elements whose href matches the booking template pattern
      const candidates = await typedPage.$$eval(
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

      if (candidates.length > 0) {
        let best = candidates[0]!
        if (opts.roomName) {
          const nameLower = opts.roomName.toLowerCase()
          const nameMatch = candidates.find(c => c.cardText.toLowerCase().includes(nameLower))
          if (nameMatch) best = nameMatch
        }
        const match = regex.exec(best.href)
        const solutionId = match?.[1]
        if (solutionId) {
          logger.info({ searchUrl, solutionId, cardText: best.cardText }, '[ExternalIBE] resolved solutionId via anchor')
          return { bookingUrl: best.href, fallback: false, solutionId }
        }
      }

      // Strategy 2: IBE uses buttons — walk through the multi-step room-selection flow.
      // Step 1: dismiss cookie/consent banners so they don't block subsequent clicks.
      for (const cookieSel of ['button:has-text("Accept All")', 'button:has-text("Reject All")', 'button:has-text("Accept Cookies")']) {
        const cookieBtn = await typedPage.$(cookieSel)
        if (cookieBtn) { await cookieBtn.click().catch(() => {}); await typedPage.waitForTimeout(500); break }
      }

      // Step 2: click the first room-selection button.
      // Uses JS evaluate click to bypass pointer-event overlays (e.g. SimpleBooking.it).
      // If the click directly navigates to the solution URL, return immediately.
      let step2Clicked = false
      for (const sel of ['button:has-text("Select Room")', 'button:has-text("Reserve")', 'button:has-text("Book Now")', 'a:has-text("Select Room")', 'a:has-text("Book Now")', 'button:has-text("Select")']) {
        const btn = await typedPage.$(sel)
        if (!btn) continue
        try {
          await Promise.all([
            typedPage.waitForURL(u => regex.test(u.toString()), { timeout: 4000 }),
            typedPage.evaluate((node) => (node as HTMLElement).click(), btn),
          ])
          const directUrl = typedPage.url()
          const directMatch = regex.exec(directUrl)
          const directSid = directMatch?.[1]
          if (directSid) {
            logger.info({ searchUrl, solutionId: directSid }, '[ExternalIBE] resolved solutionId via direct room button')
            return { bookingUrl: directUrl, fallback: false, solutionId: directSid }
          }
        } catch {
          // didn't navigate directly — fall through to multi-step flow
        }
        step2Clicked = true
        break
      }
      if (step2Clicked) await typedPage.waitForTimeout(1500)

      // Step 3: if a rate-selection step appeared, pick the first rate.
      for (const sel of ['button:has-text("Choose Rate")', 'button:has-text("Select Rate")', 'button:has-text("Book this rate")', 'a:has-text("Choose Rate")']) {
        const btn = await typedPage.$(sel)
        if (!btn) continue
        await typedPage.evaluate((node) => (node as HTMLElement).click(), btn).catch(() => {})
        await typedPage.waitForTimeout(1500)
        break
      }

      // Step 4: click Continue/Proceed/Book to trigger navigation to the solution URL.
      for (const sel of ['button:has-text("Continue")', 'button:has-text("Proceed")', 'button:has-text("Next")', 'button:has-text("Book")', 'a:has-text("Continue")']) {
        const btn = await typedPage.$(sel)
        if (!btn) continue
        try {
          await Promise.all([
            typedPage.waitForURL(u => regex.test(u.toString()), { timeout: 12000 }),
            typedPage.evaluate((node) => (node as HTMLElement).click(), btn),
          ])
          const newUrl = typedPage.url()
          const match = regex.exec(newUrl)
          const solutionId = match?.[1]
          if (solutionId) {
            logger.info({ searchUrl, solutionId }, '[ExternalIBE] resolved solutionId via button flow')
            return { bookingUrl: newUrl, fallback: false, solutionId }
          }
        } catch {
          // navigation didn't land on booking URL — continue
        }
      }

      logger.info({ searchUrl }, '[ExternalIBE] no booking links matched — fallback')
      return { bookingUrl: searchUrl, fallback: true }
    })
  } catch (err) {
    logger.warn({ err, searchUrl }, '[ExternalIBE] scrape failed — fallback to search URL')
    return { bookingUrl: searchUrl, fallback: true }
  }
}
