import { prisma } from '../db/client.js'
import type {
  OnsiteConversionSettings,
  OnsiteConversionOverrides,
  OnsitePage,
  SellModel,
  PropertyOnsiteConversionAdminResponse,
} from '@ibe/shared'

const DEFAULT_PAGES: OnsitePage[] = ['hotel', 'room']

export const ORG_DEFAULTS: OnsiteConversionSettings = {
  presenceEnabledModels: ['b2c', 'b2b'],
  presenceMinViewers: 3,
  presenceMessage: '[xx] people are viewing this property right now',
  presencePages: DEFAULT_PAGES,
  bookingsEnabledModels: ['b2c', 'b2b'],
  bookingsWindowHours: 24,
  bookingsMinCount: 1,
  bookingsMessage: '[xx] rooms booked in the last [hh] hours',
  bookingsPages: DEFAULT_PAGES,
  popupEnabledModels: [],
  popupDelaySeconds: 30,
  popupMessage: null,
  popupPromoCode: null,
  popupPages: DEFAULT_PAGES,
}

// ── Org-level (global) ────────────────────────────────────────────────────────

export async function getOnsiteConversionSettings(organizationId: number): Promise<OnsiteConversionSettings> {
  const row = await prisma.onsiteConversionSettings.findUnique({ where: { organizationId } })
  if (!row) return { ...ORG_DEFAULTS }
  return rowToSettings(row)
}

export async function updateOnsiteConversionSettings(
  organizationId: number,
  data: Partial<OnsiteConversionSettings>,
): Promise<OnsiteConversionSettings> {
  const serialized = serializeSettings(data)
  const row = await prisma.onsiteConversionSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...serializeSettings(ORG_DEFAULTS), ...serialized },
    update: serialized,
  })
  return rowToSettings(row)
}

// ── Property-level (overrides) ────────────────────────────────────────────────

export async function getPropertyOnsiteConversionAdmin(propertyId: number): Promise<PropertyOnsiteConversionAdminResponse> {
  const [overrideRow, property] = await Promise.all([
    prisma.propertyOnsiteConversionSettings.findUnique({ where: { propertyId } }),
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
  ])

  const orgDefaults = property
    ? await getOnsiteConversionSettings(property.organizationId)
    : { ...ORG_DEFAULTS }

  const overrides: OnsiteConversionOverrides = overrideRow
    ? rowToOverrides(overrideRow)
    : emptyOverrides()

  const effective: OnsiteConversionSettings = {
    presenceEnabledModels: overrides.presenceEnabledModels ?? orgDefaults.presenceEnabledModels,
    presenceMinViewers: overrides.presenceMinViewers ?? orgDefaults.presenceMinViewers,
    presenceMessage: overrides.presenceMessage ?? orgDefaults.presenceMessage,
    presencePages: overrides.presencePages ?? orgDefaults.presencePages,
    bookingsEnabledModels: overrides.bookingsEnabledModels ?? orgDefaults.bookingsEnabledModels,
    bookingsWindowHours: overrides.bookingsWindowHours ?? orgDefaults.bookingsWindowHours,
    bookingsMinCount: overrides.bookingsMinCount ?? orgDefaults.bookingsMinCount,
    bookingsMessage: overrides.bookingsMessage ?? orgDefaults.bookingsMessage,
    bookingsPages: overrides.bookingsPages ?? orgDefaults.bookingsPages,
    popupEnabledModels: overrides.popupEnabledModels ?? orgDefaults.popupEnabledModels,
    popupDelaySeconds: overrides.popupDelaySeconds ?? orgDefaults.popupDelaySeconds,
    popupMessage: overrides.popupMessage ?? orgDefaults.popupMessage,
    popupPromoCode: overrides.popupPromoCode ?? orgDefaults.popupPromoCode,
    popupPages: overrides.popupPages ?? orgDefaults.popupPages,
  }

  return { propertyId, overrides, orgDefaults, effective }
}

export async function upsertPropertyOnsiteConversionSettings(
  propertyId: number,
  data: Partial<OnsiteConversionOverrides>,
): Promise<PropertyOnsiteConversionAdminResponse> {
  const serialized = serializeOverrides(data)
  await prisma.propertyOnsiteConversionSettings.upsert({
    where: { propertyId },
    create: { propertyId, ...serialized },
    update: serialized,
  })
  return getPropertyOnsiteConversionAdmin(propertyId)
}

export async function getRecentBookingsCount(propertyId: number, windowHours: number): Promise<number> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000)
  return prisma.booking.count({
    where: { propertyId, createdAt: { gte: since } },
  })
}

