'use client'

import type { RateOption } from '@ibe/shared'
import { formatCurrency, formatDate, TaxRelation } from '@ibe/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface RateCardProps {
  rate: RateOption
  currency: string
  locale: string
  onSelect: (rate: RateOption) => void
}

export function RateCard({ rate, currency, locale, onSelect }: RateCardProps) {
  const displayPrice = rate.prices.sell.amount
  const displayCurrency = rate.prices.sell.currency

  const displayFees = [
    ...rate.prices.sell.taxes.filter(t => t.relation === TaxRelation.Display),
    ...rate.prices.fees.filter(f => f.relation === TaxRelation.Display),
  ]
  const optionalFees = [
    ...rate.prices.sell.taxes.filter(t => t.relation === TaxRelation.Optional),
    ...rate.prices.fees.filter(f => f.relation === TaxRelation.Optional),
  ]
  const hasMandatoryFees = displayFees.length > 0

  const deadline = rate.cancellationDeadlines[0]

  return (
    <div className="rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        {/* Left: rate info */}
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{rate.ratePlanName}</span>
            <Badge variant="blue">{rate.boardLabel}</Badge>
            {rate.isRefundable ? (
              <Badge variant="green">Free cancellation</Badge>
            ) : (
              <Badge variant="red">Non-refundable</Badge>
            )}
            {rate.isPromotion && <Badge variant="yellow">Promotion</Badge>}
          </div>

          {/* Cancellation info */}
          {rate.isRefundable && deadline && (
            <p className="text-xs text-green-700">
              Free cancellation until{' '}
              <span className="font-medium">
                {formatDate(deadline.deadline.slice(0, 10), locale)}
              </span>
            </p>
          )}

          {/* Mandatory display fees */}
          {hasMandatoryFees && (
            <div className="space-y-0.5">
              {displayFees.map((fee, i) => (
                <p key={i} className="text-xs text-amber-700">
                  {formatCurrency(fee.amount, fee.currency, locale)} {fee.description} — not included, paid at hotel
                </p>
              ))}
            </div>
          )}

          {/* Optional fees */}
          {optionalFees.length > 0 && (
            <div className="space-y-0.5">
              {optionalFees.map((fee, i) => (
                <p key={i} className="text-xs text-blue-700">
                  {formatCurrency(fee.amount, fee.currency, locale)} {fee.description} — not included, optionally paid at hotel
                </p>
              ))}
            </div>
          )}

          {/* Remarks */}
          {rate.remarks.length > 0 && (
            <ul className="space-y-0.5">
              {rate.remarks.map((remark, i) => (
                <li key={i} className="text-xs text-gray-500">
                  • {remark}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: price + CTA */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-right">
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(displayPrice, displayCurrency, locale)}
            </p>
            <p className="text-xs text-gray-500">total stay</p>
          </div>
          <Button size="sm" onClick={() => onSelect(rate)}>
            Select
          </Button>
        </div>
      </div>
    </div>
  )
}
