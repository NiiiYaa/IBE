import type { IncentiveDisplay } from '@ibe/shared'

// Parses "Some text {(secondary note)}" into segments for rendering.
// Text inside {} renders smaller and lighter.
function parseIncentiveText(text: string): { primary: string; secondary: string | null } {
  const match = text.match(/^(.*?)\{(.+?)\}\s*$/)
  if (match) {
    return { primary: match[1]!.trim(), secondary: match[2]!.trim() }
  }
  return { primary: text.trim(), secondary: null }
}

interface IncentiveWidgetProps {
  incentive: IncentiveDisplay
  variant?: 'box' | 'inline'
}

export function IncentiveWidget({ incentive, variant = 'box' }: IncentiveWidgetProps) {
  if (incentive.items.length === 0) return null

  if (variant === 'inline') {
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[var(--color-text)]">{incentive.name}</p>
        <ul className="space-y-0.5">
          {incentive.items.map((text, i) => {
            const { primary, secondary } = parseIncentiveText(text)
            return (
              <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--color-text-muted)]">
                <svg className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-primary)]" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M12.9 4.3a1 1 0 0 1 0 1.4l-5.6 5.6a1 1 0 0 1-1.4 0L3.1 8.5a1 1 0 1 1 1.4-1.4L6.8 9.4l4.7-5.1a1 1 0 0 1 1.4 0z" />
                </svg>
                <span>
                  {primary}
                  {secondary && (
                    <span className="ml-0.5 text-[10px] font-normal text-[var(--color-text-muted)] opacity-70">{secondary}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-[var(--color-text)]">{incentive.name}</p>
      <ul className="space-y-2">
        {incentive.items.map((text, i) => {
          const { primary, secondary } = parseIncentiveText(text)
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.9 4.3a1 1 0 0 1 0 1.4l-5.6 5.6a1 1 0 0 1-1.4 0L3.1 8.5a1 1 0 1 1 1.4-1.4L6.8 9.4l4.7-5.1a1 1 0 0 1 1.4 0z" />
              </svg>
              <span>
                <span className="text-[var(--color-text)]">{primary}</span>
                {secondary && (
                  <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">{secondary}</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
