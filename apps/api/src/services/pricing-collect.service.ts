import { addDays, todayIso, calculateCancellationDeadline } from '@ibe/shared'
import type { HGSearchResponse, HGCancellationPolicy } from '@ibe/shared'
import { searchAvailability } from '../adapters/hyperguest/search.js'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'
import { resolveEffectivePricingConfig } from './pricing-config.service.js'

const WINDOW_DAYS = 29
const TOTAL_DAYS = 365

// Near-term windows use a small checkIn span so HG returns rates representative of each specific date.
// Searching checkIn=today for 29 nights would bias many future nights toward NR (cancellation window
// for the FIRST night has already passed, so HG may only surface NR rate plans).
function buildSearchWindows(): Array<{ offset: number; size: number }> {
  const windows: Array<{ offset: number; size: number }> = [
    { offset: 0, size: 2 },  // today + tomorrow
    { offset: 2, size: 6 },  // today+2 → today+8
  ]
  let offset = 8
  while (offset < TOTAL_DAYS) {
    windows.push({ offset, size: Math.min(WINDOW_DAYS, TOTAL_DAYS - offset) })
    offset += WINDOW_DAYS
  }
  return windows
}

interface NightlyPrice {
  date: string
  minSellPrice: number
  currency: string
  available: boolean
  cheapestRoomId: number | null
  cheapestRoomName: string | null
  cheapestBoard: string | null
  cheapestCancellationLabel: string | null
}

interface OfferEntry {
  date: string
  roomId: number
  roomName: string
  board: string
  cancellationLabel: 'Free' | 'Non-refundable'
  sellPrice: number
  currency: string
}

// A rate is Free only if the FIRST penalty window hasn't opened yet (i.e., we're before the earliest penalty deadline).
// HG encodes NR-at-checkin as timeFromCheckIn:0 + another policy with larger timeFromCheckIn.
// Using .some() would see the timeFromCheckIn:0 deadline (= checkIn date, always future) and wrongly classify NR as Free.
// Correct approach: find the MINIMUM deadline across all policies — that's when the first penalty kicks in.
// If that earliest deadline is still in the future, the free-cancel window is still open.
export function deriveCancellationLabel(policies: HGCancellationPolicy[], checkIn: string): 'Free' | 'Non-refundable' {
  if (policies.length === 0) return 'Non-refundable'
  const now = Date.now()
  let earliestPenaltyMs: number | null = null
  for (const p of policies) {
    if (!p.timeSetting) continue
    const deadline = calculateCancellationDeadline(checkIn, p.timeSetting.timeFromCheckIn, p.timeSetting.timeFromCheckInType, p.cancellationDeadlineHour)
    const ms = Date.parse(deadline)
    if (isNaN(ms)) continue
    if (earliestPenaltyMs === null || ms < earliestPenaltyMs) earliestPenaltyMs = ms
  }
  if (earliestPenaltyMs === null) return 'Non-refundable'
  return earliestPenaltyMs > now ? 'Free' : 'Non-refundable'
}

export interface CollectProgressCallback {
  (windowsDone: number, totalWindows: number, offerCount: number): void
}

export async function collectHotelPrices(propertyId: number, onProgress?: CollectProgressCallback): Promise<void> {
  logger.info({ propertyId }, '[Pricing] collectHotelPrices started')
  const property = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  if (!property) throw new Error(`Property ${propertyId} not found`)

  const { searchAdults, maxOffersForAnalysis } = await resolveEffectivePricingConfig(propertyId)

  const today = todayIso()
  const prices: NightlyPrice[] = []
  const searchWindows = buildSearchWindows()
  const totalWindows = searchWindows.length
  let windowsDone = 0
  let totalOfferCount = 0

  for (const win of searchWindows) {
    const checkIn = addDays(today, win.offset)
    const checkOut = addDays(today, win.offset + win.size)

    try {
      const hgResponse = await searchAvailability({
        hotelId: propertyId,
        checkIn,
        checkOut,
        rooms: [{ adults: searchAdults }],
      })
      const { prices: windowPrices, offersByDate } = extractNightlyData(hgResponse, checkIn, win.size)
      prices.push(...windowPrices)
      await upsertDailyRateOffers(propertyId, offersByDate, maxOffersForAnalysis)
      for (const offers of offersByDate.values()) totalOfferCount += offers.length
    } catch (err) {
      logger.warn({ err, propertyId, checkIn }, '[Pricing] Batch search failed — marking window unavailable')
      for (let i = 0; i < win.size; i++) {
        prices.push({
          date: addDays(today, win.offset + i),
          minSellPrice: 0, currency: 'USD', available: false,
          cheapestRoomId: null, cheapestRoomName: null, cheapestBoard: null, cheapestCancellationLabel: null,
        })
      }
    }

    windowsDone++
    onProgress?.(windowsDone, totalWindows, totalOfferCount)
  }

  logger.info({ propertyId, priceCount: prices.length }, '[Pricing] collectHotelPrices upserting')
  await upsertDailyRates(propertyId, prices)
  logger.info({ propertyId }, '[Pricing] collectHotelPrices done')
}

