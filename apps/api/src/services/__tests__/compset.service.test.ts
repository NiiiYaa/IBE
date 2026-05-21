import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemCompSetConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    compSetSearchParam: {
      findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    compSetCompetitor: {
      findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(), groupBy: vi.fn(),
    },
    property: { findUnique: vi.fn() },
  },
}))

import { prisma } from '../../db/client.js'
import {
  buildSearchParamLabel,
  getSystemCompSetConfig,
  upsertSystemCompSetConfig,
  getScopedSearchParams,
  getEffectiveSearchParams,
  createSearchParam,
  updateSearchParam,
  deleteSearchParam,
  listCompetitors,
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
  getActivePropertyIds,
} from '../compset.service.js'

const mp = prisma as any

beforeEach(() => { vi.clearAllMocks() })

describe('buildSearchParamLabel', () => {
  it('generates singular forms when count is 1', () => {
    expect(buildSearchParamLabel(1, 1, 1, 'US')).toBe('Today+1 · 1 Night · 1 Adult · US')
  })
  it('generates plural forms when count > 1', () => {
    expect(buildSearchParamLabel(7, 5, 2, 'GB')).toBe('Today+7 · 5 Nights · 2 Adults · GB')
  })
})

describe('getSystemCompSetConfig', () => {
  it('returns defaults when no row exists', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue(null)
    const result = await getSystemCompSetConfig()
    expect(result).toEqual({ maxCompetitorsPerProperty: 5, cronSchedule: '0 3 * * *', enabled: false })
  })
  it('returns stored values', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue({ maxCompetitorsPerProperty: 10, cronSchedule: '0 4 * * *', enabled: true })
    const result = await getSystemCompSetConfig()
    expect(result.maxCompetitorsPerProperty).toBe(10)
    expect(result.enabled).toBe(true)
  })
})

describe('upsertSystemCompSetConfig', () => {
  it('creates a new row when none exists', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue(null)
    mp.systemCompSetConfig.create.mockResolvedValue({ maxCompetitorsPerProperty: 8, cronSchedule: '0 3 * * *', enabled: false })
    const result = await upsertSystemCompSetConfig({ maxCompetitorsPerProperty: 8 })
    expect(mp.systemCompSetConfig.create).toHaveBeenCalledWith({ data: expect.objectContaining({ maxCompetitorsPerProperty: 8 }) })
    expect(result.maxCompetitorsPerProperty).toBe(8)
  })
  it('updates existing row', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue({ id: 1, maxCompetitorsPerProperty: 5, cronSchedule: '0 3 * * *', enabled: false })
    mp.systemCompSetConfig.update.mockResolvedValue({ maxCompetitorsPerProperty: 5, cronSchedule: '0 3 * * *', enabled: true })
    const result = await upsertSystemCompSetConfig({ enabled: true })
    expect(mp.systemCompSetConfig.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { enabled: true } })
    expect(result.enabled).toBe(true)
  })
})

describe('getScopedSearchParams', () => {
  it('returns system params when no scope keys provided', async () => {
    mp.compSetSearchParam.findMany.mockResolvedValue([
      { id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, countryCode: 'US', label: 'Today+7 · 5 Nights · 2 Adults · US', sortOrder: 0 },
    ])
    const result = await getScopedSearchParams({})
    expect(result).toHaveLength(1)
    expect(result[0]!.tier).toBe('system')
    expect(mp.compSetSearchParam.findMany).toHaveBeenCalledWith({ where: { orgId: null, propertyId: null }, orderBy: { sortOrder: 'asc' } })
  })
  it('returns chain params when orgId provided', async () => {
    mp.compSetSearchParam.findMany.mockResolvedValue([
      { id: 2, orgId: 5, propertyId: null, offsetDays: 3, nights: 3, adults: 2, countryCode: 'DE', label: 'Today+3 · 3 Nights · 2 Adults · DE', sortOrder: 0 },
    ])
    const result = await getScopedSearchParams({ orgId: 5 })
    expect(result[0]!.tier).toBe('chain')
  })
  it('returns hotel params when propertyId provided', async () => {
    mp.compSetSearchParam.findMany.mockResolvedValue([
      { id: 3, orgId: null, propertyId: 100, offsetDays: 1, nights: 1, adults: 1, countryCode: 'FR', label: 'Today+1 · 1 Night · 1 Adult · FR', sortOrder: 0 },
    ])
    const result = await getScopedSearchParams({ propertyId: 100 })
    expect(result[0]!.tier).toBe('hotel')
  })
})

