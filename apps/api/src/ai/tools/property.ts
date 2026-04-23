import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'

export const getPropertyInfoTool: ToolDefinition = {
  name: 'get_property_info',
  description: 'Get detailed information about a hotel property: description, facilities, room types, location.',
  parameters: {
    type: 'object',
    properties: {
      propertyId: { type: 'number', description: 'Hotel property ID' },
    },
    required: ['propertyId'],
  },
}

export async function executeGetPropertyInfo(args: Record<string, unknown>): Promise<unknown> {
  const propertyId = args.propertyId as number
  try {
    const data = await fetchPropertyStatic(propertyId)

    const description = data.descriptions?.find(d => d.language === 'en')?.description
      ?? data.descriptions?.[0]?.description
      ?? null

    const facilities = (data.facilities ?? [])
      .slice(0, 20)
      .map(f => f.name)

    const roomTypes = (data.rooms ?? []).map(r => ({
      roomId: r.id,
      name: r.name,
      description: r.descriptions?.find(d => d.language === 'en')?.description?.slice(0, 200) ?? null,
      facilities: (r.facilities ?? []).slice(0, 10).map(f => f.name),
    }))

    return {
      propertyId,
      name: data.name,
      city: data.location?.city?.name ?? null,
      country: data.location?.countryCode ?? null,
      rating: data.rating ?? null,
      description: description?.slice(0, 500) ?? null,
      facilities,
      roomTypes,
    }
  } catch (err) {
    logger.warn({ propertyId, err }, '[AI Tool] get_property_info failed')
    return { error: 'Could not retrieve property information.' }
  }
}
