import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import type { SystemDataProviderConfig, OrgDataProviderConfig, PropertyDataProviderConfig, DataProviderType } from '@ibe/shared'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

// ── Google Maps URL parser ────────────────────────────────────────────────────

export interface GoogleMapsData {
  cid: string | null   // decimal CID from !1s0x...:0x... segment
  lat: number | null   // from @<lat>,<lng>,<zoom>
  lng: number | null
}

export function parseGoogleMapsUrl(url: string): GoogleMapsData {
  const cidMatch = url.match(/!1s0x[0-9a-f]+:0x([0-9a-f]+)/i)
  let cid: string | null = null
  if (cidMatch) {
    try { cid = BigInt(`0x${cidMatch[1]}`).toString() } catch { /* ignore */ }
  }

  const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  const lat = coordMatch?.[1] ? parseFloat(coordMatch[1]) : null
  const lng = coordMatch?.[2] ? parseFloat(coordMatch[2]) : null

  return { cid, lat, lng }
}

// Keep old export for backwards compat with fetch service
export function parseCidFromGoogleMapsUrl(url: string): string | null {
  return parseGoogleMapsUrl(url).cid
}

// ── Encryption ────────────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  if (!env.DATA_PROVIDER_ENCRYPTION_KEY) {
    logger.warn('[DataProvider] DATA_PROVIDER_ENCRYPTION_KEY not set — credentials encrypted with zero key (insecure, dev only)')
    return Buffer.alloc(32, 0)
  }
  return createHash('sha256').update(env.DATA_PROVIDER_ENCRYPTION_KEY).digest()
}

