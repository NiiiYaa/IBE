import { describe, it, expect, vi, beforeEach } from 'vitest'

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
import {
  getResolvedAirportConfig,
  getNearestAirports,
} from '../airport-config.service.js'

const mp = prisma as any
beforeEach(() => { vi.clearAllMocks() })

const SYS_ROW = {
  enabled: true, radiusKm: 100, maxCount: 3,
  airportDataset: null, airportDatasetUpdatedAt: null,
}

describe('getResolvedAirportConfig — system only', () => {
  it('returns system values when no org/property override', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.systemAirportConfig.findFirst.mockResolvedValue(SYS_ROW)
    mp.orgAirportConfig.findUnique.mockResolvedValue(null)
    mp.propertyAirportConfig.findUnique.mockResolvedValue(null)

    const result = await getResolvedAirportConfig(42)
    expect(result).toEqual({ enabled: true, radiusKm: 100, maxCount: 3 })
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
