'use client'

import { formatCurrency } from '@ibe/shared'

export interface PriceChange {
  roomName: string
  oldAmount: number
  newAmount: number
  currency: string
}

interface PriceChangeBannerProps {
  changes: PriceChange[]
  locale: string
  onAccept: () => void
  onBack: () => void
}

export function PriceChangeBanner({ changes, locale, onAccept, onBack }: PriceChangeBannerProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <svg aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-blue-800">The price has been updated</p>
          {changes.map((c, i) => (
            <p key={i} className="text-xs text-blue-700">
              <span className="font-medium">{c.roomName}: </span>
              <span className="line-through opacity-60">{formatCurrency(c.oldAmount, c.currency, locale)}</span>
              {' → '}
              <span className="font-semibold">{formatCurrency(c.newAmount, c.currency, locale)}</span>
            </p>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Accept new price
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-blue-400 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-colors"
        >
          Back to search
        </button>
      </div>
    </div>
  )
}
