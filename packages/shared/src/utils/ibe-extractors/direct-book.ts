export interface ParsedPropertyInfo {
  name: string
  starRating: number | null
  address: string | null
  city: string | null
  country: string | null
  description: string | null
  images: string[]
  amenities: string[]
}

export interface ParsedRate {
  boardLabel: string
  cancelText: string
  isNonRefundable: boolean
  pricePerNight: number | null
  total: number | null
  currency: string | null
}

export interface ParsedRoom {
  name: string
  description: string
  images: string[]
  amenities: string[]
  bedConfig: string | null
  rates: ParsedRate[]
}

function coerceStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function coerceNum(v: unknown): number | null {
  if (typeof v === 'number' && !isNaN(v)) return v
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? null : n }
  return null
}

function coerceStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(x => coerceStr(x)).filter((s): s is string => s !== null)
}

function coerceImageUrls(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((item): string[] => {
    if (typeof item === 'string' && item.startsWith('http')) return [item]
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      const url = coerceStr(obj['url'] ?? obj['src'] ?? obj['uri'] ?? obj['original'] ?? obj['large'] ?? obj['medium'])
      return url && url.startsWith('http') ? [url] : []
    }
    return []
  }).slice(0, 20)
}

export function tryParsePropertyInfo(payload: unknown): ParsedPropertyInfo | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const p = payload as Record<string, unknown>
  const name = coerceStr(p['name'] ?? p['propertyName'] ?? p['hotelName'] ?? p['title'])
  if (name && (p['address'] || p['description'] || p['amenities'] || p['city'] || p['country'] || p['stars'] || p['starRating'] || p['images'] || p['photos'] || p['gallery'])) {
    return {
      name,
      starRating: coerceNum(p['stars'] ?? p['starRating'] ?? p['rating'] ?? p['category']),
      address: coerceStr(p['address'] ?? p['streetAddress'] ?? p['addressLine1']),
      city: coerceStr(p['city'] ?? p['cityName'] ?? p['locality']),
      country: coerceStr(p['country'] ?? p['countryCode'] ?? p['countryName']),
      description: coerceStr(p['description'] ?? p['summary'] ?? p['overview'] ?? p['shortDescription']),
      images: coerceImageUrls(p['images'] ?? p['photos'] ?? p['gallery'] ?? p['media']),
      amenities: coerceStrArr(p['amenities'] ?? p['facilities'] ?? p['features'] ?? p['services']),
    }
  }
  for (const key of ['data', 'property', 'hotel', 'result', 'accommodation']) {
    const nested = p[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const result = tryParsePropertyInfo(nested)
      if (result) return result
    }
  }
  return null
}

function parseRateItem(item: unknown): ParsedRate | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const r = item as Record<string, unknown>
  const boardLabel = coerceStr(
    r['boardType'] ?? r['mealPlan'] ?? r['boardCode'] ?? r['meal'] ??
    r['name'] ?? r['rateName'] ?? r['planName'] ?? r['type']
  ) ?? ''
  const cancelText = coerceStr(
    r['cancellationPolicy'] ?? r['cancellation'] ?? r['refundPolicy'] ?? r['cancelPolicy']
  ) ?? ''
  const isNonRefundable =
    r['nonRefundable'] === true ||
    r['isNonRefundable'] === true ||
    r['refundable'] === false ||
    /non.?refund/i.test(cancelText) ||
    /non.?refund/i.test(coerceStr(r['name']) ?? '')
  return {
    boardLabel,
    cancelText,
    isNonRefundable,
    pricePerNight: coerceNum(r['pricePerNight'] ?? r['price'] ?? r['rate'] ?? r['amount'] ?? r['baseRate']),
    total: coerceNum(r['total'] ?? r['totalPrice'] ?? r['totalAmount'] ?? r['grandTotal']),
    currency: coerceStr(r['currency'] ?? r['currencyCode']),
  }
}

function parseRoomItem(item: unknown): ParsedRoom | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const r = item as Record<string, unknown>
  const name = coerceStr(r['name'] ?? r['roomName'] ?? r['title'] ?? r['type'])
  if (!name) return null
  const rateArr: unknown[] = (
    Array.isArray(r['rates']) ? r['rates'] :
    Array.isArray(r['ratePlans']) ? r['ratePlans'] :
    Array.isArray(r['prices']) ? r['prices'] :
    Array.isArray(r['offers']) ? r['offers'] :
    Array.isArray(r['packages']) ? r['packages'] : []
  )
  return {
    name,
    description: coerceStr(r['description'] ?? r['summary'] ?? r['overview']) ?? '',
    images: coerceImageUrls(r['images'] ?? r['photos'] ?? r['gallery'] ?? r['media']),
    amenities: coerceStrArr(r['amenities'] ?? r['facilities'] ?? r['features']),
    bedConfig: coerceStr(r['bedConfiguration'] ?? r['bedding'] ?? r['bedType'] ?? r['beds']),
    rates: rateArr.map(parseRateItem).filter((x): x is ParsedRate => x !== null),
  }
}

export function tryParseRooms(payload: unknown): ParsedRoom[] {
  if (Array.isArray(payload) && payload.length > 0) {
    const first = payload[0] as Record<string, unknown>
    if (
      coerceStr(first['name']) &&
      (first['rates'] || first['ratePlans'] || first['prices'] || first['offers'] || first['packages'])
    ) {
      return payload.map(parseRoomItem).filter((r): r is ParsedRoom => r !== null)
    }
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>
    for (const key of ['rooms', 'roomTypes', 'accommodations', 'units', 'results', 'items', 'products']) {
      const v = p[key]
      if (Array.isArray(v) && v.length > 0) {
        const result = tryParseRooms(v)
        if (result.length > 0) return result
      }
    }
    for (const key of ['data', 'result', 'response']) {
      const nested = p[key]
      if (nested && typeof nested === 'object') {
        const result = tryParseRooms(nested)
        if (result.length > 0) return result
      }
    }
  }
  return []
}
