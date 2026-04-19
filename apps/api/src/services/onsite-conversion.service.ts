import { prisma } from '../db/client.js'
import type {
  OnsiteConversionSettings,
  OnsiteConversionOverrides,
  OnsitePage,
  PropertyOnsiteConversionAdminResponse,
} from '@ibe/shared'

const DEFAULT_PAGES: OnsitePage[] = ['hotel', 'room']

export const ORG_DEFAULTS: OnsiteConversionSettings = {
  presenceEnabled: true,
  presenceMinViewers: 3,
  presenceMessage: '[xx] people are viewing this property right now',
  presencePages: DEFAULT_PAGES,
  bookingsEnabled: true,
  bookingsWindowHours: 24,
  bookingsMinCount: 1,
  bookingsMessage: '[xx] rooms booked in the last [hh] hours',
  bookingsPages: DEFAULT_PAGES,
  popupEnabled: false,
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
    presenceEnabled: overrides.presenceEnabled ?? orgDefaults.presenceEnabled,
    presenceMinViewers: overrides.presenceMinViewers ?? orgDefaults.presenceMinViewers,
    presenceMessage: overrides.presenceMessage ?? orgDefaults.presenceMessage,
    presencePages: overrides.presencePages ?? orgDefaults.presencePages,
    bookingsEnabled: overrides.bookingsEnabled ?? orgDefaults.bookingsEnabled,
    bookingsWindowHours: overrides.bookingsWindowHours ?? orgDefaults.bookingsWindowHours,
    bookingsMinCount: overrides.bookingsMinCount ?? orgDefaults.bookingsMinCount,
    bookingsMessage: overrides.bookingsMessage ?? orgDefaults.bookingsMessage,
    bookingsPages: overrides.bookingsPages ?? orgDefaults.bookingsPages,
    popupEnabled: overrides.popupEnabled ?? orgDefaults.popupEnabled,
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

function rowToSettings(row: {
  presenceEnabled: boolean; presenceMinViewers: number; presenceMessage: string; presencePages: string
  bookingsEnabled: boolean; bookingsWindowHours: number; bookingsMinCount: number; bookingsMessage: string; bookingsPages: string
  popupEnabled: boolean; popupDelaySeconds: number; popupMessage: string | null; popupPromoCode: string | null; popupPages: string
}): OnsiteConversionSettings {
  return {
    presenceEnabled: row.presenceEnabled,
    presenceMinViewers: row.presenceMinViewers,
    presenceMessage: row.presenceMessage,
    presencePages: parsePages(row.presencePages) ?? DEFAULT_PAGES,
    bookingsEnabled: row.bookingsEnabled,
    bookingsWindowHours: row.bookingsWindowHours,
    bookingsMinCount: row.bookingsMinCount,
    bookingsMessage: row.bookingsMessage,
    bookingsPages: parsePages(row.bookingsPages) ?? DEFAULT_PAGES,
    popupEnabled: row.popupEnabled,
    popupDelaySeconds: row.popupDelaySeconds,
    popupMessage: row.popupMessage,
    popupPromoCode: row.popupPromoCode,
    popupPages: parsePages(row.popupPages) ?? DEFAULT_PAGES,
  }
}

function rowToOverrides(row: {
  presenceEnabled: boolean | null; presenceMinViewers: number | null; presenceMessage: string | null; presencePages: string | null
  bookingsEnabled: boolean | null; bookingsWindowHours: number | null; bookingsMinCount: number | null; bookingsMessage: string | null; bookingsPages: string | null
  popupEnabled: boolean | null; popupDelaySeconds: number | null; popupMessage: string | null; popupPromoCode: string | null; popupPages: string | null
}): OnsiteConversionOverrides {
  return {
    presenceEnabled: row.presenceEnabled,
    presenceMinViewers: row.presenceMinViewers,
    presenceMessage: row.presenceMessage,
    presencePages: parsePages(row.presencePages),
    bookingsEnabled: row.bookingsEnabled,
    bookingsWindowHours: row.bookingsWindowHours,
    bookingsMinCount: row.bookingsMinCount,
    bookingsMessage: row.bookingsMessage,
    bookingsPages: parsePages(row.bookingsPages),
    popupEnabled: row.popupEnabled,
    popupDelaySeconds: row.popupDelaySeconds,
    popupMessage: row.popupMessage,
    popupPromoCode: row.popupPromoCode,
    popupPages: parsePages(row.popupPages),
  }
}

function emptyOverrides(): OnsiteConversionOverrides {
  return {
    presenceEnabled: null, presenceMinViewers: null, presenceMessage: null, presencePages: null,
    bookingsEnabled: null, bookingsWindowHours: null, bookingsMinCount: null, bookingsMessage: null, bookingsPages: null,
    popupEnabled: null, popupDelaySeconds: null, popupMessage: null, popupPromoCode: null, popupPages: null,
  }
}

// Serialize pages arrays to JSON strings for Prisma writes
function serializeSettings(data: Partial<OnsiteConversionSettings>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  if (data.presencePages !== undefined) out['presencePages'] = JSON.stringify(data.presencePages)
  if (data.bookingsPages !== undefined) out['bookingsPages'] = JSON.stringify(data.bookingsPages)
  if (data.popupPages !== undefined) out['popupPages'] = JSON.stringify(data.popupPages)
  return out
}

function serializeOverrides(data: Partial<OnsiteConversionOverrides>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  if (data.presencePages !== undefined) out['presencePages'] = data.presencePages !== null ? JSON.stringify(data.presencePages) : null
  if (data.bookingsPages !== undefined) out['bookingsPages'] = data.bookingsPages !== null ? JSON.stringify(data.bookingsPages) : null
  if (data.popupPages !== undefined) out['popupPages'] = data.popupPages !== null ? JSON.stringify(data.popupPages) : null
  return out
}
