'use client'

import { useState } from 'react'
import type { IncentivePackageDisplay } from '@ibe/shared'

function parseIncentiveText(text: string): { primary: string; secondary: string | null } {
  const match = text.match(/^(.*?)\{(.+?)\}\s*$/)
  if (match) return { primary: match[1]!.trim(), secondary: match[2]!.trim() }
  return { primary: text.trim(), secondary: null }
}

const FONT = {
  sm: { title: 'text-xs',  item: 'text-xs',  secondary: 'text-[10px]', badge: 'text-xs'  },
  md: { title: 'text-sm',  item: 'text-sm',  secondary: 'text-xs',     badge: 'text-sm'  },
  lg: { title: 'text-base',item: 'text-base',secondary: 'text-sm',     badge: 'text-base'},
  xl: { title: 'text-lg',  item: 'text-lg',  secondary: 'text-base',   badge: 'text-lg'  },
}

interface IncentiveWidgetProps {
  incentive: IncentivePackageDisplay
  variant?: 'light' | 'dark' | 'inline'
}

export function IncentiveWidget({ incentive, variant = 'light' }: IncentiveWidgetProps) {
  const [open, setOpen] = useState(false)
  if (incentive.items.length === 0) return null

  const sz = FONT[(incentive.fontSize as keyof typeof FONT) ?? 'md'] ?? FONT.md

  // ── Inline (room cards / compact display) ────────────────────────────────
  if (variant === 'inline') {
    return (
      <div className="space-y-1">
        <p className={`font-semibold text-[var(--color-text)] ${sz.title}`}>{incentive.name}</p>
        <ul className="space-y-0.5">
          {incentive.items.map((text, i) => {
            const { primary, secondary } = parseIncentiveText(text)
            return (
              <li key={i} className={`flex items-start gap-1.5 text-[var(--color-text-muted)] ${sz.item}`}>
                <svg className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-primary)]" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M12.9 4.3a1 1 0 0 1 0 1.4l-5.6 5.6a1 1 0 0 1-1.4 0L3.1 8.5a1 1 0 1 1 1.4-1.4L6.8 9.4l4.7-5.1a1 1 0 0 1 1.4 0z" />
                </svg>
                <span>
                  {primary}
                  {secondary && <span className={`ml-0.5 font-normal text-[var(--color-text-muted)] opacity-70 ${sz.secondary}`}>{secondary}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  // ── Dark (fullpage hero, on overlay) ─────────────────────────────────────
  if (variant === 'dark') {
    return (
      <div className="w-full max-w-lg mx-auto">
        {/* Collapsed pill */}
        <button
          onClick={() => setOpen(v => !v)}
          className={[
            'w-full flex items-center gap-2.5 rounded-full px-5 py-2.5',
            'bg-white/15 backdrop-blur-sm border border-white/25 text-white',
            'hover:bg-white/25 transition-all duration-200 shadow-lg',
          ].join(' ')}
        >
          {/* Gift icon */}
          <svg className="h-4 w-4 shrink-0 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 12v10H4V12" /><path d="M22 7H2v5h20V7z" /><path d="M12 22V7" />
            <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
          </svg>
          <span className={`flex-1 text-left font-semibold text-white/95 ${sz.badge}`}>{incentive.name}</span>
          <span className={`text-white/60 ${sz.secondary}`}>{incentive.items.length} perks</span>
          {/* Chevron */}
          <svg className={`h-4 w-4 shrink-0 text-white/70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {/* Expanded panel */}
        {open && (
          <div className="mt-2 rounded-2xl bg-black/45 backdrop-blur-sm border border-white/20 p-4 shadow-xl">
            <ul className="space-y-2">
              {incentive.items.map((text, i) => {
                const { primary, secondary } = parseIncentiveText(text)
                return (
                  <li key={i} className={`flex items-start gap-2.5 text-white/90 ${sz.item}`}>
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-white/70" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M12.9 4.3a1 1 0 0 1 0 1.4l-5.6 5.6a1 1 0 0 1-1.4 0L3.1 8.5a1 1 0 1 1 1.4-1.4L6.8 9.4l4.7-5.1a1 1 0 0 1 1.4 0z" />
                    </svg>
                    <span>
                      {primary}
                      {secondary && <span className={`ml-1 font-normal text-white/55 ${sz.secondary}`}>{secondary}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // ── Light (rectangle / quilt hero, on page background) ───────────────────
  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Collapsed pill */}
      <button
        onClick={() => setOpen(v => !v)}
        className={[
          'w-full flex items-center gap-2.5 rounded-full px-5 py-2.5',
          'bg-[var(--color-primary)] text-white',
          'hover:opacity-90 transition-all duration-200 shadow-md',
        ].join(' ')}
      >
        {/* Gift icon */}
        <svg className="h-4 w-4 shrink-0 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12v10H4V12" /><path d="M22 7H2v5h20V7z" /><path d="M12 22V7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
        <span className={`flex-1 text-left font-semibold text-white ${sz.badge}`}>{incentive.name}</span>
        <span className={`text-white/75 ${sz.secondary}`}>{incentive.items.length} perks</span>
        {/* Chevron */}
        <svg className={`h-4 w-4 shrink-0 text-white/80 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="mt-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg">
          <ul className="space-y-2.5">
            {incentive.items.map((text, i) => {
              const { primary, secondary } = parseIncentiveText(text)
              return (
                <li key={i} className={`flex items-start gap-2.5 ${sz.item}`}>
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M12.9 4.3a1 1 0 0 1 0 1.4l-5.6 5.6a1 1 0 0 1-1.4 0L3.1 8.5a1 1 0 1 1 1.4-1.4L6.8 9.4l4.7-5.1a1 1 0 0 1 1.4 0z" />
                  </svg>
                  <span>
                    <span className="text-[var(--color-text)]">{primary}</span>
                    {secondary && <span className={`ml-1 font-normal text-[var(--color-text-muted)] ${sz.secondary}`}>{secondary}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
