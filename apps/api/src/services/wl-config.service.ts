import { prisma } from '../db/client.js'
import { encryptApiKey, maskApiKey, decryptApiKey } from './ai-config.service.js'
import { findNearestAirports, type AirportEntry } from '../utils/iata-lookup.js'
import type { WLConfigResponse, WLConfigUpdate, ResolvedWLConfig, NearestAirportsResponse } from '@ibe/shared'

function systemRowToResponse(row: {
  channelUuid: string | null
  enabled: boolean
  enforceChildCreds: boolean
  airportRadiusKm: number
  airportMaxCount: number
  airportDatasetUpdatedAt: Date | null
} | null): WLConfigResponse {
  return {
    channelUuidSet: !!row?.channelUuid,
    channelUuidMasked: row?.channelUuid ? maskApiKey(row.channelUuid) : null,
    enabled: row?.enabled ?? false,
    enforceChildCreds: row?.enforceChildCreds ?? false,
    systemServiceDisabled: false,
    hasOwnConfig: !!row,
    airportRadiusKm: row?.airportRadiusKm ?? 100,
    airportMaxCount: row?.airportMaxCount ?? 3,
    airportDatasetUpdatedAt: row?.airportDatasetUpdatedAt?.toISOString() ?? null,
  }
}

function orgRowToResponse(row: {
  channelUuid: string | null
  enabled: boolean
  enforceChildCreds: boolean
  systemServiceDisabled: boolean
} | null, hasOwnConfig = false): WLConfigResponse {
  return {
    channelUuidSet: !!row?.channelUuid,
    channelUuidMasked: row?.channelUuid ? maskApiKey(row.channelUuid) : null,
    enabled: row?.enabled ?? false,
    enforceChildCreds: row?.enforceChildCreds ?? false,
    systemServiceDisabled: row?.systemServiceDisabled ?? false,
    hasOwnConfig,
    airportRadiusKm: 0,
    airportMaxCount: 0,
    airportDatasetUpdatedAt: null,
  }
}

function propRowToResponse(row: {
  channelUuid: string | null
  enabled: boolean
} | null, hasOwnConfig = false): WLConfigResponse {
  return {
    channelUuidSet: !!row?.channelUuid,
    channelUuidMasked: row?.channelUuid ? maskApiKey(row.channelUuid) : null,
    enabled: row?.enabled ?? false,
    enforceChildCreds: false,
    systemServiceDisabled: false,
    hasOwnConfig,
    airportRadiusKm: 0,
    airportMaxCount: 0,
    airportDatasetUpdatedAt: null,
  }
}

export async function getSystemWLConfig(): Promise<WLConfigResponse> {
  const row = await prisma.systemWLConfig.findFirst()
  return systemRowToResponse(row)
}

export async function upsertSystemWLConfig(data: WLConfigUpdate): Promise<WLConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.channelUuid !== undefined && data.channelUuid !== '') update.channelUuid = encryptApiKey(data.channelUuid)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.enforceChildCreds !== undefined) update.enforceChildCreds = data.enforceChildCreds
  if (data.airportRadiusKm !== undefined) update.airportRadiusKm = data.airportRadiusKm
  if (data.airportMaxCount !== undefined) update.airportMaxCount = data.airportMaxCount

  const existing = await prisma.systemWLConfig.findFirst()
  const row = existing
    ? await prisma.systemWLConfig.update({ where: { id: existing.id }, data: update })
    : await prisma.systemWLConfig.create({ data: { enabled: false, enforceChildCreds: false, ...update } })
  return systemRowToResponse(row)
}

export async function refreshAirportDataset(): Promise<{ count: number; updatedAt: string }> {
  const url = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports-extended.dat'
  const res = await fetch(url)
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

  const now = new Date()
  const existing = await prisma.systemWLConfig.findFirst()
  if (existing) {
    await prisma.systemWLConfig.update({
      where: { id: existing.id },
      data: { airportDataset: entries as unknown as never, airportDatasetUpdatedAt: now },
    })
  } else {
    await prisma.systemWLConfig.create({
      data: { airportDataset: entries as unknown as never, airportDatasetUpdatedAt: now },
    })
  }

  return { count: entries.length, updatedAt: now.toISOString() }
}

export async function getOrgWLConfig(orgId: number): Promise<WLConfigResponse> {
  const row = await prisma.orgWLConfig.findUnique({ where: { organizationId: orgId } })
  return orgRowToResponse(row, !!row)
}

