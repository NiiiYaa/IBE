import { prisma } from '../../db/client.js'
import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20
// When DB names don't contain the query (city searches), scan this many properties
// via HyperGuest to find matches by city. Capped to avoid excess API calls.
const CITY_SCAN_LIMIT = 50

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

  let candidates = rows
  let cityScan = false
  if (query) {
    const matched = rows.filter(r => r.name?.toLowerCase().includes(query))
    if (matched.length > 0) {
      candidates = matched
    } else {
      // No DB name matched — likely a city query. Scan a wider pool so the
      // HyperGuest city filter (step 2) has enough candidates to work with.
      candidates = rows
      cityScan = true
    }
  }

  const scanLimit = cityScan ? Math.min(candidates.length, CITY_SCAN_LIMIT) : limit
  const toFetch = candidates.slice(0, scanLimit).map(r => r.propertyId)

  // Step 2: enrich with HyperGuest static data for matched subset only
  const results = await Promise.all(
    toFetch.map(async (propertyId) => {
      try {
        const data = await fetchPropertyStatic(propertyId)
        const city = data.location?.city?.name ?? null
        const description = data.descriptions?.find(d => d.language === 'en')?.description
          ?? data.descriptions?.[0]?.description
          ?? null
        // If query provided, filter by city or hotel name (HyperGuest name takes priority over DB name)
        if (query) {
          const hgName = (data.name ?? '').toLowerCase()
          const dbName = (rows.find(r => r.propertyId === propertyId)?.name ?? '').toLowerCase()
          const cityStr = (city ?? '').toLowerCase()
          // Split multi-word queries so "Quentin Prague" matches city="Prague" AND name="Quentin..."
          const words = query.split(/\s+/).filter(Boolean)
          const matches = (s: string) => words.some(w => s.includes(w))
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
      } catch (err) {
        logger.warn({ propertyId, err }, '[AI Tool] list_chain_hotels fetch failed')
        return null
      }
    })
  )

  const hotels = results.filter(Boolean).slice(0, limit)
  const totalInChain = propertyIds.length
  const filtered = query && hotels.length < totalInChain

  return {
    hotels,
    returned: hotels.length,
    totalInChain,
    ...(filtered ? { note: `Showing ${hotels.length} of ${totalInChain} hotels matching "${query}". Ask the guest to refine if needed.` } : {}),
    ...(hotels.length === 0 ? { note: `No hotels matched "${query}". Ask the guest to try a different city or name.` } : {}),
  }
}
