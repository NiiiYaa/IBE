import { prisma } from '../../db/client.js'
import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20

export const listPropertiesTool: ToolDefinition = {
  name: 'list_chain_hotels',
  description: 'Search hotels in this chain by city or name. Always pass a query when the chain has many hotels — never call without a query for chains larger than 20 properties. Returns up to 10 matching hotels.',
  parameters: {
    type: 'object',
    properties: {
      propertyIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'All property IDs from the property context',
      },
      query: {
        type: 'string',
        description: 'City name or hotel name to search for (e.g. "Barcelona", "Grand Hotel"). Required when chain has more than 20 hotels.',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 10, max 20)',
      },
    },
    required: ['propertyIds'],
  },
}

export async function executeListProperties(args: Record<string, unknown>): Promise<unknown> {
  const propertyIds = args.propertyIds as number[]
  const query = (args.query as string | undefined)?.toLowerCase().trim()
  const limit = Math.min((args.limit as number | undefined) ?? DEFAULT_LIMIT, MAX_LIMIT)

  // Step 1: filter candidates using DB names (fast, no external API)
  const rows = await prisma.property.findMany({
    where: { propertyId: { in: propertyIds } },
    select: { propertyId: true, name: true },
  })

  let candidates = rows
  if (query) {
    const matched = rows.filter(r => r.name?.toLowerCase().includes(query))
    // Fall back to unfiltered slice if DB names are missing / no match
    candidates = matched.length > 0 ? matched : rows
  }

  const toFetch = candidates.slice(0, limit).map(r => r.propertyId)

  // Step 2: enrich with HyperGuest static data for matched subset only
  const results = await Promise.all(
    toFetch.map(async (propertyId) => {
      try {
        const data = await fetchPropertyStatic(propertyId)
        const city = data.location?.city?.name ?? null
        const description = data.descriptions?.find(d => d.language === 'en')?.description
          ?? data.descriptions?.[0]?.description
          ?? null
        // If query provided, also filter by city name (second-pass for unmatched DB names)
        if (query && city && !city.toLowerCase().includes(query)) {
          const dbName = rows.find(r => r.propertyId === propertyId)?.name ?? ''
          if (!dbName.toLowerCase().includes(query)) return null
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

  const hotels = results.filter(Boolean)
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