describe('getEffectiveSearchParams', () => {
  it('merges system + chain + hotel params in order', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([{ id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, countryCode: 'US', label: 'L1', sortOrder: 0 }])
      .mockResolvedValueOnce([{ id: 2, orgId: 5, propertyId: null, offsetDays: 3, nights: 3, adults: 2, countryCode: 'DE', label: 'L2', sortOrder: 0 }])
      .mockResolvedValueOnce([{ id: 3, orgId: null, propertyId: 100, offsetDays: 1, nights: 1, adults: 1, countryCode: 'FR', label: 'L3', sortOrder: 0 }])
    const result = await getEffectiveSearchParams(100)
    expect(result.map(r => r.tier)).toEqual(['system', 'chain', 'hotel'])
    expect(result).toHaveLength(3)
  })
  it('handles property with no organization (orgId null)', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: null })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([{ id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, countryCode: 'US', label: 'L1', sortOrder: 0 }])
      .mockResolvedValueOnce([{ id: 3, orgId: null, propertyId: 100, offsetDays: 1, nights: 1, adults: 1, countryCode: 'FR', label: 'L3', sortOrder: 0 }])
    const result = await getEffectiveSearchParams(100)
    expect(result.map(r => r.tier)).toEqual(['system', 'hotel'])
    expect(result).toHaveLength(2)
  })
})

describe('createSearchParam', () => {
  it('creates a system param and generates label', async () => {
    mp.compSetSearchParam.create.mockResolvedValue({
      id: 10, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, countryCode: 'US',
      label: 'Today+7 · 5 Nights · 2 Adults · US', sortOrder: 0,
    })
    const result = await createSearchParam({}, { offsetDays: 7, nights: 5, adults: 2, countryCode: 'US' })
    expect(mp.compSetSearchParam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ label: 'Today+7 · 5 Nights · 2 Adults · US', orgId: null, propertyId: null }),
    })
    expect(result.tier).toBe('system')
  })
})

describe('createCompetitor', () => {
  it('rejects when property has reached the max', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue({ maxCompetitorsPerProperty: 3, cronSchedule: '0 3 * * *', enabled: true })
    mp.compSetCompetitor.count.mockResolvedValue(3)
    const result = await createCompetitor({ propertyId: 100, name: 'Hotel X' })
    expect('error' in result).toBe(true)
    expect(mp.compSetCompetitor.create).not.toHaveBeenCalled()
  })
  it('creates when under the max', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue({ maxCompetitorsPerProperty: 5, cronSchedule: '0 3 * * *', enabled: true })
    mp.compSetCompetitor.count.mockResolvedValue(2)
    mp.compSetCompetitor.create.mockResolvedValue({ id: 1, propertyId: 100, name: 'Hotel X', searchUrl: null, sortOrder: 0, status: 'idle', lastFetchAt: null, errorMsg: null })
    const result = await createCompetitor({ propertyId: 100, name: 'Hotel X' })
    expect('error' in result).toBe(false)
    if (!('error' in result)) expect(result.name).toBe('Hotel X')
  })
})

