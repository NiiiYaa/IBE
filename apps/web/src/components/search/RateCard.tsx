'use client'

import type { RateOption } from '@ibe/shared'
import { formatCurrency, TaxRelation } from '@ibe/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CancellationSummary } from './CancellationSummary'
import { TaxesSummary } from './TaxesSummary'
import { RemarksSummary } from './RemarksSummary'

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

          {/* Cancellation summary (compact + hover for full detail) */}
          <CancellationSummary rate={rate} locale={locale} currency={displayCurrency} />

          <TaxesSummary displayFees={displayFees} optionalFees={optionalFees} locale={locale} />

          <RemarksSummary remarks={rate.remarks} />
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
