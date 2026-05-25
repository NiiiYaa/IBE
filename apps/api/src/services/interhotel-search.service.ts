/**
 * InterHotel Search Service — core algorithm.
 *
 * Splits a stay across two (or three) hotels in the same organisation:
 * 1. Resolve effective config for propertyId. If !enabled → empty result.
 * 2. If totalNights < 2 → empty result.
 * 3. Fetch primary property's organizationId.
 * 4. Fetch nearby hotels; filter to active + same org. Cap at maxHotels-1.
 * 5. Binary-search Hotel A to find the largest n ∈ [1, totalNights-1] where
 *    it has rooms for [checkIn, checkIn+n] (lightweight probe via searchAvailability).
 * 6. If no split found → empty result.
 * 7. Confirm Hotel A segment via full search().
 * 8. For each nearby Hotel B: search() for [splitDate, checkOut].
 *    If has rooms → emit 2-hotel package.
 * 9. For maxHotels ≥ 3: for each B with no full coverage, binary-search B for a
 *    sub-split, then search each remaining hotel C for the remainder → 3-hotel packages.
 * 10. Sort: fewest segments first, then longest first-hotel stay descending.
 */

import type {
  SearchParams,
  InterHotelSearchResponse,
  InterHotelPackageResponse,
  InterHotelSegment,
  InterHotelEffective,
  PropertySearchResult,
} from '@ibe/shared'
import { addDays, nightsBetween } from '@ibe/shared'
import { resolveEffectiveInterHotelConfig } from './interhotel-config.service.js'
import { getNearbyHotels } from './interhotel-nearby.service.js'
import { searchAvailability } from '../adapters/hyperguest/search.js'
import { search } from './search.service.js'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'

// ── Public entry point ────────────────────────────────────────────────────────

export interface InterHotelSearchParams {
  propertyId: number
  checkIn: string
  checkOut: string
  rooms: Array<{ adults: number; childAges?: number[] }>
  nationality?: string
  currency?: string
}

