import { prisma } from '../db/client.js'
import type {
  SystemCompSetConfig,
  CompSetSearchParam,
  CompSetSearchParamCreate,
  CompSetCompetitor,
  CompSetCompetitorCreate,
  CompSetCompetitorUpdate,
} from '@ibe/shared'

// ── Label generation ──────────────────────────────────────────────────────────

export function buildSearchParamLabel(offsetDays: number, nights: number, adults: number, children: number, childAges: number[]): string {
  const base = `Today+${offsetDays} · ${nights} Night${nights !== 1 ? 's' : ''} · ${adults} Adult${adults !== 1 ? 's' : ''}`
  if (children === 0) return base
  const agesStr = childAges.length > 0 ? ` (${childAges.join(', ')})` : ''
  return `${base} · ${children} Child${children !== 1 ? 'ren' : ''}${agesStr}`
}

// ── SystemCompSetConfig ───────────────────────────────────────────────────────

export async function getSystemCompSetConfig(): Promise<SystemCompSetConfig> {
  const row = await prisma.systemCompSetConfig.findFirst()
  return {
    maxCompetitorsPerProperty: row?.maxCompetitorsPerProperty ?? 5,
    cronSchedule: row?.cronSchedule ?? '0 3 * * *',
    enabled: row?.enabled ?? false,
  }
}

export async function upsertSystemCompSetConfig(data: Partial<SystemCompSetConfig>): Promise<SystemCompSetConfig> {
  const existing = await prisma.systemCompSetConfig.findFirst()
  const row = existing
    ? await prisma.systemCompSetConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemCompSetConfig.create({ data: {
        maxCompetitorsPerProperty: data.maxCompetitorsPerProperty ?? 5,
        cronSchedule: data.cronSchedule ?? '0 3 * * *',
        enabled: data.enabled ?? false,
      } })
  return {
    maxCompetitorsPerProperty: row.maxCompetitorsPerProperty,
    cronSchedule: row.cronSchedule,
    enabled: row.enabled,
  }
}

// ── CompSetSearchParam ────────────────────────────────────────────────────────

type Tier = 'system' | 'chain' | 'hotel'

function toParam(row: {
  id: number; orgId: number | null; propertyId: number | null;
  offsetDays: number; nights: number; adults: number; children: number; childAges: string;
  label: string; sortOrder: number;
}, tier: Tier): CompSetSearchParam {
  return {
    id: row.id, orgId: row.orgId, propertyId: row.propertyId,
    offsetDays: row.offsetDays, nights: row.nights, adults: row.adults,
    children: row.children, childAges: JSON.parse(row.childAges) as number[],
    label: row.label, sortOrder: row.sortOrder, tier,
  }
}

export async function getScopedSearchParams(scope: { orgId?: number | null; propertyId?: number | null }): Promise<CompSetSearchParam[]> {
  if (scope.propertyId) {
    const rows = await prisma.compSetSearchParam.findMany({ where: { propertyId: scope.propertyId }, orderBy: { sortOrder: 'asc' } })
    return rows.map(r => toParam(r, 'hotel'))
  }
  if (scope.orgId) {
    const rows = await prisma.compSetSearchParam.findMany({ where: { orgId: scope.orgId, propertyId: null }, orderBy: { sortOrder: 'asc' } })
    return rows.map(r => toParam(r, 'chain'))
  }
  const rows = await prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: { sortOrder: 'asc' } })
  return rows.map(r => toParam(r, 'system'))
}

export async function getEffectiveSearchParams(propertyId: number): Promise<CompSetSearchParam[]> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId ?? null

  const [systemRows, chainRows, hotelRows] = await Promise.all([
    prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: { sortOrder: 'asc' } }),
    orgId ? prisma.compSetSearchParam.findMany({ where: { orgId, propertyId: null }, orderBy: { sortOrder: 'asc' } }) : [],
    prisma.compSetSearchParam.findMany({ where: { propertyId }, orderBy: { sortOrder: 'asc' } }),
  ])

  return [
    ...systemRows.map(r => toParam(r, 'system')),
    ...chainRows.map(r => toParam(r, 'chain')),
    ...hotelRows.map(r => toParam(r, 'hotel')),
  ]
}

