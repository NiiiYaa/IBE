import { describe, it, expect } from 'vitest'
import { findNearestAirports, AirportEntry } from '../iata-lookup.js'

// Minimal dataset covering London and Paris airports plus a distant one
const LONDON_AIRPORTS: AirportEntry[] = [
  { code: 'LHR', name: 'Heathrow Airport', lat: 51.4775, lng: -0.4614 },
  { code: 'LGW', name: 'Gatwick Airport', lat: 51.1537, lng: -0.1821 },
  { code: 'SYD', name: 'Sydney Airport', lat: -33.9461, lng: 151.1772 },
]

const PARIS_AIRPORTS: AirportEntry[] = [
  { code: 'CDG', name: 'Charles de Gaulle Airport', lat: 49.0097, lng: 2.5479 },
  { code: 'ORY', name: 'Orly Airport', lat: 48.7262, lng: 2.3652 },
  { code: 'LAX', name: 'Los Angeles International Airport', lat: 33.9425, lng: -118.4081 },
]

const LONDON_LAT = 51.5074
const LONDON_LNG = -0.1278

const PARIS_LAT = 48.8566
const PARIS_LNG = 2.3522

describe('findNearestAirports', () => {
  it('returns LHR and LGW within 150km of London', () => {
    const results = findNearestAirports(LONDON_LAT, LONDON_LNG, 150, 10, LONDON_AIRPORTS)
    const codes = results.map(r => r.code)
    expect(codes).toContain('LHR')
    expect(codes).toContain('LGW')
    expect(results.every(r => r.distanceKm <= 150)).toBe(true)
  })

  it('returns CDG and ORY within 100km of Paris', () => {
    const results = findNearestAirports(PARIS_LAT, PARIS_LNG, 100, 10, PARIS_AIRPORTS)
    const codes = results.map(r => r.code)
    expect(codes).toContain('CDG')
    expect(codes).toContain('ORY')
    expect(results.every(r => r.distanceKm <= 100)).toBe(true)
  })

  it('excludes airports beyond maxKm', () => {
    const results = findNearestAirports(LONDON_LAT, LONDON_LNG, 150, 10, LONDON_AIRPORTS)
    const codes = results.map(r => r.code)
    expect(codes).not.toContain('SYD')
  })

  it('excludes LAX beyond maxKm when searching near Paris', () => {
    const results = findNearestAirports(PARIS_LAT, PARIS_LNG, 100, 10, PARIS_AIRPORTS)
    const codes = results.map(r => r.code)
    expect(codes).not.toContain('LAX')
  })

  it('truncates to maxCount', () => {
    const results = findNearestAirports(LONDON_LAT, LONDON_LNG, 150, 1, LONDON_AIRPORTS)
    expect(results).toHaveLength(1)
  })

  it('returns results sorted by distance ascending', () => {
    const results = findNearestAirports(LONDON_LAT, LONDON_LNG, 150, 10, LONDON_AIRPORTS)
    for (let i = 1; i < results.length; i++) {
      expect(results[i].distanceKm).toBeGreaterThanOrEqual(results[i - 1].distanceKm)
    }
  })

  it('returns empty array when dataset is empty', () => {
    const results = findNearestAirports(LONDON_LAT, LONDON_LNG, 150, 10, [])
    expect(results).toEqual([])
  })

  it('uses explicit dataset instead of bundled JSON', () => {
    const custom: AirportEntry[] = [
      { code: 'TST', name: 'Test Airport', lat: LONDON_LAT + 0.01, lng: LONDON_LNG + 0.01 },
    ]
    const results = findNearestAirports(LONDON_LAT, LONDON_LNG, 10, 10, custom)
    expect(results).toHaveLength(1)
    expect(results[0].code).toBe('TST')
  })
})
