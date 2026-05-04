import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    property: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    propertyScore: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

vi.mock('../data-provider.service.js', () => ({
  getEffectiveConfig: vi.fn(),
}))

vi.mock('../../adapters/dataforseo/client.js', () => ({
  fetchHotelScore: vi.fn(),
}))

vi.mock('../../adapters/hyperguest/static.js', () => ({
  fetchPropertyStatic: vi.fn(),
}))

vi.mock('../../config/env.js', () => ({
  env: { DATAFORSEO_LOGIN: 'testlogin', DATAFORSEO_PASSWORD: 'testpass' },
}))

import { prisma } from '../../db/client.js'
import { getEffectiveConfig } from '../data-provider.service.js'
import { fetchHotelScore } from '../../adapters/dataforseo/client.js'
import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { refreshProperty, findPropertiesDueForRefresh } from '../data-provider-fetch.service.js'

const mockPrisma = prisma as any
const mockGetEffectiveConfig = getEffectiveConfig as ReturnType<typeof vi.fn>
const mockFetchHotelScore = fetchHotelScore as ReturnType<typeof vi.fn>
const mockFetchPropertyStatic = fetchPropertyStatic as ReturnType<typeof vi.fn>

beforeEach(() => { vi.clearAllMocks() })

describe('refreshProperty', () => {
  it('skips and returns early when effective config has enabled=false', async () => {
    mockGetEffectiveConfig.mockResolvedValue({ enabled: false, refreshIntervalDays: 30, providerType: 'dataforseo' })
    const result = await refreshProperty(123)
    expect(result).toEqual({ propertyId: 123, skipped: true, reason: 'disabled' })
    expect(mockFetchHotelScore).not.toHaveBeenCalled()
  })

  it('updates PropertyScore with fetched data on success', async () => {
    mockGetEffectiveConfig.mockResolvedValue({ enabled: true, refreshIntervalDays: 30, providerType: 'dataforseo' })
    mockFetchPropertyStatic.mockResolvedValue({
      name: 'Grand Hotel',
      location: { city: { name: 'Paris' }, countryCode: 'FR' },
    })
    mockFetchHotelScore.mockResolvedValue({ score: 4.6, reviewCount: 890 })
    mockPrisma.propertyScore.upsert.mockResolvedValue({})

    const result = await refreshProperty(123)
    expect(result).toEqual({ propertyId: 123, skipped: false, score: 4.6, reviewCount: 890 })
    expect(mockPrisma.propertyScore.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { propertyId: 123 },
      update: expect.objectContaining({ score: 4.6, reviewCount: 890, status: 'done' }),
    }))
  })

  it('stores error status when DataForSEO returns null', async () => {
    mockGetEffectiveConfig.mockResolvedValue({ enabled: true, refreshIntervalDays: 30, providerType: 'dataforseo' })
    mockFetchPropertyStatic.mockResolvedValue({
      name: 'Unknown Hotel',
      location: { city: { name: 'Nowhere' }, countryCode: 'XX' },
    })
    mockFetchHotelScore.mockResolvedValue(null)
    mockPrisma.propertyScore.upsert.mockResolvedValue({})

    const result = await refreshProperty(123)
    expect(result).toEqual({ propertyId: 123, skipped: false, score: null, reviewCount: null })
    expect(mockPrisma.propertyScore.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: 'error', errorMsg: 'No score returned by provider' }),
    }))
  })

  it('stores error status when fetchPropertyStatic throws', async () => {
    mockGetEffectiveConfig.mockResolvedValue({ enabled: true, refreshIntervalDays: 30, providerType: 'dataforseo' })
    mockFetchPropertyStatic.mockRejectedValue(new Error('HyperGuest API error'))
    mockPrisma.propertyScore.upsert.mockResolvedValue({})

    const result = await refreshProperty(123)
    expect(result).toEqual({ propertyId: 123, skipped: false, score: null, reviewCount: null })
    expect(mockPrisma.propertyScore.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: 'error' }),
    }))
  })
})

describe('findPropertiesDueForRefresh', () => {
  it('returns propertyIds where fetchedAt is null', async () => {
    mockPrisma.property.findMany.mockResolvedValue([{ propertyId: 1 }, { propertyId: 2 }])
    mockPrisma.propertyScore.findMany.mockResolvedValue([])

    const ids = await findPropertiesDueForRefresh()
    expect(ids).toEqual([1, 2])
  })
})
