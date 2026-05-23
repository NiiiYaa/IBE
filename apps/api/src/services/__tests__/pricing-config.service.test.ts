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
  enabled: true, openToAll: true, refreshIntervalHours: 24, searchAdults: 1,
  highPricePct: 15, lowPricePct: 15, highAnomalyPct: 30,
  lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
  maxOffersForAnalysis: 10,
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

describe('maxOffersForAnalysis inheritance', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('defaults to 10 when SystemPricingConfig row has no override', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue(null)
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue(null)
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue(null)
    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)
    expect(result.maxOffersForAnalysis).toBe(10)
  })

  it('uses system value when org and property have no override', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue({ ...SYSTEM_ROW, maxOffersForAnalysis: 5 })
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue({
      property: { organizationId: 1 },
      enabled: null, orgServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: null,
    })
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue({
      enabled: null, systemServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: null,
    })
    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)
    expect(result.maxOffersForAnalysis).toBe(5)
  })

  it('org-level override takes precedence over system', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue({ ...SYSTEM_ROW, maxOffersForAnalysis: 10 })
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue({
      property: { organizationId: 1 },
      enabled: null, orgServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: null,
    })
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue({
      enabled: null, systemServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: 3,
    })
    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)
    expect(result.maxOffersForAnalysis).toBe(3)
  })

  it('property-level override takes precedence over org and system', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue({ ...SYSTEM_ROW, maxOffersForAnalysis: 10 })
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue({
      property: { organizationId: 1 },
      enabled: null, orgServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: 2,
    })
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue({
      enabled: null, systemServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: 5,
    })
    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)
    expect(result.maxOffersForAnalysis).toBe(2)
  })
})
