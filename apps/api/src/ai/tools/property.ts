import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'

export const getPropertyInfoTool: ToolDefinition = {
  name: 'get_property_info',
  description: 'Get detailed information about a hotel property: description, facilities, room types, full address (street, city, region, postcode, country, coordinates).',
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

    // Only popular facilities to keep LLM context small
    const popularFacilities = (data.facilities ?? [])
      .filter(f => f.popular === 1)
      .map(f => f.name)

    // Room types: name + short description only — no per-room facility lists
    const roomTypes = (data.rooms ?? []).map(r => ({
      roomId: r.id,
      name: r.name,
      description: r.descriptions?.find(d => d.language === 'en')?.description?.slice(0, 150) ?? null,
    }))

    return {
      propertyId,
      name: data.name,
      address: data.location?.address ?? null,
      city: data.location?.city?.name ?? null,
      region: data.location?.region ?? null,
      postcode: data.location?.postcode ?? null,
      country: data.location?.countryCode ?? null,
      coordinates: data.coordinates
        ? { latitude: data.coordinates.latitude, longitude: data.coordinates.longitude }
        : null,
      rating: data.rating ?? null,
      description: description?.slice(0, 500) ?? null,
      popularFacilities,
      roomTypes,
    }
  } catch (err) {
    logger.warn({ propertyId, err }, '[AI Tool] get_property_info failed')
    return { error: 'Could not retrieve property information.' }
  }
}
