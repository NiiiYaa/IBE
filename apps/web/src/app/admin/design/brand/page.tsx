'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig } from '@ibe/shared'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import { apiClient } from '@/lib/api-client'
import { ColorRow, Section, FormRow, SaveBar, Toggle, selectCls } from '../components'

const FONT_OPTIONS = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
  'Raleway', 'Nunito', 'Playfair Display', 'Inter',
]

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

const HARDCODED: Record<string, string | number | string[]> = {
  colorPrimary: '#0f509e',
  colorPrimaryHover: '#0a3a7a',
  colorPrimaryLight: '#e8f0fb',
  colorAccent: '#1399cd',
  colorBackground: '#f2f3ef',
  colorSurface: '#ffffff',
  colorText: '#211c18',
  colorTextMuted: '#717171',
  colorBorder: '#e0e0e0',
  colorSuccess: '#308c67',
  colorError: '#de1f27',
  fontFamily: 'Roboto',
  borderRadius: 8,
  defaultCurrency: 'EUR',
  defaultLocale: 'en',
  enabledLocales: ['en'],
  enabledCurrencies: ['EUR'],
}

const ALL_LOCALES = ['en', 'he', 'ar', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'zh', 'ja', 'ko']
const ALL_CURRENCIES = ['EUR', 'USD', 'GBP', 'ILS', 'JPY', 'AUD', 'CAD', 'CHF', 'SEK', 'NOK', 'DKK', 'SGD', 'AED']
const LOCALE_LABELS: Record<string, string> = {
  en: 'English', he: 'Hebrew', ar: 'Arabic', fr: 'French', de: 'German',
  es: 'Spanish', it: 'Italian', pt: 'Portuguese', ru: 'Russian',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
}

type Draft = Partial<OrgDesignDefaultsConfig>

function resolved<T>(draft: Draft, key: keyof OrgDesignDefaultsConfig, fallback: T): T {
  const v = draft[key]
  return (v !== null && v !== undefined ? v : fallback) as T
}

