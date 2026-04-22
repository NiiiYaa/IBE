'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import type { RoomOption, RateOption, BookingConfirmation } from '@ibe/shared'
import {
  GuestTitle,
  PaymentFlow,
  PaymentMethodType,
  ChargeParty,
  CreateBookingRequestSchema,
  formatDate,
} from '@ibe/shared'
import type { CreateBookingRequestInput } from '@ibe/shared'
import type { PaymentStepResult } from '@/components/payment/PaymentStep'
import { PaymentStep } from '@/components/payment/PaymentStep'
import { apiClient, ApiClientError } from '@/lib/api-client'
import type { SelectedRoom } from './BookingSummary'

interface BookingFormProps {
  propertyId: number
  checkIn: string
  checkOut: string
  rooms: SelectedRoom[]
  searchId: string
  affiliateId?: string
  locale: string
  onlinePaymentEnabled?: boolean
  payAtHotelCardGuaranteeRequired?: boolean
}

type Step = 'guest' | 'payment' | 'confirm'

const STEP_LABELS: Record<Step, string> = {
  guest: 'Guest details',
  payment: 'Payment',
  confirm: 'Confirm',
}
const STEPS: Step[] = ['guest', 'payment', 'confirm']

function resolvePaymentFlow(chargeParty: string, guaranteeRequired: boolean, onlinePaymentEnabled: boolean): PaymentFlow {
  if (!onlinePaymentEnabled) return PaymentFlow.PayAtHotelNoCard
  if (chargeParty === ChargeParty.Agent) return PaymentFlow.OnlineCharge
  if (guaranteeRequired) return PaymentFlow.PayAtHotelGuarantee
  return PaymentFlow.PayAtHotelNoCard
}

