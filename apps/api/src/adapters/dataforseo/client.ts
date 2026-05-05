import { logger } from '../../utils/logger.js'

const MY_BUSINESS_INFO_URL = 'https://api.dataforseo.com/v3/business_data/google/my_business_info/live'
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
  title?: string
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

export interface HotelScoreFailure {
  reason: string
}

export type HotelScoreOutcome =
  | { ok: true; result: HotelScoreResult }
  | { ok: false; failure: HotelScoreFailure }

export async function fetchHotelScore(
  cid: string,
  login: string | undefined,
  password: string | undefined,
): Promise<HotelScoreOutcome> {
  if (!login || !password) {
    return { ok: false, failure: { reason: 'No credentials configured' } }
  }

  const credentials = Buffer.from(`${login}:${password}`).toString('base64')

  try {
    const res = await fetch(MY_BUSINESS_INFO_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ keyword: `cid:${cid}`, location_code: 2840, language_code: 'en' }]),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      logger.warn({ cid, status: res.status }, '[DataForSEO] HTTP error')
      return { ok: false, failure: { reason: `DataForSEO HTTP ${res.status}` } }
    }

    const data = await res.json() as DataForSEOResponse
    const task = data.tasks?.[0]
    if (!task || task.status_code !== 20000) {
      const code = task?.status_code ?? 'no task'
      logger.warn({ cid, taskStatus: code }, '[DataForSEO] Task error')
      return { ok: false, failure: { reason: `DataForSEO task error: ${code}` } }
    }

    const items = task.result?.[0]?.items ?? []
    const item = items.find(i => i.type === 'google_business_info')
    if (!item) {
      const types = items.map(i => i.type).join(', ') || 'none'
      logger.warn({ cid, itemTypes: types }, '[DataForSEO] No google_business_info item in response')
      return { ok: false, failure: { reason: `Business not found in Google Maps (got: ${types})` } }
    }
    if (!item.rating) {
      logger.warn({ cid, itemTitle: item.title }, '[DataForSEO] google_business_info found but has no rating')
      return { ok: false, failure: { reason: `Business found ("${item.title}") but has no rating` } }
    }

    logger.info({ cid, score: item.rating.value, reviewCount: item.rating.votes_count }, '[DataForSEO] Score fetched')
    return { ok: true, result: { score: item.rating.value, reviewCount: item.rating.votes_count } }
  } catch (err) {
    logger.warn({ cid, err }, '[DataForSEO] Fetch failed')
    return { ok: false, failure: { reason: err instanceof Error ? err.message : 'Fetch failed' } }
  }
}
