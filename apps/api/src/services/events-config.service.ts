import { prisma } from '../db/client.js'
import { encryptApiKey, maskApiKey, decryptApiKey } from './ai-config.service.js'
import type { EventsConfigResponse, EventsConfigUpdate } from '@ibe/shared'

function rowToResponse(row: {
  apiKey: string | null
  enabled: boolean
  radiusKm: number
  maxEvents: number
  systemServiceDisabled?: boolean
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
} | null, hasOwnConfig = false): EventsConfigResponse {
  return {
    apiKeySet: !!row?.apiKey,
    apiKeyMasked: row?.apiKey ? maskApiKey(row.apiKey) : null,
    enabled: row?.enabled ?? false,
    radiusKm: row?.radiusKm ?? 10,
    maxEvents: row?.maxEvents ?? 10,
    systemServiceDisabled: row?.systemServiceDisabled ?? false,
    hasOwnConfig,
    stripDefaultFolded: row?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: row?.stripAutoFoldSecs ?? 15,
  }
}

export async function getSystemEventsConfig(): Promise<EventsConfigResponse> {
  const row = await prisma.systemEventsConfig.findFirst()
  return rowToResponse(row)
}

export async function upsertSystemEventsConfig(data: EventsConfigUpdate): Promise<EventsConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.apiKey !== undefined && data.apiKey !== '') update.apiKey = encryptApiKey(data.apiKey)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxEvents !== undefined) update.maxEvents = data.maxEvents
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs

  const existing = await prisma.systemEventsConfig.findFirst()
  const row = existing
    ? await prisma.systemEventsConfig.update({ where: { id: existing.id }, data: update })
    : await prisma.systemEventsConfig.create({ data: { enabled: false, radiusKm: 10, maxEvents: 10, stripDefaultFolded: false, stripAutoFoldSecs: 15, ...update } })
  return rowToResponse(row)
}

export async function getEventsConfig(orgId: number): Promise<EventsConfigResponse> {
  const row = await prisma.orgEventsConfig.findUnique({ where: { organizationId: orgId } })
  return rowToResponse(row, !!row)
}

export async function upsertEventsConfig(orgId: number, data: EventsConfigUpdate): Promise<EventsConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.apiKey !== undefined && data.apiKey !== '') update.apiKey = encryptApiKey(data.apiKey)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxEvents !== undefined) update.maxEvents = data.maxEvents
  if (data.systemServiceDisabled !== undefined) update.systemServiceDisabled = data.systemServiceDisabled
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs

  const row = await prisma.orgEventsConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  return rowToResponse(row)
}

export interface ResolvedEventsConfig {
  apiKey: string | null
  enabled: boolean
  radiusKm: number
  maxEvents: number
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}

export async function getResolvedEventsConfig(propertyId: number, fallbackOrgId?: number): Promise<ResolvedEventsConfig> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId ?? fallbackOrgId
  const [orgRow, sysRow] = await Promise.all([
    orgId ? prisma.orgEventsConfig.findUnique({ where: { organizationId: orgId } }) : null,
    prisma.systemEventsConfig.findFirst(),
  ])

  if (!orgRow?.apiKey && orgRow?.systemServiceDisabled) {
    return { apiKey: null, enabled: false, radiusKm: 10, maxEvents: 10, stripDefaultFolded: false, stripAutoFoldSecs: 15 }
  }

  const hasOwnKey = !!orgRow?.apiKey
  const resolved = hasOwnKey ? orgRow : (sysRow ?? orgRow)
  const foldRow = orgRow ?? sysRow
  return {
    apiKey: resolved?.apiKey ? decryptApiKey(resolved.apiKey) : null,
    enabled: resolved?.enabled ?? false,
    radiusKm: resolved?.radiusKm ?? 10,
    maxEvents: resolved?.maxEvents ?? 10,
    stripDefaultFolded: foldRow?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: foldRow?.stripAutoFoldSecs ?? 15,
  }
}
