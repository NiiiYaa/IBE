import { prisma } from '../db/client.js'
import { findNearestAirports, type AirportEntry } from '../utils/iata-lookup.js'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'
import type {
  AirportConfigResponse, AirportConfigUpdate, ResolvedAirportConfig, NearestAirportsResponse
} from '@ibe/shared'

const SYS_DEFAULTS = { enabled: false, radiusKm: 100, maxCount: 3, stripDefaultFolded: false, stripAutoFoldSecs: 0 }

function sysToResponse(row: {
  enabled: boolean; radiusKm: number; maxCount: number;
  stripDefaultFolded: boolean; stripAutoFoldSecs: number;
  airportDatasetUpdatedAt: Date | null
} | null): AirportConfigResponse {
  return {
    enabled: row?.enabled ?? SYS_DEFAULTS.enabled,
    radiusKm: row?.radiusKm ?? SYS_DEFAULTS.radiusKm,
    maxCount: row?.maxCount ?? SYS_DEFAULTS.maxCount,
    stripDefaultFolded: row?.stripDefaultFolded ?? SYS_DEFAULTS.stripDefaultFolded,
    stripAutoFoldSecs: row?.stripAutoFoldSecs ?? SYS_DEFAULTS.stripAutoFoldSecs,
    hasOwnConfig: !!row,
    datasetUpdatedAt: row?.airportDatasetUpdatedAt?.toISOString() ?? null,
  }
}

function childToResponse(
  row: { enabled: boolean | null; radiusKm: number | null; maxCount: number | null } | null,
  parent: AirportConfigResponse,
  hasOwn: boolean
): AirportConfigResponse {
  return {
    enabled: row?.enabled ?? parent.enabled,
    radiusKm: row?.radiusKm ?? parent.radiusKm,
    maxCount: row?.maxCount ?? parent.maxCount,
    stripDefaultFolded: parent.stripDefaultFolded,
    stripAutoFoldSecs: parent.stripAutoFoldSecs,
    hasOwnConfig: hasOwn,
    datasetUpdatedAt: null,
  }
}

export async function getSystemAirportConfig(): Promise<AirportConfigResponse> {
  const row = await prisma.systemAirportConfig.findFirst()
  return sysToResponse(row)
}

export async function upsertSystemAirportConfig(data: AirportConfigUpdate): Promise<AirportConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.enabled !== undefined && data.enabled !== null) update.enabled = data.enabled
  if (data.radiusKm !== undefined && data.radiusKm !== null) update.radiusKm = data.radiusKm
  if (data.maxCount !== undefined && data.maxCount !== null) update.maxCount = data.maxCount
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs

  const existing = await prisma.systemAirportConfig.findFirst()
  const row = existing
    ? await prisma.systemAirportConfig.update({ where: { id: existing.id }, data: update })
    : await prisma.systemAirportConfig.create({ data: update as never })
  return sysToResponse(row)
}

