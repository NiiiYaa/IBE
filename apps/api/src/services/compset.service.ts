import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'
import { resolveAIConfig } from './ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import type {
  SystemCompSetConfig,
  CompSetConfig,
  CompSetSearchParam,
  CompSetSearchParamCreate,
  CompSetCompetitor,
  CompSetCompetitorCreate,
  CompSetCompetitorUpdate,
  CompSetRoomMapping,
  CompSetRoomMappingUpsert,
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
    maxActivePatterns: row?.maxActivePatterns ?? 4,
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
        maxActivePatterns: data.maxActivePatterns ?? 4,
        cronSchedule: data.cronSchedule ?? '0 3 * * *',
        enabled: data.enabled ?? false,
      } })
  return {
    maxCompetitorsPerProperty: row.maxCompetitorsPerProperty,
    maxActivePatterns: row.maxActivePatterns,
    cronSchedule: row.cronSchedule,
    enabled: row.enabled,
  }
}

// ── CompSetConfig (chain/hotel overrides) ─────────────────────────────────────

async function resolveMaxActivePatterns(orgId: number | null, propertyId: number | null): Promise<number> {
  if (propertyId !== null) {
    const prop = await prisma.compSetConfig.findFirst({ where: { propertyId } })
    if (prop?.maxActivePatterns != null) return prop.maxActivePatterns
  }
  if (orgId !== null) {
    const chain = await prisma.compSetConfig.findFirst({ where: { orgId, propertyId: null } })
    if (chain?.maxActivePatterns != null) return chain.maxActivePatterns
  }
  const sys = await prisma.systemCompSetConfig.findFirst()
  return sys?.maxActivePatterns ?? 4
}

export async function getCompSetConfig(scope: { orgId: number | null; propertyId: number | null }): Promise<CompSetConfig> {
  const where = scope.propertyId !== null
    ? { propertyId: scope.propertyId }
    : { orgId: scope.orgId, propertyId: null as null }
  const [row, resolved] = await Promise.all([
    prisma.compSetConfig.findFirst({ where }),
    resolveMaxActivePatterns(scope.orgId, scope.propertyId),
  ])
  return { maxActivePatterns: row?.maxActivePatterns ?? null, resolvedMaxActivePatterns: resolved }
}

export async function upsertCompSetConfig(
  scope: { orgId: number | null; propertyId: number | null },
  data: { maxActivePatterns?: number | null },
): Promise<CompSetConfig> {
  const where = scope.propertyId !== null
    ? { propertyId: scope.propertyId }
    : { orgId: scope.orgId, propertyId: null as null }
  const existing = await prisma.compSetConfig.findFirst({ where })
  if (existing) {
    await prisma.compSetConfig.update({ where: { id: existing.id }, data })
  } else {
    await prisma.compSetConfig.create({ data: { ...scope, ...data } })
  }
  const resolved = await resolveMaxActivePatterns(scope.orgId, scope.propertyId)
  return { maxActivePatterns: data.maxActivePatterns ?? null, resolvedMaxActivePatterns: resolved }
}

// ── CompSetSearchParam ────────────────────────────────────────────────────────

type Tier = 'system' | 'chain' | 'hotel'

type OverrideRow = { searchParamId: number; orgId: number | null; propertyId: number | null; isActive: boolean }

function resolveIsActive(
  paramId: number,
  paramOwnIsActive: boolean,
  overrides: OverrideRow[],
  scope: { orgId: number | null; propertyId: number | null },
): boolean {
  if (scope.propertyId !== null) {
    const hit = overrides.find(o => o.searchParamId === paramId && o.propertyId === scope.propertyId)
    if (hit) return hit.isActive
  }
  if (scope.orgId !== null) {
    const hit = overrides.find(o => o.searchParamId === paramId && o.orgId === scope.orgId && o.propertyId === null)
    if (hit) return hit.isActive
  }
  return paramOwnIsActive
}

