/**
 * Stripe implementation of the PaymentGateway interface.
 *
 * Flow 1 — OnlineCharge:
 *   Creates a PaymentIntent with capture_method='manual'.
 *   The card is authorized (held) but NOT charged.
 *   After HyperGuest confirms → capture() charges the card.
 *   If HyperGuest fails     → cancel() releases the hold.
 *
 * Flow 2a — PayAtHotelGuarantee:
 *   Creates a SetupIntent (tokenize only, no charge).
 *   The resulting PaymentMethod is stored as a guarantee.
 *   Admin can charge it later if needed (e.g. no-show fee).
 */

import Stripe from 'stripe'
import { PaymentFlow, StripeIntentType } from '@ibe/shared'
import { env } from '../../config/env.js'
import { prisma } from '../../db/client.js'
import { logger } from '../../utils/logger.js'
import type { PaymentGateway, CreateIntentOptions, GatewayIntentResult } from './gateway.interface.js'

export class StripeGateway implements PaymentGateway {
  readonly name = 'stripe'

  private get client(): Stripe {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
  }

  async createIntent(flow: PaymentFlow, options: CreateIntentOptions): Promise<GatewayIntentResult> {
    if (flow === PaymentFlow.OnlineCharge) {
      return this.createPaymentIntent(flow, options)
    }
    if (flow === PaymentFlow.PayAtHotelGuarantee) {
      return this.createSetupIntent(flow, options)
    }
    throw new Error(
      `StripeGateway.createIntent called for flow that requires no intent: ${flow}`,
    )
  }

  async capture(intentId: string): Promise<void> {
    const intent = await this.client.paymentIntents.capture(intentId)
    await this.updateRecord(intentId, intent.status)
    logger.info({ intentId, status: intent.status }, '[StripeGateway] PaymentIntent captured')
  }

  async cancel(intentId: string): Promise<void> {
    try {
      const intent = await this.client.paymentIntents.cancel(intentId)
      await this.updateRecord(intentId, intent.status)
      logger.info({ intentId }, '[StripeGateway] PaymentIntent cancelled')
    } catch (err) {
      // Swallow — a failed cancel must not mask the original booking error
      logger.error({ intentId, err }, '[StripeGateway] Failed to cancel PaymentIntent')
    }
  }

  async linkToBooking(intentId: string, bookingId: number): Promise<void> {
    await prisma.stripePaymentRecord.updateMany({
      where: { stripeIntentId: intentId },
      data: { bookingId, updatedAt: new Date() },
    })
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async createPaymentIntent(
    flow: PaymentFlow,
    { amount, currency, propertyId }: CreateIntentOptions,
  ): Promise<GatewayIntentResult> {
    if (!amount || !currency) {
      throw new Error('amount and currency are required for online_charge flow')
    }

    const intent = await this.client.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      capture_method: 'manual',
      metadata: { propertyId: String(propertyId), paymentFlow: flow },
    })

    if (!intent.client_secret) throw new Error('Stripe PaymentIntent missing client_secret')

    await this.persistRecord({
      intentId: intent.id,
      intentType: StripeIntentType.Payment,
      flow,
      amount,
      currency,
      status: intent.status,
    })

    logger.info({ intentId: intent.id, amount, currency }, '[StripeGateway] PaymentIntent created')
    return this.toResult(intent.client_secret, intent.id, StripeIntentType.Payment, flow)
  }

  private async createSetupIntent(
    flow: PaymentFlow,
    { propertyId }: CreateIntentOptions,
  ): Promise<GatewayIntentResult> {
    const intent = await this.client.setupIntents.create({
      usage: 'off_session',
      metadata: { propertyId: String(propertyId), paymentFlow: flow },
    })

    if (!intent.client_secret) throw new Error('Stripe SetupIntent missing client_secret')

    await this.persistRecord({
      intentId: intent.id,
      intentType: StripeIntentType.Setup,
      flow,
      amount: undefined,
      currency: undefined,
      status: intent.status,
    })

    logger.info({ intentId: intent.id }, '[StripeGateway] SetupIntent created')
    return this.toResult(intent.client_secret, intent.id, StripeIntentType.Setup, flow)
  }

  private toResult(
    clientSecret: string,
    intentId: string,
    intentType: StripeIntentType,
    paymentFlow: PaymentFlow,
  ): GatewayIntentResult {
    return { clientSecret, intentId, intentType, paymentFlow, gatewayName: this.name }
  }

  private async persistRecord(data: {
    intentId: string
    intentType: StripeIntentType
    flow: PaymentFlow
    amount: number | undefined
    currency: string | undefined
    status: string
  }): Promise<void> {
    try {
      await prisma.stripePaymentRecord.create({
        data: {
          stripeIntentId: data.intentId,
          stripeIntentType: data.intentType,
          paymentFlow: data.flow,
          amount: data.amount,
          currency: data.currency,
          status: data.status,
        },
      })
    } catch (err) {
      logger.error({ err, intentId: data.intentId }, '[StripeGateway] Failed to persist record')
    }
  }

  private async updateRecord(intentId: string, status: string): Promise<void> {
    await prisma.stripePaymentRecord.updateMany({
      where: { stripeIntentId: intentId },
      data: { status, updatedAt: new Date() },
    })
  }
}
