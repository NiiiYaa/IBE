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
