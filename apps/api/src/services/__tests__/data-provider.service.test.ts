import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemDataProviderConfig: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    orgDataProviderConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    propertyDataProviderConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    property: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '../../db/client.js'
import {
  getSystemConfig,
  upsertSystemConfig,
  getOrgConfig,
  upsertOrgConfig,
  getPropertyConfig,
  upsertPropertyConfig,
  getEffectiveConfig,
} from '../data-provider.service.js'

const mockPrisma = prisma as unknown as {
  systemDataProviderConfig: { findFirst: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  orgDataProviderConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  propertyDataProviderConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  property: { findUnique: ReturnType<typeof vi.fn> }
}

beforeEach(() => vi.clearAllMocks())

describe('getSystemConfig', () => {
  it('returns hardcoded defaults when no row exists', async () => {
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue(null)
    const result = await getSystemConfig()
    expect(result).toEqual({ providerType: 'dataforseo', refreshIntervalDays: 30, enabled: false })
  })

  it('returns stored values when row exists', async () => {
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue({
      providerType: 'dataforseo', refreshIntervalDays: 14, enabled: true,
    })
    const result = await getSystemConfig()
    expect(result.enabled).toBe(true)
    expect(result.refreshIntervalDays).toBe(14)
  })
})

describe('getEffectiveConfig', () => {
  it('uses system defaults when no org or property override', async () => {
    mockPrisma.property.findUnique.mockResolvedValue({ propertyId: 1, organizationId: 10 })
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue({ providerType: 'dataforseo', refreshIntervalDays: 30, enabled: true })
    mockPrisma.orgDataProviderConfig.findUnique.mockResolvedValue(null)
    mockPrisma.propertyDataProviderConfig.findUnique.mockResolvedValue(null)

    const result = await getEffectiveConfig(1)
    expect(result.enabled).toBe(true)
    expect(result.refreshIntervalDays).toBe(30)
    expect(result.providerType).toBe('dataforseo')
  })

  it('org override wins over system when useSystem=false', async () => {
    mockPrisma.property.findUnique.mockResolvedValue({ propertyId: 1, organizationId: 10 })
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue({ providerType: 'dataforseo', refreshIntervalDays: 30, enabled: false })
    mockPrisma.orgDataProviderConfig.findUnique.mockResolvedValue({ useSystem: false, refreshIntervalDays: 7, enabled: true })
    mockPrisma.propertyDataProviderConfig.findUnique.mockResolvedValue(null)

    const result = await getEffectiveConfig(1)
    expect(result.enabled).toBe(true)
    expect(result.refreshIntervalDays).toBe(7)
  })

  it('property override wins when useOrg=false', async () => {
    mockPrisma.property.findUnique.mockResolvedValue({ propertyId: 1, organizationId: 10 })
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue({ providerType: 'dataforseo', refreshIntervalDays: 30, enabled: false })
    mockPrisma.orgDataProviderConfig.findUnique.mockResolvedValue({ useSystem: false, refreshIntervalDays: 7, enabled: false })
    mockPrisma.propertyDataProviderConfig.findUnique.mockResolvedValue({ useOrg: false, refreshIntervalDays: 3, enabled: true })

    const result = await getEffectiveConfig(1)
    expect(result.enabled).toBe(true)
    expect(result.refreshIntervalDays).toBe(3)
  })
})