export function encryptCredential(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptCredential(stored: string): string {
  try {
    const colonIdx = stored.indexOf(':')
    if (colonIdx !== 32) return stored // not encrypted (plain text legacy or no-key mode)
    const key = getEncryptionKey()
    const iv = Buffer.from(stored.slice(0, 32), 'hex')
    const enc = Buffer.from(stored.slice(33), 'hex')
    const decipher = createDecipheriv('aes-256-cbc', key, iv)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch (err) {
    logger.warn({ err }, '[DataProvider] Failed to decrypt credential — returning raw value')
    return stored
  }
}

export function maskLogin(stored: string): string {
  const plain = decryptCredential(stored)
  const atIdx = plain.indexOf('@')
  if (atIdx < 0) return '****'
  return `****${plain.slice(atIdx)}`
}

export function maskPassword(_stored: string): string {
  return '****'
}

// ── Internal effective config (includes decrypted credentials for fetch service) ──

export interface EffectiveDataProviderConfig {
  providerType: DataProviderType
  refreshIntervalDays: number
  enabled: boolean
  login: string | undefined
  password: string | undefined
  cid: string | null
}

// ── Row mappers ───────────────────────────────────────────────────────────────

const SYSTEM_DEFAULTS: SystemDataProviderConfig = {
  providerType: 'dataforseo',
  refreshIntervalDays: 30,
  enabled: false,
  openToAll: true,
  loginSet: false,
  passwordMasked: null,
}

function rowToSystemConfig(row: {
  providerType: string
  refreshIntervalDays: number
  enabled: boolean
  openToAll: boolean
  login: string | null
  password: string | null
}): SystemDataProviderConfig {
  return {
    providerType: row.providerType as DataProviderType,
    refreshIntervalDays: row.refreshIntervalDays,
    enabled: row.enabled,
    openToAll: row.openToAll,
    loginSet: !!row.login,
    passwordMasked: row.password ? maskPassword(row.password) : null,
  }
}

function rowToOrgConfig(row: {
  organizationId: number
  useSystem: boolean
  refreshIntervalDays: number | null
  enabled: boolean | null
  providerType: string | null
  login: string | null
  password: string | null
  systemServiceDisabled: boolean
}): OrgDataProviderConfig {
  return {
    organizationId: row.organizationId,
    useSystem: row.useSystem,
    refreshIntervalDays: row.refreshIntervalDays,
    enabled: row.enabled,
    providerType: (row.providerType as DataProviderType | null) ?? null,
    loginSet: !!row.login,
    passwordMasked: row.password ? maskPassword(row.password) : null,
    systemServiceDisabled: row.systemServiceDisabled,
  }
}

function rowToPropertyConfig(row: {
  propertyId: number
  useOrg: boolean
  refreshIntervalDays: number | null
  enabled: boolean | null
  providerType: string | null
  login: string | null
  password: string | null
  googleMapsUrl: string | null
  lat: number | null
  lng: number | null
  orgServiceDisabled: boolean
}): PropertyDataProviderConfig {
  return {
    propertyId: row.propertyId,
    useOrg: row.useOrg,
    refreshIntervalDays: row.refreshIntervalDays,
    enabled: row.enabled,
    providerType: (row.providerType as DataProviderType | null) ?? null,
    loginSet: !!row.login,
    passwordMasked: row.password ? maskPassword(row.password) : null,
    googleMapsUrl: row.googleMapsUrl,
    lat: row.lat,
    lng: row.lng,
    orgServiceDisabled: row.orgServiceDisabled,
  }
}

// ── System ────────────────────────────────────────────────────────────────────

export async function getSystemConfig(): Promise<SystemDataProviderConfig> {
  const row = await prisma.systemDataProviderConfig.findFirst()
  return row ? rowToSystemConfig(row) : { ...SYSTEM_DEFAULTS }
}

export async function upsertSystemConfig(
  updates: Partial<SystemDataProviderConfig> & { login?: string; password?: string },
): Promise<SystemDataProviderConfig> {
  const existing = await prisma.systemDataProviderConfig.findFirst()
  const data: Record<string, unknown> = {}
  if (updates.providerType !== undefined) data.providerType = updates.providerType
  if (updates.refreshIntervalDays !== undefined) data.refreshIntervalDays = updates.refreshIntervalDays
  if (updates.enabled !== undefined) data.enabled = updates.enabled
  if (updates.openToAll !== undefined) data.openToAll = updates.openToAll
  if (updates.login !== undefined && updates.login !== '') data.login = encryptCredential(updates.login)
  if (updates.password !== undefined && updates.password !== '') data.password = encryptCredential(updates.password)
  if (existing) {
    const row = await prisma.systemDataProviderConfig.update({ where: { id: existing.id }, data })
    return rowToSystemConfig(row)
  }
  const defaults = { providerType: 'dataforseo', refreshIntervalDays: 30, enabled: false, openToAll: true }
  const row = await prisma.systemDataProviderConfig.create({ data: { ...defaults, ...data } })
  return rowToSystemConfig(row)
}

// ── Org ───────────────────────────────────────────────────────────────────────

export async function getOrgConfig(organizationId: number): Promise<OrgDataProviderConfig | null> {
  const row = await prisma.orgDataProviderConfig.findUnique({ where: { organizationId } })
  if (!row) return null
  return rowToOrgConfig(row)
}

export async function upsertOrgConfig(
  organizationId: number,
  updates: Partial<Pick<OrgDataProviderConfig, 'useSystem' | 'refreshIntervalDays' | 'enabled' | 'providerType' | 'systemServiceDisabled'>> & { login?: string; password?: string },
): Promise<OrgDataProviderConfig> {
  const data: Record<string, unknown> = {}
  if (updates.useSystem !== undefined) data.useSystem = updates.useSystem
  if (updates.refreshIntervalDays !== undefined) data.refreshIntervalDays = updates.refreshIntervalDays
  if (updates.enabled !== undefined) data.enabled = updates.enabled
  if (updates.providerType !== undefined) data.providerType = updates.providerType
  if (updates.systemServiceDisabled !== undefined) data.systemServiceDisabled = updates.systemServiceDisabled
  if (updates.login !== undefined && updates.login !== '') data.login = encryptCredential(updates.login)
  if (updates.password !== undefined && updates.password !== '') data.password = encryptCredential(updates.password)

  const row = await prisma.orgDataProviderConfig.upsert({
    where: { organizationId },
    create: { organizationId, useSystem: true, ...data },
    update: data,
  })
  return rowToOrgConfig(row)
}

// ── Property ──────────────────────────────────────────────────────────────────

export async function getPropertyConfig(propertyId: number): Promise<PropertyDataProviderConfig | null> {
  const row = await prisma.propertyDataProviderConfig.findUnique({ where: { propertyId } })
  if (!row) return null
  return rowToPropertyConfig(row)
}

export async function upsertPropertyConfig(
  propertyId: number,
  updates: Partial<Pick<PropertyDataProviderConfig, 'useOrg' | 'refreshIntervalDays' | 'enabled' | 'providerType' | 'orgServiceDisabled' | 'googleMapsUrl'>> & { login?: string; password?: string },
): Promise<PropertyDataProviderConfig> {
  const data: Record<string, unknown> = {}
  if (updates.useOrg !== undefined) data.useOrg = updates.useOrg
  if (updates.refreshIntervalDays !== undefined) data.refreshIntervalDays = updates.refreshIntervalDays
  if (updates.enabled !== undefined) data.enabled = updates.enabled
  if (updates.providerType !== undefined) data.providerType = updates.providerType
  if (updates.orgServiceDisabled !== undefined) data.orgServiceDisabled = updates.orgServiceDisabled
  if (updates.googleMapsUrl !== undefined) {
    const url = updates.googleMapsUrl || null
    data.googleMapsUrl = url
    if (url) {
      const parsed = parseGoogleMapsUrl(url)
      data.lat = parsed.lat
      data.lng = parsed.lng
    } else {
      data.lat = null
      data.lng = null
    }
  }
  if (updates.login !== undefined && updates.login !== '') data.login = encryptCredential(updates.login)
  if (updates.password !== undefined && updates.password !== '') data.password = encryptCredential(updates.password)

  const row = await prisma.propertyDataProviderConfig.upsert({
    where: { propertyId },
    create: { propertyId, useOrg: true, ...data },
    update: data,
  })
  return rowToPropertyConfig(row)
}

// ── Effective (cascade) ───────────────────────────────────────────────────────

export async function getEffectiveConfig(propertyId: number): Promise<EffectiveDataProviderConfig> {
  const property = await prisma.property.findUnique({ where: { propertyId } })
  const [systemRow, orgRow, propRow] = await Promise.all([
    prisma.systemDataProviderConfig.findFirst(),
    property ? prisma.orgDataProviderConfig.findUnique({ where: { organizationId: property.organizationId } }) : null,
    prisma.propertyDataProviderConfig.findUnique({ where: { propertyId } }),
  ])

  const system = systemRow ? rowToSystemConfig(systemRow) : { ...SYSTEM_DEFAULTS }
  const systemAccessible = system.openToAll && !(orgRow?.systemServiceDisabled ?? false)

  const cid = propRow?.googleMapsUrl ? parseCidFromGoogleMapsUrl(propRow.googleMapsUrl) : null

  // property uses own config when useOrg=false OR orgServiceDisabled=true
  if (propRow && (!propRow.useOrg || propRow.orgServiceDisabled)) {
    return {
      providerType: (propRow.providerType as DataProviderType | null) ?? system.providerType,
      refreshIntervalDays: propRow.refreshIntervalDays ?? system.refreshIntervalDays,
      enabled: propRow.enabled ?? system.enabled,
      login: propRow.login ? decryptCredential(propRow.login) : undefined,
      password: propRow.password ? decryptCredential(propRow.password) : undefined,
      cid,
    }
  }

  // org uses own config when useSystem=false OR system not accessible
  if (orgRow && (!orgRow.useSystem || !systemAccessible)) {
    return {
      providerType: (orgRow.providerType as DataProviderType | null) ?? system.providerType,
      refreshIntervalDays: propRow?.refreshIntervalDays ?? orgRow.refreshIntervalDays ?? system.refreshIntervalDays,
      enabled: propRow?.enabled ?? orgRow.enabled ?? system.enabled,
      login: orgRow.login ? decryptCredential(orgRow.login) : undefined,
      password: orgRow.password ? decryptCredential(orgRow.password) : undefined,
      cid,
    }
  }

  // system level — DB credentials take precedence over env vars
  return {
    providerType: system.providerType,
    refreshIntervalDays: propRow?.refreshIntervalDays ?? system.refreshIntervalDays,
    enabled: propRow?.enabled ?? system.enabled,
    login: systemRow?.login ? decryptCredential(systemRow.login) : env.DATAFORSEO_LOGIN,
    password: systemRow?.password ? decryptCredential(systemRow.password) : env.DATAFORSEO_PASSWORD,
    cid,
  }
}
