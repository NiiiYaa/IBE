'use client'

/**
 * PaymentStep — renders the correct payment UI based on the PaymentFlow:
 *
 * OnlineCharge          → Stripe Card Element (charged after booking)
 * PayAtHotelGuarantee   → Stripe Card Element (stored as guarantee, not charged)
 * PayAtHotelNoCard      → Info message only, no card input
 */

import { useState, useEffect } from 'react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { PaymentFlow, StripeIntentType } from '@ibe/shared'
import type { CreatePaymentIntentResponse } from '@ibe/shared'
import { getStripe } from '@/lib/stripe'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

// ── Public interface ──────────────────────────────────────────────────────────

export interface PaymentStepResult {
  paymentFlow: PaymentFlow
  stripePaymentIntentId?: string
  stripeSetupIntentId?: string
}

interface PaymentStepProps {
  paymentFlow: PaymentFlow
  propertyId: number
  /** Amount in minor units (cents) — required for OnlineCharge */
  amount?: number
  currency?: string
  onComplete: (result: PaymentStepResult) => void
}

// ── Root component — fetches intent, wraps Stripe Elements ────────────────────

export function PaymentStep({
  paymentFlow,
  propertyId,
  amount,
  currency,
  onComplete,
}: PaymentStepProps) {
  // PayAtHotelNoCard — no Stripe needed at all
  if (paymentFlow === PaymentFlow.PayAtHotelNoCard) {
    return (
      <NoCardPayment
        onComplete={() => onComplete({ paymentFlow: PaymentFlow.PayAtHotelNoCard })}
      />
    )
  }

  return (
    <StripePayment
      paymentFlow={paymentFlow}
      propertyId={propertyId}
      amount={amount}
      currency={currency}
      onComplete={onComplete}
    />
  )
}

// ── No-card flow ──────────────────────────────────────────────────────────────

function NoCardPayment({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-medium">Pay at the hotel</p>
        <p className="mt-1">Payment will be collected at the hotel.</p>
      </div>
      <Button size="lg" className="w-full" onClick={onComplete}>
        Continue to confirm
      </Button>
    </div>
  )
}

// ── Stripe-backed flows (OnlineCharge + PayAtHotelGuarantee) ──────────────────

function StripePayment({
  paymentFlow,
  propertyId,
  amount,
  currency,
  onComplete,
}: PaymentStepProps) {
  const [intentData, setIntentData] = useState<CreatePaymentIntentResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    apiClient
      .createPaymentIntent({ paymentFlow, propertyId, amount, currency })
      .then((data) => {
        if (!cancelled) setIntentData(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message)
      })

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentFlow, propertyId, amount, currency])

  if (loadError) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">
        Failed to initialize payment: {loadError}
      </div>
    )
  }

  if (!intentData) {
    return (
      <div className="space-y-3">
        <div className="h-10 animate-pulse rounded bg-gray-200" />
        <div className="h-10 animate-pulse rounded bg-gray-200" />
      </div>
    )
  }

  return (
    <Elements
      stripe={getStripe()}
      options={{ clientSecret: intentData.clientSecret, appearance: { theme: 'stripe' } }}
    >
      <CardForm intentData={intentData} onComplete={onComplete} />
    </Elements>
  )
}

// ── Inner form — uses Stripe hooks (must be inside <Elements>) ────────────────

function CardForm({
  intentData,
  onComplete,
}: {
  intentData: CreatePaymentIntentResponse
  onComplete: (result: PaymentStepResult) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isGuarantee = intentData.intentType === StripeIntentType.Setup

  const label = isGuarantee
    ? 'Save card as guarantee (you will not be charged now)'
    : 'Pay now'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setError(null)

    let confirmResult

    if (isGuarantee) {
      confirmResult = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })
    } else {
      confirmResult = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })
    }

    setSubmitting(false)

    if (confirmResult.error) {
      setError(confirmResult.error.message ?? 'Payment failed. Please try again.')
      return
    }

    onComplete({
      paymentFlow: intentData.paymentFlow,
      stripePaymentIntentId: isGuarantee ? undefined : intentData.intentId,
      stripeSetupIntentId: isGuarantee ? intentData.intentId : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isGuarantee && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          A card is required as a guarantee for this booking. You will not be charged unless you
          do not show up or cancel after the deadline.
        </div>
      )}

      <PaymentElement />

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        {label}
      </Button>
    </form>
  )
}
