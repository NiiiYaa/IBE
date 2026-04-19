/**
 * API contract types — shared between the backend (apps/api) and frontend (apps/web).
 * These are the shapes the IBE API exposes to the frontend, independent of HyperGuest internals.
 */

import type { BoardType, BookingStatus, GuestTitle, PaymentFlow, PaymentMethodType, StripeIntentType, TaxRelation } from '../enums.js'

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchParams {
  hotelId: number
  checkIn: string        // YYYY-MM-DD
  checkOut: string       // YYYY-MM-DD
  rooms: RoomOccupancy[]
  nationality?: string   // ISO 3166-1 alpha-2
  currency?: string      // ISO 4217
  promoCode?: string
  affiliateCode?: string
}

export interface RoomOccupancy {
  adults: number
  childAges?: number[]
}

export interface TaxEntry {
  description: string
  amount: number
  currency: string
  relation: TaxRelation
}

export interface PriceBreakdown {
  net: { amount: number; currency: string; taxes: TaxEntry[] }
  sell: { amount: number; currency: string; taxes: TaxEntry[] }
  bar: { amount: number; currency: string }
  fees: TaxEntry[]
}

export interface NightlyPrice {
  date: string
  net: number
  sell: number
  currency: string
}

export interface CancellationDeadline {
  /** ISO datetime string of the effective deadline in property local time */
  deadline: string
  penaltyType: string
  penaltyAmount: number
  /** 'free' | 'penalty' */
  type: 'free' | 'penalty'
}

export interface RateOption {
  ratePlanId: number
  ratePlanCode: string
  ratePlanName: string
  board: BoardType
  boardLabel: string
  isRefundable: boolean
  cancellationDeadlines: CancellationDeadline[]
  remarks: string[]
  prices: PriceBreakdown
  nightlyBreakdown: NightlyPrice[]
  isImmediate: boolean
  chargeParty: 'agent' | 'customer'
  isPromotion: boolean
  isPrivate: boolean
  promoCode?: string
  promoDiscount?: number       // percentage 0–100
  originalSellAmount?: number  // sell price before any discount
  affiliateCode?: string
  affiliateDiscount?: number   // percentage 0–100
  affiliateDisplayText?: string
}

export interface RoomOption {
  roomId: number
  roomTypeCode: string
  roomName: string
  availableCount: number
  maxOccupancy: number
  maxAdults: number
  maxChildren: number
  roomSizeM2: number
  bedding: Array<{ type: string; quantity: number }>
  rates: RateOption[]
  /** Index of the room occupancy request this result maps to */
  requestedRoomIndex: number
}

export interface PropertySearchResult {
  propertyId: number
  propertyName: string
  starRating: number
  cityName: string
  countryCode: string
  latitude: number
  longitude: number
  rooms: RoomOption[]
  remarks: string[]
}

export interface SearchResponse {
  results: PropertySearchResult[]
  searchId: string   // used to correlate search with booking for meta tracking
  currency: string
  checkIn: string
  checkOut: string
  nights: number
}

// ── Static Data ───────────────────────────────────────────────────────────────

export interface PropertyImage {
  id: number
  url: string
  description: string
  priority: number
}

export interface PropertyFacility {
  id: number
  name: string
  category: string
  classification: string
  popular: boolean
}

export interface PropertyDescription {
  text: string
  locale: string
}

export interface RoomDetail {
  roomId: number
  roomCode: string
  name: string
  descriptions: PropertyDescription[]
  facilities: PropertyFacility[]
  images: PropertyImage[]
  beds: Array<{ type: string; quantity: number }>
}

export interface PropertyDetail {
  propertyId: number
  name: string
  starRating: number
  logo: string
  descriptions: PropertyDescription[]
  images: PropertyImage[]
  facilities: PropertyFacility[]
  rooms: RoomDetail[]
  contact: { email: string | null; phone: string | null; website: string | null }
  location: {
    address: string
    city: string
    countryCode: string
    postcode: string
    coordinates: { latitude: number; longitude: number }
  }
}

// ── Booking ───────────────────────────────────────────────────────────────────

export interface GuestInfo {
  title: GuestTitle
  firstName: string
  lastName: string
  birthDate: string
  email?: string
  phone?: string
  address?: string
  city?: string
  country?: string
  state?: string
  zip?: string
}

