import { cacheGet, cacheSet } from '../utils/cache.js'
import { logger } from '../utils/logger.js'

const RATES_API = 'https://api.frankfurter.dev/v1/latest'
const CACHE_TTL = 6 * 60 * 60 // 6 hours — ECB updates once per day

export interface ExchangeRates {
  base: string
  date: string
  rates: Record<string, number>
}

export async function getExchangeRates(base: string): Promise<ExchangeRates> {
  const key = `fx:${base}`
  const cached = await cacheGet<ExchangeRates>(key)
  if (cached) return cached

  const res = await fetch(`${RATES_API}?from=${base}`, {
    headers: { 'Accept-Encoding': 'gzip', Accept: 'application/json' },
  })

  if (!res.ok) throw new Error(`Exchange rates API returned ${res.status}`)

  const data = (await res.json()) as ExchangeRates
  // Self-rate: base → base is always 1
  data.rates[base] = 1

  await cacheSet(key, data, CACHE_TTL)
  logger.debug({ base, date: data.date }, '[Rates] Fetched exchange rates')
  return data
}
