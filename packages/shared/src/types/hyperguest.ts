/**
 * Types mirroring the HyperGuest API response structures.
 * These are the raw shapes returned by the HyperGuest platform.
 */

import type {
  BoardType,
  BookingStatus,
  CancellationPenaltyType,
  ChargeParty,
  ChargeType,
  GuestTitle,
  TaxFrequency,
  TaxRelation,
  TaxScope,
} from '../enums.js'

// ── Static Data ───────────────────────────────────────────────────────────────

export interface HGHotelListItem {
  hotel_id: number
  name: string
  country: string
  city: string
  region?: string
  city_Id: number
  last_updated: string
  version: number
}

export interface HGCoordinates {
  latitude: number
  longitude: number
}

export interface HGContact {
  email: string | null
  phone: string | null
  website: string | null
}

export interface HGDescription {
  description: string
  language: string
  type: string
}

export interface HGFacility {
  id: number
  name: string
  nameSlug: string
  category: string
  categorySlug: string
  classification: string
  popular: number
  type: 'hotel' | 'room'
}

export interface HGImage {
  id: number
  uri: string
  description: string
  priority: number
  type: string
  size: { width: number; height: number }
  tags: string[]
  created: string
  updated: string
}

export interface HGLocation {
  address: string
  city: { id: number; name: string; hereMapsId?: string }
  countryCode: string
  postcode: string
  region?: string
}

export interface HGPolicyResult {
  type: string
  id: number
  name: string
  condition: Record<string, unknown>
  dates: { start: string | null; end: string | null }
  extraData: Record<string, unknown> | null
  result: unknown
}

export interface HGRatePlanSettings {
  board: { code: BoardType; description: string }
  charge: ChargeParty
  priceType: ChargeType
  status: string | null
}

export interface HGRatePlanStatic {
  id: number
  pmsCode: string
  name: string
  description: string
  isBar: boolean
  isPrivate: boolean
  baseRateplanId: number | null
  baseRatePlanPmsCode: string
  policies: HGPolicyResult[]
  settings: HGRatePlanSettings
  tags: string[]
}

export interface HGBed {
  type: string
  size: number | null
  quantity: number
}

export interface HGRoomStatic {
  id: number
  hotelId: number
  pmsCode: string
  name: string
  descriptions: Array<{ description: string; language: string; roomId: number }>
  facilities: HGFacility[]
  images: HGImage[]
  beds: HGBed[]
  ratePlans: HGRatePlanStatic[]
}