export interface BookingRoomRequest {
  roomId: number
  ratePlanId: number
  roomCode: string
  rateCode: string
  expectedAmount: number
  expectedCurrency: string
  guests: GuestInfo[]
  specialRequests?: string[]
  originalSellAmount?: number
}

export interface CreateBookingRequest {
  propertyId: number
  checkIn: string
  checkOut: string
  leadGuest: GuestInfo
  rooms: BookingRoomRequest[]
  paymentMethod: PaymentMethodType
  paymentFlow: PaymentFlow
  /** Stripe PaymentIntent ID — required for PaymentFlow.OnlineCharge */
  stripePaymentIntentId?: string
  /** Stripe SetupIntent ID — required for PaymentFlow.PayAtHotelGuarantee */
  stripeSetupIntentId?: string
  agencyReference?: string
  affiliateId?: string
  searchId?: string
  isTest?: boolean
  promoCode?: string
  promoDiscount?: number
}

export interface BookingCancellationFrame {
  from: string
  to: string | null
  penaltyAmount: number
  currency: string
}

export interface BookingConfirmation {
  bookingId: number
  hyperGuestBookingId: number
  status: BookingStatus
  propertyId: number
  checkIn: string
  checkOut: string
  rooms: Array<{
    itemId: number
    roomCode: string
    rateCode: string
    board: BoardType
    status: BookingStatus
    cancellationFrames: BookingCancellationFrame[]
    propertyReference?: string
  }>
  totalAmount: number
  currency: string
  leadGuest: { firstName: string; lastName: string; email: string }
  createdAt: string
}

// ── Hotel Design Config ───────────────────────────────────────────────────────

export interface HotelDesignConfig {
  propertyId: number
  // Colors
  colorPrimary: string
  colorPrimaryHover: string
  colorPrimaryLight: string
  colorAccent: string
  colorBackground: string
  colorSurface: string
  colorText: string
  colorTextMuted: string
  colorBorder: string
  colorSuccess: string
  colorError: string
  // Typography
  fontFamily: string
  fontUrl: string        // resolved Google Fonts URL
  // Shape
  borderRadius: number   // px
  // Content
  logoUrl: string | null
  faviconUrl: string | null
  heroImageUrl: string | null
  searchResultsImageUrl: string | null
  displayName: string | null
  tagline: string | null
  tabTitle: string | null
  // Localisation
  defaultCurrency: string
  defaultLocale: string
  textDirection: 'ltr' | 'rtl'
  enabledLocales: string[]
  enabledCurrencies: string[]
  // Payment features
  onlinePaymentEnabled: boolean
  payAtHotelEnabled: boolean
  payAtHotelCardGuaranteeRequired: boolean
  // Guest age configuration
  infantMaxAge: number   // ages 0–infantMaxAge are infants
  childMaxAge: number    // ages (infantMaxAge+1)–childMaxAge are children; above are adults
  roomRatesDefaultExpanded: boolean
  heroStyle: 'fullpage' | 'rectangle' | 'quilt'
  heroImageMode: 'fixed' | 'carousel'
  heroCarouselInterval: number
  searchResultsImageMode: 'fixed' | 'carousel'
  searchResultsCarouselInterval: number
  searchResultsExcludedImageIds: number[]
  excludedPropertyImageIds: number[]
  excludedRoomImageIds: number[]
  roomPrimaryImageIds: Record<number, number>
  tripadvisorHotelKey: string | null
  priceComparisonEnabled: boolean
  chainHeroImageUrl: string | null
}

