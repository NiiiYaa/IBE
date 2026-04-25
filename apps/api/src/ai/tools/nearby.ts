import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { getPublicMapsConfig } from '../../services/maps-config.service.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'
import type { PoiCategory } from '@ibe/shared'

export const getNearbyPlacesTool: ToolDefinition = {
  name: 'get_nearby_places',
  description: 'Get nearby points of interest around a hotel: restaurants, attractions, transport, shopping, wellness, nightlife. Call this when the user asks what is nearby, around the hotel, things to do, places to eat, how to get there, etc.',
  parameters: {
    type: 'object',
    properties: {
      propertyId: { type: 'number', description: 'Hotel property ID' },
      categories: {
        type: 'array',
        items: { type: 'string', enum: ['restaurants', 'attractions', 'transport', 'shopping', 'wellness', 'nightlife'] },
        description: 'Categories to fetch. Omit to use the hotel\'s configured defaults.',
      },
    },
    required: ['propertyId'],
  },
}

const OVERPASS_FILTERS: Record<PoiCategory, string> = {
  restaurants: `node["amenity"~"restaurant|cafe|bar|fast_food|pub"]`,
  attractions: `node["tourism"~"attraction|museum|gallery|viewpoint|artwork"]`,
  transport: `(node["public_transport"="station"];node["railway"="station"];node["amenity"="bus_station"])`,
  shopping: `node["shop"]["name"]`,
  wellness: `node["leisure"~"spa|fitness_centre|swimming_pool"]`,
  nightlife: `node["amenity"~"bar|nightclub|pub"]`,
}

const CATEGORY_LABELS: Record<PoiCategory, string> = {
  restaurants: 'Restaurants & Cafes',
  attractions: 'Attractions',
  transport: 'Transport',
  shopping: 'Shopping',
  wellness: 'Wellness & Spa',
  nightlife: 'Nightlife',
}

interface PoiResult {
  name: string
  category: PoiCategory
  distanceM?: number
}

async function fetchOverpassPoi(lat: number, lng: number, radius: number, categories: PoiCategory[]): Promise<PoiResult[]> {
  const parts = categories.flatMap(cat => {
    const filter = OVERPASS_FILTERS[cat]
    const withAround = filter.startsWith('(')
      ? filter.slice(1, -1).split(';').map(p => p.trim()).filter(Boolean).map(p => `${p}(around:${radius},${lat},${lng});`).join('\n')
      : `${filter}(around:${radius},${lat},${lng});`
    return { cat, query: withAround }
  })

  const body = `[out:json][timeout:15];\n(\n${parts.map(p => p.query).join('\n')}\n);\nout body 60;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) return []

  const data = await res.json() as { elements: Array<{ id: number; lat: number; lon: number; tags: Record<string, string> }> }

  return data.elements
    .filter(el => el.tags.name)
    .map(el => {
      let category: PoiCategory = 'attractions'
      if (el.tags.amenity && ['restaurant', 'cafe', 'fast_food'].includes(el.tags.amenity)) category = 'restaurants'
      else if (el.tags.amenity && ['bar', 'pub'].includes(el.tags.amenity)) category = categories.includes('nightlife') ? 'nightlife' : 'restaurants'
      else if (el.tags.tourism) category = 'attractions'
      else if (el.tags.public_transport || el.tags.railway || el.tags.amenity === 'bus_station') category = 'transport'
      else if (el.tags.shop) category = 'shopping'
      else if (el.tags.leisure) category = 'wellness'

      // Haversine distance in metres
      const dLat = (el.lat - lat) * Math.PI / 180
      const dLng = (el.lon - lng) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(el.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
      const distanceM = Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))

      return { name: el.tags.name!, category, distanceM }
    })
    .filter(n => categories.includes(n.category))
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))
}

export async function executeGetNearbyPlaces(args: Record<string, unknown>): Promise<unknown> {
  const propertyId = args.propertyId as number
  const requestedCategories = args.categories as PoiCategory[] | undefined

  try {
    const [property, mapsConfig] = await Promise.all([
      fetchPropertyStatic(propertyId),
      getPublicMapsConfig(propertyId),
    ])

    const lat = property.coordinates?.latitude
    const lng = property.coordinates?.longitude
    if (!lat || !lng) return { error: 'Hotel coordinates not available.' }

    const categories = requestedCategories?.length
      ? requestedCategories
      : (mapsConfig.poiCategories as PoiCategory[])

    const radius = mapsConfig.poiRadius ?? 1000
    const places = await fetchOverpassPoi(lat, lng, radius, categories)

    // Group by category, max 5 per category
    const grouped: Record<string, { name: string; distanceM: number }[]> = {}
    for (const place of places) {
      if (!grouped[place.category]) grouped[place.category] = []
      if (grouped[place.category]!.length < 5) {
        grouped[place.category]!.push({ name: place.name, distanceM: place.distanceM ?? 0 })
      }
    }

    const result = Object.entries(grouped).map(([cat, items]) => ({
      category: CATEGORY_LABELS[cat as PoiCategory] ?? cat,
      places: items.map(p => ({
        name: p.name,
        distance: p.distanceM < 1000 ? `${p.distanceM}m` : `${(p.distanceM / 1000).toFixed(1)}km`,
      })),
    }))

    return {
      propertyId,
      hotelName: property.name,
      radiusM: radius,
      totalFound: places.length,
      nearby: result,
    }
  } catch (err) {
    logger.warn({ propertyId, err }, '[AI Tool] get_nearby_places failed')
    return { error: 'Could not retrieve nearby places.' }
  }
}
