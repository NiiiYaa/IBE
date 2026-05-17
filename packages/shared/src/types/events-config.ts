export interface EventsConfigResponse {
  apiKeySet: boolean
  apiKeyMasked: string | null
  credentialsLocked: boolean
  enforceChildCreds: boolean
  enabled: boolean
  radiusKm: number
  maxEvents: number
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
  showBookButton: boolean
}

export interface EventsConfigUpdate {
  apiKey?: string
  clearApiKey?: boolean
  enforceChildCreds?: boolean
  enabled?: boolean
  radiusKm?: number
  maxEvents?: number
  systemServiceDisabled?: boolean
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
  showBookButton?: boolean
}
