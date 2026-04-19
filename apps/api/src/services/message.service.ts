import type { MessageRule } from '@ibe/shared'
import { prisma } from '../db/client.js'
import { getOverridesForProperty } from './property-override.service.js'

function toMessageRule(row: {
  id: number; name: string; enabled: boolean; channels: string
  trigger: string; offsetValue: number; offsetUnit: string; direction: string; createdAt: Date
  propertyId: number | null
}, propertyEnabled?: boolean | null): MessageRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    channels: (() => { try { return JSON.parse(row.channels) } catch { return [] } })(),
    trigger: row.trigger as MessageRule['trigger'],
    offsetValue: row.offsetValue,
    offsetUnit: row.offsetUnit as MessageRule['offsetUnit'],
    direction: row.direction as MessageRule['direction'],
    createdAt: row.createdAt.toISOString(),
    propertyId: row.propertyId,
    isGlobal: row.propertyId === null,
    propertyEnabled: propertyEnabled ?? null,
  }
}

export async function listMessageRules(organizationId: number, propertyId?: number | null): Promise<MessageRule[]> {
  const where = propertyId != null
    ? { organizationId, deletedAt: null, OR: [{ propertyId: null }, { propertyId }] }
    : { organizationId, deletedAt: null, propertyId: null }
  const rows = await prisma.messageRule.findMany({ where, orderBy: { createdAt: 'asc' } })

  if (propertyId != null && rows.length > 0) {
    const overrides = await getOverridesForProperty('message_rule', propertyId, rows.map(r => r.id))
    return rows.map(row => toMessageRule(row, overrides.has(row.id) ? overrides.get(row.id) : null))
  }
  return rows.map(row => toMessageRule(row))
}

export async function createMessageRule(organizationId: number, data: {
  name: string; enabled?: boolean; channels: string[]
  trigger: string; offsetValue?: number; offsetUnit?: string; direction?: string
  propertyId?: number | null
}): Promise<MessageRule> {
  const row = await prisma.messageRule.create({
    data: {
      organizationId,
      propertyId: data.propertyId ?? null,
      name: data.name,
      enabled: data.enabled ?? true,
      channels: JSON.stringify(data.channels),
      trigger: data.trigger,
      offsetValue: data.offsetValue ?? 0,
      offsetUnit: data.offsetUnit ?? 'hours',
      direction: data.direction ?? 'after',
    },
  })
  return toMessageRule(row)
}

export async function updateMessageRule(organizationId: number, id: number, data: {
  name?: string; enabled?: boolean; channels?: string[]
  trigger?: string; offsetValue?: number; offsetUnit?: string; direction?: string
}): Promise<MessageRule> {
  const row = await prisma.messageRule.update({
    where: { id, organizationId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.channels !== undefined && { channels: JSON.stringify(data.channels) }),
      ...(data.trigger !== undefined && { trigger: data.trigger }),
      ...(data.offsetValue !== undefined && { offsetValue: data.offsetValue }),
      ...(data.offsetUnit !== undefined && { offsetUnit: data.offsetUnit }),
      ...(data.direction !== undefined && { direction: data.direction }),
    },
  })
  return toMessageRule(row)
}

export async function deleteMessageRule(organizationId: number, id: number): Promise<void> {
  await prisma.messageRule.update({ where: { id, organizationId }, data: { deletedAt: new Date(), enabled: false } })
}

export async function getMessageRuleOrg(id: number): Promise<number | null> {
  const row = await prisma.messageRule.findUnique({ where: { id }, select: { organizationId: true } })
  return row?.organizationId ?? null
}
