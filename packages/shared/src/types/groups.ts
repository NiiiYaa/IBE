export type GroupBookingMode = 'online' | 'offline'
export type GroupPricingDirection = 'increase' | 'decrease'
export type GroupRateSelection = 'all' | 'group_only'

export interface GroupRatePriorityItem {
  board: string  // BoardType value e.g. 'RO', 'BB', 'HB', 'FB', 'AI'
  isRefundable: boolean
}

export const DEFAULT_RATE_PRIORITY: GroupRatePriorityItem[] = [
  { board: 'RO', isRefundable: true },
  { board: 'RO', isRefundable: false },
  { board: 'BB', isRefundable: true },
  { board: 'BB', isRefundable: false },
  { board: 'HB', isRefundable: true },
  { board: 'HB', isRefundable: false },
  { board: 'FB', isRefundable: true },
  { board: 'FB', isRefundable: false },
  { board: 'AI', isRefundable: true },
  { board: 'AI', isRefundable: false },
]

export interface GroupCancellationRange {
  triggerType: 'on_confirmation' | 'days_before'
  daysBeforeCheckin?: number  // only for 'days_before'
  pct: number
}

export interface GroupPaymentRange {
  triggerType: 'on_confirmation' | 'days_before'
  daysBeforeCheckin?: number
  pct: number
}

export interface GroupMealPricing {
  enabled: boolean
  priceAdult: number
  priceChild: number
  priceInfant: number
}

export interface GroupMealsConfig {
  breakfast: GroupMealPricing
  lunch: GroupMealPricing
  dinner: GroupMealPricing
}

export interface GroupMeetingRoomConfig {
  enabled: boolean
  pricePerDay: number
}

export interface GroupFreeRoomsConfig {
  enabled: boolean
  count: number
}

export interface GroupConfig {
  enabled: boolean
  bookingMode: GroupBookingMode
  groupEmail: string | null
  pricingDirection: GroupPricingDirection
  pricingPct: number
  cancellationRanges: GroupCancellationRange[]
  paymentInParWithCancellation: boolean
  paymentRanges: GroupPaymentRange[]
  mealsConfig: GroupMealsConfig
  meetingRoomConfig: GroupMeetingRoomConfig
  freeRoomsConfig: GroupFreeRoomsConfig
  groupPolicies: string | null
  rateSelection: GroupRateSelection
  ratePriority: GroupRatePriorityItem[]
}

export interface GroupConfigUpdate {
  enabled?: boolean
  bookingMode?: GroupBookingMode
  groupEmail?: string | null
  pricingDirection?: GroupPricingDirection
  pricingPct?: number
  cancellationRanges?: GroupCancellationRange[]
  paymentInParWithCancellation?: boolean
  paymentRanges?: GroupPaymentRange[]
  mealsConfig?: GroupMealsConfig
  meetingRoomConfig?: GroupMeetingRoomConfig
  freeRoomsConfig?: GroupFreeRoomsConfig
  groupPolicies?: string | null
  rateSelection?: GroupRateSelection
  ratePriority?: GroupRatePriorityItem[]
}

export interface GroupPropertyOverride {
  enabled: boolean | null
  bookingMode: GroupBookingMode | null
  groupEmail: string | null
  pricingDirection: GroupPricingDirection | null
  pricingPct: number | null
  cancellationRanges: GroupCancellationRange[] | null
  paymentInParWithCancellation: boolean | null
  paymentRanges: GroupPaymentRange[] | null
  mealsConfig: GroupMealsConfig | null
  meetingRoomConfig: GroupMeetingRoomConfig | null
  freeRoomsConfig: GroupFreeRoomsConfig | null
  groupPolicies: string | null
  rateSelection: GroupRateSelection | null
  ratePriority: GroupRatePriorityItem[] | null
}

// Public resolved config for the groups page
export interface PublicGroupConfig {
  enabled: boolean
  bookingMode: GroupBookingMode
  pricingDirection: GroupPricingDirection
  pricingPct: number
  cancellationRanges: GroupCancellationRange[]
  paymentInParWithCancellation: boolean
  paymentRanges: GroupPaymentRange[]
  mealsConfig: GroupMealsConfig
  meetingRoomConfig: GroupMeetingRoomConfig
  freeRoomsConfig: GroupFreeRoomsConfig
  groupPolicies: string | null
  rateSelection: GroupRateSelection
  ratePriority: GroupRatePriorityItem[]
}

// Groups inquiry (offline mode)
export interface GroupInquiryRequest {
  propertyId: number
  checkIn: string
  checkOut: string
  nationality: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  message?: string
  rooms: Array<{
    roomId: number
    roomName: string
    roomTypeCode: string
    quantity: number
    unitPrice: number  // group-adjusted price per room per night
    nights: number
    totalAmount: number
  }>
  meals?: Array<{
    type: 'breakfast' | 'lunch' | 'dinner'
    adults: number
    children: number
    infants: number
    priceAdult: number
    priceChild: number
    priceInfant: number
    nights: number
    totalAmount: number
  }>
  meetingRoom?: {
    pricePerDay: number
    nights: number
    totalAmount: number
  }
  totalAmount: number
  currency: string
}