export interface UpdateDesignConfigRequest {
  colorPrimary?: string | null
  colorPrimaryHover?: string | null
  colorPrimaryLight?: string | null
  colorAccent?: string | null
  colorBackground?: string | null
  colorSurface?: string | null
  colorText?: string | null
  colorTextMuted?: string | null
  colorBorder?: string | null
  colorSuccess?: string | null
  colorError?: string | null
  fontFamily?: string | null
  borderRadius?: number | null
  logoUrl?: string | null
  faviconUrl?: string | null
  heroImageUrl?: string | null
  searchResultsImageUrl?: string | null
  displayName?: string | null
  tagline?: string | null
  tabTitle?: string | null
  defaultCurrency?: string | null
  defaultLocale?: string | null
  textDirection?: 'ltr' | 'rtl' | null
  enabledLocales?: string[] | null
  enabledCurrencies?: string[] | null
  onlinePaymentEnabled?: boolean | null
  payAtHotelEnabled?: boolean | null
  payAtHotelCardGuaranteeRequired?: boolean | null
  infantMaxAge?: number | null
  childMaxAge?: number | null
  roomRatesDefaultExpanded?: boolean | null
  heroStyle?: 'fullpage' | 'rectangle' | 'quilt' | null
  heroImageMode?: 'fixed' | 'carousel' | null
  heroCarouselInterval?: number | null
  searchResultsImageMode?: 'fixed' | 'carousel' | null
  searchResultsCarouselInterval?: number | null
  searchResultsExcludedImageIds?: number[]
  excludedPropertyImageIds?: number[]
  excludedRoomImageIds?: number[]
  roomPrimaryImageIds?: Record<number, number>
  tripadvisorHotelKey?: string | null
  priceComparisonEnabled?: boolean
}

export interface PropertyDesignAdminResponse {
  propertyId: number
  overrides: OrgDesignDefaultsConfig   // nulls = inheriting from org/system
  orgDefaults: OrgDesignDefaultsConfig
}

export interface OrgDesignDefaultsConfig {
  colorPrimary: string | null
  colorPrimaryHover: string | null
  colorPrimaryLight: string | null
  colorAccent: string | null
  colorBackground: string | null
  colorSurface: string | null
  colorText: string | null
  colorTextMuted: string | null
  colorBorder: string | null
  colorSuccess: string | null
  colorError: string | null
  fontFamily: string | null
  borderRadius: number | null
  logoUrl: string | null
  faviconUrl: string | null
  displayName: string | null
  tagline: string | null
  tabTitle: string | null
  defaultCurrency: string | null
  defaultLocale: string | null
  textDirection: string | null
  enabledLocales: string[] | null
  enabledCurrencies: string[] | null
  heroStyle: 'fullpage' | 'rectangle' | 'quilt' | null
  heroImageMode: 'fixed' | 'carousel' | null
  heroCarouselInterval: number | null
  searchResultsImageUrl: string | null
  searchResultsImageMode: 'fixed' | 'carousel' | null
  searchResultsCarouselInterval: number | null
  roomRatesDefaultExpanded: boolean | null
  infantMaxAge: number | null
  childMaxAge: number | null
  onlinePaymentEnabled: boolean | null
  payAtHotelEnabled: boolean | null
  payAtHotelCardGuaranteeRequired: boolean | null
  chainHeroImageUrl: string | null
}

export interface OrgNavItem {
  id: string
  organizationId: number
  section: NavItemSection
  label: string
  type: NavItemType
  url?: string | null
  content?: string | null
  order: number
}

export interface CreateOrgNavItemRequest {
  section: NavItemSection
  label: string
  type: NavItemType
  url?: string | null
  content?: string | null
  order?: number
}

export interface UpdateOrgNavItemRequest {
  label?: string
  type?: NavItemType
  url?: string | null
  content?: string | null
  order?: number
}

// ── Promo Codes ───────────────────────────────────────────────────────────────

export type PromoValidDateType = 'booking' | 'stay'

export interface PromoCode {
  id: number
  code: string
  description: string | null
  discountValue: number        // percentage 0–100
  maxUses: number | null       // null = unlimited
  usesCount: number
  validFrom: string | null     // ISO date string
  validTo: string | null       // ISO date string
  validDateType: PromoValidDateType
  isActive: boolean
  createdAt: string
  propertyId: number | null
  isGlobal: boolean
  propertyEnabled: boolean | null  // null = no property-level override; inherit isActive
}

export interface CreatePromoCodeRequest {
  code: string
  description?: string | null
  discountValue: number
  maxUses?: number | null
  validFrom?: string | null
  validTo?: string | null
  validDateType?: PromoValidDateType
  isActive?: boolean
  propertyId?: number | null
}

export interface UpdatePromoCodeRequest {
  code?: string
  description?: string | null
  discountValue?: number
  maxUses?: number | null
  validFrom?: string | null
  validTo?: string | null
  validDateType?: PromoValidDateType
  isActive?: boolean
}

// ── Communication ─────────────────────────────────────────────────────────────

export type EmailProvider = 'smtp' | 'sendgrid' | 'mailgun'
export type WhatsAppProvider = 'meta' | 'twilio'
export type SmsProvider = 'twilio' | 'vonage' | 'aws'

