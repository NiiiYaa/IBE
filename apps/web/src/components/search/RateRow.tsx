'use client'

import type { RateOption, RoomOption } from '@ibe/shared'
import { formatCurrency, formatDate } from '@ibe/shared'
import { MealBadge } from './MealBadge'

interface RateRowProps {
  rate: RateOption
  room: RoomOption
  nights: number
  locale: string
  onSelect: () => void
  displayCurrency?: string
  convert?: (amount: number) => number
  selectLabel?: string
  disabled?: boolean
}

export function RateRow({ rate, room: _room, nights, locale, onSelect, displayCurrency, convert, selectLabel = 'Select', disabled = false }: RateRowProps) {
  const conv = convert ?? ((n: number) => n)
  const dispCur = displayCurrency ?? rate.prices.sell.currency
  const price = conv(rate.prices.sell.amount)
  const perNight = nights > 0 ? price / nights : price
  const deadline = rate.cancellationDeadlines[0]
  const displayFees = rate.prices.fees.filter(f => f.relation === 'display')

  return (
    <div className="group flex items-stretch border-t border-[var(--color-border)] first:border-t-0 hover:bg-[var(--color-background)] transition-colors">
      {/* Left: rate info */}
      <div className="flex flex-1 flex-col justify-center gap-1.5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text)]">{rate.ratePlanName}</span>
          <MealBadge board={rate.board} />
          {rate.isRefundable ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-light)] px-2 py-0.5 text-xs font-medium text-success">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Free cancellation
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-[var(--color-error-light)] px-2 py-0.5 text-xs font-medium text-error">
              Non-refundable
            </span>
          )}
          {rate.isPromotion && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Special offer
            </span>
          )}
          {rate.promoCode && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              Promo -{rate.promoDiscount}%
            </span>
          )}
          {rate.affiliateCode && rate.affiliateDisplayText && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
              Special for {rate.affiliateDisplayText}
              {(rate.affiliateDiscount ?? 0) > 0 && ` -${rate.affiliateDiscount}%`}
            </span>
          )}
        </div>

        {/* Cancellation detail */}
        {rate.isRefundable && deadline && (
          <p className="text-xs text-success">
            Free cancellation until {formatDate(deadline.deadline.slice(0, 10), locale)}
          </p>
        )}

        {/* Display fees (mandatory, paid at hotel) */}
        {displayFees.length > 0 && (
          <p className="text-xs text-muted">
            + {displayFees.map(f => `${formatCurrency(conv(f.amount), dispCur, locale)} ${f.description}`).join(' · ')} (at hotel)
          </p>
        )}

        {/* Remarks */}
        {rate.remarks.slice(0, 1).map((r, i) => (
          <p key={i} className="text-xs text-muted line-clamp-1">• {r}</p>
        ))}
      </div>

      {/* Right: price + CTA */}
      <div className="flex shrink-0 flex-col items-end justify-center gap-2 px-5 py-4 min-w-[140px]">
        <div className="text-right">
          {rate.originalSellAmount != null && (rate.promoDiscount || rate.affiliateDiscount) && (
            <p className="text-sm text-muted line-through">
              {formatCurrency(conv(rate.originalSellAmount), dispCur, locale)}
            </p>
          )}
          <p className="text-xl font-bold text-[var(--color-text)]">
            {formatCurrency(price, dispCur, locale)}
          </p>
          {nights > 1 && (
            <p className="text-xs text-muted">
              {formatCurrency(Math.round(perNight), dispCur, locale)}/night
            </p>
          )}
        </div>
        <button
          onClick={onSelect}
          disabled={disabled}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-hover)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selectLabel}
        </button>
      </div>
    </div>
  )
}
