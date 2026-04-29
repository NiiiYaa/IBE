'use client'

import { useState } from 'react'

interface Props {
  remarks: string[]
}

export function RemarksSummary({ remarks }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (remarks.length === 0) return null

  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium">
        <span className="text-muted">Policies</span>
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
          {remarks.map((r, i) => (
            <p key={i} className="text-xs text-muted">• {r}</p>
          ))}
        </div>
      )}
    </div>
  )
}
