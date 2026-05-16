export interface WLConfigResponse {
  channelUuidSet: boolean
  channelUuidMasked: string | null
  enabled: boolean
  enforceChildCreds: boolean
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
}

export interface WLConfigUpdate {
  channelUuid?: string
  enabled?: boolean
  enforceChildCreds?: boolean
  systemServiceDisabled?: boolean
}

export interface ResolvedWLConfig {
  channelUuid: string | null
  enabled: boolean
  iataCode: string | null   // nearest airport code for WL URL
}
