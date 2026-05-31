import { describe, it, expect, vi } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    onboardingBlockedDomain: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

import { detectCountryFromDomain, isRedundantEntry } from '../blocked-domains.service.js'
import type { BlockedEntry } from '../blocked-domains.service.js'

describe('detectCountryFromDomain', () => {
  // ccTLD detection
  it('detects .fr TLD', () => expect(detectCountryFromDomain('bonjour-ratp.fr')).toBe('FR'))
  it('detects .de TLD', () => expect(detectCountryFromDomain('hotel-berlin.de')).toBe('DE'))
  it('detects .it TLD', () => expect(detectCountryFromDomain('albergo.it')).toBe('IT'))
  it('detects .br TLD', () => expect(detectCountryFromDomain('bookbrazilhotels.com.br')).toBe('BR'))
  it('detects .co.uk compound', () => expect(detectCountryFromDomain('hotels.co.uk')).toBe('GB'))
  it('detects .com.ar compound', () => expect(detectCountryFromDomain('booking.com.ar')).toBe('AR'))

  // Country-prefix subdomain detection
  it('detects ar. prefix on .com', () => expect(detectCountryFromDomain('ar.trivago.com')).toBe('AR'))
  it('detects fr. prefix on .com', () => expect(detectCountryFromDomain('fr.trip.com')).toBe('FR'))
  it('detects br. prefix on .com', () => expect(detectCountryFromDomain('br.trip.com')).toBe('BR'))
  it('detects cn. prefix on .com', () => expect(detectCountryFromDomain('cn.ctrip.com')).toBe('CN'))

  // Non-country prefixes — must not false-positive
  it('returns null for plain domain', () => expect(detectCountryFromDomain('trivago.com')).toBeNull())
  it('returns null for non-country 2-letter prefix', () => expect(detectCountryFromDomain('go.hotels.com')).toBeNull())
  it('returns null for www prefix', () => expect(detectCountryFromDomain('www.hotel.com')).toBeNull())
  it('returns null for .com with no prefix', () => expect(detectCountryFromDomain('gohotels.com')).toBeNull())

  // Compound ccTLD edge cases
  it('detects .co.nz', () => expect(detectCountryFromDomain('hotel.co.nz')).toBe('NZ'))
  it('detects .co.jp', () => expect(detectCountryFromDomain('hotel.co.jp')).toBe('JP'))
})

describe('isRedundantEntry', () => {
  const globalEntries: BlockedEntry[] = [
    { domain: 'trivago', matchType: 'brand', country: null, redundant: false },
    { domain: 'booking', matchType: 'brand', country: null, redundant: false },
    { domain: 'trip',    matchType: 'brand', country: null, redundant: false },
    { domain: 'lastminute', matchType: 'brand', country: null, redundant: false },
  ]

  it('ar.trivago.com is redundant (trivago brand covers it)', () =>
    expect(isRedundantEntry('ar.trivago.com', globalEntries)).toBe(true))

  it('fr.trip.com is redundant (trip brand covers it)', () =>
    expect(isRedundantEntry('fr.trip.com', globalEntries)).toBe(true))

  it('fr.lastminute.com is redundant (lastminute brand covers it)', () =>
    expect(isRedundantEntry('fr.lastminute.com', globalEntries)).toBe(true))

  it('gohotels.com is NOT redundant (no global brand entry covers it)', () =>
    expect(isRedundantEntry('gohotels.com', globalEntries)).toBe(false))

  it('top-paris-hotels.com is NOT redundant', () =>
    expect(isRedundantEntry('top-paris-hotels.com', globalEntries)).toBe(false))

  it('booking.com is redundant (booking brand covers it)', () =>
    expect(isRedundantEntry('booking.com', globalEntries)).toBe(true))
})
