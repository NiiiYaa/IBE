import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { getPublicMapsConfig } from '../../services/maps-config.service.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'
import type { PoiCategory } from '@ibe/shared'

export const getNearbyPlacesTool: ToolDefinition = {
  name: 'get_nearby_places',
  description: 'Get nearby points of interest around a hotel: restaurants, cafes, attractions, museums, transport, metro, shopping, wellness, nightlife, beaches, parks, banks, medical, sports. Call this when the user asks what is nearby, around the hotel, things to do, places to eat, how to get there, etc.',
  parameters: {
    type: 'object',
    properties: {
      propertyId: { type: 'number', description: 'Hotel property ID' },
      categories: {
        type: 'array',
        items: { type: 'string', enum: ['restaurants', 'cafes', 'attractions', 'museums', 'transport', 'metro', 'shopping', 'wellness', 'nightlife', 'beaches', 'parks', 'banks', 'medical', 'sports'] },
        description: 'Categories to fetch. Omit to use the hotel\'s configured defaults.',
      },
    },
    required: ['propertyId'],
  },
}

const OVERPASS_FILTERS: Record<PoiCategory, string> = {
  restaurants: `node["amenity"~"restaurant|fast_food"]`,
  cafes:       `node["amenity"~"cafe|coffee_shop"]`,
  attractions: `node["tourism"~"attraction|viewpoint|artwork"]`,
  museums:     `node["tourism"~"museum|gallery"]`,
  transport:   `(node["public_transport"="station"];node["railway"="station"];node["amenity"="bus_station"])`,
  metro:       `(node["railway"~"subway_entrance|tram_stop"];node["station"="subway"])`,
  shopping:    `node["shop"]["name"]`,
  wellness:    `node["leisure"~"spa|fitness_centre|swimming_pool"]`,
  nightlife:   `node["amenity"~"bar|nightclub|pub"]`,
  airports:    ``,
  beaches:     `node["natural"="beach"]["name"]`,
  parks:       `node["leisure"~"park|garden"]["name"]`,
  banks:       `(node["amenity"="bank"];node["amenity"="atm"])`,
  medical:     `(node["amenity"="pharmacy"];node["amenity"="hospital"];node["amenity"="clinic"])`,
  sports:      `node["leisure"~"sports_centre|stadium|pitch"]["name"]`,
}

const CATEGORY_LABELS: Record<PoiCategory, string> = {
  restaurants: 'Restaurants',
  cafes:       'Cafes & Coffee',
  attractions: 'Attractions',
  museums:     'Museums & Galleries',
  transport:   'Transport',
  metro:       'Metro & Tram',
  shopping:    'Shopping',
  wellness:    'Wellness & Spa',
  nightlife:   'Nightlife',
  airports:    'Airports',
  beaches:     'Beaches',
  parks:       'Parks & Gardens',
  banks:       'Banks & ATMs',
  medical:     'Pharmacies & Medical',
  sports:      'Sports & Recreation',
}

interface PoiResult {
  name: string
  category: PoiCategory
  distanceM?: number
}

async function fetchOverpassPoi(lat: number, lng: number, radius: number, categories: PoiCategory[]): Promise<PoiResult[]> {
  const parts = categories.flatMap(cat => {
    const filter = OVERPASS_FILTERS[cat]
    if (!filter) return []
    const withAround = filter.startsWith('(')
      ? filter.slice(1, -1).split(';').map(p => p.trim()).filter(Boolean).map(p => `${p}(around:${radius},${lat},${lng});`).join('\n')
      : `${filter}(around:${radius},${lat},${lng});`
    return { cat, query: withAround }
  })

  const body = `[out:json][timeout:10];\n(\n${parts.map(p => p.query).join('\n')}\n);\nout body 60;`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  let res: Response
  try {
    res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
    })
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) return []

  const data = await res.json() as { elements: Array<{ id: number; lat: number; lon: number; tags: Record<string, string> }> }

  return data.elements
    .filter(el => el.tags.name)
    .map(el => {
      let category: PoiCategory = 'attractions'
      if (el.tags.amenity === 'cafe' || el.tags.amenity === 'coffee_shop') category = 'cafes'
      else if (el.tags.amenity && ['restaurant', 'fast_food'].includes(el.tags.amenity)) category = 'restaurants'
      else if (el.tags.amenity && ['bar', 'pub'].includes(el.tags.amenity)) category = categories.includes('nightlife') ? 'nightlife' : 'restaurants'
      else if (el.tags.amenity === 'nightclub') category = 'nightlife'
      else if (el.tags.tourism && ['museum', 'gallery'].includes(el.tags.tourism)) category = 'museums'
      else if (el.tags.tourism) category = 'attractions'
      else if (el.tags.railway && ['subway_entrance', 'tram_stop'].includes(el.tags.railway)) category = 'metro'
      else if (el.tags.station === 'subway') category = 'metro'
      else if (el.tags.public_transport || el.tags.railway || el.tags.amenity === 'bus_station') category = 'transport'
      else if (el.tags.shop) category = 'shopping'
      else if (el.tags.leisure && ['spa', 'fitness_centre', 'swimming_pool'].includes(el.tags.leisure)) category = 'wellness'
      else if (el.tags.natural === 'beach') category = 'beaches'
      else if (el.tags.leisure && ['park', 'garden'].includes(el.tags.leisure)) category = 'parks'
      else if (el.tags.amenity === 'bank' || el.tags.amenity === 'atm') category = 'banks'
      else if (el.tags.amenity && ['pharmacy', 'hospital', 'clinic'].includes(el.tags.amenity)) category = 'medical'
      else if (el.tags.leisure && ['sports_centre', 'stadium', 'pitch'].includes(el.tags.leisure)) category = 'sports'

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
