import { prisma } from '../db/client.js'
import type {
  GroupConfig, GroupConfigUpdate, GroupPropertyOverride, PublicGroupConfig,
  GroupCancellationRange, GroupPaymentRange, GroupPricingDirection, GroupBookingMode,
  GroupMealsConfig, GroupMeetingRoomConfig, GroupFreeRoomsConfig,
} from '@ibe/shared'

const DEFAULT_MEALS: GroupMealsConfig = {
  breakfast: { enabled: false, priceAdult: 0, priceChild: 0, priceInfant: 0 },
  lunch:     { enabled: false, priceAdult: 0, priceChild: 0, priceInfant: 0 },
  dinner:    { enabled: false, priceAdult: 0, priceChild: 0, priceInfant: 0 },
}
const DEFAULT_MEETING_ROOM: GroupMeetingRoomConfig = { enabled: false, pricePerDay: 0 }
const DEFAULT_FREE_ROOMS: GroupFreeRoomsConfig = { enabled: false, count: 0 }

function rowToConfig(row: {
  enabled: boolean; bookingMode: string; groupEmail: string | null
  pricingDirection: string; pricingPct: { toNumber(): number }
  cancellationRanges: unknown; paymentInParWithCancellation: boolean; paymentRanges: unknown
  mealsConfig: unknown; meetingRoomConfig: unknown; freeRoomsConfig: unknown
  groupPolicies?: string | null
}): GroupConfig {
  return {
    enabled: row.enabled,
    bookingMode: row.bookingMode as GroupBookingMode,
    groupEmail: row.groupEmail,
    pricingDirection: row.pricingDirection as GroupPricingDirection,
    pricingPct: row.pricingPct.toNumber(),
    cancellationRanges: (row.cancellationRanges as GroupCancellationRange[]) ?? [],
    paymentInParWithCancellation: row.paymentInParWithCancellation,
    paymentRanges: (row.paymentRanges as GroupPaymentRange[]) ?? [],
    mealsConfig: (row.mealsConfig as GroupMealsConfig) ?? DEFAULT_MEALS,
    meetingRoomConfig: (row.meetingRoomConfig as GroupMeetingRoomConfig) ?? DEFAULT_MEETING_ROOM,
    freeRoomsConfig: (row.freeRoomsConfig as GroupFreeRoomsConfig) ?? DEFAULT_FREE_ROOMS,
    groupPolicies: row.groupPolicies ?? null,
  }
}

const EMPTY_CONFIG: GroupConfig = {
  enabled: false, bookingMode: 'offline', groupEmail: null,
  pricingDirection: 'decrease', pricingPct: 0,
  cancellationRanges: [], paymentInParWithCancellation: true, paymentRanges: [],
  mealsConfig: DEFAULT_MEALS,
  meetingRoomConfig: DEFAULT_MEETING_ROOM,
  freeRoomsConfig: DEFAULT_FREE_ROOMS,
  groupPolicies: null,
}

export async function getGroupConfig(orgId: number): Promise<GroupConfig> {
  const row = await prisma.groupConfig.findUnique({ where: { organizationId: orgId } })
  return row ? rowToConfig(row) : { ...EMPTY_CONFIG }
}

export async function updateGroupConfig(orgId: number, update: GroupConfigUpdate): Promise<GroupConfig> {
  const data: Record<string, unknown> = { updatedAt: new Date() }
  if (update.enabled !== undefined) data.enabled = update.enabled
  if (update.bookingMode !== undefined) data.bookingMode = update.bookingMode
  if (update.groupEmail !== undefined) data.groupEmail = update.groupEmail
  if (update.pricingDirection !== undefined) data.pricingDirection = update.pricingDirection
  if (update.pricingPct !== undefined) data.pricingPct = update.pricingPct
  if (update.cancellationRanges !== undefined) data.cancellationRanges = update.cancellationRanges
  if (update.paymentInParWithCancellation !== undefined) data.paymentInParWithCancellation = update.paymentInParWithCancellation
  if (update.paymentRanges !== undefined) data.paymentRanges = update.paymentRanges
  if (update.mealsConfig !== undefined) data.mealsConfig = update.mealsConfig
  if (update.meetingRoomConfig !== undefined) data.meetingRoomConfig = update.meetingRoomConfig
  if (update.freeRoomsConfig !== undefined) data.freeRoomsConfig = update.freeRoomsConfig
  if (update.groupPolicies !== undefined) data.groupPolicies = update.groupPolicies

  await prisma.groupConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...data, createdAt: new Date() } as Parameters<typeof prisma.groupConfig.create>[0]['data'],
    update: data,
  })
  return getGroupConfig(orgId)
}

