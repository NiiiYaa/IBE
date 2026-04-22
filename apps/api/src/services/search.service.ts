/**
 * Search service — orchestrates the search flow:
 * 1. Validates params
 * 2. Calls HyperGuest search adapter
 * 3. Transforms raw HyperGuest response into IBE API shapes
 * 4. Persists SearchSession for meta replay on booking
 */

import { randomUUID } from 'node:crypto'
import type {
  SearchParams,
  SearchResponse,
  PropertySearchResult,
  RoomOption,
  RateOption,
  CancellationDeadline,
  HGSearchResponse,
  HGRoomResult,
  HGRatePlanResult,
  HGCancellationPolicy,
} from '@ibe/shared'
import {
  BOARD_TYPE_LABELS,
  BoardType,
  IBE_ERROR_SEARCH_CONSTRAINT,
  calculateCancellationDeadline,
  nightsBetween,
} from '@ibe/shared'
import { searchAvailability } from '../adapters/hyperguest/search.js'
import { getEffectiveOffersSettings, type ResolvedOffersSettings } from './offers.service.js'
import { getActivePromoCode } from './promo.service.js'
import { getActiveAffiliate } from './affiliate.service.js'
import { getExchangeRates } from './rates.service.js'
import { isMarketingFeatureEnabled } from './marketing.service.js'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'

/**
 * Executes a search and returns the transformed IBE response.
 */
export async function search(params: SearchParams, buyerOrgId?: number): Promise<SearchResponse> {
  const nights = nightsBetween(params.checkIn, params.checkOut)

  const offers = await getEffectiveOffersSettings(params.hotelId)

  if (nights < offers.minNights) {
    throw constraintError(`Minimum stay is ${offers.minNights} night${offers.minNights !== 1 ? 's' : ''}`)
  }
  if (nights > offers.maxNights) {
    throw constraintError(`Maximum stay is ${offers.maxNights} nights`)
  }

  const roomCount = params.rooms.length
  if (roomCount < offers.minRooms) {
    throw constraintError(`Minimum ${offers.minRooms} room${offers.minRooms !== 1 ? 's' : ''} required`)
  }
  if (roomCount > offers.maxRooms) {
    throw constraintError(`Maximum ${offers.maxRooms} rooms allowed`)
  }

  const property = await prisma.property.findUnique({
    where: { propertyId: params.hotelId },
    select: { organizationId: true },
  })

  const sellModel = buyerOrgId ? 'b2b' : 'b2c'

  const [hgResponse, activePromo, activeAffiliate, promoEnabled, affiliateEnabled] = await Promise.all([
    searchAvailability(params, undefined, buyerOrgId),
    params.promoCode && property
      ? getActivePromoCode(params.promoCode, property.organizationId, params.hotelId, params.checkIn)
      : Promise.resolve(null),
    params.affiliateCode && property
      ? getActiveAffiliate(params.affiliateCode, property.organizationId, params.hotelId)
      : Promise.resolve(null),
    isMarketingFeatureEnabled('promoCodes', sellModel, params.hotelId),
    isMarketingFeatureEnabled('affiliates', sellModel, params.hotelId),
  ])

  // Fetch exchange rates if the min-offer filter uses a different currency than HG returns
  const nativeRateCurrency =
    hgResponse.results[0]?.rooms[0]?.ratePlans[0]?.prices.sell.currency ?? null
  let fxRates: Record<string, number> | null = null
  if (
    offers.minOfferValue !== null &&
    nativeRateCurrency &&
    nativeRateCurrency !== offers.minOfferCurrency
  ) {
    try {
      const fx = await getExchangeRates(nativeRateCurrency)
      fxRates = fx.rates
    } catch {
      logger.warn('[Search] Could not fetch exchange rates for min-offer filter — filter skipped')
    }
  }

  const searchId = await persistSearchSession(params, hgResponse)

  const results: PropertySearchResult[] = hgResponse.results
    .map((r) => transformPropertyResult(r, params.checkIn))
    .map((result) => applyOffersFilter(result, offers, fxRates))
    .map((result) => (promoEnabled && activePromo) ? applyPromoDiscount(result, activePromo.code, activePromo.discountValue) : result)
    .map((result) => (affiliateEnabled && activeAffiliate)
      ? applyAffiliateDiscount(result, activeAffiliate.code, activeAffiliate.discountRate ?? 0, activeAffiliate.displayText)
      : result)

  // Use the currency HG actually returned in prices, not what was requested
  const nativeCurrency =
    hgResponse.results[0]?.rooms[0]?.ratePlans[0]?.prices.sell.currency
    ?? params.currency
    ?? 'USD'

  return {
    results,
    searchId,
    currency: nativeCurrency,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    nights,
  }
}

// ── Transformers ──────────────────────────────────────────────────────────────

