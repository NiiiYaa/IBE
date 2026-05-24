import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/client.js'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemInterHotelConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    orgInterHotelConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyInterHotelConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    property: { findUnique: vi.fn() },
  },
}))

const mockPrisma = prisma as unknown as {
  systemInterHotelConfig: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  orgInterHotelConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  propertyInterHotelConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  property: { findUnique: ReturnType<typeof vi.fn> }
}

beforeEach(() => { vi.clearAllMocks() })

describe('getSystemInterHotelConfig', () => {
  it('returns defaults when no DB row exists', async () => {
    mockPrisma.systemInterHotelConfig.findFirst.mockResolvedValue(null)
    const { getSystemInterHotelConfig } = await import('../interhotel-config.service.js')
    const result = await getSystemInterHotelConfig()
    expect(result).toEqual({
      enabled: false, maxRadiusKm: 50, maxHotels: 3,
      transferType: 'self', sponsoredAmount: 0, sponsoredCurrency: 'USD',
    })
  })

  it('returns DB row values when row exists', async () => {
    mockPrisma.systemInterHotelConfig.findFirst.mockResolvedValue({
      id: 1, enabled: true, maxRadiusKm: 30, maxHotels: 2,
      transferType: 'hotel', sponsoredAmount: 0, sponsoredCurrency: 'EUR',
    })
    const { getSystemInterHotelConfig } = await import('../interhotel-config.service.js')
    const result = await getSystemInterHotelConfig()
    expect(result.enabled).toBe(true)
    expect(result.maxRadiusKm).toBe(30)
    expect(result.transferType).toBe('hotel')
  })
})

describe('resolveEffectiveInterHotelConfig', () => {
  it('applies org override over system defaults', async () => {
    mockPrisma.systemInterHotelConfig.findFirst.mockResolvedValue(null)
    mockPrisma.propertyInterHotelConfig.findUnique.mockResolvedValue(null)
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mockPrisma.orgInterHotelConfig.findUnique.mockResolvedValue({
      organizationId: 5, enabled: true, maxRadiusKm: 20, maxHotels: null,
      transferType: null, sponsoredAmount: null, sponsoredCurrency: null,
    })
    const { resolveEffectiveInterHotelConfig } = await import('../interhotel-config.service.js')
    const result = await resolveEffectiveInterHotelConfig(123)
    expect(result.enabled).toBe(true)
    expect(result.maxRadiusKm).toBe(20)
    expect(result.maxHotels).toBe(3)  // system default
  })

  it('applies property override over org', async () => {
    mockPrisma.systemInterHotelConfig.findFirst.mockResolvedValue(null)
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mockPrisma.orgInterHotelConfig.findUnique.mockResolvedValue({
      organizationId: 5, enabled: true, maxRadiusKm: 20, maxHotels: null,
      transferType: 'hotel', sponsoredAmount: null, sponsoredCurrency: null,
    })
    mockPrisma.propertyInterHotelConfig.findUnique.mockResolvedValue({
      propertyId: 123, enabled: null, maxRadiusKm: 10, maxHotels: null,
      transferType: null, sponsoredAmount: 50, sponsoredCurrency: 'GBP',
    })
    const { resolveEffectiveInterHotelConfig } = await import('../interhotel-config.service.js')
    const result = await resolveEffectiveInterHotelConfig(123)
    expect(result.maxRadiusKm).toBe(10)       // property wins
    expect(result.enabled).toBe(true)           // org wins (property null)
    expect(result.transferType).toBe('hotel')   // org wins (property null)
    expect(result.sponsoredAmount).toBe(50)     // property wins
    expect(result.sponsoredCurrency).toBe('GBP')
  })

  it('org tier applied even when property has no config row', async () => {
    mockPrisma.systemInterHotelConfig.findFirst.mockResolvedValue(null)
    mockPrisma.propertyInterHotelConfig.findUnique.mockResolvedValue(null)
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mockPrisma.orgInterHotelConfig.findUnique.mockResolvedValue({
      organizationId: 5, enabled: true, maxRadiusKm: 80, maxHotels: null,
      transferType: null, sponsoredAmount: null, sponsoredCurrency: null,
    })
    const { resolveEffectiveInterHotelConfig } = await import('../interhotel-config.service.js')
    const result = await resolveEffectiveInterHotelConfig(999)
    expect(result.enabled).toBe(true)
    expect(result.maxRadiusKm).toBe(80)
  })
})