export function BookingForm({
  propertyId, checkIn, checkOut, rooms, searchId, affiliateId, locale,
  onlinePaymentEnabled = true,
  payAtHotelCardGuaranteeRequired = false,
}: BookingFormProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('guest')
  const [paymentResult, setPaymentResult] = useState<PaymentStepResult | null>(null)

  const primaryRate = rooms[0]!.rate
  const paymentFlow = resolvePaymentFlow(primaryRate.chargeParty, payAtHotelCardGuaranteeRequired, onlinePaymentEnabled)
  const amountMinorUnits = Math.round(rooms.reduce((s, { rate }) => s + rate.prices.sell.amount, 0) * 100)

  const {
    register, trigger, getValues, setValue,
    formState: { errors },
  } = useForm<CreateBookingRequestInput>({
    resolver: zodResolver(CreateBookingRequestSchema),
    defaultValues: {
      propertyId, checkIn, checkOut,
      paymentMethod: onlinePaymentEnabled ? PaymentMethodType.CreditCard : PaymentMethodType.AtHotel,
      paymentFlow,
      isTest: process.env.NEXT_PUBLIC_IS_TEST === 'true',
      searchId,
      affiliateId,
      leadGuest: {
        title: GuestTitle.Mr,
        firstName: '', lastName: '',
        birthDate: '1990-01-01',
        email: '', phone: '', country: 'US',
      },
      rooms: rooms.map(({ room, rate }) => ({
        roomId: Math.round(room.roomId),
        ratePlanId: Math.round(rate.ratePlanId),
        roomCode: room.roomTypeCode,
        rateCode: rate.ratePlanCode,
        expectedAmount: rate.prices.sell.amount,
        expectedCurrency: rate.prices.sell.currency,
        guests: [{ title: GuestTitle.Mr, firstName: '', lastName: '', birthDate: '1990-01-01' }],
      })),
    },
  })

  // Auto-fill country from browser locale (e.g. "en-US" → "US"), fallback to "US"
  useEffect(() => {
    const tag = navigator.language ?? ''
    const parts = tag.split('-')
    const code = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).toUpperCase()
    setValue('leadGuest.country', /^[A-Z]{2}$/.test(code) ? code : 'US')
  }, [setValue])

  const { mutate, isPending, error: bookingError } = useMutation({
    mutationFn: (data: CreateBookingRequestInput) => apiClient.createBooking(data),
    onSuccess: (c: BookingConfirmation) => {
      try {
        sessionStorage.setItem(`ibe_confirm_${c.bookingId}`, JSON.stringify({
          totalAmount: c.totalAmount,
          currency: c.currency,
          propertyId,
          checkIn: c.checkIn,
          checkOut: c.checkOut,
          leadGuest: c.leadGuest,
          rooms: c.rooms.map(r => ({ roomCode: r.roomCode, board: r.board, cancellationFrames: r.cancellationFrames })),
          hyperGuestBookingId: c.hyperGuestBookingId,
        }))
      } catch {}
      router.push(`/booking/confirmation/${c.bookingId}`)
    },
  })

  async function onGuestSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valid = await trigger(['leadGuest'])
    if (valid) setStep('payment')
  }

  function onPaymentComplete(result: PaymentStepResult) {
    setPaymentResult(result)
    setStep('confirm')
  }

  function onConfirm() {
    const values = getValues()
    const leadGuest = { ...values.leadGuest, country: values.leadGuest.country?.toUpperCase() }
    const rooms = values.rooms.map(room => ({
      ...room,
      guests: [{
        title: leadGuest.title,
        firstName: leadGuest.firstName,
        lastName: leadGuest.lastName,
        birthDate: leadGuest.birthDate,
      }, ...room.guests.slice(1)],
    }))
    mutate({
      ...values, leadGuest, rooms,
      paymentFlow: paymentResult?.paymentFlow ?? paymentFlow,
      stripePaymentIntentId: paymentResult?.stripePaymentIntentId,
      stripeSetupIntentId: paymentResult?.stripeSetupIntentId,
    } as CreateBookingRequestInput)
  }

  const apiError = bookingError instanceof ApiClientError ? bookingError : null
  const currentStepIndex = STEPS.indexOf(step)

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const done = i < currentStepIndex
          const active = s === step
          return (
            <div key={s} className="flex items-center gap-0 flex-1 last:flex-none">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                done   ? 'bg-success text-white' :
                active ? 'bg-primary text-white' :
                         'bg-[var(--color-border)] text-muted'
              }`}>
                {done ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i + 1}
              </div>
              <span className={`ml-2 text-xs font-medium ${active ? 'text-primary' : 'text-muted'}`}>
                {STEP_LABELS[s]}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`mx-3 flex-1 h-px ${done ? 'bg-success' : 'bg-[var(--color-border)]'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Guest details ────────────────────────────────────────── */}
      {step === 'guest' && (
        <form onSubmit={onGuestSubmit} className="space-y-5">
          <h3 className="font-semibold text-[var(--color-text)]">Guest details</h3>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Title" error={errors.leadGuest?.title?.message}>
              <select
                {...register('leadGuest.title')}
                className={inputCls}
              >
                {Object.values(GuestTitle).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="First name" error={errors.leadGuest?.firstName?.message} className="col-span-2">
              <input {...register('leadGuest.firstName')} className={inputCls} placeholder="John" />
            </FormField>
          </div>

          <FormField label="Last name" error={errors.leadGuest?.lastName?.message}>
            <input {...register('leadGuest.lastName')} className={inputCls} placeholder="Smith" />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Email" error={errors.leadGuest?.email?.message}>
              <input type="email" {...register('leadGuest.email')} className={inputCls} placeholder="john@example.com" />
            </FormField>
            <FormField label="Phone" error={errors.leadGuest?.phone?.message}>
              <input type="tel" {...register('leadGuest.phone')} className={inputCls} placeholder="+1 234 567 890" />
            </FormField>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Continue to payment →
          </button>
        </form>
      )}

      {/* ── Step 2: Payment ──────────────────────────────────────────────── */}
      {step === 'payment' && (
        <div className="space-y-4">
          <h3 className="font-semibold text-[var(--color-text)]">Payment</h3>
          <PaymentStep
            paymentFlow={paymentFlow}
            propertyId={propertyId}
            amount={paymentFlow === PaymentFlow.OnlineCharge ? amountMinorUnits : undefined}
            currency={paymentFlow === PaymentFlow.OnlineCharge ? primaryRate.prices.sell.currency : undefined}
            onComplete={onPaymentComplete}
          />
          <button
            type="button"
            onClick={() => setStep('guest')}
            className="text-sm text-muted hover:text-primary transition-colors"
          >
            ← Back to guest details
          </button>
        </div>
      )}

      {/* ── Step 3: Confirm ──────────────────────────────────────────────── */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <h3 className="font-semibold text-[var(--color-text)]">Confirm your booking</h3>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm space-y-2">
            {paymentFlow === PaymentFlow.OnlineCharge && (
              <p className="text-[var(--color-text)]">
                Your card will be charged once your booking is confirmed.
              </p>
            )}
            {paymentFlow === PaymentFlow.PayAtHotelGuarantee && (
              <p className="text-amber-700">
                Card saved as guarantee — you will pay at the hotel on arrival.
              </p>
            )}
            {paymentFlow === PaymentFlow.PayAtHotelNoCard && (
              <p className="text-[var(--color-text)]">
                You will pay directly at the hotel on arrival. No card required.
              </p>
            )}
            {primaryRate.cancellationDeadlines[0] && primaryRate.isRefundable && (
              <p className="text-success text-xs">
                ✓ Free cancellation until {formatDate(primaryRate.cancellationDeadlines[0].deadline.slice(0, 10), locale)}
              </p>
            )}
            {!primaryRate.isRefundable && (
              <p className="text-error text-xs">
                ✗ This rate is non-refundable
              </p>
            )}
          </div>

          {apiError && (
            <div className="rounded-lg border border-error/20 bg-[var(--color-error-light)] p-4 text-sm space-y-1">
              <p className="font-semibold text-error">{apiError.message}</p>
              <p className="text-xs text-error/60">[{apiError.code} · HTTP {apiError.status}]</p>
              {apiError.details?.map((d, i) => (
                <p key={i} className="text-xs text-error/80">
                  {d.field ? `${d.field}: ` : ''}{d.message}
                </p>
              ))}
            </div>
          )}

          <button
            onClick={onConfirm}
            disabled={isPending}
            className="w-full rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-[var(--color-primary-hover)] disabled:opacity-60 transition-colors"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Confirming…
              </span>
            ) : 'Confirm booking'}
          </button>

          <button
            type="button"
            onClick={() => setStep('payment')}
            className="w-full text-sm text-muted hover:text-primary transition-colors"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)] transition-colors'

function FormField({
  label, hint, error, children, className = '',
}: {
  label: string; hint?: string; error?: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-semibold text-muted uppercase tracking-wide">
        {label}
        {hint && <span className="ml-1 font-normal normal-case text-muted/70">{hint}</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
}
