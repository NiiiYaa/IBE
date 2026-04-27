'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, GlobalDesignAdminResponse } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { ALL_CURRENCIES, TOP_CURRENCIES, currencyName } from '@/lib/currencies'
import { AgeTag, ColorRow, FormRow, Section, TextInput, SaveBar, Toggle, selectCls } from '../components'
import { compressImage } from '@/lib/compress-image'

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

const SYSTEM_DEFAULTS: Record<string, string> = {
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
}

type Draft = Partial<OrgDesignDefaultsConfig>

export default function GlobalBrandPage() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft>({})
  const [saved, setSaved] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const initialized = useRef(false)

  const { data, isLoading } = useQuery<GlobalDesignAdminResponse>({
    queryKey: ['global-design-defaults'],
    queryFn: () => apiClient.getGlobalDesignDefaults(),
    staleTime: 0,
  })

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true
      setDraft(data.overrides)
      setIsDirty(false)
    }
  }, [data])

  // Live preview — apply draft colors to CSS vars
  useEffect(() => {
    const vars: Array<[string, string | null | undefined]> = [
      ['--color-primary',       draft.colorPrimary],
      ['--color-primary-hover', draft.colorPrimaryHover],
      ['--color-primary-light', draft.colorPrimaryLight],
      ['--color-accent',        draft.colorAccent],
      ['--color-background',    draft.colorBackground],
      ['--color-surface',       draft.colorSurface],
      ['--color-text',          draft.colorText],
      ['--color-text-muted',    draft.colorTextMuted],
      ['--color-border',        draft.colorBorder],
      ['--color-success',       draft.colorSuccess],
      ['--color-error',         draft.colorError],
      ['--radius-md',           draft.borderRadius != null ? `${draft.borderRadius}px` : undefined],
      ['--font-sans',           draft.fontFamily ? `'${draft.fontFamily}', system-ui, sans-serif` : undefined],
    ]
    vars.forEach(([prop, val]) => {
      if (prop && val) document.documentElement.style.setProperty(prop, val)
    })
  }, [draft])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: Draft) => apiClient.updateGlobalDesignDefaults(d),
    onSuccess: (fresh) => {
      qc.setQueryData<GlobalDesignAdminResponse>(['global-design-defaults'], fresh)
      setIsDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(d => ({ ...d, [key]: value }))
    setIsDirty(true)
  }, [])

  const toggleLocale = (code: string) => {
    setDraft(d => {
      const current = d.enabledLocales ?? []
      return {
        ...d,
        enabledLocales: current.includes(code) ? current.filter(l => l !== code) : [...current, code],
      }
    })
    setIsDirty(true)
  }

  const toggleCurrency = (code: string) => {
    setDraft(d => {
      const current = d.enabledCurrencies ?? []
      return {
        ...d,
        enabledCurrencies: current.includes(code) ? current.filter(c => c !== code) : [...current, code],
      }
    })
    setIsDirty(true)
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    )
  }

  const sysDefs = data?.systemDefaults ?? ({} as OrgDesignDefaultsConfig)
  const enabledLocales = draft.enabledLocales ?? []
  const enabledCurrencies = draft.enabledCurrencies ?? []

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Global Brand</h1>
      </div>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        These settings apply to all properties by default. Individual properties can override them.
      </p>

      {/* Homepage Layout */}
      <Section title="Homepage Layout">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {([
            { value: 'fullpage', label: 'Full-page hero', desc: 'Image fills the entire screen, search bar overlaid at the bottom' },
            { value: 'rectangle', label: 'Rectangle hero', desc: 'Image in a top banner, hotel name and search bar below' },
            { value: 'quilt', label: 'Quilt', desc: 'Mosaic of up to 5 photos side by side, hotel name and search bar below' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => set('heroStyle', opt.value)}
              className={[
                'rounded-xl border-2 p-4 text-left transition-all',
                (draft.heroStyle ?? null) === opt.value
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-primary-light)]',
              ].join(' ')}
            >
              <div className="mb-3 h-16 w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
                {opt.value === 'fullpage' ? (
                  <div className="relative h-full w-full bg-slate-600">
                    <div className="absolute bottom-2 left-2 right-2 h-3 rounded-full bg-white/70" />
                    <div className="absolute inset-x-0 top-2 mx-auto h-2 w-1/2 rounded bg-white/40" />
                  </div>
                ) : opt.value === 'quilt' ? (
                  <div className="flex h-full flex-col gap-0.5 p-1">
                    <div className="flex flex-1 gap-0.5 overflow-hidden rounded">
                      <div className="flex-[3] bg-slate-500" />
                      <div className="flex flex-[2] flex-col gap-0.5">
                        <div className="flex flex-1 gap-0.5">
                          <div className="flex-1 bg-slate-400" />
                          <div className="flex-1 bg-slate-600" />
                        </div>
                        <div className="flex flex-1 gap-0.5">
                          <div className="flex-1 bg-slate-600" />
                          <div className="flex-1 bg-slate-400" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col">
                    <div className="h-1.5 bg-[var(--color-surface)]" />
                    <div className="h-7 flex-none bg-slate-500" />
                    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-2">
                      <div className="h-1.5 w-3/4 rounded bg-[var(--color-border)]" />
                      <div className="h-2.5 w-full rounded-full bg-[var(--color-primary)]/40" />
                    </div>
                  </div>
                )}
              </div>
              <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Image style</p>
          <div className="flex gap-3">
            {([
              { value: 'fixed', label: 'Fixed image', desc: 'One photo, no movement' },
              { value: 'carousel', label: 'Carousel', desc: 'Cycles through all hotel photos automatically' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => set('heroImageMode', opt.value)}
                className={[
                  'flex-1 rounded-xl border-2 p-3 text-left transition-all',
                  (draft.heroImageMode ?? null) === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}
              >
                <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {draft.heroImageMode === 'carousel' && (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Slide interval
              <span className="ml-1.5 font-normal normal-case text-[var(--color-text-muted)]/60">seconds between images</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={2} max={15} step={1}
                value={draft.heroCarouselInterval ?? 5}
                onChange={e => set('heroCarouselInterval', Number(e.target.value))}
                className="flex-1 accent-[var(--color-primary)]"
              />
              <span className="w-12 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
                {draft.heroCarouselInterval ?? 5}s
              </span>
            </div>
          </div>
        )}
      </Section>

      {/* Colors */}
      <Section title="Colors">
        {COLOR_FIELDS.map(({ key, label, hint }) => (
          <ColorRow
            key={key}
            label={label}
            hint={hint}
            value={(draft[key] as string | null) ?? (sysDefs[key] as string | null) ?? '#000000'}
            onChange={v => set(key, v)}
          />
        ))}
      </Section>

      {/* Typography */}
      <Section title="Typography & Shape">
        <FormRow label="Font family">
          <select
            value={draft.fontFamily ?? 'Roboto'}
            onChange={e => set('fontFamily', e.target.value)}
            className={selectCls}
          >
            {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </FormRow>
        <FormRow label="Border radius" hint={`${draft.borderRadius ?? 8}px — applied to cards, buttons, inputs`}>
          <input
            type="range"
            min={0}
            max={24}
            step={2}
            value={draft.borderRadius ?? 8}
            onChange={e => set('borderRadius', Number(e.target.value))}
            className="w-full accent-[var(--color-primary)]"
          />
          <div className="mt-2 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span>Square</span>
            <div className="flex-1 h-px bg-[var(--color-border)]" />
            <span>Rounded</span>
          </div>
        </FormRow>
      </Section>

      {/* Branding */}
      <Section title="Branding">
        <FormRow label="Display name" hint="Overrides the property name from HyperGuest">
          <TextInput
            value={draft.displayName ?? ''}
            onChange={v => set('displayName', v || null)}
            placeholder="e.g. Grand Palace Hotel"
          />
        </FormRow>
        <FormRow label="Tagline" hint="Short brand message shown on the homepage">
          <TextInput
            value={draft.tagline ?? ''}
            onChange={v => set('tagline', v || null)}
            placeholder="e.g. Your home away from home"
          />
        </FormRow>
        <FormRow label="Browser tab title" hint="Defaults to the property name if not set">
          <TextInput
            value={draft.tabTitle ?? ''}
            onChange={v => set('tabTitle', v || null)}
            placeholder="e.g. Book Direct — Grand Palace"
          />
        </FormRow>
        <FormRow label="Logo URL" hint="Direct link or base64 data URL">
          <TextInput
            value={draft.logoUrl ?? ''}
            onChange={v => set('logoUrl', v || null)}
            placeholder="https://..."
          />
          {draft.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.logoUrl} alt="Logo preview" className="mt-2 h-10 max-w-[160px] rounded object-contain" />
          )}
        </FormRow>
        <FormRow label="Favicon URL" hint="16×16 or 32×32 — direct link or base64 data URL">
          <div className="flex items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
              Upload file
              <input type="file" accept="image/png,image/x-icon,image/svg+xml,image/jpeg,image/webp" className="sr-only"
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  e.target.value = ''
                  set('faviconUrl', await compressImage(file, 256))
                }} />
            </label>
            <span className="text-xs text-[var(--color-text-muted)]">or</span>
            <TextInput
              value={draft.faviconUrl ?? ''}
              onChange={v => set('faviconUrl', v || null)}
              placeholder="https://..."
            />
          </div>
          {draft.faviconUrl && (
            <div className="mt-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.faviconUrl} alt="Favicon preview" className="h-8 w-8 rounded object-contain border border-[var(--color-border)] bg-[var(--color-background)] p-0.5" />
              <button onClick={() => set('faviconUrl', null)} className="text-xs text-[var(--color-text-muted)] underline-offset-2 hover:underline">
                Remove
              </button>
            </div>
          )}
        </FormRow>
      </Section>

      {/* Language */}
      <Section title="Language">
        <FormRow label="Text direction">
          <div className="flex gap-2">
            {(['ltr', 'rtl'] as const).map(dir => (
              <button
                key={dir}
                type="button"
                onClick={() => set('textDirection', dir)}
                className={[
                  'rounded-lg border px-4 py-1.5 text-sm font-medium transition-all',
                  (draft.textDirection ?? 'ltr') === dir
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                ].join(' ')}
              >
                {dir.toUpperCase()}
              </button>
            ))}
          </div>
        </FormRow>
        <FormRow label="Enabled languages">
          <div className="flex flex-wrap gap-2">
            {ALL_LOCALES.map(({ code, label }) => {
              const active = enabledLocales.includes(code)
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleLocale(code)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs font-medium transition-all',
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </FormRow>
        <FormRow label="Default language">
          <select
            value={draft.defaultLocale ?? 'en'}
            onChange={e => set('defaultLocale', e.target.value)}
            className={selectCls}
          >
            {ALL_LOCALES.filter(l => enabledLocales.includes(l.code)).map(({ code, label }) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </FormRow>
      </Section>

      {/* Search Results */}
      <Section title="Search Results">
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Banner image style</p>
          <div className="flex gap-3">
            {([
              { value: null, label: 'No banner', desc: 'Search results page has no hero image' },
              { value: 'fixed', label: 'Fixed image', desc: 'One selected photo at the top' },
              { value: 'carousel', label: 'Carousel', desc: 'Cycles through all property photos' },
            ] as const).map(opt => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  set('searchResultsImageMode', opt.value === null ? null : opt.value)
                  if (opt.value === null) set('searchResultsImageUrl', null)
                }}
                className={[
                  'flex-1 rounded-xl border-2 p-3 text-left transition-all',
                  (opt.value === null ? !draft.searchResultsImageMode : draft.searchResultsImageMode === opt.value)
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}
              >
                <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
              </button>
            ))}
          </div>
          {draft.searchResultsImageMode === 'carousel' && (
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Slide interval
                <span className="ml-1.5 font-normal normal-case text-[var(--color-text-muted)]/60">seconds between images</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={2} max={15} step={1}
                  value={draft.searchResultsCarouselInterval ?? 5}
                  onChange={e => set('searchResultsCarouselInterval', Number(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <span className="w-12 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
                  {draft.searchResultsCarouselInterval ?? 5}s
                </span>
              </div>
            </div>
          )}
          {draft.searchResultsImageMode === 'fixed' && (
            <div className="mt-4">
              <FormRow label="Banner image URL" hint="Direct link to the image">
                <TextInput
                  value={draft.searchResultsImageUrl ?? ''}
                  onChange={v => set('searchResultsImageUrl', v || null)}
                  placeholder="https://..."
                />
              </FormRow>
            </div>
          )}
        </div>

        <Toggle
          label="Show all offers expanded by default"
          hint="When enabled, room rate options unfold automatically on the search results page."
          checked={draft.roomRatesDefaultExpanded ?? false}
          onChange={v => set('roomRatesDefaultExpanded', v)}
        />

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Guest age groups</p>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Define the age boundaries used to categorise guests in the search form.
            Adults are any guest aged {(draft.childMaxAge ?? 16) + 1} and above.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label="Infant max age" hint={`Ages 0–${draft.infantMaxAge ?? 2} shown as Infants`}>
              <input
                type="number" min={0} max={4}
                value={draft.infantMaxAge ?? 2}
                onChange={e => set('infantMaxAge', Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
              />
            </FormRow>
            <FormRow label="Child max age" hint={`Ages ${(draft.infantMaxAge ?? 2) + 1}–${draft.childMaxAge ?? 16} shown as Children`}>
              <input
                type="number" min={5} max={17}
                value={draft.childMaxAge ?? 16}
                onChange={e => set('childMaxAge', Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
              />
            </FormRow>
          </div>
          <div className="mt-1 flex gap-4 text-xs">
            <AgeTag label="Infants" range={`0–${draft.infantMaxAge ?? 2}`} color="blue" />
            <AgeTag label="Children" range={`${(draft.infantMaxAge ?? 2) + 1}–${draft.childMaxAge ?? 16}`} color="amber" />
            <AgeTag label="Adults" range={`${(draft.childMaxAge ?? 16) + 1}+`} color="green" />
          </div>
        </div>
      </Section>

      {/* Currency */}
      <Section title="Currency">
        <FormRow label="Enabled currencies">
          <div className="flex flex-wrap gap-2">
            {[...TOP_CURRENCIES, ...ALL_CURRENCIES.filter(c => !TOP_CURRENCIES.includes(c))].slice(0, 30).map(code => {
              const active = enabledCurrencies.includes(code)
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleCurrency(code)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs font-medium transition-all',
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {code}
                </button>
              )
            })}
          </div>
        </FormRow>
        <FormRow label="Default currency">
          <select
            value={draft.defaultCurrency ?? 'EUR'}
            onChange={e => set('defaultCurrency', e.target.value)}
            className={selectCls}
          >
            {enabledCurrencies.map(code => (
              <option key={code} value={code}>{code} — {currencyName(code)}</option>
            ))}
          </select>
        </FormRow>
      </Section>

      {/* Live preview */}
      <Section title="Live preview">
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
          <div className="bg-[var(--color-primary)] p-4">
            <p className="text-sm font-semibold text-white">{draft.displayName || 'Hotel Name'}</p>
            <p className="text-xs text-white/70">{draft.tagline || 'Your tagline here'}</p>
          </div>
          <div className="space-y-3 bg-[var(--color-background)] p-4">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
              <p className="text-sm font-semibold text-[var(--color-text)]">Standard Room</p>
              <p className="text-xs text-[var(--color-text-muted)]">2 nights · 2 adults</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">Free cancellation</span>
                <button
                  className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white"
                  style={{ borderRadius: `${draft.borderRadius ?? 8}px` }}
                >
                  €300
                </button>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}
