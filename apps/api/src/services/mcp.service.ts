import { randomUUID } from 'node:crypto'
import { prisma } from '../db/client.js'

export type McpScope = { kind: 'org'; orgId: number } | { kind: 'property'; propertyId: number }

export interface McpConfigRecord {
  enabled: boolean
  apiKey: string
}

export interface OrgMcpTokenExpirySettings {
  oauthTokenExpiryDays: number | null
  effectiveTokenExpiryDays: number | null
  tokenExpiryInheritedFromSystem: boolean
}

export async function getSystemMcpConfig(): Promise<{ enabled: boolean; oauthTokenExpiryDays: number | null }> {
  const row = await prisma.systemMcpConfig.findFirst()
  return { enabled: row?.enabled ?? true, oauthTokenExpiryDays: row?.oauthTokenExpiryDays ?? null }
}

export async function setSystemMcpEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
  const existing = await prisma.systemMcpConfig.findFirst()
  const row = existing
    ? await prisma.systemMcpConfig.update({ where: { id: existing.id }, data: { enabled } })
    : await prisma.systemMcpConfig.create({ data: { enabled } })
  return { enabled: row.enabled }
}

export async function setSystemMcpTokenExpiry(days: number | null): Promise<{ enabled: boolean; oauthTokenExpiryDays: number | null }> {
  const existing = await prisma.systemMcpConfig.findFirst()
  const row = existing
    ? await prisma.systemMcpConfig.update({ where: { id: existing.id }, data: { oauthTokenExpiryDays: days } })
    : await prisma.systemMcpConfig.create({ data: { enabled: true, oauthTokenExpiryDays: days } })
  return { enabled: row.enabled, oauthTokenExpiryDays: row.oauthTokenExpiryDays }
}

export async function getOrgMcpTokenExpirySettings(orgId: number): Promise<OrgMcpTokenExpirySettings> {
  const [org, sys] = await Promise.all([
    prisma.orgMcpConfig.findUnique({ where: { organizationId: orgId }, select: { oauthTokenExpiryDays: true } }),
    prisma.systemMcpConfig.findFirst({ select: { oauthTokenExpiryDays: true } }),
  ])
  const orgDays = org?.oauthTokenExpiryDays ?? null
  const sysDays = sys?.oauthTokenExpiryDays ?? null
  const inherited = orgDays === null
  return {
    oauthTokenExpiryDays: orgDays,
    effectiveTokenExpiryDays: inherited ? sysDays : orgDays,
    tokenExpiryInheritedFromSystem: inherited,
  }
}

export async function getEffectiveMcpTokenExpiry(orgId: number): Promise<number | null> {
  const settings = await getOrgMcpTokenExpirySettings(orgId)
  return settings.effectiveTokenExpiryDays
}

export async function setOrgMcpTokenExpiry(orgId: number, days: number | null): Promise<OrgMcpTokenExpirySettings> {
  await prisma.orgMcpConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, enabled: false, apiKey: randomUUID(), oauthTokenExpiryDays: days },
    update: { oauthTokenExpiryDays: days },
  })
  return getOrgMcpTokenExpirySettings(orgId)
}

export async function revokeOrgTokens(orgId: number): Promise<{ tokensRevokedAt: string }> {
  const now = new Date()
  await prisma.orgMcpConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, enabled: false, apiKey: randomUUID(), tokensRevokedAt: now },
    update: { tokensRevokedAt: now },
  })
  return { tokensRevokedAt: now.toISOString() }
}

export async function getMcpConfig(scope: McpScope): Promise<McpConfigRecord | null> {
  if (scope.kind === 'org') {
    const row = await prisma.orgMcpConfig.findUnique({ where: { organizationId: scope.orgId } })
    return row ? { enabled: row.enabled, apiKey: row.apiKey } : null
  }
  const row = await prisma.propertyMcpConfig.findUnique({ where: { propertyId: scope.propertyId } })
  return row ? { enabled: row.enabled, apiKey: row.apiKey } : null
}

export async function upsertMcpConfig(scope: McpScope, enabled: boolean): Promise<McpConfigRecord> {
  if (scope.kind === 'org') {
    const existing = await prisma.orgMcpConfig.findUnique({ where: { organizationId: scope.orgId } })
    const row = await prisma.orgMcpConfig.upsert({
      where: { organizationId: scope.orgId },
      create: { organizationId: scope.orgId, enabled, apiKey: existing?.apiKey ?? randomUUID() },
      update: { enabled },
    })
    return { enabled: row.enabled, apiKey: row.apiKey }
  }
  const existing = await prisma.propertyMcpConfig.findUnique({ where: { propertyId: scope.propertyId } })
  const row = await prisma.propertyMcpConfig.upsert({
    where: { propertyId: scope.propertyId },
    create: { propertyId: scope.propertyId, enabled, apiKey: existing?.apiKey ?? randomUUID() },
    update: { enabled },
  })
  return { enabled: row.enabled, apiKey: row.apiKey }
}

export async function rotateApiKey(scope: McpScope): Promise<McpConfigRecord> {
  const newKey = randomUUID()
  if (scope.kind === 'org') {
    const row = await prisma.orgMcpConfig.upsert({
      where: { organizationId: scope.orgId },
      create: { organizationId: scope.orgId, enabled: false, apiKey: newKey },
      update: { apiKey: newKey },
    })
    return { enabled: row.enabled, apiKey: row.apiKey }
  }
  const row = await prisma.propertyMcpConfig.upsert({
    where: { propertyId: scope.propertyId },
    create: { propertyId: scope.propertyId, enabled: false, apiKey: newKey },
    update: { apiKey: newKey },
  })
  return { enabled: row.enabled, apiKey: row.apiKey }
}

export async function validateApiKey(apiKey: string): Promise<McpScope | null> {
  const [sys, org, prop] = await Promise.all([
    prisma.systemMcpConfig.findFirst({ select: { enabled: true } }),
    prisma.orgMcpConfig.findUnique({ where: { apiKey } }),
    prisma.propertyMcpConfig.findUnique({ where: { apiKey } }),
  ])
  if (sys?.enabled === false) return null
  if (org?.enabled) return { kind: 'org', orgId: org.organizationId }
  if (prop?.enabled) return { kind: 'property', propertyId: prop.propertyId }
  return null
}
