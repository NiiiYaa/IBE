import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../adapters/hyperguest/static.js', () => ({
  fetchPropertyStatic: vi.fn().mockResolvedValue({
    coordinates: { latitude: 51.5074, longitude: -0.1278 },
  }),
}))

vi.mock('../../utils/iata-lookup.js', () => ({
  findNearestAirports: vi.fn().mockReturnValue([]),
}))

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemAirportConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    orgAirportConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyAirportConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyDataProviderConfig: { findUnique: vi.fn() },
    property: { findUnique: vi.fn() },
  },
}))

import { prisma } from '../../db/client.js'
import { findNearestAirports } from '../../utils/iata-lookup.js'
import {
  getResolvedAirportConfig,
  getNearestAirports,
} from '../airport-config.service.js'

const mp = prisma as any
beforeEach(() => { vi.clearAllMocks() })

const SYS_ROW = {
  enabled: true, radiusKm: 100, maxCount: 3,
  stripDefaultFolded: false, stripAutoFoldSecs: 0,
  airportDataset: null, airportDatasetUpdatedAt: null,
}

describe('getResolvedAirportConfig — system only', () => {
  it('returns system values when no org/property override', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)

    const result = await getResolvedAirportConfig(42)
    expect(result).toEqual({ enabled: true, radiusKm: 100, maxCount: 3, stripDefaultFolded: false, stripAutoFoldSecs: 0 })
  })

  it('returns disabled when system disabled', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({ ...SYS_ROW, enabled: false })
    mp.orgAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)

    const result = await getResolvedAirportConfig(42)
    expect(result.enabled).toBe(false)
  })
})

describe('getResolvedAirportConfig — org override', () => {
  it('org enabled=false overrides system enabled=true', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: false, radiusKm: null, maxCount: null })
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)

    const result = await getResolvedAirportConfig(42)
    expect(result.enabled).toBe(false)
    expect(result.radiusKm).toBe(100) // inherits system
  })

  it('org radiusKm overrides system radiusKm', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: 200, maxCount: null })
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)

    const result = await getResolvedAirportConfig(42)
    expect(result.enabled).toBe(true) // inherits system
    expect(result.radiusKm).toBe(200)
    expect(result.maxCount).toBe(3) // inherits system
  })
})

describe('getResolvedAirportConfig — property override', () => {
  it('property enabled=false overrides system+org enabled=true', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: true, radiusKm: null, maxCount: null })
    mp.propertyAirportConfig.findUnique.mockResolvedValue({ enabled: false, radiusKm: null, maxCount: null })

    const result = await getResolvedAirportConfig(42)
    expect(result.enabled).toBe(false)
  })

  it('property maxCount overrides all', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: 200, maxCount: 4 })
    mp.propertyAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: 1 })

    const result = await getResolvedAirportConfig(42)
    expect(result.maxCount).toBe(1)
    expect(result.radiusKm).toBe(200) // org overrides system; property inherits org
  })
})

describe('getResolvedAirportConfig — strip settings inheritance', () => {
  it('inherits system strip settings when org and property have null', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({ ...SYS_ROW, stripDefaultFolded: true, stripAutoFoldSecs: 30 })
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: null, stripDefaultFolded: null, stripAutoFoldSecs: null })
    mp.propertyAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: null, stripDefaultFolded: null, stripAutoFoldSecs: null })
    const result = await getResolvedAirportConfig(42)
    expect(result.stripDefaultFolded).toBe(true)
    expect(result.stripAutoFoldSecs).toBe(30)
  })

  it('org stripDefaultFolded overrides system', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({ ...SYS_ROW, stripDefaultFolded: false, stripAutoFoldSecs: 0 })
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: null, stripDefaultFolded: true, stripAutoFoldSecs: null })
    mp.propertyAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: null, stripDefaultFolded: null, stripAutoFoldSecs: null })
    const result = await getResolvedAirportConfig(42)
    expect(result.stripDefaultFolded).toBe(true)
    expect(result.stripAutoFoldSecs).toBe(0)  // falls through to system
  })

  it('property stripAutoFoldSecs overrides org; property inherits org stripDefaultFolded', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({ ...SYS_ROW, stripDefaultFolded: false, stripAutoFoldSecs: 0 })
    mp.orgAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: null, stripDefaultFolded: true, stripAutoFoldSecs: null })
    mp.propertyAirportConfig.findUnique.mockResolvedValue({ enabled: null, radiusKm: null, maxCount: null, stripDefaultFolded: null, stripAutoFoldSecs: 60 })
    const result = await getResolvedAirportConfig(42)
    expect(result.stripDefaultFolded).toBe(true)  // from org
    expect(result.stripAutoFoldSecs).toBe(60)     // from property
  })
})

describe('getNearestAirports', () => {
  it('returns empty array when airport display disabled', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({ ...SYS_ROW, enabled: false })
    mp.orgAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyDataProviderConfig.findUnique.mockResolvedValue({ lat: 51.5074, lng: -0.1278 })

    const result = await getNearestAirports(42)
    expect(result.airports).toEqual([])
  })

  it('returns empty array when no coordinates', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyDataProviderConfig.findUnique.mockResolvedValue(null)

    const result = await getNearestAirports(42)
    expect(result.airports).toEqual([])
  })
})

describe('getNearestAirports — radiusKmOverride', () => {
  beforeEach(() => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue({
      ...SYS_ROW,
      stripDefaultFolded: false,
      stripAutoFoldSecs: 0,
      airportDataset: null,
    })
    mp.orgAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)
  })

  it('uses system radiusKm and maxCount when no override', async () => {
    const result = await getNearestAirports(42)
    expect(result.radiusKm).toBe(100)
    expect(findNearestAirports).toHaveBeenCalledWith(
      expect.any(Number), expect.any(Number), 100, 3, undefined
    )
  })

  it('uses override radiusKm and caps maxCount at 20', async () => {
    const result = await getNearestAirports(42, 250)
    expect(result.radiusKm).toBe(250)
    expect(findNearestAirports).toHaveBeenCalledWith(
      expect.any(Number), expect.any(Number), 250, 20, undefined
    )
  })

  it('returns override radiusKm in response even when 0 airports found', async () => {
    const result = await getNearestAirports(42, 50)
    expect(result.radiusKm).toBe(50)
    expect(result.airports).toEqual([])
  })

  it('returns override radiusKm in early-return when feature disabled', async () => {
    mp.systemAirportConfig.findFirst.mockResolvedValue({
      ...SYS_ROW,
      enabled: false,
      stripDefaultFolded: false,
      stripAutoFoldSecs: 0,
      airportDataset: null,
    })
    const result = await getNearestAirports(42, 150)
    expect(result.radiusKm).toBe(150)
    expect(result.airports).toEqual([])
  })
})
