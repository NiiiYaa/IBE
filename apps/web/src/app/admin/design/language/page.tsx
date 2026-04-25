'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, PropertyDesignAdminResponse } from '@ibe/shared'
import { useGlobalConfig } from '@/hooks/use-global-config'
import { useAdminProperty } from '../../property-context'
import { apiClient } from '@/lib/api-client'
import { localeName, localeFlag } from '@/lib/locales'
import { SaveBar, Section } from '../components'
import { OverrideSelectRow, OverrideDirectionRow, OverrideLocalesRow } from '../override-helpers'

const ALL_LOCALES = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'ar', 'zh', 'ja', 'ru', 'he', 'tr', 'ko', 'pl', 'sv']

export default function LanguagePage() {
  const { propertyId } = useAdminProperty()
  if (propertyId === null) return <GlobalLanguageEditor />
  return <PropertyLanguageEditor propertyId={propertyId ?? 0} />
}

// ── Global editor ─────────────────────────────────────────────────────────────

function GlobalLanguageEditor() {
  const { isLoading, draft, set, save, isPending, isDirty, systemDefaults } = useGlobalConfig()

  if (isLoading) return <Spinner />

  const defaultLocale = draft.defaultLocale ?? 'en'
  const textDirection = draft.textDirection ?? 'ltr'
  const enabledLocales = draft.enabledLocales ?? []

  const toggleLocale = (code: string) => {
    const current = draft.enabledLocales ?? []
    set('enabledLocales', current.includes(code) ? current.filter(l => l !== code) : [...current, code])
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Language</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Chain defaults — apply to all hotels unless overridden at the hotel level.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        <Section title="Enabled Languages">
          <div className="flex flex-wrap gap-2">
            {ALL_LOCALES.map(code => {
              const active = enabledLocales.includes(code)
              return (
                <button key={code} type="button" onClick={() => toggleLocale(code)}
                  className={['rounded-full border px-3 py-1 text-xs font-medium transition-all',
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {localeFlag(code)} {localeName(code)}
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="Default Language">
          <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Default language</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Language shown to guests on their first visit before they switch.
              </p>
            </div>
            <select
              value={defaultLocale}
              onChange={e => set('defaultLocale', e.target.value)}
              className="ml-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
            >
              {ALL_LOCALES.map(code => (
                <option key={code} value={code}>{localeFlag(code)}  {localeName(code)}</option>
              ))}
            </select>
          </div>
        </Section>

        <Section title="Text Direction">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <div className="mb-4">
              <p className="text-sm font-medium text-[var(--color-text)]">Reading direction</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Use RTL for Arabic, Hebrew, and other right-to-left languages.
              </p>
            </div>
            <div className="flex gap-3">
              {(['ltr', 'rtl'] as const).map(dir => (
                <button key={dir} onClick={() => set('textDirection', dir)}
                  className={['flex flex-1 items-center justify-center gap-2 rounded-lg border py-3 text-sm font-medium transition-colors',
                    textDirection === dir
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/50 hover:text-[var(--color-text)]',
                  ].join(' ')}
                >
                  <span className="text-base">{dir === 'ltr' ? '→' : '←'}</span>
                  <span>{dir === 'ltr' ? 'LTR — Left to Right' : 'RTL — Right to Left'}</span>
                </button>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={save} />
    </div>
  )
}

// ── Property editor ───────────────────────────────────────────────────────────

function PropertyLanguageEditor({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Partial<OrgDesignDefaultsConfig>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const { data: designData, isLoading } = useQuery<PropertyDesignAdminResponse>({
    queryKey: ['property-design-admin', propertyId],
    queryFn: () => apiClient.getPropertyDesignAdmin(propertyId),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (designData && !initialized) {
      setDraft(designData.overrides)
      setInitialized(true)
      setIsDirty(false)
    }
  }, [designData, initialized])

  useEffect(() => { setInitialized(false); setIsDirty(false) }, [propertyId])

  const orgDefaults = designData?.orgDefaults ?? ({} as OrgDesignDefaultsConfig)
  const sysDefs = designData?.systemDefaults ?? ({} as OrgDesignDefaultsConfig)

  const { mutate, isPending } = useMutation({
    mutationFn: (d: Partial<OrgDesignDefaultsConfig>) => apiClient.updateHotelConfig(propertyId, d as Parameters<typeof apiClient.updateHotelConfig>[1]),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['property-design-admin', propertyId] })
      setIsDirty(false)
    },
  })

  const set = useCallback(<K extends keyof OrgDesignDefaultsConfig>(key: K, value: OrgDesignDefaultsConfig[K]) => {
    setDraft(d => ({ ...d, [key]: value }))
    setIsDirty(true)
  }, [])

  const reset = useCallback((key: keyof OrgDesignDefaultsConfig) => {
    setDraft(d => ({ ...d, [key]: null }))
    setIsDirty(true)
  }, [])

  if (!propertyId || isLoading) return <Spinner />

  const setStr = set as (key: keyof OrgDesignDefaultsConfig, val: string) => void
  const localeOptions = ALL_LOCALES.map(code => ({ value: code, label: `${localeFlag(code)}  ${localeName(code)}` }))
  const localeItems = ALL_LOCALES.map(code => ({ code, label: `${localeFlag(code)} ${localeName(code)}` }))

  const enabledLocalesOverride = draft.enabledLocales as string[] | null | undefined
  const activeLocales = enabledLocalesOverride ?? (orgDefaults.enabledLocales ?? ['en'])

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-xl font-semibold text-[var(--color-text)]">Language</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        Hotel overrides — inherit from chain or set a custom value for this hotel.
      </p>

      <div className="space-y-6">
        <Section title="Enabled Languages">
          <OverrideLocalesRow
            label="Languages shown to guests"
            fieldKey="enabledLocales"
            items={localeItems}
            activeItems={activeLocales}
            draft={draft}
            orgDefaults={orgDefaults}
            onToggle={code => {
              const current = (draft.enabledLocales as string[] | null | undefined) ?? (orgDefaults.enabledLocales ?? ['en'])
              set('enabledLocales', current.includes(code) ? current.filter(l => l !== code) : [...current, code])
            }}
            onReset={reset}
            onOverride={() => set('enabledLocales', orgDefaults.enabledLocales ?? ['en'])}
          />
        </Section>

        <Section title="Default Language">
          <OverrideSelectRow label="Default language" fieldKey="defaultLocale" systemDefault={sysDefs.defaultLocale ?? 'en'}
            options={localeOptions}
            draft={draft} orgDefaults={orgDefaults} onSet={setStr} onReset={reset} />
        </Section>

        <Section title="Text Direction">
          <OverrideDirectionRow draft={draft} orgDefaults={orgDefaults} onSet={setStr} onReset={reset} />
        </Section>
      </div>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}

function Spinner() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-3">
      {[1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--color-border)]" />)}
    </div>
  )
}
