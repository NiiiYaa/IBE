import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    externalIBEConfig: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    property: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '../../db/client.js'
import {
  buildExternalUrl,
  getEffectiveExternalIBEConfig,
  getExternalIBEConfig,
  bulkMapExternalHotelIds,
} from '../external-ibe.service.js'

const mp = prisma as any
beforeEach(() => { vi.clearAllMocks() })

// ── buildExternalUrl ──────────────────────────────────────────────────────

describe('buildExternalUrl', () => {
  it('replaces all tokens', () => {
    expect(buildExternalUrl(
      'https://ext.com/book?hotel={externalHotelId}&from={checkIn}&to={checkOut}',
      { externalHotelId: '4521', checkIn: '2024-06-01', checkOut: '2024-06-07' },
    )).toBe('https://ext.com/book?hotel=4521&from=2024-06-01&to=2024-06-07')
  })

  it('omits query param when value is null', () => {
    expect(buildExternalUrl(
      'https://ext.com/book?hotel={externalHotelId}&room={roomId}',
      { externalHotelId: '4521', roomId: null },
    )).toBe('https://ext.com/book?hotel=4521')
  })

  it('removes query string entirely when all params are null', () => {
    expect(buildExternalUrl(
      'https://ext.com/book?room={roomId}',
      { roomId: null },
    )).toBe('https://ext.com/book')
  })

  it('handles path-segment placeholders', () => {
    expect(buildExternalUrl(
      'https://ext.com/{externalHotelId}/book?from={checkIn}',
      { externalHotelId: '4521', checkIn: '2024-06-01' },
    )).toBe('https://ext.com/4521/book?from=2024-06-01')
  })

  it('leaves unknown tokens intact in path segments', () => {
    expect(buildExternalUrl(
      'https://ext.com/{externalHotelId}/book',
      {},
    )).toBe('https://ext.com/{externalHotelId}/book')
  })
})

// ── getEffectiveExternalIBEConfig ─────────────────────────────────────────

describe('getEffectiveExternalIBEConfig — standalone hotel', () => {
  it('returns hotel config when no chain config exists', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.externalIBEConfig.findUnique
      .mockResolvedValueOnce({   // hotel row
        searchTemplate: 'https://ext.com/search?hotel={externalHotelId}',
        bookingTemplate: 'https://ext.com/book?hotel={externalHotelId}',
        externalHotelId: '4521',
        mcpEnabled: true,
        affiliateEnabled: false,
        widgetEnabled: false,
      })
      .mockResolvedValueOnce(null)  // chain row

    const result = await getEffectiveExternalIBEConfig(42)
    expect(result?.searchTemplate).toBe('https://ext.com/search?hotel={externalHotelId}')
    expect(result?.externalHotelId).toBe('4521')
    expect(result?.mcpEnabled).toBe(true)
  })

  it('returns null when no hotel config and no chain config', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.externalIBEConfig.findUnique.mockResolvedValue(null)

    expect(await getEffectiveExternalIBEConfig(42)).toBeNull()
  })
})

describe('getEffectiveExternalIBEConfig — chain-member hotel', () => {
  it('merges chain templates with hotel externalHotelId', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.externalIBEConfig.findUnique
      .mockResolvedValueOnce({   // hotel row (no own templates)
        searchTemplate: null,
        bookingTemplate: null,
        externalHotelId: '4521',
        mcpEnabled: true,
        affiliateEnabled: false,
        widgetEnabled: false,
      })
      .mockResolvedValueOnce({   // chain row
        searchTemplate: 'https://ext.com/search?hotel={externalHotelId}&from={checkIn}',
        bookingTemplate: 'https://ext.com/book?hotel={externalHotelId}&room={roomId}',
        mcpEnabled: true,
        affiliateEnabled: false,
        widgetEnabled: false,
      })

    const result = await getEffectiveExternalIBEConfig(42)
    expect(result?.searchTemplate).toBe('https://ext.com/search?hotel={externalHotelId}&from={checkIn}')
    expect(result?.externalHotelId).toBe('4521')
  })

  it('returns chain config as-is when no hotel row', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.externalIBEConfig.findUnique
      .mockResolvedValueOnce(null)  // hotel row
      .mockResolvedValueOnce({      // chain row
        searchTemplate: 'https://ext.com/search?hotel={externalHotelId}',
        bookingTemplate: null,
        mcpEnabled: false,
        affiliateEnabled: false,
        widgetEnabled: false,
      })

    const result = await getEffectiveExternalIBEConfig(42)
    expect(result?.searchTemplate).toBe('https://ext.com/search?hotel={externalHotelId}')
    expect(result?.externalHotelId).toBeNull()
  })

  it('uses hotel own templates when hotel has them (full override)', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.externalIBEConfig.findUnique
      .mockResolvedValueOnce({   // hotel row with own templates
        searchTemplate: 'https://hotel-own.com/search?h={externalHotelId}',
        bookingTemplate: 'https://hotel-own.com/book?h={externalHotelId}',
        externalHotelId: '9999',
        mcpEnabled: true,
        affiliateEnabled: true,
        widgetEnabled: false,
      })
      .mockResolvedValueOnce({   // chain row
        searchTemplate: 'https://chain.com/search?hotel={externalHotelId}',
        bookingTemplate: 'https://chain.com/book?hotel={externalHotelId}',
        mcpEnabled: false,
        affiliateEnabled: false,
        widgetEnabled: false,
      })

    const result = await getEffectiveExternalIBEConfig(42)
    expect(result?.searchTemplate).toBe('https://hotel-own.com/search?h={externalHotelId}')
    expect(result?.mcpEnabled).toBe(true)
  })
})

// ── getExternalIBEConfig ──────────────────────────────────────────────────

