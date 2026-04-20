'use client'

import type { OrgDesignDefaultsConfig } from '@ibe/shared'
import { FormRow, selectCls } from './components'

type OverrideDraft = Partial<OrgDesignDefaultsConfig>

// ── Source badge & label ──────────────────────────────────────────────────────

export function sourceLabel(key: string, org: OrgDesignDefaultsConfig): 'chain' | 'system' {
  return (org[key as keyof OrgDesignDefaultsConfig] != null) ? 'chain' : 'system'
}

export function SourceBadge({ source }: { source: 'hotel' | 'chain' | 'system' | 'room' | 'hyperguest' }) {
  const styles = {
    hotel:       'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
    chain:       'bg-amber-50 text-amber-700',
    system:      'bg-[var(--color-border)] text-[var(--color-text-muted)]',
    room:        'bg-emerald-50 text-emerald-700',
    hyperguest:  'bg-sky-50 text-sky-700',
  }
  const labels = { hotel: 'hotel', chain: 'from chain', system: 'from system', room: 'room', hyperguest: 'from HyperGuest' }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[source]}`}>
      {labels[source]}
    </span>
  )
}

// ── Override row components ───────────────────────────────────────────────────

export function OverrideColorRow({
  label, hint, fieldKey, draft, orgDefaults, systemDefault, onSet, onReset,
}: {
  label: string; hint?: string | undefined; fieldKey: keyof OrgDesignDefaultsConfig
  draft: OverrideDraft; orgDefaults: OrgDesignDefaultsConfig; systemDefault?: string | undefined
  onSet: (key: keyof OrgDesignDefaultsConfig, val: string) => void
  onReset: (key: keyof OrgDesignDefaultsConfig) => void
}) {
  const raw = draft[fieldKey] as string | null | undefined
  const isOverriding = raw != null
  const effective = raw ?? (orgDefaults[fieldKey] as string | null) ?? systemDefault ?? '#000000'
  const source: 'hotel' | 'chain' | 'system' = isOverriding ? 'hotel' : sourceLabel(fieldKey as string, orgDefaults)

  return (
    <FormRow label={label} hint={hint}>
      <div className="flex items-center gap-3">
        {isOverriding ? (
          <label className="flex cursor-pointer items-center gap-2">
            <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-[var(--color-border)]" style={{ background: effective }}>
              <input type="color" value={effective} onChange={e => onSet(fieldKey, e.target.value)}
                className="absolute -inset-1 h-10 w-10 cursor-pointer opacity-0" />
            </div>
            <span className="text-sm font-mono text-[var(--color-text)]">{effective}</span>
          </label>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg border border-[var(--color-border)]" style={{ background: effective }} />
            <span className="font-mono text-sm text-[var(--color-text-muted)]">{effective}</span>
          </div>
        )}
        <SourceBadge source={source} />
        {isOverriding ? (
          <button type="button" onClick={() => onReset(fieldKey)}
            className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
            ↩ Reset
          </button>
        ) : (
          <button type="button" onClick={() => onSet(fieldKey, effective)}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            Override
          </button>
        )}
      </div>
    </FormRow>
  )
}

export function OverrideTextRow({
  label, hint, fieldKey, placeholder, hgFallback, draft, orgDefaults, onSet, onReset,
}: {
  label: string; hint?: string | undefined; fieldKey: keyof OrgDesignDefaultsConfig; placeholder?: string | undefined
  hgFallback?: string | null
  draft: OverrideDraft; orgDefaults: OrgDesignDefaultsConfig
  onSet: (key: keyof OrgDesignDefaultsConfig, val: string | null) => void
  onReset: (key: keyof OrgDesignDefaultsConfig) => void
}) {
  const raw = draft[fieldKey] as string | null | undefined
  const isOverriding = raw != null
  const inherited = hgFallback !== undefined ? (hgFallback ?? null) : (orgDefaults[fieldKey] as string | null)
  const source: 'hotel' | 'chain' | 'system' | 'hyperguest' = isOverriding
    ? 'hotel'
    : hgFallback !== undefined ? 'hyperguest' : sourceLabel(fieldKey as string, orgDefaults)

  return (
    <FormRow label={label} hint={hint}>
      <div className="flex items-center gap-2">
        {isOverriding ? (
          <input
            type="text"
            value={raw ?? ''}
            onChange={e => onSet(fieldKey, e.target.value || null)}
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
          />
        ) : (
          <div className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-muted)] italic">
            {inherited ?? <span className="opacity-50">{placeholder ?? 'not set'}</span>}
          </div>
        )}
        <SourceBadge source={source} />
        {isOverriding ? (
          <button type="button" onClick={() => onReset(fieldKey)}
            className="shrink-0 text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
            ↩ Reset
          </button>
        ) : (
          <button type="button" onClick={() => onSet(fieldKey, inherited ?? '')}
            className="shrink-0 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            Override
          </button>
        )}
      </div>
    </FormRow>
  )
}

export function OverrideSelectRow({
  label, hint, fieldKey, options, draft, orgDefaults, systemDefault, onSet, onReset,
}: {
  label: string; hint?: string | undefined; fieldKey: keyof OrgDesignDefaultsConfig
  options: { value: string; label: string }[]
  draft: OverrideDraft; orgDefaults: OrgDesignDefaultsConfig; systemDefault?: string | undefined
  onSet: (key: keyof OrgDesignDefaultsConfig, val: string) => void
  onReset: (key: keyof OrgDesignDefaultsConfig) => void
}) {
  const raw = draft[fieldKey] as string | null | undefined
  const isOverriding = raw != null
  const inherited = (orgDefaults[fieldKey] as string | null) ?? systemDefault ?? (options[0]?.value ?? '')
  const source: 'hotel' | 'chain' | 'system' = isOverriding ? 'hotel' : sourceLabel(fieldKey as string, orgDefaults)

  return (
    <FormRow label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <select
          value={isOverriding ? (raw ?? '') : inherited}
          onChange={e => onSet(fieldKey, e.target.value)}
          disabled={!isOverriding}
          className={`${selectCls} ${!isOverriding ? 'opacity-50' : ''}`}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <SourceBadge source={source} />
        {isOverriding ? (
          <button type="button" onClick={() => onReset(fieldKey)}
            className="shrink-0 text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
            ↩ Reset
          </button>
        ) : (
          <button type="button" onClick={() => onSet(fieldKey, inherited)}
            className="shrink-0 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            Override
          </button>
        )}
      </div>
    </FormRow>
  )
}

export function OverrideNumberRow({
  label, hint, fieldKey, min, max, draft, orgDefaults, systemDefault, onSet, onReset,
}: {
  label: string; hint?: string | undefined; fieldKey: keyof OrgDesignDefaultsConfig; min: number; max: number
  draft: OverrideDraft; orgDefaults: OrgDesignDefaultsConfig; systemDefault?: number | undefined
  onSet: (key: keyof OrgDesignDefaultsConfig, val: number) => void
  onReset: (key: keyof OrgDesignDefaultsConfig) => void
}) {
  const raw = draft[fieldKey] as number | null | undefined
  const isOverriding = raw != null
  const inherited = (orgDefaults[fieldKey] as number | null) ?? systemDefault ?? min
  const source: 'hotel' | 'chain' | 'system' = isOverriding ? 'hotel' : sourceLabel(fieldKey as string, orgDefaults)

  return (
    <FormRow label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input type="number" min={min} max={max}
          value={isOverriding ? raw : inherited}
          onChange={e => onSet(fieldKey, Number(e.target.value))}
          disabled={!isOverriding}
          className={`w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none ${!isOverriding ? 'opacity-50' : ''}`}
        />
        <SourceBadge source={source} />
        {isOverriding ? (
          <button type="button" onClick={() => onReset(fieldKey)}
            className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
            ↩ Reset
          </button>
        ) : (
          <button type="button" onClick={() => onSet(fieldKey, inherited)}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            Override
          </button>
        )}
      </div>
    </FormRow>
  )
}

export function OverrideToggleRow({
  label, description, badge, fieldKey, draft, orgDefaults, systemDefault,
  onSet, onReset, disabledWhen,
}: {
  label: string
  description?: string
  badge?: string
  fieldKey: keyof OrgDesignDefaultsConfig
  draft: OverrideDraft
  orgDefaults: OrgDesignDefaultsConfig
  systemDefault: boolean
  onSet: (key: keyof OrgDesignDefaultsConfig, val: boolean) => void
  onReset: (key: keyof OrgDesignDefaultsConfig) => void
  disabledWhen?: boolean
}) {
  const raw = draft[fieldKey] as boolean | null | undefined
  const isOverriding = raw != null
  const inherited = (orgDefaults[fieldKey] as boolean | null) ?? systemDefault
  const effective = isOverriding ? raw : inherited
  const source: 'hotel' | 'chain' | 'system' = isOverriding ? 'hotel' : sourceLabel(fieldKey as string, orgDefaults)
  const disabled = disabledWhen === true

  return (
    <div className={['flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4', disabled ? 'opacity-60' : ''].join(' ')}>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--color-text)]">{label}</p>
          {badge && (
            <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              {badge}
            </span>
          )}
          <SourceBadge source={source} />
        </div>
        {description && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {isOverriding && (
          <button type="button" onClick={() => onReset(fieldKey)}
            className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
            ↩ Reset
          </button>
        )}
        <button
          role="switch"
          aria-checked={effective}
          disabled={disabled}
          onClick={() => !disabled && onSet(fieldKey, !effective)}
          className={[
            'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
            effective ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
          ].join(' ')}
        >
          <span className={[
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
            effective ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')} />
        </button>
      </div>
    </div>
  )
}

export function OverrideDirectionRow({
  draft, orgDefaults, onSet, onReset,
}: {
  draft: OverrideDraft; orgDefaults: OrgDesignDefaultsConfig
  onSet: (key: keyof OrgDesignDefaultsConfig, val: string) => void
  onReset: (key: keyof OrgDesignDefaultsConfig) => void
}) {
  const raw = draft.textDirection as string | null | undefined
  const isOverriding = raw != null
  const inherited = orgDefaults.textDirection ?? 'ltr'
  const source: 'hotel' | 'chain' | 'system' = isOverriding ? 'hotel' : sourceLabel('textDirection', orgDefaults)
  const active = isOverriding ? raw : inherited

  return (
    <FormRow label="Text direction">
      <div className="flex items-center gap-2">
        <div className={`flex gap-2 ${!isOverriding ? 'pointer-events-none opacity-50' : ''}`}>
          {(['ltr', 'rtl'] as const).map(dir => (
            <button key={dir} type="button" onClick={() => onSet('textDirection', dir)}
              className={['rounded-lg border px-4 py-1.5 text-sm font-medium transition-all',
                active === dir
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
              ].join(' ')}>
              {dir.toUpperCase()}
            </button>
          ))}
        </div>
        <SourceBadge source={source} />
        {isOverriding ? (
          <button type="button" onClick={() => onReset('textDirection')}
            className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
            ↩ Reset
          </button>
        ) : (
          <button type="button" onClick={() => onSet('textDirection', inherited)}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            Override
          </button>
        )}
      </div>
    </FormRow>
  )
}

export function OverrideLocalesRow({
  label, fieldKey, items, activeItems, draft, orgDefaults, onToggle, onReset, onOverride,
}: {
  label: string; fieldKey: keyof OrgDesignDefaultsConfig
  items: { code: string; label: string }[]
  activeItems: string[]
  draft: OverrideDraft; orgDefaults: OrgDesignDefaultsConfig
  onToggle: (code: string) => void
  onReset: (key: keyof OrgDesignDefaultsConfig) => void
  onOverride: () => void
}) {
  const raw = draft[fieldKey] as string[] | null | undefined
  const isOverriding = raw != null
  const source: 'hotel' | 'chain' | 'system' = isOverriding ? 'hotel' : sourceLabel(fieldKey as string, orgDefaults)

  return (
    <FormRow label={label}>
      <div className="flex flex-wrap items-start gap-2">
        <div className={`flex flex-wrap gap-2 ${!isOverriding ? 'pointer-events-none opacity-60' : ''}`}>
          {items.map(({ code, label: itemLabel }) => {
            const active = activeItems.includes(code)
            return (
              <button key={code} type="button" onClick={() => onToggle(code)}
                className={['rounded-full border px-3 py-1 text-xs font-medium transition-all',
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                ].join(' ')}>
                {itemLabel}
              </button>
            )
          })}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <SourceBadge source={source} />
          {isOverriding ? (
            <button type="button" onClick={() => onReset(fieldKey)}
              className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
              ↩ Reset
            </button>
          ) : (
            <button type="button" onClick={onOverride}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
              Override
            </button>
          )}
        </div>
      </div>
    </FormRow>
  )
}
