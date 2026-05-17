export interface NearestAirport {
  code: string        // "LHR"
  name: string        // "London Heathrow Airport"
  distanceKm: number  // 12
  lat: number
  lng: number
}

export interface NearestAirportsResponse {
  airports: NearestAirport[]
  radiusKm: number
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}

export interface AirportConfigResponse {
  enabled: boolean
  radiusKm: number
  maxCount: number
  hasOwnConfig: boolean
  datasetUpdatedAt: string | null  // non-null at system tier only
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
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
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}
