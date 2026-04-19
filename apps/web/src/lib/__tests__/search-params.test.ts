import { describe, it, expect } from 'vitest'
import { encodeSearchParams, decodeSearchParams } from '../search-params'

describe('encodeSearchParams / decodeSearchParams', () => {
  const base = {
    hotelId: 19912,
    checkIn: '2024-06-01',
    checkOut: '2024-06-08',
    rooms: [{ adults: 2 }],
  }

  it('round-trips basic params', () => {
    const encoded = encodeSearchParams(base)
    const decoded = decodeSearchParams(encoded)
    expect(decoded?.hotelId).toBe(19912)
    expect(decoded?.checkIn).toBe('2024-06-01')
    expect(decoded?.checkOut).toBe('2024-06-08')
    expect(decoded?.rooms[0]?.adults).toBe(2)
  })

  it('round-trips multiple rooms', () => {
    const params = { ...base, rooms: [{ adults: 2 }, { adults: 3 }] }
    const decoded = decodeSearchParams(encodeSearchParams(params))
    expect(decoded?.rooms).toHaveLength(2)
    expect(decoded?.rooms[1]?.adults).toBe(3)
  })

  it('round-trips nationality and currency', () => {
    const params = { ...base, nationality: 'DE', currency: 'EUR' }
    const decoded = decodeSearchParams(encodeSearchParams(params))
    expect(decoded?.nationality).toBe('DE')
    expect(decoded?.currency).toBe('EUR')
  })

  it('returns null when required params are missing', () => {
    expect(decodeSearchParams(new URLSearchParams())).toBeNull()
  })

  it('returns null when hotelId is missing', () => {
    const qs = new URLSearchParams({ checkIn: '2024-06-01', checkOut: '2024-06-08' })
    expect(decodeSearchParams(qs)).toBeNull()
  })
})