describe('listCompetitors', () => {
  it('returns competitors ordered by sortOrder', async () => {
    mp.compSetCompetitor.findMany.mockResolvedValue([
      { id: 1, propertyId: 100, name: 'Hotel A', searchUrl: 'https://a.com', sortOrder: 0, status: 'idle', lastFetchAt: null, errorMsg: null },
      { id: 2, propertyId: 100, name: 'Hotel B', searchUrl: null, sortOrder: 1, status: 'done', lastFetchAt: new Date('2026-05-21T10:00:00Z'), errorMsg: null },
    ])
    const result = await listCompetitors(100)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Hotel A')
    expect(result[1].lastFetchAt).toBe('2026-05-21T10:00:00.000Z')
    expect(mp.compSetCompetitor.findMany).toHaveBeenCalledWith({ where: { propertyId: 100 }, orderBy: { sortOrder: 'asc' } })
  })
})

describe('updateSearchParam', () => {
  it('returns null when id not found', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(null)
    const result = await updateSearchParam(999, { nights: 3 })
    expect(result).toBeNull()
    expect(mp.compSetSearchParam.update).not.toHaveBeenCalled()
  })
  it('updates and regenerates label', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue({ id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, countryCode: 'US', label: 'old', sortOrder: 0 })
    mp.compSetSearchParam.update.mockResolvedValue({ id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 3, adults: 2, countryCode: 'US', label: 'Today+7 · 3 Nights · 2 Adults · US', sortOrder: 0 })
    const result = await updateSearchParam(1, { nights: 3 })
    expect(result).not.toBeNull()
    expect(mp.compSetSearchParam.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ nights: 3, label: 'Today+7 · 3 Nights · 2 Adults · US' }),
    })
    expect(result?.tier).toBe('system')
  })
})

describe('deleteSearchParam', () => {
  it('returns false when id not found', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(null)
    const result = await deleteSearchParam(999)
    expect(result).toBe(false)
    expect(mp.compSetSearchParam.delete).not.toHaveBeenCalled()
  })
  it('returns true and deletes when found', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue({ id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, countryCode: 'US', label: 'L', sortOrder: 0 })
    mp.compSetSearchParam.delete.mockResolvedValue({})
    const result = await deleteSearchParam(1)
    expect(result).toBe(true)
    expect(mp.compSetSearchParam.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})

describe('updateCompetitor', () => {
  it('returns null when id not found', async () => {
    mp.compSetCompetitor.findUnique.mockResolvedValue(null)
    const result = await updateCompetitor(999, { name: 'New Name' })
    expect(result).toBeNull()
    expect(mp.compSetCompetitor.update).not.toHaveBeenCalled()
  })
  it('updates competitor when found', async () => {
    mp.compSetCompetitor.findUnique.mockResolvedValue({ id: 1, propertyId: 100, name: 'Old', searchUrl: null, sortOrder: 0, status: 'idle', lastFetchAt: null, errorMsg: null })
    mp.compSetCompetitor.update.mockResolvedValue({ id: 1, propertyId: 100, name: 'New Name', searchUrl: null, sortOrder: 0, status: 'idle', lastFetchAt: null, errorMsg: null })
    const result = await updateCompetitor(1, { name: 'New Name' })
    expect(result?.name).toBe('New Name')
  })
})

describe('deleteCompetitor', () => {
  it('returns false when id not found', async () => {
    mp.compSetCompetitor.findUnique.mockResolvedValue(null)
    const result = await deleteCompetitor(999)
    expect(result).toBe(false)
    expect(mp.compSetCompetitor.delete).not.toHaveBeenCalled()
  })
  it('returns true and deletes when found', async () => {
    mp.compSetCompetitor.findUnique.mockResolvedValue({ id: 1, propertyId: 100, name: 'Hotel X', searchUrl: null, sortOrder: 0, status: 'idle', lastFetchAt: null, errorMsg: null })
    mp.compSetCompetitor.delete.mockResolvedValue({})
    const result = await deleteCompetitor(1)
    expect(result).toBe(true)
    expect(mp.compSetCompetitor.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})

describe('getActivePropertyIds', () => {
  it('returns distinct propertyIds from competitors', async () => {
    mp.compSetCompetitor.groupBy.mockResolvedValue([{ propertyId: 100 }, { propertyId: 200 }])
    const result = await getActivePropertyIds()
    expect(result).toEqual([100, 200])
  })
})
