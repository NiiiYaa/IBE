import { prisma } from '../db/client.js'

const PACKAGE_INCLUDE = {
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: { item: true },
  },
}

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
  showOnChainPage: boolean
  showOnHotelPage: boolean
  roomPageMode: string | null
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
  // Fetch property overrides first so overridden packages are always included even if visibility changed
  const propertyOverrides = propertyId !== undefined
    ? await prisma.incentivePropertyPackageOverride.findMany({ where: { propertyId } })
    : []
  const overriddenPackageIds = propertyOverrides.map(o => o.packageId)

  const [rows, chainOverrides] = await Promise.all([
    prisma.incentivePackage.findMany({
      where: hotelView
        ? { OR: [
            ...(orgId !== null ? [{ organizationId: orgId, visibleToHotels: true }] : []),
            { organizationId: null, visibleToHotels: true },
            ...(overriddenPackageIds.length > 0 ? [{ id: { in: overriddenPackageIds } }] : []),
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
    }),
    orgId !== null && !hotelView
      ? prisma.incentiveChainPackageOverride.findMany({ where: { organizationId: orgId } })
      : Promise.resolve([]),
  ])

  const chainDisabledIds = new Set(chainOverrides.filter(o => o.disabled).map(o => o.packageId))
  const propertyDisabledIds = new Set(propertyOverrides.filter(o => o.disabled).map(o => o.packageId))
  return rows.map(pkg => ({
    ...toPackageResponse(pkg),
    ...(orgId !== null && !hotelView ? { chainDisabled: chainDisabledIds.has(pkg.id) } : {}),
    ...(propertyId !== undefined ? { propertyDisabled: propertyDisabledIds.has(pkg.id) } : {}),
  }))
}

export async function createIncentivePackage(
  orgId: number | null,
  data: {
    name: string
    isActive?: boolean
    showOnChainPage?: boolean
    showOnHotelPage?: boolean
    roomPageMode?: string | null
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
      showOnChainPage: data.showOnChainPage ?? false,
      showOnHotelPage: data.showOnHotelPage ?? false,
      roomPageMode: data.roomPageMode ?? null,
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
    showOnChainPage?: boolean
    showOnHotelPage?: boolean
    roomPageMode?: string | null
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
      ...(data.showOnChainPage !== undefined && { showOnChainPage: data.showOnChainPage }),
      ...(data.showOnHotelPage !== undefined && { showOnHotelPage: data.showOnHotelPage }),
      ...('roomPageMode' in data && { roomPageMode: data.roomPageMode ?? null }),
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

// ── Property config ───────────────────────────────────────────────────────────

export async function getIncentivePropertyConfig(propertyId: number) {
  const row = await prisma.incentivePropertyConfig.findUnique({
    where: { propertyId },
    include: { package: { include: PACKAGE_INCLUDE } },
  })
  if (!row) return null
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    package: toPackageResponse(row.package),
  }
}

export async function upsertIncentivePropertyConfig(
  propertyId: number,
  data: {
    packageId: number
    enabled?: boolean
    showOnHotelPage?: boolean
    roomPageMode?: string | null
  },
) {
  const row = await prisma.incentivePropertyConfig.upsert({
    where: { propertyId },
    create: {
      propertyId,
      packageId: data.packageId,
      enabled: data.enabled ?? true,
      showOnHotelPage: data.showOnHotelPage ?? false,
      roomPageMode: data.roomPageMode ?? null,
    },
    update: {
      packageId: data.packageId,
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.showOnHotelPage !== undefined && { showOnHotelPage: data.showOnHotelPage }),
      ...('roomPageMode' in data && { roomPageMode: data.roomPageMode ?? null }),
    },
    include: { package: { include: PACKAGE_INCLUDE } },
  })
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    package: toPackageResponse(row.package),
  }
}

export async function deleteIncentivePropertyConfig(propertyId: number) {
  await prisma.incentivePropertyConfig.delete({ where: { propertyId } })
}

