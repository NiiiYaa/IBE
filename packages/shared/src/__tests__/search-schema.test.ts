import { describe, it, expect } from 'vitest'
import { SearchParamsSchema } from '../schemas/search.js'

describe('SearchParamsSchema', () => {
  const valid = {
    hotelId: 19912,
    checkIn: '2024-06-01',
    checkOut: '2024-06-08',
    rooms: [{ adults: 2 }],
  }

  it('accepts valid params', () => {
    expect(SearchParamsSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects checkOut <= checkIn', () => {
    const result = SearchParamsSchema.safeParse({ ...valid, checkOut: '2024-06-01' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid date format', () => {
    const result = SearchParamsSchema.safeParse({ ...valid, checkIn: '01/06/2024' })
    expect(result.success).toBe(false)
  })

  it('rejects 0 adults', () => {
    const result = SearchParamsSchema.safeParse({
      ...valid,
      rooms: [{ adults: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid nationality (lowercase)', () => {
    const result = SearchParamsSchema.safeParse({ ...valid, nationality: 'de' })
    expect(result.success).toBe(false)
  })

  it('accepts valid nationality (uppercase)', () => {
    const result = SearchParamsSchema.safeParse({ ...valid, nationality: 'DE' })
    expect(result.success).toBe(true)
  })

  it('rejects more than 9 rooms', () => {
    const result = SearchParamsSchema.safeParse({
      ...valid,
      rooms: Array(10).fill({ adults: 1 }),
    })
    expect(result.success).toBe(false)
  })
})
