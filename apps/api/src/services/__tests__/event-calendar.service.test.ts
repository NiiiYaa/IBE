import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemEventCalendarConfig: {
      findFirst: vi.fn(), update: vi.fn(), create: vi.fn(),
    },
    propertyEventCalendarConfig: {
      findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn(),
    },
    eventCalendarEvent: {
      findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(),
    },
    compSetCompetitor: { groupBy: vi.fn() },
    property: { findMany: vi.fn() },
  },
}))

import { prisma } from '../../db/client.js'
import {
  getSystemEventCalendarConfig,
  upsertSystemEventCalendarConfig,
  getPropertyEventCalendarConfig,
  upsertPropertyEventCalendarConfig,
  getPropertyEvents,
  getChainEvents,
  replacePropertyEvents,
  getActiveEventPropertyIds,
} from '../event-calendar.service.js'

const mp = prisma as any

beforeEach(() => { vi.clearAllMocks() })

describe('getSystemEventCalendarConfig', () => {
  it('returns defaults when no row exists', async () => {
    mp.systemEventCalendarConfig.findFirst.mockResolvedValue(null)
    const result = await getSystemEventCalendarConfig()
    expect(result).toEqual({ enabled: false, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
  })

  it('returns stored values', async () => {
    mp.systemEventCalendarConfig.findFirst.mockResolvedValue({
      enabled: true, defaultRadiusKm: 30, cronSchedule: '0 5 * * *',
    })
    const result = await getSystemEventCalendarConfig()
    expect(result.enabled).toBe(true)
    expect(result.defaultRadiusKm).toBe(30)
    expect(result.cronSchedule).toBe('0 5 * * *')
  })
})

describe('upsertSystemEventCalendarConfig', () => {
  it('creates a new row when none exists', async () => {
    mp.systemEventCalendarConfig.findFirst.mockResolvedValue(null)
    mp.systemEventCalendarConfig.create.mockResolvedValue({
      enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *',
    })
    const result = await upsertSystemEventCalendarConfig({ enabled: true })
    expect(mp.systemEventCalendarConfig.create).toHaveBeenCalled()
    expect(result.enabled).toBe(true)
  })

  it('updates existing row', async () => {
    mp.systemEventCalendarConfig.findFirst.mockResolvedValue({ id: 1, enabled: false, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mp.systemEventCalendarConfig.update.mockResolvedValue({
      enabled: false, defaultRadiusKm: 100, cronSchedule: '0 4 * * *',
    })
    const result = await upsertSystemEventCalendarConfig({ defaultRadiusKm: 100 })
    expect(mp.systemEventCalendarConfig.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { defaultRadiusKm: 100 },
    })
    expect(result.defaultRadiusKm).toBe(100)
  })
})

describe('getPropertyEventCalendarConfig', () => {
  it('returns null when no config exists', async () => {
    mp.propertyEventCalendarConfig.findUnique.mockResolvedValue(null)
    const result = await getPropertyEventCalendarConfig(99)
    expect(result).toBeNull()
  })

  it('returns config when found', async () => {
    mp.propertyEventCalendarConfig.findUnique.mockResolvedValue({ propertyId: 5, radiusKm: 25 })
    const result = await getPropertyEventCalendarConfig(5)
    expect(result).toEqual({ propertyId: 5, radiusKm: 25 })
  })
})

describe('upsertPropertyEventCalendarConfig', () => {
  it('calls upsert with correct data', async () => {
    mp.propertyEventCalendarConfig.upsert.mockResolvedValue({ propertyId: 5, radiusKm: 40 })
    const result = await upsertPropertyEventCalendarConfig(5, { radiusKm: 40 })
    expect(mp.propertyEventCalendarConfig.upsert).toHaveBeenCalledWith({
      where: { propertyId: 5 },
      create: { propertyId: 5, radiusKm: 40 },
      update: { radiusKm: 40 },
    })
    expect(result).toEqual({ propertyId: 5, radiusKm: 40 })
  })
})

describe('getPropertyEvents', () => {
  it('queries events overlapping the given window', async () => {
    mp.eventCalendarEvent.findMany.mockResolvedValue([])
    await getPropertyEvents(7, '2026-06-01', '2026-06-30')
    expect(mp.eventCalendarEvent.findMany).toHaveBeenCalledWith({
      where: {
        propertyId: 7,
        startDate: { lte: '2026-06-30' },
        endDate: { gte: '2026-06-01' },
      },
      orderBy: { startDate: 'asc' },
    })
  })

  it('returns mapped events', async () => {
    const row = {
      id: 1, propertyId: 7, fetchedAt: new Date('2026-05-21'),
      periodStart: '2026-06-01', periodEnd: '2026-06-30',
      name: 'Jazz Fest', startDate: '2026-06-10', endDate: '2026-06-12',
      description: 'Annual jazz festival', demandLevel: 'high',
      demandDescription: 'High occupancy expected', createdAt: new Date(),
    }
    mp.eventCalendarEvent.findMany.mockResolvedValue([row])
    const result = await getPropertyEvents(7, '2026-06-01', '2026-06-30')
    expect(result[0]!.fetchedAt).toBe('2026-05-21T00:00:00.000Z')
    expect(result[0]!.name).toBe('Jazz Fest')
  })
})

describe('replacePropertyEvents', () => {
  it('deletes existing and inserts new events', async () => {
    mp.eventCalendarEvent.deleteMany.mockResolvedValue({ count: 3 })
    mp.eventCalendarEvent.createMany.mockResolvedValue({ count: 2 })
    const fetchedAt = new Date()
    const events = [
      {
        name: 'Concert', startDate: '2026-06-05', endDate: '2026-06-05',
        description: 'Big show', demandLevel: 'high' as const, demandDescription: 'Sold out expected',
      },
    ]
    await replacePropertyEvents(5, fetchedAt, '2026-06-01', '2026-06-30', events)
    expect(mp.eventCalendarEvent.deleteMany).toHaveBeenCalledWith({ where: { propertyId: 5 } })
    expect(mp.eventCalendarEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ propertyId: 5, name: 'Concert', fetchedAt })],
    })
  })

  it('calls deleteMany even when events array is empty', async () => {
    mp.eventCalendarEvent.deleteMany.mockResolvedValue({ count: 1 })
    mp.eventCalendarEvent.createMany.mockResolvedValue({ count: 0 })
    await replacePropertyEvents(5, new Date(), '2026-06-01', '2026-06-30', [])
    expect(mp.eventCalendarEvent.deleteMany).toHaveBeenCalled()
    expect(mp.eventCalendarEvent.createMany).toHaveBeenCalledWith({ data: [] })
  })
})

describe('getActiveEventPropertyIds', () => {
  it('returns union of property config IDs and compset competitor IDs', async () => {
    mp.propertyEventCalendarConfig.findMany.mockResolvedValue([{ propertyId: 1 }, { propertyId: 2 }])
    mp.compSetCompetitor.groupBy.mockResolvedValue([{ propertyId: 2 }, { propertyId: 3 }])
    const result = await getActiveEventPropertyIds()
    expect(result.sort()).toEqual([1, 2, 3])
  })
})
