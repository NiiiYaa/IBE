/**
 * HyperGuest Search adapter.
 * Builds the search URL, calls the API, and returns the raw response.
 * Caches results by a deterministic key for the configured TTL.
 */

import type { HGSearchResponse, SearchParams } from '@ibe/shared'
import { toHyperGuestGuestsParam } from '@ibe/shared'
import { env } from '../../config/env.js'
import { cacheGet, cacheSet } from '../../utils/cache.js'
import { logger } from '../../utils/logger.js'
import { hgGet } from './client.js'
import { mockSearchAvailability } from './mock/mock-adapter.js'
import { getHGCredentialsForProperty } from '../../services/credentials.service.js'

const MOCK = process.env['HYPERGUEST_MOCK'] === 'true'

/**
 * Builds the search URL from IBE search params.
 * All parameters are encoded properly.
 */
async function buildSearchUrl(params: SearchParams, searchDomain: string): Promise<string> {
  const guestsParam = toHyperGuestGuestsParam(params.rooms)
  const nights = nightsBetween(params.checkIn, params.checkOut)

  const qs = new URLSearchParams({
    checkIn: params.checkIn,
    nights: String(nights),
    guests: guestsParam,
    hotelIds: String(params.hotelId),
  })

  if (params.nationality) qs.set('customerNationality', params.nationality)
  if (params.currency) qs.set('currency', params.currency)

  return `https://${searchDomain}/2.0/?${qs.toString()}`
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return (Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000
}

/**
 * Builds a deterministic cache key from search params.
 * promoCode is intentionally excluded from the cache key so promo responses
 * are not shared with non-promo requests.
 */
function buildCacheKey(params: SearchParams): string {
  const guestsParam = toHyperGuestGuestsParam(params.rooms)
  return [
    'hg:search',
    params.hotelId,
    params.checkIn,
    params.checkOut,
    guestsParam,
    params.nationality ?? 'XX',
    params.currency ?? 'default',
  ].join(':')
}

/**
 * Searches for availability via HyperGuest.
 * Returns the raw HyperGuest search response.
 */
export async function searchAvailability(
  params: SearchParams,
  meta?: Array<{ key: string; value: string }>,
): Promise<HGSearchResponse> {
  if (MOCK) return mockSearchAvailability(params)

  const cacheKey = buildCacheKey(params)

  const cached = await cacheGet<HGSearchResponse>(cacheKey)
  if (cached) {
    logger.debug({ hotelId: params.hotelId, checkIn: params.checkIn }, '[Search] Cache hit')
    return cached
  }

  const creds = await getHGCredentialsForProperty(params.hotelId)
  const url = await buildSearchUrl(params, creds.searchDomain)
  logger.info({ hotelId: params.hotelId, checkIn: params.checkIn, nights: nightsBetween(params.checkIn, params.checkOut) }, '[Search] Calling HyperGuest')

  const response = await hgGet<HGSearchResponse>(url, creds)

  // Only cache responses with actual results
  if (response.results.length > 0) {
    await cacheSet(cacheKey, response, env.SEARCH_CACHE_TTL)
  }

  logger.info(
    { hotelId: params.hotelId, resultCount: response.results.length },
    '[Search] Response received',
  )

  return response
}
