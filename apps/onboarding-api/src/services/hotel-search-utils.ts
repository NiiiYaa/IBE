import { getCachedBlockedDomains, isBlockedByList } from './blocked-domains.service.js'

// Keep for CompSet's directory detection (not part of the OTA blocklist)
export const DIRECTORY_PATTERNS = [
  'hotelmix', 'zenhotels', 'cozycozy', 'hotelhunter', 'lodging-world',
  'hotel-dir', 'guestreservations', 'venere.com', 'hostelworld.com',
  'hotelworld.com', 'hotel-info',
]

export interface HotelCandidate {
  url: string
  title: string
  detected: boolean
  ibeName: string | null
  screenshotUrl: string | null
  score: number
}

// Synchronous OTA check — reads from the in-memory cache loaded at search start.
// Always pre-load the cache (await getBlockedDomains()) before calling this.
export function isOta(url: string, searchCountry?: string): boolean {
  return isBlockedByList(url, getCachedBlockedDomains(), searchCountry)
}

export function scoreCandidate(url: string, title: string, hotelName: string, detected: boolean): number {
  if (detected) return 92
  try {
    const u = new URL(url)
    const domain = u.hostname.toLowerCase().replace(/^www\./, '')
    const pathLower = u.pathname.toLowerCase()
    const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const words = normalize(hotelName).split(/\s+/).filter(w => w.length > 2)
    const domainNorm = normalize(domain)
    if (DIRECTORY_PATTERNS.some(d => domain.includes(d))) return 10
    let score = 20
    const matchCount = words.filter(w => domainNorm.includes(w)).length
    if (matchCount >= 2) score += 40
    else if (matchCount === 1) score += 25
    const titleMatchCount = words.filter(w => title.toLowerCase().includes(w)).length
    if (titleMatchCount >= 2) score += 10
    if (/book|reserv|book-now|direct/i.test(pathLower)) score += 10
    if (domain.split('.').length === 2) score += 5
    return Math.min(score, 89)
  } catch { return 20 }
}
