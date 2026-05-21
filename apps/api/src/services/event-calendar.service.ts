import { prisma } from '../db/client.js'
import type {
  SystemEventCalendarConfig,
  PropertyEventCalendarConfig,
  EventCalendarEvent,
  ChainEventCalendarEvents,
} from '@ibe/shared'

// ── SystemEventCalendarConfig ─────────────────────────────────────────────────

export async function getSystemEventCalendarConfig(): Promise<SystemEventCalendarConfig> {
  const row = await prisma.systemEventCalendarConfig.findFirst()
  return {
    enabled: row?.enabled ?? false,
    defaultRadiusKm: row?.defaultRadiusKm ?? 50,
    cronSchedule: row?.cronSchedule ?? '0 4 * * *',
  }
}

export async function upsertSystemEventCalendarConfig(
  data: Partial<SystemEventCalendarConfig>,
): Promise<SystemEventCalendarConfig> {
  const existing = await prisma.systemEventCalendarConfig.findFirst()
  const row = existing
    ? await prisma.systemEventCalendarConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemEventCalendarConfig.create({
        data: {
          enabled: data.enabled ?? false,
          defaultRadiusKm: data.defaultRadiusKm ?? 50,
          cronSchedule: data.cronSchedule ?? '0 4 * * *',
        },
      })
  return { enabled: row.enabled, defaultRadiusKm: row.defaultRadiusKm, cronSchedule: row.cronSchedule }
}

// ── PropertyEventCalendarConfig ───────────────────────────────────────────────

export async function getPropertyEventCalendarConfig(
  propertyId: number,
): Promise<PropertyEventCalendarConfig | null> {
  const row = await prisma.propertyEventCalendarConfig.findUnique({ where: { propertyId } })
  if (!row) return null
  return { propertyId: row.propertyId, radiusKm: row.radiusKm }
}

export async function upsertPropertyEventCalendarConfig(
  propertyId: number,
  data: { radiusKm: number | null },
): Promise<PropertyEventCalendarConfig> {
  const row = await prisma.propertyEventCalendarConfig.upsert({
    where: { propertyId },
    create: { propertyId, radiusKm: data.radiusKm },
    update: { radiusKm: data.radiusKm },
  })
  return { propertyId: row.propertyId, radiusKm: row.radiusKm }
}

// ── Events ────────────────────────────────────────────────────────────────────

function toEvent(row: {
  id: number; propertyId: number; fetchedAt: Date; periodStart: string; periodEnd: string
  name: string; startDate: string; endDate: string; description: string
  demandLevel: string; demandDescription: string
}): EventCalendarEvent {
  return {
    id: row.id,
    propertyId: row.propertyId,
    fetchedAt: row.fetchedAt.toISOString(),
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    description: row.description,
    demandLevel: row.demandLevel as 'high' | 'medium' | 'low',
    demandDescription: row.demandDescription,
  }
}

export async function getPropertyEvents(
  propertyId: number,
  from: string,
  to: string,
): Promise<EventCalendarEvent[]> {
  const rows = await prisma.eventCalendarEvent.findMany({
    where: {
      propertyId,
      startDate: { lte: to },
      endDate: { gte: from },
    },
    orderBy: { startDate: 'asc' },
  })
  return rows.map(toEvent)
}

export async function getChainEvents(orgId: number): Promise<ChainEventCalendarEvents[]> {
  const properties = await prisma.property.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { propertyId: true },
  })
  const results: ChainEventCalendarEvents[] = []
  for (const { propertyId } of properties) {
    const rows = await prisma.eventCalendarEvent.findMany({
      where: { propertyId },
      orderBy: { startDate: 'asc' },
    })
    results.push({ propertyId, events: rows.map(toEvent) })
  }
  return results
}

export async function replacePropertyEvents(
  propertyId: number,
  fetchedAt: Date,
  periodStart: string,
  periodEnd: string,
  events: Array<{
    name: string; startDate: string; endDate: string
    description: string; demandLevel: 'high' | 'medium' | 'low'; demandDescription: string
  }>,
): Promise<void> {
  await prisma.$transaction([
    prisma.eventCalendarEvent.deleteMany({ where: { propertyId } }),
    prisma.eventCalendarEvent.createMany({
      data: events.map(e => ({
        propertyId, fetchedAt, periodStart, periodEnd,
        name: e.name, startDate: e.startDate, endDate: e.endDate,
        description: e.description, demandLevel: e.demandLevel, demandDescription: e.demandDescription,
      })),
    }),
  ])
}

// ── Active property IDs for cron ──────────────────────────────────────────────

export async function getActiveEventPropertyIds(): Promise<number[]> {
  const [configRows, competitorRows] = await Promise.all([
    prisma.propertyEventCalendarConfig.findMany({ select: { propertyId: true } }),
    prisma.compSetCompetitor.groupBy({ by: ['propertyId'] }),
  ])
  const ids = new Set<number>([
    ...configRows.map(r => r.propertyId),
    ...competitorRows.map(r => r.propertyId),
  ])
  return Array.from(ids)
}