export async function getPropertyGroupOverride(propertyDbId: number): Promise<GroupPropertyOverride> {
  const row = await prisma.propertyGroupConfig.findUnique({ where: { propertyId: propertyDbId } })
  return {
    enabled: row?.enabled ?? null,
    bookingMode: (row?.bookingMode ?? null) as GroupBookingMode | null,
    groupEmail: row?.groupEmail ?? null,
    pricingDirection: (row?.pricingDirection ?? null) as GroupPricingDirection | null,
    pricingPct: row?.pricingPct ? Number(row.pricingPct) : null,
    cancellationRanges: (row?.cancellationRanges as GroupCancellationRange[] | null) ?? null,
    paymentInParWithCancellation: row?.paymentInParWithCancellation ?? null,
    paymentRanges: (row?.paymentRanges as GroupPaymentRange[] | null) ?? null,
    mealsConfig: (row?.mealsConfig as GroupMealsConfig | null) ?? null,
    meetingRoomConfig: (row?.meetingRoomConfig as GroupMeetingRoomConfig | null) ?? null,
    freeRoomsConfig: (row?.freeRoomsConfig as GroupFreeRoomsConfig | null) ?? null,
    groupPolicies: row?.groupPolicies ?? null,
  }
}

export async function upsertPropertyGroupOverride(
  propertyDbId: number, orgId: number, update: Partial<GroupPropertyOverride>
): Promise<GroupPropertyOverride> {
  const data: Record<string, unknown> = { updatedAt: new Date() }
  const fields = ['enabled','bookingMode','groupEmail','pricingDirection','pricingPct',
    'cancellationRanges','paymentInParWithCancellation','paymentRanges',
    'mealsConfig','meetingRoomConfig','freeRoomsConfig','groupPolicies'] as const
  for (const f of fields) {
    if (f in update) data[f] = update[f] ?? null
  }
  await prisma.propertyGroupConfig.upsert({
    where: { propertyId: propertyDbId },
    create: { propertyId: propertyDbId, organizationId: orgId, ...data } as Parameters<typeof prisma.propertyGroupConfig.create>[0]['data'],
    update: data,
  })
  return getPropertyGroupOverride(propertyDbId)
}

// Public: resolved config for a property (hotel override ?? chain)
export async function getResolvedGroupConfig(propertyId: number): Promise<PublicGroupConfig | null> {
  const prop = await prisma.property.findUnique({ where: { propertyId } })
  if (!prop) return null
  const [chain, override] = await Promise.all([
    prisma.groupConfig.findUnique({ where: { organizationId: prop.organizationId } }),
    prisma.propertyGroupConfig.findUnique({ where: { propertyId: prop.id } }),
  ])
  const c = chain
  const o = override
  return {
    enabled: o?.enabled ?? c?.enabled ?? false,
    bookingMode: (o?.bookingMode ?? c?.bookingMode ?? 'offline') as GroupBookingMode,
    pricingDirection: (o?.pricingDirection ?? c?.pricingDirection ?? 'decrease') as GroupPricingDirection,
    pricingPct: Number(o?.pricingPct ?? c?.pricingPct ?? 0),
    cancellationRanges: ((o?.cancellationRanges ?? c?.cancellationRanges ?? []) as unknown) as GroupCancellationRange[],
    paymentInParWithCancellation: o?.paymentInParWithCancellation ?? c?.paymentInParWithCancellation ?? true,
    paymentRanges: ((o?.paymentRanges ?? c?.paymentRanges ?? []) as unknown) as GroupPaymentRange[],
    mealsConfig: (o?.mealsConfig ?? c?.mealsConfig ?? DEFAULT_MEALS) as GroupMealsConfig,
    meetingRoomConfig: (o?.meetingRoomConfig ?? c?.meetingRoomConfig ?? DEFAULT_MEETING_ROOM) as GroupMeetingRoomConfig,
    freeRoomsConfig: (o?.freeRoomsConfig ?? c?.freeRoomsConfig ?? DEFAULT_FREE_ROOMS) as GroupFreeRoomsConfig,
    groupPolicies: o?.groupPolicies ?? c?.groupPolicies ?? null,
  }
}

// Helper: get group email for a property (for sending inquiry)
export async function getGroupEmail(propertyId: number): Promise<string | null> {
  const prop = await prisma.property.findUnique({ where: { propertyId } })
  if (!prop) return null
  const [chain, override] = await Promise.all([
    prisma.groupConfig.findUnique({ where: { organizationId: prop.organizationId } }),
    prisma.propertyGroupConfig.findUnique({ where: { propertyId: prop.id } }),
  ])
  return override?.groupEmail ?? chain?.groupEmail ?? null
}

export function applyGroupPricing(basePrice: number, direction: GroupPricingDirection, pct: number): number {
  const multiplier = direction === 'increase' ? 1 + pct / 100 : 1 - pct / 100
  return Math.round(basePrice * multiplier * 100) / 100
}
