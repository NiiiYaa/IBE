import { logger } from '../../utils/logger.js'

const DATAFORSEO_URL = 'https://api.dataforseo.com/v3/business_data/google/hotel_info/live/advanced'
const DATAFORSEO_USER_DATA_URL = 'https://api.dataforseo.com/v3/appendix/user_data'

export async function testDataForSEOConnection(
  login: string | undefined,
  password: string | undefined,
): Promise<{ success: boolean; error?: string }> {
  if (!login || !password) return { success: false, error: 'No credentials configured' }
  const credentials = Buffer.from(`${login}:${password}`).toString('base64')
  try {
    const res = await fetch(DATAFORSEO_USER_DATA_URL, {
      headers: { 'Authorization': `Basic ${credentials}` },
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 401 || res.status === 403) return { success: false, error: 'Invalid credentials' }
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    return { success: true }
  } catch (err) {
    logger.warn({ err }, '[DataForSEO] Connection test failed')
    return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
  }
}

interface DataForSEORating {
  value: number
  votes_count: number
}

interface DataForSEOItem {
  type: string
  title: string
  rating?: DataForSEORating
}

interface DataForSEOResponse {
  tasks: Array<{
    status_code: number
    result: Array<{
      items: DataForSEOItem[]
    }>
  }>
}

export interface HotelScoreResult {
  score: number
  reviewCount: number
}

export async function fetchHotelScore(
  hotelName: string,
  cityName: string,
  countryCode: string,
  login: string | undefined,
  password: string | undefined,
): Promise<HotelScoreResult | null> {
  if (!login || !password) {
    logger.debug('[DataForSEO] No credentials configured, skipping')
    return null
  }

  const credentials = Buffer.from(`${login}:${password}`).toString('base64')
  const locationName = `${cityName},${countryCode}`

  try {
    const res = await fetch(DATAFORSEO_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        hotel_identifier: hotelName,
        location_name: locationName,
        language_name: 'English',
      }]),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      logger.warn({ hotelName, status: res.status }, '[DataForSEO] HTTP error')
      return null
    }

    const data = await res.json() as DataForSEOResponse
    const task = data.tasks?.[0]
    if (!task || task.status_code !== 20000) {
      logger.warn({ hotelName, taskStatus: task?.status_code }, '[DataForSEO] Task error')
      return null
    }

    const item = task.result?.[0]?.items?.find(i => i.type === 'hotel_info')
    if (!item?.rating) {
      logger.info({ hotelName, locationName }, '[DataForSEO] No hotel_info item found')
      return null
    }

    logger.info({ hotelName, score: item.rating.value, reviewCount: item.rating.votes_count }, '[DataForSEO] Score fetched')
    return { score: item.rating.value, reviewCount: item.rating.votes_count }
  } catch (err) {
    logger.warn({ hotelName, err }, '[DataForSEO] Fetch failed')
    return null
  }
}
