import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemCompSetConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    compSetConfig: { findFirst: vi.fn() },
    compSetSearchParam: {
      findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    compSetSearchParamOverride: {
      findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(),
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
  getAdminSearchParams,
  getEffectiveSearchParams,
  createSearchParam,
  updateSearchParam,
  deleteSearchParam,
  updateSearchParamActive,
  listCompetitors,
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
  getActivePropertyIds,
} from '../compset.service.js'

const mp = prisma as any

function makeParam(overrides: Partial<{ id: number; orgId: number | null; propertyId: number | null; offsetDays: number; nights: number; adults: number; isActive: boolean }> = {}) {
  return {
    id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, children: 0, childAges: '[]',
    label: 'Today+7 · 5 Nights · 2 Adults', sortOrder: 0, isActive: true,
    ...overrides,
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('buildSearchParamLabel', () => {
  it('generates singular forms when count is 1, no children', () => {
    expect(buildSearchParamLabel(1, 1, 1, 0, [])).toBe('Today+1 · 1 Night · 1 Adult')
  })
  it('generates plural forms when count > 1, no children', () => {
    expect(buildSearchParamLabel(7, 5, 2, 0, [])).toBe('Today+7 · 5 Nights · 2 Adults')
  })
  it('appends child info when children present', () => {
    expect(buildSearchParamLabel(7, 2, 2, 2, [8, 10])).toBe('Today+7 · 2 Nights · 2 Adults · 2 Children (8, 10)')
  })
  it('uses singular Child when 1 child', () => {
    expect(buildSearchParamLabel(1, 1, 1, 1, [5])).toBe('Today+1 · 1 Night · 1 Adult · 1 Child (5)')
  })
})

describe('getSystemCompSetConfig', () => {
  it('returns defaults when no row exists', async () => {
    mp.systemCompSetConfig.findFirst.mockResolvedValue(null)
    const result = await getSystemCompSetConfig()
    expect(result).toEqual({ maxCompetitorsPerProperty: 5, maxActivePatterns: 4, cronSchedule: '0 3 * * *', enabled: false })
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

describe('getAdminSearchParams', () => {
  beforeEach(() => { mp.compSetSearchParamOverride.findMany.mockResolvedValue([]) })

  it('returns all system params (including toggled-off) when no scope given', async () => {
    mp.compSetSearchParam.findMany.mockResolvedValue([makeParam()])
    const result = await getAdminSearchParams({})
    expect(result).toHaveLength(1)
    expect(result[0]!.tier).toBe('system')
    expect(result[0]!.resolvedIsActive).toBe(true)
    expect(mp.compSetSearchParam.findMany).toHaveBeenCalledWith({
      where: { orgId: null, propertyId: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
  })

  it('returns system (all) + chain (own, isActive=true) for chain scope', async () => {
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([makeParam({ id: 2, orgId: 5, isActive: true })])
    const result = await getAdminSearchParams({ orgId: 5 })
    expect(result).toHaveLength(2)
    expect(result[0]!.tier).toBe('system')
    expect(result[1]!.tier).toBe('chain')
  })

  it('applies org-level override to inherited system param for chain scope', async () => {
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([])
    mp.compSetSearchParamOverride.findMany.mockResolvedValue([
      { searchParamId: 1, orgId: 5, propertyId: null, isActive: false },
    ])
    const result = await getAdminSearchParams({ orgId: 5 })
    expect(result[0]!.resolvedIsActive).toBe(false)
  })

  it('returns system + chain (inherited, all) + hotel (own) for hotel scope', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([makeParam({ id: 2, orgId: 5 })])
      .mockResolvedValueOnce([makeParam({ id: 3, propertyId: 100 })])
    const result = await getAdminSearchParams({ propertyId: 100 })
    expect(result.map(r => r.tier)).toEqual(['system', 'chain', 'hotel'])
  })

  it('property-level override takes precedence over org-level override', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mp.compSetSearchParamOverride.findMany.mockResolvedValue([
      { searchParamId: 1, orgId: 5, propertyId: null, isActive: false },
      { searchParamId: 1, orgId: null, propertyId: 100, isActive: true },
    ])
    const result = await getAdminSearchParams({ propertyId: 100 })
    expect(result[0]!.resolvedIsActive).toBe(true)
  })
})

describe('getEffectiveSearchParams', () => {
  beforeEach(() => { mp.compSetSearchParamOverride.findMany.mockResolvedValue([]) })

  it('returns only active params (merges system + chain + hotel)', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([makeParam({ id: 2, orgId: 5 })])
      .mockResolvedValueOnce([makeParam({ id: 3, propertyId: 100 })])
    const result = await getEffectiveSearchParams(100)
    expect(result.map(r => r.tier)).toEqual(['system', 'chain', 'hotel'])
    expect(result).toHaveLength(3)
  })

  it('excludes params where resolved isActive is false (override)', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mp.compSetSearchParamOverride.findMany.mockResolvedValue([
      { searchParamId: 1, orgId: null, propertyId: 100, isActive: false },
    ])
    const result = await getEffectiveSearchParams(100)
    expect(result).toHaveLength(0)
  })

  it('hotel re-activates a param deactivated at system level via property override', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1, isActive: false })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mp.compSetSearchParamOverride.findMany.mockResolvedValue([
      { searchParamId: 1, orgId: null, propertyId: 100, isActive: true },
    ])
    const result = await getEffectiveSearchParams(100)
    expect(result).toHaveLength(1)
    expect(result[0]!.resolvedIsActive).toBe(true)
  })

  it('handles property with no organization', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: null })
    mp.compSetSearchParam.findMany
      .mockResolvedValueOnce([makeParam({ id: 1 })])
      .mockResolvedValueOnce([makeParam({ id: 3, propertyId: 100 })])
    const result = await getEffectiveSearchParams(100)
    expect(result.map(r => r.tier)).toEqual(['system', 'hotel'])
  })
})

