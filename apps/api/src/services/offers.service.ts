import type { OrgOffersSettings, PropertyOffersAdminResponse, UpdateOffersSettingsRequest, BookingMode, MultiRoomLimitBy, OffersChannel } from '@ibe/shared'
import { prisma } from '../db/client.js'
import type { ChannelType } from '@prisma/client'

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

function toChannelEnum(channel: OffersChannel): ChannelType {
  return channel === 'b2b' ? 'B2B' : 'B2C'
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

const emptySettings: OrgOffersSettings = {
  minNights: null, maxNights: null, minRooms: null, maxRooms: null,
  allowedCancellationPolicies: null, allowedBoardTypes: null,
  allowedChargeParties: null, allowedPaymentMethods: null,
  minOfferValue: null, minOfferCurrency: null, bookingMode: null, multiRoomLimitBy: null,
}

function buildUpdateData(updates: UpdateOffersSettingsRequest): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (updates.minNights !== undefined) data.minNights = updates.minNights
  if (updates.maxNights !== undefined) data.maxNights = updates.maxNights
  if (updates.minRooms !== undefined) data.minRooms = updates.minRooms
  if (updates.maxRooms !== undefined) data.maxRooms = updates.maxRooms
  if (updates.allowedCancellationPolicies !== undefined)
    data.allowedCancellationPolicies = updates.allowedCancellationPolicies != null
      ? JSON.stringify(updates.allowedCancellationPolicies) : null
  if (updates.allowedBoardTypes !== undefined)
    data.allowedBoardTypes = updates.allowedBoardTypes != null
      ? JSON.stringify(updates.allowedBoardTypes) : null
  if (updates.allowedChargeParties !== undefined)
    data.allowedChargeParties = updates.allowedChargeParties != null
      ? JSON.stringify(updates.allowedChargeParties) : null
  if (updates.allowedPaymentMethods !== undefined)
    data.allowedPaymentMethods = updates.allowedPaymentMethods != null
      ? JSON.stringify(updates.allowedPaymentMethods) : null
  if (updates.minOfferValue !== undefined) data.minOfferValue = updates.minOfferValue
  if (updates.minOfferCurrency !== undefined) data.minOfferCurrency = updates.minOfferCurrency
  if (updates.bookingMode !== undefined) data.bookingMode = updates.bookingMode
  if (updates.multiRoomLimitBy !== undefined) data.multiRoomLimitBy = updates.multiRoomLimitBy
  return data
}

// ── System-level ──────────────────────────────────────────────────────────────

export async function getSystemOffersSettings(channel: OffersChannel): Promise<OrgOffersSettings> {
  const row = await prisma.systemOffersSettings.findUnique({ where: { channel: toChannelEnum(channel) } })
  return row ? rowToSettings(row) : emptySettings
}

export async function upsertSystemOffersSettings(
  channel: OffersChannel,
  updates: UpdateOffersSettingsRequest,
): Promise<OrgOffersSettings> {
  const ch = toChannelEnum(channel)
  const data = buildUpdateData(updates)
  const row = await prisma.systemOffersSettings.upsert({
    where: { channel: ch },
    create: { channel: ch, ...data },
    update: data,
  })
  return rowToSettings(row)
}

// ── Org-level ─────────────────────────────────────────────────────────────────

export async function getOrgOffersSettings(organizationId: number, channel: OffersChannel): Promise<OrgOffersSettings> {
  const row = await prisma.orgOffersSettings.findUnique({
    where: { organizationId_channel: { organizationId, channel: toChannelEnum(channel) } },
  })
  return row ? rowToSettings(row) : emptySettings
}

export async function upsertOrgOffersSettings(
  organizationId: number,
  channel: OffersChannel,
  updates: UpdateOffersSettingsRequest,
): Promise<OrgOffersSettings> {
  const ch = toChannelEnum(channel)
  const data = buildUpdateData(updates)
  const row = await prisma.orgOffersSettings.upsert({
    where: { organizationId_channel: { organizationId, channel: ch } },
    create: { organizationId, channel: ch, ...data },
    update: data,
  })
  return rowToSettings(row)
}

// ── Property-level ────────────────────────────────────────────────────────────

