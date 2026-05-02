'use client'

import { useState } from 'react'
import type { RateOption } from '@ibe/shared'
import { formatCancellationDeadline } from '@ibe/shared'
import { useT } from '@/context/translations'

interface Props {
  rate: RateOption
  locale: string
  currency: string
}

export function CancellationSummary({ rate, locale, currency }: Props) {
  const t = useT('rooms')
  const [expanded, setExpanded] = useState(false)

  const freeLine = rate.cancellationDeadlines.find(d => d.type === 'free') ?? rate.cancellationDeadlines[0]
  const penaltyLines = rate.cancellationDeadlines.filter(d => d.type === 'penalty')

  function tPenaltyAmount(type: string, amount: number): string {
    if (type === 'percent') return t('penaltyPercent', { pct: String(amount) })
    if (type === 'nights') return amount === 1 ? t('penaltyNightSingular') : t('penaltyNightsPlural', { count: String(amount) })
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
  }

  // Expanded detail: only penalty tiers (free-cancellation headline is already in the summary line)
  const detailLines: string[] = []
  if (rate.isRefundable && penaltyLines.length > 0) {
    for (const d of penaltyLines) {
      detailLines.push(t('afterDatePenalty', { date: formatCancellationDeadline(d.deadline, locale), penalty: tPenaltyAmount(d.penaltyType, d.penaltyAmount) }))
    }
  } else if (!rate.isRefundable && rate.cancellationDeadlines[0]) {
    const d = rate.cancellationDeadlines[0]
    detailLines.push(t('cancellationFeeDetail', { amount: tPenaltyAmount(d.penaltyType, d.penaltyAmount) }))
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* ── Compact summary line — kept on one line with nowrap ── */}
      <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
        {rate.isRefundable && freeLine ? (
          <>
            <span className="text-success">{t('freeUntil', { date: formatCancellationDeadline(freeLine.deadline, locale) })}</span>
            {penaltyLines.length > 0 && (
              <>
                <span className="text-muted">|</span>
                <span className="text-error">{t('feesApplyAfter', { date: formatCancellationDeadline(freeLine.deadline, locale) })}</span>
              </>
            )}
          </>
        ) : rate.isRefundable ? (
          <span className="text-success">✓ {t('freeCancellation')}</span>
        ) : (
          <span className="text-error">✘ {t('nonRefundable')}</span>
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