function transformPropertyResult(
  hgResult: HGSearchResponse['results'][number],
  checkIn: string,
): PropertySearchResult {
  return {
    propertyId: hgResult.propertyId,
    propertyName: hgResult.propertyInfo.name,
    starRating: hgResult.propertyInfo.starRating,
    cityName: hgResult.propertyInfo.cityName,
    countryCode: hgResult.propertyInfo.countryCode,
    latitude: hgResult.propertyInfo.latitude,
    longitude: hgResult.propertyInfo.longitude,
    remarks: hgResult.remarks,
    rooms: hgResult.rooms.map((room, idx) => transformRoom(room, idx, checkIn)),
  }
}

function transformRoom(room: HGRoomResult, requestedRoomIndex: number, checkIn: string): RoomOption {
  return {
    roomId: room.roomId,
    roomTypeCode: room.roomTypeCode,
    roomName: room.roomName,
    availableCount: room.numberOfAvailableRooms,
    maxOccupancy: room.settings.maxOccupancy,
    maxAdults: room.settings.maxAdultsNumber,
    maxChildren: room.settings.maxChildrenNumber,
    roomSizeM2: room.settings.roomSize,
    bedding: room.settings.beddingConfigurations.map((b) => ({
      type: b.type,
      quantity: b.quantity,
    })),
    rates: room.ratePlans.map((rp) => transformRatePlan(rp, checkIn)),
    requestedRoomIndex,
  }
}

function transformRatePlan(rp: HGRatePlanResult, checkIn: string): RateOption {
  const isRefundable = isRatePlanRefundable(rp.cancellationPolicies, checkIn)

  return {
    ratePlanId: rp.ratePlanId,
    ratePlanCode: rp.ratePlanCode,
    ratePlanName: rp.ratePlanName,
    board: rp.board,
    boardLabel: BOARD_TYPE_LABELS[rp.board as BoardType] ?? rp.board,
    isRefundable,
    cancellationDeadlines: rp.cancellationPolicies.map((p) =>
      transformCancellationPolicy(p, checkIn),
    ),
    remarks: rp.remarks,
    prices: {
      net: {
        amount: rp.prices.net.price,
        currency: rp.prices.net.currency,
        taxes: rp.prices.net.taxes.map((t) => ({
          description: t.description,
          amount: t.amount,
          currency: t.currency,
          relation: t.relation,
        })),
      },
      sell: {
        amount: rp.prices.sell.price,
        currency: rp.prices.sell.currency,
        taxes: rp.prices.sell.taxes.map((t) => ({
          description: t.description,
          amount: t.amount,
          currency: t.currency,
          relation: t.relation,
        })),
      },
      bar: {
        amount: rp.prices.bar.price,
        currency: rp.prices.bar.currency,
      },
      fees: rp.prices.fees.map((f) => ({
        description: f.description,
        amount: f.amount,
        currency: f.currency,
        relation: f.relation,
      })),
    },
    nightlyBreakdown: rp.nightlyBreakdown.map((n) => ({
      date: n.date,
      net: n.prices.net.price,
      sell: n.prices.sell.price,
      currency: n.prices.net.currency,
    })),
    isImmediate: rp.isImmediate,
    chargeParty: rp.payment.charge,
    isPromotion: rp.ratePlanInfo.isPromotion,
    isPrivate: rp.ratePlanInfo.isPrivate,
  }
}

function transformCancellationPolicy(
  policy: HGCancellationPolicy,
  checkIn: string,
): CancellationDeadline {
  const deadline = calculateCancellationDeadline(
    checkIn,
    policy.timeSetting.timeFromCheckIn,
    policy.timeSetting.timeFromCheckInType,
    policy.cancellationDeadlineHour,
  )

  const isFree = Number(policy.amount) === 0
  return {
    deadline,
    penaltyType: policy.penaltyType,
    penaltyAmount: policy.amount,
    type: isFree ? 'free' : 'penalty',
  }
}

/**
 * A rate is refundable if any cancellation policy's deadline is still in the
 * future — meaning we're currently in a free-cancellation window.
 * Non-refundable rates use a deadline far in the past (e.g. 999 days before
 * check-in) so their deadlines are always ≤ now.
 */
function isRatePlanRefundable(policies: HGCancellationPolicy[], checkIn: string): boolean {
  if (policies.length === 0) return false
  const now = Date.now()
  return policies.some((p) => {
    if (!p.timeSetting) return false
    const deadline = calculateCancellationDeadline(
      checkIn,
      p.timeSetting.timeFromCheckIn,
      p.timeSetting.timeFromCheckInType,
      p.cancellationDeadlineHour,
    )
    const ms = Date.parse(deadline)
    return !isNaN(ms) && ms > now
  })
}

// ── Offers filtering ─────────────────────────────────────────────────────────

function constraintError(message: string): Error & { statusCode: number; code: string } {
  const err = new Error(message) as Error & { statusCode: number; code: string }
  err.statusCode = 422
  err.code = IBE_ERROR_SEARCH_CONSTRAINT
  return err
}

function applyOffersFilter(result: PropertySearchResult, offers: ResolvedOffersSettings, fxRates: Record<string, number> | null): PropertySearchResult {
  const rooms = result.rooms
    .map(room => ({ ...room, rates: room.rates.filter(rate => isRateAllowed(rate, offers, fxRates)) }))
    .filter(room => room.rates.length > 0)
  return { ...result, rooms }
}

