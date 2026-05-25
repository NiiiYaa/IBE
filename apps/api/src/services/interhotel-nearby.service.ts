import { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import { resolveEffectiveInterHotelConfig } from './interhotel-config.service.js'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function backfillCoordinates(propertyIds: number[]): Promise<void> {
  const missing = await prisma.property.findMany({
    where: {
      propertyId: { in: propertyIds },
      OR: [
        { propertyDataProviderConfig: null },
        { propertyDataProviderConfig: { lat: null } },
      ],
    },
    select: { propertyId: true },
  })
  // Batch HyperGuest API calls to avoid overwhelming the connection pool
  const BACKFILL_BATCH = 10
  for (let i = 0; i < missing.length; i += BACKFILL_BATCH) {
    await Promise.allSettled(missing.slice(i, i + BACKFILL_BATCH).map(async ({ propertyId }) => {
      try {
        const raw = await fetchPropertyStatic(propertyId)
        const lat = raw.coordinates?.latitude ?? null
        const lng = raw.coordinates?.longitude ?? null
        if (lat == null || lng == null) return
        await prisma.propertyDataProviderConfig.upsert({
          where: { propertyId },
          create: { propertyId, useOrg: true, lat, lng },
          update: { lat, lng },
        })
      } catch {
        // skip properties whose HG data can't be fetched
      }
    }))
  }
}

// Bulk upsert pairs via a single SQL statement per chunk — far faster than individual upserts
// and avoids Render request timeouts on large chains. manuallySelected is intentionally excluded
// from the UPDATE clause so existing overrides are preserved.
async function bulkUpsertPairs(
  pairs: Array<{ propertyId: number; nearbyPropertyId: number; distanceKm: number }>,
): Promise<void> {
  if (pairs.length === 0) return
  // PostgreSQL limit is 65535 parameters; each row uses 3 → max ~21000 rows per statement
  const CHUNK = 5000
  for (let i = 0; i < pairs.length; i += CHUNK) {
    const chunk = pairs.slice(i, i + CHUNK)
    await prisma.$executeRaw`
      INSERT INTO "NearbyHotel" ("propertyId", "nearbyPropertyId", "distanceKm", "updatedAt")
      VALUES ${Prisma.join(chunk.map(p => Prisma.sql`(${p.propertyId}, ${p.nearbyPropertyId}, ${p.distanceKm}, NOW())`))}
      ON CONFLICT ("propertyId", "nearbyPropertyId")
      DO UPDATE SET "distanceKm" = EXCLUDED."distanceKm", "updatedAt" = NOW()
    `
  }
}

// Refresh: store ALL org property pairs (not radius-filtered); preserves manuallySelected overrides
export async function refreshNearbyHotels(orgId: number): Promise<{ count: number }> {
  const properties = await prisma.property.findMany({
    where: { organizationId: orgId, status: 'active' },
    select: { propertyId: true },
  })

  await backfillCoordinates(properties.map(p => p.propertyId))

  const propertiesWithCoords = await prisma.property.findMany({
    where: { organizationId: orgId, status: 'active' },
    select: {
      propertyId: true,
      propertyDataProviderConfig: { select: { lat: true, lng: true } },
    },
  })

  const withCoords = propertiesWithCoords.filter(
    (p) => p.propertyDataProviderConfig?.lat != null && p.propertyDataProviderConfig?.lng != null,
  ) as Array<{ propertyId: number; propertyDataProviderConfig: { lat: number; lng: number } }>

  if (withCoords.length < 2) return { count: 0 }

  // Build all pairs (data only — no DB calls yet)
  type Pair = { propertyId: number; nearbyPropertyId: number; distanceKm: number }
  const pairs: Pair[] = []
  for (const a of withCoords) {
    for (const b of withCoords) {
      if (a.propertyId === b.propertyId) continue
      pairs.push({
        propertyId: a.propertyId,
        nearbyPropertyId: b.propertyId,
        distanceKm: haversineKm(
          a.propertyDataProviderConfig.lat,
          a.propertyDataProviderConfig.lng,
          b.propertyDataProviderConfig.lat,
          b.propertyDataProviderConfig.lng,
        ),
      })
    }
  }

  await bulkUpsertPairs(pairs)
  return { count: pairs.length }
}

// Refresh pairs involving a single property (as source and target) within its org
export async function refreshNearbyHotelsForProperty(propertyId: number): Promise<{ count: number }> {
  const prop = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  if (!prop) return { count: 0 }

  const orgProperties = await prisma.property.findMany({
    where: { organizationId: prop.organizationId, status: 'active' },
    select: { propertyId: true },
  })

  await backfillCoordinates(orgProperties.map(p => p.propertyId))

  const withCoords = (await prisma.property.findMany({
    where: { organizationId: prop.organizationId, status: 'active' },
    select: { propertyId: true, propertyDataProviderConfig: { select: { lat: true, lng: true } } },
  })).filter(
    p => p.propertyDataProviderConfig?.lat != null && p.propertyDataProviderConfig?.lng != null,
  ) as Array<{ propertyId: number; propertyDataProviderConfig: { lat: number; lng: number } }>

  const target = withCoords.find(p => p.propertyId === propertyId)
  if (!target || withCoords.length < 2) return { count: 0 }

  type Pair = { propertyId: number; nearbyPropertyId: number; distanceKm: number }
  const pairs: Pair[] = []
  for (const other of withCoords) {
    if (other.propertyId === propertyId) continue
    const d = haversineKm(
      target.propertyDataProviderConfig.lat,
      target.propertyDataProviderConfig.lng,
      other.propertyDataProviderConfig.lat,
      other.propertyDataProviderConfig.lng,
    )
    pairs.push({ propertyId, nearbyPropertyId: other.propertyId, distanceKm: d })
    pairs.push({ propertyId: other.propertyId, nearbyPropertyId: propertyId, distanceKm: d })
  }

  await bulkUpsertPairs(pairs)
  return { count: pairs.length }
}

// Search-time: apply manual overrides + effective radius
export async function getNearbyHotels(
  propertyId: number,
): Promise<{ nearbyPropertyId: number; distanceKm: number }[]> {
  const config = await resolveEffectiveInterHotelConfig(propertyId)
  const rows = await prisma.nearbyHotel.findMany({
    where: {
      propertyId,
      OR: [
        { manuallySelected: true },
        { manuallySelected: null, distanceKm: { lte: config.maxRadiusKm } },
      ],
    },
    select: { nearbyPropertyId: true, distanceKm: true },
    orderBy: { distanceKm: 'asc' },
    take: config.maxHotels,
  })
  return rows
}

// Admin display: paginated list with manuallySelected state + isWithinRadius
export async function getNearbyHotelsForPropertyAdmin(
  propertyId: number,
  skip = 0,
  take = 10,
): Promise<{
  lastRefreshedAt: Date | null
  total: number
  nearby: { nearbyPropertyId: number; distanceKm: number; manuallySelected: boolean | null; isWithinRadius: boolean }[]
}> {
  const config = await resolveEffectiveInterHotelConfig(propertyId)

  const [total, rows] = await Promise.all([
    prisma.nearbyHotel.count({ where: { propertyId } }),
    prisma.nearbyHotel.findMany({
      where: { propertyId },
      select: { nearbyPropertyId: true, distanceKm: true, manuallySelected: true, updatedAt: true },
      orderBy: { distanceKm: 'asc' },
      skip,
      take,
    }),
  ])

  const lastRefreshedAt = rows.length > 0
    ? rows.reduce((max, r) => r.updatedAt > max ? r.updatedAt : max, rows[0]!.updatedAt)
    : null

  return {
    lastRefreshedAt,
    total,
    nearby: rows.map(r => ({
      nearbyPropertyId: r.nearbyPropertyId,
      distanceKm: r.distanceKm,
      manuallySelected: r.manuallySelected,
      isWithinRadius: r.distanceKm <= config.maxRadiusKm,
    })),
  }
}

// Set manual selection override for a single pair (null = reset to radius rule)
export async function setNearbyHotelSelection(
  propertyId: number,
  nearbyPropertyId: number,
  selected: boolean | null,
): Promise<void> {
  await prisma.nearbyHotel.updateMany({
    where: { propertyId, nearbyPropertyId },
    data: { manuallySelected: selected },
  })
}

// Org-level admin summary (refresh button context)
export async function getNearbyHotelsAdmin(orgId: number): Promise<{
  lastRefreshedAt: Date | null
  total: number
}> {
  const rows = await prisma.nearbyHotel.findMany({
    where: { property: { organizationId: orgId } },
    select: { updatedAt: true },
    take: 1,
    orderBy: { updatedAt: 'desc' },
  })
  const total = await prisma.nearbyHotel.count({ where: { property: { organizationId: orgId } } })
  return {
    lastRefreshedAt: rows[0]?.updatedAt ?? null,
    total,
  }
}
