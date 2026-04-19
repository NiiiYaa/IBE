/**
 * Stripe singleton loader for the frontend.
 * loadStripe() is called once and cached — never called inside render.
 */

import { loadStripe } from '@stripe/stripe-js'
import type { Stripe } from '@stripe/stripe-js'

const publishableKey = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'] ?? ''

let stripePromise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey)
  }
  return stripePromise
}
