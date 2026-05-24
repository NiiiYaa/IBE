/**
 * Utilities for encoding/decoding search parameters to/from URL query strings.
 * Used to keep search state in the URL (shareable, back-button compatible).
 */

import type { RoomOccupancy } from '@ibe/shared'

export interface SearchUrlParams {
  hotelId: number
  checkIn: string
  checkOut: string
  rooms: RoomOccupancy[]
  nationality?: string | undefined
  currency?: string | undefined
  promoCode?: string | undefined
  affiliateId?: string | undefined
  campaignId?: string | undefined
}

/**
 * Encodes SearchUrlParams into a URLSearchParams object.
 */
export function encodeSearchParams(params: SearchUrlParams): URLSearchParams {
  const qs = new URLSearchParams({
    hotelId: String(params.hotelId),
    checkIn: params.checkIn,
    checkOut: params.checkOut,
  })

  params.rooms.forEach((room, i) => {
    qs.set(`rooms[${i}][adults]`, String(room.adults))
    room.childAges?.forEach((age) => {
      qs.append(`rooms[${i}][childAges][]`, String(age))
    })
  })

  if (params.nationality) qs.set('nationality', params.nationality)
  if (params.currency) qs.set('currency', params.currency)
  if (params.promoCode) qs.set('promoCode', params.promoCode)
  if (params.affiliateId) qs.set('affiliateId', params.affiliateId)
  if (params.campaignId) qs.set('campaignId', params.campaignId)

  return qs
}

// ── Multi-city URL params ─────────────────────────────────────────────────────

export interface MultiCityLegParam {
  propertyId: number
  checkIn: string
  checkOut: string
  city: string
}

export interface MultiCityUrlParams {
  legs: MultiCityLegParam[]
  adults: number
  nationality?: string | undefined
  promoCode?: string | undefined
}

/** Encodes multi-city search params into a URLSearchParams object. */
export function encodeMultiCityParams(params: MultiCityUrlParams): URLSearchParams {
  const qs = new URLSearchParams()
  params.legs.forEach(leg => {
    // Format: propertyId:checkIn:checkOut:city  (city is URI-encoded to handle spaces/special chars)
    qs.append('l', `${leg.propertyId}:${leg.checkIn}:${leg.checkOut}:${encodeURIComponent(leg.city)}`)
  })
  qs.set('adults', String(params.adults))
  if (params.nationality) qs.set('nationality', params.nationality)
  if (params.promoCode) qs.set('promo', params.promoCode)
  return qs
}

/** Decodes URLSearchParams into MultiCityUrlParams. Returns null if invalid. */
export function decodeMultiCityParams(qs: URLSearchParams): MultiCityUrlParams | null {
  const raw = qs.getAll('l')
  if (raw.length < 1) return null

  const legs: MultiCityLegParam[] = []
  for (const s of raw) {
    // Split on first three colons only; remaining is city (may contain colons)
    const i1 = s.indexOf(':')
    const i2 = s.indexOf(':', i1 + 1)
    const i3 = s.indexOf(':', i2 + 1)
    if (i1 < 0 || i2 < 0 || i3 < 0) return null
    const propertyId = Number(s.slice(0, i1))
    const checkIn = s.slice(i1 + 1, i2)
    const checkOut = s.slice(i2 + 1, i3)
    const city = decodeURIComponent(s.slice(i3 + 1))
    if (!propertyId || !checkIn || !checkOut) return null
    legs.push({ propertyId, checkIn, checkOut, city })
  }

  const adults = Number(qs.get('adults') ?? '2') || 2
  return {
    legs,
    adults,
    ...(qs.get('nationality') ? { nationality: qs.get('nationality')! } : {}),
    ...(qs.get('promo') ? { promoCode: qs.get('promo')! } : {}),
  }
}

/**
 * Decodes URLSearchParams into SearchUrlParams.
 * Returns null if required params are missing.
 */
export function decodeSearchParams(qs: URLSearchParams): SearchUrlParams | null {
  const hotelId = Number(qs.get('hotelId'))
  const checkIn = qs.get('checkIn')
  const checkOut = qs.get('checkOut')

  if (!hotelId || !checkIn || !checkOut) return null

  const rooms: RoomOccupancy[] = []
  let i = 0
  while (qs.has(`rooms[${i}][adults]`)) {
    const adults = Number(qs.get(`rooms[${i}][adults]`))
    const childAges = qs.getAll(`rooms[${i}][childAges][]`).map(Number)
    rooms.push({ adults, ...(childAges.length > 0 ? { childAges } : {}) })
    i++
  }

  if (rooms.length === 0) {
    const adults = Number(qs.get('adults') ?? '2')
    rooms.push({ adults })
  }

  return {
    hotelId,
    checkIn,
    checkOut,
    rooms,
    nationality: qs.get('nationality') ?? undefined,
    currency: qs.get('currency') ?? undefined,
    promoCode: qs.get('promoCode') ?? undefined,
    affiliateId: qs.get('affiliateId') ?? undefined,
    campaignId: qs.get('campaignId') ?? undefined,
  }
}
