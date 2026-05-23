import { addDays, todayIso } from '@ibe/shared'
import type { HGSearchResponse } from '@ibe/shared'
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
}

export async function collectHotelPrices(propertyId: number): Promise<void> {
  logger.info({ propertyId }, '[Pricing] collectHotelPrices started')
  const property = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  if (!property) throw new Error(`Property ${propertyId} not found`)

  const { searchAdults } = await resolveEffectivePricingConfig(propertyId)

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
      prices.push(...extractNightlyPrices(hgResponse, checkIn, windowSize))
    } catch (err) {
      logger.warn({ err, propertyId, checkIn }, '[Pricing] Batch search failed — marking window unavailable')
      for (let i = 0; i < windowSize; i++) {
        prices.push({ date: addDays(today, offset + i), minSellPrice: 0, currency: 'USD', available: false })
      }
    }

    offset += windowSize
  }

  logger.info({ propertyId, priceCount: prices.length }, '[Pricing] collectHotelPrices upserting')
  await upsertDailyRates(propertyId, prices)
  logger.info({ propertyId }, '[Pricing] collectHotelPrices done')
}

function extractNightlyPrices(hgResponse: HGSearchResponse, checkIn: string, windowSize: number): NightlyPrice[] {
  const byDate = new Map<string, number>()
  let currency = 'USD'

  for (const result of hgResponse.results) {
    for (const room of result.rooms) {
      for (const rp of room.ratePlans) {
        currency = rp.prices.sell.currency
        for (const night of rp.nightlyBreakdown) {
          const existing = byDate.get(night.date)
          if (existing === undefined || night.prices.sell.price < existing) {
            byDate.set(night.date, night.prices.sell.price)
          }
        }
      }
    }
  }

  const prices: NightlyPrice[] = []
  for (let i = 0; i < windowSize; i++) {
    const date = addDays(checkIn, i)
    const price = byDate.get(date)
    prices.push(
      price !== undefined
        ? { date, minSellPrice: price, currency, available: true }
        : { date, minSellPrice: 0, currency, available: false },
    )
  }
  return prices
}

async function upsertDailyRates(propertyId: number, prices: NightlyPrice[]): Promise<void> {
  for (const p of prices) {
    await prisma.dailyRate.upsert({
      where: { propertyId_date: { propertyId, date: p.date } },
      create: {
        propertyId, date: p.date, minSellPrice: p.minSellPrice,
        currency: p.currency, available: p.available, collectedAt: new Date(),
      },
      update: {
        minSellPrice: p.minSellPrice, currency: p.currency,
        available: p.available, collectedAt: new Date(),
      },
    })
  }
}
