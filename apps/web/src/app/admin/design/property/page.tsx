'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, PropertyDesignAdminResponse } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { ALL_CURRENCIES, TOP_CURRENCIES, currencyName } from '@/lib/currencies'
import { Section, FormRow, TextInput, SaveBar, selectCls } from '../components'
import { useAdminProperty } from '../../property-context'

const FONT_OPTIONS = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
  'Raleway', 'Nunito', 'Playfair Display', 'Inter',
]

const ALL_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'Hebrew (עברית)' },
  { code: 'ar', label: 'Arabic (العربية)' },
  { code: 'fr', label: 'French (Français)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'it', label: 'Italian (Italiano)' },
  { code: 'ru', label: 'Russian (Русский)' },
  { code: 'zh', label: 'Chinese (中文)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'ko', label: 'Korean (한국어)' },
  { code: 'pt', label: 'Portuguese (Português)' },
  { code: 'nl', label: 'Dutch (Nederlands)' },
  { code: 'tr', label: 'Turkish (Türkçe)' },
]

const SYSTEM_DEFAULTS: Record<string, string | number> = {
  colorPrimary: '#0f509e', colorPrimaryHover: '#0a3a7a', colorPrimaryLight: '#e8f0fb',
  colorAccent: '#1399cd', colorBackground: '#f2f3ef', colorSurface: '#ffffff',
  colorText: '#211c18', colorTextMuted: '#717171', colorBorder: '#e0e0e0',
  colorSuccess: '#308c67', colorError: '#de1f27',
  fontFamily: 'Roboto', borderRadius: 8,
  defaultCurrency: 'EUR', defaultLocale: 'en', textDirection: 'ltr',
}

const COLOR_FIELDS: Array<{ key: keyof OrgDesignDefaultsConfig; label: string; hint?: string }> = [
  { key: 'colorPrimary',      label: 'Primary',        hint: 'Buttons, links, highlights' },
  { key: 'colorPrimaryHover', label: 'Primary hover',  hint: 'Button hover state' },
  { key: 'colorPrimaryLight', label: 'Primary light',  hint: 'Tinted backgrounds' },
  { key: 'colorAccent',       label: 'Accent',         hint: 'Secondary highlights' },
  { key: 'colorBackground',   label: 'Page background' },
  { key: 'colorSurface',      label: 'Card surface' },
  { key: 'colorText',         label: 'Body text' },
  { key: 'colorTextMuted',    label: 'Muted text' },
  { key: 'colorBorder',       label: 'Borders' },
  { key: 'colorSuccess',      label: 'Success',        hint: 'Free cancellation, confirms' },
  { key: 'colorError',        label: 'Error',          hint: 'Non-refundable, errors' },
]

type Draft = Partial<OrgDesignDefaultsConfig>

function sourceLabel(key: string, org: OrgDesignDefaultsConfig): 'chain' | 'system' {
  return (org[key as keyof OrgDesignDefaultsConfig] != null) ? 'chain' : 'system'
}

function SourceBadge({ source }: { source: 'hotel' | 'chain' | 'system' | 'hyperguest' }) {
  const styles = {
    hotel:      'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
    chain:      'bg-amber-50 text-amber-700',
    system:     'bg-[var(--color-border)] text-[var(--color-text-muted)]',
    hyperguest: 'bg-sky-50 text-sky-700',
  }
  const labels = { hotel: 'hotel', chain: 'from chain', system: 'from system', hyperguest: 'from HyperGuest' }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[source]}`}>
      {labels[source]}
    </span>
  )
}

function OverrideColorRow({
  label, hint, fieldKey, draft, orgDefaults,
  onSet, onReset,
}: {
  label: string; hint?: string | undefined; fieldKey: keyof OrgDesignDefaultsConfig
  draft: Draft; orgDefaults: OrgDesignDefaultsConfig
  onSet: (key: keyof OrgDesignDefaultsConfig, val: string) => void
  onReset: (key: keyof OrgDesignDefaultsConfig) => void
}) {
  const raw = draft[fieldKey] as string | null | undefined
  const isOverriding = raw != null
  const effective = raw ?? (orgDefaults[fieldKey] as string | null) ?? (SYSTEM_DEFAULTS[fieldKey as string] as string)
  const source = isOverriding ? 'hotel' : sourceLabel(fieldKey as string, orgDefaults)

  return (
    <FormRow label={label} hint={hint}>
      <div className="flex items-center gap-3">
        {isOverriding ? (
          <label className="flex cursor-pointer items-center gap-2">
            <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-[var(--color-border)]" style={{ background: effective }}>
              <input
                type="color"
                value={effective}
                onChange={e => onSet(fieldKey, e.target.value)}
                className="absolute -inset-1 h-10 w-10 cursor-pointer opacity-0"
              />
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
          <button
            type="button"
            onClick={() => onReset(fieldKey)}
            className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]"
          >
            ↩ Reset
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSet(fieldKey, effective)}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            Override
          </button>
        )}
      </div>
    </FormRow>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PropertyBrandPage() {
  const qc = useQueryClient()
  const { propertyId: selectedPropertyId } = useAdminProperty()
  const [draft, setDraft] = useState<Draft>({})
  const [saved, setSaved] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  const { data: designData, isLoading: designLoading } = useQuery<PropertyDesignAdminResponse>({
    queryKey: ['property-design-admin', selectedPropertyId],
    queryFn: () => apiClient.getPropertyDesignAdmin(selectedPropertyId!),
    enabled: selectedPropertyId !== null,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (designData && !initialized) {
      setDraft(designData.overrides)
      setInitialized(true)
      setIsDirty(false)
    }
  }, [designData, initialized])

  useEffect(() => {
    setInitialized(false)
    setIsDirty(false)
  }, [selectedPropertyId])

  const orgDefaults = designData?.orgDefaults ?? ({} as OrgDesignDefaultsConfig)
  const enabledLocales  = (draft.enabledLocales  ?? orgDefaults.enabledLocales  ?? ['en']) as string[]
  const enabledCurrencies = (draft.enabledCurrencies ?? orgDefaults.enabledCurrencies ?? ['EUR']) as string[]

  const { mutate, isPending } = useMutation({
    mutationFn: (d: Draft) => apiClient.updateHotelConfig(selectedPropertyId!, d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['property-design-admin', selectedPropertyId] })
      setIsDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(d => ({ ...d, [key]: value }))
    setIsDirty(true)
  }, [])

  const reset = useCallback((key: keyof Draft) => {
    setDraft(d => ({ ...d, [key]: null }))
    setIsDirty(true)
  }, [])

  const toggleLocale = (code: string) => {
    const current = draft.enabledLocales ?? orgDefaults.enabledLocales ?? ['en']
    set('enabledLocales', current.includes(code) ? current.filter(l => l !== code) : [...current, code])
  }

  const toggleCurrency = (code: string) => {
    const current = draft.enabledCurrencies ?? orgDefaults.enabledCurrencies ?? ['EUR']
    set('enabledCurrencies', current.includes(code) ? current.filter(c => c !== code) : [...current, code])
  }

  const colorProps = { draft, orgDefaults, onSet: set, onReset: reset }

  if (!selectedPropertyId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Property Brand</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Override chain brand settings for this hotel. Fields marked <SourceBadge source="chain" /> or <SourceBadge source="system" /> are inherited — click Override to customize.
        </p>
      </div>

      {designLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Colors */}
          <Section title="Colors">
            {COLOR_FIELDS.map(({ key, label, hint }) => (
              <OverrideColorRow key={key} fieldKey={key} label={label} hint={hint} {...colorProps} />
            ))}
          </Section>

          {/* Typography */}
          <Section title="Typography">
            <OverrideSelectRow
              label="Font family" fieldKey="fontFamily" options={FONT_OPTIONS.map(f => ({ value: f, label: f }))}
              draft={draft} orgDefaults={orgDefaults} onSet={set} onReset={reset}
            />
            <OverrideNumberRow
              label="Border radius" hint="Applied to cards, buttons, inputs (px)" fieldKey="borderRadius"
              min={0} max={32} draft={draft} orgDefaults={orgDefaults} onSet={set} onReset={reset}
            />
          </Section>

          {/* Branding */}
          <Section title="Branding">
            <OverrideTextRow label="Hotel name" hint="Defaults to the name from HyperGuest; override to customise"
              fieldKey="displayName" placeholder="e.g. Grand Palace Hotel"
              hgFallback={designData?.hgName ?? null}
              draft={draft} orgDefaults={orgDefaults} onSet={set} onReset={reset} />
            <OverrideTextRow label="Tagline" hint="Short brand message shown on the homepage"
              fieldKey="tagline" placeholder="e.g. Your home away from home"
              draft={draft} orgDefaults={orgDefaults} onSet={set} onReset={reset} />
            <OverrideTextRow label="Browser tab title" hint="Defaults to the property name if not set"
              fieldKey="tabTitle" placeholder="e.g. Book Direct — Grand Palace"
              draft={draft} orgDefaults={orgDefaults} onSet={set} onReset={reset} />
            <OverrideTextRow label="Logo URL" hint="Direct link or base64 data URL"
              fieldKey="logoUrl" placeholder="https://..."
              draft={draft} orgDefaults={orgDefaults} onSet={set} onReset={reset} />
            <OverrideTextRow label="Favicon URL" hint="16×16 or 32×32 — direct link or base64 data URL"
              fieldKey="faviconUrl" placeholder="https://..."
              draft={draft} orgDefaults={orgDefaults} onSet={set} onReset={reset} />
          </Section>

          {/* Language */}
          <Section title="Language">
            <OverrideDirectionRow
              draft={draft} orgDefaults={orgDefaults} onSet={set} onReset={reset}
            />
            <OverrideLocalesRow
              label="Enabled languages" fieldKey="enabledLocales"
              items={ALL_LOCALES} activeItems={enabledLocales}
              draft={draft} orgDefaults={orgDefaults} onToggle={toggleLocale} onReset={reset}
              onOverride={() => set('enabledLocales', orgDefaults.enabledLocales ?? ['en'])}
            />
            <OverrideSelectRow
              label="Default language" fieldKey="defaultLocale"
              options={ALL_LOCALES.filter(l => enabledLocales.includes(l.code)).map(l => ({ value: l.code, label: l.label }))}
              draft={draft} orgDefaults={orgDefaults} onSet={set} onReset={reset}
            />
          </Section>

          {/* Currency */}
          <Section title="Currency">
            <OverrideLocalesRow
              label="Enabled currencies" fieldKey="enabledCurrencies"
              items={[...TOP_CURRENCIES, ...ALL_CURRENCIES.filter(c => !TOP_CURRENCIES.includes(c))].slice(0, 30).map(c => ({ code: c, label: c }))}
              activeItems={enabledCurrencies}
              draft={draft} orgDefaults={orgDefaults} onToggle={toggleCurrency} onReset={reset}
              onOverride={() => set('enabledCurrencies', orgDefaults.enabledCurrencies ?? ['EUR'])}
            />
            <OverrideSelectRow
              label="Default currency" fieldKey="defaultCurrency"
              options={enabledCurrencies.map(c => ({ value: c, label: `${c} — ${currencyName(c)}` }))}
              draft={draft} orgDefaults={orgDefaults} onSet={set} onReset={reset}
            />
          </Section>
        </div>
      )}

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}

// ── Override field components ─────────────────────────────────────────────────

type OverrideProps = {
  draft: Draft
  orgDefaults: OrgDesignDefaultsConfig
  onSet: (key: keyof Draft, val: Draft[keyof Draft]) => void
  onReset: (key: keyof Draft) => void
}

function OverrideTextRow({ label, hint, fieldKey, placeholder, hgFallback, draft, orgDefaults, onSet, onReset }: OverrideProps & {
  label: string; hint?: string | undefined; fieldKey: keyof OrgDesignDefaultsConfig; placeholder?: string | undefined; hgFallback?: string | null | undefined
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
          <TextInput value={raw ?? ''} onChange={v => onSet(fieldKey, v || null)} placeholder={placeholder} />
        ) : (
          <div className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-muted)] italic">
            {inherited ?? <span className="text-[var(--color-text-muted)]/50">{placeholder ?? 'not set'}</span>}
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

function OverrideSelectRow({ label, hint, fieldKey, options, draft, orgDefaults, onSet, onReset }: OverrideProps & {
  label: string; hint?: string | undefined; fieldKey: keyof OrgDesignDefaultsConfig; options: { value: string; label: string }[]
}) {
  const raw = draft[fieldKey] as string | null | undefined
  const isOverriding = raw != null
  const inherited = (orgDefaults[fieldKey] ?? SYSTEM_DEFAULTS[fieldKey as string]) as string
  const source = isOverriding ? 'hotel' : sourceLabel(fieldKey as string, orgDefaults)

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

function OverrideNumberRow({ label, hint, fieldKey, min, max, draft, orgDefaults, onSet, onReset }: OverrideProps & {
  label: string; hint?: string | undefined; fieldKey: keyof OrgDesignDefaultsConfig; min: number; max: number
}) {
  const raw = draft[fieldKey] as number | null | undefined
  const isOverriding = raw != null
  const inherited = (orgDefaults[fieldKey] ?? SYSTEM_DEFAULTS[fieldKey as string]) as number
  const source = isOverriding ? 'hotel' : sourceLabel(fieldKey as string, orgDefaults)

  return (
    <FormRow label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input type="number" min={min} max={max}
          value={isOverriding ? raw : inherited}
          onChange={e => onSet(fieldKey, Number(e.target.value))}
          disabled={!isOverriding}
          className={`w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)] ${!isOverriding ? 'opacity-50' : ''}`}
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

function OverrideDirectionRow({ draft, orgDefaults, onSet, onReset }: OverrideProps) {
  const raw = draft.textDirection as string | null | undefined
  const isOverriding = raw != null
  const inherited = (orgDefaults.textDirection ?? SYSTEM_DEFAULTS['textDirection']) as string
  const source = isOverriding ? 'hotel' : sourceLabel('textDirection', orgDefaults)
  const active = isOverriding ? raw : inherited

  return (
    <FormRow label="Text direction">
      <div className="flex items-center gap-3">
        <div className={`flex gap-2 ${!isOverriding ? 'opacity-50 pointer-events-none' : ''}`}>
          {(['ltr', 'rtl'] as const).map(dir => (
            <button key={dir} type="button" onClick={() => onSet('textDirection', dir)}
              className={['rounded-lg border px-4 py-1.5 text-sm font-medium transition-all',
                active === dir
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)]'].join(' ')}>
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

function OverrideLocalesRow({ label, fieldKey, items, activeItems, draft, orgDefaults, onToggle, onReset, onOverride }: {
  label: string; fieldKey: keyof OrgDesignDefaultsConfig
  items: { code: string; label: string }[]
  activeItems: string[]
  draft: Draft; orgDefaults: OrgDesignDefaultsConfig
  onToggle: (code: string) => void
  onReset: (key: keyof Draft) => void
  onOverride: () => void
}) {
  const raw = draft[fieldKey] as string[] | null | undefined
  const isOverriding = raw != null
  const source = isOverriding ? 'hotel' : sourceLabel(fieldKey as string, orgDefaults)

  return (
    <FormRow label={label}>
      <div className="flex flex-wrap items-start gap-2">
        <div className={`flex flex-wrap gap-2 ${!isOverriding ? 'opacity-60 pointer-events-none' : ''}`}>
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
        <div className="flex items-center gap-2 mt-1">
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
