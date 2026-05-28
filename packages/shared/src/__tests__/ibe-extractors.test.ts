import { describe, it, expect } from 'vitest'
import { normaliseBoard } from '../utils/ibe-extractors/board-normalizer.js'
import { tryParsePropertyInfo, tryParseRooms } from '../utils/ibe-extractors/direct-book.js'

describe('normaliseBoard', () => {
  it.each([
    ['room only', 'RO'],
    ['no meals', 'RO'],
    ['accommodation only', 'RO'],
    ['bed only', 'RO'],
    ['bed & breakfast', 'BB'],
    ['Bed and Breakfast', 'BB'],
    ['breakfast included', 'BB'],
    ['With Breakfast', 'BB'],
    ['half board', 'HB'],
    ['Half-Board', 'HB'],
    ['demi-pension', 'HB'],
    ['full board', 'FB'],
    ['all inclusive', 'AI'],
    ['All-Inclusive', 'AI'],
  ])('normalises "%s" → %s', (label, expected) => {
    expect(normaliseBoard(label)).toBe(expected)
  })

  it('returns null for unknown labels', () => {
    expect(normaliseBoard('spa package')).toBeNull()
    expect(normaliseBoard('')).toBeNull()
  })

  it('does not greedily match "room" in compound labels', () => {
    expect(normaliseBoard('deluxe room with half board')).toBe('HB')
  })

  it('does not match bare "no breakfast" as BB', () => {
    expect(normaliseBoard('no breakfast')).toBeNull()
  })

  it('still matches "breakfast included"', () => {
    expect(normaliseBoard('breakfast included')).toBe('BB')
  })
})

describe('tryParsePropertyInfo', () => {
  it('parses flat property object', () => {
    const result = tryParsePropertyInfo({
      name: 'Grand Hotel',
      stars: 4,
      city: 'Rome',
      country: 'Italy',
      description: 'A lovely hotel',
      amenities: ['WiFi', 'Pool'],
      images: ['https://example.com/img1.jpg'],
      address: '123 Via Roma',
    })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Grand Hotel')
    expect(result!.starRating).toBe(4)
    expect(result!.city).toBe('Rome')
    expect(result!.amenities).toEqual(['WiFi', 'Pool'])
    expect(result!.images).toEqual(['https://example.com/img1.jpg'])
  })

  it('parses property nested under "data" key', () => {
    const result = tryParsePropertyInfo({
      data: { name: 'Boutique Inn', city: 'Paris', country: 'France', description: 'Cozy' },
    })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Boutique Inn')
  })

  it('extracts image URLs from object-array format', () => {
    const result = tryParsePropertyInfo({
      name: 'Hotel Test',
      city: 'Madrid',
      images: [{ url: 'https://cdn.example.com/photo1.jpg' }, { src: 'https://cdn.example.com/photo2.jpg' }],
    })
    expect(result!.images).toEqual(['https://cdn.example.com/photo1.jpg', 'https://cdn.example.com/photo2.jpg'])
  })

  it('returns null for non-object input', () => {
    expect(tryParsePropertyInfo(null)).toBeNull()
    expect(tryParsePropertyInfo('string')).toBeNull()
    expect(tryParsePropertyInfo([{ name: 'x' }])).toBeNull()
  })

  it('returns null when name is absent', () => {
    expect(tryParsePropertyInfo({ city: 'Rome', stars: 4 })).toBeNull()
  })
})

describe('tryParseRooms', () => {
  it('parses top-level room array', () => {
    const payload = [
      {
        name: 'Superior Room',
        description: 'Nice view',
        images: ['https://example.com/room.jpg'],
        amenities: ['TV'],
        rates: [
          {
            boardType: 'Bed & Breakfast',
            cancellationPolicy: 'Free cancellation',
            nonRefundable: false,
            pricePerNight: 120,
            currency: 'EUR',
          },
        ],
      },
    ]
    const result = tryParseRooms(payload)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Superior Room')
    expect(result[0]!.rates[0]!.boardLabel).toBe('Bed & Breakfast')
    expect(result[0]!.rates[0]!.isNonRefundable).toBe(false)
    expect(result[0]!.rates[0]!.pricePerNight).toBe(120)
  })

  it('parses rooms nested under "rooms" key', () => {
    const payload = {
      rooms: [
        {
          name: 'Deluxe Suite',
          rates: [{ boardType: 'Room Only', cancellationPolicy: 'Non-refundable', nonRefundable: true, pricePerNight: 200, currency: 'USD' }],
        },
      ],
    }
    const result = tryParseRooms(payload)
    expect(result).toHaveLength(1)
    expect(result[0]!.rates[0]!.isNonRefundable).toBe(true)
  })

  it('detects non-refundable from cancellation text', () => {
    const payload = [
      {
        name: 'Standard Room',
        rates: [{ boardType: 'BB', cancellationPolicy: 'Non-Refundable rate', pricePerNight: 90, currency: 'EUR' }],
      },
    ]
    const result = tryParseRooms(payload)
    expect(result[0]!.rates[0]!.isNonRefundable).toBe(true)
  })

  it('returns empty array for payloads with no room structure', () => {
    expect(tryParseRooms(null)).toEqual([])
    expect(tryParseRooms({ error: 'not found' })).toEqual([])
    expect(tryParseRooms({ name: 'Grand Hotel', city: 'Rome' })).toEqual([])
  })
})