export interface CommunicationSettingsResponse {
  emailEnabled: boolean
  emailProvider: EmailProvider
  emailFromName: string
  emailFromAddress: string
  emailSmtpHost: string
  emailSmtpPort: number
  emailSmtpUser: string
  emailSmtpSecure: boolean
  emailSmtpPasswordSet: boolean
  emailApiKeySet: boolean

  whatsappEnabled: boolean
  whatsappProvider: WhatsAppProvider
  whatsappPhoneNumberId: string
  whatsappBusinessAccountId: string
  whatsappAccessTokenSet: boolean
  whatsappTwilioAccountSid: string
  whatsappTwilioAuthTokenSet: boolean
  whatsappTwilioNumber: string

  smsEnabled: boolean
  smsProvider: SmsProvider
  smsFromNumber: string
  smsTwilioAccountSid: string
  smsTwilioAuthTokenSet: boolean
  smsVonageApiKey: string
  smsVonageApiSecretSet: boolean
  smsAwsAccessKey: string
  smsAwsSecretKeySet: boolean
  smsAwsRegion: string
}

export interface UpdateCommunicationSettingsRequest {
  emailEnabled?: boolean
  emailProvider?: EmailProvider
  emailFromName?: string
  emailFromAddress?: string
  emailSmtpHost?: string
  emailSmtpPort?: number
  emailSmtpUser?: string
  emailSmtpSecure?: boolean
  emailSmtpPassword?: string
  emailApiKey?: string

  whatsappEnabled?: boolean
  whatsappProvider?: WhatsAppProvider
  whatsappPhoneNumberId?: string
  whatsappBusinessAccountId?: string
  whatsappAccessToken?: string
  whatsappTwilioAccountSid?: string
  whatsappTwilioAuthToken?: string
  whatsappTwilioNumber?: string

  smsEnabled?: boolean
  smsProvider?: SmsProvider
  smsFromNumber?: string
  smsTwilioAccountSid?: string
  smsTwilioAuthToken?: string
  smsVonageApiKey?: string
  smsVonageApiSecret?: string
  smsAwsAccessKey?: string
  smsAwsSecretKey?: string
  smsAwsRegion?: string
}

// ── Message Rules ─────────────────────────────────────────────────────────────

export type MessageTrigger = 'booking_confirmed' | 'booking_cancelled' | 'cancellation_deadline' | 'checkin' | 'checkout'
export type MessageChannel = 'email' | 'whatsapp' | 'sms'
export type MessageOffsetUnit = 'hours' | 'days'
export type MessageDirection = 'before' | 'after'

export interface MessageRule {
  id: number
  name: string
  enabled: boolean
  channels: MessageChannel[]
  trigger: MessageTrigger
  offsetValue: number
  offsetUnit: MessageOffsetUnit
  direction: MessageDirection
  createdAt: string
  propertyId: number | null
  isGlobal: boolean
  propertyEnabled: boolean | null  // null = no property-level override; inherit enabled
}

export interface CreateMessageRuleRequest {
  name: string
  enabled?: boolean
  channels: MessageChannel[]
  trigger: MessageTrigger
  offsetValue?: number
  offsetUnit?: MessageOffsetUnit
  direction?: MessageDirection
  propertyId?: number | null
}

export interface UpdateMessageRuleRequest {
  name?: string
  enabled?: boolean
  channels?: MessageChannel[]
  trigger?: MessageTrigger
  offsetValue?: number
  offsetUnit?: MessageOffsetUnit
  direction?: MessageDirection
}

// ── Nav Items ─────────────────────────────────────────────────────────────────

export type NavItemSection = 'header' | 'footer'
export type NavItemType = 'static' | 'link' | 'popup'

export interface NavItem {
  id: string
  propertyId: number
  section: NavItemSection
  label: string
  type: NavItemType
  url?: string | null
  content?: string | null
  order: number
}

export interface CreateNavItemRequest {
  section: NavItemSection
  label: string
  type: NavItemType
  url?: string | null
  content?: string | null
  order?: number
}

export interface UpdateNavItemRequest {
  label?: string
  type?: NavItemType
  url?: string | null
  content?: string | null
  order?: number
}

// ── Admin: Properties & Org Settings ─────────────────────────────────────────

export type PropertyMode = 'single' | 'multi'