function toParam(row: {
  id: number; orgId: number | null; propertyId: number | null;
  offsetDays: number; nights: number; adults: number; children: number; childAges: string;
  label: string; sortOrder: number; isActive: boolean;
}, tier: Tier, resolvedIsActive: boolean): CompSetSearchParam {
  return {
    id: row.id, orgId: row.orgId, propertyId: row.propertyId,
    offsetDays: row.offsetDays, nights: row.nights, adults: row.adults,
    children: row.children, childAges: JSON.parse(row.childAges) as number[],
    label: row.label, sortOrder: row.sortOrder, tier,
    isActive: row.isActive,
    resolvedIsActive,
  }
}

export async function getScopedSearchParams(scope: { orgId?: number | null; propertyId?: number | null }): Promise<CompSetSearchParam[]> {
  if (scope.propertyId) {
    const rows = await prisma.compSetSearchParam.findMany({ where: { propertyId: scope.propertyId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
    return rows.map(r => toParam(r, 'hotel', r.isActive))
  }
  if (scope.orgId) {
    const rows = await prisma.compSetSearchParam.findMany({ where: { orgId: scope.orgId, propertyId: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
    return rows.map(r => toParam(r, 'chain', r.isActive))
  }
  const rows = await prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  return rows.map(r => toParam(r, 'system', r.isActive))
}

export async function getAdminSearchParams(scope: { orgId?: number | null; propertyId?: number | null }): Promise<CompSetSearchParam[]> {
  const propertyId = scope.propertyId ?? null
  const orgId = scope.orgId ?? null

  if (propertyId !== null) {
    const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
    const propOrgId = prop?.organizationId ?? null

    const [systemRows, chainRows, hotelRows, overrides] = await Promise.all([
      prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      propOrgId ? prisma.compSetSearchParam.findMany({ where: { orgId: propOrgId, propertyId: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }) : Promise.resolve([]),
      prisma.compSetSearchParam.findMany({ where: { propertyId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      prisma.compSetSearchParamOverride.findMany({
        where: { OR: [{ propertyId }, ...(propOrgId ? [{ orgId: propOrgId, propertyId: null }] : [])] },
      }),
    ])

    const resolveScope = { orgId: propOrgId, propertyId }
    return [
      ...systemRows.map(r => toParam(r, 'system', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
      ...chainRows.map(r => toParam(r, 'chain', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
      ...hotelRows.map(r => toParam(r, 'hotel', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
    ]
  }

  if (orgId !== null) {
    const [systemRows, chainRows, overrides] = await Promise.all([
      prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      prisma.compSetSearchParam.findMany({ where: { orgId, propertyId: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      prisma.compSetSearchParamOverride.findMany({ where: { orgId, propertyId: null } }),
    ])

    const resolveScope = { orgId, propertyId: null }
    return [
      ...systemRows.map(r => toParam(r, 'system', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
      ...chainRows.map(r => toParam(r, 'chain', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
    ]
  }

  // System level — own params only (all, including toggled-off)
  const rows = await prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  return rows.map(r => toParam(r, 'system', r.isActive))
}

export async function getEffectiveSearchParams(propertyId: number): Promise<CompSetSearchParam[]> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId ?? null

  const [systemRows, chainRows, hotelRows, overrides] = await Promise.all([
    prisma.compSetSearchParam.findMany({ where: { orgId: null, propertyId: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    orgId ? prisma.compSetSearchParam.findMany({ where: { orgId, propertyId: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }) : Promise.resolve([]),
    prisma.compSetSearchParam.findMany({ where: { propertyId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.compSetSearchParamOverride.findMany({
      where: { OR: [{ propertyId }, ...(orgId ? [{ orgId, propertyId: null }] : [])] },
    }),
  ])

  const resolveScope = { orgId, propertyId }
  const all = [
    ...systemRows.map(r => toParam(r, 'system', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
    ...chainRows.map(r => toParam(r, 'chain', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
    ...hotelRows.map(r => toParam(r, 'hotel', resolveIsActive(r.id, r.isActive, overrides, resolveScope))),
  ]

  return all.filter(p => p.resolvedIsActive)
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
  return toParam(row, tier, row.isActive)
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
  return toParam(updated, tier, updated.isActive)
}

export async function deleteSearchParam(id: number): Promise<boolean> {
  const existing = await prisma.compSetSearchParam.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.compSetSearchParam.update({ where: { id }, data: { isActive: false } })
  return true
}

export async function updateSearchParamActive(
  id: number,
  scope: { orgId: number | null; propertyId: number | null },
  isActive: boolean,
): Promise<CompSetSearchParam | { error: string } | null> {
  const param = await prisma.compSetSearchParam.findUnique({ where: { id } })
  if (!param) return null

  if (isActive && scope.propertyId !== null) {
    const [prop, effectiveParams] = await Promise.all([
      prisma.property.findUnique({ where: { propertyId: scope.propertyId }, select: { organizationId: true } }),
      getEffectiveSearchParams(scope.propertyId),
    ])
    const orgId = prop?.organizationId ?? null
    const max = await resolveMaxActivePatterns(orgId, scope.propertyId)
    const currentActive = effectiveParams.filter(p => p.resolvedIsActive)
    const thisAlreadyActive = currentActive.some(p => p.id === id)
    if (!thisAlreadyActive && currentActive.length >= max) {
      return { error: `Maximum active patterns (${max}) reached. Deactivate another pattern first.` }
    }
  }

  const paramTier: Tier = param.propertyId ? 'hotel' : param.orgId ? 'chain' : 'system'
  const scopeTier: Tier = scope.propertyId ? 'hotel' : scope.orgId ? 'chain' : 'system'

  if (paramTier === scopeTier) {
    // Own param — update isActive directly (admin UI shows all params regardless of isActive)
    const updated = await prisma.compSetSearchParam.update({ where: { id }, data: { isActive } })
    return toParam(updated, paramTier, updated.isActive)
  }

  // Inherited param — upsert override for this scope.
  // Property-level overrides are keyed by (searchParamId, propertyId) only — orgId is irrelevant
  // when propertyId is set, because propertyId already uniquely identifies the scope.
  // Chain-level overrides (propertyId=null) are keyed by (searchParamId, orgId).
  const overrideWhere = scope.propertyId !== null
    ? { searchParamId: id, propertyId: scope.propertyId }
    : { searchParamId: id, orgId: scope.orgId, propertyId: null as null }
  const overrideData = scope.propertyId !== null
    ? { searchParamId: id, orgId: null as null, propertyId: scope.propertyId, isActive }
    : { searchParamId: id, orgId: scope.orgId, propertyId: null as null, isActive }

  const existingOverride = await prisma.compSetSearchParamOverride.findFirst({ where: overrideWhere })
  if (existingOverride) {
    await prisma.compSetSearchParamOverride.update({ where: { id: existingOverride.id }, data: { isActive } })
  } else {
    await prisma.compSetSearchParamOverride.create({ data: overrideData })
  }

  return toParam(param, paramTier, isActive)
}

// ── CompSetCompetitor ─────────────────────────────────────────────────────────

function toCompetitor(row: {
  id: number; propertyId: number; name: string; searchUrl: string | null;
  sortOrder: number; status: string; lastFetchAt: Date | null; errorMsg: string | null;
  comparisonMode: string;
}): CompSetCompetitor {
  return {
    id: row.id, propertyId: row.propertyId, name: row.name, searchUrl: row.searchUrl,
    sortOrder: row.sortOrder, status: row.status as CompSetCompetitor['status'],
    lastFetchAt: row.lastFetchAt?.toISOString() ?? null,
    errorMsg: row.errorMsg,
    comparisonMode: (row.comparisonMode ?? 'cheapest') as CompSetCompetitor['comparisonMode'],
  }
}

export async function listCompetitors(propertyId: number): Promise<CompSetCompetitor[]> {
  const rows = await prisma.compSetCompetitor.findMany({ where: { propertyId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
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

// ── CompSetRoomMapping ────────────────────────────────────────────────────────

export async function getRoomMappings(competitorId: number): Promise<CompSetRoomMapping[]> {
  const rows = await prisma.compSetRoomMapping.findMany({ where: { competitorId }, orderBy: { id: 'asc' } })
  return rows.map(r => ({
    id: r.id, competitorId: r.competitorId,
    compRoomName: r.compRoomName, ownRoomName: r.ownRoomName,
  }))
}

export async function replaceRoomMappings(
  competitorId: number,
  mappings: CompSetRoomMappingUpsert[],
): Promise<CompSetRoomMapping[]> {
  await prisma.$transaction([
    prisma.compSetRoomMapping.deleteMany({ where: { competitorId } }),
    prisma.compSetRoomMapping.createMany({
      data: mappings.map(m => ({ competitorId, compRoomName: m.compRoomName, ownRoomName: m.ownRoomName })),
    }),
  ])
  return getRoomMappings(competitorId)
}

function wordOverlapScore(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\W+/).filter(Boolean))
  return b.toLowerCase().split(/\W+/).filter(w => aWords.has(w)).length
}

function closestOwnRoom(candidate: string, ownNames: string[]): string {
  if (ownNames.includes(candidate)) return candidate
  const scored = ownNames.map(o => ({ name: o, score: wordOverlapScore(candidate, o) }))
  scored.sort((a, b) => b.score - a.score)
  return scored[0]!.name
}

async function aiMapRooms(
  compNames: string[],
  ownNames: string[],
  orgId: number | null,
): Promise<Record<string, string>> {
  try {
    const aiConfig = await resolveAIConfig(undefined, orgId ?? undefined)
    if (!aiConfig) return {}

    const ownList = ownNames.map((r, i) => `${i + 1}. "${r}"`).join('\n')
    const prompt = `You are a hotel room matching expert. Assign each competitor room to the best matching own hotel room.

COMPETITOR ROOMS:
${compNames.map((r, i) => `${i + 1}. ${r}`).join('\n')}

OWN HOTEL ROOMS (copy values EXACTLY as shown — do not paraphrase or invent new names):
${ownList}

Match by room tier and type (suite→suite, double/standard→standard, penthouse→most premium available).
Return a JSON object: keys = competitor room names, values = own hotel room names copied verbatim from the list above.
Every competitor room must appear as a key.
Return ONLY the JSON object.`

    const adapter = getProviderAdapter(aiConfig.provider)
    const response = await adapter.call(
      [{ role: 'user', content: prompt }],
      [],
      'You are a hotel room matching expert. Return only valid JSON with exact room names.',
      aiConfig.apiKey,
      aiConfig.model,
    )
    if (response.stopReason === 'error' || !response.text) return {}
    const jsonText = response.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const raw = JSON.parse(jsonText) as Record<string, string>
    // Resolve any hallucinated values to the closest actual own room
    const resolved: Record<string, string> = {}
    for (const [comp, suggested] of Object.entries(raw)) {
      resolved[comp] = closestOwnRoom(suggested, ownNames)
    }
    logger.info({ resolved }, '[CompSet] aiMapRooms resolved')
    return resolved
  } catch (err) {
    logger.warn({ err }, '[CompSet] aiMapRooms failed')
    return {}
  }
}

export async function autoMapRooms(
  competitorId: number,
  compRooms: Array<{ roomName: string }>,
  ownRooms: Array<{ roomName: string }>,
): Promise<CompSetRoomMapping[]> {
  if (ownRooms.length === 0 || compRooms.length === 0) return []

  const compNames = compRooms.map(r => r.roomName)
  const ownNames = ownRooms.map(r => r.roomName)

  const competitor = await prisma.compSetCompetitor.findUnique({
    where: { id: competitorId },
    include: { property: { select: { organizationId: true } } },
  })
  const orgId = competitor?.property?.organizationId ?? null

  const aiSuggestions = await aiMapRooms(compNames, ownNames, orgId)

  const mappings: CompSetRoomMappingUpsert[] = compNames.map(compName => ({
    compRoomName: compName,
    ownRoomName: aiSuggestions[compName] ?? closestOwnRoom(compName, ownNames),
  }))

  return replaceRoomMappings(competitorId, mappings)
}
