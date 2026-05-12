import crypto from 'node:crypto'
import { prisma } from '../db/client.js'
import { encryptApiKey, decryptApiKey } from './ai-config.service.js'
import { cacheGet, cacheSet } from '../utils/cache.js'
import type { AmadeusConfigResponse, AmadeusConfigUpdate } from '@ibe/shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskClientId(encrypted: string | null): string | null {
  if (!encrypted) return null
  const plain = decryptApiKey(encrypted)
  return plain.length <= 8 ? plain + '…' : plain.slice(0, 8) + '…'
}

// ── System level ──────────────────────────────────────────────────────────────

export async function getSystemAmadeusConfig(): Promise<AmadeusConfigResponse> {
  const row = await prisma.systemAmadeusConfig.findFirst()
  return {
    credentialsSet: !!(row?.clientId && row?.clientSecret),
    clientIdMasked: maskClientId(row?.clientId ?? null),
    credentialsLocked: false,
    enabled: row?.enabled ?? false,
    enforceChildCreds: row?.enforceChildCreds ?? false,
    systemServiceDisabled: false,
    hasOwnConfig: !!row,
    tokenUrl: row?.tokenUrl ?? '',
    activitiesUrl: row?.activitiesUrl ?? '',
    radiusKm: row?.radiusKm ?? 10,
    maxActivities: row?.maxActivities ?? 10,
    stripLabel: row?.stripLabel ?? 'Activities & Tours',
    stripMode: (row?.stripMode ?? 'separate') as 'merged' | 'separate',
    stripDefaultFolded: row?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: row?.stripAutoFoldSecs ?? 15,
  }
}

export async function upsertSystemAmadeusConfig(data: AmadeusConfigUpdate): Promise<AmadeusConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.clientId !== undefined && data.clientId !== '') update.clientId = encryptApiKey(data.clientId)
  if (data.clientSecret !== undefined && data.clientSecret !== '') update.clientSecret = encryptApiKey(data.clientSecret)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.enforceChildCreds !== undefined) update.enforceChildCreds = data.enforceChildCreds
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxActivities !== undefined) update.maxActivities = data.maxActivities
  if (data.stripLabel !== undefined) update.stripLabel = data.stripLabel
  if (data.stripMode !== undefined) update.stripMode = data.stripMode
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs
  if (data.tokenUrl !== undefined) update.tokenUrl = data.tokenUrl
  if (data.activitiesUrl !== undefined) update.activitiesUrl = data.activitiesUrl

  const existing = await prisma.systemAmadeusConfig.findFirst()
  if (existing) {
    await prisma.systemAmadeusConfig.update({ where: { id: existing.id }, data: update })
  } else {
    await prisma.systemAmadeusConfig.create({ data: { ...update } as Parameters<typeof prisma.systemAmadeusConfig.create>[0]['data'] })
  }
  return getSystemAmadeusConfig()
}

// ── Org level ─────────────────────────────────────────────────────────────────

export async function getOrgAmadeusConfig(orgId: number): Promise<AmadeusConfigResponse> {
  const [row, sysRow] = await Promise.all([
    prisma.orgAmadeusConfig.findUnique({ where: { organizationId: orgId } }),
    prisma.systemAmadeusConfig.findFirst(),
  ])
  return {
    credentialsSet: !!(row?.clientId && row?.clientSecret),
    clientIdMasked: maskClientId(row?.clientId ?? null),
    credentialsLocked: sysRow?.enforceChildCreds ?? false,
    enabled: row?.enabled ?? false,
    enforceChildCreds: row?.enforceChildCreds ?? false,
    systemServiceDisabled: row?.systemServiceDisabled ?? false,
    hasOwnConfig: !!row,
    tokenUrl: '',
    activitiesUrl: '',
    radiusKm: row?.radiusKm ?? sysRow?.radiusKm ?? 10,
    maxActivities: row?.maxActivities ?? sysRow?.maxActivities ?? 10,
    stripLabel: row?.stripLabel ?? sysRow?.stripLabel ?? 'Activities & Tours',
    stripMode: ((row?.stripMode ?? sysRow?.stripMode ?? 'separate')) as 'merged' | 'separate',
    stripDefaultFolded: row?.stripDefaultFolded ?? sysRow?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: row?.stripAutoFoldSecs ?? sysRow?.stripAutoFoldSecs ?? 15,
  }
}

