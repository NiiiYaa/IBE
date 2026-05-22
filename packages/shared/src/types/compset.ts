export interface SystemCompSetConfig {
  maxCompetitorsPerProperty: number
  maxActivePatterns: number
  cronSchedule: string
  enabled: boolean
}

export interface CompSetConfig {
  maxActivePatterns: number | null        // override for this scope (null = inheriting)
  resolvedMaxActivePatterns: number       // effective value after inheritance
}

export interface CompSetSearchParam {
  id: number
  orgId: number | null
  propertyId: number | null
  offsetDays: number
  nights: number
  adults: number
  children: number
  childAges: number[]
  label: string
  sortOrder: number
  tier: 'system' | 'chain' | 'hotel'
  isActive: boolean
  resolvedIsActive: boolean
}

export interface CompSetSearchParamCreate {
  offsetDays: number
  nights: number
  adults: number
  children: number
  childAges: number[]
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
  comparisonMode: 'cheapest' | 'room_mapping'
}

export interface CompSetRoomMapping {
  id: number
  competitorId: number
  compRoomName: string
  ownRoomName: string
}

export interface CompSetRoomMappingUpsert {
  compRoomName: string
  ownRoomName: string
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
  comparisonMode?: 'cheapest' | 'room_mapping'
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

export interface CompSetRunStatus {
  status: 'idle' | 'running' | 'done'
  startedAt?: string
  totalParams: number
  doneParams: number
  durationSec?: number
  found: number
  notFound: number
  errors: number
  runLabel?: string // 'all' for Run All, competitor name for single run
}