describe('createSearchParam', () => {
  it('creates a system param and generates label', async () => {
    mp.compSetSearchParam.create.mockResolvedValue({
      id: 10, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, children: 0, childAges: '[]',
      label: 'Today+7 · 5 Nights · 2 Adults', sortOrder: 0,
    })
    const result = await createSearchParam({}, { offsetDays: 7, nights: 5, adults: 2, children: 0, childAges: [] })
    expect(mp.compSetSearchParam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ label: 'Today+7 · 5 Nights · 2 Adults', orgId: null, propertyId: null }),
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
    expect(result[0]!.name).toBe('Hotel A')
    expect(result[1]!.lastFetchAt).toBe('2026-05-21T10:00:00.000Z')
    expect(mp.compSetCompetitor.findMany).toHaveBeenCalledWith({ where: { propertyId: 100 }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
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
    mp.compSetSearchParam.findUnique.mockResolvedValue({ id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 5, adults: 2, children: 0, childAges: '[]', label: 'old', sortOrder: 0 })
    mp.compSetSearchParam.update.mockResolvedValue({ id: 1, orgId: null, propertyId: null, offsetDays: 7, nights: 3, adults: 2, children: 0, childAges: '[]', label: 'Today+7 · 3 Nights · 2 Adults', sortOrder: 0 })
    const result = await updateSearchParam(1, { nights: 3 })
    expect(result).not.toBeNull()
    expect(mp.compSetSearchParam.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ nights: 3, label: 'Today+7 · 3 Nights · 2 Adults' }),
    })
    expect(result?.tier).toBe('system')
  })
})

describe('deleteSearchParam', () => {
  it('returns false when id not found', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(null)
    const result = await deleteSearchParam(999)
    expect(result).toBe(false)
    expect(mp.compSetSearchParam.update).not.toHaveBeenCalled()
  })
  it('soft-deletes by setting isActive=false', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(makeParam({ id: 1 }))
    mp.compSetSearchParam.update.mockResolvedValue(makeParam({ id: 1, isActive: false }))
    const result = await deleteSearchParam(1)
    expect(result).toBe(true)
    expect(mp.compSetSearchParam.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { isActive: false },
    })
    expect(mp.compSetSearchParam.delete).not.toHaveBeenCalled()
  })
})