export async function createSearchParam(scope: { orgId?: number | null; propertyId?: number | null }, data: CompSetSearchParamCreate): Promise<CompSetSearchParam> {
  const label = buildSearchParamLabel(data.offsetDays, data.nights, data.adults, data.children, data.childAges)
  const row = await prisma.compSetSearchParam.create({
    data: {
      orgId: scope.orgId ?? null,
      propertyId: scope.propertyId ?? null,
      offsetDays: data.offsetDays,
      nights: data.nights,
      adults: data.adults,
      children: data.children,
      childAges: JSON.stringify(data.childAges),
      label,
      sortOrder: data.sortOrder ?? 0,
    },
  })
  const tier: Tier = scope.propertyId ? 'hotel' : scope.orgId ? 'chain' : 'system'
  return toParam(row, tier)
}

export async function updateSearchParam(id: number, data: Partial<CompSetSearchParamCreate>): Promise<CompSetSearchParam | null> {
  const existing = await prisma.compSetSearchParam.findUnique({ where: { id } })
  if (!existing) return null
  const children = data.children ?? existing.children
  const childAges = data.childAges ?? (JSON.parse(existing.childAges) as number[])
  const updated = await prisma.compSetSearchParam.update({
    where: { id },
    data: {
      ...(data.offsetDays !== undefined && { offsetDays: data.offsetDays }),
      ...(data.nights !== undefined && { nights: data.nights }),
      ...(data.adults !== undefined && { adults: data.adults }),
      children,
      childAges: JSON.stringify(childAges),
      label: buildSearchParamLabel(
        data.offsetDays ?? existing.offsetDays,
        data.nights ?? existing.nights,
        data.adults ?? existing.adults,
        children,
        childAges,
      ),
    },
  })
  const tier: Tier = updated.propertyId ? 'hotel' : updated.orgId ? 'chain' : 'system'
  return toParam(updated, tier)
}

export async function deleteSearchParam(id: number): Promise<boolean> {
  const existing = await prisma.compSetSearchParam.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.compSetSearchParam.delete({ where: { id } })
  return true
}

// ── CompSetCompetitor ─────────────────────────────────────────────────────────

function toCompetitor(row: {
  id: number; propertyId: number; name: string; searchUrl: string | null;
  sortOrder: number; status: string; lastFetchAt: Date | null; errorMsg: string | null;
}): CompSetCompetitor {
  return {
    id: row.id, propertyId: row.propertyId, name: row.name, searchUrl: row.searchUrl,
    sortOrder: row.sortOrder, status: row.status as CompSetCompetitor['status'],
    lastFetchAt: row.lastFetchAt?.toISOString() ?? null,
    errorMsg: row.errorMsg,
  }
}

export async function listCompetitors(propertyId: number): Promise<CompSetCompetitor[]> {
  const rows = await prisma.compSetCompetitor.findMany({ where: { propertyId }, orderBy: { sortOrder: 'asc' } })
  return rows.map(toCompetitor)
}

export async function createCompetitor(data: CompSetCompetitorCreate): Promise<CompSetCompetitor | { error: string }> {
  const config = await getSystemCompSetConfig()
  const count = await prisma.compSetCompetitor.count({ where: { propertyId: data.propertyId } })
  if (count >= config.maxCompetitorsPerProperty) {
    return { error: `Maximum ${config.maxCompetitorsPerProperty} competitors allowed per property` }
  }
  const row = await prisma.compSetCompetitor.create({
    data: {
      propertyId: data.propertyId,
      name: data.name,
      searchUrl: data.searchUrl ?? null,
      sortOrder: data.sortOrder ?? 0,
    },
  })
  return toCompetitor(row)
}

export async function updateCompetitor(id: number, data: CompSetCompetitorUpdate): Promise<CompSetCompetitor | null> {
  const existing = await prisma.compSetCompetitor.findUnique({ where: { id } })
  if (!existing) return null
  const row = await prisma.compSetCompetitor.update({ where: { id }, data })
  return toCompetitor(row)
}

export async function deleteCompetitor(id: number): Promise<boolean> {
  const existing = await prisma.compSetCompetitor.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.compSetCompetitor.delete({ where: { id } })
  return true
}

export async function getActivePropertyIds(): Promise<number[]> {
  const rows = await prisma.compSetCompetitor.groupBy({ by: ['propertyId'] })
  return rows.map(r => r.propertyId)
}
