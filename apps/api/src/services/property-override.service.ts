import { prisma } from '../db/client.js'

export type OverrideEntityType = 'affiliate' | 'message_rule' | 'promo_code'

export async function setPropertyOverride(
  entityType: OverrideEntityType,
  entityId: number,
  propertyId: number,
  isEnabled: boolean,
): Promise<void> {
  await prisma.propertyItemOverride.upsert({
    where: { entityType_entityId_propertyId: { entityType, entityId, propertyId } },
    create: { entityType, entityId, propertyId, isEnabled },
    update: { isEnabled },
  })
}

export async function getOverridesForProperty(
  entityType: OverrideEntityType,
  propertyId: number,
  entityIds: number[],
): Promise<Map<number, boolean>> {
  if (entityIds.length === 0) return new Map()
  const rows = await prisma.propertyItemOverride.findMany({
    where: { entityType, propertyId, entityId: { in: entityIds } },
  })
  return new Map(rows.map(r => [r.entityId, r.isEnabled]))
}
