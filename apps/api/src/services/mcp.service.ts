import { randomUUID } from 'node:crypto'
import { prisma } from '../db/client.js'

export type McpScope = { kind: 'org'; orgId: number } | { kind: 'property'; propertyId: number }

export interface McpConfigRecord {
  enabled: boolean
  apiKey: string
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
  const org = await prisma.orgMcpConfig.findUnique({ where: { apiKey } })
  if (org?.enabled) return { kind: 'org', orgId: org.organizationId }
  const prop = await prisma.propertyMcpConfig.findUnique({ where: { apiKey } })
  if (prop?.enabled) return { kind: 'property', propertyId: prop.propertyId }
  return null
}
