import { env } from '../env.js'
import { detectKnownIBE } from '@ibe/shared'

const SERP_URL = 'https://api.dataforseo.com/v3/serp/google/organic/live/regular'

const OTA_BLOCKLIST = [
  'booking.com', 'expedia.com', 'hotels.com', 'tripadvisor.com', 'agoda.com',
  'airbnb.com', 'kayak.com', 'trivago.com', 'orbitz.com', 'priceline.com',
  'hotelscombined.com', 'travelocity.com', 'getaroom.com', 'wotif.com',
  'google.com', 'bing.com', 'yahoo.com',
  'lastminute.com', 'momondo.com', 'skyscanner.com', 'hrs.com',
  'guestreservations.com', 'reservations.com', 'hotelbeds.com',
]

function isOta(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return OTA_BLOCKLIST.some(ota => hostname === ota || hostname.endsWith('.' + ota))
  } catch { return false }
}

const DIRECTORY_PATTERNS = [
  'hotel-ds.com', 'barcelonahotel.org', 'hotelebarcelona.net', 'hotel-bb.com',
  'hotel.de', 'hotelworld.com', 'hostelworld.com', 'hotel-info.com', 'venere.com',
  'destinia.com', 'rumbo.com', 'logitravel.com',
]

function scoreCandidate(url: string, title: string, hotelName: string, detected: boolean): number {
  if (detected) return 92
  try {
    const u = new URL(url)
    const domain = u.hostname.toLowerCase().replace(/^www\./, '')
    const pathLower = u.pathname.toLowerCase()
    const words = hotelName.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    if (DIRECTORY_PATTERNS.some(d => domain.includes(d))) return 10
    let score = 20
    const matchCount = words.filter(w => domain.includes(w)).length
    if (matchCount >= 2) score += 40
    else if (matchCount === 1) score += 25
    const titleMatchCount = words.filter(w => title.toLowerCase().includes(w)).length
    if (titleMatchCount >= 2) score += 10
    if (/book|reserv|book-now|direct/i.test(pathLower)) score += 10
    if (domain.split('.').length === 2) score += 5
    return Math.min(score, 89)
  } catch { return 20 }
}

export interface HotelCandidate {
  url: string
  title: string
  detected: boolean
  screenshotUrl: string | null
  score: number
}

interface DataForSEOItem {
  type: string
  url?: string
  title?: string
  description?: string
}

interface DataForSEOResponse {
  tasks: Array<{
    status_code: number
    result: Array<{ items: DataForSEOItem[] }>
  }>
}

export async function searchHotelsDataForSEO(
  hotelName: string,
  city: string,
  country: string,
): Promise<HotelCandidate[]> {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return []

  const credentials = Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`).toString('base64')

  const location = [city, country].filter(Boolean).join(' ')
  const keyword = `"${hotelName}"${location ? ' ' + location : ''} official website -site:booking.com -site:tripadvisor.com -site:expedia.com -site:agoda.com -site:hotels.com -site:kayak.com`

  try {
    const res = await fetch(SERP_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ keyword, location_code: 2840, language_code: 'en', depth: 10 }]),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return []

    const data = await res.json() as DataForSEOResponse
    const task = data.tasks?.[0]
    if (!task || task.status_code !== 20000) return []

    const items = task.result?.[0]?.items ?? []
    const organic = items.filter(i => i.type === 'organic' && i.url)

    const candidates: HotelCandidate[] = []
    for (const item of organic) {
      const url = item.url!
      if (isOta(url)) continue
      const detection = detectKnownIBE(url)
      const detected = detection !== null
      const score = scoreCandidate(url, item.title ?? '', hotelName, detected)
      candidates.push({ url, title: item.title ?? url, detected, screenshotUrl: null, score })
    }

    return candidates.filter(c => c.score >= 20).slice(0, 6)
  } catch {
    return []
  }
}