export interface PropertyRecord {
  id: number
  propertyId: number
  isDefault: boolean
  isActive: boolean
  lastSyncedAt: string | null
  createdAt: string
  isDemo?: boolean
  orgId?: number
  orgName?: string
  subdomain?: string | null
  hyperGuestBearerToken?: string | null
  hyperGuestStaticDomain?: string | null
  hyperGuestSearchDomain?: string | null
  hyperGuestBookingDomain?: string | null
}

export interface PropertyUserAssignment {
  id: number
  name: string
  email: string
  assigned: boolean
}

export interface PropertyListResponse {
  mode: PropertyMode
  showCitySelector: boolean
  showDemoProperty: boolean
  properties: PropertyRecord[]
}

export interface SuperPropertyListResponse {
  properties: PropertyRecord[]
}

export interface ImportRowResult {
  row: number
  value: string
  succeeded: boolean
  error?: string
}

export interface ImportSummary {
  total: number
  successCount: number
  failureCount: number
  results: ImportRowResult[]
}

export type OnsitePage = 'chain' | 'hotel' | 'room'

export interface OnsiteConversionSettings {
  presenceEnabled: boolean
  presenceMinViewers: number
  presenceMessage: string
  presencePages: OnsitePage[]
  bookingsEnabled: boolean
  bookingsWindowHours: number
  bookingsMinCount: number
  bookingsMessage: string
  bookingsPages: OnsitePage[]
  popupEnabled: boolean
  popupDelaySeconds: number
  popupMessage: string | null
  popupPromoCode: string | null
  popupPages: OnsitePage[]
}

export type UpdateOnsiteConversionRequest = Partial<OnsiteConversionSettings>

// All fields nullable — null means "inherit from org default"
export interface OnsiteConversionOverrides {
  presenceEnabled: boolean | null
  presenceMinViewers: number | null
  presenceMessage: string | null
  presencePages: OnsitePage[] | null
  bookingsEnabled: boolean | null
  bookingsWindowHours: number | null
  bookingsMinCount: number | null
  bookingsMessage: string | null
  bookingsPages: OnsitePage[] | null
  popupEnabled: boolean | null
  popupDelaySeconds: number | null
  popupMessage: string | null
  popupPromoCode: string | null
  popupPages: OnsitePage[] | null
}

export type UpdateOnsiteConversionOverridesRequest = Partial<OnsiteConversionOverrides>

export interface PropertyOnsiteConversionAdminResponse {
  propertyId: number
  overrides: OnsiteConversionOverrides
  orgDefaults: OnsiteConversionSettings
  effective: OnsiteConversionSettings
}

export interface OnsiteStats {
  settings: OnsiteConversionSettings
  viewerCount: number
  recentBookingsCount: number
  popupPromoDiscount: number | null
}

export interface OrgSettingsResponse {
  hyperGuestOrgId: string | null
  hyperGuestBearerToken: string | null       // masked as ****xxxx when set
  hyperGuestBearerTokenSet: boolean
  hyperGuestStaticDomain: string | null
  hyperGuestSearchDomain: string | null
  hyperGuestBookingDomain: string | null
  effectiveBearerTokenSet: boolean
  effectiveStaticDomain: string
  effectiveSearchDomain: string
  effectiveBookingDomain: string
  envFallback: {
    staticDomain: boolean
    searchDomain: boolean
    bookingDomain: boolean
  }
  rateProvider: string
  defaultPropertyId: number | undefined
  webDomain: string | null
  tlsCert: string | null
  tlsCertSet: boolean
  tlsKeySet: boolean
}

export interface UpdateOrgSettingsRequest {
  hyperGuestOrgId?: string
  hyperGuestBearerToken?: string
  hyperGuestStaticDomain?: string
  hyperGuestSearchDomain?: string
  hyperGuestBookingDomain?: string
  webDomain?: string
  tlsCert?: string
  tlsKey?: string
}

// ── Payment ───────────────────────────────────────────────────────────────────

export interface CreatePaymentIntentRequest {
  /** IBE booking flow that determines which Stripe intent to create */
  paymentFlow: PaymentFlow
  /** Amount in minor units (cents). Required for PaymentFlow.OnlineCharge */
  amount?: number
  /** ISO 4217 currency. Required for PaymentFlow.OnlineCharge */
  currency?: string
  /** Property ID — used to look up hotel config (guarantee required etc.) */
  propertyId: number
}

