'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useT, useLocale } from '@/context/translations'
import { useProperty } from '@/hooks/use-property'
import { apiClient } from '@/lib/api-client'
import { nightsBetween, formatCurrency, TaxRelation } from '@ibe/shared'
import type { BookingCancellationFrame, TaxEntry, NightlyPrice } from '@ibe/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoredRoom {
  roomCode: string
  board: string
  cancellationFrames?: BookingCancellationFrame[] | undefined
}

interface StoredSelectedRoom {
  roomName: string
  nightlyBreakdown: NightlyPrice[]
  sellTaxes: TaxEntry[]
  fees: TaxEntry[]
}

interface StoredConfirmation {
  totalAmount: number
  currency: string
  propertyId?: number | undefined
  checkIn?: string | undefined
  checkOut?: string | undefined
  city?: string | undefined
  leadGuest?: { firstName: string; lastName: string; email: string; phone?: string | undefined } | undefined
  rooms?: StoredRoom[] | undefined
  hyperGuestBookingId?: number | undefined
  selectedRooms?: StoredSelectedRoom[] | undefined
}

interface FailedItem {
  city: string
  roomName: string
  error: string
}

// ── TabBar ────────────────────────────────────────────────────────────────────

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { label: string; badge?: number | undefined }[]
  active: number
  onChange: (i: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 w-fit">
      {tabs.map((tab, i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className={[
            'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            active === i
              ? 'bg-[var(--color-primary)] text-white shadow-sm'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          ].join(' ')}
        >
          {tab.label}
          {tab.badge != null && (
            <span className={[
              'rounded-full px-1.5 py-0.5 text-xs font-semibold',
              active === i ? 'bg-white/30 text-white' : 'bg-[var(--color-primary)] text-white',
            ].join(' ')}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFmtDate(locale: string) {
  return (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}

function makeFmtAmount(locale: string) {
  return (amount: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
}

// ── CancellationStatus — simple inline indicator ──────────────────────────────

function CancellationStatus({ frames, currency, fmtDate, fmtAmount }: {
  frames: BookingCancellationFrame[]
  currency: string
  fmtDate: (s: string) => string
  fmtAmount: (n: number, c: string) => string
}) {
  const t = useT('confirmation')
  const penaltyFrames = frames.filter(f => f.penaltyAmount > 0)
  const now = new Date()

  if (penaltyFrames.length === 0) {
    return (
      <div className="rounded-lg bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 px-4 py-3">
        <p className="text-sm font-medium text-success">{t('freeCancellation')}</p>
      </div>
    )
  }

  const first = penaltyFrames[0]!
  const penaltyStarted = new Date(first.from) <= now

  if (penaltyStarted) {
    return (
      <div className="rounded-lg bg-[var(--color-error-light)] border border-error/20 px-4 py-3">
        <p className="text-sm font-medium text-error">{t('nonRefundable')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 px-4 py-3">
        <p className="text-sm font-medium text-success">{t('freeCancellationUntil', { date: fmtDate(first.from) })}</p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-amber-800">{t('cancellationFeeAfter', { date: fmtDate(first.from) })}</p>
        {penaltyFrames.map((f, i) => (
          <div key={i} className="flex justify-between text-xs text-amber-700">
            <span>{i === 0 ? t('anyCancellation') : t('afterDate', { date: fmtDate(f.from) })}</span>
            <span className="font-medium">{fmtAmount(f.penaltyAmount, f.currency || currency)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PropertyLabel ─────────────────────────────────────────────────────────────

function PropertyLabel({ propertyId }: { propertyId: number }) {
  const { data } = useProperty(propertyId)
  if (!data) return <span className="text-muted">Hotel {propertyId}</span>
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-semibold text-[var(--color-text)]">{data.name}</span>
      {data.starRating > 0 && (
        <span className="text-amber-400 text-xs leading-none">{'★'.repeat(data.starRating)}</span>
      )}
    </span>
  )
}

// ── SummaryHotelSection — full details for one booking inside the Summary tab ──

function SummaryHotelSection({ bookingId, confirmation, locale }: {
  bookingId: string
  confirmation: StoredConfirmation
  locale: string
}) {
  const tConfirm = useT('confirmation')
  const t = useT('search')
  const fmtDate = makeFmtDate(locale)
  const fmtAmount = makeFmtAmount(locale)
  const [showNightly, setShowNightly] = useState(false)
  const [showTaxes, setShowTaxes] = useState(false)
  const { data: property } = useProperty(confirmation.propertyId ?? 0)

  const nights = confirmation.checkIn && confirmation.checkOut
    ? nightsBetween(confirmation.checkIn, confirmation.checkOut)
    : null
  const allNightly = (confirmation.selectedRooms ?? []).flatMap(r => r.nightlyBreakdown)
  const allTaxes = (confirmation.selectedRooms ?? []).flatMap(r =>
    r.sellTaxes.filter(t => t.relation !== TaxRelation.Ignore)
  )
  const allFees = (confirmation.selectedRooms ?? []).flatMap(r =>
    r.fees.filter(f => f.relation !== TaxRelation.Ignore)
  )

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Hotel header */}
      <div className="flex items-center justify-between bg-[var(--color-primary-light)] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {confirmation.city && (
            <span className="rounded-full bg-[var(--color-primary)] px-2.5 py-0.5 text-xs font-semibold text-white">
              {confirmation.city}
            </span>
          )}
          {property ? (
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-primary">{property.name}</span>
              {property.starRating > 0 && (
                <span className="text-amber-400 text-xs leading-none">{'★'.repeat(property.starRating)}</span>
              )}
            </span>
          ) : (
            confirmation.propertyId != null && (
              <PropertyLabel propertyId={confirmation.propertyId} />
            )
          )}
        </div>
        <span className="text-xs font-bold text-primary tracking-wider shrink-0">#{bookingId}</span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Address */}
        {property?.location.address && (
          <p className="text-xs text-muted">{property.location.address}</p>
        )}

        {/* HyperGuest booking ID */}
        {confirmation.hyperGuestBookingId && (
          <p className="text-xs text-muted">HyperGuest ID: {confirmation.hyperGuestBookingId}</p>
        )}

        {/* Dates */}
        {confirmation.checkIn && confirmation.checkOut && (
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-semibold text-[var(--color-text)]">{fmtDate(confirmation.checkIn)}</p>
              <p className="text-xs text-muted">{tConfirm('checkIn')}</p>
            </div>
            {nights && (
              <div className="text-center">
                <div className="flex items-center gap-1 text-muted">
                  <div className="h-px w-5 bg-[var(--color-border)]" />
                  <span className="text-xs font-medium">{nights}n</span>
                  <div className="h-px w-5 bg-[var(--color-border)]" />
                </div>
              </div>
            )}
            <div className="text-right">
              <p className="font-semibold text-[var(--color-text)]">{fmtDate(confirmation.checkOut)}</p>
              <p className="text-xs text-muted">{tConfirm('checkOut')}</p>
            </div>
          </div>
        )}

        {/* Rooms */}
        {confirmation.rooms && confirmation.rooms.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-[var(--color-border)]">
            {confirmation.rooms.map((r, i) => (
              <div key={i} className="flex items-baseline justify-between text-xs">
                <span className="text-[var(--color-text)]">
                  {confirmation.rooms!.length > 1 && (
                    <span className="text-muted mr-1">{tConfirm('roomLabel', { number: String(i + 1) })}:</span>
                  )}
                  {r.roomCode}
                </span>
                {r.board && <span className="text-muted">{r.board}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Nightly breakdown toggle */}
        {allNightly.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowNightly(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <svg className={`h-3 w-3 transition-transform ${showNightly ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
              {showNightly ? tConfirm('nightlyBreakdown') + ' ▴' : tConfirm('nightlyBreakdown')}
            </button>
            {showNightly && (
              <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-1">
                {allNightly.map((n, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted">
                      {new Date(n.date + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-[var(--color-text)]">{fmtAmount(n.sell, n.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Taxes & fees toggle */}
        {(allTaxes.length > 0 || allFees.length > 0) && (
          <div>
            <button
              type="button"
              onClick={() => setShowTaxes(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <svg className={`h-3 w-3 transition-transform ${showTaxes ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
              {tConfirm('taxes')} &amp; {tConfirm('fees')}
            </button>
            {showTaxes && (
              <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-2">
                {allTaxes.map((tax, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className={tax.relation === TaxRelation.Display ? 'text-amber-700' : 'text-muted'}>
                      {tax.description}
                      {tax.relation === TaxRelation.Display && <span className="ml-1 font-medium">(paid at hotel)</span>}
                    </span>
                    <span className={tax.relation === TaxRelation.Display ? 'text-amber-700' : 'text-muted'}>
                      {(tax.relation === TaxRelation.Add ? '+' : '')}{fmtAmount(tax.amount, tax.currency)}
                    </span>
                  </div>
                ))}
                {allFees.map((fee, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted">{fee.description}</span>
                    <span className="text-muted">{fmtAmount(fee.amount, fee.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cancellation policy */}
        {confirmation.rooms?.some(r => r.cancellationFrames) && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{tConfirm('cancellationPolicy')}</p>
            {confirmation.rooms!.map((r, i) => (
              r.cancellationFrames ? (
                <CancellationStatus
                  key={i}
                  frames={r.cancellationFrames}
                  currency={confirmation.currency}
                  fmtDate={fmtDate}
                  fmtAmount={fmtAmount}
                />
              ) : null
            ))}
          </div>
        )}

        {/* Subtotal */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
          <span className="text-xs text-muted">{tConfirm('total')}</span>
          <span className="text-sm font-bold text-[var(--color-text)]">
            {fmtAmount(confirmation.totalAmount, confirmation.currency)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── SummaryTab ────────────────────────────────────────────────────────────────

function SummaryTab({
  bookingIds,
  confirmations,
  failedItems,
  locale,
  homeUrl,
}: {
  bookingIds: string[]
  confirmations: (StoredConfirmation | null)[]
  failedItems: FailedItem[]
  locale: string
  homeUrl: string
}) {
  const t = useT('search')
  const tConfirm = useT('confirmation')
  const fmtAmount = makeFmtAmount(locale)
  const [sendChannel, setSendChannel] = useState<'email' | 'whatsapp' | null>(null)
  const [sendTo, setSendTo] = useState('')
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [sendError, setSendError] = useState('')

  const leadGuest = confirmations.find(c => c?.leadGuest)?.leadGuest
  const total = bookingIds.length + failedItems.length

  const grandTotals = confirmations.reduce<Record<string, number>>((acc, c) => {
    if (!c) return acc
    acc[c.currency] = (acc[c.currency] ?? 0) + c.totalAmount
    return acc
  }, {})

  function openSend(channel: 'email' | 'whatsapp') {
    setSendChannel(channel)
    setSendState('idle')
    setSendError('')
    if (channel === 'email') setSendTo(leadGuest?.email ?? '')
    if (channel === 'whatsapp') setSendTo(leadGuest?.phone ?? '')
  }

  async function submitSend() {
    if (!sendChannel || !sendTo.trim()) return
    setSendState('sending')
    try {
      await Promise.all(
        bookingIds.map((id, i) => {
          const c = confirmations[i]
          if (!c) return Promise.resolve()
          const guestName = c.leadGuest
            ? `${c.leadGuest.firstName} ${c.leadGuest.lastName}`.trim()
            : undefined
          return apiClient.sendBookingConfirmation(id, sendChannel, sendTo.trim(), {
            ...(c.propertyId !== undefined ? { propertyId: c.propertyId } : {}),
            ...(guestName ? { guestName } : {}),
            ...(c.checkIn ? { checkIn: c.checkIn } : {}),
            ...(c.checkOut ? { checkOut: c.checkOut } : {}),
            ...(c.totalAmount !== undefined ? { totalAmount: c.totalAmount } : {}),
            ...(c.currency ? { currency: c.currency } : {}),
            ...(c.hyperGuestBookingId !== undefined ? { hyperGuestBookingId: c.hyperGuestBookingId } : {}),
          })
        })
      )
      setSendState('sent')
    } catch (err) {
      setSendState('error')
      setSendError(err instanceof Error ? err.message : 'Send failed')
    }
  }

  return (
    <div className="space-y-6">
      {/* Success hero */}
      <div className="overflow-hidden rounded-2xl border border-[var(--color-success)]/20 bg-[var(--color-surface)] shadow-md">
        <div className="bg-success px-8 py-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold">{t('multiCityConfirmationTitle')}</h1>
          <p className="mt-1 text-sm text-white/80">
            {failedItems.length > 0
              ? t('multiCityPartialSuccess', { success: String(bookingIds.length), total: String(total) })
              : t('multiCityConfirmationSubtitle', { count: String(bookingIds.length) })}
          </p>
        </div>

        <div className="px-8 py-6 space-y-5">
          {/* Lead guest */}
          {leadGuest && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{tConfirm('guestDetails')}</p>
              <p className="text-sm font-medium text-[var(--color-text)]">
                {leadGuest.firstName} {leadGuest.lastName}
              </p>
              <p className="text-xs text-muted">{leadGuest.email}</p>
            </div>
          )}

          {/* Full details per hotel */}
          {bookingIds.map((id, i) => {
            const c = confirmations[i]
            if (!c) return null
            return (
              <SummaryHotelSection
                key={id}
                bookingId={id}
                confirmation={c}
                locale={locale}
              />
            )
          })}

          {/* Grand total */}
          {Object.entries(grandTotals).length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-4">
              <span className="text-sm font-bold text-[var(--color-text)]">{tConfirm('total')}</span>
              <div className="text-right">
                {Object.entries(grandTotals).map(([cur, amount]) => (
                  <p key={cur} className="text-xl font-bold text-primary">{fmtAmount(amount, cur)}</p>
                ))}
              </div>
            </div>
          )}

          {/* Failed */}
          {failedItems.length > 0 && (
            <div className="rounded-lg border border-error/20 bg-[var(--color-error-light)] p-4 space-y-2">
              <p className="text-sm font-semibold text-error">{t('multiCityFailedBookings')}</p>
              {failedItems.map((f, i) => (
                <div key={i} className="text-xs text-error space-y-0.5">
                  <p className="font-medium">{f.city} · {f.roomName}</p>
                  <p className="opacity-75">{f.error}</p>
                </div>
              ))}
            </div>
          )}

          <p className="text-sm text-center text-muted print:hidden">{tConfirm('keepBookingReference')}</p>
        </div>

        {/* Actions */}
        <div className="border-t border-[var(--color-border)] px-8 py-5 space-y-4 print:hidden">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {tConfirm('download')}
            </button>

            <button
              onClick={() => openSend('email')}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {tConfirm('emailAction')}
            </button>

            <button
              onClick={() => openSend('whatsapp')}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.374 0 0 5.374 0 12c0 2.117.554 4.103 1.523 5.828L.057 23.486a.5.5 0 00.609.61l5.757-1.51A11.943 11.943 0 0012 24c6.626 0 12-5.374 12-12S18.626 0 12 0zm0 21.818a9.805 9.805 0 01-5.031-1.383l-.36-.214-3.733.979.996-3.637-.235-.374A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z" />
              </svg>
              {tConfirm('whatsapp')}
            </button>

            <Link
              href={homeUrl}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              Back to home
            </Link>
          </div>

          {/* Send form */}
          {sendChannel && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {sendChannel === 'email' ? tConfirm('sendConfirmationViaEmail') : tConfirm('sendConfirmationViaWhatsapp')}
                <span className="ml-1 font-normal normal-case text-muted/70">
                  ({bookingIds.length} {bookingIds.length === 1 ? 'booking' : 'bookings'})
                </span>
              </p>
              {sendState === 'sent' ? (
                <p className="text-sm text-success font-medium">{tConfirm('confirmationSent', { address: sendTo })}</p>
              ) : (
                <div className="flex gap-2">
                  <input
                    type={sendChannel === 'email' ? 'email' : 'tel'}
                    value={sendTo}
                    onChange={e => setSendTo(e.target.value)}
                    placeholder={sendChannel === 'email' ? tConfirm('emailAddress') : tConfirm('phoneNumber')}
                    className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    onClick={submitSend}
                    disabled={sendState === 'sending' || !sendTo.trim()}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {sendState === 'sending' ? tConfirm('sending') : tConfirm('send')}
                  </button>
                  <button
                    onClick={() => setSendChannel(null)}
                    className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-muted hover:text-[var(--color-text)]"
                  >
                    ✕
                  </button>
                </div>
              )}
              {sendState === 'error' && <p className="text-xs text-error">{sendError}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── BookingTab — full confirmation for one booking ────────────────────────────

function BookingTab({ bookingId, confirmation, locale }: {
  bookingId: string
  confirmation: StoredConfirmation | null
  locale: string
}) {
  const tConfirm = useT('confirmation')
  const t = useT('search')
  const fmtDate = makeFmtDate(locale)
  const fmtAmount = makeFmtAmount(locale)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)
  const [sendChannel, setSendChannel] = useState<'email' | 'whatsapp' | null>(null)
  const [sendTo, setSendTo] = useState('')
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [sendError, setSendError] = useState('')
  const { data: property } = useProperty(confirmation?.propertyId ?? 0)

  const nights = confirmation?.checkIn && confirmation?.checkOut
    ? nightsBetween(confirmation.checkIn, confirmation.checkOut)
    : null

  useEffect(() => {
    if (!confirmation?.propertyId) return
    apiClient.getHotelConfig(confirmation.propertyId).then(cfg => {
      setEmailEnabled(cfg.emailEnabled)
      setWhatsappEnabled(cfg.whatsappEnabled)
      if (cfg.logoUrl) setLogoUrl(cfg.logoUrl)
    }).catch(() => {})
  }, [confirmation?.propertyId])

  async function submitSend() {
    if (!sendChannel || !sendTo.trim() || !confirmation) return
    setSendState('sending')
    try {
      const guestName = confirmation.leadGuest
        ? `${confirmation.leadGuest.firstName} ${confirmation.leadGuest.lastName}`.trim()
        : undefined
      await apiClient.sendBookingConfirmation(bookingId, sendChannel, sendTo.trim(), {
        ...(confirmation.propertyId !== undefined ? { propertyId: confirmation.propertyId } : {}),
        ...(guestName ? { guestName } : {}),
        ...(confirmation.checkIn ? { checkIn: confirmation.checkIn } : {}),
        ...(confirmation.checkOut ? { checkOut: confirmation.checkOut } : {}),
        ...(confirmation.totalAmount !== undefined ? { totalAmount: confirmation.totalAmount } : {}),
        ...(confirmation.currency ? { currency: confirmation.currency } : {}),
        ...(confirmation.hyperGuestBookingId !== undefined ? { hyperGuestBookingId: confirmation.hyperGuestBookingId } : {}),
      })
      setSendState('sent')
    } catch (err) {
      setSendState('error')
      setSendError(err instanceof Error ? err.message : 'Send failed')
    }
  }

  if (!confirmation) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <p className="text-muted">{t('invalidSearch')}</p>
      </div>
    )
  }

  const allTaxes = (confirmation.selectedRooms ?? []).flatMap(r => r.sellTaxes.filter(t => t.relation !== TaxRelation.Ignore))
  const allFees = (confirmation.selectedRooms ?? []).flatMap(r => r.fees.filter(f => f.relation !== TaxRelation.Ignore))
  const allNightly = (confirmation.selectedRooms ?? []).flatMap(r => r.nightlyBreakdown)

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-success)]/20 bg-[var(--color-surface)] shadow-md print:shadow-none print:border-gray-300">
      {/* Top bar */}
      <div className="bg-success px-8 py-6 text-center text-white print:py-4">
        {logoUrl && (
          <div className="mx-auto mb-4 flex h-16 w-40 items-center justify-center rounded-xl bg-white px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Hotel logo" className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20 print:hidden">
          <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold">{tConfirm('bookingConfirmed')}</h2>
        <p className="mt-1 text-white/80 text-sm">{tConfirm('yourReservationIsConfirmed')}</p>
      </div>

      <div className="px-8 py-6 space-y-5">
        {/* Reference */}
        <div className="flex items-center justify-between rounded-lg bg-[var(--color-background)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{tConfirm('bookingReference')}</p>
            <p className="mt-0.5 text-xl font-bold tracking-wider text-[var(--color-text)]">#{bookingId}</p>
            {confirmation.hyperGuestBookingId && (
              <p className="mt-0.5 text-xs text-muted">HyperGuest ID: {confirmation.hyperGuestBookingId}</p>
            )}
          </div>
          {confirmation.city && (
            <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white">
              {confirmation.city}
            </span>
          )}
        </div>

        {/* Hotel info */}
        {property && (
          <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{tConfirm('hotel')}</p>
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold text-[var(--color-text)]">{property.name}</p>
              {property.starRating > 0 && (
                <span className="text-amber-400 text-sm leading-none">{'★'.repeat(property.starRating)}</span>
              )}
            </div>
            <div className="flex flex-col gap-1 mt-1">
              {property.location.address && (
                <div className="flex items-start gap-1.5 text-xs text-muted">
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span>{property.location.address}</span>
                </div>
              )}
              {property.contact.phone && (
                <div className="flex items-center gap-1.5 text-xs">
                  <svg className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <a href={`tel:${property.contact.phone}`} className="text-primary hover:underline">{property.contact.phone}</a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Guest details */}
        {confirmation.leadGuest && (
          <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{tConfirm('guestDetails')}</p>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {confirmation.leadGuest.firstName} {confirmation.leadGuest.lastName}
            </p>
            <p className="text-xs text-muted">{confirmation.leadGuest.email}</p>
          </div>
        )}

        {/* Stay details */}
        {confirmation.checkIn && confirmation.checkOut && (
          <div className="rounded-lg border border-[var(--color-border)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">{tConfirm('stayDetails')}</p>
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="font-semibold text-[var(--color-text)]">{fmtDate(confirmation.checkIn)}</p>
                <p className="text-xs text-muted">{tConfirm('checkIn')}</p>
              </div>
              {nights && (
                <div className="text-center">
                  <p className="text-xs text-muted">{tConfirm('nights', { count: String(nights) })}</p>
                </div>
              )}
              <div className="text-right">
                <p className="font-semibold text-[var(--color-text)]">{fmtDate(confirmation.checkOut)}</p>
                <p className="text-xs text-muted">{tConfirm('checkOut')}</p>
              </div>
            </div>

            {/* Rooms */}
            {confirmation.rooms && confirmation.rooms.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-1">
                {confirmation.rooms.map((r, i) => (
                  <p key={i} className="text-xs text-muted">
                    {tConfirm('roomLabel', { number: String(i + 1) })}: <span className="text-[var(--color-text)]">{r.roomCode}</span>
                    {r.board && <span className="ml-2">· {r.board}</span>}
                  </p>
                ))}
              </div>
            )}

            {/* Nightly breakdown */}
            {allNightly.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{tConfirm('nightlyBreakdown')}</p>
                {allNightly.map((n, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted">
                      {new Date(n.date + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-[var(--color-text)]">{fmtAmount(n.sell, n.currency)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Taxes & fees */}
            {(allTaxes.length > 0 || allFees.length > 0) && (
              <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2">
                {allTaxes.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{tConfirm('taxes')}</p>
                    {allTaxes.map((tax, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className={tax.relation === TaxRelation.Display ? 'text-amber-700' : 'text-muted'}>
                          {tax.description}
                          {tax.relation === TaxRelation.Display && <span className="ml-1 font-medium">(paid at hotel)</span>}
                        </span>
                        <span className={tax.relation === TaxRelation.Display ? 'text-amber-700' : 'text-muted'}>
                          {(tax.relation === TaxRelation.Add ? '+' : '')}{fmtAmount(tax.amount, tax.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {allFees.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{tConfirm('fees')}</p>
                    {allFees.map((fee, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-muted">{fee.description}</span>
                        <span className="text-muted">{fmtAmount(fee.amount, fee.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Total */}
            <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex justify-between">
              <span className="text-sm text-muted">{tConfirm('total')}</span>
              <span className="text-sm font-semibold text-[var(--color-text)]">
                {fmtAmount(confirmation.totalAmount, confirmation.currency)}
              </span>
            </div>
          </div>
        )}

        {/* Cancellation policy */}
        {confirmation.rooms?.some(r => r.cancellationFrames) && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{tConfirm('cancellationPolicy')}</p>
            {confirmation.rooms!.map((r, i) => (
              <div key={i} className="space-y-1">
                {confirmation.rooms!.length > 1 && (
                  <p className="text-xs font-medium text-[var(--color-text)]">
                    {tConfirm('roomLabel', { number: String(i + 1) })}: {r.roomCode}
                  </p>
                )}
                <CancellationStatus
                  frames={r.cancellationFrames ?? []}
                  currency={confirmation.currency}
                  fmtDate={fmtDate}
                  fmtAmount={fmtAmount}
                />
              </div>
            ))}
          </div>
        )}

        <p className="text-sm text-center text-muted">{tConfirm('keepBookingReference')}</p>
      </div>

      {/* Actions */}
      <div className="border-t border-[var(--color-border)] px-8 py-5 space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {tConfirm('download')}
          </button>

          {emailEnabled && (
            <button
              onClick={() => { setSendChannel('email'); setSendState('idle'); setSendTo(confirmation.leadGuest?.email ?? '') }}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {tConfirm('emailAction')}
            </button>
          )}

          {whatsappEnabled && (
            <button
              onClick={() => { setSendChannel('whatsapp'); setSendState('idle'); setSendTo(confirmation.leadGuest?.phone ?? '') }}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.374 0 0 5.374 0 12c0 2.117.554 4.103 1.523 5.828L.057 23.486a.5.5 0 00.609.61l5.757-1.51A11.943 11.943 0 0012 24c6.626 0 12-5.374 12-12S18.626 0 12 0zm0 21.818a9.805 9.805 0 01-5.031-1.383l-.36-.214-3.733.979.996-3.637-.235-.374A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z" />
              </svg>
              {tConfirm('whatsapp')}
            </button>
          )}
        </div>

        {sendChannel && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-4 space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">
              {sendChannel === 'email' ? tConfirm('sendConfirmationViaEmail') : tConfirm('sendConfirmationViaWhatsapp')}
            </p>
            {sendState === 'sent' ? (
              <p className="text-sm text-success font-medium">{tConfirm('confirmationSent', { address: sendTo })}</p>
            ) : (
              <div className="flex gap-2">
                <input
                  type={sendChannel === 'email' ? 'email' : 'tel'}
                  value={sendTo}
                  onChange={e => setSendTo(e.target.value)}
                  placeholder={sendChannel === 'email' ? tConfirm('emailAddress') : tConfirm('phoneNumber')}
                  className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  onClick={submitSend}
                  disabled={sendState === 'sending' || !sendTo.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {sendState === 'sending' ? tConfirm('sending') : tConfirm('send')}
                </button>
                <button
                  onClick={() => setSendChannel(null)}
                  className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-muted hover:text-[var(--color-text)]"
                >
                  ✕
                </button>
              </div>
            )}
            {sendState === 'error' && <p className="text-xs text-error">{sendError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── MultiCityConfirmationContent ──────────────────────────────────────────────

export function MultiCityConfirmationContent() {
  const t = useT('search')
  const locale = useLocale()
  const rawQs = useSearchParams()

  const bookingIds = rawQs.get('bookings')?.split(',').filter(Boolean) ?? []
  const failedKey = rawQs.get('failedKey')

  const homeUrl = (() => {
    const qs = new URLSearchParams()
    const chain = rawQs.get('chain')
    const hotelId = rawQs.get('hotelId')
    if (chain) qs.set('chain', chain)
    if (hotelId) qs.set('hotelId', hotelId)
    const str = qs.toString()
    return str ? `/?${str}` : '/'
  })()

  const [confirmations, setConfirmations] = useState<(StoredConfirmation | null)[]>([])
  const [failedItems, setFailedItems] = useState<FailedItem[]>([])
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    const loaded = bookingIds.map(id => {
      try {
        const raw = sessionStorage.getItem(`ibe_confirm_${id}`)
        return raw ? (JSON.parse(raw) as StoredConfirmation) : null
      } catch {
        return null
      }
    })
    setConfirmations(loaded)
  }, [bookingIds.join(',')])

  useEffect(() => {
    if (!failedKey) return
    try {
      const raw = sessionStorage.getItem(failedKey)
      if (raw) setFailedItems(JSON.parse(raw) as FailedItem[])
    } catch {}
  }, [failedKey])

  if (bookingIds.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <p className="text-[var(--color-text-muted)]">{t('invalidSearch')}</p>
        </div>
      </main>
    )
  }

  // Tab labels: Summary + one per booking (city or "Hotel N")
  const tabs = [
    { label: t('multiCitySummary'), ...(failedItems.length > 0 ? { badge: failedItems.length } : {}) },
    ...bookingIds.map((id, i) => {
      const c = confirmations[i]
      return { label: c?.city || `Hotel ${i + 1}` }
    }),
  ]

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            {t('multiCityConfirmationTitle')}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {t('multiCityConfirmationSubtitle', { count: String(bookingIds.length) })}
          </p>
        </div>

        <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {activeTab === 0 && (
          <SummaryTab
            bookingIds={bookingIds}
            confirmations={confirmations}
            failedItems={failedItems}
            locale={locale}
            homeUrl={homeUrl}
          />
        )}

        {bookingIds.map((id, i) =>
          activeTab === i + 1 ? (
            <BookingTab
              key={id}
              bookingId={id}
              confirmation={confirmations[i] ?? null}
              locale={locale}
            />
          ) : null
        )}
      </div>
    </main>
  )
}
