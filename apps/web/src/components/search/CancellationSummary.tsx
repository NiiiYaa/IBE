'use client'

import { useState } from 'react'
import type { RateOption } from '@ibe/shared'
import { formatCancellationDeadline, formatCancellationPenalty, formatPenaltyAmount } from '@ibe/shared'

interface Props {
  rate: RateOption
  locale: string
  currency: string
}

export function CancellationSummary({ rate, locale, currency }: Props) {
  const [expanded, setExpanded] = useState(false)

  const freeLine = rate.cancellationDeadlines.find(d => d.type === 'free') ?? rate.cancellationDeadlines[0]
  const penaltyLines = rate.cancellationDeadlines.filter(d => d.type === 'penalty')

  // Expanded detail: only penalty tiers (free-cancellation headline is already in the summary line)
  const detailLines: string[] = []
  if (rate.isRefundable && penaltyLines.length > 0) {
    for (const d of penaltyLines) {
      detailLines.push(formatCancellationPenalty(d.deadline, d.penaltyType, d.penaltyAmount, locale, currency))
    }
  } else if (!rate.isRefundable && rate.cancellationDeadlines[0]) {
    const d = rate.cancellationDeadlines[0]
    detailLines.push(`Cancellation fee: ${formatPenaltyAmount(d.penaltyType, d.penaltyAmount, locale, currency)}`)
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* ── Compact summary line — kept on one line with nowrap ── */}
      <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
        {rate.isRefundable && freeLine ? (
          <>
            <span className="text-success">✓ Free until {formatCancellationDeadline(freeLine.deadline, locale)}</span>
            {penaltyLines.length > 0 && (
              <>
                <span className="text-muted">|</span>
                <span className="text-error">✘ Fees apply after {formatCancellationDeadline(freeLine.deadline, locale)}</span>
              </>
            )}
          </>
        ) : rate.isRefundable ? (
          <span className="text-success">✓ Free cancellation</span>
        ) : (
          <span className="text-error">✘ Non-refundable</span>
        )}

        {detailLines.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="ml-1 text-[10px] font-semibold text-muted hover:text-[var(--color-text)] transition-colors"
          >
            {expanded ? '[-]' : '[+]'}
          </button>
        )}
      </span>

      {/* ── Expanded penalty tiers ── */}
      {expanded && detailLines.length > 0 && (
        <div className="mt-0.5 space-y-0.5 pl-1 border-l-2 border-[var(--color-border)]">
          {detailLines.map((line, i) => (
            <p key={i} className="text-xs text-[var(--color-text-muted)]">{line}</p>
          ))}
        </div>
      )}
    </div>
  )
}
