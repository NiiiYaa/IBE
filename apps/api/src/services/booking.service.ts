/**
 * Booking service — orchestrates the full booking flow:
 *
 * Flow 1 (OnlineCharge):
 *   1. Create booking with HyperGuest
 *   2. On confirm → capture the pre-authorized Stripe PaymentIntent
 *   3. On failure → cancel the PaymentIntent authorization
 *
 * Flow 2a (PayAtHotelGuarantee):
 *   1. Stripe SetupIntent was already created and confirmed client-side
 *   2. Create booking with HyperGuest using paymentMethod='external'
 *   3. Store the SetupIntent ID as a guarantee reference
 *
 * Flow 2b (PayAtHotelNoCard):
 *   1. Create booking with HyperGuest using paymentMethod='external'
 *   2. No Stripe interaction
 */

import type { CreateBookingRequest, BookingConfirmation } from '@ibe/shared'
import {
  BookingStatus,
  PaymentFlow,
  PaymentMethodType,
  IBE_ERROR_PRICE_MISMATCH,
  IBE_ERROR_UNAVAILABLE,
  IBE_ERROR_BOOKING_FAILED,
  HG_ERROR_PRICE_CHANGED,
  HG_ERROR_NO_AVAILABILITY,
  HG_ERROR_PAYMENT_ISSUE,
} from '@ibe/shared'
import { createBooking } from '../adapters/hyperguest/booking.js'
import { getActiveAffiliate } from './affiliate.service.js'
import { getActiveCampaign } from './campaign.service.js'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'
import { HyperGuestApiError } from '../adapters/hyperguest/client.js'
import {
  capturePayment,
  cancelPayment,
  linkPaymentToBooking,
} from './payment/payment.service.js'

export class BookingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message)
    this.name = 'BookingError'
  }
}

export interface B2BAttribution {
  buyerOrgId: number
  buyerUserId: number
  buyerOrgName?: string | undefined
  buyerUserName?: string | undefined
}