export async function refreshAirportDataset(): Promise<{ count: number; updatedAt: string }> {
  const url = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports-extended.dat'
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Failed to fetch airports: ${res.status}`)
  const text = await res.text()

  const entries: AirportEntry[] = []
  const seen = new Set<string>()

  for (const line of text.split('\n')) {
    const parts = line.split(',').map((p: string) => p.replace(/^"|"$/g, '').trim())
    const name = parts[1] ?? ''
    const iata = parts[4] ?? ''
    const lat = parseFloat(parts[6] ?? '')
    const lng = parseFloat(parts[7] ?? '')
    const type = parts[12] ?? ''
    if (type !== 'airport') continue
    if (name === 'All Airports') continue
    if (!iata || iata === '\\N' || !/^[A-Z]{3}$/.test(iata) || isNaN(lat) || isNaN(lng)) continue
    if (seen.has(iata)) continue
    seen.add(iata)
    entries.push({ code: iata, name, lat, lng })
  }

  if (entries.length < 1000) throw new Error(`Unexpectedly small airport dataset: ${entries.length} entries`)

  const now = new Date()
  const existing = await prisma.systemAirportConfig.findFirst()
  if (existing) {
    await prisma.systemAirportConfig.update({
      where: { id: existing.id },
      data: { airportDataset: entries as unknown as never, airportDatasetUpdatedAt: now },
    })
  } else {
    await prisma.systemAirportConfig.create({
      data: { airportDataset: entries as unknown as never, airportDatasetUpdatedAt: now },
    })
  }

  return { count: entries.length, updatedAt: now.toISOString() }
}

export async function getOrgAirportConfig(orgId: number): Promise<AirportConfigResponse> {
  const [sys, row] = await Promise.all([
    getSystemAirportConfig(),
    prisma.orgAirportConfig.findUnique({ where: { organizationId: orgId } }),
  ])
  return childToResponse(row, sys, !!row)
}

export async function upsertOrgAirportConfig(orgId: number, data: AirportConfigUpdate): Promise<AirportConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.enabled !== undefined) update.enabled = data.enabled  // allow null
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxCount !== undefined) update.maxCount = data.maxCount

  const row = await prisma.orgAirportConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  const sys = await getSystemAirportConfig()
  return childToResponse(row, sys, true)
}

export async function getPropertyAirportConfig(propertyId: number): Promise<AirportConfigResponse> {
  const [prop, row] = await Promise.all([
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
    prisma.propertyAirportConfig.findUnique({ where: { propertyId } }),
  ])
  const orgId = prop?.organizationId
  const sys = await getSystemAirportConfig()
  const orgRow = orgId ? await prisma.orgAirportConfig.findUnique({ where: { organizationId: orgId } }) : null
  const orgResolved = childToResponse(orgRow, sys, !!orgRow)
  return childToResponse(row, orgResolved, !!row)
}

export async function upsertPropertyAirportConfig(propertyId: number, data: AirportConfigUpdate): Promise<AirportConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxCount !== undefined) update.maxCount = data.maxCount

  const row = await prisma.propertyAirportConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...update },
    update,
  })
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId
  const sys = await getSystemAirportConfig()
  const orgRow = orgId ? await prisma.orgAirportConfig.findUnique({ where: { organizationId: orgId } }) : null
  const orgResolved = childToResponse(orgRow, sys, !!orgRow)
  return childToResponse(row, orgResolved, true)
}

export async function getResolvedAirportConfig(propertyId: number): Promise<ResolvedAirportConfig> {
  const [prop, propRow] = await Promise.all([
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
    prisma.propertyAirportConfig.findUnique({ where: { propertyId } }),
  ])
  const orgId = prop?.organizationId

  const [sysRow, orgRow] = await Promise.all([
    prisma.systemAirportConfig.findFirst(),
    orgId ? prisma.orgAirportConfig.findUnique({ where: { organizationId: orgId } }) : Promise.resolve(null),
  ])

  const sys = sysToResponse(sysRow)
  const org = childToResponse(orgRow ?? null, sys, !!orgRow)
  const resolved = childToResponse(propRow ?? null, org, !!propRow)

  return { enabled: resolved.enabled, radiusKm: resolved.radiusKm, maxCount: resolved.maxCount }
}

async function getSystemDataset(): Promise<AirportEntry[] | undefined> {
  const row = await prisma.systemAirportConfig.findFirst({
    select: { airportDataset: true },
  })
  return row?.airportDataset ? (row.airportDataset as unknown as AirportEntry[]) : undefined
}

export async function getNearestAirports(propertyId: number): Promise<NearestAirportsResponse> {
  const [resolved, property, sysRow] = await Promise.all([
    getResolvedAirportConfig(propertyId),
    fetchPropertyStatic(propertyId).catch(() => null),
    prisma.systemAirportConfig.findFirst({ select: { stripDefaultFolded: true, stripAutoFoldSecs: true } }),
  ])

  const stripDefaultFolded = sysRow?.stripDefaultFolded ?? SYS_DEFAULTS.stripDefaultFolded
  const stripAutoFoldSecs = sysRow?.stripAutoFoldSecs ?? SYS_DEFAULTS.stripAutoFoldSecs

  const lat = property?.coordinates?.latitude
  const lng = property?.coordinates?.longitude
  if (!resolved.enabled || !lat || !lng) return { airports: [], stripDefaultFolded, stripAutoFoldSecs }

  const dataset = await getSystemDataset()
  const airports = findNearestAirports(lat, lng, resolved.radiusKm, resolved.maxCount, dataset)
  return { airports, stripDefaultFolded, stripAutoFoldSecs }
}

// Used by WL service to get iataCode for URL building — does NOT check airport display enabled.
export async function getNearestAirportCode(propertyId: number): Promise<string | null> {
  const property = await fetchPropertyStatic(propertyId).catch(() => null)
  const lat = property?.coordinates?.latitude
  const lng = property?.coordinates?.longitude
  if (!lat || !lng) return null

  const resolved = await getResolvedAirportConfig(propertyId)
  const dataset = await getSystemDataset()
  const nearest = findNearestAirports(lat, lng, resolved.radiusKm, resolved.maxCount, dataset)
  return nearest[0]?.code ?? null
}
