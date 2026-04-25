'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, PropertyDesignAdminResponse } from '@ibe/shared'
import { useGlobalConfig } from '@/hooks/use-global-config'
import { useAdminProperty } from '../../property-context'
import { apiClient } from '@/lib/api-client'
import { ALL_CURRENCIES, TOP_CURRENCIES, currencyName, currencySymbol } from '@/lib/currencies'
import { SaveBar, Section } from '../components'
import { OverrideSelectRow } from '../override-helpers'

const RATE_PROVIDERS = [
  {
    key: 'frankfurter',
    name: 'Frankfurter',
    description: 'European Central Bank rates · Free, no API key required · Updated daily',
    url: 'https://www.frankfurter.dev',
  },
]

export default function CurrencyPage() {
  const { propertyId } = useAdminProperty()
  if (propertyId === null) return <GlobalCurrencyEditor />
  return <PropertyCurrencyEditor propertyId={propertyId ?? 0} />
}

// ── Global editor ─────────────────────────────────────────────────────────────

function GlobalCurrencyEditor() {
  const { isLoading, draft, set, save, isPending, isDirty, systemDefaults } = useGlobalConfig()
  const qc = useQueryClient()

  const { data: orgSettings } = useQuery({
    queryKey: ['admin-org'],
    queryFn: () => apiClient.getOrgSettings(),
  })

  const providerMutation = useMutation({
    mutationFn: (provider: string) => apiClient.setRateProvider(provider),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-org'] }),
  })

  if (isLoading) return <Spinner />

  const topSet = new Set(TOP_CURRENCIES)
  const currencyOptions = [...TOP_CURRENCIES, '---', ...ALL_CURRENCIES.filter(c => !topSet.has(c))]
  const enabledCurrencies = draft.enabledCurrencies ?? []
  const activeProvider = orgSettings?.rateProvider ?? 'frankfurter'

  const toggleCurrency = (code: string) => {
    const current = draft.enabledCurrencies ?? []
    set('enabledCurrencies', current.includes(code) ? current.filter(c => c !== code) : [...current, code])
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Currency</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Chain defaults — apply to all hotels unless overridden at the hotel level.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        <Section title="Enabled Currencies">
          <div className="flex flex-wrap gap-2">
            {[...TOP_CURRENCIES, ...ALL_CURRENCIES.filter(c => !topSet.has(c))].slice(0, 40).map(code => {
              const active = enabledCurrencies.includes(code)
              return (
                <button key={code} type="button" onClick={() => toggleCurrency(code)}
                  className={['rounded-full border px-3 py-1 text-xs font-medium transition-all',
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
        </Section>

        <Section title="Default Currency">
          <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Default currency</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Shown to guests on their first visit. Prices from HyperGuest are converted using the exchange rate provider below.
              </p>
            </div>
            <select
              value={draft.defaultCurrency ?? 'EUR'}
              onChange={e => set('defaultCurrency', e.target.value)}
              className="ml-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
            >
              {currencyOptions.map(code =>
                code === '---'
                  ? <option key="sep" disabled>──────────</option>
                  : <option key={code} value={code}>{currencySymbol(code)}  {code} · {currencyName(code)}</option>
              )}
            </select>
          </div>
        </Section>

        <Section title="Exchange Rate Provider">
          <RateProviderSelector activeProvider={activeProvider} onSelect={key => providerMutation.mutate(key)} />
        </Section>
      </div>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={save} />
    </div>
  )
}

// ── Property editor ───────────────────────────────────────────────────────────

function PropertyCurrencyEditor({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Partial<OrgDesignDefaultsConfig>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const { data: designData, isLoading: designLoading } = useQuery<PropertyDesignAdminResponse>({
    queryKey: ['property-design-admin', propertyId],
    queryFn: () => apiClient.getPropertyDesignAdmin(propertyId),
    staleTime: Infinity,
  })

  const { data: orgSettings, isLoading: orgLoading } = useQuery({
    queryKey: ['admin-org'],
    queryFn: () => apiClient.getOrgSettings(),
  })

  const providerMutation = useMutation({
    mutationFn: (provider: string) => apiClient.setRateProvider(provider),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-org'] }),
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

  if (designLoading || orgLoading) return <Spinner />

  const topSet = new Set(TOP_CURRENCIES)
  const currencyOptions = [...TOP_CURRENCIES, ...ALL_CURRENCIES.filter(c => !topSet.has(c))]
    .map(code => ({ value: code, label: `${currencySymbol(code)}  ${code} · ${currencyName(code)}` }))
  const activeProvider = orgSettings?.rateProvider ?? 'frankfurter'

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-xl font-semibold text-[var(--color-text)]">Currency</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        Hotel overrides — inherit from chain or set a custom value for this hotel.
      </p>

      <div className="space-y-6">
        <Section title="Default Currency">
          <OverrideSelectRow label="Default currency" fieldKey="defaultCurrency" systemDefault={sysDefs.defaultCurrency ?? 'EUR'}
            options={currencyOptions}
            draft={draft} orgDefaults={orgDefaults}
            onSet={set as (key: keyof OrgDesignDefaultsConfig, val: string) => void}
            onReset={reset} />
        </Section>

        <Section title="Exchange Rate Provider">
          <RateProviderSelector activeProvider={activeProvider} onSelect={key => providerMutation.mutate(key)} />
        </Section>
      </div>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────

function RateProviderSelector({ activeProvider, onSelect }: { activeProvider: string; onSelect: (key: string) => void }) {
  return (
    <div className="space-y-3">
      {RATE_PROVIDERS.map(p => (
        <button key={p.key} onClick={() => onSelect(p.key)}
          className={['flex w-full items-start gap-4 rounded-xl border px-5 py-4 text-left transition-colors',
            activeProvider === p.key
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50',
          ].join(' ')}
        >
          <span className={['mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
            activeProvider === p.key ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]',
          ].join(' ')}>
            {activeProvider === p.key && <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--color-text)]">{p.name}</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{p.description}</p>
            <a href={p.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className="mt-1 inline-block text-xs text-[var(--color-primary)] hover:underline">
              {p.url}
            </a>
          </div>
          {activeProvider === p.key && (
            <span className="shrink-0 rounded-full bg-[var(--color-primary)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Active
            </span>
          )}
        </button>
      ))}
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
