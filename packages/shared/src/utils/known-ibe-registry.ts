export interface KnownIBEDetection {
  name: string
  externalHotelId: string
  searchTemplate: string
  bookingTemplate: string
  /** true when bot protection blocks automated scraping; booking template = search template */
  noScraping?: boolean
}

type TemplateFactory = string | ((url: string) => string)

interface KnownIBEEntry {
  name: string
  /** Match by domain/path — for IBEs that always use their own canonical domain. */
  domainPattern?: RegExp
  /** Match by query-parameter fingerprint — for IBEs white-labeled on custom domains. */
  paramFingerprint?: (params: URLSearchParams, url: string) => boolean
  extractHotelId: (url: string, params: URLSearchParams) => string | null
  searchTemplate: TemplateFactory
  bookingTemplate: TemplateFactory
  noScraping?: boolean
}

function resolve(factory: TemplateFactory, url: string): string {
  return typeof factory === 'function' ? factory(url) : factory
}

function safeParams(url: string): URLSearchParams | null {
  try { return new URL(url).searchParams }
  catch { return null }
}

const registry: KnownIBEEntry[] = [
  {
    name: 'Sentec',
    domainPattern: /^https?:\/\/booking\.sentec\.io\/hotel\/([^/?#]+)/,
    extractHotelId(url) {
      return this.domainPattern!.exec(url)?.[1] ?? null
    },
    searchTemplate: 'https://booking.sentec.io/hotel/{externalHotelId}/rooms?lang=en-US&cur={currency}&in={checkIn}&out={checkOut}&guests={guests}',
    bookingTemplate: 'https://booking.sentec.io/hotel/{externalHotelId}/solution/{solutionId}/guest?lang=en-US&cur={currency}&in={checkIn}&out={checkOut}&guests={guests}',
  },
  {
    name: 'SimpleBooking.it',
    domainPattern: /^https?:\/\/(?:www\.)?simplebooking\.it\/ibe2\/hotel\/([^/?#]+)/,
    extractHotelId(url) {
      return this.domainPattern!.exec(url)?.[1] ?? null
    },
    searchTemplate: 'https://www.simplebooking.it/ibe2/hotel/{externalHotelId}?lang=EN&cur={currency}&in={checkIn}&out={checkOut}&guests={guests}',
    bookingTemplate: 'https://www.simplebooking.it/ibe2/hotel/{externalHotelId}/your-solution/{solutionId}/services?lang=EN&cur={currency}&in={checkIn}&out={checkOut}&guests={guests}',
  },
  {
    name: 'direct-book.com',
    domainPattern: /^https?:\/\/(?:www\.)?direct-book\.com\/properties\/([^/?#]+)/,
    extractHotelId(url) {
      const m = this.domainPattern!.exec(url)
      if (!m) return null
      const afterSlug = url.slice(url.indexOf(m[1]!) + m[1]!.length)
      if (/^\/(about|contact|policies)/.test(afterSlug)) return null
      return m[1]!
    },
    searchTemplate: 'https://direct-book.com/properties/{externalHotelId}?locale=en&checkInDate={checkIn}&checkOutDate={checkOut}&items[0][adults]={adults}&items[0][children]=0&items[0][infants]=0&currency={currency}&trackPage=yes',
    bookingTemplate: 'https://direct-book.com/properties/{externalHotelId}/book?locale=en&checkInDate={checkIn}&checkOutDate={checkOut}&items[0][adults]={adults}&items[0][children]=0&items[0][infants]=0&items[0][rateId]={solutionId}&currency={currency}&trackPage=yes&selected=0&step=step1',
  },
  {
    // BookingExpert — Italian IBE, also white-labeled on custom domains.
    // Detected by param fingerprint (layout+winding+isnewsearch+step path) so it works on any domain.
    // Guest-type ID varies per hotel (embedded in guesttypes[0][ID] param) — captured at detection time.
    // Dates are Unix ms timestamps. Booking requires server-side session after room selection → noScraping.
    name: 'BookingExpert',
    domainPattern: /^https?:\/\/be\.bookingexpert\.it\//,
    paramFingerprint(p, url) {
      return p.has('layout') && p.has('winding') && p.has('isnewsearch') && /\/book\/simple\/step\d/.test(url)
    },
    extractHotelId(_url, p) {
      return p.get('layout')
    },
    searchTemplate(url) {
      const origin = new URL(url).origin
      const guestTypeId = url.match(/guesttypes\[0\]\[(\d+)\]/)?.[1] ?? ''
      const guestParam = guestTypeId ? `guesttypes[0][${guestTypeId}]={adults}&` : ''
      return `${origin}/book/simple/step2?checkin={checkInMs}&checkout={checkOutMs}&${guestParam}layout={externalHotelId}&lang=en&currency={currency}&beginsearch=1&isnewsearch=1`
    },
    bookingTemplate(url) {
      const origin = new URL(url).origin
      const guestTypeId = url.match(/guesttypes\[0\]\[(\d+)\]/)?.[1] ?? ''
      const guestParam = guestTypeId ? `guesttypes[0][${guestTypeId}]={adults}&` : ''
      return `${origin}/book/simple/step2?checkin={checkInMs}&checkout={checkOutMs}&${guestParam}layout={externalHotelId}&lang=en&currency={currency}&beginsearch=1&isnewsearch=1`
    },
    noScraping: true,
  },
  {
    // Falkensteiner — chain's own website. Hotel slug is the path segment before /book/.
    // ratePlanId is a pre-filter (not required). Dates are MM/DD/YYYY. noScraping (session-based checkout).
    name: 'Falkensteiner',
    domainPattern: /^https?:\/\/(?:www\.)?falkensteiner\.com\//,
    extractHotelId(url) {
      return url.match(/\/en\/([^/]+)\/book\//)?.[1] ?? null
    },
    searchTemplate: 'https://www.falkensteiner.com/en/{externalHotelId}/book/accommodations?adults={adults}&children=0&children2=0&currency={currency}&dateIn={checkInMDY}&dateOut={checkOutMDY}&domain=search.falkensteiner.com&languageId=1&portal=FHG&rooms=1&theme_code=000000',
    bookingTemplate: 'https://www.falkensteiner.com/en/{externalHotelId}/book/accommodations?adults={adults}&children=0&children2=0&currency={currency}&dateIn={checkInMDY}&dateOut={checkOutMDY}&domain=search.falkensteiner.com&languageId=1&portal=FHG&rooms=1&theme_code=000000',
    noScraping: true,
  },
  {
    // BookSecure — used across European hotel groups on book-secure.com.
    // Booking step only changes s=results → s=validate-collect (same params, no solutionId).
    // stid/cluster/hname params in real URLs are tracking noise — not required.
    name: 'BookSecure',
    domainPattern: /^https?:\/\/(?:www\.)?book-secure\.com\//,
    extractHotelId(_url, p) {
      return p.get('property')
    },
    searchTemplate: 'https://www.book-secure.com/index.php?s=results&property={externalHotelId}&arrival={checkIn}&departure={checkOut}&adults1={adults}&children1=0&locale=en_GB&currency={currency}',
    bookingTemplate: 'https://www.book-secure.com/index.php?s=results&property={externalHotelId}&arrival={checkIn}&departure={checkOut}&adults1={adults}&children1=0&locale=en_GB&currency={currency}',
    noScraping: true,
  },
  {
    // Sabre SynXis — heavily white-labeled; detected by param fingerprint regardless of domain.
    // sbe_rc is SynXis-specific (base64 UUID session token).
    // For search pages without sbe_rc: chain+hotel+arrive+depart together are unique to SynXis.
    name: 'Sabre SynXis',
    paramFingerprint(p) {
      return p.has('sbe_rc') || (p.has('chain') && p.has('hotel') && p.has('arrive') && p.has('depart'))
    },
    extractHotelId(_url, p) {
      return p.get('hotel')
    },
    searchTemplate(url) {
      const p = safeParams(url)
      const chain = p?.get('chain') ?? ''
      const locale = p?.get('locale') ?? 'en-US'
      return `${new URL(url).origin}/?adult={adults}&arrive={checkIn}&chain=${chain}&child=0&currency={currency}&depart={checkOut}&hotel={externalHotelId}&level=hotel&locale=${locale}&productcurrency={currency}&rooms=1`
    },
    // No {solutionId}: SynXis uses Kasada bot protection on its createReservation API —
    // headless browsers cannot obtain the sbe_rc session token. Booking template = search URL.
    bookingTemplate(url) {
      const p = safeParams(url)
      const chain = p?.get('chain') ?? ''
      const locale = p?.get('locale') ?? 'en-US'
      return `${new URL(url).origin}/?adult={adults}&arrive={checkIn}&chain=${chain}&child=0&currency={currency}&depart={checkOut}&hotel={externalHotelId}&level=hotel&locale=${locale}&productcurrency={currency}&rooms=1`
    },
    noScraping: true,
  },
]

export function detectKnownIBE(url: string): KnownIBEDetection | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const params = safeParams(trimmed)

  for (const entry of registry) {
    const matched =
      (entry.domainPattern?.test(trimmed) ?? false) ||
      (params !== null && (entry.paramFingerprint?.(params, trimmed) ?? false))

    if (!matched) continue

    const hotelId = entry.extractHotelId(trimmed, params ?? new URLSearchParams())
    if (!hotelId) continue

    return {
      name: entry.name,
      externalHotelId: hotelId,
      searchTemplate: resolve(entry.searchTemplate, trimmed),
      bookingTemplate: resolve(entry.bookingTemplate, trimmed),
      ...(entry.noScraping ? { noScraping: true as const } : {}),
    }
  }
  return null
}