export interface CreatePaymentIntentResponse {
  /** Stripe client_secret — passed to Stripe Elements on the frontend */
  clientSecret: string
  /** Type of intent created */
  intentType: StripeIntentType
  /** Stripe intent ID (PaymentIntent or SetupIntent) */
  intentId: string
  /** Resolved payment flow for this property + rate combination */
  paymentFlow: PaymentFlow
}

// ── Exchange Rates ────────────────────────────────────────────────────────────

export interface ExchangeRatesResponse {
  base: string
  date: string
  rates: Record<string, number>
}

// ── Common ────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string
  message?: string   // Fastify uses this for the human-readable message, 'error' for HTTP status name
  code: string
  details?: Array<{ field?: string; message: string }>
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

// ── Price Comparison OTAs ─────────────────────────────────────────────────────

export interface PriceComparisonOta {
  id: number
  name: string
  url: string
  isEnabled: boolean
  createdAt: string
}

export interface CreatePriceComparisonOtaRequest {
  name: string
  url: string
  isEnabled?: boolean
}

export interface UpdatePriceComparisonOtaRequest {
  name?: string
  url?: string
  isEnabled?: boolean
}

// ── Price Comparison Results ───────────────────────────────────────────────────

export interface OtaPriceResult {
  otaId: number
  otaName: string
  price: number | null   // null = scrape pending or failed
  currency: string
  status: 'ok' | 'pending' | 'failed'
}

export interface PriceComparisonResponse {
  results: OtaPriceResult[]
}

// ── Affiliates ────────────────────────────────────────────────────────────────

export interface Affiliate {
  id: number
  code: string
  name: string
  email: string | null
  commissionRate: number | null
  discountRate: number | null      // optional guest-facing price discount (%)
  displayText: string | null       // label for "Special for [text]" tag
  notes: string | null
  isActive: boolean
  createdAt: string
  propertyId: number | null
  isGlobal: boolean
  propertyEnabled: boolean | null  // null = no property-level override; inherit isActive
}

export interface SetPropertyOverrideRequest {
  entityType: 'affiliate' | 'message_rule' | 'promo_code'
  entityId: number
  propertyId: number
  isEnabled: boolean
}

export interface CreateAffiliateRequest {
  code: string
  name: string
  email?: string | null
  commissionRate?: number | null
  discountRate?: number | null
  displayText?: string | null
  notes?: string | null
  isActive?: boolean
  propertyId?: number | null
}

export interface UpdateAffiliateRequest {
  code?: string
  name?: string
  email?: string | null
  commissionRate?: number | null
  discountRate?: number | null
  displayText?: string | null
  notes?: string | null
  isActive?: boolean
}

// ── Organizations (super admin) ───────────────────────────────────────────────

export interface OrgRecord {
  id: number
  name: string
  slug: string
  hyperGuestOrgId: string | null
  userCount: number
  createdAt: string
}

export interface CreateOrgRequest {
  name: string
  hyperGuestOrgId?: string | null
}

// ── Admin Users ───────────────────────────────────────────────────────────────

export interface AdminUserRecord {
  id: number
  email: string
  name: string
  role: string
  isActive: boolean
  createdAt: string
  orgId?: number
  orgName?: string
  orgHyperGuestOrgId?: string | null
  propertyIds?: number[]
}

export interface CreateAdminUserRequest {
  email: string
  name: string
  role: string
  orgId?: number  // required when creating as super admin
}

export interface CreateAdminUserResponse extends AdminUserRecord {
  temporaryPassword: string
}

export interface UpdateAdminUserRequest {
  name?: string
  role?: string
  isActive?: boolean
}

// ── Offers Settings ───────────────────────────────────────────────────────────

export type CancellationPolicyFilter = 'free' | 'non_refundable'
export type ChargePartyFilter = 'agent' | 'customer'
export type PaymentMethodFilter = 'online' | 'at_hotel'

export type BookingMode = 'single' | 'multi'
export type MultiRoomLimitBy = 'search' | 'hotel'

