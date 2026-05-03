import { prisma } from '../db/client.js'
import type { IncentiveSlotName } from '@ibe/shared'

const PACKAGE_INCLUDE = {
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: { item: true },
  },
}

const SLOTS: IncentiveSlotName[] = ['chain_page', 'hotel_page', 'room_banner', 'room_results']

function toItemResponse(item: {
  id: number
  organizationId: number | null
  propertyId?: number | null
  text: string
  isActive: boolean
  sortOrder: number
  visibleToChains: boolean
  visibleToHotels: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    ...item,
    propertyId: item.propertyId ?? null,
    isSystem: item.organizationId === null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}

function toPackageResponse(pkg: {
  id: number
  organizationId: number | null
  propertyId?: number | null
  name: string
  isActive: boolean
  fontSize: string
  visibleToChains: boolean
  visibleToHotels: boolean
  createdAt: Date
  updatedAt: Date
  items: { id: number; packageId: number; itemId: number; sortOrder: number; item: {
    id: number; organizationId: number | null; propertyId?: number | null; text: string; isActive: boolean; sortOrder: number;
    visibleToChains: boolean; visibleToHotels: boolean; createdAt: Date; updatedAt: Date
  } }[]
}) {
  return {
    ...pkg,
    propertyId: pkg.propertyId ?? null,
    isSystem: pkg.organizationId === null,
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
    items: pkg.items.map(pi => ({
      ...pi,
      item: toItemResponse(pi.item),
    })),
  }
}

// ── Items ─────────────────────────────────────────────────────────────────────

export async function listIncentiveItems(orgId: number | null, hotelView = false, propertyId?: number) {
  // Fetch property overrides first so overridden items are always included even if visibility changed
  const propertyOverrides = propertyId !== undefined
    ? await prisma.incentivePropertyItemOverride.findMany({ where: { propertyId } })
    : []
  const overriddenItemIds = propertyOverrides.map(o => o.itemId)

  const [rows, chainOverrides] = await Promise.all([
    prisma.incentiveItem.findMany({
      where: hotelView
        ? { OR: [
            // Chain items visible to hotels (skipped if no org context)
            ...(orgId !== null ? [{ organizationId: orgId, visibleToHotels: true }] : []),
            { organizationId: null, visibleToHotels: true },
            ...(overriddenItemIds.length > 0 ? [{ id: { in: overriddenItemIds } }] : []),
            ...(propertyId !== undefined ? [{ propertyId }] : []),
          ] }
        : orgId === null
          ? { organizationId: null }
          : { OR: [
              { organizationId: orgId },
              { organizationId: null, visibleToChains: true },
            ] },
      orderBy: [{ organizationId: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }],
    }),
    orgId !== null && !hotelView
      ? prisma.incentiveChainItemOverride.findMany({ where: { organizationId: orgId } })
      : Promise.resolve([]),
  ])

  const chainDisabledIds = new Set(chainOverrides.filter(o => o.disabled).map(o => o.itemId))
  const propertyDisabledIds = new Set(propertyOverrides.filter(o => o.disabled).map(o => o.itemId))
  return rows.map(item => ({
    ...toItemResponse(item),
    ...(orgId !== null && !hotelView ? { chainDisabled: chainDisabledIds.has(item.id) } : {}),
    ...(propertyId !== undefined ? { propertyDisabled: propertyDisabledIds.has(item.id) } : {}),
  }))
}

export async function setChainItemOverride(orgId: number, itemId: number, disabled: boolean) {
  await prisma.incentiveChainItemOverride.upsert({
    where: { organizationId_itemId: { organizationId: orgId, itemId } },
    create: { organizationId: orgId, itemId, disabled },
    update: { disabled },
  })
}

export async function createIncentiveItem(
  orgId: number | null,
  text: string,
  sortOrder = 0,
  visibleToChains = false,
  propertyId?: number,
  visibleToHotels = false,
) {
  const row = await prisma.incentiveItem.create({
    data: { organizationId: orgId, text, sortOrder, visibleToChains, visibleToHotels, propertyId: propertyId ?? null },
  })
  return toItemResponse(row)
}

export async function updateIncentiveItem(
  id: number,
  orgId: number | null,
  data: { text?: string; isActive?: boolean; sortOrder?: number; visibleToChains?: boolean; visibleToHotels?: boolean },
  propertyId?: number,
) {
  // Prisma update.where only supports unique selectors; cast needed for extra ownership filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = (propertyId !== undefined ? { id, propertyId } : { id, organizationId: orgId }) as any
  const row = await prisma.incentiveItem.update({ where, data })
  return toItemResponse(row)
}

export async function deleteIncentiveItem(id: number, orgId: number | null, propertyId?: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = (propertyId !== undefined ? { id, propertyId } : { id, organizationId: orgId }) as any
  await prisma.incentiveItem.delete({ where })
}

// ── Packages ──────────────────────────────────────────────────────────────────

export async function listIncentivePackages(orgId: number | null, hotelView = false, propertyId?: number) {
  const rows = await prisma.incentivePackage.findMany({
    where: hotelView
      ? { OR: [
          ...(orgId !== null ? [{ organizationId: orgId, visibleToHotels: true }] : []),
          { organizationId: null, visibleToHotels: true },
          ...(propertyId !== undefined ? [{ propertyId }] : []),
        ] }
      : orgId === null
        ? { organizationId: null }
        : { OR: [
            { organizationId: orgId },
            { organizationId: null, visibleToChains: true },
          ] },
    orderBy: [{ organizationId: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    include: PACKAGE_INCLUDE,
  })

  return rows.map(pkg => toPackageResponse(pkg))
}

export async function createIncentivePackage(
  orgId: number | null,
  data: {
    name: string
    isActive?: boolean
    fontSize?: string
    visibleToChains?: boolean
    visibleToHotels?: boolean
    itemIds?: number[]
    propertyId?: number
  },
) {
  const pkg = await prisma.incentivePackage.create({
    data: {
      organizationId: orgId,
      propertyId: data.propertyId ?? null,
      name: data.name,
      isActive: data.isActive ?? true,
      fontSize: data.fontSize ?? 'md',
      visibleToChains: data.visibleToChains ?? false,
      visibleToHotels: data.visibleToHotels ?? false,
    },
    include: PACKAGE_INCLUDE,
  })
  if (data.itemIds?.length) {
    await setPackageItems(pkg.id, data.itemIds)
  }
  const fresh = await prisma.incentivePackage.findUniqueOrThrow({ where: { id: pkg.id }, include: PACKAGE_INCLUDE })
  return toPackageResponse(fresh)
}

export async function updateIncentivePackage(
  id: number,
  orgId: number | null,
  data: {
    name?: string
    isActive?: boolean
    fontSize?: string
    visibleToChains?: boolean
    visibleToHotels?: boolean
    itemIds?: number[]
  },
  propertyId?: number,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = (propertyId !== undefined ? { id, propertyId } : { id, organizationId: orgId }) as any
  await prisma.incentivePackage.update({
    where,
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.fontSize !== undefined && { fontSize: data.fontSize }),
      ...(data.visibleToChains !== undefined && { visibleToChains: data.visibleToChains }),
      ...(data.visibleToHotels !== undefined && { visibleToHotels: data.visibleToHotels }),
    },
  })
  if (data.itemIds !== undefined) {
    await setPackageItems(id, data.itemIds)
  }
  const fresh = await prisma.incentivePackage.findUniqueOrThrow({ where: { id }, include: PACKAGE_INCLUDE })
  return toPackageResponse(fresh)
}

export async function deleteIncentivePackage(id: number, orgId: number | null, propertyId?: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = (propertyId !== undefined ? { id, propertyId } : { id, organizationId: orgId }) as any
  await prisma.incentivePackage.delete({ where })
}

async function setPackageItems(packageId: number, itemIds: number[]) {
  await prisma.incentivePackageItem.deleteMany({ where: { packageId } })
  if (itemIds.length === 0) return
  await prisma.incentivePackageItem.createMany({
    data: itemIds.map((itemId, i) => ({ packageId, itemId, sortOrder: i })),
  })
}

// ── Slot management ───────────────────────────────────────────────────────────

// Internal: resolve a single slot following inheritance chain
async function resolveSlot(slot: string, orgId: number | null, propertyId?: number) {
  // 1. Property own
  if (propertyId !== undefined) {
    const propSlot = await prisma.incentivePropertySlot.findUnique({
      where: { propertyId_slot: { propertyId, slot } },
      include: { package: { include: PACKAGE_INCLUDE } },
    })
    if (propSlot !== null) {
      // Row exists (could be packageId=null for explicit disable)
      if (!propSlot.packageId || !propSlot.package?.isActive) return { packageId: null, from: 'own' as const, pkg: null }
      return { packageId: propSlot.packageId, from: 'own' as const, pkg: propSlot.package }
    }
  }

  // 2. Chain
  if (orgId !== null) {
    const chainSlot = await prisma.incentiveChainSlot.findUnique({
      where: { organizationId_slot: { organizationId: orgId, slot } },
      include: { package: { include: PACKAGE_INCLUDE } },
    })
    if (chainSlot !== null) {
      if (!chainSlot.packageId || !chainSlot.package?.isActive) return { packageId: null, from: 'chain' as const, pkg: null }
      return { packageId: chainSlot.packageId, from: 'chain' as const, pkg: chainSlot.package }
    }
  }

  // 3. System (respect visibleToChains / visibleToHotels)
  const sysSlot = await prisma.incentiveSystemSlot.findUnique({
    where: { slot },
    include: { package: { include: PACKAGE_INCLUDE } },
  })
  if (!sysSlot || !sysSlot.packageId || !sysSlot.package?.isActive) return null

  // Check visibility
  const pkg = sysSlot.package
  if (propertyId !== undefined && !pkg.visibleToHotels) return null
  if (propertyId === undefined && orgId !== null && !pkg.visibleToChains) return null

  return { packageId: sysSlot.packageId, from: 'system' as const, pkg }
}

// Get slot assignments for admin UI — returns own assignments + resolved value with inheritance
export async function getIncentiveSlots(orgId: number | null, propertyId?: number) {
  // Fetch own assignments at this scope
  const own = propertyId !== undefined
    ? await prisma.incentivePropertySlot.findMany({
        where: { propertyId },
        include: { package: { include: PACKAGE_INCLUDE } },
      })
    : orgId !== null
      ? await prisma.incentiveChainSlot.findMany({
          where: { organizationId: orgId },
          include: { package: { include: PACKAGE_INCLUDE } },
        })
      : await prisma.incentiveSystemSlot.findMany({
          include: { package: { include: PACKAGE_INCLUDE } },
        })

  const ownBySlot = new Map(own.map(s => [s.slot, s]))

  // For each slot, resolve inherited value
  return Promise.all(SLOTS.map(async (slot) => {
    const ownEntry = ownBySlot.get(slot)
    const hasOwn = ownEntry !== undefined

    // ownEntry.packageId could be null (explicitly disabled) or a number (assigned)
    // If no own entry: inherit (undefined)
    const ownPkgId = hasOwn ? ownEntry.packageId : undefined

    // Resolve: find what the actual package is after inheritance
    const resolved = await resolveSlot(slot, orgId, propertyId)

    return {
      slot,
      packageId: ownPkgId,  // undefined=inherit, null=disabled, number=own assignment
      resolvedPackageId: resolved?.packageId ?? null,
      resolvedFrom: resolved?.from ?? null,
      resolvedPackage: resolved?.pkg
        ? { name: resolved.pkg.name, items: resolved.pkg.items.map((pi: any) => pi.item.text), fontSize: resolved.pkg.fontSize ?? 'md' }
        : null,
    }
  }))
}

export async function setIncentiveSlot(
  slot: string,
  orgId: number | null,
  propertyId: number | undefined,
  packageId: number | null | undefined  // undefined = delete (revert to inherit)
) {
  if (propertyId !== undefined) {
    if (packageId === undefined) {
      await prisma.incentivePropertySlot.deleteMany({ where: { propertyId, slot } })
    } else {
      await prisma.incentivePropertySlot.upsert({
        where: { propertyId_slot: { propertyId, slot } },
        create: { propertyId, slot, packageId },
        update: { packageId },
      })
    }
    return
  }
  if (orgId !== null) {
    if (packageId === undefined) {
      await prisma.incentiveChainSlot.deleteMany({ where: { organizationId: orgId, slot } })
    } else {
      await prisma.incentiveChainSlot.upsert({
        where: { organizationId_slot: { organizationId: orgId, slot } },
        create: { organizationId: orgId, slot, packageId },
        update: { packageId },
      })
    }
    return
  }
  // System level
  if (packageId === undefined) {
    await prisma.incentiveSystemSlot.deleteMany({ where: { slot } })
  } else {
    await prisma.incentiveSystemSlot.upsert({
      where: { slot },
      create: { slot, packageId },
      update: { packageId },
    })
  }
}

// ── Public resolvers ──────────────────────────────────────────────────────────

export async function resolveIncentiveSlotsForProperty(propertyId: number) {
  // Need the property's orgId for chain inheritance
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { organizationId: true } })
  const orgId = property?.organizationId ?? null

  const [hotelPage, roomBanner, roomResults] = await Promise.all([
    resolveSlot('hotel_page', orgId, propertyId),
    resolveSlot('room_banner', orgId, propertyId),
    resolveSlot('room_results', orgId, propertyId),
  ])

  function toDisplay(r: Awaited<ReturnType<typeof resolveSlot>>) {
    if (!r?.pkg) return null
    return { name: r.pkg.name, items: r.pkg.items.map((pi: any) => pi.item.text), fontSize: r.pkg.fontSize ?? 'md' }
  }

  return {
    chainPage: null,
    hotelPage: toDisplay(hotelPage),
    roomBanner: toDisplay(roomBanner),
    roomResults: toDisplay(roomResults),
  }
}