describe('getExternalIBEConfig', () => {
  it('returns null when no row found', async () => {
    mp.externalIBEConfig.findUnique.mockResolvedValue(null)
    expect(await getExternalIBEConfig({ orgId: 1 })).toBeNull()
  })

  it('returns row when found by orgId', async () => {
    const row = {
      id: 1, organizationId: 1, propertyId: null,
      searchTemplate: 'https://ext.com/search', bookingTemplate: null,
      searchSampleUrls: '[]', bookingSampleUrls: '[]',
      externalHotelId: null, mcpEnabled: false,
      affiliateEnabled: false, widgetEnabled: false,
      createdAt: new Date(), updatedAt: new Date(),
    }
    mp.externalIBEConfig.findUnique.mockResolvedValue(row)
    const result = await getExternalIBEConfig({ orgId: 1 })
    expect(result?.searchTemplate).toBe('https://ext.com/search')
    expect(result?.searchSampleUrls).toEqual([])
  })
})

// ── bulkMapExternalHotelIds ───────────────────────────────────────────────

describe('bulkMapExternalHotelIds', () => {
  const orgProperties = [
    { propertyId: 10, name: 'Hotel Alpha' },
    { propertyId: 11, name: 'Hotel Beta' },
    { propertyId: 12, name: 'Hotel Gamma' },
  ]

  beforeEach(() => {
    mp.property.findMany.mockResolvedValue(orgProperties)
    mp.externalIBEConfig.upsert.mockResolvedValue({ id: 1, propertyId: 10, externalHotelId: 'ext-10' })
    mp.externalIBEConfig.findMany.mockResolvedValue([])
  })

  it('upserts valid mappings and returns updated count', async () => {
    mp.externalIBEConfig.findMany.mockResolvedValue([
      { propertyId: 10, externalHotelId: 'ext-10' },
      { propertyId: 11, externalHotelId: 'ext-11' },
    ])

    const result = await bulkMapExternalHotelIds(1, [
      { propertyId: 10, externalHotelId: 'ext-10' },
      { propertyId: 11, externalHotelId: 'ext-11' },
    ])

    expect(result.updated).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(result.stillMissing).toEqual([{ propertyId: 12, name: 'Hotel Gamma' }])
  })

  it('returns error for property not in org', async () => {
    const result = await bulkMapExternalHotelIds(1, [
      { propertyId: 99, externalHotelId: 'ext-99' },
    ])

    expect(result.updated).toBe(0)
    expect(result.errors).toEqual([
      { propertyId: 99, message: 'Property not found in this organisation' },
    ])
    expect(mp.externalIBEConfig.upsert).not.toHaveBeenCalled()
  })

  it('collects db error and continues remaining mappings', async () => {
    mp.externalIBEConfig.upsert
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce({ id: 2, propertyId: 11, externalHotelId: 'ext-11' })

    mp.externalIBEConfig.findMany.mockResolvedValue([
      { propertyId: 11, externalHotelId: 'ext-11' },
    ])

    const result = await bulkMapExternalHotelIds(1, [
      { propertyId: 10, externalHotelId: 'ext-10' },
      { propertyId: 11, externalHotelId: 'ext-11' },
    ])

    expect(result.updated).toBe(1)
    expect(result.errors).toEqual([{ propertyId: 10, message: 'DB timeout' }])
    expect(result.stillMissing).toEqual([{ propertyId: 12, name: 'Hotel Gamma' }])
  })

  it('reports all properties as still missing when no configs exist', async () => {
    mp.externalIBEConfig.findMany.mockResolvedValue([])

    const result = await bulkMapExternalHotelIds(1, [])

    expect(result.updated).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(result.stillMissing).toHaveLength(3)
  })
})

vi.mock('../ai-config.service.js', () => ({
  resolveAIConfig: vi.fn(),
}))

const mockAdapterCall = vi.fn()
vi.mock('../../ai/adapters/index.js', () => ({
  getProviderAdapter: vi.fn(() => ({ call: mockAdapterCall })),
}))

import { resolveAIConfig } from '../ai-config.service.js'
import { analyzeExternalIBEUrls } from '../external-ibe.service.js'

describe('analyzeExternalIBEUrls', () => {
  it('returns error when no AI config is available', async () => {
    (resolveAIConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const result = await analyzeExternalIBEUrls({
      urls: ['https://ext.com/book?hotel=123&from=2024-06-01'],
      type: 'booking',
    })
    expect(result).toEqual({ error: 'AI not configured for this scope' })
  })

  it('returns parsed template and mapping on success with any provider', async () => {
    (resolveAIConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o',
    })

    const aiResponse = {
      template: 'https://ext.com/book?hotel={externalHotelId}&from={checkIn}',
      mapping: [
        { concept: 'externalHotelId', detectedParam: 'hotel', exampleValue: '123' },
        { concept: 'checkIn', detectedParam: 'from', exampleValue: '2024-06-01' },
      ],
      unmapped: [],
    }

    mockAdapterCall.mockResolvedValue({
      text: JSON.stringify(aiResponse),
      toolCalls: [],
      stopReason: 'end',
    })

    const result = await analyzeExternalIBEUrls({
      urls: ['https://ext.com/book?hotel=123&from=2024-06-01'],
      type: 'booking',
    })

    expect(result).toEqual(aiResponse)
  })

  it('returns error when adapter reports error', async () => {
    (resolveAIConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      provider: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-haiku-4-5-20251001',
    })
    mockAdapterCall.mockResolvedValue({ text: null, toolCalls: [], stopReason: 'error', error: 'API key invalid' })

    const result = await analyzeExternalIBEUrls({
      urls: ['https://ext.com/book?hotel=123&from=2024-06-01'],
      type: 'booking',
    })
    expect(result).toEqual({ error: 'API key invalid' })
  })
})
