import type { Campaign } from '@ibe/shared'
import { prisma } from '../db/client.js'
import { getOverridesForProperty } from './property-override.service.js'

function toCampaign(row: {
  id: number; code: string; name: string; email: string | null
  commissionRate: { toNumber(): number } | null
  discountRate: { toNumber(): number } | null
  displayText: string | null
  notes: string | null; isActive: boolean; createdAt: Date
  propertyId: number | null
}, propertyEnabled?: boolean | null): Campaign {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    email: row.email,
    commissionRate: row.commissionRate?.toNumber() ?? null,
    discountRate: row.discountRate?.toNumber() ?? null,
    displayText: row.displayText,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    propertyId: row.propertyId,
    isGlobal: row.propertyId === null,
    propertyEnabled: propertyEnabled ?? null,
  }
}

export async function listCampaigns(organizationId: number, propertyId?: number | null): Promise<Campaign[]> {
  const where = propertyId != null
    ? { organizationId, deletedAt: null, OR: [{ propertyId: null }, { propertyId }] }
    : { organizationId, deletedAt: null, propertyId: null }
  const rows = await prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' } })

  if (propertyId != null && rows.length > 0) {
    const overrides = await getOverridesForProperty('campaign', propertyId, rows.map(r => r.id))
    return rows.map(row => toCampaign(row, overrides.has(row.id) ? overrides.get(row.id) : null))
  }
  return rows.map(row => toCampaign(row))
}

export async function createCampaign(organizationId: number, data: {
  code: string; name: string; email?: string | null
  commissionRate?: number | null; discountRate?: number | null; displayText?: string | null
  notes?: string | null; isActive?: boolean; propertyId?: number | null
}): Promise<Campaign> {
  const row = await prisma.campaign.create({
    data: {
      organizationId,
      propertyId: data.propertyId ?? null,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      email: data.email ?? null,
      commissionRate: data.commissionRate ?? null,
      discountRate: data.discountRate ?? null,
      displayText: data.displayText ?? null,
      notes: data.notes ?? null,
      isActive: data.isActive ?? true,
    },
  })
  return toCampaign(row)
}

export async function updateCampaign(organizationId: number, id: number, data: {
  code?: string; name?: string; email?: string | null
  commissionRate?: number | null; discountRate?: number | null; displayText?: string | null
  notes?: string | null; isActive?: boolean
}): Promise<Campaign> {
  const row = await prisma.campaign.update({
    where: { id, organizationId },
    data: {
      ...(data.code !== undefined && { code: data.code.trim().toUpperCase() }),
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.commissionRate !== undefined && { commissionRate: data.commissionRate }),
      ...(data.discountRate !== undefined && { discountRate: data.discountRate }),
      ...(data.displayText !== undefined && { displayText: data.displayText }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })
  return toCampaign(row)
}

export async function deleteCampaign(organizationId: number, id: number): Promise<void> {
  await prisma.campaign.update({ where: { id, organizationId }, data: { deletedAt: new Date(), isActive: false } })
}

export async function getCampaignOrg(id: number): Promise<number | null> {
  const row = await prisma.campaign.findUnique({ where: { id }, select: { organizationId: true } })
  return row?.organizationId ?? null
}

export async function getActiveCampaign(
  code: string,
  organizationId: number,
  propertyId: number,
): Promise<Campaign | null> {
  const upperCode = code.toUpperCase()
  const row = await prisma.campaign.findFirst({
    where: {
      code: upperCode,
      organizationId,
      deletedAt: null,
      isActive: true,
      OR: [{ propertyId: null }, { propertyId }],
    },
  })
  if (!row) return null

  const overrides = await getOverridesForProperty('campaign', propertyId, [row.id])
  const propertyEnabled = overrides.has(row.id) ? overrides.get(row.id) ?? null : null
  if (propertyEnabled === false) return null

  return toCampaign(row, propertyEnabled)
}