function isRateAllowed(rate: RateOption, offers: ResolvedOffersSettings, fxRates: Record<string, number> | null): boolean {
  // Cancellation policy — 'free' maps to isRefundable=true, 'non_refundable' to false
  if (offers.allowedCancellationPolicies !== null) {
    const wantFree = offers.allowedCancellationPolicies.includes('free')
    const wantNonRefundable = offers.allowedCancellationPolicies.includes('non_refundable')
    if (rate.isRefundable && !wantFree) return false
    if (!rate.isRefundable && !wantNonRefundable) return false
  }

  // Board type
  if (offers.allowedBoardTypes !== null && !offers.allowedBoardTypes.includes(rate.board)) {
    return false
  }

  // Charge party (who collects payment)
  if (offers.allowedChargeParties !== null && !offers.allowedChargeParties.includes(rate.chargeParty)) {
    return false
  }

  // Payment method — 'online' = agent collects (chargeParty=agent), 'at_hotel' = customer pays (chargeParty=customer)
  if (offers.allowedPaymentMethods !== null) {
    const isOnline = rate.chargeParty === 'agent'
    if (isOnline && !offers.allowedPaymentMethods.includes('online')) return false
    if (!isOnline && !offers.allowedPaymentMethods.includes('at_hotel')) return false
  }

  // Minimum offer value — convert to limit currency when needed
  if (offers.minOfferValue !== null) {
    const rateCurrency = rate.prices.sell.currency
    let sellAmount = rate.prices.sell.amount

    if (rateCurrency !== offers.minOfferCurrency) {
      // fxRates is keyed from rateCurrency; look up the target currency rate
      const fxRate = fxRates?.[offers.minOfferCurrency]
      if (fxRate == null) {
        // Exchange rate unavailable — skip filter rather than block valid offers
        return true
      }
      sellAmount = sellAmount * fxRate
    }

    if (sellAmount < offers.minOfferValue) return false
  }

  return true
}

// ── Promo discount ───────────────────────────────────────────────────────────

function applyPromoDiscount(
  result: PropertySearchResult,
  code: string,
  discountPct: number,
): PropertySearchResult {
  const rooms = result.rooms.map(room => ({
    ...room,
    rates: room.rates.map(rate => {
      const originalSellAmount = rate.prices.sell.amount
      const discounted = Math.round(originalSellAmount * (1 - discountPct / 100) * 100) / 100
      return {
        ...rate,
        promoCode: code,
        promoDiscount: discountPct,
        originalSellAmount,
        prices: {
          ...rate.prices,
          sell: { ...rate.prices.sell, amount: discounted },
        },
        nightlyBreakdown: rate.nightlyBreakdown.map(n => ({
          ...n,
          sell: Math.round(n.sell * (1 - discountPct / 100) * 100) / 100,
        })),
      }
    }),
  }))
  return { ...result, rooms }
}

function applyAffiliateDiscount(
  result: PropertySearchResult,
  code: string,
  discountPct: number,
  displayText: string | null,
): PropertySearchResult {
  const rooms = result.rooms.map(room => ({
    ...room,
    rates: room.rates.map(rate => {
      const base = rate.prices.sell.amount
      const hasDiscount = discountPct > 0
      const discounted = hasDiscount
        ? Math.round(base * (1 - discountPct / 100) * 100) / 100
        : base
      return {
        ...rate,
        affiliateCode: code,
        affiliateDiscount: discountPct,
        ...(displayText ? { affiliateDisplayText: displayText } : {}),
        ...(hasDiscount ? { originalSellAmount: rate.originalSellAmount ?? base } : {}),
        prices: hasDiscount
          ? { ...rate.prices, sell: { ...rate.prices.sell, amount: discounted } }
          : rate.prices,
        nightlyBreakdown: hasDiscount
          ? rate.nightlyBreakdown.map(n => ({
              ...n,
              sell: Math.round(n.sell * (1 - discountPct / 100) * 100) / 100,
            }))
          : rate.nightlyBreakdown,
      }
    }),
  }))
  return { ...result, rooms }
}

// ── Session persistence ───────────────────────────────────────────────────────

async function persistSearchSession(
  params: SearchParams,
  response: HGSearchResponse,
): Promise<string> {
  try {
    const id = randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 min session window

    await prisma.searchSession.create({
      data: {
        id,
        propertyId: params.hotelId,
        checkIn: new Date(params.checkIn),
        checkOut: new Date(params.checkOut),
        guestsParam: JSON.stringify(params.rooms),
        nationality: params.nationality,
        currency: params.currency,
        metaJson: null, // meta will be added when promos are implemented
        expiresAt,
      },
    })

    return id
  } catch (err) {
    // Non-fatal — search still works without a persisted session
    logger.warn({ err }, '[Search] Failed to persist search session')
    return 'no-session'
  }
}