export async function searchInterHotel(
  params: InterHotelSearchParams,
): Promise<InterHotelSearchResponse> {
  const config = await resolveEffectiveInterHotelConfig(params.propertyId)

  if (!config.enabled) {
    return { packages: [] }
  }

  const totalNights = nightsBetween(params.checkIn, params.checkOut)
  if (totalNights < 2) {
    return { packages: [] }
  }

  // Fetch primary property org
  const primaryProp = await prisma.property.findUnique({
    where: { propertyId: params.propertyId },
    select: { organizationId: true },
  })
  if (!primaryProp) {
    return { packages: [] }
  }
  const { organizationId } = primaryProp

  // Fetch and filter nearby hotels
  const rawNearby = await getNearbyHotels(params.propertyId)
  const maxCandidates = config.maxHotels - 1
  const nearbyIds = await filterNearbyHotels(rawNearby, organizationId, maxCandidates)

  if (nearbyIds.length === 0) {
    return { packages: [] }
  }

  // Binary search on Hotel A: find largest split in [1, totalNights-1]
  const splitNights = await findSplitNights(
    params.propertyId,
    params.checkIn,
    params.rooms,
    1,
    totalNights - 1,
    params.nationality,
    params.currency,
  )

  if (splitNights === null) {
    // Hotel A has zero availability — offer nearby hotels for the full stay instead
    const packages: InterHotelPackageResponse[] = []
    for (const hotelBId of nearbyIds) {
      const segment = await confirmSegment(
        hotelBId,
        params.checkIn,
        params.checkOut,
        params.rooms,
        params.nationality,
        params.currency,
      )
      if (segment) packages.push(buildPackage([segment], config))
    }
    return { packages }
  }

  const splitDate = addDays(params.checkIn, splitNights)

  // Confirm Hotel A segment (full search)
  const segmentA = await confirmSegment(
    params.propertyId,
    params.checkIn,
    splitDate,
    params.rooms,
    params.nationality,
    params.currency,
  )

  if (!segmentA) {
    return { packages: [] }
  }

  const packages: InterHotelPackageResponse[] = []

  // Build 2-hotel packages
  for (const hotelBId of nearbyIds) {
    const segmentB = await confirmSegment(
      hotelBId,
      splitDate,
      params.checkOut,
      params.rooms,
      params.nationality,
      params.currency,
    )

    if (segmentB) {
      const pkg = buildPackage([segmentA, segmentB], config)
      packages.push(pkg)
    } else if (config.maxHotels >= 3) {
      // Hotel B can't cover [splitDate, checkOut] fully — try a 3-hotel split
      const subSplitNights = await findSplitNights(
        hotelBId,
        splitDate,
        params.rooms,
        1,
        nightsBetween(splitDate, params.checkOut) - 1,
        params.nationality,
        params.currency,
      )

      if (subSplitNights === null) continue

      const subSplitDate = addDays(splitDate, subSplitNights)

      const confirmedB = await confirmSegment(
        hotelBId,
        splitDate,
        subSplitDate,
        params.rooms,
        params.nationality,
        params.currency,
      )

      if (!confirmedB) continue

      // Remaining candidates for Hotel C (exclude A and B)
      const candidatesC = nearbyIds.filter((id) => id !== hotelBId)

      for (const hotelCId of candidatesC) {
        const segmentC = await confirmSegment(
          hotelCId,
          subSplitDate,
          params.checkOut,
          params.rooms,
          params.nationality,
          params.currency,
        )

        if (segmentC) {
          const pkg = buildPackage([segmentA, confirmedB, segmentC], config)
          packages.push(pkg)
        }
      }
    }
  }

  // Sort: fewest segments first, then longest first-hotel stay (desc)
  packages.sort((a, b) => {
    const segDiff = a.segments.length - b.segments.length
    if (segDiff !== 0) return segDiff
    const aNights = nightsBetween(a.segments[0]!.checkIn, a.segments[0]!.checkOut)
    const bNights = nightsBetween(b.segments[0]!.checkIn, b.segments[0]!.checkOut)
    return bNights - aNights // descending
  })

  return { packages }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Filter nearby hotel rows to those that are active and belong to the same org.
 * Returns up to `max` property IDs.
 */
async function filterNearbyHotels(
  nearby: { nearbyPropertyId: number; distanceKm: number }[],
  organizationId: number,
  max: number,
): Promise<number[]> {
  const result: number[] = []

  for (const row of nearby) {
    if (result.length >= max) break

    const prop = await prisma.property.findUnique({
      where: { propertyId: row.nearbyPropertyId },
      select: { status: true, organizationId: true },
    })

    if (
      prop &&
      prop.status === 'active' &&
      prop.organizationId === organizationId
    ) {
      const nearbyConfig = await resolveEffectiveInterHotelConfig(row.nearbyPropertyId)
      if (nearbyConfig.enabled) {
        result.push(row.nearbyPropertyId)
      }
    }
  }

  return result
}

/**
 * Binary search: find the largest n ∈ [lo, hi] where the hotel has rooms for
 * [checkIn, checkIn+n]. Uses searchAvailability as a lightweight probe.
 * Returns null if no n in range works.
 */
async function findSplitNights(
  hotelId: number,
  checkIn: string,
  rooms: Array<{ adults: number; childAges?: number[] }>,
  lo: number,
  hi: number,
  nationality?: string,
  currency?: string,
): Promise<number | null> {
  let best: number | null = null

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const checkOut = addDays(checkIn, mid)

    const params: SearchParams = {
      hotelId,
      checkIn,
      checkOut,
      rooms,
      ...(nationality ? { nationality } : {}),
      ...(currency ? { currency } : {}),
    }

    try {
      const response = await searchAvailability(params)
      const hasRooms = response.results.some((r) => r.rooms.length > 0)

      if (hasRooms) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    } catch (err) {
      logger.warn({ err, hotelId, checkIn, checkOut }, '[InterHotelSearch] searchAvailability probe failed')
      hi = mid - 1
    }
  }

  return best
}

/**
 * Confirm a segment using the full search() pipeline.
 * Returns the segment if the result has at least one room, otherwise null.
 */
async function confirmSegment(
  hotelId: number,
  checkIn: string,
  checkOut: string,
  rooms: Array<{ adults: number; childAges?: number[] }>,
  nationality?: string,
  currency?: string,
): Promise<InterHotelSegment | null> {
  const params: SearchParams = {
    hotelId,
    checkIn,
    checkOut,
    rooms,
    ...(nationality ? { nationality } : {}),
    ...(currency ? { currency } : {}),
  }

  try {
    const response = await search(params)
    const result = response.results.find((r) => r.rooms.length > 0)
    if (!result) return null

    return { checkIn, checkOut, result }
  } catch (err) {
    logger.warn({ err, hotelId, checkIn, checkOut }, '[InterHotelSearch] segment confirmation failed')
    return null
  }
}

/**
 * Compute totalFromPrice by summing the minimum sell price across segments.
 * Minimum sell price of a segment = min over all rooms × all rates of rate.prices.sell.amount.
 */
function minSellPrice(result: PropertySearchResult): number {
  let min = Infinity
  for (const room of result.rooms) {
    for (const rate of room.rates) {
      if (rate.prices.sell.amount < min) {
        min = rate.prices.sell.amount
      }
    }
  }
  return min === Infinity ? 0 : min
}

function buildPackage(
  segments: InterHotelSegment[],
  config: InterHotelEffective,
): InterHotelPackageResponse {
  const totalFromPrice = segments.reduce((sum, seg) => sum + minSellPrice(seg.result), 0)
  const currency = segments[0]!.result.rooms[0]?.rates[0]?.prices.sell.currency ?? config.sponsoredCurrency

  return {
    segments,
    transferType: config.transferType,
    sponsoredAmount: config.sponsoredAmount,
    sponsoredCurrency: config.sponsoredCurrency,
    totalFromPrice,
    currency,
  }
}
