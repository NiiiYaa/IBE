import { cacheGet, cacheSet } from '../utils/cache.js'
import { logger } from '../utils/logger.js'

const FRANKFURTER_API = 'https://api.frankfurter.dev/v1/latest'
const FAWAZ_PRIMARY = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies'
const FAWAZ_FALLBACK = 'https://latest.currency-api.pages.dev/v1/currencies'
const CACHE_TTL = 6 * 60 * 60 // 6 hours — rates updated once per day

export type RateProvider = 'frankfurter' | 'fawazahmed0'

export interface ExchangeRates {
  base: string
  date: string
  rates: Record<string, number>
}

async function fetchFrankfurter(base: string): Promise<ExchangeRates> {
  const res = await fetch(`${FRANKFURTER_API}?from=${base}`, {
    headers: { 'Accept-Encoding': 'gzip', Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Frankfurter API returned ${res.status}`)
  const data = await res.json() as { base: string; date: string; rates: Record<string, number> }
  data.rates[base] = 1
  return { base, date: data.date, rates: data.rates }
}

async function fetchFawaz(base: string): Promise<ExchangeRates> {
  const baseLower = base.toLowerCase()
  for (const apiBase of [FAWAZ_PRIMARY, FAWAZ_FALLBACK]) {
    try {
      const res = await fetch(`${apiBase}/${baseLower}.min.json`, { headers: { Accept: 'application/json' } })
      if (!res.ok) continue
      const data = await res.json() as { date?: string; [key: string]: unknown }
      const rawRates = data[baseLower] as Record<string, number>
      const rates: Record<string, number> = {}
      for (const [k, v] of Object.entries(rawRates)) rates[k.toUpperCase()] = v
      rates[base] = 1
      return { base, date: (data.date as string | undefined) ?? new Date().toISOString().slice(0, 10), rates }
    } catch { continue }
  }
  throw new Error(`fawazahmed0 API unavailable for base currency ${base}`)
}

export async function getExchangeRates(base: string, provider: RateProvider = 'fawazahmed0'): Promise<ExchangeRates> {
  const key = `fx:${base}:${provider}`
  const cached = await cacheGet<ExchangeRates>(key)
  if (cached) return cached

  const result = provider === 'frankfurter' ? await fetchFrankfurter(base) : await fetchFawaz(base)
  await cacheSet(key, result, CACHE_TTL)
  logger.debug({ base, provider, currencies: Object.keys(result.rates).length }, '[Rates] Fetched exchange rates')
  return result
}