function SystemBrandEditor() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const initialized = useRef(false)
  const savedSnapshot = useRef<Draft | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['system-design-defaults'],
    queryFn: () => apiClient.getSystemDesignDefaults(),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true
      setDraft(data)
      savedSnapshot.current = data
    }
  }, [data])

  // Live-preview CSS vars
  useEffect(() => {
    const vars: Array<[string, string]> = [
      ['--color-primary',       resolved(draft, 'colorPrimary',      HARDCODED.colorPrimary as string)],
      ['--color-primary-hover', resolved(draft, 'colorPrimaryHover', HARDCODED.colorPrimaryHover as string)],
      ['--color-primary-light', resolved(draft, 'colorPrimaryLight', HARDCODED.colorPrimaryLight as string)],
      ['--color-accent',        resolved(draft, 'colorAccent',       HARDCODED.colorAccent as string)],
      ['--color-background',    resolved(draft, 'colorBackground',   HARDCODED.colorBackground as string)],
      ['--color-surface',       resolved(draft, 'colorSurface',      HARDCODED.colorSurface as string)],
      ['--color-text',          resolved(draft, 'colorText',         HARDCODED.colorText as string)],
      ['--color-text-muted',    resolved(draft, 'colorTextMuted',    HARDCODED.colorTextMuted as string)],
      ['--color-border',        resolved(draft, 'colorBorder',       HARDCODED.colorBorder as string)],
      ['--color-success',       resolved(draft, 'colorSuccess',      HARDCODED.colorSuccess as string)],
      ['--color-error',         resolved(draft, 'colorError',        HARDCODED.colorError as string)],
    ]
    vars.forEach(([prop, val]) => document.documentElement.style.setProperty(prop, val))
  }, [draft])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: Draft) => apiClient.updateSystemDesignDefaults(d),
    onSuccess: (fresh) => {
      qc.setQueryData(['system-design-defaults'], fresh)
      savedSnapshot.current = fresh
      setSaveError(null)
    },
    onError: (err: unknown) => setSaveError(err instanceof Error ? err.message : 'Save failed'),
  })

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const isDirty = savedSnapshot.current !== null &&
    JSON.stringify(draft) !== JSON.stringify(savedSnapshot.current)

  if (isLoading) return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
    </div>
  )

  const enabledLocales = resolved(draft, 'enabledLocales', HARDCODED.enabledLocales as string[])
  const enabledCurrencies = resolved(draft, 'enabledCurrencies', HARDCODED.enabledCurrencies as string[])

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Brand Defaults</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          System-wide defaults inherited by all organisations. Changes here apply everywhere
          unless an organisation has configured its own values.
        </p>
      </div>

      {/* Colors */}
      <Section title="Colours" defaultOpen>
        {COLOR_FIELDS.map(({ key, label, hint }) => (
          <ColorRow
            key={key}
            label={label}
            hint={hint}
            value={resolved(draft, key, HARDCODED[key as string] as string)}
            onChange={v => set(key, v)}
          />
        ))}
      </Section>

      {/* Typography */}
      <Section title="Typography & Shape" defaultOpen>
        <div className="grid grid-cols-2 gap-4">
          <FormRow label="Font family">
            <select
              value={resolved(draft, 'fontFamily', HARDCODED.fontFamily as string)}
              onChange={e => set('fontFamily', e.target.value)}
              className={selectCls}
              style={{ fontFamily: resolved(draft, 'fontFamily', 'Roboto') }}
            >
              {FONT_OPTIONS.map(f => (
                <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
              ))}
            </select>
          </FormRow>
          <FormRow
            label="Border radius"
            hint={`${resolved(draft, 'borderRadius', 8)}px`}
          >
            <input
              type="range" min={0} max={24} step={2}
              value={resolved(draft, 'borderRadius', 8)}
              onChange={e => set('borderRadius', Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
          </FormRow>
        </div>
      </Section>

      {/* Locale & Currency */}
      <Section title="Locale & Currency" defaultOpen>
        <div className="grid grid-cols-2 gap-6">
          <FormRow label="Default locale">
            <select
              value={resolved(draft, 'defaultLocale', 'en')}
              onChange={e => set('defaultLocale', e.target.value)}
              className={selectCls}
            >
              {ALL_LOCALES.map(l => (
                <option key={l} value={l}>{LOCALE_LABELS[l] ?? l}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Default currency">
            <select
              value={resolved(draft, 'defaultCurrency', 'EUR')}
              onChange={e => set('defaultCurrency', e.target.value)}
              className={selectCls}
            >
              {ALL_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormRow>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-6">
          <FormRow label="Enabled locales">
            <div className="flex flex-wrap gap-1.5">
              {ALL_LOCALES.map(l => {
                const active = (enabledLocales as string[]).includes(l)
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? (enabledLocales as string[]).filter(x => x !== l)
                        : [...(enabledLocales as string[]), l]
                      set('enabledLocales', next)
                    }}
                    className={[
                      'rounded border px-2.5 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                    ].join(' ')}
                  >
                    {LOCALE_LABELS[l] ?? l}
                  </button>
                )
              })}
            </div>
          </FormRow>
          <FormRow label="Enabled currencies">
            <div className="flex flex-wrap gap-1.5">
              {ALL_CURRENCIES.map(c => {
                const active = (enabledCurrencies as string[]).includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? (enabledCurrencies as string[]).filter(x => x !== c)
                        : [...(enabledCurrencies as string[]), c]
                      set('enabledCurrencies', next)
                    }}
                    className={[
                      'rounded border px-2.5 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                    ].join(' ')}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          </FormRow>
        </div>

        <div className="mt-4">
          <FormRow label="Text direction">
            <div className="flex gap-3">
              {(['ltr', 'rtl'] as const).map(dir => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => set('textDirection', dir)}
                  className={[
                    'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                    resolved(draft, 'textDirection', 'ltr') === dir
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                      : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {dir.toUpperCase()}
                </button>
              ))}
            </div>
          </FormRow>
        </div>
      </Section>

      {/* Payment */}
      <Section title="Payment Defaults">
        <div className="space-y-3">
          <Toggle
            label="Online payment enabled"
            hint="Pay by card at booking."
            checked={resolved(draft, 'onlinePaymentEnabled', true)}
            onChange={v => set('onlinePaymentEnabled', v)}
          />
          <Toggle
            label="Pay at hotel enabled"
            hint="Reserve now, pay on arrival."
            checked={resolved(draft, 'payAtHotelEnabled', true)}
            onChange={v => set('payAtHotelEnabled', v)}
          />
          <Toggle
            label="Require card guarantee for pay-at-hotel"
            hint="Card captured but not charged; used as a security deposit."
            checked={resolved(draft, 'payAtHotelCardGuaranteeRequired', false)}
            onChange={v => set('payAtHotelCardGuaranteeRequired', v)}
          />
        </div>
      </Section>

      {/* Layout defaults */}
      <Section title="Layout Defaults">
        <div className="space-y-4">
          <FormRow label="Property list layout">
            <div className="flex gap-3">
              {(['grid', 'list'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set('propertyListLayout', opt)}
                  className={[
                    'flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors',
                    resolved(draft, 'propertyListLayout', 'grid') === opt
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {opt === 'grid' ? 'Cards (grid)' : 'Rows (list)'}
                </button>
              ))}
            </div>
          </FormRow>
          <FormRow label="Room search layout">
            <div className="flex gap-3">
              {(['rows', 'cards'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set('roomSearchLayout', opt)}
                  className={[
                    'flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors',
                    resolved(draft, 'roomSearchLayout', 'rows') === opt
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {opt === 'rows' ? 'Rows' : 'Cards'}
                </button>
              ))}
            </div>
          </FormRow>
          <FormRow label="Search sidebar position">
            <div className="flex gap-3">
              {(['left', 'right'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set('searchSidebarPosition', opt)}
                  className={[
                    'flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors',
                    resolved(draft, 'searchSidebarPosition', 'left') === opt
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {opt}
                </button>
              ))}
            </div>
          </FormRow>
          <Toggle
            label="Room rates expanded by default"
            hint="Show all rate options open when a room card loads."
            checked={resolved(draft, 'roomRatesDefaultExpanded', false)}
            onChange={v => set('roomRatesDefaultExpanded', v)}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormRow label="Infant max age">
              <input
                type="number" min={0} max={5}
                value={resolved(draft, 'infantMaxAge', 2)}
                onChange={e => set('infantMaxAge', Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </FormRow>
            <FormRow label="Child max age">
              <input
                type="number" min={1} max={17}
                value={resolved(draft, 'childMaxAge', 16)}
                onChange={e => set('childMaxAge', Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </FormRow>
          </div>
        </div>
      </Section>

      {saveError && (
        <p className="text-sm text-[var(--color-error)]">{saveError}</p>
      )}

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}

function OrgBrandView() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Brand Defaults</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Org-level brand settings are configured in the{' '}
        <a href="/admin/design/chain" className="text-[var(--color-primary)] underline">Chain page</a>{' '}
        and{' '}
        <a href="/admin/design/homepage" className="text-[var(--color-primary)] underline">Hotel page</a>{' '}
        sections. Select <strong>System</strong> in the top selector to edit platform-wide defaults.
      </p>
    </div>
  )
}

export default function BrandPage() {
  const { admin } = useAdminAuth()
  const { orgId: contextOrgId } = useAdminProperty()
  const isSystemLevel = admin?.role === 'super' && contextOrgId === null

  if (!isSystemLevel) return <OrgBrandView />
  return <SystemBrandEditor />
}