export async function book(request: CreateBookingRequest, b2b?: B2BAttribution): Promise<BookingConfirmation> {
  const { paymentFlow, stripePaymentIntentId, stripeSetupIntentId } = request

  logger.info(
    { propertyId: request.propertyId, checkIn: request.checkIn, paymentFlow },
    '[BookingService] Processing booking request',
  )

  // Determine HyperGuest payment method based on flow
  const hgPaymentMethod = resolveHyperGuestPaymentMethod()

  let hgResponse
  try {
    hgResponse = await createBooking({
      propertyId: request.propertyId,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      leadGuest: request.leadGuest,
      rooms: request.rooms.map((r) => ({
        ...(r.roomId !== undefined ? { roomId: r.roomId } : {}),
        ...(r.roomCode !== undefined ? { roomCode: r.roomCode } : {}),
        rateCode: r.rateCode,
        expectedAmount: r.expectedAmount,
        expectedCurrency: r.expectedCurrency,
        guests: r.guests,
        ...(r.specialRequests ? { specialRequests: r.specialRequests } : {}),
      })),
      paymentMethod: hgPaymentMethod,
      agencyReference: request.agencyReference,
      isTest: request.isTest,
    }, b2b?.buyerOrgId)
  } catch (err) {
    // HyperGuest failed — release any Stripe authorization
    if (paymentFlow === PaymentFlow.OnlineCharge && stripePaymentIntentId) {
      await cancelPayment(stripePaymentIntentId)
    }

    if (err instanceof HyperGuestApiError) {
      if (err.errorCode === HG_ERROR_PRICE_CHANGED) {
        throw new BookingError(IBE_ERROR_PRICE_MISMATCH, 'The price has changed. Please search again.', 409)
      }
      if (err.errorCode === HG_ERROR_NO_AVAILABILITY) {
        throw new BookingError(IBE_ERROR_UNAVAILABLE, 'This room is no longer available.', 409)
      }
      if (err.errorCode === HG_ERROR_PAYMENT_ISSUE) {
        throw new BookingError(IBE_ERROR_BOOKING_FAILED, 'Payment could not be processed. Please try a different payment method.', 402)
      }
      throw new BookingError('IBE.BOOKING.HG_ERROR', err.message || 'Booking failed. Please try again.', 502)
    }
    throw err
  }

  const booking = hgResponse.content
  const isConfirmed = booking.status === BookingStatus.Confirmed

  // Persist booking locally
  const persisted = await persistBooking(request, booking, paymentFlow, stripePaymentIntentId ?? stripeSetupIntentId, b2b)

  // Record affiliate commission if an affiliate code was submitted
  if (request.affiliateId) {
    void recordAffiliateBooking(
      persisted.id,
      request.affiliateId,
      request.propertyId,
      booking.payment.chargeAmount.price,
      booking.payment.chargeAmount.currency,
    )
  }

  // Record campaign commission if a campaign code was submitted
  if (request.campaignId) {
    void recordCampaignBooking(
      persisted.id,
      request.campaignId,
      request.propertyId,
      booking.payment.chargeAmount.price,
      booking.payment.chargeAmount.currency,
    )
  }

  // Post-booking Stripe actions
  if (paymentFlow === PaymentFlow.OnlineCharge && stripePaymentIntentId) {
    if (isConfirmed) {
      // Capture the pre-authorized payment
      await capturePayment(stripePaymentIntentId)
      await linkPaymentToBooking(stripePaymentIntentId, persisted.id)
    } else {
      // Booking is pending or failed — release the authorization
      // We do NOT cancel for Pending status since the booking may still be confirmed
      if (booking.status === BookingStatus.Failed || booking.status === BookingStatus.Rejected) {
        await cancelPayment(stripePaymentIntentId)
      }
      // For Pending: leave the intent authorized — admin will resolve manually
      logger.warn(
        { bookingId: persisted.id, status: booking.status, stripePaymentIntentId },
        '[BookingService] Booking not immediately confirmed — Stripe intent left authorized',
      )
    }
  }

  if (paymentFlow === PaymentFlow.PayAtHotelGuarantee && stripeSetupIntentId) {
    await linkPaymentToBooking(stripeSetupIntentId, persisted.id)
  }

  logger.info(
    { bookingId: persisted.id, hyperGuestBookingId: booking.bookingId, status: booking.status },
    '[BookingService] Booking complete',
  )

  return {
    bookingId: persisted.id,
    hyperGuestBookingId: booking.bookingId,
    status: booking.status as BookingStatus,
    propertyId: booking.propertyId,
    checkIn: booking.dates.from,
    checkOut: booking.dates.to,
    rooms: booking.rooms.map((r) => ({
      itemId: r.itemId,
      roomCode: r.roomCode,
      rateCode: r.rateCode,
      board: r.board,
      status: r.status as BookingStatus,
      cancellationFrames: r.cancellationPolicy.map((cp) => ({
        from: cp.startDate,
        to: cp.endDate,
        penaltyAmount: cp.price.amount,
        currency: cp.price.currency,
      })),
      ...(r.reference.property !== undefined ? { propertyReference: r.reference.property } : {}),
    })),
    totalAmount: booking.payment.chargeAmount.price,
    currency: booking.payment.chargeAmount.currency,
    leadGuest: {
      firstName: booking.leadGuest.name.first,
      lastName: booking.leadGuest.name.last,
      email: booking.leadGuest.contact?.email ?? request.leadGuest.email ?? '',
    },
    createdAt: new Date().toISOString(),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Always send 'external' to HyperGuest — Stripe handles all payment capture on our side.
 * HyperGuest's 'credit_card' type requires us to embed raw card data in the request,
 * which we never do. For every flow (online charge, guarantee, no-card) the IBE is
 * the payment collector and HyperGuest is notified post-capture.
 */
function resolveHyperGuestPaymentMethod(): string {
  return PaymentMethodType.External
}

function extractCancellationDeadline(
  booking: Awaited<ReturnType<typeof createBooking>>['content'],
): Date | null {
  const frames = booking.rooms.flatMap(r => r.cancellationPolicy ?? [])
  // First frame with a penalty marks the end of free cancellation
  const firstPenalty = frames.find(f => f.price && f.price.amount > 0)
  if (firstPenalty?.startDate) return new Date(firstPenalty.startDate)
  return null
}

async function persistBooking(
  request: CreateBookingRequest,
  booking: Awaited<ReturnType<typeof createBooking>>['content'],
  paymentFlow: PaymentFlow,
  stripeIntentId: string | undefined,
  b2b?: B2BAttribution,
) {
  return prisma.booking.create({
    data: {
      hyperGuestBookingId: booking.bookingId,
      propertyId: booking.propertyId,
      status: booking.status,
      checkIn: new Date(booking.dates.from),
      checkOut: new Date(booking.dates.to),
      leadGuestFirstName: booking.leadGuest.name.first,
      leadGuestLastName: booking.leadGuest.name.last,
      leadGuestEmail: booking.leadGuest.contact?.email ?? request.leadGuest.email ?? '',
      totalAmount: booking.payment.chargeAmount.price,
      currency: booking.payment.chargeAmount.currency,
      agencyReference: request.agencyReference ?? null,
      affiliateId: request.affiliateId ?? null,
      campaignId: request.campaignId ?? null,
      promoCode: request.promoCode ?? null,
      promoDiscountPct: request.promoDiscount ?? null,
      originalPrice: request.rooms[0]?.originalSellAmount ?? null,
      cancellationDeadline: extractCancellationDeadline(booking),
      paymentMethod: request.paymentMethod,
      paymentFlow,
      stripeIntentId: stripeIntentId ?? null,
      isTest: request.isTest ?? false,
      bookingChannel: b2b ? 'b2b' : 'b2c',
      agentOrgId: b2b?.buyerOrgId ?? null,
      agentUserId: b2b?.buyerUserId ?? null,
      agentOrgName: b2b?.buyerOrgName ?? null,
      agentUserName: b2b?.buyerUserName ?? null,
      rawResponse: JSON.stringify(booking),
      rooms: {
        create: booking.rooms.map((r) => ({
          hyperGuestItemId: r.itemId,
          roomCode: r.roomCode,
          rateCode: r.rateCode,
          board: r.board,
          status: r.status,
          propertyReference: r.reference.property ?? null,
        })),
      },
    },
    include: { rooms: true },
  })
}

async function recordAffiliateBooking(
  bookingId: number,
  affiliateCode: string,
  propertyId: number,
  totalAmount: number,
  currency: string,
): Promise<void> {
  try {
    const property = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
    if (!property) return

    const affiliate = await getActiveAffiliate(affiliateCode, property.organizationId, propertyId)
    if (!affiliate || affiliate.commissionRate === null) return

    const commissionAmount = Math.round(totalAmount * affiliate.commissionRate) / 100

    await prisma.affiliateBooking.create({
      data: {
        bookingId,
        affiliateId: affiliate.id,
        commissionRate: affiliate.commissionRate,
        commissionAmount,
        currency,
      },
    })
  } catch (err) {
    logger.warn({ err, bookingId, affiliateCode }, '[Booking] Failed to record affiliate commission')
  }
}

async function recordCampaignBooking(
  bookingId: number,
  campaignCode: string,
  propertyId: number,
  totalAmount: number,
  currency: string,
): Promise<void> {
  try {
    const property = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
    if (!property) return

    const campaign = await getActiveCampaign(campaignCode, property.organizationId, propertyId)
    if (!campaign || campaign.commissionRate === null) return

    const commissionAmount = Math.round(totalAmount * campaign.commissionRate) / 100

    await prisma.campaignBooking.create({
      data: {
        bookingId,
        campaignId: campaign.id,
        commissionRate: campaign.commissionRate,
        commissionAmount,
        currency,
      },
    })
  } catch (err) {
    logger.warn({ err, bookingId, campaignCode }, '[Booking] Failed to record campaign commission')
  }
}
