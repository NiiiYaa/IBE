/**
 * PaymentGateway — the contract every payment gateway implementation must satisfy.
 *
 * To add a new gateway (e.g. PayPal, Adyen):
 *   1. Create a new file, e.g. paypal.gateway.ts
 *   2. Implement this interface
 *   3. Register it in gateway.factory.ts
 *   Nothing else needs to change.
 */

import type { PaymentFlow, StripeIntentType } from '@ibe/shared'

export interface CreateIntentOptions {
  /** Amount in minor units (e.g. cents). Required for OnlineCharge flow. */
  amount?: number | undefined
  /** ISO 4217 currency code. Required for OnlineCharge flow. */
  currency?: string | undefined
  /** Property ID — passed as metadata for traceability. */
  propertyId: number
}

/**
 * Gateway-agnostic result returned after creating a payment intent.
 * The frontend uses clientSecret + intentType to confirm the intent
 * via the gateway's client-side SDK.
 */
export interface GatewayIntentResult {
  /** Opaque secret passed to the gateway's frontend SDK to confirm the intent. */
  clientSecret: string
  /** Gateway-internal intent ID — stored in our DB and passed back on booking. */
  intentId: string
  /** Distinguishes authorization (payment) from tokenization (setup/guarantee). */
  intentType: StripeIntentType
  /** The resolved payment flow for this intent. */
  paymentFlow: PaymentFlow
  /** Human-readable gateway name — used by the frontend to load the right SDK. */
  gatewayName: string
}

export interface PaymentGateway {
  /** Unique identifier for this gateway (e.g. 'stripe', 'paypal', 'adyen'). */
  readonly name: string

  /**
   * Creates a payment intent appropriate for the given flow:
   * - OnlineCharge      → authorize card (capture later, after booking confirms)
   * - PayAtHotelGuarantee → tokenize card without charging
   */
  createIntent(flow: PaymentFlow, options: CreateIntentOptions): Promise<GatewayIntentResult>

  /**
   * Captures a previously-authorized payment.
   * Called after the booking is confirmed by HyperGuest.
   */
  capture(intentId: string): Promise<void>

  /**
   * Cancels / voids a previously-authorized payment.
   * Called when the HyperGuest booking fails after authorization.
   */
  cancel(intentId: string): Promise<void>

  /**
   * Associates a gateway intent record with a confirmed booking in our DB.
   */
  linkToBooking(intentId: string, bookingId: number): Promise<void>
}
