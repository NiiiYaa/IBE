import type { OrgOffersSettings, PropertyOffersAdminResponse, UpdateOffersSettingsRequest, BookingMode, MultiRoomLimitBy } from '@ibe/shared'
import { prisma } from '../db/client.js'

const SYSTEM_DEFAULTS = {
  minNights: 1,
  maxNights: 30,
  minRooms: 1,
  maxRooms: 6,
  allowedCancellationPolicies: null as null,
  allowedBoardTypes: null as null,
  allowedChargeParties: null as null,
  allowedPaymentMethods: null as null,
  minOfferValue: null as null,
  minOfferCurrency: 'EUR',
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null
  try { return JSON.parse(value) as T } catch { return null }
}

function rowToSettings(row: {
  minNights: number | null
  maxNights: number | null
  minRooms: number | null
  maxRooms: number | null
  allowedCancellationPolicies: string | null
  allowedBoardTypes: string | null
  allowedChargeParties: string | null
  allowedPaymentMethods: string | null
  minOfferValue: unknown
  minOfferCurrency: string | null
  bookingMode?: string | null
  multiRoomLimitBy?: string | null
}): OrgOffersSettings {
  return {
    minNights: row.minNights,
    maxNights: row.maxNights,
    minRooms: row.minRooms,
    maxRooms: row.maxRooms,
    allowedCancellationPolicies: parseJson(row.allowedCancellationPolicies),
    allowedBoardTypes: parseJson(row.allowedBoardTypes),
    allowedChargeParties: parseJson(row.allowedChargeParties),
    allowedPaymentMethods: parseJson(row.allowedPaymentMethods),
    minOfferValue: row.minOfferValue != null ? Number(row.minOfferValue) : null,
    minOfferCurrency: row.minOfferCurrency,
    bookingMode: (row.bookingMode as BookingMode | null | undefined) ?? null,
    multiRoomLimitBy: (row.multiRoomLimitBy as MultiRoomLimitBy | null | undefined) ?? null,
  }
}

export async function getOrgOffersSettings(organizationId: number): Promise<OrgOffersSettings> {
  const row = await prisma.orgOffersSettings.findUnique({ where: { organizationId } })
  if (!row) {
    return {
      minNights: null, maxNights: null, minRooms: null, maxRooms: null,
      allowedCancellationPolicies: null, allowedBoardTypes: null,
      allowedChargeParties: null, allowedPaymentMethods: null,
      minOfferValue: null, minOfferCurrency: null, bookingMode: null, multiRoomLimitBy: null,
    }
  }
  return rowToSettings(row)
}

export async function upsertOrgOffersSettings(
  organizationId: number,
  updates: UpdateOffersSettingsRequest,
): Promise<OrgOffersSettings> {
  const data: Record<string, unknown> = {}
  if (updates.minNights !== undefined) data.minNights = updates.minNights
  if (updates.maxNights !== undefined) data.maxNights = updates.maxNights
  if (updates.minRooms !== undefined) data.minRooms = updates.minRooms
  if (updates.maxRooms !== undefined) data.maxRooms = updates.maxRooms
  if (updates.allowedCancellationPolicies !== undefined)
    data.allowedCancellationPolicies = updates.allowedCancellationPolicies != null
      ? JSON.stringify(updates.allowedCancellationPolicies)
      : null
  if (updates.allowedBoardTypes !== undefined)
    data.allowedBoardTypes = updates.allowedBoardTypes != null
      ? JSON.stringify(updates.allowedBoardTypes)
      : null
  if (updates.allowedChargeParties !== undefined)
    data.allowedChargeParties = updates.allowedChargeParties != null
      ? JSON.stringify(updates.allowedChargeParties)
      : null
  if (updates.allowedPaymentMethods !== undefined)
    data.allowedPaymentMethods = updates.allowedPaymentMethods != null
      ? JSON.stringify(updates.allowedPaymentMethods)
      : null
  if (updates.minOfferValue !== undefined) data.minOfferValue = updates.minOfferValue
  if (updates.minOfferCurrency !== undefined) data.minOfferCurrency = updates.minOfferCurrency
  if (updates.bookingMode !== undefined) data.bookingMode = updates.bookingMode
  if (updates.multiRoomLimitBy !== undefined) data.multiRoomLimitBy = updates.multiRoomLimitBy

  const row = await prisma.orgOffersSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  })
  return rowToSettings(row)
}

export async function getPropertyOffersAdmin(propertyId: number): Promise<PropertyOffersAdminResponse> {
  const [propertyRow, property] = await Promise.all([
    prisma.propertyOffersSettings.findUnique({ where: { propertyId } }),
    prisma.property.findUnique({ where: { propertyId } }),
  ])

  const orgRow = property
    ? await prisma.orgOffersSettings.findUnique({ where: { organizationId: property.organizationId } })
    : null

  const emptySettings: OrgOffersSettings = {
    minNights: null, maxNights: null, minRooms: null, maxRooms: null,
    allowedCancellationPolicies: null, allowedBoardTypes: null,
    allowedChargeParties: null, allowedPaymentMethods: null,
    minOfferValue: null, minOfferCurrency: null, bookingMode: null, multiRoomLimitBy: null,
  }
  const overrides: OrgOffersSettings = propertyRow ? rowToSettings(propertyRow) : emptySettings
  const orgDefaults: OrgOffersSettings = orgRow ? rowToSettings(orgRow) : emptySettings

  return { propertyId, overrides, orgDefaults }
}