export async function getPromoDiscount(code: string): Promise<number | null> {
  const promo = await prisma.promoCode.findFirst({
    where: { code, isActive: true, deletedAt: null },
    select: { discountValue: true },
  })
  return promo ? Number(promo.discountValue) : null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePages(raw: string | null | undefined): OnsitePage[] | null {
  if (raw == null) return null
  try { return JSON.parse(raw) as OnsitePage[] } catch { return DEFAULT_PAGES }
}

function parseModels(raw: string | null | undefined): SellModel[] | null {
  if (raw == null) return null
  try { return JSON.parse(raw) as SellModel[] } catch { return [] }
}

function rowToSettings(row: {
  presenceEnabledModels: string; presenceMinViewers: number; presenceMessage: string; presencePages: string
  bookingsEnabledModels: string; bookingsWindowHours: number; bookingsMinCount: number; bookingsMessage: string; bookingsPages: string
  popupEnabledModels: string; popupDelaySeconds: number; popupMessage: string | null; popupPromoCode: string | null; popupPages: string
}): OnsiteConversionSettings {
  return {
    presenceEnabledModels: parseModels(row.presenceEnabledModels) ?? ['b2c', 'b2b'],
    presenceMinViewers: row.presenceMinViewers,
    presenceMessage: row.presenceMessage,
    presencePages: parsePages(row.presencePages) ?? DEFAULT_PAGES,
    bookingsEnabledModels: parseModels(row.bookingsEnabledModels) ?? ['b2c', 'b2b'],
    bookingsWindowHours: row.bookingsWindowHours,
    bookingsMinCount: row.bookingsMinCount,
    bookingsMessage: row.bookingsMessage,
    bookingsPages: parsePages(row.bookingsPages) ?? DEFAULT_PAGES,
    popupEnabledModels: parseModels(row.popupEnabledModels) ?? [],
    popupDelaySeconds: row.popupDelaySeconds,
    popupMessage: row.popupMessage,
    popupPromoCode: row.popupPromoCode,
    popupPages: parsePages(row.popupPages) ?? DEFAULT_PAGES,
  }
}

function rowToOverrides(row: {
  presenceEnabledModels: string | null; presenceMinViewers: number | null; presenceMessage: string | null; presencePages: string | null
  bookingsEnabledModels: string | null; bookingsWindowHours: number | null; bookingsMinCount: number | null; bookingsMessage: string | null; bookingsPages: string | null
  popupEnabledModels: string | null; popupDelaySeconds: number | null; popupMessage: string | null; popupPromoCode: string | null; popupPages: string | null
}): OnsiteConversionOverrides {
  return {
    presenceEnabledModels: parseModels(row.presenceEnabledModels),
    presenceMinViewers: row.presenceMinViewers,
    presenceMessage: row.presenceMessage,
    presencePages: parsePages(row.presencePages),
    bookingsEnabledModels: parseModels(row.bookingsEnabledModels),
    bookingsWindowHours: row.bookingsWindowHours,
    bookingsMinCount: row.bookingsMinCount,
    bookingsMessage: row.bookingsMessage,
    bookingsPages: parsePages(row.bookingsPages),
    popupEnabledModels: parseModels(row.popupEnabledModels),
    popupDelaySeconds: row.popupDelaySeconds,
    popupMessage: row.popupMessage,
    popupPromoCode: row.popupPromoCode,
    popupPages: parsePages(row.popupPages),
  }
}

function emptyOverrides(): OnsiteConversionOverrides {
  return {
    presenceEnabledModels: null, presenceMinViewers: null, presenceMessage: null, presencePages: null,
    bookingsEnabledModels: null, bookingsWindowHours: null, bookingsMinCount: null, bookingsMessage: null, bookingsPages: null,
    popupEnabledModels: null, popupDelaySeconds: null, popupMessage: null, popupPromoCode: null, popupPages: null,
  }
}

function serializeSettings(data: Partial<OnsiteConversionSettings>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  if (data.presenceEnabledModels !== undefined) out['presenceEnabledModels'] = JSON.stringify(data.presenceEnabledModels)
  if (data.presencePages !== undefined) out['presencePages'] = JSON.stringify(data.presencePages)
  if (data.bookingsEnabledModels !== undefined) out['bookingsEnabledModels'] = JSON.stringify(data.bookingsEnabledModels)
  if (data.bookingsPages !== undefined) out['bookingsPages'] = JSON.stringify(data.bookingsPages)
  if (data.popupEnabledModels !== undefined) out['popupEnabledModels'] = JSON.stringify(data.popupEnabledModels)
  if (data.popupPages !== undefined) out['popupPages'] = JSON.stringify(data.popupPages)
  return out
}

function serializeOverrides(data: Partial<OnsiteConversionOverrides>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  if (data.presenceEnabledModels !== undefined) out['presenceEnabledModels'] = data.presenceEnabledModels !== null ? JSON.stringify(data.presenceEnabledModels) : null
  if (data.presencePages !== undefined) out['presencePages'] = data.presencePages !== null ? JSON.stringify(data.presencePages) : null
  if (data.bookingsEnabledModels !== undefined) out['bookingsEnabledModels'] = data.bookingsEnabledModels !== null ? JSON.stringify(data.bookingsEnabledModels) : null
  if (data.bookingsPages !== undefined) out['bookingsPages'] = data.bookingsPages !== null ? JSON.stringify(data.bookingsPages) : null
  if (data.popupEnabledModels !== undefined) out['popupEnabledModels'] = data.popupEnabledModels !== null ? JSON.stringify(data.popupEnabledModels) : null
  if (data.popupPages !== undefined) out['popupPages'] = data.popupPages !== null ? JSON.stringify(data.popupPages) : null
  return out
}
