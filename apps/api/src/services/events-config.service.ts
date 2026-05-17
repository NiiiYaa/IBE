import { prisma } from '../db/client.js'
import { encryptApiKey, maskApiKey, decryptApiKey } from './ai-config.service.js'
import type { EventsConfigResponse, EventsConfigUpdate } from '@ibe/shared'

export async function getSystemEventsConfig(): Promise<EventsConfigResponse> {
  const row = await prisma.systemEventsConfig.findFirst()
  return {
    apiKeySet: !!row?.apiKey,
    apiKeyMasked: row?.apiKey ? maskApiKey(row.apiKey) : null,
    credentialsLocked: false,
    enforceChildCreds: row?.enforceChildCreds ?? false,
    enabled: row?.enabled ?? false,
    radiusKm: row?.radiusKm ?? 10,
    maxEvents: row?.maxEvents ?? 10,
    systemServiceDisabled: false,
    hasOwnConfig: !!row,
    stripDefaultFolded: row?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: row?.stripAutoFoldSecs ?? 15,
    showBookButton: row?.showBookButton ?? true,
  }
}

export async function upsertSystemEventsConfig(data: EventsConfigUpdate): Promise<EventsConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.clearApiKey) { update.apiKey = null }
  else if (data.apiKey !== undefined && data.apiKey !== '') update.apiKey = encryptApiKey(data.apiKey)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.enforceChildCreds !== undefined) update.enforceChildCreds = data.enforceChildCreds
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxEvents !== undefined) update.maxEvents = data.maxEvents
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs
  if (data.showBookButton !== undefined) update.showBookButton = data.showBookButton

  const existing = await prisma.systemEventsConfig.findFirst()
  if (existing) {
    await prisma.systemEventsConfig.update({ where: { id: existing.id }, data: update })
  } else {
    await prisma.systemEventsConfig.create({ data: { enabled: false, radiusKm: 10, maxEvents: 10, stripDefaultFolded: false, stripAutoFoldSecs: 15, ...update } })
  }
  return getSystemEventsConfig()
}

export async function getEventsConfig(orgId: number): Promise<EventsConfigResponse> {
  const [row, sysRow] = await Promise.all([
    prisma.orgEventsConfig.findUnique({ where: { organizationId: orgId } }),
    prisma.systemEventsConfig.findFirst(),
  ])
  return {
    apiKeySet: !!(row?.apiKey),
    apiKeyMasked: row?.apiKey ? maskApiKey(row.apiKey) : null,
    credentialsLocked: sysRow?.enforceChildCreds ?? false,
    enforceChildCreds: row?.enforceChildCreds ?? false,
    enabled: row?.enabled ?? false,
    radiusKm: row?.radiusKm ?? sysRow?.radiusKm ?? 10,
    maxEvents: row?.maxEvents ?? sysRow?.maxEvents ?? 10,
    systemServiceDisabled: row?.systemServiceDisabled ?? false,
    hasOwnConfig: !!row,
    stripDefaultFolded: row?.stripDefaultFolded ?? sysRow?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: row?.stripAutoFoldSecs ?? sysRow?.stripAutoFoldSecs ?? 15,
    showBookButton: row?.showBookButton ?? sysRow?.showBookButton ?? true,
  }
}

export async function upsertEventsConfig(orgId: number, data: EventsConfigUpdate): Promise<EventsConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.clearApiKey) { update.apiKey = null }
  else if (data.apiKey !== undefined && data.apiKey !== '') update.apiKey = encryptApiKey(data.apiKey)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.enforceChildCreds !== undefined) update.enforceChildCreds = data.enforceChildCreds
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxEvents !== undefined) update.maxEvents = data.maxEvents
  if (data.systemServiceDisabled !== undefined) update.systemServiceDisabled = data.systemServiceDisabled
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs
  if (data.showBookButton !== undefined) update.showBookButton = data.showBookButton

  await prisma.orgEventsConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  return getEventsConfig(orgId)
}

export interface ResolvedEventsConfig {
  apiKey: string | null
  enabled: boolean
  radiusKm: number
  maxEvents: number
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
  showBookButton: boolean
}

export async function getResolvedEventsConfig(propertyId: number, fallbackOrgId?: number): Promise<ResolvedEventsConfig> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId ?? fallbackOrgId
  const [orgRow, sysRow] = await Promise.all([
    orgId ? prisma.orgEventsConfig.findUnique({ where: { organizationId: orgId } }) : null,
    prisma.systemEventsConfig.findFirst(),
  ])

  if (orgRow?.systemServiceDisabled) {
    return { apiKey: null, enabled: false, radiusKm: 10, maxEvents: 10, stripDefaultFolded: false, stripAutoFoldSecs: 15, showBookButton: true }
  }

  // Credential resolution — enforceChildCreds forces a specific level's key
  let encApiKey: string | null
  if (sysRow?.enforceChildCreds) {
    encApiKey = sysRow.apiKey ?? null
  } else if (orgRow?.enforceChildCreds) {
    encApiKey = orgRow.apiKey ?? null
  } else {
    encApiKey = orgRow?.apiKey ?? sysRow?.apiKey ?? null
  }

  const settingsRow = orgRow ?? sysRow
  return {
    apiKey: encApiKey ? decryptApiKey(encApiKey) : null,
    enabled: settingsRow?.enabled ?? false,
    radiusKm: settingsRow?.radiusKm ?? 10,
    maxEvents: settingsRow?.maxEvents ?? 10,
    stripDefaultFolded: settingsRow?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: settingsRow?.stripAutoFoldSecs ?? 15,
    showBookButton: settingsRow?.showBookButton ?? true,
  }
}
