import { env } from '../env.js'
import { detectKnownIBE } from '@ibe/shared'
import { isOta, scoreCandidate, type HotelCandidate } from './hotel-search-utils.js'

export type { HotelCandidate }

const SERP_URL = 'https://api.dataforseo.com/v3/serp/google/organic/live/regular'

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

async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    return res.url || url
  } catch {
    return url
  }
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

    // Resolve redirects in parallel — catches parked domains that redirect to GoDaddy/Sedo
    const resolved = await Promise.all(
      organic.map(async item => {
        const url = item.url!
        if (isOta(url)) return null
        const finalUrl = await resolveRedirect(url)
        if (finalUrl !== url && isOta(finalUrl)) return null
        return item
      })
    )

    const SPAM_TITLE_PATTERNS = [
      'unofficial', 'not official', 'third party', 'third-party',
      'independent booking', 'hotel information and', 'price comparison',
    ]

    const candidates: HotelCandidate[] = []
    for (const item of resolved) {
      if (!item) continue
      const url = item.url!
      const titleLower = (item.title ?? '').toLowerCase()
      if (SPAM_TITLE_PATTERNS.some(p => titleLower.includes(p))) continue
      const detection = detectKnownIBE(url)
      const detected = detection !== null
      const score = scoreCandidate(url, item.title ?? '', hotelName, detected)
      candidates.push({ url, title: item.title ?? url, detected, screenshotUrl: null, score })
    }

    // Deduplicate by base domain — keep highest-scoring result per domain
    const byDomain = new Map<string, HotelCandidate>()
    for (const c of candidates.filter(c => c.score >= 30)) {
      try {
        const domain = new URL(c.url).hostname.replace(/^www\./, '')
        const existing = byDomain.get(domain)
        if (!existing || c.score > existing.score) byDomain.set(domain, c)
      } catch { byDomain.set(c.url, c) }
    }

    return Array.from(byDomain.values())
      .sort((a, b) => {
        if (a.detected !== b.detected) return a.detected ? -1 : 1
        return b.score - a.score
      })
      .slice(0, 6)
  } catch {
    return []
  }
}
