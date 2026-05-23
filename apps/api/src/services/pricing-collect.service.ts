import { addDays, todayIso } from '@ibe/shared'
import type { HGSearchResponse, HGCancellationPolicy } from '@ibe/shared'
import { searchAvailability } from '../adapters/hyperguest/search.js'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'
import { resolveEffectivePricingConfig } from './pricing-config.service.js'

const WINDOW_DAYS = 29
const TOTAL_DAYS = 365

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
  cancellationLabel: 'Free' | 'Non-refundable' | 'Partial'
  sellPrice: number
  currency: string
}

// Simplification: 'amount' is checked without considering penaltyType ('nights' penalty treated same as currency/percent)
export function deriveCancellationLabel(policies: HGCancellationPolicy[]): 'Free' | 'Non-refundable' | 'Partial' {
  if (policies.length === 0) return 'Free'
  const hasZero = policies.some(p => p.amount === 0)
  const hasNonZero = policies.some(p => p.amount > 0)
  if (hasZero && hasNonZero) return 'Partial'
  if (hasNonZero) return 'Non-refundable'
  return 'Free'
}

export async function collectHotelPrices(propertyId: number): Promise<void> {
  logger.info({ propertyId }, '[Pricing] collectHotelPrices started')
  const property = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  if (!property) throw new Error(`Property ${propertyId} not found`)

  const { searchAdults, maxOffersForAnalysis } = await resolveEffectivePricingConfig(propertyId)

  const today = todayIso()
  const prices: NightlyPrice[] = []

  let offset = 0
  while (offset < TOTAL_DAYS) {
    const windowSize = Math.min(WINDOW_DAYS, TOTAL_DAYS - offset)
    const checkIn = addDays(today, offset)
    const checkOut = addDays(today, offset + windowSize)

    try {
      const hgResponse = await searchAvailability({
        hotelId: propertyId,
        checkIn,
        checkOut,
        rooms: [{ adults: searchAdults }],
      })
      const { prices: windowPrices, offersByDate } = extractNightlyData(hgResponse, checkIn, windowSize)
      prices.push(...windowPrices)
      await upsertDailyRateOffers(propertyId, offersByDate, maxOffersForAnalysis)
    } catch (err) {
      logger.warn({ err, propertyId, checkIn }, '[Pricing] Batch search failed — marking window unavailable')
      for (let i = 0; i < windowSize; i++) {
        prices.push({
          date: addDays(today, offset + i),
          minSellPrice: 0, currency: 'USD', available: false,
          cheapestRoomId: null, cheapestRoomName: null, cheapestBoard: null, cheapestCancellationLabel: null,
        })
      }
    }

    offset += windowSize
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
        const cancellationLabel = deriveCancellationLabel(rp.cancellationPolicies)

        for (const night of rp.nightlyBreakdown) {
          const price = night.prices.sell.price
          const existing = byDateMin.get(night.date)
          if (existing === undefined || price < existing) byDateMin.set(night.date, price)

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
