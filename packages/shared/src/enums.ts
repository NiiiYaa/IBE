/**
 * Board (meal plan) codes as used by HyperGuest / standard hospitality codes.
 */
export enum BoardType {
  RoomOnly = 'RO',
  BedAndBreakfast = 'BB',
  HalfBoard = 'HB',
  FullBoard = 'FB',
  AllInclusive = 'AI',
}

export const BOARD_TYPE_LABELS: Record<BoardType, string> = {
  [BoardType.RoomOnly]: 'Room Only',
  [BoardType.BedAndBreakfast]: 'Bed & Breakfast',
  [BoardType.HalfBoard]: 'Half Board',
  [BoardType.FullBoard]: 'Full Board',
  [BoardType.AllInclusive]: 'All Inclusive',
}

/**
 * Cancellation penalty types returned by HyperGuest search.
 */
export enum CancellationPenaltyType {
  Currency = 'currency',
  Percent = 'percent',
  Nights = 'nights',
}

/**
 * Who pays for the reservation.
 */
export enum ChargeParty {
  Agent = 'agent',
  Customer = 'customer',
}

/**
 * The type of price the hotel expects.
 */
export enum ChargeType {
  Net = 'net',
  Sell = 'sell',
  Gross = 'gross',
}

/**
 * How a tax or fee relates to the displayed price.
 */
export enum TaxRelation {
  Included = 'included',
  Display = 'display',
  Add = 'add',
  Ignore = 'ignore',
}

/**
 * Tax/fee scope — what it applies to.
 */
export enum TaxScope {
  PerStay = 'per_stay',
  PerRoom = 'per_room',
  PerBedroom = 'per_bedroom',
  PerPerson = 'per_person',
  PerAdult = 'per_adult',
  PerChild = 'per_child',
}

/**
 * Tax/fee frequency — how often it is charged.
 */
export enum TaxFrequency {
  PerStay = 'per_stay',
  PerNight = 'per_night',
  PerWeek = 'per_week',
}

/**
 * Supported payment method types.
 */
export enum PaymentMethodType {
  CreditCard = 'credit_card',
  CreditBalance = 'credit_balance',
  BankTransfer = 'bank_transfer',
  External = 'external',
  Enett = 'enett',
  PayPal = 'paypal',
  Stripe = 'stripe',
}

/**
 * Payment flow type — determines which Stripe intent and UI to use.
 *
 * online_charge         — rate is pre-paid; Stripe charges the card after HyperGuest confirms
 * pay_at_hotel_guarantee — rate is pay-at-hotel; card is collected as a guarantee (not charged)
 * pay_at_hotel_no_card  — rate is pay-at-hotel; no card required (admin config)
 */
export enum PaymentFlow {
  OnlineCharge = 'online_charge',
  PayAtHotelGuarantee = 'pay_at_hotel_guarantee',
  PayAtHotelNoCard = 'pay_at_hotel_no_card',
}

/**
 * Stripe intent types used for each payment flow.
 */
export enum StripeIntentType {
  Payment = 'payment',  // PaymentIntent — for online charge (manual capture)
  Setup = 'setup',      // SetupIntent   — for guarantee-only (no charge)
}

/**
 * Booking status codes from HyperGuest.
 */
export enum BookingStatus {
  Confirmed = 'Confirmed',
  Pending = 'Pending',
  Rejected = 'Rejected',
  Cancelled = 'Cancelled',
  Failed = 'Failed',
}

/**
 * Guest title options.
 */
export enum GuestTitle {
  Mr = 'MR',
  Ms = 'MS',
  Mrs = 'MRS',
  Child = 'C',
}

/**
 * Supported locale codes.
 */
export enum Locale {
  En = 'en',
  He = 'he',
  Es = 'es',
  Fr = 'fr',
  De = 'de',
  It = 'it',
  Pt = 'pt',
  Ar = 'ar',
  Ru = 'ru',
  Zh = 'zh',
}

/**
 * RTL locales — used to set document direction.
 */
export const RTL_LOCALES: Set<Locale> = new Set([Locale.He, Locale.Ar])