export interface HGPropertyStatic {
  id: number
  name: string
  rating: number
  logo: string
  group: string
  isTest: number
  contact: HGContact
  coordinates: HGCoordinates
  location: HGLocation
  descriptions: HGDescription[]
  facilities: HGFacility[]
  images: HGImage[]
  policies: HGPolicyResult[]
  ratePlans: HGRatePlanStatic[]
  rooms: HGRoomStatic[]
  commission: {
    calculation: string
    chargeType: string
    value: number
  }
  created: string
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface HGTax {
  description: string
  amount: number
  currency: string
  relation: TaxRelation
  scope?: TaxScope
  frequency?: TaxFrequency
}

export interface HGPriceAmount {
  price: number
  currency: string
}

export interface HGPrices {
  net: HGPriceAmount & { taxes: HGTax[] }
  sell: HGPriceAmount & { taxes: HGTax[] }
  commission: HGPriceAmount
  bar: HGPriceAmount
  fees: HGTax[]
}

export interface HGNightlyEntry {
  date: string
  prices: Pick<HGPrices, 'net' | 'sell' | 'commission' | 'bar' | 'fees'>
}

export interface HGCancellationPolicy {
  daysBefore: number
  penaltyType: CancellationPenaltyType
  amount: number
  timeSetting: {
    timeFromCheckIn: number
    timeFromCheckInType: 'hours' | 'days'
  }
  cancellationDeadlineHour?: string
}

export interface HGPaymentInfo {
  charge: ChargeParty
  chargeType: ChargeType
  chargeAmount: HGPriceAmount
}

export interface HGRatePlanInfo {
  virtual: boolean
  contracts: Array<{
    contractId: number
    terms: Array<{ id: number; name: string }>
  }>
  originalRatePlanCode: string
  isPromotion: boolean
  isPackageRate: boolean
  isPrivate: boolean
}

export interface HGBeddingConfiguration {
  type: string
  size: number | null
  quantity: number
}

export interface HGRoomSettings {
  numberOfBedrooms: number
  roomSize: number
  maxAdultsNumber: number
  maxChildrenNumber: number
  maxInfantsNumber: number
  maxOccupancy: number
  numberOfBeds: number
  beddingConfigurations: HGBeddingConfiguration[]
}

export interface HGSearchedPax {
  adults: number
  children: number[]
}

export interface HGRatePlanResult {
  ratePlanCode: string
  ratePlanId: number
  ratePlanName: string
  ratePlanInfo: HGRatePlanInfo
  board: BoardType
  remarks: string[]
  cancellationPolicies: HGCancellationPolicy[]
  payment: HGPaymentInfo
  prices: HGPrices
  nightlyBreakdown: HGNightlyEntry[]
  isImmediate: boolean
}

export interface HGRoomResult {
  searchedPax: HGSearchedPax
  roomId: number
  roomTypeCode: string
  roomName: string
  numberOfAvailableRooms: number
  settings: HGRoomSettings
  ratePlans: HGRatePlanResult[]
}

export interface HGPropertyInfo {
  name: string
  starRating: number
  cityName: string
  cityId: number
  countryName: string
  countryCode: string
  regionName: string
  regionCode: string
  longitude: number
  latitude: number
  propertyType: number
  propertyTypeName: string
}

export interface HGSearchResultItem {
  propertyId: number
  propertyInfo: HGPropertyInfo
  remarks: string[]
  rooms: HGRoomResult[]
}

export interface HGSearchResponse {
  results: HGSearchResultItem[]
}

// ── Booking ───────────────────────────────────────────────────────────────────

export interface HGGuestContact {
  address: string
  city: string
  country: string
  email: string
  phone: string
  state: string
  zip: string
}

export interface HGGuestName {
  first: string
  last: string
}

export interface HGGuest {
  birthDate: string
  name: HGGuestName
  title: GuestTitle
  contact?: HGGuestContact
}

export interface HGCreditCardDetails {
  number: string
  cvv: string
  expiry: { month: string; year: string }
  name: HGGuestName
}

export interface HGPaymentDetails {
  type: string
  details?: HGCreditCardDetails
  charge?: boolean
}

export interface HGBookingRoom {
  roomCode?: string
  roomId?: number
  rateCode: string
  expectedPrice: { amount: number; currency: string }
  guests: HGGuest[]
  specialRequests?: string[]
}

export interface HGBookingRequest {
  dates: { from: string; to: string }
  propertyId: number
  leadGuest: HGGuest
  reference: { agency: string }
  paymentDetails: HGPaymentDetails
  rooms: HGBookingRoom[]
  meta?: Array<{ key: string; value: string }>
  isTest: boolean
  groupBooking: boolean
}

export interface HGBookingRoomResponse {
  itemId: number
  roomId: number
  ratePlanId: number
  roomCode: string
  rateCode: string
  status: BookingStatus
  board: BoardType
  cancellationPolicy: Array<{
    policyId: number
    startDate: string
    endDate: string
    price: { amount: number; currency: string }
  }>
  guests: Array<HGGuest & { guestId: number; age: number }>
  specialRequests: string[]
  remarks: string[]
  reference: { property?: string }
  propertyId: number
  prices: HGPrices
  payment: { type: string; chargeAmount: HGPriceAmount }
  nightlyBreakdown: HGNightlyEntry[]
  financialModel: { keys: Array<{ key: string; order: number; value: string }>; type: string }
}

export interface HGBookingContent {
  bookingId: number
  status: BookingStatus
  dates: { from: string; to: string }
  meta: Array<{ key: string; value: string }>
  payment: { type: string; chargeAmount: HGPriceAmount }
  prices: HGPrices
  nightlyBreakdown: HGNightlyEntry[]
  rooms: HGBookingRoomResponse[]
  reference: { agency: string }
  leadGuest: HGGuest & { guestId: number; age: number }
  transactions: unknown[]
  propertyId: number
}

export interface HGBookingResponse {
  content: HGBookingContent
  financialModel: { keys: Array<{ key: string; order: number; value: string }>; type: string }
  timestamp: string
}
