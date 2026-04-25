export type MapProvider = 'osm' | 'google' | 'mapbox' | 'here'

export const MAP_PROVIDERS: MapProvider[] = ['osm', 'google', 'mapbox', 'here']

export const MAP_PROVIDER_LABELS: Record<MapProvider, string> = {
  osm: 'OpenStreetMap (Free)',
  google: 'Google Maps',
  mapbox: 'Mapbox',
  here: 'HERE Maps',
}

export const MAP_PROVIDER_DESCRIPTIONS: Record<MapProvider, string> = {
  osm: 'Free, open-source. No API key required. Uses Leaflet + OSM tiles + Overpass API for POI.',
  google: 'Best data quality and coverage. Requires Google Maps API key with Maps JS + Places APIs enabled.',
  mapbox: 'Beautiful vector maps. Free tier: 50,000 map loads/month. Requires Mapbox access token.',
  here: 'Already integrated in the HyperGuest ecosystem. Free tier: 250,000 requests/month. Requires HERE API key.',
}

export const MAP_PROVIDER_NEEDS_KEY: Record<MapProvider, boolean> = {
  osm: false,
  google: true,
  mapbox: true,
  here: true,
}

export const MAP_PROVIDER_KEY_LABEL: Record<MapProvider, string> = {
  osm: '',
  google: 'Google Maps API Key',
  mapbox: 'Mapbox Access Token',
  here: 'HERE API Key',
}

export type PoiCategory = 'restaurants' | 'attractions' | 'transport' | 'shopping' | 'wellness' | 'nightlife'

export const POI_CATEGORIES: PoiCategory[] = ['restaurants', 'attractions', 'transport', 'shopping', 'wellness', 'nightlife']

export const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
  restaurants: 'Restaurants & Cafes',
  attractions: 'Attractions & Sights',
  transport: 'Transport',
  shopping: 'Shopping',
  wellness: 'Wellness & Spa',
  nightlife: 'Nightlife & Bars',
}

export interface MapsConfigResponse {
  provider: MapProvider
  apiKeySet: boolean
  apiKeyMasked: string | null
  poiRadius: number
  poiCategories: PoiCategory[]
  enabled: boolean
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
}

export interface MapsConfigUpdate {
  provider?: MapProvider
  apiKey?: string
  poiRadius?: number
  poiCategories?: PoiCategory[]
  enabled?: boolean
  systemServiceDisabled?: boolean
}
