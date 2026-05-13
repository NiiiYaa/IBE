export interface ExternalIBEConfigRow {
  id: number
  organizationId: number | null
  propertyId: number | null
  searchTemplate: string | null
  bookingTemplate: string | null
  searchSampleUrls: string[]
  bookingSampleUrls: string[]
  externalHotelId: string | null
  mcpEnabled: boolean
  affiliateEnabled: boolean
  widgetEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ExternalIBEConfigUpdate {
  searchTemplate?: string | null
  bookingTemplate?: string | null
  searchSampleUrls?: string[]
  bookingSampleUrls?: string[]
  externalHotelId?: string | null
  mcpEnabled?: boolean
  affiliateEnabled?: boolean
  widgetEnabled?: boolean
}

export interface ExternalIBEAnalyzeRequest {
  urls: string[]
  scenarios?: string[]   // human-readable description of each URL's scenario, parallel to urls[]
  type: 'search' | 'booking'
  orgId?: number
  propertyId?: number
}

export interface ExternalIBEAnalyzeResponse {
  template: string
  mapping: Array<{
    concept: string
    detectedParam: string
    exampleValue: string
  }>
  unmapped: string[]
}

export interface EffectiveExternalIBEConfig {
  searchTemplate: string | null
  bookingTemplate: string | null
  externalHotelId: string | null
  mcpEnabled: boolean
  affiliateEnabled: boolean
  widgetEnabled: boolean
}

export interface ExternalIBETestResultItem {
  label: string
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  childrenAges: number[]
  searchUrl: string | null
  bookingUrl: string | null
  fallback: boolean
  httpStatus: number | null
  httpOk: boolean
  error?: string
  durationMs: number
}

export interface ExternalIBETestResponse {
  checkIn: string
  checkOut: string
  results: ExternalIBETestResultItem[]
}

export type ExternalIBETestStreamEvent =
  | { type: 'result'; item: ExternalIBETestResultItem }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface ExternalIBEResolveRequest {
  propertyId: number
  checkIn: string
  checkOut: string
  adults?: number
  roomName?: string // hint for room matching (widget passes displayed room name)
  lowestPrice?: number // hint for price-based matching
}

export interface ExternalIBEResolveResponse {
  bookingUrl: string
  fallback: boolean // true when solutionId could not be resolved; URL is the search URL
}
