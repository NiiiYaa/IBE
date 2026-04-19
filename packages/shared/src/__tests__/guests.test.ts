import { describe, it, expect } from 'vitest'
import { toHyperGuestGuestsParam } from '../utils/guests.js'

describe('toHyperGuestGuestsParam', () => {
  it('encodes single room, adults only', () => {
    expect(toHyperGuestGuestsParam([{ adults: 2 }])).toBe('2')
  })

  it('encodes multiple rooms', () => {
    expect(toHyperGuestGuestsParam([{ adults: 2 }, { adults: 3 }])).toBe('2.3')
  })

  it('encodes adults with children', () => {
    expect(toHyperGuestGuestsParam([{ adults: 2, childAges: [11, 12] }])).toBe('2-11,12')
  })

  it('encodes multiple rooms with children', () => {
    expect(
      toHyperGuestGuestsParam([
        { adults: 2, childAges: [11, 12] },
        { adults: 2, childAges: [11, 12] },
      ]),
    ).toBe('2-11,12.2-11,12')
  })

  it('handles empty childAges array', () => {
    expect(toHyperGuestGuestsParam([{ adults: 2, childAges: [] }])).toBe('2')
  })
})