function extractNightlyData(
  hgResponse: HGSearchResponse,
  checkIn: string,
  windowSize: number,
): { prices: NightlyPrice[]; offersByDate: Map<string, OfferEntry[]> } {
  const byDateMin = new Map<string, number>()
  const offersByDate = new Map<string, OfferEntry[]>()
  let currency = 'USD'

  for (const result of hgResponse.results) {
    for (const room of result.rooms) {
      const { roomId, roomName } = room
      for (const rp of room.ratePlans) {
        currency = rp.prices.sell.currency
        const board = rp.board as string

        for (const night of rp.nightlyBreakdown) {
          const price = night.prices.sell.price
          const existing = byDateMin.get(night.date)
          if (existing === undefined || price < existing) byDateMin.set(night.date, price)

          // Use the night's own date as checkIn so the deadline check reflects
          // whether free cancellation is still available for that specific stay date
          const cancellationLabel = deriveCancellationLabel(rp.cancellationPolicies, night.date)
          const offers = offersByDate.get(night.date) ?? []
          offers.push({ date: night.date, roomId, roomName, board, cancellationLabel, sellPrice: price, currency })
          offersByDate.set(night.date, offers)
        }
      }
    }
  }

  const prices: NightlyPrice[] = []
  for (let i = 0; i < windowSize; i++) {
    const date = addDays(checkIn, i)
    const price = byDateMin.get(date)
    const dateOffers = offersByDate.get(date)
    const cheapest = dateOffers ? [...dateOffers].sort((a, b) => a.sellPrice - b.sellPrice)[0] : undefined

    prices.push(
      price !== undefined
        ? {
            date, minSellPrice: price, currency, available: true,
            cheapestRoomId: cheapest?.roomId ?? null,
            cheapestRoomName: cheapest?.roomName ?? null,
            cheapestBoard: cheapest?.board ?? null,
            cheapestCancellationLabel: cheapest?.cancellationLabel ?? null,
          }
        : { date, minSellPrice: 0, currency, available: false, cheapestRoomId: null, cheapestRoomName: null, cheapestBoard: null, cheapestCancellationLabel: null },
    )
  }

  return { prices, offersByDate }
}

async function upsertDailyRateOffers(
  propertyId: number,
  offersByDate: Map<string, OfferEntry[]>,
  maxOffers: number,
): Promise<void> {
  const dates = [...offersByDate.keys()]
  if (dates.length === 0) return

  await prisma.dailyRateOffer.deleteMany({ where: { propertyId, date: { in: dates } } })

  const rows: Array<{
    propertyId: number; date: string; roomId: number; roomName: string
    board: string; cancellationLabel: string; sellPrice: number; currency: string; rank: number
  }> = []

  for (const [date, offers] of offersByDate.entries()) {
    const sorted = [...offers].sort((a, b) => a.sellPrice - b.sellPrice).slice(0, maxOffers)
    sorted.forEach((o, i) => {
      rows.push({
        propertyId, date, roomId: o.roomId, roomName: o.roomName,
        board: o.board, cancellationLabel: o.cancellationLabel,
        sellPrice: o.sellPrice, currency: o.currency, rank: i + 1,
      })
    })
  }

  if (rows.length > 0) await prisma.dailyRateOffer.createMany({ data: rows })
}

async function upsertDailyRates(propertyId: number, prices: NightlyPrice[]): Promise<void> {
  for (const p of prices) {
    await prisma.dailyRate.upsert({
      where: { propertyId_date: { propertyId, date: p.date } },
      create: {
        propertyId, date: p.date, minSellPrice: p.minSellPrice,
        currency: p.currency, available: p.available, collectedAt: new Date(),
        cheapestRoomId: p.cheapestRoomId, cheapestRoomName: p.cheapestRoomName,
        cheapestBoard: p.cheapestBoard, cheapestCancellationLabel: p.cheapestCancellationLabel,
      },
      update: {
        minSellPrice: p.minSellPrice, currency: p.currency,
        available: p.available, collectedAt: new Date(),
        cheapestRoomId: p.cheapestRoomId, cheapestRoomName: p.cheapestRoomName,
        cheapestBoard: p.cheapestBoard, cheapestCancellationLabel: p.cheapestCancellationLabel,
      },
    })
  }
}
