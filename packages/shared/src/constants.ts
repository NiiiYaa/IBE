/**
 * Application-wide constants.
 * Never use magic strings/numbers in code — reference these instead.
 */

export const DEFAULT_CURRENCY = 'EUR'
export const DEFAULT_LOCALE = 'en'
export const DEFAULT_NATIONALITY = 'US'

export const MAX_ROOMS_PER_SEARCH = 9
export const MAX_ADULTS_PER_ROOM = 9
export const MAX_CHILDREN_PER_ROOM = 6
export const MAX_CHILD_AGE = 17
export const MIN_ADULTS_PER_ROOM = 1

export const SEARCH_CACHE_TTL_SECONDS = 300          // 5 minutes
export const STATIC_DATA_CACHE_TTL_SECONDS = 86_400  // 24 hours
export const HOTEL_LIST_CACHE_TTL_SECONDS = 3_600    // 1 hour

export const BOOKING_LIST_MAX_PAGE_SIZE = 100

/** HyperGuest error code prefixes */
export const HG_SEARCH_ERROR_PREFIX = 'SN'
export const HG_BOOKING_ERROR_PREFIX = 'BN'

/** HyperGuest-specific booking error codes */
export const HG_ERROR_PRICE_CHANGED = 'BN.402'
export const HG_ERROR_NO_AVAILABILITY = 'BN.502'
export const HG_ERROR_PAYMENT_ISSUE = 'BN.507'

/** Internal IBE error codes */
export const IBE_ERROR_SEARCH_FAILED = 'IBE.SEARCH.001'
export const IBE_ERROR_SEARCH_CONSTRAINT = 'IBE.SEARCH.002'
export const IBE_ERROR_BOOKING_FAILED = 'IBE.BOOKING.001'
export const IBE_ERROR_PRICE_MISMATCH = 'IBE.BOOKING.002'
export const IBE_ERROR_UNAVAILABLE = 'IBE.BOOKING.003'
export const IBE_ERROR_VALIDATION = 'IBE.VALIDATION.001'
export const IBE_ERROR_NOT_FOUND = 'IBE.NOT_FOUND'
export const IBE_ERROR_INTERNAL = 'IBE.INTERNAL'
