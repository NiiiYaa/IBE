export interface NearestAirport {
  code: string        // "LHR"
  name: string        // "London Heathrow Airport"
  distanceKm: number  // 12
  lat: number
  lng: number
}

export interface NearestAirportsResponse {
  airports: NearestAirport[]
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}

export interface AirportConfigResponse {
  enabled: boolean
  radiusKm: number           // effective value (system default if not overridden)
  maxCount: number           // effective value
  hasOwnConfig: boolean
  datasetUpdatedAt: string | null  // system tier only; null at org/property
  stripDefaultFolded: boolean      // system tier only
  stripAutoFoldSecs: number        // system tier only; 0 = never
}

export interface AirportConfigUpdate {
  enabled?: boolean | null         // null = revert to inherit
  radiusKm?: number | null         // null = revert to inherit
  maxCount?: number | null         // null = revert to inherit
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
}

export interface ResolvedAirportConfig {
  enabled: boolean
  radiusKm: number
  maxCount: number
}
