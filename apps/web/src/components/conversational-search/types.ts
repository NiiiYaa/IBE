export interface RateOffer {
  ratePlanId: number
  ratePlanCode: string
  boardLabel: string
  boardAbbr: string
  isRefundable: boolean
  price: number
}

export interface RoomSummary {
  roomId: number
  roomName: string
  maxOccupancy: number
  bedding: string
  lowestPrice: number
  currency: string
  availableCount: number
  offers: RateOffer[]
}

export interface SearchResult {
  searchId: string
  propertyId: number
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  currency: string
  rooms: RoomSummary[]
  found: number
}

export interface BookingHandoff {
  url: string
  propertyId: number
  roomId: number
  ratePlanId: number
  searchId: string
  checkIn: string
  checkOut: string
  adults: number
}
