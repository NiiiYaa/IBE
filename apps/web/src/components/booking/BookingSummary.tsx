'use client'

import { useState } from 'react'
import type { RoomOption, RateOption } from '@ibe/shared'
import { formatCurrency, nightsBetween, TaxRelation, formatCancellationDeadline, formatCancellationPenalty, formatPenaltyAmount } from '@ibe/shared'
import { MealBadge } from '@/components/search/MealBadge'
import { useT } from '@/context/translations'

export interface SelectedRoom { room: RoomOption; rate: RateOption }

import type { TaxEntry } from '@ibe/shared'

function TaxLine({ item, locale }: { item: TaxEntry; locale: string }) {
  const t = useT('confirmation')
  const amountStr = (item.relation === TaxRelation.Add ? '+' : '') + formatCurrency(item.amount, item.currency, locale)

  if (item.relation === TaxRelation.Display) {
    return (
      <div className="flex justify-between text-xs">
        <span className="text-amber-700">{item.description} <span className="font-medium">({t('mandatoryPaidAtHotel')})</span></span>
        <span className="text-amber-700">{amountStr}</span>
      </div>
    )
  }
  if (item.relation === TaxRelation.Optional) {
    return (
      <div className="flex justify-between text-xs">
        <span className="text-blue-700">{item.description} <span className="font-medium">({t('optionalPaidAtHotel')})</span></span>
        <span className="text-blue-700">{amountStr}</span>
      </div>
    )
  }
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted">{item.description}</span>
      <span className="text-muted">{amountStr}</span>
    </div>
  )
}

interface BookingSummaryProps {
  rooms: SelectedRoom[]
  checkIn: string
  checkOut: string
  locale: string
  checkInTime?: string | null
  checkOutTime?: string | null
}

export function BookingSummary({ rooms, checkIn, checkOut, locale, checkInTime, checkOutTime }: BookingSummaryProps) {
  const t = useT('booking')
  const tRooms = useT('rooms')
  const tSearch = useT('search')
  const nights = nightsBetween(checkIn, checkOut)
  const [showNightly, setShowNightly] = useState(false)

  const formatDateShort = (d: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d + 'T12:00:00'))

  const formatDateNight = (d: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(d + 'T12:00:00'))

  const currency = rooms[0]?.rate.prices.sell.currency ?? 'USD'
  const total = rooms.reduce((s, { rate }) => s + rate.prices.sell.amount, 0)
  const allTaxes = rooms.flatMap(({ rate }) => rate.prices.sell.taxes.filter(t => t.relation !== TaxRelation.Ignore))
  const allFees = rooms.flatMap(({ rate }) => rate.prices.fees.filter(f => f.relation !== TaxRelation.Ignore))
  const hasDisplay = [...allTaxes, ...allFees].some(t => t.relation === TaxRelation.Display)
  const allNightly = rooms.flatMap(({ rate }) => rate.nightlyBreakdown)
  const hasNightly = allNightly.length > 0
  const hasTaxesOrFees = allTaxes.length > 0 || allFees.length > 0
  const [showTaxes, setShowTaxes] = useState(false)

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-card">
      <div className="bg-[var(--color-primary-light)] px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t('yourSelection')}</p>
      </div>

      <div className="p-5 space-y-4">
        {/* Dates */}
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="font-semibold text-[var(--color-text)]">{formatDateShort(checkIn)}</p>
            <p className="text-xs text-muted">{t('checkIn')}</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-muted">
              <div className="h-px w-6 bg-[var(--color-border)]" />
              <span className="text-xs font-medium">{nights}n</span>
              <div className="h-px w-6 bg-[var(--color-border)]" />
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-[var(--color-text)]">{formatDateShort(checkOut)}</p>
            <p className="text-xs text-muted">{t('checkOut')}</p>
          </div>
        </div>

        {(checkInTime || checkOutTime) && (
          <div className="flex justify-between text-xs text-muted">
            {checkInTime && <span>{t('checkInFrom', { time: checkInTime })}</span>}
            {checkOutTime && <span>{t('checkOutUntil', { time: checkOutTime })}</span>}
          </div>
        )}

        <div className="border-t border-[var(--color-border)]" />

        {/* Rooms */}
        <div className="space-y-3">
          {rooms.map(({ room, rate }, i) => (
            <div key={i}>
              {rooms.length > 1 && (
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('roomLabel', { number: String(i + 1) })}</p>
              )}
              <p className="text-sm font-semibold text-[var(--color-text)]">{room.roomName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
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
                    {formatCancellationPenalty(d.deadline, d.penaltyType, d.penaltyAmount, locale, rate.prices.sell.currency)}
                  </span>
                ))}
                {!rate.isRefundable && rate.cancellationDeadlines[0] && (
                  <span className="text-xs text-error">
                    {tRooms('cancellationFeeDetail', { amount: formatPenaltyAmount(rate.cancellationDeadlines[0].penaltyType, rate.cancellationDeadlines[0].penaltyAmount, locale, rate.prices.sell.currency) })}
                  </span>
                )}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>{nights} {nights !== 1 ? tSearch('nightPlural') : tSearch('nightSingular')}</span>
                <span className="font-medium text-[var(--color-text)]">
                  {formatCurrency(rate.prices.sell.amount, rate.prices.sell.currency, locale)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Nightly breakdown toggle */}
        {hasNightly && (
          <div>
            <button
              type="button"
              onClick={() => setShowNightly(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <svg
                className={`h-3 w-3 transition-transform ${showNightly ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
              {showNightly ? t('hideNightlyBreakdown') : t('showNightlyBreakdown')}
            </button>

            {showNightly && (
              <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-1">
                {allNightly.map((n, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted">{formatDateNight(n.date)}</span>
                    <span className="text-[var(--color-text)]">{formatCurrency(n.sell, n.currency, locale)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-[var(--color-border)]" />

        {/* Taxes & Fees toggle */}
        {hasTaxesOrFees && (
          <div>
            <button
              type="button"
              onClick={() => setShowTaxes(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <svg
                className={`h-3 w-3 transition-transform ${showTaxes ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
              {showTaxes ? t('hideTaxesAndFees') : t('showTaxesAndFees')}
            </button>

            {showTaxes && (
              <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-3">
                {allTaxes.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('taxes')}</p>
                    {allTaxes.map((t, i) => (
                      <TaxLine key={i} item={t} locale={locale} />
                    ))}
                  </div>
                )}
                {allFees.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('fees')}</p>
                    {allFees.map((f, i) => (
                      <TaxLine key={i} item={f} locale={locale} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-[var(--color-border)]" />

        {/* Total */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between font-semibold">
            <span>{t('total')}</span>
            <span className="text-primary text-base">{formatCurrency(total, currency, locale)}</span>
          </div>
          {hasDisplay && (
            <p className="text-xs text-muted">{t('excludingFees')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
