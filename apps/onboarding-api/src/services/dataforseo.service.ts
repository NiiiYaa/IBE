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
      body: JSON.stringify([{ keyword, language_code: 'en', depth: 10 }]),
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

    return candidates
      .filter(c => c.score >= 20)
      .sort((a, b) => {
        if (a.detected !== b.detected) return a.detected ? -1 : 1
        return b.score - a.score
      })
      .slice(0, 6)
  } catch {
    return []
  }
}
