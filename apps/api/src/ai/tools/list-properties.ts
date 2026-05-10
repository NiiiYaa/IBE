import { prisma } from '../../db/client.js'
import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { cacheGet } from '../../utils/cache.js'
import { logger } from '../../utils/logger.js'
import type { HGPropertyStatic } from '@ibe/shared'
import type { ToolDefinition } from '../adapters/types.js'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20
// Max uncached (API) calls when city-scanning; cached hits are unlimited
const CITY_API_FETCH_LIMIT = 50

export const listPropertiesTool: ToolDefinition = {
  name: 'list_chain_hotels',
  description: 'Search hotels in this chain by city or name. Always pass a query — never call without one. Returns up to 10 matching hotels.',
  parameters: {
    type: 'object',
    properties: {
      orgId: {
        type: 'number',
        description: 'Organization ID — use this for large chains instead of listing all propertyIds',
      },
      propertyIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Property IDs to search — use only for small chains (≤20 hotels)',
      },
      query: {
        type: 'string',
        description: 'City name or hotel name to search for (e.g. "Barcelona", "Grand Hotel"). Required.',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 10, max 20)',
      },
    },
  },
}

export async function executeListProperties(args: Record<string, unknown>): Promise<unknown> {
  const query = (args.query as string | undefined)?.toLowerCase().trim()
  const limit = Math.min((args.limit as number | undefined) ?? DEFAULT_LIMIT, MAX_LIMIT)

  // Resolve property IDs: prefer explicit list; fall back to org-level lookup for large chains
  let propertyIds = args.propertyIds as number[] | undefined
  if (!propertyIds?.length && args.orgId) {
    const props = await prisma.property.findMany({
      where: { organizationId: args.orgId as number, deletedAt: null },
      select: { propertyId: true },
    })
    propertyIds = props.map(p => p.propertyId)
  }
  if (!propertyIds?.length) return { hotels: [], returned: 0, totalInChain: 0, note: 'No property context available.' }

  // Step 1: filter candidates using DB names (fast, no external API)
  const rows = await prisma.property.findMany({
    where: { propertyId: { in: propertyIds } },
    select: { propertyId: true, name: true },
  })

  // Step 2: city-scan strategy — check Redis cache for ALL candidates first (no API cost),
  // then make HyperGuest API calls only for cache misses (capped to avoid rate limits).
  function buildHotel(propertyId: number, data: HGPropertyStatic) {
    const city = data.location?.city?.name ?? null
    const description = data.descriptions?.find(d => d.language === 'en')?.description
      ?? data.descriptions?.[0]?.description
      ?? null
    if (query) {
      const words = query.split(/\s+/).filter(Boolean)
      const matches = (s: string) => words.some(w => s.includes(w))
      const hgName = (data.name ?? '').toLowerCase()
      const dbName = (rows.find(r => r.propertyId === propertyId)?.name ?? '').toLowerCase()
      const cityStr = (city ?? '').toLowerCase()
      if (!matches(cityStr) && !matches(hgName) && !matches(dbName)) return null
    }
    return {
      propertyId,
      name: data.name ?? `Property ${propertyId}`,
      city,
      country: data.location?.countryCode ?? null,
      rating: data.rating ?? null,
      description: description?.slice(0, 150) ?? null,
    }
  }

  let candidates = rows
  if (query) {
    const matched = rows.filter(r => r.name?.toLowerCase().includes(query))
    // If DB names match (hotel name search), use only those — no city-scan needed
    if (matched.length > 0) candidates = matched
    // Otherwise it's likely a city query — scan all candidates via cache/API below
  }

  const isCityQuery = query && candidates === rows

  let hotels: ReturnType<typeof buildHotel>[]

  if (isCityQuery) {
    // Check Redis cache for all candidates simultaneously (zero API calls)
    const cacheChecks = await Promise.all(
      candidates.map(async r => ({
        propertyId: r.propertyId,
        data: await cacheGet<HGPropertyStatic>(`hg:static:property:${r.propertyId}`),
      }))
    )

    const fromCache = cacheChecks.filter(c => c.data !== null) as { propertyId: number; data: HGPropertyStatic }[]
    const cacheMissIds = cacheChecks.filter(c => c.data === null).map(c => c.propertyId)

    // Filter cached results by city/name
    const cacheMatches = fromCache.map(c => buildHotel(c.propertyId, c.data)).filter(Boolean)

    // Fetch uncached ones from HyperGuest API (limited to avoid hammering the API)
    const toFetchFromApi = cacheMissIds.slice(0, CITY_API_FETCH_LIMIT)
    const apiResults = await Promise.all(
      toFetchFromApi.map(async propertyId => {
        try {
          const data = await fetchPropertyStatic(propertyId)
          return buildHotel(propertyId, data)
        } catch (err) {
          logger.warn({ propertyId, err }, '[AI Tool] list_chain_hotels fetch failed')
          return null
        }
      })
    )

    hotels = [...cacheMatches, ...apiResults.filter(Boolean)].slice(0, limit)
  } else {
    // Hotel name search or no query — fetch only the top `limit` candidates
    const toFetch = candidates.slice(0, limit).map(r => r.propertyId)
    const results = await Promise.all(
      toFetch.map(async propertyId => {
        try {
          const data = await fetchPropertyStatic(propertyId)
          return buildHotel(propertyId, data)
        } catch (err) {
          logger.warn({ propertyId, err }, '[AI Tool] list_chain_hotels fetch failed')
          return null
        }
      })
    )
    hotels = results.filter(Boolean).slice(0, limit)
  }

  const hotelCount = hotels.length
  const totalInChain = propertyIds.length
  const filtered = query && hotelCount < totalInChain

  return {
    hotels,
    returned: hotelCount,
    totalInChain,
    ...(filtered ? { note: `Showing ${hotelCount} of ${totalInChain} hotels matching "${query}". Ask the guest to refine if needed.` } : {}),
    ...(hotelCount === 0 ? { note: `No hotels matched "${query}". Ask the guest to try a different city or name.` } : {}),
  }
}
