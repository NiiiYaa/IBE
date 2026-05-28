import { detectKnownIBE, normaliseBoard, tryParsePropertyInfo, tryParseRooms } from '@ibe/shared'
import type { ParsedRoom } from '@ibe/shared'
import { withStealthPage } from '../playwright-browser.service.js'
import { lookupTaxes } from '../tax-lookup.service.js'
import { parseCancellationPolicy } from './cancellation-policy-parser.js'
import type {
  HarvestedHotelData, HarvestedRoom, DiscoveredRatePlanType, HarvestedOccupancy,
} from '@ibe/onboarding-flows'
import type { IbeHarvester, HarvestContext } from './types.js'
import type { Response as PlaywrightResponse } from 'playwright'

const DATE_WINDOW_OFFSETS = [7, 30]
const OCCUPANCY_PATTERNS: [number, number][] = [
  [1, 0], [2, 0], [3, 0], [4, 0],
  [2, 1], [2, 2],
]

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function buildSearchUrl(
  template: string, hotelId: string,
  adults: number, children: number,
  checkIn: string, checkOut: string,
): string {
  return template
    .replace('{externalHotelId}', hotelId)
    .replace('{adults}', String(adults))
    .replace('{checkIn}', checkIn)
    .replace('{checkOut}', checkOut)
    .replace('{currency}', 'USD')
    .replace('items[0][children]=0', `items[0][children]=${children}`)
}

function makeResponseCollector(payloads: unknown[]) {
  return (res: PlaywrightResponse) => {
    if (
      res.url().includes('direct-book.com') &&
      (res.headers()['content-type'] ?? '').includes('json')
    ) {
      // Fire-and-forget: payloads are read after waitForTimeout/waitForSelector,
      // by which point networkidle has settled and all .json() promises resolved.
      res.json().then((data) => payloads.push(data)).catch(() => {})
    }
  }
}

const DOM = {
  hotelName: 'h1, [class*="property-title"], [class*="PropertyTitle"], [class*="hotel-name"]',
  roomCard:  '[class*="room-card"], [class*="RoomCard"], [class*="accommodation-card"], [data-testid*="room"]',
  roomName:  'h3, h4, [class*="room-name"], [class*="RoomName"]',
  rateRow:   '[class*="rate-plan"], [class*="RatePlan"], [class*="price-plan"]',
  boardCell: '[class*="meal-plan"], [class*="MealPlan"], [class*="board"]',
  cancelCell:'[class*="cancel"], [class*="Cancel"], [class*="refund"]',
}

type HotelInfoResult = Omit<HarvestedHotelData, 'rooms' | 'discoveredRatePlanTypes' | 'agePolicy' | 'taxesAndFees'>

export class DirectBookHarvester implements IbeHarvester {
  async harvest(
    ibeUrl: string,
    ctx: HarvestContext,
    onProgress: (m: string) => void,
  ): Promise<HarvestedHotelData> {
    const detected = detectKnownIBE(ibeUrl)
    if (!detected) throw new Error('Not a recognised direct-book.com URL')
    const { searchTemplate, externalHotelId: hotelId } = detected

    onProgress('Fetching hotel information...')
    const hotelInfo = await this.fetchHotelInfo(searchTemplate, hotelId, ctx)

    onProgress('Discovering room types and rate plans...')
    const { rooms, ratePlanTypes } = await this.discoverRoomsAndRates(searchTemplate, hotelId, onProgress)

    onProgress('Looking up taxes...')
    const taxesAndFees = lookupTaxes(hotelInfo.country ?? '', hotelInfo.city ?? '')

    return { ...hotelInfo, rooms, discoveredRatePlanTypes: ratePlanTypes, agePolicy: null, taxesAndFees }
  }

  private async fetchHotelInfo(
    template: string, hotelId: string, ctx: HarvestContext,
  ): Promise<HotelInfoResult> {
    const url = buildSearchUrl(template, hotelId, 2, 0, ctx.checkIn, ctx.checkOut)
    const payloads: unknown[] = []

    return withStealthPage(url, async (page) => {
      try { await page.waitForSelector('h1', { timeout: 12000 }) } catch {}
      await page.waitForTimeout(2000)

      for (const payload of payloads) {
        const info = tryParsePropertyInfo(payload)
        if (info) {
          return {
            name: info.name,
            starRating: info.starRating,
            address: info.address,
            city: info.city,
            country: info.country,
            description: info.description ?? '',
            images: info.images,
            amenities: info.amenities,
            phone: null,
            email: null,
            website: `https://www.direct-book.com/properties/${hotelId}`,
            policies: [],
          }
        }
      }

      return page.evaluate(({ sel, hId }: { sel: typeof DOM; hId: string }): HotelInfoResult => {
        const name = document.querySelector(sel.hotelName)?.textContent?.trim() ?? ''
        const imgs = Array.from(document.querySelectorAll('img') as NodeListOf<HTMLImageElement>)
          .map(i => i.src)
          .filter(s => s.startsWith('http') && /\.(jpg|jpeg|png|webp)/i.test(s))
          .slice(0, 20)
        const amenities = Array.from(
          document.querySelectorAll('[class*="amenity"] li, [class*="feature"] li'),
        ).map(el => (el as HTMLElement).textContent?.trim() ?? '').filter(Boolean).slice(0, 20)
        return {
          name, starRating: null, address: null, city: null, country: null,
          phone: null, email: null, website: `https://www.direct-book.com/properties/${hId}`,
          description: document.querySelector('[class*="description"]')?.textContent?.trim()?.slice(0, 500) ?? '',
          images: imgs, amenities, policies: [],
        }
      }, { sel: DOM, hId: hotelId })
    }, {
      idleTimeout: 12000,
      beforeNavigate: (page) => { page.on('response', makeResponseCollector(payloads)) },
    })
  }

