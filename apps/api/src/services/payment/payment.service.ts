/**
 * Payment service — the only import that booking.service.ts and routes use.
 *
 * Acts as a thin facade over the active PaymentGateway.
 * All callers are fully decoupled from which gateway is running.
 */

import type { PaymentFlow } from '@ibe/shared'
import type { CreateIntentOptions, GatewayIntentResult } from './gateway.interface.js'
import { getPaymentGateway } from './gateway.factory.js'

export type { GatewayIntentResult }

export function createIntent(
  flow: PaymentFlow,
  options: CreateIntentOptions,
): Promise<GatewayIntentResult> {
  return getPaymentGateway().createIntent(flow, options)
}

export function capturePayment(intentId: string): Promise<void> {
  return getPaymentGateway().capture(intentId)
}

export function cancelPayment(intentId: string): Promise<void> {
  return getPaymentGateway().cancel(intentId)
}

export function linkPaymentToBooking(intentId: string, bookingId: number): Promise<void> {
  return getPaymentGateway().linkToBooking(intentId, bookingId)
}

export function activeGatewayName(): string {
  return getPaymentGateway().name
}