export async function upsertOrgWLConfig(orgId: number, data: WLConfigUpdate): Promise<WLConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.channelUuid !== undefined && data.channelUuid !== '') update.channelUuid = encryptApiKey(data.channelUuid)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.enforceChildCreds !== undefined) update.enforceChildCreds = data.enforceChildCreds
  if (data.systemServiceDisabled !== undefined) update.systemServiceDisabled = data.systemServiceDisabled

  const row = await prisma.orgWLConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  return orgRowToResponse(row, true)
}

export async function getPropertyWLConfig(propertyId: number): Promise<WLConfigResponse> {
  const row = await prisma.propertyWLConfig.findUnique({ where: { propertyId } })
  return propRowToResponse(row, !!row)
}

export async function upsertPropertyWLConfig(propertyId: number, data: WLConfigUpdate): Promise<WLConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.channelUuid !== undefined && data.channelUuid !== '') update.channelUuid = encryptApiKey(data.channelUuid)
  if (data.enabled !== undefined) update.enabled = data.enabled

  const row = await prisma.propertyWLConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...update },
    update,
  })
  return propRowToResponse(row, true)
}

async function getPropertyLatLng(propertyId: number): Promise<{ lat: number; lng: number } | null> {
  const dpConfig = await prisma.propertyDataProviderConfig.findUnique({
    where: { propertyId },
    select: { lat: true, lng: true },
  })
  if (!dpConfig?.lat || !dpConfig?.lng) return null
  return { lat: dpConfig.lat, lng: dpConfig.lng }
}

async function getSystemDataset(): Promise<{ dataset: AirportEntry[] | undefined; radiusKm: number; maxCount: number }> {
  const sysRow = await prisma.systemWLConfig.findFirst({
    select: { airportDataset: true, airportRadiusKm: true, airportMaxCount: true },
  })
  const dataset = sysRow?.airportDataset ? (sysRow.airportDataset as unknown as AirportEntry[]) : undefined
  return {
    dataset,
    radiusKm: sysRow?.airportRadiusKm ?? 100,
    maxCount: sysRow?.airportMaxCount ?? 3,
  }
}

export async function getResolvedWLConfig(propertyId: number, fallbackOrgId?: number): Promise<ResolvedWLConfig> {
  const prop = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  const orgId = prop?.organizationId ?? fallbackOrgId

  const dpConfig = await prisma.propertyDataProviderConfig.findUnique({
    where: { propertyId },
    select: { lat: true, lng: true },
  })

  const [sysRow, orgRow, propRow] = await Promise.all([
    prisma.systemWLConfig.findFirst(),
    orgId ? prisma.orgWLConfig.findUnique({ where: { organizationId: orgId } }) : null,
    prisma.propertyWLConfig.findUnique({ where: { propertyId } }),
  ])

  let channelUuid: string | null = null
  let enabled = false

  if (sysRow?.enforceChildCreds) {
    channelUuid = sysRow.channelUuid ? decryptApiKey(sysRow.channelUuid) : null
    enabled = sysRow.enabled
  } else if (!orgRow?.channelUuid && orgRow?.systemServiceDisabled) {
    return { channelUuid: null, enabled: false, iataCode: null }
  } else if (orgRow?.enforceChildCreds) {
    const uuid = orgRow.channelUuid ?? sysRow?.channelUuid ?? null
    channelUuid = uuid ? decryptApiKey(uuid) : null
    enabled = orgRow.enabled
  } else if (propRow?.channelUuid) {
    channelUuid = decryptApiKey(propRow.channelUuid)
    enabled = propRow.enabled
  } else {
    const uuid = orgRow?.channelUuid ?? sysRow?.channelUuid ?? null
    channelUuid = uuid ? decryptApiKey(uuid) : null
    enabled = orgRow?.enabled ?? sysRow?.enabled ?? false
  }

  let iataCode: string | null = null
  if (channelUuid && enabled && dpConfig?.lat && dpConfig?.lng) {
    const { dataset, radiusKm, maxCount } = await getSystemDataset()
    const nearest = findNearestAirports(dpConfig.lat, dpConfig.lng, radiusKm, maxCount, dataset)
    iataCode = nearest[0]?.code ?? null
  }

  return { channelUuid, enabled, iataCode }
}

export async function getNearestAirports(propertyId: number): Promise<NearestAirportsResponse> {
  const coords = await getPropertyLatLng(propertyId)
  if (!coords) return { airports: [] }

  const { dataset, radiusKm, maxCount } = await getSystemDataset()
  const airports = findNearestAirports(coords.lat, coords.lng, radiusKm, maxCount, dataset)
  return { airports }
}
