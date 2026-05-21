import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    property: { findUnique: vi.fn() },
    compSetCompetitor: { updateMany: vi.fn(), update: vi.fn() },
    compSetResult: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}))
vi.mock('../compset.service.js', () => ({
  getEffectiveSearchParams: vi.fn(),
  listCompetitors: vi.fn(),
}))
vi.mock('../../adapters/hyperguest/search.js', () => ({ searchAvailability: vi.fn() }))
vi.mock('../playwright-browser.service.js', () => ({ withStealthPage: vi.fn() }))
vi.mock('../ai-config.service.js', () => ({ resolveAIConfig: vi.fn() }))
vi.mock('../external-ibe.service.js', () => ({
  buildExternalUrl: vi.fn((template: string) => template),
}))

import { prisma } from '../../db/client.js'
import { getEffectiveSearchParams, listCompetitors } from '../compset.service.js'
import { searchAvailability } from '../../adapters/hyperguest/search.js'
import { deriveCancellation, runPropertyCompSet } from '../compset-collect.service.js'

const mp = prisma as any
const mGetParams = getEffectiveSearchParams as any
const mListComp = listCompetitors as any
const mSearch = searchAvailability as any

beforeEach(() => { vi.clearAllMocks() })

describe('deriveCancellation', () => {
  it('returns Flexi when no policies', () => {
    expect(deriveCancellation([])).toBe('Flexi')
  })
  it('returns NR when all policies start at daysBefore=0', () => {
    expect(deriveCancellation([{ daysBefore: 0, penaltyType: 'percent', amount: 100 }])).toBe('NR')
  })
  it('returns Flexi when any policy has daysBefore > 0', () => {
    expect(deriveCancellation([{ daysBefore: 7, penaltyType: 'percent', amount: 100 }])).toBe('Flexi')
  })
})

describe('runPropertyCompSet', () => {
  const baseParam = {
    id: 1, orgId: null, propertyId: null, offsetDays: 1, nights: 2, adults: 2,
    countryCode: 'US', label: 'L', sortOrder: 0, tier: 'system' as const,
  }

  it('exits early when there are no search params', async () => {
    mGetParams.mockResolvedValue([])
    mListComp.mockResolvedValue([])
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    await runPropertyCompSet(100)
    expect(mp.compSetResult.deleteMany).not.toHaveBeenCalled()
  })

  it('stores own hotel rates when HyperGuest returns results', async () => {
    mGetParams.mockResolvedValue([baseParam])
    mListComp.mockResolvedValue([])
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetResult.deleteMany.mockResolvedValue({})
    mp.compSetResult.createMany.mockResolvedValue({})
    mSearch.mockResolvedValue({
      results: [{
        propertyId: 100,
        rooms: [{
          roomName: 'Deluxe Room',
          ratePlans: [{
            board: 'BB',
            cancellationPolicies: [{ daysBefore: 3, penaltyType: 'percent', amount: 100 }],
            prices: { sell: { price: 400, currency: 'USD' } },
          }],
        }],
      }],
    })

    await runPropertyCompSet(100)

    expect(mp.compSetResult.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          propertyId: 100,
          competitorId: null,
          searchStatus: 'found',
          roomName: 'Deluxe Room',
          board: 'BB',
          cancellation: 'Flexi',
          total: 400,
          pricePerNight: 200,
          currency: 'USD',
        }),
      ]),
    })
  })

  it('stores not_found row when HyperGuest returns no rooms for property', async () => {
    mGetParams.mockResolvedValue([baseParam])
    mListComp.mockResolvedValue([])
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetResult.deleteMany.mockResolvedValue({})
    mp.compSetResult.createMany.mockResolvedValue({})
    mSearch.mockResolvedValue({ results: [] })

    await runPropertyCompSet(100)

    expect(mp.compSetResult.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ competitorId: null, searchStatus: 'not_found' }),
      ]),
    })
  })

  it('marks competitor as error when no searchUrl configured', async () => {
    mGetParams.mockResolvedValue([baseParam])
    mListComp.mockResolvedValue([{ id: 10, propertyId: 100, name: 'Rival', searchUrl: null, sortOrder: 0, status: 'idle', lastFetchAt: null, errorMsg: null }])
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetCompetitor.updateMany.mockResolvedValue({})
    mp.compSetCompetitor.update.mockResolvedValue({})
    mp.compSetResult.deleteMany.mockResolvedValue({})
    mp.compSetResult.createMany.mockResolvedValue({})
    mSearch.mockResolvedValue({ results: [] })

    await runPropertyCompSet(100)

    expect(mp.compSetCompetitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10 }, data: expect.objectContaining({ status: 'error', errorMsg: 'No search URL configured' }) }),
    )
  })
})
