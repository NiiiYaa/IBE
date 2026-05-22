import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/client.js'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemPricingConfig: { findFirst: vi.fn() },
    orgPricingConfig: { findUnique: vi.fn() },
    propertyPricingConfig: { findUnique: vi.fn() },
    property: { findMany: vi.fn() },
  },
}))

const mockPrisma = prisma as unknown as {
  systemPricingConfig: { findFirst: ReturnType<typeof vi.fn> }
  orgPricingConfig: { findUnique: ReturnType<typeof vi.fn> }
  propertyPricingConfig: { findUnique: ReturnType<typeof vi.fn> }
  property: { findMany: ReturnType<typeof vi.fn> }
}

const SYSTEM_ROW = {
  enabled: true, openToAll: true, refreshIntervalDays: 1,
  highPricePct: 15, lowPricePct: 15, highAnomalyPct: 30,
  lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
}

describe('resolveEffectivePricingConfig', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns system defaults when no overrides exist', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue(null)
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)

    expect(result.highPricePct).toBe(15)
    expect(result.enabled).toBe(true)
  })

  it('applies property override over system', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue({
      enabled: true, orgServiceDisabled: false, highPricePct: 25,
      lowPricePct: null, highAnomalyPct: null, lowAnomalyPct: null,
      dayDifferencePct: null, dayDifferenceWindow: null,
      property: { organizationId: 10 },
    })
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)

    expect(result.highPricePct).toBe(25) // property override
    expect(result.lowPricePct).toBe(15)  // falls back to system
  })

  it('returns enabled=false when orgServiceDisabled', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue({
      enabled: null, orgServiceDisabled: true, highPricePct: null,
      lowPricePct: null, highAnomalyPct: null, lowAnomalyPct: null,
      dayDifferencePct: null, dayDifferenceWindow: null,
      property: { organizationId: 10 },
    })
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)

    expect(result.enabled).toBe(false)
  })
})