describe('updateSearchParamActive', () => {
  it('returns null when param not found', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(null)
    const result = await updateSearchParamActive(999, { orgId: null, propertyId: null }, false)
    expect(result).toBeNull()
  })

  it('updates isActive directly for own param (same tier)', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(makeParam({ id: 1, orgId: null, propertyId: null }))
    mp.compSetSearchParam.update.mockResolvedValue(makeParam({ id: 1, isActive: false }))
    const result = await updateSearchParamActive(1, { orgId: null, propertyId: null }, false)
    expect(mp.compSetSearchParam.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { isActive: false } })
    if (result && !('error' in result)) expect(result.resolvedIsActive).toBe(false)
    expect(mp.compSetSearchParamOverride.create).not.toHaveBeenCalled()
  })

  it('creates an override when toggling an inherited param', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(makeParam({ id: 1, orgId: null, propertyId: null }))
    mp.compSetSearchParamOverride.findFirst.mockResolvedValue(null)
    mp.compSetSearchParamOverride.create.mockResolvedValue({ id: 10, searchParamId: 1, orgId: null, propertyId: 100, isActive: false })
    const result = await updateSearchParamActive(1, { orgId: null, propertyId: 100 }, false)
    expect(mp.compSetSearchParamOverride.create).toHaveBeenCalledWith({
      data: { searchParamId: 1, orgId: null, propertyId: 100, isActive: false },
    })
    expect(mp.compSetSearchParam.update).not.toHaveBeenCalled()
    if (result && !('error' in result)) expect(result.resolvedIsActive).toBe(false)
  })

  it('ignores scope orgId when propertyId is set (property-level override uses orgId=null)', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(makeParam({ id: 1, orgId: null, propertyId: null }))
    mp.compSetSearchParamOverride.findFirst.mockResolvedValue(null)
    mp.compSetSearchParamOverride.create.mockResolvedValue({ id: 11, searchParamId: 1, orgId: null, propertyId: 100, isActive: false })
    // scope has orgId=5 but propertyId=100 — override must store orgId=null
    const result = await updateSearchParamActive(1, { orgId: 5, propertyId: 100 }, false)
    expect(mp.compSetSearchParamOverride.create).toHaveBeenCalledWith({
      data: { searchParamId: 1, orgId: null, propertyId: 100, isActive: false },
    })
    if (result && !('error' in result)) expect(result.resolvedIsActive).toBe(false)
  })

  it('updates existing override instead of creating a new one', async () => {
    mp.compSetSearchParam.findUnique.mockResolvedValue(makeParam({ id: 1, orgId: null, propertyId: null }))
    mp.compSetSearchParamOverride.findFirst.mockResolvedValue({ id: 10, searchParamId: 1, orgId: null, propertyId: 100, isActive: false })
    mp.compSetSearchParamOverride.update.mockResolvedValue({ id: 10, isActive: true })
    // Limit check mocks: property has orgId=5, no config overrides, system default=4, 0 currently active
    mp.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mp.compSetConfig.findFirst.mockResolvedValue(null)
    mp.systemCompSetConfig.findFirst.mockResolvedValue({ maxActivePatterns: 4 })
    mp.compSetSearchParam.findMany.mockResolvedValue([])
    mp.compSetSearchParamOverride.findMany.mockResolvedValue([])
    const result = await updateSearchParamActive(1, { orgId: null, propertyId: 100 }, true)
    expect(mp.compSetSearchParamOverride.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { isActive: true } })
    expect(mp.compSetSearchParamOverride.create).not.toHaveBeenCalled()
    if (result && !('error' in result)) expect(result.resolvedIsActive).toBe(true)
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
