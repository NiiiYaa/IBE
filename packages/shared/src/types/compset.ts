export interface SystemCompSetConfig {
  maxCompetitorsPerProperty: number
  cronSchedule: string
  enabled: boolean
}

export interface CompSetSearchParam {
  id: number
  orgId: number | null
  propertyId: number | null
  offsetDays: number
  nights: number
  adults: number
  countryCode: string
  label: string
  sortOrder: number
  tier: 'system' | 'chain' | 'hotel'
}

export interface CompSetSearchParamCreate {
  offsetDays: number
  nights: number
  adults: number
  countryCode: string
  sortOrder?: number
}

export interface CompSetCompetitor {
  id: number
  propertyId: number
  name: string
  searchUrl: string | null
  sortOrder: number
  status: 'idle' | 'fetching' | 'done' | 'error'
  lastFetchAt: string | null
  errorMsg: string | null
}

export interface CompSetCompetitorCreate {
  propertyId: number
  name: string
  searchUrl?: string | null
  sortOrder?: number
}

export interface CompSetCompetitorUpdate {
  name?: string
  searchUrl?: string | null
  sortOrder?: number
}

export interface CompSetResult {
  id: number
  propertyId: number
  competitorId: number | null
  searchParamId: number
  fetchedAt: string
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  countryCode: string
  searchStatus: 'found' | 'not_found' | 'error'
  roomName: string | null
  board: string | null
  cancellation: string | null
  pricePerNight: number | null
  total: number | null
  currency: string | null
}

export interface CompSetRunResponse {
  started: boolean
}
