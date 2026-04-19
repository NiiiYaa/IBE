/**
 * Gateway factory — resolves the active PaymentGateway from configuration.
 *
 * Active gateway is controlled by the PAYMENT_GATEWAY environment variable.
 * Default: 'stripe'
 *
 * To add a new gateway:
 *   1. Implement PaymentGateway in a new file (e.g. paypal.gateway.ts)
 *   2. Import it here and add it to the GATEWAYS map
 *   3. Set PAYMENT_GATEWAY=paypal in your environment
 *
 * Future extension: resolve per-hotel via HotelConfig.paymentGateway
 * without changing anything in booking.service or routes.
 */

import type { PaymentGateway } from './gateway.interface.js'
import { StripeGateway } from './stripe.gateway.js'

const GATEWAYS: Record<string, () => PaymentGateway> = {
  stripe: () => new StripeGateway(),
}

let activeGateway: PaymentGateway | null = null

/**
 * Returns the singleton active payment gateway.
 * Lazily instantiated on first call.
 */
export function getPaymentGateway(): PaymentGateway {
  if (!activeGateway) {
    const name = process.env['PAYMENT_GATEWAY'] ?? 'stripe'
    const factory = GATEWAYS[name]

    if (!factory) {
      throw new Error(
        `Unknown payment gateway: "${name}". Available: ${Object.keys(GATEWAYS).join(', ')}`,
      )
    }

    activeGateway = factory()
  }

  return activeGateway
}

/**
 * Resets the singleton — used in tests to force re-instantiation.
 */
export function resetGatewayForTesting(): void {
  activeGateway = null
}