export async function resolveIncentiveSlotsForChain(orgId: number) {
  const settings = await prisma.orgSettings.findUnique({ where: { organizationId: orgId } })
  if (settings && !settings.incentivesEnabled) {
    return { chainPage: null, hotelPage: null, roomBanner: null, roomResults: null }
  }

  const [chainPage, hotelPage, roomBanner, roomResults] = await Promise.all([
    resolveSlot('chain_page', orgId, undefined),
    resolveSlot('hotel_page', orgId, undefined),
    resolveSlot('room_banner', orgId, undefined),
    resolveSlot('room_results', orgId, undefined),
  ])

  function toDisplay(r: Awaited<ReturnType<typeof resolveSlot>>) {
    if (!r?.pkg) return null
    return { name: r.pkg.name, items: r.pkg.items.map((pi: any) => pi.item.text), fontSize: r.pkg.fontSize ?? 'md' }
  }

  return {
    chainPage: toDisplay(chainPage),
    hotelPage: toDisplay(hotelPage),
    roomBanner: toDisplay(roomBanner),
    roomResults: toDisplay(roomResults),
  }
}

export async function setPropertyItemOverride(propertyId: number, itemId: number, disabled: boolean) {
  await prisma.incentivePropertyItemOverride.upsert({
    where: { propertyId_itemId: { propertyId, itemId } },
    create: { propertyId, itemId, disabled },
    update: { disabled },
  })
}

export async function getIncentiveChainConfig(orgId: number) {
  const settings = await prisma.orgSettings.findUnique({ where: { organizationId: orgId } })
  return { incentivesEnabled: settings?.incentivesEnabled ?? true }
}

export async function setIncentiveChainEnabled(orgId: number, enabled: boolean) {
  await prisma.orgSettings.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, incentivesEnabled: enabled },
    update: { incentivesEnabled: enabled },
  })
  return { incentivesEnabled: enabled }
}
