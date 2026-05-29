export interface KnownIBEDetection {
  name: string
  externalHotelId: string
  searchTemplate: string
  bookingTemplate: string
  /** true when bot protection blocks automated scraping; booking template = search template */
  noScraping?: boolean
  /** Original hotel IBE URL used when this pattern was first investigated */
  sampleUrl?: string
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
  /** Original hotel IBE URL used when this pattern was first investigated */
  sampleUrl?: string
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
    sampleUrl: 'https://booking.sentec.io/hotel/CERUGZNM22C3CH/rooms?lang=en-US&cur=IDR&in=2026-11-17&out=2026-11-20&guests=A,A',
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
      // chain-level URL (level=chain) has no hotel param; hotel-level URL has both
      return p.has('sbe_rc') || (p.has('chain') && p.has('arrive') && p.has('depart'))
    },
    extractHotelId(_url, p) {
      // hotel param is present on hotel-level URLs; chain param is the fallback for chain-level
      return p.get('hotel') ?? p.get('chain')
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
  {
    // WebHotelier (reserve-online.net) — Greek/Mediterranean hotel booking SaaS.
    // Each hotel gets a subdomain on reserve-online.net; the subdomain IS the hotel identifier.
    // Uses `nights` (duration) instead of a checkout date. noScraping: CloudFront WAF blocks headless browsers.
    name: 'WebHotelier',
    domainPattern: /^https?:\/\/[^.]+\.reserve-online\.net\//,
    extractHotelId(url) {
      return new URL(url).hostname.split('.')[0] ?? null
    },
    searchTemplate: 'https://{externalHotelId}.reserve-online.net/?checkin={checkIn}&nights={nights}&rooms=1&adults={adults}&children=0&infants=0',
    bookingTemplate: 'https://{externalHotelId}.reserve-online.net/?checkin={checkIn}&nights={nights}&rooms=1&adults={adults}&children=0&infants=0',
    noScraping: true,
  },
  {
    // Hotels of Mykonos — Greek island hotel booking portal (hotelsofmykonos.com).
    // Hundreds of hotels, each with a unique subdomain; the subdomain prefix is the hotel identifier.
    // `clirder` = rooms count. Date format: YYYY-MM-DD. noScraping: headless browsers get 410.
    name: 'Hotels of Mykonos',
    domainPattern: /^https?:\/\/[^.]+\.hotelsofmykonos\.com\//,
    extractHotelId(url) {
      return new URL(url).hostname.split('.')[0] ?? null
    },
    searchTemplate: 'https://{externalHotelId}.hotelsofmykonos.com/en/?from={checkIn}&to={checkOut}&adults={adults}&children=0&clirder=1#rooms',
    bookingTemplate: 'https://{externalHotelId}.hotelsofmykonos.com/en/?from={checkIn}&to={checkOut}&adults={adults}&children=0&clirder=1#rooms',
    noScraping: true,
  },
  {
    // Zenith Hotels (Malaysia) — custom ASP.NET system used across 4 Zenith properties.
    // Each property is a sub-path on thezenithhotel.com; the path prefix IS the hotel identifier.
    // Dates: DD/MM/YYYY (URL-encoded slashes). noScraping: session-based checkout after room selection.
    name: 'Zenith Hotels (MY)',
    domainPattern: /^https?:\/\/www\.thezenithhotel\.com\//,
    extractHotelId(url) {
      return new URL(url).pathname.match(/^(\/[^?#]*\/)AvailabilitySearchRoom\.aspx/)?.[1] ?? null
    },
    searchTemplate(url) {
      const origin = new URL(url).origin
      return `${origin}{externalHotelId}AvailabilitySearchRoom.aspx?checkindate={checkInDMY}&checkoutdate={checkOutDMY}&adults={adults}&rooms=1`
    },
    bookingTemplate(url) {
      const origin = new URL(url).origin
      return `${origin}{externalHotelId}AvailabilitySearchRoom.aspx?checkindate={checkInDMY}&checkoutdate={checkOutDMY}&adults={adults}&rooms=1`
    },
    noScraping: true,
  },
  {
    // Lighthouse Commerce — UK/Europe IBE, always served from their canonical bookingengine.mylighthouse.com.
    // Hotel identifier is a slug in the URL path. No explicit adults param.
    // Date format: YYYY-M-D (non-zero-padded); {checkIn} (YYYY-MM-DD) is accepted.
    // noScraping: Cloudflare Turnstile managed challenge blocks all automated access.
    name: 'Lighthouse',
    domainPattern: /^https?:\/\/bookingengine\.mylighthouse\.com\//,
    extractHotelId(url) {
      return new URL(url).pathname.split('/').filter(Boolean)[0] ?? null
    },
    searchTemplate: 'https://bookingengine.mylighthouse.com/{externalHotelId}/Rooms/Select?Arrival={checkIn}&Departure={checkOut}&Room=&Rate=&Package=&DiscountCode=',
    bookingTemplate: 'https://bookingengine.mylighthouse.com/{externalHotelId}/Rooms/Select?Arrival={checkIn}&Departure={checkOut}&Room=&Rate=&Package=&DiscountCode=',
    noScraping: true,
  },
  {
    // Clock PMS (clock-software.com) — cloud PMS/booking engine popular in Europe.
    // Served from region-specific subdomains: sky-eu1, sky-eu2, sky-us1, etc.
    // Hotel ID is in the hash fragment: /spa/pms-wbe/#/hotel/{id}
    // noScraping: SPA requires JS execution; hash routing not accessible via static fetch.
    name: 'Clock PMS',
    domainPattern: /^https?:\/\/[^.]+\.clock-software\.com\/spa\/pms-wbe\//,
    extractHotelId(url) {
      return new URL(url).hash.match(/#\/hotel\/(\d+)/)?.[1] ?? null
    },
    searchTemplate: 'https://sky-eu1.clock-software.com/spa/pms-wbe/#/hotel/{externalHotelId}',
    bookingTemplate: 'https://sky-eu1.clock-software.com/spa/pms-wbe/#/hotel/{externalHotelId}',
    noScraping: true,
    sampleUrl: 'https://sky-eu1.clock-software.com/spa/pms-wbe/#/hotel/14057',
  },
  {
    // TravelClick (Amadeus Hospitality iHotelier) — always white-labeled on the hotel's own domain.
    // Detected by datein+dateout+languageid query params with a numeric hotel code in the URL path.
    // Dates are MM/DD/YYYY. noScraping: AngularJS app requires a live browser session.
    name: 'TravelClick',
    paramFingerprint(p, url) {
      const path = new URL(url).pathname
      return p.has('datein') && p.has('dateout') && p.has('languageid') && /\/\d+\/?$/.test(path)
    },
    extractHotelId(url) {
      return new URL(url).pathname.match(/\/(\d+)\/?$/)?.[1] ?? null
    },
    searchTemplate(url) {
      return `${new URL(url).origin}/{externalHotelId}?languageid=1&datein={checkInMDY}&dateout={checkOutMDY}&adults={adults}#/guestsandrooms`
    },
    bookingTemplate(url) {
      return `${new URL(url).origin}/{externalHotelId}?languageid=1&datein={checkInMDY}&dateout={checkOutMDY}&adults={adults}#/guestsandrooms`
    },
    noScraping: true,
  },
  {
    // Hotetec — Spanish IBE, always white-labeled on the hotel's own domain.
    // The page embeds scripts from hotel.new.hotetec.com. The hotel ID is the numeric
    // `bookingEngine` query param (hardcoded in the page's inline script).
    // The `availability` param is a JSON object; we URL-encode it to avoid the cleanup
    // step stripping it (literal `{` chars confuse the unreplaced-token filter).
    // noScraping: React app requires a live browser session (checkCustomerWebSessionId) to render.
    name: 'Hotetec',
    paramFingerprint(p) {
      const be = p.get('bookingEngine')
      return be !== null && /^\d+$/.test(be)
    },
    extractHotelId(_url, p) {
      return p.get('bookingEngine')
    },
    searchTemplate(url) {
      const u = new URL(url)
      const base = u.origin + u.pathname
      // %7B = { %22 = " %3A = : %2C = , %7D = }
      return `${base}?availability=%7B%22dateFrom%22%3A%22{checkIn}%22%2C%22dateTo%22%3A%22{checkOut}%22%2C%22execute%22%3Atrue%7D&bookingEngine={externalHotelId}`
    },
    bookingTemplate(url) {
      const u = new URL(url)
      const base = u.origin + u.pathname
      return `${base}?availability=%7B%22dateFrom%22%3A%22{checkIn}%22%2C%22dateTo%22%3A%22{checkOut}%22%2C%22execute%22%3Atrue%7D&bookingEngine={externalHotelId}`
    },
    noScraping: true,
  },
]

/**
 * Given a URL and a search template (containing `{externalHotelId}` and other
 * `{placeholder}` tokens), extracts the hotel ID value from the URL.
 * Returns null if the template has no `{externalHotelId}` or the URL doesn't match.
 */
export function extractHotelIdFromUrl(url: string, template: string): string | null {
  try {
    if (!template.includes('{externalHotelId}')) return null
    const WILD = '\x00WILD\x00'
    // Replace other {placeholders} with a neutral marker before escaping
    const withWild = template
      .replace(/\{[^}]+\}/g, WILD)
      .replace(WILD, '{externalHotelId}') // restore the one we want to capture (first occurrence)
    const parts = withWild.split('{externalHotelId}')
    if (parts.length !== 2) return null
    const escape = (s: string) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(new RegExp(WILD.replace(/\x00/g, '\\x00'), 'g'), '[^/?&#]*')
    const pattern = new RegExp(`${escape(parts[0]!)}([^/?&#]+)${escape(parts[1]!)}`)
    return url.match(pattern)?.[1] ?? null
  } catch {
    return null
  }
}

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
      ...(entry.sampleUrl ? { sampleUrl: entry.sampleUrl } : {}),
    }
  }
  return null
}

export interface KnownIBEPattern {
  name: string
  sampleUrl: string | null
}

export function listKnownIBEPatterns(): KnownIBEPattern[] {
  return registry.map(e => ({ name: e.name, sampleUrl: e.sampleUrl ?? null }))
}
