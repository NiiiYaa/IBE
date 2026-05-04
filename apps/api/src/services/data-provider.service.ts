import type { SystemDataProviderConfig, OrgDataProviderConfig, PropertyDataProviderConfig } from '@ibe/shared'
import { prisma } from '../db/client.js'

const SYSTEM_DEFAULTS: SystemDataProviderConfig = {
  providerType: 'dataforseo',
  refreshIntervalDays: 30,
  enabled: false,
}

function rowToSystemConfig(row: { providerType: string; refreshIntervalDays: number; enabled: boolean }): SystemDataProviderConfig {
  return {
    providerType: row.providerType as SystemDataProviderConfig['providerType'],
    refreshIntervalDays: row.refreshIntervalDays,
    enabled: row.enabled,
  }
}

// ── System ────────────────────────────────────────────────────────────────────

export async function getSystemConfig(): Promise<SystemDataProviderConfig> {
  const row = await prisma.systemDataProviderConfig.findFirst()
  return row ? rowToSystemConfig(row) : { ...SYSTEM_DEFAULTS }
}

export async function upsertSystemConfig(updates: Partial<SystemDataProviderConfig>): Promise<SystemDataProviderConfig> {
  const existing = await prisma.systemDataProviderConfig.findFirst()
  const data = {
    ...(updates.providerType !== undefined && { providerType: updates.providerType }),
    ...(updates.refreshIntervalDays !== undefined && { refreshIntervalDays: updates.refreshIntervalDays }),
    ...(updates.enabled !== undefined && { enabled: updates.enabled }),
  }
  if (existing) {
    const row = await prisma.systemDataProviderConfig.update({ where: { id: existing.id }, data })
    return rowToSystemConfig(row)
  }
  const row = await prisma.systemDataProviderConfig.create({ data: { ...SYSTEM_DEFAULTS, ...data } })
  return rowToSystemConfig(row)
}

// ── Org ───────────────────────────────────────────────────────────────────────

export async function getOrgConfig(organizationId: number): Promise<OrgDataProviderConfig | null> {
  const row = await prisma.orgDataProviderConfig.findUnique({ where: { organizationId } })
  if (!row) return null
  return {
    organizationId: row.organizationId,
    useSystem: row.useSystem,
    refreshIntervalDays: row.refreshIntervalDays,
    enabled: row.enabled,
  }
}

export async function upsertOrgConfig(
  organizationId: number,
  updates: Partial<Pick<OrgDataProviderConfig, 'useSystem' | 'refreshIntervalDays' | 'enabled'>>,
): Promise<OrgDataProviderConfig> {
  const data = {
    ...(updates.useSystem !== undefined && { useSystem: updates.useSystem }),
    ...(updates.refreshIntervalDays !== undefined && { refreshIntervalDays: updates.refreshIntervalDays }),
    ...(updates.enabled !== undefined && { enabled: updates.enabled }),
  }
  const row = await prisma.orgDataProviderConfig.upsert({
    where: { organizationId },
    create: { organizationId, useSystem: true, ...data },
    update: data,
  })
  return { organizationId: row.organizationId, useSystem: row.useSystem, refreshIntervalDays: row.refreshIntervalDays, enabled: row.enabled }
}

// ── Property ──────────────────────────────────────────────────────────────────

export async function getPropertyConfig(propertyId: number): Promise<PropertyDataProviderConfig | null> {
  const row = await prisma.propertyDataProviderConfig.findUnique({ where: { propertyId } })
  if (!row) return null
  return { propertyId: row.propertyId, useOrg: row.useOrg, refreshIntervalDays: row.refreshIntervalDays, enabled: row.enabled }
}

export async function upsertPropertyConfig(
  propertyId: number,
  updates: Partial<Pick<PropertyDataProviderConfig, 'useOrg' | 'refreshIntervalDays' | 'enabled'>>,
): Promise<PropertyDataProviderConfig> {
  const data = {
    ...(updates.useOrg !== undefined && { useOrg: updates.useOrg }),
    ...(updates.refreshIntervalDays !== undefined && { refreshIntervalDays: updates.refreshIntervalDays }),
    ...(updates.enabled !== undefined && { enabled: updates.enabled }),
  }
  const row = await prisma.propertyDataProviderConfig.upsert({
    where: { propertyId },
    create: { propertyId, useOrg: true, ...data },
    update: data,
  })
  return { propertyId: row.propertyId, useOrg: row.useOrg, refreshIntervalDays: row.refreshIntervalDays, enabled: row.enabled }
}

// ── Effective (cascade) ───────────────────────────────────────────────────────

export async function getEffectiveConfig(propertyId: number): Promise<SystemDataProviderConfig> {
  const property = await prisma.property.findUnique({ where: { propertyId } })
  const [systemRow, orgRow, propRow] = await Promise.all([
    prisma.systemDataProviderConfig.findFirst(),
    property ? prisma.orgDataProviderConfig.findUnique({ where: { organizationId: property.organizationId } }) : null,
    prisma.propertyDataProviderConfig.findUnique({ where: { propertyId } }),
  ])

  const system = systemRow ? rowToSystemConfig(systemRow) : { ...SYSTEM_DEFAULTS }

  // property overrides org when useOrg=false
  if (propRow && !propRow.useOrg) {
    return {
      providerType: system.providerType,
      refreshIntervalDays: propRow.refreshIntervalDays ?? system.refreshIntervalDays,
      enabled: propRow.enabled ?? system.enabled,
    }
  }

  // org overrides system when useSystem=false
  if (orgRow && !orgRow.useSystem) {
    const orgEnabled = propRow?.enabled ?? orgRow.enabled ?? system.enabled
    const orgInterval = propRow?.refreshIntervalDays ?? orgRow.refreshIntervalDays ?? system.refreshIntervalDays
    return { providerType: system.providerType, refreshIntervalDays: orgInterval, enabled: orgEnabled }
  }

  // system (with optional property-level enabled/interval on top)
  return {
    providerType: system.providerType,
    refreshIntervalDays: propRow?.refreshIntervalDays ?? system.refreshIntervalDays,
    enabled: propRow?.enabled ?? system.enabled,
  }
}
