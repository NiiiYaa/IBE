export interface NearestAirport {
  code: string        // "LHR"
  name: string        // "London Heathrow Airport"
  distanceKm: number  // 12
}

export interface WLConfigResponse {
  channelUuidSet: boolean
  channelUuidMasked: string | null
  enabled: boolean
  enforceChildCreds: boolean
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
  airportRadiusKm: number            // system only; 0 for org/property
  airportMaxCount: number            // system only; 0 for org/property
  airportDatasetUpdatedAt: string | null  // system only
}

export interface WLConfigUpdate {
  channelUuid?: string
  enabled?: boolean
  enforceChildCreds?: boolean
  systemServiceDisabled?: boolean
  airportRadiusKm?: number
  airportMaxCount?: number
}

export interface ResolvedWLConfig {
  channelUuid: string | null
  enabled: boolean
  iataCode: string | null   // nearest airport code for WL URL
}

export interface NearestAirportsResponse {
  airports: NearestAirport[]
}
