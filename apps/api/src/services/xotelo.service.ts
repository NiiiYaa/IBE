import { logger } from '../utils/logger.js'
import type { OtaPriceResult } from '@ibe/shared'

const XOTELO_API = 'https://data.xotelo.com/api/rates'

interface XoteloRate {
  code: string
  name: string
  rate: number
  tax?: number
}

interface XoteloResponse {
  error: string | null
  result: {
    chk_in: string
    chk_out: string
    currency: string
    rates: XoteloRate[]
  } | null
  timestamp: number
}

export async function fetchXoteloRates(
  hotelKey: string,
  checkin: string,
  checkout: string,
): Promise<OtaPriceResult[]> {
  const url = `${XOTELO_API}?hotel_key=${encodeURIComponent(hotelKey)}&chk_in=${checkin}&chk_out=${checkout}`

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      logger.warn({ hotelKey, status: res.status }, '[Xotelo] HTTP error')
      return []
    }

    const data = await res.json() as XoteloResponse

    if (data.error || !data.result?.rates) {
      logger.warn({ hotelKey, error: data.error }, '[Xotelo] API error')
      return []
    }

    logger.info({ hotelKey, count: data.result.rates.length }, '[Xotelo] Fetched rates')

    return data.result.rates.map(r => ({
      otaId: 0,
      otaName: r.name,
      price: r.rate + (r.tax ?? 0),
      currency: data.result!.currency ?? 'USD',
      status: 'ok' as const,
    }))
  } catch (err) {
    logger.warn({ hotelKey, err }, '[Xotelo] Fetch failed')
    return []
  }
}