  private async discoverRoomsAndRates(
    template: string, hotelId: string, onProgress: (m: string) => void,
  ): Promise<{ rooms: HarvestedRoom[]; ratePlanTypes: DiscoveredRatePlanType[] }> {
    const roomsMap = new Map<string, HarvestedRoom>()
    const ratePlanMap = new Map<string, DiscoveredRatePlanType>()

    for (const offsetDays of DATE_WINDOW_OFFSETS) {
      const checkIn = addDays(offsetDays)
      const checkOut = addDays(offsetDays + 1)
      let consecutiveEmpty = 0

      for (const [adults, children] of OCCUPANCY_PATTERNS) {
        onProgress(`Searching ${adults}A${children > 0 ? `+${children}C` : ''} (${offsetDays}d out)...`)
        const searchUrl = buildSearchUrl(template, hotelId, adults, children, checkIn, checkOut)
        const parsed = await this.scrapeSearch(searchUrl)
        const gotResults = parsed.length > 0

        for (const room of parsed) {
          if (!roomsMap.has(room.name)) {
            roomsMap.set(room.name, {
              name: room.name,
              description: room.description,
              images: room.images,
              bedConfiguration: room.bedConfig,
              amenities: room.amenities,
              supportedOccupancies: [{ adults, children }],
              maxAdults: adults,
              maxOccupancy: adults + children,
            })
          } else {
            const existing = roomsMap.get(room.name)!
            const occ: HarvestedOccupancy = { adults, children }
            if (!existing.supportedOccupancies.some(o => o.adults === adults && o.children === children)) {
              existing.supportedOccupancies.push(occ)
              existing.maxAdults = Math.max(existing.maxAdults ?? 0, adults)
              existing.maxOccupancy = Math.max(existing.maxOccupancy ?? 0, adults + children)
            }
          }

          for (const rate of room.rates) {
            const boardCode = normaliseBoard(rate.boardLabel)
            if (!boardCode) continue
            const key = `${boardCode}:${rate.isNonRefundable ? 'NR' : 'R'}`
            if (!ratePlanMap.has(key)) {
              ratePlanMap.set(key, {
                boardCode,
                boardCodeRawName: rate.boardLabel,
                hasRefundable: !rate.isNonRefundable,
                hasNonRefundable: rate.isNonRefundable,
                refundableCancellationPolicy: rate.isNonRefundable ? null : parseCancellationPolicy(rate.cancelText),
                refundableExampleName: rate.isNonRefundable ? null : rate.boardLabel,
                nonRefundableExampleName: rate.isNonRefundable ? rate.boardLabel : null,
              })
            } else {
              const existing = ratePlanMap.get(key)!
              if (!rate.isNonRefundable) existing.hasRefundable = true
              else existing.hasNonRefundable = true
            }
          }
        }

        if (!gotResults) consecutiveEmpty++
        else consecutiveEmpty = 0
        // Breaks inner (occupancy) loop only — outer date-window loop continues.
        // Consistent with SynXisHarvester: per-window early-stop avoids missing
        // rooms that are only available at the 30-day window.
        if (consecutiveEmpty >= 3) break
      }
    }

    return { rooms: Array.from(roomsMap.values()), ratePlanTypes: Array.from(ratePlanMap.values()) }
  }

  private async scrapeSearch(searchUrl: string): Promise<ParsedRoom[]> {
    try {
      const payloads: unknown[] = []
      return await withStealthPage(searchUrl, async (page) => {
        await page.waitForTimeout(5000)

        for (const payload of payloads) {
          const rooms = tryParseRooms(payload)
          if (rooms.length > 0) return rooms
        }

        return page.evaluate((sel: typeof DOM): ParsedRoom[] => {
          return (Array.from(document.querySelectorAll(sel.roomCard)).map(card => {
            const name = card.querySelector(sel.roomName)?.textContent?.trim() ?? 'Unknown Room'
            const imgs = Array.from(card.querySelectorAll('img') as NodeListOf<HTMLImageElement>)
              .map(i => i.src).filter(s => s.startsWith('http'))
            const rates = Array.from(card.querySelectorAll(sel.rateRow)).map(r => ({
              boardLabel: r.querySelector(sel.boardCell)?.textContent?.trim() ?? '',
              cancelText: r.querySelector(sel.cancelCell)?.textContent?.trim() ?? '',
              isNonRefundable: /non.?refund/i.test(r.textContent ?? ''),
              pricePerNight: null,
              total: null,
              currency: null,
            })).filter(r => r.boardLabel)
            return { name, description: '', images: imgs, amenities: [], bedConfig: null, rates }
          }) as ParsedRoom[]).filter(r => r.name !== 'Unknown Room')
        }, DOM)
      }, {
        navigationTimeout: 20000,
        idleTimeout: 8000,
        beforeNavigate: (page) => { page.on('response', makeResponseCollector(payloads)) },
      })
    } catch {
      return []
    }
  }
}
