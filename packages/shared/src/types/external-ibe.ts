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