export interface OrgOffersSettings {
  minNights: number | null
  maxNights: number | null
  minRooms: number | null
  maxRooms: number | null
  allowedCancellationPolicies: CancellationPolicyFilter[] | null  // null = all allowed
  allowedBoardTypes: string[] | null                              // null = all allowed
  allowedChargeParties: ChargePartyFilter[] | null                // null = all allowed
  allowedPaymentMethods: PaymentMethodFilter[] | null             // null = all allowed
  minOfferValue: number | null
  minOfferCurrency: string | null
  bookingMode: BookingMode | null
  multiRoomLimitBy: MultiRoomLimitBy | null
}

export interface PropertyOffersAdminResponse {
  propertyId: number
  overrides: OrgOffersSettings   // null fields = inheriting from org
  orgDefaults: OrgOffersSettings // org-level values (null = system default)
}

export interface UpdateOffersSettingsRequest {
  minNights?: number | null
  maxNights?: number | null
  minRooms?: number | null
  maxRooms?: number | null
  allowedCancellationPolicies?: CancellationPolicyFilter[] | null
  allowedBoardTypes?: string[] | null
  allowedChargeParties?: ChargePartyFilter[] | null
  allowedPaymentMethods?: PaymentMethodFilter[] | null
  minOfferValue?: number | null
  minOfferCurrency?: string | null
  bookingMode?: BookingMode | null
  multiRoomLimitBy?: MultiRoomLimitBy | null
}


// ── Admin Bookings ────────────────────────────────────────────────────────────

export interface AdminBookingRow {
  id: number
  hyperGuestBookingId: number
  status: string
  organizationId: number | null
  propertyId: number
  hotelName: string | null
  hotelAddress: string | null
  bookingDate: string
  cancellationDeadline: string | null
  checkIn: string
  checkOut: string
  nights: number
  cancellationDate: string | null
  currency: string
  originalPrice: number | null
  discountedPrice: number
  promoCode: string | null
  promoDiscountPct: number | null
  affiliateCode: string | null
  affiliateName: string | null
  affiliateDiscountPct: number | null
  commissionPct: number | null
  commissionValue: number | null
  guestName: string
  guestEmail: string
  paymentMethod: string
  roomCount: number
  agencyReference: string | null
  isTest: boolean
}

export interface AdminBookingsResponse {
  bookings: AdminBookingRow[]
  total: number
  page: number
  pageSize: number
}

// ── Guest Portal ──────────────────────────────────────────────────────────────

export interface GuestProfile {
  id: number
  email: string
  firstName: string
  lastName: string
  phone: string | null
  nationality: string | null
  createdAt: string
}

export interface GuestBookingSummary {
  id: number
  hyperGuestBookingId: number
  status: string
  propertyId: number
  checkIn: string
  checkOut: string
  nights: number
  currency: string
  totalAmount: number
  promoCode: string | null
  cancellationDeadline: string | null
  canCancel: boolean
  roomCount: number
  createdAt: string
}

export interface GuestBookingDetail extends GuestBookingSummary {
  originalPrice: number | null
  promoDiscountPct: number | null
  affiliateCode: string | null
  paymentMethod: string
  agencyReference: string | null
  rooms: Array<{ roomCode: string; rateCode: string; board: string; status: string }>
}

// ── Admin: Guest Management ───────────────────────────────────────────────────

export interface AdminGuestNote {
  id: number
  content: string
  authorName: string
  createdAt: string
}

export interface AdminGuestStats {
  bookingCount: number
  totalSpend: number
  lastStay: string | null
}

export interface AdminGuestRow {
  id: number
  email: string
  firstName: string
  lastName: string
  phone: string | null
  nationality: string | null
  isBlocked: boolean
  blockedReason: string | null
  createdAt: string
}

export interface AdminGuestProfile extends AdminGuestRow {
  stats: AdminGuestStats
  notes: AdminGuestNote[]
}

export interface AdminGuestsResponse {
  guests: AdminGuestRow[]
  total: number
  page: number
  pageSize: number
}

// ── Tracking Pixels ───────────────────────────────────────────────────────────

export type TrackingPage = 'all' | 'home' | 'search' | 'booking' | 'confirmation'

export interface TrackingPixel {
  id: number
  propertyId: number | null
  name: string
  code: string
  pages: TrackingPage[]
  isActive: boolean
  createdAt: string
}

export interface CreateTrackingPixelRequest {
  name: string
  code: string
  pages: TrackingPage[]
  isActive?: boolean
}

export interface UpdateTrackingPixelRequest {
  name?: string
  code?: string
  pages?: TrackingPage[]
  isActive?: boolean
}
