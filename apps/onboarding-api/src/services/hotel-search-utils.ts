export const OTA_BLOCKLIST = [
  // Major OTAs
  'booking.com', 'expedia.com', 'hotels.com', 'tripadvisor.com', 'agoda.com',
  'airbnb.com', 'kayak.com', 'trivago.com', 'orbitz.com', 'priceline.com',
  'hotelscombined.com', 'travelocity.com', 'getaroom.com', 'wotif.com',
  // Search engines & aggregators
  'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com',
  // Travel agencies & resellers
  'lastminute.com', 'momondo.com', 'skyscanner.com', 'hrs.com',
  'onthebeach.co.uk', 'laterooms.com', 'edreams.com', 'destinia.com',
  'rumbo.com', 'logitravel.com', 'atrápalo.com', 'liligo.com',
  // Hotel directories & portals
  'hotel-ds.com', 'hotel.de', 'hotelebarcelona.net', 'barcelonahotel.org',
  'hotel-bb.com', 'hotelworld.com', 'hostelworld.com', 'hotel-info.com',
  'venere.com', 'hotelbeds.com', 'hrs.de', 'hotel.com',
  'hoteldirect.co.uk', 'hoteldirect.com', 'bedandbreakfast.com', 'bedandbreakfast.eu', 'bnb.com',
  'barcelonahotels.com', 'barcelonahotels.es', 'mybarcelona.cat', 'mybarcelona.com', 'spain-holiday.com',
  'hotelbcn-barcelona.com', 'hotels-in-catalonia.com', 'hotelsbarcelonaes.com',
  'guestreservations.com', 'reservations.com',
  'wheeltheworld.com', 'barcelonayellow.com',
]

export const DIRECTORY_PATTERNS = [
  'hotel-ds.com', 'barcelonahotel.org', 'hotelebarcelona.net', 'hotel-bb.com',
  'hotel.de', 'hotelworld.com', 'hostelworld.com', 'hotel-info.com', 'venere.com',
  'destinia.com', 'rumbo.com', 'logitravel.com',
]

export interface HotelCandidate {
  url: string
  title: string
  detected: boolean
  screenshotUrl: string | null
  score: number // 0-100 confidence this is the hotel's own website/IBE
}

export function isOta(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return OTA_BLOCKLIST.some(ota => hostname === ota || hostname.endsWith('.' + ota))
  } catch { return false }
}

export function scoreCandidate(url: string, title: string, hotelName: string, detected: boolean): number {
  if (detected) return 92
  try {
    const u = new URL(url)
    const domain = u.hostname.toLowerCase().replace(/^www\./, '')
    const pathLower = u.pathname.toLowerCase()
    const words = hotelName.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    // Penalise known directory/reseller domains
    if (DIRECTORY_PATTERNS.some(d => domain.includes(d))) return 10
    let score = 20
    // Words from hotel name in domain
    const matchCount = words.filter(w => domain.includes(w)).length
    if (matchCount >= 2) score += 40
    else if (matchCount === 1) score += 25
    // Words in title
    const titleMatchCount = words.filter(w => title.toLowerCase().includes(w)).length
    if (titleMatchCount >= 2) score += 10
    // Booking-related path → direct booking engine
    if (/book|reserv|book-now|direct/i.test(pathLower)) score += 10
    // Looks like a hotel chain or brand site (short domain, e.g. h10hotels.com)
    if (domain.split('.').length === 2) score += 5
    return Math.min(score, 89) // cap below IBE-detected
  } catch { return 20 }
}
