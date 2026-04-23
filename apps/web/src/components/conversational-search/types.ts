export interface RoomSummary {
  roomId: number
  roomName: string
  maxOccupancy: number
  bedding: string
  lowestPrice: number
  currency: string
  boardType: string
  boardLabel: string
  isRefundable: boolean
  ratePlanCode: string
  rateCode: string
  availableCount: number
}

export interface SearchResult {
  searchId: string
  checkIn: string
  checkOut: string
  nights: number
  currency: string
  rooms: RoomSummary[]
  found: number
}

export interface BookingHandoff {
  url: string
  propertyId: number
  roomId: number
  ratePlanCode: string
  searchId: string
  checkIn: string
  checkOut: string
  adults: number
}
