import { prisma } from '../db/client.js'
import type { WeatherConfigResponse, WeatherConfigUpdate, WeatherUnits } from '@ibe/shared'

function rowToResponse(row: {
  units: string
  forecastDays: number
  enabled: boolean
  systemServiceDisabled?: boolean
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
} | null, hasOwnConfig = false): WeatherConfigResponse {
  return {
    units: (row?.units ?? 'celsius') as WeatherUnits,
    forecastDays: row?.forecastDays ?? 7,
    enabled: row?.enabled ?? true,
    systemServiceDisabled: row?.systemServiceDisabled ?? false,
    hasOwnConfig,
    stripDefaultFolded: row?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: row?.stripAutoFoldSecs ?? 15,
  }
}

export async function getSystemWeatherConfig(): Promise<WeatherConfigResponse> {
  const row = await prisma.systemWeatherConfig.findFirst()
  return rowToResponse(row)
}

export async function upsertSystemWeatherConfig(data: WeatherConfigUpdate): Promise<WeatherConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.units !== undefined) update.units = data.units
  if (data.forecastDays !== undefined) update.forecastDays = data.forecastDays
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs

  const existing = await prisma.systemWeatherConfig.findFirst()
  const row = existing
    ? await prisma.systemWeatherConfig.update({ where: { id: existing.id }, data: update })
    : await prisma.systemWeatherConfig.create({ data: { units: 'celsius', forecastDays: 7, enabled: true, stripDefaultFolded: false, stripAutoFoldSecs: 15, ...update } })
  return rowToResponse(row)
}

export async function getWeatherConfig(orgId: number): Promise<WeatherConfigResponse> {
  const row = await prisma.orgWeatherConfig.findUnique({ where: { organizationId: orgId } })
  return rowToResponse(row, !!row)
}

export async function upsertWeatherConfig(orgId: number, data: WeatherConfigUpdate): Promise<WeatherConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.units !== undefined) update.units = data.units
  if (data.forecastDays !== undefined) update.forecastDays = data.forecastDays
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.systemServiceDisabled !== undefined) update.systemServiceDisabled = data.systemServiceDisabled
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs

  const row = await prisma.orgWeatherConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  return rowToResponse(row)
}

export interface ResolvedWeatherConfig {
  units: WeatherUnits
  forecastDays: number
  enabled: boolean
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}

export async function getResolvedWeatherConfig(propertyId: number, fallbackOrgId?: number): Promise<ResolvedWeatherConfig> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId ?? fallbackOrgId
  const [orgRow, sysRow] = await Promise.all([
    orgId ? prisma.orgWeatherConfig.findUnique({ where: { organizationId: orgId } }) : null,
    prisma.systemWeatherConfig.findFirst(),
  ])
  if (orgRow?.systemServiceDisabled) {
    return { units: 'celsius', forecastDays: 7, enabled: false, stripDefaultFolded: false, stripAutoFoldSecs: 15 }
  }
  const resolved = orgRow ?? sysRow
  return {
    units: (resolved?.units ?? 'celsius') as WeatherUnits,
    forecastDays: resolved?.forecastDays ?? 7,
    enabled: resolved?.enabled ?? true,
    stripDefaultFolded: resolved?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: resolved?.stripAutoFoldSecs ?? 15,
  }
}