export async function upsertOrgAmadeusConfig(orgId: number, data: AmadeusConfigUpdate): Promise<AmadeusConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.clientId !== undefined && data.clientId !== '') update.clientId = encryptApiKey(data.clientId)
  if (data.clientSecret !== undefined && data.clientSecret !== '') update.clientSecret = encryptApiKey(data.clientSecret)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.enforceChildCreds !== undefined) update.enforceChildCreds = data.enforceChildCreds
  if (data.systemServiceDisabled !== undefined) update.systemServiceDisabled = data.systemServiceDisabled
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxActivities !== undefined) update.maxActivities = data.maxActivities
  if (data.stripLabel !== undefined) update.stripLabel = data.stripLabel
  if (data.stripMode !== undefined) update.stripMode = data.stripMode
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs

  await prisma.orgAmadeusConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  return getOrgAmadeusConfig(orgId)
}

// ── Property level ────────────────────────────────────────────────────────────

export async function getPropertyAmadeusConfig(propertyId: number): Promise<AmadeusConfigResponse> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId
  const [row, orgRow, sysRow] = await Promise.all([
    prisma.propertyAmadeusConfig.findUnique({ where: { propertyId } }),
    orgId ? prisma.orgAmadeusConfig.findUnique({ where: { organizationId: orgId } }) : null,
    prisma.systemAmadeusConfig.findFirst(),
  ])
  const credLocked = (sysRow?.enforceChildCreds ?? false) || (orgRow?.enforceChildCreds ?? false)
  return {
    credentialsSet: !!(row?.clientId && row?.clientSecret),
    clientIdMasked: maskClientId(row?.clientId ?? null),
    credentialsLocked: credLocked,
    enabled: row?.enabled ?? false,
    enforceChildCreds: false,
    systemServiceDisabled: row?.systemServiceDisabled ?? false,
    hasOwnConfig: !!row,
    tokenUrl: '',
    activitiesUrl: '',
    radiusKm: row?.radiusKm ?? orgRow?.radiusKm ?? sysRow?.radiusKm ?? 10,
    maxActivities: row?.maxActivities ?? orgRow?.maxActivities ?? sysRow?.maxActivities ?? 10,
    stripLabel: row?.stripLabel ?? orgRow?.stripLabel ?? sysRow?.stripLabel ?? 'Activities & Tours',
    stripMode: ((row?.stripMode ?? orgRow?.stripMode ?? sysRow?.stripMode ?? 'separate')) as 'merged' | 'separate',
    stripDefaultFolded: orgRow?.stripDefaultFolded ?? sysRow?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: orgRow?.stripAutoFoldSecs ?? sysRow?.stripAutoFoldSecs ?? 15,
  }
}

export async function upsertPropertyAmadeusConfig(propertyId: number, data: AmadeusConfigUpdate): Promise<AmadeusConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.clientId !== undefined && data.clientId !== '') update.clientId = encryptApiKey(data.clientId)
  if (data.clientSecret !== undefined && data.clientSecret !== '') update.clientSecret = encryptApiKey(data.clientSecret)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.systemServiceDisabled !== undefined) update.systemServiceDisabled = data.systemServiceDisabled
  // nullable overrides: null resets to inherited
  if ('radiusKmOverride' in data) update.radiusKm = data.radiusKmOverride ?? null
  else if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if ('maxActivitiesOverride' in data) update.maxActivities = data.maxActivitiesOverride ?? null
  else if (data.maxActivities !== undefined) update.maxActivities = data.maxActivities
  if ('stripLabelOverride' in data) update.stripLabel = data.stripLabelOverride ?? null
  else if (data.stripLabel !== undefined) update.stripLabel = data.stripLabel
  if ('stripModeOverride' in data) update.stripMode = data.stripModeOverride ?? null
  else if (data.stripMode !== undefined) update.stripMode = data.stripMode

  await prisma.propertyAmadeusConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...update },
    update,
  })
  return getPropertyAmadeusConfig(propertyId)
}

