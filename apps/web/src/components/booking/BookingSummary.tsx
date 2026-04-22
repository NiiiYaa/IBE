'use client'

import { useState } from 'react'
import type { RoomOption, RateOption } from '@ibe/shared'
import { formatCurrency, nightsBetween, TaxRelation } from '@ibe/shared'
import { MealBadge } from '@/components/search/MealBadge'

export interface SelectedRoom { room: RoomOption; rate: RateOption }

interface BookingSummaryProps {
  rooms: SelectedRoom[]
  checkIn: string
  checkOut: string
  locale: string
}

export function BookingSummary({ rooms, checkIn, checkOut, locale }: BookingSummaryProps) {
  const nights = nightsBetween(checkIn, checkOut)
  const [showNightly, setShowNightly] = useState(false)

  const formatDateShort = (d: string) => {
    const [year, month, day] = d.split('-').map(Number) as [number, number, number]
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
    return `${day}-${MONTHS[month - 1]}-${year}`
  }

  const formatDateNight = (d: string) => {
    const [, month, day] = d.split('-').map(Number) as [number, number, number]
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${day} ${MONTHS[month - 1]}`
  }

  const currency = rooms[0]?.rate.prices.sell.currency ?? 'USD'
  const total = rooms.reduce((s, { rate }) => s + rate.prices.sell.amount, 0)
  const allDisplayFees = rooms.flatMap(({ rate }) => rate.prices.fees.filter(f => f.relation === TaxRelation.Display))
  const allAddFees = rooms.flatMap(({ rate }) => rate.prices.fees.filter(f => f.relation === TaxRelation.Add))
  const includedTaxes = rooms.flatMap(({ rate }) => rate.prices.sell.taxes.filter(t => t.relation === TaxRelation.Included))
  const allNightly = rooms.flatMap(({ rate }) => rate.nightlyBreakdown)
  const hasNightly = allNightly.length > 0

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-card">
      <div className="bg-[var(--color-primary-light)] px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Your selection</p>
      </div>

      <div className="p-5 space-y-4">
        {/* Dates */}
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="font-semibold text-[var(--color-text)]">{formatDateShort(checkIn)}</p>
            <p className="text-xs text-muted">Check-in</p>
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
            <p className="text-xs text-muted">Check-out</p>
          </div>
        </div>

        <div className="border-t border-[var(--color-border)]" />

        {/* Rooms */}
        <div className="space-y-3">
          {rooms.map(({ room, rate }, i) => (
            <div key={i}>
              {rooms.length > 1 && (
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Room {i + 1}</p>
              )}
              <p className="text-sm font-semibold text-[var(--color-text)]">{room.roomName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <MealBadge board={rate.board} />
                {rate.isRefundable ? (
                  <span className="text-xs text-success font-medium">Free cancellation</span>
                ) : (
                  <span className="text-xs text-error font-medium">Non-refundable</span>
                )}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>{nights} night{nights !== 1 ? 's' : ''}</span>
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
              {showNightly ? 'Hide' : 'Show'} nightly breakdown
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

        {/* Price breakdown */}
        <div className="space-y-1.5 text-sm">
          {/* Included taxes */}
          {includedTaxes.map((t, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-muted">{t.description} <span className="text-success/80">(included)</span></span>
              <span className="text-muted">{formatCurrency(t.amount, t.currency, locale)}</span>
            </div>
          ))}

          {/* Additional taxes added to price */}
          {allAddFees.map((fee, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-muted">{fee.description}</span>
              <span className="text-muted">+{formatCurrency(fee.amount, fee.currency, locale)}</span>
            </div>
          ))}

          {/* Fees payable at hotel */}
          {allDisplayFees.map((fee, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-muted">{fee.description} <span className="text-amber-600">(at hotel)</span></span>
              <span className="text-muted">{formatCurrency(fee.amount, fee.currency, locale)}</span>
            </div>
          ))}

          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="text-primary text-base">{formatCurrency(total, currency, locale)}</span>
          </div>
          {allDisplayFees.length > 0 && (
            <p className="text-xs text-muted">Excluding fees paid at hotel</p>
          )}
        </div>
      </div>
    </div>
  )
}
