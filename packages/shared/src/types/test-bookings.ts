export interface TestBookingRoomRequest {
  adults: number
  childrenAges: number[]
}

export interface TestBookingSearchRequest {
  propertyId: number
  checkIn: string       // YYYY-MM-DD
  checkOut: string      // YYYY-MM-DD
  adults: number
  childrenAges: number[]
  rooms?: TestBookingRoomRequest[] // multi-room; if provided overrides adults/childrenAges
}

export interface TestBookingRateResult {
  rateKey: string             // opaque base64-encoded booking params
  roomName: string
  board: string               // 'RO' | 'BB' | 'HB' | 'FB' | 'AI'
  cancellationPolicy: 'R' | 'NR'
  pricePerNight: number
  totalPrice: number
  currency: string
}

export interface TestBookingSearchResponse {
  rates: TestBookingRateResult[]
}

export interface TestBookingBookRequest {
  propertyId: number
  rateKey: string
  checkIn: string
  checkOut: string
  adults: number
  childrenAges: number[]
}

export interface TestBookingBookResponse {
  bookingId: number
  bookingReference: string
}

export interface TestBookingCancelResponse {
  ok: boolean
}