// ── Packages available for assignment (chain sees own + system visible to hotels) ──

export async function listAssignablePackages(orgId: number | null, propertyId?: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = orgId === null
    ? { organizationId: null }
    : { OR: [
        { organizationId: orgId, isActive: true, visibleToHotels: true },
        { organizationId: null, isActive: true, OR: [{ visibleToChains: true }, { visibleToHotels: true }] },
        ...(propertyId !== undefined ? [{ propertyId, isActive: true }] : []),
      ] }

  const rows = await prisma.incentivePackage.findMany({
    where,
    orderBy: [{ organizationId: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    include: PACKAGE_INCLUDE,
  })
  return rows.map(toPackageResponse)
}

// ── Public resolvers ──────────────────────────────────────────────────────────

export async function resolveIncentiveForProperty(propertyId: number) {
  const config = await prisma.incentivePropertyConfig.findUnique({
    where: { propertyId },
    include: { package: { include: PACKAGE_INCLUDE } },
  })
  if (!config || !config.enabled || !config.package.isActive) return null
  return {
    name: config.package.name,
    items: config.package.items.map(pi => pi.item.text),
    showOnChainPage: false,
    showOnHotelPage: config.showOnHotelPage,
    roomPageMode: config.roomPageMode ?? null,
  }
}

export async function setChainPackageOverride(orgId: number, packageId: number, disabled: boolean) {
  await prisma.incentiveChainPackageOverride.upsert({
    where: { organizationId_packageId: { organizationId: orgId, packageId } },
    create: { organizationId: orgId, packageId, disabled },
    update: { disabled },
  })
}

export async function setPropertyItemOverride(propertyId: number, itemId: number, disabled: boolean) {
  await prisma.incentivePropertyItemOverride.upsert({
    where: { propertyId_itemId: { propertyId, itemId } },
    create: { propertyId, itemId, disabled },
    update: { disabled },
  })
}

export async function setPropertyPackageOverride(propertyId: number, packageId: number, disabled: boolean) {
  await prisma.incentivePropertyPackageOverride.upsert({
    where: { propertyId_packageId: { propertyId, packageId } },
    create: { propertyId, packageId, disabled },
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

export async function resolveChainIncentive(orgId: number) {
  const settings = await prisma.orgSettings.findUnique({ where: { organizationId: orgId } })
  if (settings && !settings.incentivesEnabled) return null

  const pkg = await prisma.incentivePackage.findFirst({
    where: { organizationId: orgId, isActive: true, showOnChainPage: true },
    orderBy: { createdAt: 'asc' },
    include: PACKAGE_INCLUDE,
  })
  if (pkg) {
    return {
      name: pkg.name,
      items: pkg.items.map(pi => pi.item.text),
      showOnChainPage: true,
      showOnHotelPage: pkg.showOnHotelPage,
      roomPageMode: pkg.roomPageMode ?? null,
    }
  }
  // Fall back to system package visible to chains with showOnChainPage (respecting chain overrides)
  const disabledOverrides = await prisma.incentiveChainPackageOverride.findMany({
    where: { organizationId: orgId, disabled: true },
    select: { packageId: true },
  })
  const disabledIds = disabledOverrides.map(o => o.packageId)

  const sysPkg = await prisma.incentivePackage.findFirst({
    where: {
      organizationId: null, isActive: true, showOnChainPage: true, visibleToChains: true,
      ...(disabledIds.length > 0 && { id: { notIn: disabledIds } }),
    },
    orderBy: { createdAt: 'asc' },
    include: PACKAGE_INCLUDE,
  })
  if (!sysPkg) return null
  return {
    name: sysPkg.name,
    items: sysPkg.items.map(pi => pi.item.text),
    showOnChainPage: true,
    showOnHotelPage: sysPkg.showOnHotelPage,
    roomPageMode: sysPkg.roomPageMode ?? null,
  }
}
