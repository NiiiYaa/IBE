/**
 * HyperGuest Static Data adapter.
 * Retrieves hotel list and per-hotel static data (descriptions, images, facilities, rooms).
 */

import type { HGHotelListItem, HGPropertyStatic } from '@ibe/shared'
import { STATIC_DATA_CACHE_TTL_SECONDS, HOTEL_LIST_CACHE_TTL_SECONDS } from '@ibe/shared'
import { cacheGet, cacheSet } from '../../utils/cache.js'
import { logger } from '../../utils/logger.js'
import { hgGet } from './client.js'
import { mockFetchPropertyStatic } from './mock/mock-adapter.js'
import { getHGCredentials, getHGCredentialsForProperty } from '../../services/credentials.service.js'

const MOCK = process.env['HYPERGUEST_MOCK'] === 'true'

const CACHE_KEY_HOTEL_LIST = 'hg:static:hotel_list'
const cacheKeyProperty = (id: number) => `hg:static:property:${id}`

/**
 * Fetches the full hotel list from HyperGuest.
 * Result is cached for HOTEL_LIST_CACHE_TTL_SECONDS.
 */
export async function fetchHotelList(): Promise<HGHotelListItem[]> {
  const cached = await cacheGet<HGHotelListItem[]>(CACHE_KEY_HOTEL_LIST)
  if (cached) return cached

  const { staticDomain } = await getHGCredentials()
  const url = `https://${staticDomain}/hotels.json`
  logger.info({ url }, '[Static] Fetching hotel list')

  const data = await hgGet<HGHotelListItem[]>(url)

  await cacheSet(CACHE_KEY_HOTEL_LIST, data, HOTEL_LIST_CACHE_TTL_SECONDS)
  logger.info({ count: data.length }, '[Static] Hotel list fetched and cached')

  return data
}

/**
 * Fetches full static data for a single property.
 * Result is cached for STATIC_DATA_CACHE_TTL_SECONDS.
 */
export async function fetchPropertyStatic(propertyId: number): Promise<HGPropertyStatic> {
  if (MOCK) return mockFetchPropertyStatic(propertyId)

  const cacheKey = cacheKeyProperty(propertyId)
  const cached = await cacheGet<HGPropertyStatic>(cacheKey)
  if (cached) {
    logger.debug({ propertyId }, '[Static] Cache hit for property')
    return cached
  }

  const creds = await getHGCredentialsForProperty(propertyId)
  const url = `https://${creds.staticDomain}/${propertyId}/property-static.json`
  logger.info({ propertyId, url }, '[Static] Fetching property static data')

  const data = await hgGet<HGPropertyStatic>(url, creds)

  await cacheSet(cacheKey, data, STATIC_DATA_CACHE_TTL_SECONDS)
  logger.debug({ propertyId }, '[Static] Property cached')

  return data
}

/**
 * Invalidates the static cache for a specific property.
 * Useful when property data is known to have been updated.
 */
export async function invalidatePropertyCache(propertyId: number): Promise<void> {
  const { cacheDel } = await import('../../utils/cache.js')
  await cacheDel(cacheKeyProperty(propertyId))
  logger.info({ propertyId }, '[Static] Property cache invalidated')
}
