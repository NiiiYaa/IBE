// Exact-match OTA domains — blocked regardless of hotel name
export const OTA_BLOCKLIST = [
  // Booking Holdings
  'booking.com', 'agoda.com', 'priceline.com', 'kayak.com', 'rentalcars.com', 'opentable.com',
  // Expedia Group
  'expedia.com', 'hotels.com', 'travelocity.com', 'orbitz.com', 'cheaptickets.com',
  'hotwire.com', 'wotif.com', 'trivago.com', 'ebookers.com',
  // Trip.com Group
  'trip.com', 'ctrip.com', 'skyscanner.com', 'skyscanner.net',
  // Metasearch & aggregators
  'tripadvisor.com', 'tripadvisor.co.uk', 'hotelscombined.com', 'wego.com',
  'momondo.com', 'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com',
  // Major OTAs
  'lastminute.com', 'edreams.com', 'opodo.com', 'hrs.com', 'hrs.de',
  'despegar.com', 'makemytrip.com', 'goibibo.com', 'rakuten.com',
  'laterooms.com', 'getaroom.com', 'traveloka.com', 'airbnb.com',
  'vrbo.com', 'hometogo.com', 'destinia.com', 'logitravel.com',
  // Generic directory / mirror sites
  'hotelmix.com', 'hotelmix.co.uk', 'booked.net', 'booked.com', 'reservations.com',
  'hotelscombined.com', 'hotelhunter.com', 'zenhotels.com', 'cozycozy.com',
  'lodging-world.com', 'hotel-dir.com', 'venere.com', 'hostelworld.com',
  'hotelworld.com', 'bedandbreakfast.com', 'bedandbreakfast.eu',
  'guestreservations.com', 'online-reservations.com', 'hotel.com', 'hotel.de',
  // Domain parking & for-sale pages
  'godaddy.com', 'sedo.com', 'dan.com', 'afternic.com',
  'parkingcrew.com', 'bodis.com', 'hugedomains.com', 'undeveloped.com',
  'squadhelp.com', 'brandbucket.com',
]

// Keyword patterns — block any domain containing these substrings (use sparingly — substring match)
// Exception: IBE providers (synxis, travelclick, simplebooking, etc.) are detected separately
// and must NOT appear here — they receive high scores via detectKnownIBE()
const OTA_KEYWORD_PATTERNS = [
  'hotelmix', 'zenhotels', 'cozycozy', 'hotelhunter', 'hotel-dir', 'lodging-world',
  'forsale.', 'for-sale.',
]

export const DIRECTORY_PATTERNS = [
  'hotelmix', 'zenhotels', 'cozycozy', 'hotelhunter', 'lodging-world',
  'hotel-dir', 'guestreservations', 'venere.com', 'hostelworld.com',
  'hotelworld.com', 'hotel-info',
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
    if (OTA_BLOCKLIST.some(ota => hostname === ota || hostname.endsWith('.' + ota))) return true
    if (OTA_KEYWORD_PATTERNS.some(kw => hostname.includes(kw))) return true
    return false
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
