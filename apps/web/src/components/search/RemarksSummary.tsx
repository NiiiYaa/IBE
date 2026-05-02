'use client'

import { useState } from 'react'
import { useT } from '@/context/translations'

const CHECK_IN_RE = /check[\s-]?in\s+from\s+(.+)/i
const CHECK_OUT_RE = /check[\s-]?out\s+until\s+(.+)/i

interface Props {
  remarks: string[]
}

export function RemarksSummary({ remarks }: Props) {
  const [expanded, setExpanded] = useState(false)
  const t = useT('search')
  const tBooking = useT('booking')

  if (remarks.length === 0) return null

  const lines = remarks.map(r => {
    const ci = CHECK_IN_RE.exec(r)
    if (ci) return tBooking('checkInFrom', { time: ci[1].trim() })
    const co = CHECK_OUT_RE.exec(r)
    if (co) return tBooking('checkOutUntil', { time: co[1].trim() })
    return r
  })

  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium">
        <span className="text-muted">{t('policies')}</span>
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
          {lines.map((r, i) => (
            <p key={i} className="text-xs text-muted">• {r}</p>
          ))}
        </div>
      )}
    </div>
  )
}
