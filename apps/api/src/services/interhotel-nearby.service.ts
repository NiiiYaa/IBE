import { prisma } from '../db/client.js'
import { resolveEffectiveInterHotelConfig } from './interhotel-config.service.js'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function refreshNearbyHotels(orgId: number): Promise<{ count: number }> {
  const properties = await prisma.property.findMany({
    where: { organizationId: orgId, status: 'active' },
    select: {
      propertyId: true,
      propertyDataProviderConfig: { select: { lat: true, lng: true } },
    },
  })

  const withCoords = properties.filter(
    (p) => p.propertyDataProviderConfig?.lat != null && p.propertyDataProviderConfig?.lng != null,
  ) as Array<{ propertyId: number; propertyDataProviderConfig: { lat: number; lng: number } }>

  if (withCoords.length < 2) return { count: 0 }

  let count = 0
  const ops: Promise<unknown>[] = []

  for (const a of withCoords) {
    const config = await resolveEffectiveInterHotelConfig(a.propertyId)
    for (const b of withCoords) {
      if (a.propertyId === b.propertyId) continue
      const d = haversineKm(
        a.propertyDataProviderConfig.lat,
        a.propertyDataProviderConfig.lng,
        b.propertyDataProviderConfig.lat,
        b.propertyDataProviderConfig.lng,
      )
      if (d <= config.maxRadiusKm) {
        ops.push(
          prisma.nearbyHotel.upsert({
            where: {
              propertyId_nearbyPropertyId: {
                propertyId: a.propertyId,
                nearbyPropertyId: b.propertyId,
              },
            },
            create: { propertyId: a.propertyId, nearbyPropertyId: b.propertyId, distanceKm: d },
            update: { distanceKm: d },
          }),
        )
        count++
      } else {
        ops.push(
          prisma.nearbyHotel.deleteMany({
            where: { propertyId: a.propertyId, nearbyPropertyId: b.propertyId },
          }),
        )
      }
    }
  }

  await Promise.all(ops)
  return { count }
}

export async function getNearbyHotels(
  propertyId: number,
): Promise<{ nearbyPropertyId: number; distanceKm: number }[]> {
  const rows = await prisma.nearbyHotel.findMany({
    where: { propertyId },
    select: { nearbyPropertyId: true, distanceKm: true },
    orderBy: { distanceKm: 'asc' },
  })
  return rows.slice().sort((a, b) => a.distanceKm - b.distanceKm)
}
