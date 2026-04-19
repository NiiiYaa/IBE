import type { PromoCode } from '@ibe/shared'
import { prisma } from '../db/client.js'
import { getOverridesForProperty } from './property-override.service.js'

function toPromoCode(row: {
  id: number; code: string; description: string | null
  discountValue: { toNumber(): number }; maxUses: number | null
  validFrom: Date | null; validTo: Date | null
  validDateType: string; isActive: boolean; usesCount: number; createdAt: Date
  propertyId: number | null
}, propertyEnabled?: boolean | null): PromoCode {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    discountValue: row.discountValue.toNumber(),
    maxUses: row.maxUses,
    validFrom: row.validFrom?.toISOString() ?? null,
    validTo: row.validTo?.toISOString() ?? null,
    validDateType: (row.validDateType as PromoCode['validDateType']) ?? 'booking',
    isActive: row.isActive,
    usesCount: row.usesCount,
    createdAt: row.createdAt.toISOString(),
    propertyId: row.propertyId,
    isGlobal: row.propertyId === null,
    propertyEnabled: propertyEnabled ?? null,
  }
}

export async function listPromoCodes(organizationId: number, propertyId?: number | null): Promise<PromoCode[]> {
  const where = propertyId != null
    ? { organizationId, deletedAt: null, OR: [{ propertyId: null }, { propertyId }] }
    : { organizationId, deletedAt: null, propertyId: null }
  const rows = await prisma.promoCode.findMany({ where, orderBy: { createdAt: 'desc' } })

  if (propertyId != null && rows.length > 0) {
    const overrides = await getOverridesForProperty('promo_code', propertyId, rows.map(r => r.id))
    return rows.map(row => toPromoCode(row, overrides.has(row.id) ? overrides.get(row.id) : null))
  }
  return rows.map(row => toPromoCode(row))
}

export async function createPromoCode(organizationId: number, data: {
  code: string
  description?: string | null
  discountValue: number
  maxUses?: number | null
  validFrom?: string | null
  validTo?: string | null
  validDateType?: string
  isActive?: boolean
  propertyId?: number | null
}): Promise<PromoCode> {
  const row = await prisma.promoCode.create({
    data: {
      organizationId,
      propertyId: data.propertyId ?? null,
      code: data.code.toUpperCase(),
      description: data.description ?? null,
      discountType: 'percentage',
      discountValue: data.discountValue,
      maxUses: data.maxUses ?? null,
      validFrom: data.validFrom ? new Date(data.validFrom) : null,
      validTo: data.validTo ? new Date(data.validTo) : null,
      validDateType: data.validDateType ?? 'booking',
      isActive: data.isActive ?? true,
    },
  })
  return toPromoCode(row)
}

export async function updatePromoCode(organizationId: number, id: number, data: {
  code?: string
  description?: string | null
  discountValue?: number
  maxUses?: number | null
  validFrom?: string | null
  validTo?: string | null
  validDateType?: string
  isActive?: boolean
}): Promise<PromoCode> {
  const row = await prisma.promoCode.update({
    where: { id, organizationId },
    data: {
      ...(data.code !== undefined && { code: data.code.toUpperCase() }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.discountValue !== undefined && { discountValue: data.discountValue }),
      ...(data.maxUses !== undefined && { maxUses: data.maxUses }),
      ...(data.validFrom !== undefined && { validFrom: data.validFrom ? new Date(data.validFrom) : null }),
      ...(data.validTo !== undefined && { validTo: data.validTo ? new Date(data.validTo) : null }),
      ...(data.validDateType !== undefined && { validDateType: data.validDateType }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })
  return toPromoCode(row)
}

export async function deletePromoCode(organizationId: number, id: number): Promise<void> {
  await prisma.promoCode.update({ where: { id, organizationId }, data: { deletedAt: new Date(), isActive: false } })
}

export async function getPromoCodeOrg(id: number): Promise<number | null> {
  const row = await prisma.promoCode.findUnique({ where: { id }, select: { organizationId: true } })
  return row?.organizationId ?? null
}

export async function getActivePromoCode(
  code: string,
  organizationId: number,
  propertyId: number,
  checkIn: string,
): Promise<PromoCode | null> {
  const upperCode = code.toUpperCase()
  const row = await prisma.promoCode.findFirst({
    where: {
      code: upperCode,
      organizationId,
      deletedAt: null,
      isActive: true,
      OR: [{ propertyId: null }, { propertyId }],
    },
  })
  if (!row) return null

  const now = new Date()
  const refDate = row.validDateType === 'stay' ? new Date(checkIn) : now

  if (row.validFrom && refDate < row.validFrom) return null
  if (row.validTo && refDate > row.validTo) return null
  if (row.maxUses !== null && row.usesCount >= row.maxUses) return null

  const overrides = propertyId != null
    ? await getOverridesForProperty('promo_code', propertyId, [row.id])
    : new Map<number, boolean>()

  const propertyEnabled = overrides.has(row.id) ? overrides.get(row.id) ?? null : null
  if (propertyEnabled === false) return null

  return toPromoCode(row, propertyEnabled)
}
