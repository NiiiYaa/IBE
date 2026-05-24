'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { z } from 'zod'
import {
  GuestTitle,
  PaymentFlow,
  PaymentMethodType,
  nightsBetween,
  formatCurrency,
  TaxRelation,
  formatCancellationDeadline,
} from '@ibe/shared'
import type { CreateBookingRequestInput, BookingConfirmation, RoomOption, RateOption } from '@ibe/shared'
import { MealBadge } from '@/components/search/MealBadge'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { useT, useLocale } from '@/context/translations'
import { useProperty } from '@/hooks/use-property'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { displayDate } from '@/lib/calendar-utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoredItem {
  id: string
  legIdx: number
  propertyId: number
  checkIn: string
  checkOut: string
  searchId: string
  city: string
  room: RoomOption
  rate: RateOption
}

interface StoredPayload {
  items: StoredItem[]
  adults: number
  nationality?: string | undefined
}

// ── Guest form schema ─────────────────────────────────────────────────────────

const guestSchema = z.object({
  title: z.nativeEnum(GuestTitle),
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
  phone: z.string().min(1, 'Required'),
  country: z.string().default('US'),
  birthDate: z.string().default('1990-01-01'),
})

type GuestFormData = z.infer<typeof guestSchema>

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)] transition-colors'

