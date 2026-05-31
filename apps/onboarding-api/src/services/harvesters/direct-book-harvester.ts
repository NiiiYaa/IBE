import { detectKnownIBE, normaliseBoard, tryParsePropertyInfo, tryParseRooms } from '@ibe/shared'
import type { ParsedRoom } from '@ibe/shared'
import { withStealthPage } from '../playwright-browser.service.js'
import { lookupTaxes } from '../tax-lookup.service.js'
import { parseCancellationPolicy } from './cancellation-policy-parser.js'
import type {
  HarvestedHotelData, HarvestedRoom, DiscoveredRatePlanType, HarvestedOccupancy,
} from '@ibe/onboarding-flows'
import type { IbeHarvester, HarvestContext } from './types.js'
import type { HarvestResumeContext } from '../ibe-harvester.service.js'
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
    resume?: HarvestResumeContext,
  ): Promise<HarvestedHotelData> {
    const detected = detectKnownIBE(ibeUrl)
    if (!detected) throw new Error('Not a recognised direct-book.com URL')
    const { searchTemplate, externalHotelId: hotelId } = detected

    const completed = new Set(resume?.completedSteps ?? [])
    const existing = resume?.existingData as Partial<HarvestedHotelData> | undefined

    // Step 1: Hotel info — skip if already completed
    let hotelInfo: HotelInfoResult
    const hotelInfoComplete = completed.has('hotelInfo') && existing?.name &&
      ((existing.images?.length ?? 0) > 0 || (existing.amenities?.length ?? 0) > 0 || (existing.description?.length ?? 0) > 20)
    if (hotelInfoComplete) {
      onProgress('Fetching hotel information... (skipped — already retrieved)')
      onProgress(`  → ${existing.name}${existing.starRating ? ` ★${existing.starRating}` : ''} · ${existing.images?.length ?? 0} image(s) · ${existing.amenities?.length ?? 0} amenity(ies)`)
      hotelInfo = {
        name: existing.name ?? '', starRating: existing.starRating ?? null,
        address: existing.address ?? null, city: existing.city ?? null, country: existing.country ?? null,
        phone: existing.phone ?? null, email: existing.email ?? null, website: existing.website ?? null,
        description: existing.description ?? '', images: existing.images ?? [],
        amenities: existing.amenities ?? [], policies: existing.policies ?? [],
      }
    } else {
      onProgress('Fetching hotel information...')
      hotelInfo = await this.fetchHotelInfo(searchTemplate, hotelId, ctx)
      onProgress(`  → ${hotelInfo.name || 'name n/a'}${hotelInfo.starRating ? ` ★${hotelInfo.starRating}` : ''} · ${hotelInfo.images.length} image(s) · ${hotelInfo.amenities.length} amenity(ies)`)
      resume?.saveProgress('hotelInfo', { ...hotelInfo, rooms: existing?.rooms ?? [], discoveredRatePlanTypes: existing?.discoveredRatePlanTypes ?? [], agePolicy: null, taxesAndFees: [] })
    }

    // Step 2: Rooms — pass existing rooms as seed so completed searches are skipped
    onProgress('Discovering room types and rate plans...')
    const { rooms, ratePlanTypes } = await this.discoverRoomsAndRates(
      searchTemplate, hotelId, onProgress, completed, resume?.saveProgress,
      existing?.rooms ?? [], existing?.discoveredRatePlanTypes ?? [],
      hotelInfo,
    )
    onProgress(`  → ${rooms.length} room type(s) · ${ratePlanTypes.length} rate plan(s)`)

    // Step 3: Taxes
    onProgress('Looking up taxes...')
    const taxesAndFees = lookupTaxes(hotelInfo.country ?? '', hotelInfo.city ?? '')
    onProgress(`  → ${taxesAndFees.length > 0 ? taxesAndFees.map(t => t.name).join(', ') : 'no tax rules found'}`)

    onProgress(`✓ Done — ${rooms.length} room type(s), ${ratePlanTypes.length} rate plan(s), ${hotelInfo.images.length} image(s), ${hotelInfo.amenities.length} amenity(ies)`)
    return { ...hotelInfo, rooms, discoveredRatePlanTypes: ratePlanTypes, agePolicy: null, taxesAndFees }
  }

  private async fetchHotelInfo(
    template: string, hotelId: string, ctx: HarvestContext,
  ): Promise<HotelInfoResult> {
    const searchUrl = buildSearchUrl(template, hotelId, 2, 0, ctx.checkIn, ctx.checkOut)
    const propertyUrl = `https://direct-book.com/properties/${hotelId}`
    const payloads: unknown[] = []

    // Pass 1: search results page — gets name, stars, city, country from API payload
    const base = await withStealthPage(searchUrl, async (page) => {
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
            website: propertyUrl,
            policies: [],
          } as HotelInfoResult
        }
      }

      return page.evaluate(({ sel, hId }: { sel: typeof DOM; hId: string }): HotelInfoResult => {
        const name = document.querySelector(sel.hotelName)?.textContent?.trim() ?? ''
        const imgs = Array.from(document.querySelectorAll('img') as NodeListOf<HTMLImageElement>)
          .map(i => i.src).filter(s => s.startsWith('http') && /\.(jpg|jpeg|png|webp)/i.test(s)).slice(0, 20)
        const amenities = Array.from(document.querySelectorAll('[class*="amenity"] li, [class*="feature"] li'))
          .map(el => (el as HTMLElement).textContent?.trim() ?? '').filter(Boolean).slice(0, 20)
        return {
          name, starRating: null, address: null, city: null, country: null,
          phone: null, email: null, website: `https://www.direct-book.com/properties/${hId}`,
          description: document.querySelector('[class*="description"]')?.textContent?.trim()?.slice(0, 2000) ?? '',
          images: imgs, amenities, policies: [],
        }
      }, { sel: DOM, hId: hotelId })
    }, {
      idleTimeout: 12000,
      beforeNavigate: (page) => { page.on('response', makeResponseCollector(payloads)) },
    })

    // Pass 2: navigate property sub-pages (About, Contact, Policies) for richer data.
    // Try both direct URL and click-nav approaches since direct-book.com uses SPA routing.
    try {
      const NAV_LABELS = [
        { label: /^about$/i, key: 'about' },
        { label: /^contact$/i, key: 'contact' },
        { label: /^policies?$/i, key: 'policies' },
      ]

      // First, discover actual URLs by clicking the nav links on the property page
      const navUrls: Record<string, string> = {}
      try {
        await withStealthPage(propertyUrl, async (page) => {
          try { await page.waitForSelector('nav a, header a', { timeout: 8000 }) } catch {}
          const links = await page.evaluate(() =>
            Array.from(document.querySelectorAll('nav a[href], header a[href], footer a[href], [class*="nav"] a[href], [class*="menu"] a[href], [class*="footer"] a[href]')).map(a => ({
              text: (a as HTMLElement).innerText?.trim().toLowerCase(),
              href: (a as HTMLAnchorElement).href,
            }))
          )
          for (const { label, key } of NAV_LABELS) {
            const match = links.find(l => label.test(l.text))
            if (match?.href) navUrls[key] = match.href
          }
        }, { idleTimeout: 6000 })
      } catch { /* proceed with fallback URLs */ }

      const subPages = NAV_LABELS.map(({ key }) => ({
        url: navUrls[key] ?? `${propertyUrl}/${key}`,
        type: key,
      }))

      for (const sub of subPages) {
        try {
          const scraped = await withStealthPage(sub.url, async (page) => {
            try { await page.waitForSelector('h1, main', { timeout: 10000 }) } catch {}
            await page.waitForTimeout(1500)
            return page.evaluate((type: string): {
              images: string[]; amenities: string[]; description: string
              address: string | null; phone: string | null; email: string | null
              policies: Array<{ type: 'other'; value: string; rawText: string | null }>
            } => {
              // Images
              const seen = new Set<string>()
              const images: string[] = []
              for (const el of Array.from(document.querySelectorAll('img'))) {
                const src = (el as HTMLImageElement).src
                if (src?.startsWith('http') && !seen.has(src)) { seen.add(src); images.push(src) }
                if (images.length >= 20) break
              }
              // Description / about text
              const description = Array.from(document.querySelectorAll('p, [class*="description"], [class*="about"], [class*="overview"], [class*="intro"]'))
                .map(e => (e as HTMLElement).innerText?.trim()).filter(t => t && t.length > 30).slice(0, 3).join('\n').slice(0, 2000)
              // Amenities
              const amenSeen = new Set<string>()
              const amenities: string[] = []
              for (const el of Array.from(document.querySelectorAll('[class*="amenity"],[class*="Amenity"],[class*="facility"],[class*="feature"],[class*="service"]'))) {
                const text = (el as HTMLElement).innerText?.trim().replace(/\s+/g, ' ')
                if (text && text.length > 2 && text.length < 60 && !amenSeen.has(text)) { amenSeen.add(text); amenities.push(text) }
                if (amenities.length >= 30) break
              }
              // Contact info
              const bodyText = document.body.innerText ?? ''
              const phoneMatch = bodyText.match(/(?:\+|00)[0-9 .\-()]{7,20}/)
              const emailMatch = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
              const addrEl = document.querySelector('[class*="address"], [class*="Address"], [itemprop="address"]')
              // Policies
              const policies: Array<{ type: 'other'; value: string; rawText: string | null }> = []
              for (const section of Array.from(document.querySelectorAll('[class*="policy"], [class*="Policy"], [class*="rule"], [class*="Rule"], section, article'))) {
                const heading = (section.querySelector('h2, h3, h4, strong') as HTMLElement | null)?.innerText?.trim()
                const body = (section as HTMLElement).innerText?.trim().replace(/\s+/g, ' ')
                if (heading && body && body.length > 20 && body.length < 500) policies.push({ type: 'other', value: `${heading}: ${body}`, rawText: body })
                if (policies.length >= 10) break
              }
              return {
                images, amenities, description,
                address: (addrEl as HTMLElement | null)?.innerText?.trim() ?? null,
                phone: phoneMatch?.[0]?.trim() ?? null,
                email: emailMatch?.[0]?.trim() ?? null,
                policies,
              }
            }, sub.type)
          }, { idleTimeout: 8000 })

          // Merge: prefer non-empty data, don't overwrite good data with empty
          if (scraped.images.length > base.images.length) base.images = scraped.images
          if (scraped.amenities.length > base.amenities.length) base.amenities = scraped.amenities
          if (!base.description && scraped.description) base.description = scraped.description
          if (!base.address && scraped.address) base.address = scraped.address
          if (!base.phone && scraped.phone) base.phone = scraped.phone
          if (!base.email && scraped.email) base.email = scraped.email
          if (scraped.policies.length > 0) base.policies = scraped.policies
        } catch { /* skip failed sub-page, continue with others */ }
      }
    } catch { /* non-fatal */ }

    return base
  }

  private async discoverRoomsAndRates(
    template: string, hotelId: string, onProgress: (m: string) => void,
    completedSteps = new Set<string>(),
    saveProgress?: HarvestResumeContext['saveProgress'],
    seedRooms: HarvestedRoom[] = [],
    seedRatePlans: DiscoveredRatePlanType[] = [],
    hotelInfoForSave?: HotelInfoResult,
  ): Promise<{ rooms: HarvestedRoom[]; ratePlanTypes: DiscoveredRatePlanType[] }> {
    const roomsMap = new Map<string, HarvestedRoom>(seedRooms.map(r => [r.name, r]))
    const ratePlanMap = new Map<string, DiscoveredRatePlanType>(
      seedRatePlans.map(r => [`${r.boardCode}:${r.hasNonRefundable ? 'NR' : 'R'}`, r])
    )

    for (const offsetDays of DATE_WINDOW_OFFSETS) {
      const checkIn = addDays(offsetDays)
      const checkOut = addDays(offsetDays + 1)
      let consecutiveEmpty = 0

      for (const [adults, children] of OCCUPANCY_PATTERNS) {
        const occupancyLabel = `${adults}A${children > 0 ? `+${children}C` : ''}`
        const stepKey = `search:${adults}A${children}C:${offsetDays}`
        if (completedSteps.has(stepKey)) {
          onProgress(`Searching ${occupancyLabel} (${offsetDays}d out)... (skipped — already done)`)
          continue
        }
        onProgress(`Searching ${occupancyLabel} (${offsetDays}d out)...`)
        const searchUrl = buildSearchUrl(template, hotelId, adults, children, checkIn, checkOut)
        const parsed = await Promise.race([
          this.scrapeSearch(searchUrl),
          new Promise<ParsedRoom[]>(resolve => setTimeout(() => resolve([]), 35000)),
        ])
        const gotResults = parsed.length > 0
        const newRooms = parsed.filter(r => !roomsMap.has(r.name)).length
        const totalRates = parsed.reduce((n, r) => n + r.rates.length, 0)
        onProgress(`  → ${gotResults ? `${parsed.length} room type(s), ${totalRates} rate(s)${newRooms > 0 ? `, ${newRooms} new` : ''}` : 'no results'}`)

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
              maxChildren: null, maxInfants: null,
              baseOccupancy: null, baseAdults: null, baseChildren: null, baseInfants: null,
              adultsAgeFrom: null, childrenAgeFrom: null, childrenAgeTo: null, infantsAgeTo: null,
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
            const boardCode = normaliseBoard(rate.boardLabel) ?? 'RO' // default to Room Only when no board mentioned
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

        // Save progress after each search so a retry can skip completed ones
        if (saveProgress && hotelInfoForSave) {
          saveProgress(stepKey, {
            ...hotelInfoForSave,
            rooms: Array.from(roomsMap.values()),
            discoveredRatePlanTypes: Array.from(ratePlanMap.values()),
            agePolicy: null,
            taxesAndFees: [],
          })
        }

        // Breaks inner (occupancy) loop only — outer date-window loop continues.
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

        // For each room card, click every interactive element inside it to reveal all room data.
        // This handles "More info", "+", expand icons, toggles, detail links — whatever the IBE uses.
        await page.evaluate((roomCardSel: string) => {
          for (const card of Array.from(document.querySelectorAll(roomCardSel))) {
            // Click all buttons, links, and aria-interactive elements inside the card
            for (const el of Array.from(card.querySelectorAll(
              'button, a[href], [role="button"], [role="tab"], [aria-expanded="false"], ' +
              '[class*="expand"], [class*="toggle"], [class*="more"], [class*="detail"], ' +
              '[class*="info"], [class*="show"], [class*="open"], [class*="reveal"]'
            ))) {
              try { (el as HTMLElement).click() } catch {}
            }
          }
        }, DOM.roomCard).catch(() => {})
        await page.waitForTimeout(1500)

        return page.evaluate((sel: typeof DOM): ParsedRoom[] => {
          return (Array.from(document.querySelectorAll(sel.roomCard)).map(card => {
            const name = card.querySelector(sel.roomName)?.textContent?.trim() ?? 'Unknown Room'
            const imgs = Array.from(card.querySelectorAll('img') as NodeListOf<HTMLImageElement>)
              .map(i => i.src).filter(s => s.startsWith('http'))

            // Full card text for structured field extraction
            const cardText = (card as HTMLElement).innerText ?? ''

            // Description — Room Features section or paragraph blocks
            const featureSection = Array.from(card.querySelectorAll('[class*="feature"], [class*="room-info"], [class*="RoomInfo"]'))
              .find(el => (el as HTMLElement).innerText?.length > 30)
            const descriptionParagraphs = Array.from(card.querySelectorAll('p, [class*="description"], [class*="overview"]'))
              .map(e => (e as HTMLElement).innerText?.trim()).filter(t => t && t.length > 20)
            const description = (featureSection as HTMLElement)?.innerText?.trim().slice(0, 500)
              ?? descriptionParagraphs.join(' ').slice(0, 500)

            // Structured room attributes from labelled rows
            function extractField(pattern: RegExp): string | null {
              const m = cardText.match(pattern)
              return m?.[1]?.trim() ?? null
            }
            const bedConfig = extractField(/bed\s+configuration\s*\n?([^\n]+)/i)
              ?? extractField(/configuration\s+des\s+lits?\s*\n?([^\n]+)/i)
            const roomSize = extractField(/room\s+size\s*\n?([^\n]+)/i)
              ?? extractField(/superficie\s*\n?([^\n]+)/i)
            const roomView = extractField(/room\s+view\s*\n?([^\n]+)/i)
              ?? extractField(/vue\s*\n?([^\n]+)/i)
            const bathrooms = extractField(/number\s+of\s+bathrooms?\s*\n?([^\n]+)/i)
            const smoking = extractField(/smoking\s+policy\s*\n?([^\n]+)/i)
              ?? extractField(/tabac\s*\n?([^\n]+)/i)

            // Max occupancy — "Sleeps N" or "Max occupancy N"
            const sleepsMatch = cardText.match(/sleeps?\s+(\d+)|max(?:imum)?\s+occupancy[:\s]+(\d+)/i)
            const maxOccupancy = sleepsMatch ? parseInt(sleepsMatch[1] ?? sleepsMatch[2] ?? '0', 10) || null : null

            // Bed config fallback from "Sleeps" text
            const bedConfigFinal = bedConfig ?? extractField(/(\d+\s+\w+\s+bed[^\n,]*(?:,\s*\d+\s+\w+\s+bed[^\n,]*)*)/i)

            // Amenities — text items from amenity/feature list elements
            const amenitySet = new Set<string>()
            // Try to find the "Amenities" labelled section
            const amenSection = Array.from(card.querySelectorAll('[class*="amenity"], [class*="Amenity"]'))
            for (const el of amenSection) {
              const t = (el as HTMLElement).innerText?.trim().replace(/\s+/g, ' ')
              if (t && t.length > 2 && t.length < 60) amenitySet.add(t)
            }
            // Parse comma-separated amenities line if present
            const amenLine = cardText.match(/amenities?\s*\n([^\n]{10,})/i)
            if (amenLine?.[1]) {
              amenLine[1].split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 2 && s.length < 50)
                .forEach((s: string) => amenitySet.add(s))
            }
            // Fallback: li elements
            if (amenitySet.size === 0) {
              for (const el of Array.from(card.querySelectorAll('li'))) {
                const t = (el as HTMLElement).innerText?.trim().replace(/\s+/g, ' ')
                if (t && t.length > 2 && t.length < 50) amenitySet.add(t)
              }
            }

            // Add structured fields as pseudo-amenities if not in description
            if (roomSize) amenitySet.add(`Room size: ${roomSize}`)
            if (roomView) amenitySet.add(`View: ${roomView}`)
            if (bathrooms) amenitySet.add(`Bathrooms: ${bathrooms}`)
            if (smoking) amenitySet.add(`Smoking: ${smoking}`)

            const rates = Array.from(card.querySelectorAll(sel.rateRow)).map(r => {
              const boardCellText = r.querySelector(sel.boardCell)?.textContent?.trim() ?? ''
              const fullRowText = r.textContent ?? ''
              // Detect breakfast from the full row text when no explicit board cell
              // Detect meal type from rate row text — maps to board code keywords normaliseBoard understands
              const mealBoard = (() => {
                const t = fullRowText.toLowerCase()
                if (/all.?inclus|tout.?inclus|alles.?inklus|todo.?incluid/i.test(t)) return 'All Inclusive'
                if (/full.?board|pension.?compl|vollpension|pensi[oó]n.?complet|pens[aã]o.?complet/i.test(t)) return 'Full Board'
                if (/half.?board|demi.?pension|halbpension|media.?pens|mezza.?pens/i.test(t)) return 'Half Board'
                if (/breakfast|petit.?d[eé]j|b&b|bed.?&.?breakfast|fr[uü]hst[uü]ck|desayuno|colazione|prima.?col|ontbijt/i.test(t)) return 'Bed & Breakfast'
                if (/meal|repas|mahlzeit|comida|pasto|maal|lunch|dinner|d[iî]ner|mittagessen|abendessen|pranzo|cena|almuerzo/i.test(t)) return 'Bed & Breakfast' // unknown meal → assume BB
                return null
              })()
              const boardLabel = boardCellText || mealBoard || 'Room Only'
              // Capture detailed cancellation policy from expanded "More info" section
              const cancelCellText = r.querySelector(sel.cancelCell)?.textContent?.trim() ?? ''
              const cancelPolicyMatch = fullRowText.match(/(?:cancellation\s+policy|politique\s+d.annulation|stornierungsbedingunng)[:\s]*([^\n]{20,300})/i)
              const cancelText = cancelPolicyMatch?.[1]?.trim() ?? cancelCellText
              return {
                boardLabel,
                cancelText,
                isNonRefundable: /non.?refund|non.?rembours|nicht.?erstatt/i.test(fullRowText),
                pricePerNight: null, total: null, currency: null,
              }
            })
            return { name, description, images: imgs, amenities: Array.from(amenitySet).slice(0, 30), bedConfig: bedConfigFinal, maxOccupancy, rates }
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
