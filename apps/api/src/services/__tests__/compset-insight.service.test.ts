import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    compSetInsight: { findUnique: vi.fn(), upsert: vi.fn() },
    compSetResult: { findFirst: vi.fn(), findMany: vi.fn() },
    compSetSearchParam: { findMany: vi.fn() },
    compSetCompetitor: { findMany: vi.fn() },
    property: { findUnique: vi.fn() },
  },
}))

vi.mock('../ai-config.service.js', () => ({
  resolveAIConfig: vi.fn(),
}))

vi.mock('../../ai/adapters/index.js', () => ({
  getProviderAdapter: vi.fn(),
}))

vi.mock('../static.service.js', () => ({
  getPropertyDetail: vi.fn(),
}))

import { prisma } from '../../db/client.js'
import { resolveAIConfig } from '../ai-config.service.js'
import { getProviderAdapter } from '../../ai/adapters/index.js'
import { getPropertyDetail } from '../static.service.js'
import {
  getLatestInsight,
  hasNewData,
  generateInsight,
} from '../compset-insight.service.js'

const mp = prisma as any
const mockResolveAI = resolveAIConfig as ReturnType<typeof vi.fn>
const mockGetAdapter = getProviderAdapter as ReturnType<typeof vi.fn>
const mockGetDetail = getPropertyDetail as ReturnType<typeof vi.fn>

beforeEach(() => { vi.clearAllMocks() })

// ── getLatestInsight ─────────────────────────────────────────────────────────

describe('getLatestInsight', () => {
  it('returns null when no row exists', async () => {
    mp.compSetInsight.findUnique.mockResolvedValue(null)
    expect(await getLatestInsight(1)).toBeNull()
  })

  it('parses content JSON and returns typed insight', async () => {
    const content = { summary: 'Test', pricingInsights: ['A'], competitorPositioning: [], recommendedActions: [], anomalies: [], strategicRecommendations: [] }
    mp.compSetInsight.findUnique.mockResolvedValue({
      id: 1, propertyId: 1, analyzedAt: new Date('2026-05-22T10:00:00Z'), content: JSON.stringify(content),
    })
    const result = await getLatestInsight(1)
    expect(result).not.toBeNull()
    expect(result!.content.summary).toBe('Test')
    expect(result!.content.pricingInsights).toEqual(['A'])
    expect(result!.analyzedAt).toBe('2026-05-22T10:00:00.000Z')
  })

  it('falls back gracefully if content is invalid JSON', async () => {
    mp.compSetInsight.findUnique.mockResolvedValue({
      id: 1, propertyId: 1, analyzedAt: new Date(), content: 'not json',
    })
    const result = await getLatestInsight(1)
    expect(result).not.toBeNull()
    expect(result!.content.summary).toBe('not json')
    expect(result!.content.pricingInsights).toEqual([])
  })
})

// ── hasNewData ────────────────────────────────────────────────────────────────

describe('hasNewData', () => {
  it('returns false when no results exist', async () => {
    mp.compSetResult.findFirst.mockResolvedValue(null)
    expect(await hasNewData(1)).toBe(false)
  })

  it('returns true when results exist but no insight', async () => {
    mp.compSetResult.findFirst.mockResolvedValue({ fetchedAt: new Date() })
    mp.compSetInsight.findUnique.mockResolvedValue(null)
    expect(await hasNewData(1)).toBe(true)
  })

  it('returns true when latest result is newer than insight', async () => {
    const insightDate = new Date('2026-05-20T00:00:00Z')
    const resultDate = new Date('2026-05-22T00:00:00Z')
    mp.compSetResult.findFirst.mockResolvedValue({ fetchedAt: resultDate })
    mp.compSetInsight.findUnique.mockResolvedValue({ analyzedAt: insightDate })
    expect(await hasNewData(1)).toBe(true)
  })

  it('returns false when insight is newer than latest result', async () => {
    const insightDate = new Date('2026-05-22T00:00:00Z')
    const resultDate = new Date('2026-05-20T00:00:00Z')
    mp.compSetResult.findFirst.mockResolvedValue({ fetchedAt: resultDate })
    mp.compSetInsight.findUnique.mockResolvedValue({ analyzedAt: insightDate })
    expect(await hasNewData(1)).toBe(false)
  })
})

// ── generateInsight ───────────────────────────────────────────────────────────

describe('generateInsight', () => {
  it('throws when AI is not configured', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5, name: 'Hotel X' })
    mockResolveAI.mockResolvedValue(null)
    await expect(generateInsight(1)).rejects.toThrow('AI not configured')
  })

  it('upserts parsed JSON content on success', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5, name: 'Hotel X' })
    mockResolveAI.mockResolvedValue({ provider: 'fake', apiKey: 'k', model: 'm' })
    mockGetDetail.mockResolvedValue({ name: 'Hotel X', starRating: 5, location: { city: 'Berlin', countryCode: 'DE' } })
    mp.compSetResult.findMany.mockResolvedValue([])
    mp.compSetSearchParam.findMany.mockResolvedValue([])
    mp.compSetCompetitor.findMany.mockResolvedValue([])
    const content = { summary: 'Good rates', pricingInsights: ['p1'], competitorPositioning: [], recommendedActions: [], anomalies: [], strategicRecommendations: [] }
    const mockAdapter = { call: vi.fn().mockResolvedValue({ text: JSON.stringify(content), stopReason: 'end', toolCalls: [] }) }
    mockGetAdapter.mockReturnValue(mockAdapter)
    mp.compSetInsight.upsert.mockResolvedValue({ id: 1, propertyId: 1, analyzedAt: new Date(), content: JSON.stringify(content) })

    const result = await generateInsight(1)
    expect(mp.compSetInsight.upsert).toHaveBeenCalledOnce()
    expect(result.content.summary).toBe('Good rates')
  })

  it('stores fallback when AI returns non-JSON', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5, name: 'Hotel X' })
    mockResolveAI.mockResolvedValue({ provider: 'fake', apiKey: 'k', model: 'm' })
    mockGetDetail.mockRejectedValue(new Error('HG unavailable'))
    mp.compSetResult.findMany.mockResolvedValue([])
    mp.compSetSearchParam.findMany.mockResolvedValue([])
    mp.compSetCompetitor.findMany.mockResolvedValue([])
    const mockAdapter = { call: vi.fn().mockResolvedValue({ text: 'Some prose analysis', stopReason: 'end', toolCalls: [] }) }
    mockGetAdapter.mockReturnValue(mockAdapter)
    const fallbackContent = { summary: 'Some prose analysis', pricingInsights: [], competitorPositioning: [], recommendedActions: [], anomalies: [], strategicRecommendations: [] }
    mp.compSetInsight.upsert.mockResolvedValue({ id: 1, propertyId: 1, analyzedAt: new Date(), content: JSON.stringify(fallbackContent) })

    const result = await generateInsight(1)
    expect(result.content.summary).toBe('Some prose analysis')
    expect(result.content.pricingInsights).toEqual([])
  })
})
