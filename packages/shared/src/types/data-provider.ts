export type DataProviderType = 'dataforseo' | 'none'
export type ScoreStatus = 'idle' | 'fetching' | 'done' | 'error'

export interface SystemDataProviderConfig {
  providerType: DataProviderType
  refreshIntervalDays: number
  enabled: boolean
  openToAll: boolean
  loginSet: boolean
  passwordMasked: string | null
}

export interface OrgDataProviderConfig {
  organizationId: number
  useSystem: boolean
  refreshIntervalDays: number | null
  enabled: boolean | null
  providerType: DataProviderType | null
  loginSet: boolean
  passwordMasked: string | null
  systemServiceDisabled: boolean
}

export interface PropertyDataProviderConfig {
  propertyId: number
  useOrg: boolean
  refreshIntervalDays: number | null
  enabled: boolean | null
  providerType: DataProviderType | null
  loginSet: boolean
  passwordMasked: string | null
  googleMapsUrl: string | null
  lat: number | null
  lng: number | null
  orgServiceDisabled: boolean
}

export interface PropertyScore {
  propertyId: number
  score: number | null
  reviewCount: number | null
  source: string | null
  fetchedAt: string | null
  status: ScoreStatus
  errorMsg: string | null
}

export interface DataProviderAdminResponse {
  propertyId: number
  score: PropertyScore | null
  propertyConfig: PropertyDataProviderConfig | null
  orgConfig: OrgDataProviderConfig | null
  systemConfig: SystemDataProviderConfig | null
  effective: {
    enabled: boolean
    refreshIntervalDays: number
    providerType: DataProviderType
  }
}
