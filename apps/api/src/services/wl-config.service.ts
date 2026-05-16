import { prisma } from '../db/client.js'
import { encryptApiKey, maskApiKey, decryptApiKey } from './ai-config.service.js'
import { getNearestAirportCode } from './airport-config.service.js'
import type { WLConfigResponse, WLConfigUpdate, ResolvedWLConfig } from '@ibe/shared'

function systemRowToResponse(row: {
  channelUuid: string | null
  enabled: boolean
  enforceChildCreds: boolean
} | null): WLConfigResponse {
  return {
    channelUuidSet: !!row?.channelUuid,
    channelUuidMasked: row?.channelUuid ? maskApiKey(row.channelUuid) : null,
    enabled: row?.enabled ?? false,
    enforceChildCreds: row?.enforceChildCreds ?? false,
    systemServiceDisabled: false,
    hasOwnConfig: !!row,
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

  const existing = await prisma.systemWLConfig.findFirst()
  const row = existing
    ? await prisma.systemWLConfig.update({ where: { id: existing.id }, data: update })
    : await prisma.systemWLConfig.create({ data: { enabled: false, enforceChildCreds: false, ...update } })
  return systemRowToResponse(row)
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

export async function getResolvedWLConfig(propertyId: number, fallbackOrgId?: number): Promise<ResolvedWLConfig> {
  const [prop] = await Promise.all([
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
  ])
  const orgId = prop?.organizationId ?? fallbackOrgId

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
  if (channelUuid && enabled) {
    iataCode = await getNearestAirportCode(propertyId)
  }

  return { channelUuid, enabled, iataCode }
}
