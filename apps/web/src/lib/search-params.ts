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
