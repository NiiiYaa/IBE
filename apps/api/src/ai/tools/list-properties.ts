import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'

export const listPropertiesTool: ToolDefinition = {
  name: 'list_chain_hotels',
  description: 'Get a summary of all hotels in this chain. Use this when the user asks which hotels are available, what properties exist, or wants to browse all options.',
  parameters: {
    type: 'object',
    properties: {
      propertyIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'All property IDs to list — pass every ID from the property context',
      },
    },
    required: ['propertyIds'],
  },
}

export async function executeListProperties(args: Record<string, unknown>): Promise<unknown> {
  const propertyIds = args.propertyIds as number[]

  const results = await Promise.all(
    propertyIds.map(async (propertyId) => {
      try {
        const data = await fetchPropertyStatic(propertyId)
        const description = data.descriptions?.find(d => d.language === 'en')?.description
          ?? data.descriptions?.[0]?.description
          ?? null
        return {
          propertyId,
          name: data.name ?? `Property ${propertyId}`,
          city: data.location?.city?.name ?? null,
          country: data.location?.countryCode ?? null,
          rating: data.rating ?? null,
          description: description?.slice(0, 200) ?? null,
        }
      } catch (err) {
        logger.warn({ propertyId, err }, '[AI Tool] list_chain_hotels fetch failed')
        return { propertyId, error: 'Could not retrieve info' }
      }
    })
  )

  return { hotels: results, total: results.length }
}
