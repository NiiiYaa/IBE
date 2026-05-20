import { describe, it, expect } from 'vitest'
import { getAvailableDynamicTypes, buildCoverageMap, sortLocalesByCoverage } from '../translation-types'

describe('getAvailableDynamicTypes', () => {
  it('shows all types at system level', () => {
    const types = getAvailableDynamicTypes(true)
    const keys = types.map(t => t.key)
    expect(keys).toContain('incentive_items')
    expect(keys).toContain('hotel_facilities')
    expect(keys).toContain('room_facilities')
  })

  it('hides facility types at org level to prevent cross-account overwrites', () => {
    const types = getAvailableDynamicTypes(false)
    const keys = types.map(t => t.key)
    expect(keys).toContain('incentive_items')
    expect(keys).not.toContain('hotel_facilities')
    expect(keys).not.toContain('room_facilities')
  })
})

describe('buildCoverageMap', () => {
  it('returns empty map when status or total are missing', () => {
    expect(buildCoverageMap(undefined, undefined)).toEqual({})
    expect(buildCoverageMap([], undefined)).toEqual({})
    expect(buildCoverageMap(undefined, { total: 100 })).toEqual({})
  })

  it('computes percentage per locale rounded to integer', () => {
    const status = [
      { locale: 'de', namespaces: [{ translated: 75 }, { translated: 25 }] },
      { locale: 'fr', namespaces: [{ translated: 50 }] },
    ]
    const map = buildCoverageMap(status, { total: 100 })
    expect(map['de']).toBe(100)
    expect(map['fr']).toBe(50)
  })

  it('rounds fractional percentages', () => {
    const status = [{ locale: 'es', namespaces: [{ translated: 1 }] }]
    const map = buildCoverageMap(status, { total: 3 })
    expect(map['es']).toBe(33)
  })
})

describe('sortLocalesByCoverage', () => {
  const name = (code: string) => ({ de: 'German', fr: 'French', es: 'Spanish', it: 'Italian' }[code] ?? code)

  it('sorts higher coverage first', () => {
    const result = sortLocalesByCoverage(['fr', 'de', 'es'], { de: 80, fr: 60, es: 90 }, name)
    expect(result).toEqual(['es', 'de', 'fr'])
  })

  it('sorts alphabetically when coverage is equal', () => {
    const result = sortLocalesByCoverage(['it', 'de', 'fr'], { de: 50, fr: 50, it: 50 }, name)
    expect(result).toEqual(['fr', 'de', 'it'])
  })

  it('puts zero-coverage locales after all translated ones, alphabetically among themselves', () => {
    const result = sortLocalesByCoverage(['it', 'de', 'fr', 'es'], { de: 50, fr: 0, it: 0, es: 80 }, name)
    expect(result).toEqual(['es', 'de', 'fr', 'it'])
  })
})
