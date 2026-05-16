export interface NearestAirport {
  code: string        // "LHR"
  name: string        // "London Heathrow Airport"
  distanceKm: number  // 12
}

export interface NearestAirportsResponse {
  airports: NearestAirport[]
}

export interface AirportConfigResponse {
  enabled: boolean
  radiusKm: number           // effective value (system default if not overridden)
  maxCount: number           // effective value
  hasOwnConfig: boolean
  datasetUpdatedAt: string | null  // system tier only; null at org/property
}

export interface AirportConfigUpdate {
  enabled?: boolean | null   // null = revert to inherit
  radiusKm?: number | null   // null = revert to inherit
  maxCount?: number | null   // null = revert to inherit
}

export interface ResolvedAirportConfig {
  enabled: boolean
  radiusKm: number
  maxCount: number
}