export async function upsertPropertyOffersSettings(
  propertyId: number,
  updates: UpdateOffersSettingsRequest,
): Promise<PropertyOffersAdminResponse> {
  const data: Record<string, unknown> = {}
  if (updates.minNights !== undefined) data.minNights = updates.minNights
  if (updates.maxNights !== undefined) data.maxNights = updates.maxNights
  if (updates.minRooms !== undefined) data.minRooms = updates.minRooms
  if (updates.maxRooms !== undefined) data.maxRooms = updates.maxRooms
  if (updates.allowedCancellationPolicies !== undefined)
    data.allowedCancellationPolicies = updates.allowedCancellationPolicies != null
      ? JSON.stringify(updates.allowedCancellationPolicies)
      : null
  if (updates.allowedBoardTypes !== undefined)
    data.allowedBoardTypes = updates.allowedBoardTypes != null
      ? JSON.stringify(updates.allowedBoardTypes)
      : null
  if (updates.allowedChargeParties !== undefined)
    data.allowedChargeParties = updates.allowedChargeParties != null
      ? JSON.stringify(updates.allowedChargeParties)
      : null
  if (updates.allowedPaymentMethods !== undefined)
    data.allowedPaymentMethods = updates.allowedPaymentMethods != null
      ? JSON.stringify(updates.allowedPaymentMethods)
      : null
  if (updates.minOfferValue !== undefined) data.minOfferValue = updates.minOfferValue
  if (updates.minOfferCurrency !== undefined) data.minOfferCurrency = updates.minOfferCurrency
  if (updates.bookingMode !== undefined) data.bookingMode = updates.bookingMode
  if (updates.multiRoomLimitBy !== undefined) data.multiRoomLimitBy = updates.multiRoomLimitBy

  await prisma.propertyOffersSettings.upsert({
    where: { propertyId },
    create: { propertyId, ...data },
    update: data,
  })
  return getPropertyOffersAdmin(propertyId)
}

export interface ResolvedOffersSettings {
  minNights: number
  maxNights: number
  minRooms: number
  maxRooms: number
  allowedCancellationPolicies: string[] | null
  allowedBoardTypes: string[] | null
  allowedChargeParties: string[] | null
  allowedPaymentMethods: string[] | null
  minOfferValue: number | null
  minOfferCurrency: string
  bookingMode: BookingMode
  multiRoomLimitBy: MultiRoomLimitBy
}

export async function getEffectiveOffersSettings(propertyId: number): Promise<ResolvedOffersSettings> {
  const property = await prisma.property.findUnique({ where: { propertyId } })

  const [propertyRow, orgRow] = await Promise.all([
    prisma.propertyOffersSettings.findUnique({ where: { propertyId } }),
    property
      ? prisma.orgOffersSettings.findUnique({ where: { organizationId: property.organizationId } })
      : null,
  ])

  const d = SYSTEM_DEFAULTS
  const o = orgRow ? rowToSettings(orgRow) : null
  const p = propertyRow ? rowToSettings(propertyRow) : null

  // p?? o?? d — null means "not set at this level, inherit from next"
  return {
    minNights:   p?.minNights   ?? o?.minNights   ?? d.minNights,
    maxNights:   p?.maxNights   ?? o?.maxNights   ?? d.maxNights,
    minRooms:    p?.minRooms    ?? o?.minRooms    ?? d.minRooms,
    maxRooms:    p?.maxRooms    ?? o?.maxRooms    ?? d.maxRooms,
    allowedCancellationPolicies: p?.allowedCancellationPolicies ?? o?.allowedCancellationPolicies ?? null,
    allowedBoardTypes:           p?.allowedBoardTypes           ?? o?.allowedBoardTypes           ?? null,
    allowedChargeParties:        p?.allowedChargeParties        ?? o?.allowedChargeParties        ?? null,
    allowedPaymentMethods:       p?.allowedPaymentMethods       ?? o?.allowedPaymentMethods       ?? null,
    minOfferValue:    p?.minOfferValue    ?? o?.minOfferValue    ?? d.minOfferValue,
    minOfferCurrency: p?.minOfferCurrency ?? o?.minOfferCurrency ?? d.minOfferCurrency,
    bookingMode:        (p?.bookingMode        ?? o?.bookingMode        ?? 'single') as BookingMode,
    multiRoomLimitBy:   (p?.multiRoomLimitBy   ?? o?.multiRoomLimitBy   ?? 'hotel')  as MultiRoomLimitBy,
  }
}

export { SYSTEM_DEFAULTS as OFFERS_SYSTEM_DEFAULTS }