function FormField({
  label,
  error,
  children,
  className = '',
}: {
  label: string
  error?: string | undefined
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
}

// ── PropertyName ──────────────────────────────────────────────────────────────

function PropertyName({ propertyId }: { propertyId: number }) {
  const { data } = useProperty(propertyId)
  return <>{data?.name ?? `Hotel ${propertyId}`}</>
}

// ── ItemSummaryCard ───────────────────────────────────────────────────────────

function ItemSummaryCard({ item, locale }: { item: StoredItem; locale: string }) {
  const t = useT('search')
  const tBook = useT('booking')
  const tRooms = useT('rooms')
  const [showNightly, setShowNightly] = useState(false)
  const [showTaxes, setShowTaxes] = useState(false)

  const nights = nightsBetween(item.checkIn, item.checkOut)
  const { rate } = item
  const { amount, currency, taxes } = rate.prices.sell
  const barAmount = rate.prices.bar.amount
  const hasDiscount = barAmount > amount

  const fmtDate = (d: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d + 'T12:00:00'))
  const fmtShort = (d: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(d + 'T12:00:00'))

  const visibleTaxes = taxes.filter(t => t.relation !== TaxRelation.Ignore)
  const visibleFees = rate.prices.fees.filter(f => f.relation !== TaxRelation.Ignore)
  const hasTaxesOrFees = visibleTaxes.length > 0 || visibleFees.length > 0
  const hasNightly = rate.nightlyBreakdown.length > 0

  function tPenalty(type: string, penaltyAmount: number, cur: string): string {
    if (type === 'percent') return tRooms('penaltyPercent', { pct: String(penaltyAmount) })
    if (type === 'nights') return penaltyAmount === 1 ? tRooms('penaltyNightSingular') : tRooms('penaltyNightsPlural', { count: String(penaltyAmount) })
    return formatCurrency(penaltyAmount, cur, locale)
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-card">
      {/* Header */}
      <div className="bg-[var(--color-primary-light)] px-4 py-2.5 flex items-center gap-2">
        <span className="rounded-full bg-[var(--color-primary)] px-2.5 py-0.5 text-xs font-semibold text-white">
          {item.city}
        </span>
        <span className="text-sm font-semibold text-primary">
          <PropertyName propertyId={item.propertyId} />
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Dates */}
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="font-semibold text-[var(--color-text)]">{fmtDate(item.checkIn)}</p>
            <p className="text-xs text-muted">{tBook('checkIn')}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center gap-1 text-muted">
              <div className="h-px w-4 bg-[var(--color-border)]" />
              <span className="text-xs font-medium">{nights}n</span>
              <div className="h-px w-4 bg-[var(--color-border)]" />
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-[var(--color-text)]">{fmtDate(item.checkOut)}</p>
            <p className="text-xs text-muted">{tBook('checkOut')}</p>
          </div>
        </div>

        <div className="border-t border-[var(--color-border)]" />

        {/* Room + rate */}
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-[var(--color-text)]">{item.room.roomName}</p>
          <p className="text-xs text-muted">{rate.ratePlanName}</p>
          <div className="flex flex-wrap items-center gap-2">
            <MealBadge board={rate.board} />
            {rate.isRefundable ? (
              <span className="text-xs text-success font-medium">
                {rate.cancellationDeadlines[0]
                  ? tRooms('freeCancellationUntil', { date: formatCancellationDeadline(rate.cancellationDeadlines[0].deadline, locale) })
                  : tRooms('freeCancellation')}
              </span>
            ) : (
              <span className="text-xs text-error font-medium">{tRooms('nonRefundable')}</span>
            )}
            {rate.isRefundable && rate.cancellationDeadlines.filter(d => d.type === 'penalty').map((d, i) => (
              <span key={i} className="text-xs text-amber-700">
                {tRooms('afterDatePenalty', {
                  date: formatCancellationDeadline(d.deadline, locale),
                  penalty: tPenalty(d.penaltyType, d.penaltyAmount, currency),
                })}
              </span>
            ))}
          </div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted">{nights} {nights !== 1 ? t('nightPlural') : t('nightSingular')}</span>
            <div className="flex items-baseline gap-1.5">
              {hasDiscount && (
                <span className="text-muted line-through">{formatCurrency(barAmount, currency, locale)}</span>
              )}
              <span className={['font-semibold', hasDiscount ? 'text-green-600' : 'text-[var(--color-text)]'].join(' ')}>
                {formatCurrency(amount, currency, locale)}
              </span>
            </div>
          </div>
        </div>

        {/* Nightly breakdown toggle */}
        {hasNightly && (
          <>
            <button
              type="button"
              onClick={() => setShowNightly(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <svg className={`h-3 w-3 transition-transform ${showNightly ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
              {showNightly ? tBook('hideNightlyBreakdown') : tBook('showNightlyBreakdown')}
            </button>
            {showNightly && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-1">
                {rate.nightlyBreakdown.map((n, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted">{fmtShort(n.date)}</span>
                    <span className="text-[var(--color-text)]">{formatCurrency(n.sell, n.currency, locale)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Taxes & fees toggle */}
        {hasTaxesOrFees && (
          <>
            <button
              type="button"
              onClick={() => setShowTaxes(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <svg className={`h-3 w-3 transition-transform ${showTaxes ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
              {showTaxes ? tBook('hideTaxesAndFees') : tBook('showTaxesAndFees')}
            </button>
            {showTaxes && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-2">
                {visibleTaxes.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{tBook('taxes')}</p>
                    {visibleTaxes.map((tax, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className={tax.relation === TaxRelation.Display ? 'text-amber-700' : 'text-muted'}>
                          {tax.description}
                        </span>
                        <span className={tax.relation === TaxRelation.Display ? 'text-amber-700' : 'text-muted'}>
                          {(tax.relation === TaxRelation.Add ? '+' : '')}{formatCurrency(tax.amount, tax.currency, locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {visibleFees.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{tBook('fees')}</p>
                    {visibleFees.map((fee, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-muted">{fee.description}</span>
                        <span className="text-muted">{formatCurrency(fee.amount, fee.currency, locale)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── MultiCityBookingContent ───────────────────────────────────────────────────

export function MultiCityBookingContent() {
  const tBook = useT('booking')
  const t = useT('search')
  const locale = useLocale()
  const rawQs = useSearchParams()
  const router = useRouter()

  const { admin } = useAdminAuth()
  const isSuper = admin?.role === 'super'

  const storageKey = rawQs.get('key')
  const [payload, setPayload] = useState<StoredPayload | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [step, setStep] = useState<'guest' | 'confirm'>('guest')
  const [isBooking, setIsBooking] = useState(false)
  const [bookingErrors, setBookingErrors] = useState<{ item: StoredItem; error: string }[]>([])

  const {
    register,
    trigger,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<GuestFormData>({
    resolver: zodResolver(guestSchema),
    defaultValues: {
      title: GuestTitle.Mr,
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      country: 'US',
      birthDate: '1990-01-01',
    },
  })

  useEffect(() => {
    if (!storageKey) { setLoaded(true); return }
    try {
      const raw = sessionStorage.getItem(`mc_booking_${storageKey}`)
      if (raw) setPayload(JSON.parse(raw) as StoredPayload)
    } catch {}
    setLoaded(true)
  }, [storageKey])

  useEffect(() => {
    const code = (navigator.language.split('-').at(-1) ?? '').toUpperCase()
    setValue('country', /^[A-Z]{2}$/.test(code) ? code : 'US')
  }, [setValue])

  function skipToConfirmation() {
    if (!payload) return
    const bookingIds = payload.items.map((_, i) => `DEMO${Date.now() + i}`).join(',')
    payload.items.forEach((item, i) => {
      const fakeId = `DEMO${Date.now() + i}`
      try {
        sessionStorage.setItem(`ibe_confirm_${fakeId}`, JSON.stringify({
          totalAmount: item.rate.prices.sell.amount,
          currency: item.rate.prices.sell.currency,
          propertyId: item.propertyId,
          checkIn: item.checkIn,
          checkOut: item.checkOut,
          city: item.city,
          leadGuest: { firstName: 'Demo', lastName: 'Guest', email: 'demo@example.com' },
          rooms: [{ roomCode: item.room.roomName, board: item.rate.boardLabel }],
          selectedRooms: [{
            roomName: item.room.roomName,
            nightlyBreakdown: item.rate.nightlyBreakdown,
            sellTaxes: item.rate.prices.sell.taxes,
            fees: item.rate.prices.fees,
          }],
        }))
      } catch {}
    })
    const qs = new URLSearchParams({ bookings: bookingIds })
    const chain = rawQs.get('chain')
    const hotelId = rawQs.get('hotelId')
    if (chain) qs.set('chain', chain)
    if (hotelId) qs.set('hotelId', hotelId)
    router.push(`/multi-city-confirmation?${qs.toString()}`)
  }

  async function onGuestSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valid = await trigger()
    if (valid) setStep('confirm')
  }

  async function onConfirm() {
    if (!payload) return
    const guest = getValues()
    setIsBooking(true)
    setBookingErrors([])

    const results = await Promise.allSettled(
      payload.items.map(item =>
        apiClient.createBooking({
          propertyId: item.propertyId,
          checkIn: item.checkIn,
          checkOut: item.checkOut,
          searchId: item.searchId,
          paymentMethod: PaymentMethodType.AtHotel,
          paymentFlow: PaymentFlow.PayAtHotelNoCard,
          isTest: process.env.NEXT_PUBLIC_IS_TEST === 'true',
          leadGuest: {
            title: guest.title,
            firstName: guest.firstName,
            lastName: guest.lastName,
            birthDate: guest.birthDate,
            email: guest.email,
            phone: guest.phone,
            country: guest.country.toUpperCase(),
          },
          rooms: [{
            roomId: Math.round(item.room.roomId),
            ratePlanId: Math.round(item.rate.ratePlanId),
            roomCode: item.room.roomTypeCode,
            rateCode: item.rate.ratePlanCode,
            expectedAmount: item.rate.prices.sell.amount,
            expectedCurrency: item.rate.prices.sell.currency,
            guests: [{
              title: guest.title,
              firstName: guest.firstName,
              lastName: guest.lastName,
              birthDate: guest.birthDate,
            }],
          }],
        } as CreateBookingRequestInput)
      )
    )

    const succeeded: { item: StoredItem; bookingId: string }[] = []
    const failed: { item: StoredItem; error: string }[] = []

    results.forEach((result, i) => {
      const item = payload.items[i]!
      if (result.status === 'fulfilled') {
        const c = result.value as BookingConfirmation
        try {
          sessionStorage.setItem(`ibe_confirm_${c.bookingId}`, JSON.stringify({
            totalAmount: c.totalAmount,
            currency: c.currency,
            propertyId: item.propertyId,
            checkIn: c.checkIn,
            checkOut: c.checkOut,
            leadGuest: { ...c.leadGuest, phone: guest.phone },
            city: item.city,
            rooms: c.rooms.map(r => ({
              roomCode: r.roomCode,
              board: r.board,
              cancellationFrames: r.cancellationFrames,
            })),
            hyperGuestBookingId: c.hyperGuestBookingId,
            selectedRooms: [{
              roomName: item.room.roomName,
              nightlyBreakdown: item.rate.nightlyBreakdown,
              sellTaxes: item.rate.prices.sell.taxes,
              fees: item.rate.prices.fees,
            }],
          }))
        } catch {}
        succeeded.push({ item, bookingId: String(c.bookingId) })
      } else {
        const err = result.reason
        failed.push({
          item,
          error: err instanceof ApiClientError ? err.message : 'Booking failed',
        })
      }
    })

    setIsBooking(false)

    if (succeeded.length > 0) {
      const bookingIds = succeeded.map(s => s.bookingId).join(',')
      const qs = new URLSearchParams({ bookings: bookingIds })
      const chain = rawQs.get('chain')
      const hotelId = rawQs.get('hotelId')
      if (chain) qs.set('chain', chain)
      if (hotelId) qs.set('hotelId', hotelId)
      if (failed.length > 0) {
        try {
          const failedKey = `mc_failed_${bookingIds}`
          sessionStorage.setItem(failedKey, JSON.stringify(
            failed.map(f => ({
              city: f.item.city,
              roomName: f.item.room.roomName,
              error: f.error,
            }))
          ))
          qs.set('failedKey', failedKey)
        } catch {}
      }
      router.push(`/multi-city-confirmation?${qs.toString()}`)
    } else {
      setBookingErrors(failed)
    }
  }

  if (!loaded) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--color-border)]" />
            ))}
          </div>
          <div className="h-48 animate-pulse rounded-xl bg-[var(--color-border)]" />
        </div>
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <p className="text-[var(--color-text-muted)]">{t('invalidSearch')}</p>
        </div>
      </main>
    )
  }

  const totals = payload.items.reduce<Record<string, number>>((acc, item) => {
    const { currency, amount } = item.rate.prices.sell
    acc[currency] = (acc[currency] ?? 0) + amount
    return acc
  }, {})

  const stepDone = step === 'confirm'

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          {t('multiCityBookingTitle')}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {t('multiCityBookingSubtitle')}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: form */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-card">

          {/* Super-admin shortcut */}
          {isSuper && (
            <div className="mb-5 flex items-center justify-between rounded-lg border border-dashed border-amber-400 bg-amber-50 px-4 py-2.5">
              <span className="text-xs font-medium text-amber-700">Super admin</span>
              <button
                type="button"
                onClick={skipToConfirmation}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
              >
                Skip to confirmation →
              </button>
            </div>
          )}

          {/* Step indicator */}
          <div className="mb-6 flex items-center gap-0">
            {(['guest', 'confirm'] as const).map((s, i) => {
              const done = s === 'guest' && stepDone
              const active = step === s
              const labels: Record<'guest' | 'confirm', string> = {
                guest: tBook('stepGuest'),
                confirm: tBook('stepConfirm'),
              }
              return (
                <div key={s} className="flex items-center gap-0 flex-1 last:flex-none">
                  <div className={[
                    'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    done ? 'bg-success text-white' :
                    active ? 'bg-primary text-white' :
                    'bg-[var(--color-border)] text-muted',
                  ].join(' ')}>
                    {done ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : i + 1}
                  </div>
                  <span className={`ml-2 text-xs font-medium ${active ? 'text-primary' : 'text-muted'}`}>
                    {labels[s]}
                  </span>
                  {i < 1 && (
                    <div className={`mx-3 flex-1 h-px ${done ? 'bg-success' : 'bg-[var(--color-border)]'}`} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Step 1: Guest details */}
          {step === 'guest' && (
            <form onSubmit={onGuestSubmit} className="space-y-5">
              <h3 className="font-semibold text-[var(--color-text)]">{tBook('stepGuest')}</h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField label={tBook('title')} error={errors.title?.message}>
                  <select {...register('title')} className={inputCls}>
                    {Object.values(GuestTitle).map(gt => (
                      <option key={gt} value={gt}>{gt}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label={tBook('firstName')} error={errors.firstName?.message} className="col-span-2">
                  <input {...register('firstName')} className={inputCls} placeholder="John" />
                </FormField>
              </div>

              <FormField label={tBook('lastName')} error={errors.lastName?.message}>
                <input {...register('lastName')} className={inputCls} placeholder="Smith" />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={tBook('email')} error={errors.email?.message}>
                  <input type="email" {...register('email')} className={inputCls} placeholder="john@example.com" />
                </FormField>
                <FormField label={tBook('phone')} error={errors.phone?.message}>
                  <input type="tel" {...register('phone')} className={inputCls} placeholder="+1 234 567 890" />
                </FormField>
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)] transition-colors"
              >
                {t('multiCityBookingContinue')}
              </button>
            </form>
          )}

          {/* Step 2: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-[var(--color-text)]">{tBook('confirmYourBooking')}</h3>

              {/* Guest summary */}
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm space-y-0.5">
                <p className="font-medium text-[var(--color-text)]">
                  {getValues('firstName')} {getValues('lastName')}
                </p>
                <p className="text-muted">{getValues('email')}</p>
                <p className="text-muted">{getValues('phone')}</p>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm">
                <p className="text-[var(--color-text)]">{tBook('payDirectlyAtHotel')}</p>
              </div>

              {bookingErrors.length > 0 && (
                <div className="rounded-lg border border-error/20 bg-[var(--color-error-light)] p-4 space-y-1.5">
                  <p className="font-semibold text-error text-sm">{t('multiCityAllFailed')}</p>
                  {bookingErrors.map((e, i) => (
                    <p key={i} className="text-xs text-error">
                      {e.item.city} · {e.item.room.roomName}: {e.error}
                    </p>
                  ))}
                </div>
              )}

              <button
                onClick={onConfirm}
                disabled={isBooking}
                className="w-full rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-[var(--color-primary-hover)] disabled:opacity-60 transition-colors"
              >
                {isBooking ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {t('multiCityBookingConfirming')}
                  </span>
                ) : t('multiCityBookHotels', { count: String(payload.items.length) })}
              </button>

              <button
                type="button"
                onClick={() => setStep('guest')}
                className="w-full text-sm text-muted hover:text-primary transition-colors"
              >
                {tBook('backToGuestDetails')}
              </button>
            </div>
          )}
        </div>

        {/* Right: room summaries */}
        <div className="space-y-3">
          {payload.items.map(item => (
            <ItemSummaryCard key={item.id} item={item} locale={locale} />
          ))}

          {/* Total */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
              {t('multiCityTotal')}
            </p>
            {Object.entries(totals).map(([cur, amount]) => (
              <p key={cur} className="text-base font-bold text-[var(--color-text)]">
                {formatCurrency(amount, cur)}
              </p>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