export async function getPropertyOffersAdmin(propertyId: number, channel: OffersChannel): Promise<PropertyOffersAdminResponse> {
  const [propertyRow, property] = await Promise.all([
    prisma.propertyOffersSettings.findUnique({
      where: { propertyId_channel: { propertyId, channel: toChannelEnum(channel) } },
    }),
    prisma.property.findUnique({ where: { propertyId } }),
  ])

  const [orgRow, systemRow] = await Promise.all([
    property
      ? prisma.orgOffersSettings.findUnique({
          where: { organizationId_channel: { organizationId: property.organizationId, channel: toChannelEnum(channel) } },
        })
      : null,
    prisma.systemOffersSettings.findUnique({ where: { channel: toChannelEnum(channel) } }),
  ])

  return {
    propertyId,
    channel,
    overrides: propertyRow ? rowToSettings(propertyRow) : emptySettings,
    orgDefaults: orgRow ? rowToSettings(orgRow) : emptySettings,
    systemDefaults: systemRow ? rowToSettings(systemRow) : emptySettings,
  }
}

export async function upsertPropertyOffersSettings(
  propertyId: number,
  channel: OffersChannel,
  updates: UpdateOffersSettingsRequest,
): Promise<PropertyOffersAdminResponse> {
  const ch = toChannelEnum(channel)
  const data = buildUpdateData(updates)
  await prisma.propertyOffersSettings.upsert({
    where: { propertyId_channel: { propertyId, channel: ch } },
    create: { propertyId, channel: ch, ...data },
    update: data,
  })
  return getPropertyOffersAdmin(propertyId, channel)
}

// ── Effective settings (used by search) ───────────────────────────────────────

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

export async function getEffectiveOffersSettings(propertyId: number, channel: OffersChannel = 'b2c'): Promise<ResolvedOffersSettings> {
  const ch = toChannelEnum(channel)
  const property = await prisma.property.findUnique({ where: { propertyId } })

  const [propertyRow, orgRow, systemRow] = await Promise.all([
    prisma.propertyOffersSettings.findUnique({ where: { propertyId_channel: { propertyId, channel: ch } } }),
    property
      ? prisma.orgOffersSettings.findUnique({
          where: { organizationId_channel: { organizationId: property.organizationId, channel: ch } },
        })
      : null,
    prisma.systemOffersSettings.findUnique({ where: { channel: ch } }),
  ])

  const d = SYSTEM_DEFAULTS
  const s = systemRow ? rowToSettings(systemRow) : null
  const o = orgRow ? rowToSettings(orgRow) : null
  const p = propertyRow ? rowToSettings(propertyRow) : null

  // p ?? o ?? s ?? hardcoded — null means "not set at this level, inherit from next"
  return {
    minNights:   p?.minNights   ?? o?.minNights   ?? s?.minNights   ?? d.minNights,
    maxNights:   p?.maxNights   ?? o?.maxNights   ?? s?.maxNights   ?? d.maxNights,
    minRooms:    p?.minRooms    ?? o?.minRooms    ?? s?.minRooms    ?? d.minRooms,
    maxRooms:    p?.maxRooms    ?? o?.maxRooms    ?? s?.maxRooms    ?? d.maxRooms,
    allowedCancellationPolicies: p?.allowedCancellationPolicies ?? o?.allowedCancellationPolicies ?? s?.allowedCancellationPolicies ?? null,
    allowedBoardTypes:           p?.allowedBoardTypes           ?? o?.allowedBoardTypes           ?? s?.allowedBoardTypes           ?? null,
    allowedChargeParties:        p?.allowedChargeParties        ?? o?.allowedChargeParties        ?? s?.allowedChargeParties        ?? null,
    allowedPaymentMethods:       p?.allowedPaymentMethods       ?? o?.allowedPaymentMethods       ?? s?.allowedPaymentMethods       ?? null,
    minOfferValue:    p?.minOfferValue    ?? o?.minOfferValue    ?? s?.minOfferValue    ?? d.minOfferValue,
    minOfferCurrency: p?.minOfferCurrency ?? o?.minOfferCurrency ?? s?.minOfferCurrency ?? d.minOfferCurrency,
    bookingMode:      (p?.bookingMode      ?? o?.bookingMode      ?? s?.bookingMode      ?? 'single') as BookingMode,
    multiRoomLimitBy: (p?.multiRoomLimitBy ?? o?.multiRoomLimitBy ?? s?.multiRoomLimitBy ?? 'hotel')  as MultiRoomLimitBy,
  }
}

export { SYSTEM_DEFAULTS as OFFERS_SYSTEM_DEFAULTS }
