export interface EventsConfigResponse {
  apiKeySet: boolean
  apiKeyMasked: string | null
  enabled: boolean
  radiusKm: number
  maxEvents: number
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}

export interface EventsConfigUpdate {
  apiKey?: string
  enabled?: boolean
  radiusKm?: number
  maxEvents?: number
  systemServiceDisabled?: boolean
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
}
