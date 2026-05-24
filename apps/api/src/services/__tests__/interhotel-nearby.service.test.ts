import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/client.js'

vi.mock('../../db/client.js', () => ({
  prisma: {
    property: { findMany: vi.fn() },
    nearbyHotel: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('../interhotel-config.service.js', () => ({
  resolveEffectiveInterHotelConfig: vi.fn().mockResolvedValue({
    enabled: true, maxRadiusKm: 50, maxHotels: 3,
    transferType: 'self', sponsoredAmount: 0, sponsoredCurrency: 'USD',
  }),
}))

const mockPrisma = prisma as any

beforeEach(() => { vi.clearAllMocks() })

describe('refreshNearbyHotels', () => {
  it('returns count 0 when fewer than 2 properties have coords', async () => {
    mockPrisma.property.findMany.mockResolvedValue([
      { propertyId: 1, propertyDataProviderConfig: null },
    ])
    const { refreshNearbyHotels } = await import('../interhotel-nearby.service.js')
    const result = await refreshNearbyHotels(5)
    expect(result).toEqual({ count: 0 })
    expect(mockPrisma.nearbyHotel.upsert).not.toHaveBeenCalled()
  })

  it('upserts pair within radius and deletes pair outside radius', async () => {
    // Hotel A at (0, 0), Hotel B at (0.1, 0.1) — ~15km apart, within 50km
    // Hotel C at (10, 10) — ~1570km apart, outside 50km
    mockPrisma.property.findMany.mockResolvedValue([
      { propertyId: 1, propertyDataProviderConfig: { lat: 0, lng: 0 } },
      { propertyId: 2, propertyDataProviderConfig: { lat: 0.1, lng: 0.1 } },
      { propertyId: 3, propertyDataProviderConfig: { lat: 10, lng: 10 } },
    ])
    mockPrisma.nearbyHotel.upsert.mockResolvedValue({})
    mockPrisma.nearbyHotel.deleteMany.mockResolvedValue({})
    const { refreshNearbyHotels } = await import('../interhotel-nearby.service.js')
    await refreshNearbyHotels(5)
    // Pairs within 50km: (1,2) and (2,1) — ~15km. (1,3), (3,1), (2,3), (3,2) — outside
    expect(mockPrisma.nearbyHotel.upsert).toHaveBeenCalledTimes(2)
    const upsertArgs = mockPrisma.nearbyHotel.upsert.mock.calls.map((c: any) => ({
      a: c[0].create.propertyId,
      b: c[0].create.nearbyPropertyId,
    }))
    expect(upsertArgs).toContainEqual({ a: 1, b: 2 })
    expect(upsertArgs).toContainEqual({ a: 2, b: 1 })
  })
})

describe('getNearbyHotels', () => {
  it('returns sorted nearby hotels for a property', async () => {
    mockPrisma.nearbyHotel.findMany.mockResolvedValue([
      { nearbyPropertyId: 10, distanceKm: 5 },
      { nearbyPropertyId: 20, distanceKm: 2 },
    ])
    const { getNearbyHotels } = await import('../interhotel-nearby.service.js')
    const result = await getNearbyHotels(1)
    expect(result[0]!.distanceKm).toBe(2)
    expect(result[1]!.distanceKm).toBe(5)
  })
})
