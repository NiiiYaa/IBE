import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/client.js'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemFlexibleDatesConfig: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orgFlexibleDatesConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyFlexibleDatesConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    property: { findUnique: vi.fn() },
  },
}))

const mockPrisma = prisma as unknown as {
  systemFlexibleDatesConfig: {
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  orgFlexibleDatesConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  propertyFlexibleDatesConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  property: { findUnique: ReturnType<typeof vi.fn> }
}

const SYSTEM_ROW = { id: 1, enabled: true, daysBefore: 2, daysAfter: 2 }

describe('resolveEffectiveFlexibleDatesConfig', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns system defaults when no overrides exist', async () => {
    mockPrisma.systemFlexibleDatesConfig.findFirst.mockResolvedValue(null)
    mockPrisma.propertyFlexibleDatesConfig.findUnique.mockResolvedValue(null)
    mockPrisma.property.findUnique.mockResolvedValue(null)
    mockPrisma.orgFlexibleDatesConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectiveFlexibleDatesConfig } = await import('../flexible-dates-config.service.js')
    const result = await resolveEffectiveFlexibleDatesConfig(1)

    expect(result.enabled).toBe(false)
    expect(result.daysBefore).toBe(1)
    expect(result.daysAfter).toBe(1)
  })

  it('applies system row values when present', async () => {
    mockPrisma.systemFlexibleDatesConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyFlexibleDatesConfig.findUnique.mockResolvedValue(null)
    mockPrisma.property.findUnique.mockResolvedValue(null)
    mockPrisma.orgFlexibleDatesConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectiveFlexibleDatesConfig } = await import('../flexible-dates-config.service.js')
    const result = await resolveEffectiveFlexibleDatesConfig(1)

    expect(result.enabled).toBe(true)
    expect(result.daysBefore).toBe(2)
    expect(result.daysAfter).toBe(2)
  })

  it('applies org override over system', async () => {
    mockPrisma.systemFlexibleDatesConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyFlexibleDatesConfig.findUnique.mockResolvedValue({
      propertyId: 1, enabled: null, daysBefore: null, daysAfter: null,
    })
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 10 })
    mockPrisma.orgFlexibleDatesConfig.findUnique.mockResolvedValue({
      organizationId: 10, enabled: null, daysBefore: 3, daysAfter: null,
    })

    const { resolveEffectiveFlexibleDatesConfig } = await import('../flexible-dates-config.service.js')
    const result = await resolveEffectiveFlexibleDatesConfig(1)

    expect(result.daysBefore).toBe(3) // org override
    expect(result.daysAfter).toBe(2)  // falls back to system
  })

  it('applies property override over org and system', async () => {
    mockPrisma.systemFlexibleDatesConfig.findFirst.mockResolvedValue(SYSTEM_ROW)
    mockPrisma.propertyFlexibleDatesConfig.findUnique.mockResolvedValue({
      propertyId: 1, enabled: true, daysBefore: 1, daysAfter: null,
    })
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 10 })
    mockPrisma.orgFlexibleDatesConfig.findUnique.mockResolvedValue({
      organizationId: 10, enabled: false, daysBefore: 3, daysAfter: 3,
    })

    const { resolveEffectiveFlexibleDatesConfig } = await import('../flexible-dates-config.service.js')
    const result = await resolveEffectiveFlexibleDatesConfig(1)

    expect(result.enabled).toBe(true)   // property override
    expect(result.daysBefore).toBe(1)   // property override
    expect(result.daysAfter).toBe(3)    // org override (property has null)
  })

  it('returns enabled=false when system is disabled and no overrides', async () => {
    mockPrisma.systemFlexibleDatesConfig.findFirst.mockResolvedValue({ ...SYSTEM_ROW, enabled: false })
    mockPrisma.propertyFlexibleDatesConfig.findUnique.mockResolvedValue(null)
    mockPrisma.property.findUnique.mockResolvedValue(null)
    mockPrisma.orgFlexibleDatesConfig.findUnique.mockResolvedValue(null)

    const { resolveEffectiveFlexibleDatesConfig } = await import('../flexible-dates-config.service.js')
    const result = await resolveEffectiveFlexibleDatesConfig(1)

    expect(result.enabled).toBe(false)
  })

  it('resolves effective config from org tier when property has no override row', async () => {
    mockPrisma.systemFlexibleDatesConfig.findFirst.mockResolvedValue({ id: 1, enabled: false, daysBefore: 1, daysAfter: 1 })
    mockPrisma.propertyFlexibleDatesConfig.findUnique.mockResolvedValue(null)
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mockPrisma.orgFlexibleDatesConfig.findUnique.mockResolvedValue({
      organizationId: 5, enabled: true, daysBefore: 2, daysAfter: 2,
    })

    const { resolveEffectiveFlexibleDatesConfig } = await import('../flexible-dates-config.service.js')
    const result = await resolveEffectiveFlexibleDatesConfig(99)

    expect(result.enabled).toBe(true)    // org override, not system default
    expect(result.daysBefore).toBe(2)    // org override, not system default
    expect(result.daysAfter).toBe(2)     // org override, not system default
  })
})
