import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/client.js'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemMultiCityConfig: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orgMultiCityConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

const mockPrisma = prisma as unknown as {
  systemMultiCityConfig: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  orgMultiCityConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
}

beforeEach(() => { vi.clearAllMocks() })

describe('getSystemMultiCityConfig', () => {
  it('returns defaults when no row exists', async () => {
    mockPrisma.systemMultiCityConfig.findFirst.mockResolvedValue(null)
    const { getSystemMultiCityConfig } = await import('../multicity-config.service.js')
    const result = await getSystemMultiCityConfig()
    expect(result).toEqual({ enabled: false, maxLegs: 3 })
  })

  it('returns stored values', async () => {
    mockPrisma.systemMultiCityConfig.findFirst.mockResolvedValue({ id: 1, enabled: true, maxLegs: 4 })
    const { getSystemMultiCityConfig } = await import('../multicity-config.service.js')
    const result = await getSystemMultiCityConfig()
    expect(result.enabled).toBe(true)
    expect(result.maxLegs).toBe(4)
  })
})

describe('getOrgMultiCityConfig', () => {
  it('uses system defaults when no org row', async () => {
    mockPrisma.systemMultiCityConfig.findFirst.mockResolvedValue({ id: 1, enabled: false, maxLegs: 3 })
    mockPrisma.orgMultiCityConfig.findUnique.mockResolvedValue(null)
    const { getOrgMultiCityConfig } = await import('../multicity-config.service.js')
    const result = await getOrgMultiCityConfig(1)
    expect(result.enabled).toBeNull()
    expect(result.effective.enabled).toBe(false)
    expect(result.effective.maxLegs).toBe(3)
  })

  it('org enabled overrides system', async () => {
    mockPrisma.systemMultiCityConfig.findFirst.mockResolvedValue({ id: 1, enabled: false, maxLegs: 3 })
    mockPrisma.orgMultiCityConfig.findUnique.mockResolvedValue({ organizationId: 1, enabled: true, maxLegs: null })
    const { getOrgMultiCityConfig } = await import('../multicity-config.service.js')
    const result = await getOrgMultiCityConfig(1)
    expect(result.enabled).toBe(true)
    expect(result.effective.enabled).toBe(true)
    expect(result.effective.maxLegs).toBe(3)
  })

  it('org partial override: org maxLegs null inherits from system', async () => {
    mockPrisma.systemMultiCityConfig.findFirst.mockResolvedValue({ id: 1, enabled: false, maxLegs: 5 })
    mockPrisma.orgMultiCityConfig.findUnique.mockResolvedValue({ organizationId: 1, enabled: true, maxLegs: null })
    const { getOrgMultiCityConfig } = await import('../multicity-config.service.js')
    const result = await getOrgMultiCityConfig(1)
    // org-level field for maxLegs should be null (not overriding)
    expect(result.maxLegs).toBeNull()
    // but effective maxLegs comes from system
    expect(result.effective.maxLegs).toBe(5)
    // org-level enabled override should be reflected
    expect(result.effective.enabled).toBe(true)
  })

  it('resolveEffectiveMultiCityConfig returns enabled:false when system disabled', async () => {
    mockPrisma.systemMultiCityConfig.findFirst.mockResolvedValue({ id: 1, enabled: false, maxLegs: 3 })
    mockPrisma.orgMultiCityConfig.findUnique.mockResolvedValue(null)
    const { resolveEffectiveMultiCityConfig } = await import('../multicity-config.service.js')
    const eff = await resolveEffectiveMultiCityConfig(1)
    expect(eff.enabled).toBe(false)
  })
})
