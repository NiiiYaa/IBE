import { prisma } from '../db/client.js'
import type {
  ExternalIBEConfigRow,
  ExternalIBEConfigUpdate,
  EffectiveExternalIBEConfig,
} from '@ibe/shared'

// ── buildExternalUrl ──────────────────────────────────────────────────────

export function buildExternalUrl(
  template: string,
  params: Record<string, string | number | null | undefined>,
): string {
  let result = template
  for (const [key, val] of Object.entries(params)) {
    if (val !== null && val !== undefined) {
      result = result.replaceAll(`{${key}}`, String(val))
    }
  }
  // Strip query params whose token was not replaced (value was null/missing)
  const qIdx = result.indexOf('?')
  if (qIdx === -1) return result
  const base = result.slice(0, qIdx)
  const kept = result.slice(qIdx + 1).split('&').filter(pair => !/\{[^}]+\}/.test(pair))
  return kept.length > 0 ? `${base}?${kept.join('&')}` : base
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toRow(row: {
  id: number
  organizationId: number | null
  propertyId: number | null
  searchTemplate: string | null
  bookingTemplate: string | null
  searchSampleUrls: unknown
  bookingSampleUrls: unknown
  externalHotelId: string | null
  mcpEnabled: boolean
  affiliateEnabled: boolean
  widgetEnabled: boolean
  createdAt: Date
  updatedAt: Date
}): ExternalIBEConfigRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    propertyId: row.propertyId,
    searchTemplate: row.searchTemplate,
    bookingTemplate: row.bookingTemplate,
    searchSampleUrls: Array.isArray(row.searchSampleUrls) ? (row.searchSampleUrls as string[]) : [],
    bookingSampleUrls: Array.isArray(row.bookingSampleUrls) ? (row.bookingSampleUrls as string[]) : [],
    externalHotelId: row.externalHotelId,
    mcpEnabled: row.mcpEnabled,
    affiliateEnabled: row.affiliateEnabled,
    widgetEnabled: row.widgetEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function getExternalIBEConfig(
  scope: { orgId?: number; propertyId?: number },
): Promise<ExternalIBEConfigRow | null> {
  const where = scope.propertyId !== undefined
    ? { propertyId: scope.propertyId }
    : { organizationId: scope.orgId }
  const row = await prisma.externalIBEConfig.findUnique({ where })
  return row ? toRow(row) : null
}

export async function upsertExternalIBEConfig(
  scope: { orgId?: number; propertyId?: number },
  data: ExternalIBEConfigUpdate,
): Promise<ExternalIBEConfigRow> {
  const where = scope.propertyId !== undefined
    ? { propertyId: scope.propertyId }
    : { organizationId: scope.orgId }

  const create = scope.propertyId !== undefined
    ? { ...data, propertyId: scope.propertyId }
    : { ...data, organizationId: scope.orgId! }

  const row = await prisma.externalIBEConfig.upsert({
    where,
    create,
    update: data,
  })
  return toRow(row)
}

export async function deleteExternalIBEConfig(
  scope: { orgId?: number; propertyId?: number },
): Promise<void> {
  const where = scope.propertyId !== undefined
    ? { propertyId: scope.propertyId }
    : { organizationId: scope.orgId }
  await prisma.externalIBEConfig.delete({ where })
}

// ── Resolver ──────────────────────────────────────────────────────────────

export async function getEffectiveExternalIBEConfig(
  propertyId: number,
): Promise<EffectiveExternalIBEConfig | null> {
  const [hotelRow, property] = await Promise.all([
    prisma.externalIBEConfig.findUnique({ where: { propertyId } }),
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
  ])

  if (!property) return null

  const chainRow = property.organizationId
    ? await prisma.externalIBEConfig.findUnique({ where: { organizationId: property.organizationId } })
    : null

  // Standalone hotel (no chain config)
  if (!chainRow) {
    if (!hotelRow) return null
    return {
      searchTemplate: hotelRow.searchTemplate,
      bookingTemplate: hotelRow.bookingTemplate,
      externalHotelId: hotelRow.externalHotelId,
      mcpEnabled: hotelRow.mcpEnabled,
      affiliateEnabled: hotelRow.affiliateEnabled,
      widgetEnabled: hotelRow.widgetEnabled,
    }
  }

  // Chain-member hotel with no hotel row → use chain as-is
  if (!hotelRow) {
    return {
      searchTemplate: chainRow.searchTemplate,
      bookingTemplate: chainRow.bookingTemplate,
      externalHotelId: null,
      mcpEnabled: chainRow.mcpEnabled,
      affiliateEnabled: chainRow.affiliateEnabled,
      widgetEnabled: chainRow.widgetEnabled,
    }
  }

  // Hotel has own templates → full override
  if (hotelRow.searchTemplate || hotelRow.bookingTemplate) {
    return {
      searchTemplate: hotelRow.searchTemplate ?? chainRow.searchTemplate,
      bookingTemplate: hotelRow.bookingTemplate ?? chainRow.bookingTemplate,
      externalHotelId: hotelRow.externalHotelId,
      mcpEnabled: hotelRow.mcpEnabled,
      affiliateEnabled: hotelRow.affiliateEnabled,
      widgetEnabled: hotelRow.widgetEnabled,
    }
  }

  // Hotel only has externalHotelId → merge with chain templates
  return {
    searchTemplate: chainRow.searchTemplate,
    bookingTemplate: chainRow.bookingTemplate,
    externalHotelId: hotelRow.externalHotelId,
    mcpEnabled: hotelRow.mcpEnabled,
    affiliateEnabled: hotelRow.affiliateEnabled,
    widgetEnabled: hotelRow.widgetEnabled,
  }
}