// ── Resolution (used by public routes + AI tool) ──────────────────────────────

export interface ResolvedAmadeusConfig {
  clientId: string
  clientSecret: string
  tokenUrl: string
  activitiesUrl: string
  radiusKm: number
  maxActivities: number
  stripLabel: string
  stripMode: 'merged' | 'separate'
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}

export async function getResolvedAmadeusConfig(
  propertyId: number,
  fallbackOrgId?: number,
): Promise<ResolvedAmadeusConfig | null> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId ?? fallbackOrgId

  const [propRow, orgRow, sysRow] = await Promise.all([
    prisma.propertyAmadeusConfig.findUnique({ where: { propertyId } }),
    orgId ? prisma.orgAmadeusConfig.findUnique({ where: { organizationId: orgId } }) : null,
    prisma.systemAmadeusConfig.findFirst(),
  ])

  // Enable/disable cascade — most restrictive wins
  if (!sysRow?.enabled) return null
  if (orgRow && !orgRow.enabled) return null
  if (orgRow?.systemServiceDisabled) return null
  if (propRow && !propRow.enabled) return null
  if (propRow?.systemServiceDisabled) return null

  // Credential resolution
  let encClientId: string | null
  let encClientSecret: string | null
  if (sysRow.enforceChildCreds) {
    encClientId = sysRow.clientId ?? null
    encClientSecret = sysRow.clientSecret ?? null
  } else if (orgRow?.enforceChildCreds) {
    encClientId = orgRow.clientId ?? null
    encClientSecret = orgRow.clientSecret ?? null
  } else {
    const credSource = [propRow, orgRow, sysRow].find(r => r?.clientId)
    encClientId = credSource?.clientId ?? null
    encClientSecret = credSource?.clientSecret ?? null
  }

  if (!encClientId || !encClientSecret) return null

  return {
    clientId: decryptApiKey(encClientId),
    clientSecret: decryptApiKey(encClientSecret),
    tokenUrl: sysRow.tokenUrl,
    activitiesUrl: sysRow.activitiesUrl,
    radiusKm: propRow?.radiusKm ?? orgRow?.radiusKm ?? sysRow.radiusKm,
    maxActivities: propRow?.maxActivities ?? orgRow?.maxActivities ?? sysRow.maxActivities,
    stripLabel: propRow?.stripLabel ?? orgRow?.stripLabel ?? sysRow.stripLabel,
    stripMode: ((propRow?.stripMode ?? orgRow?.stripMode ?? sysRow.stripMode)) as 'merged' | 'separate',
    stripDefaultFolded: orgRow?.stripDefaultFolded ?? sysRow.stripDefaultFolded,
    stripAutoFoldSecs: orgRow?.stripAutoFoldSecs ?? sysRow.stripAutoFoldSecs,
  }
}

// ── OAuth token (client-credentials flow, Redis-cached) ───────────────────────

export async function getAmadeusToken(tokenUrl: string, clientId: string, clientSecret: string): Promise<string> {
  if (!tokenUrl) throw new Error('Amadeus token URL not configured. Set it in Admin → Events & Activities → Amadeus Discover.')
  const keyHash = crypto.createHash('sha256').update(tokenUrl + clientId + clientSecret).digest('hex').slice(0, 16)
  const cacheKey = `amadeus:token:${keyHash}`
  const cached = await cacheGet<string>(cacheKey)
  if (cached) return cached

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!res.ok) throw new Error(`Amadeus auth failed: ${res.status}`)
  const data = await res.json() as { access_token: string; expires_in: number }
  await cacheSet(cacheKey, data.access_token, Math.max(data.expires_in - 60, 60))
  return data.access_token
}
