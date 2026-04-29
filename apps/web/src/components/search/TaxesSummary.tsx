'use client'

import { useState } from 'react'
import type { TaxEntry } from '@ibe/shared'
import { TaxRelation, formatCurrency } from '@ibe/shared'

interface Props {
  displayFees: TaxEntry[]
  optionalFees: TaxEntry[]
  locale: string
  convert?: (amount: number) => number
  displayCurrency?: string
}

export function TaxesSummary({ displayFees, optionalFees, locale, convert, displayCurrency }: Props) {
  const [expanded, setExpanded] = useState(false)
  const conv = convert ?? ((n: number) => n)

  const allFees = [...displayFees, ...optionalFees]
  if (allFees.length === 0) return null

  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium">
        <span className="text-muted">Taxes &amp; Fees</span>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-[10px] font-semibold text-muted hover:text-[var(--color-text)] transition-colors"
        >
          {expanded ? '[-]' : '[+]'}
        </button>
      </span>

      {expanded && (
        <div className="mt-0.5 space-y-0.5 pl-1 border-l-2 border-[var(--color-border)]">
          {displayFees.map((f, i) => (
            <p key={i} className="text-xs text-amber-700">
              {formatCurrency(conv(f.amount), displayCurrency ?? f.currency, locale)} {f.description} — paid at hotel
            </p>
          ))}
          {optionalFees.map((f, i) => (
            <p key={i} className="text-xs text-blue-600">
              {formatCurrency(conv(f.amount), displayCurrency ?? f.currency, locale)} {f.description} — optional, paid at hotel
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
