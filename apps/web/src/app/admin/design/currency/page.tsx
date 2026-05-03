'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, PropertyDesignAdminResponse, GlobalDesignAdminResponse } from '@ibe/shared'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import { apiClient } from '@/lib/api-client'
import { ALL_CURRENCIES, TOP_CURRENCIES, currencyName, currencySymbol } from '@/lib/currencies'
import { SaveBar, Section } from '../components'
import { OverrideSelectRow, OverrideLocalesRow } from '../override-helpers'

const TOP_SET = new Set(TOP_CURRENCIES)
// Full sorted list: top currencies first, then the rest alphabetically
const ORDERED_CURRENCIES = [...TOP_CURRENCIES, ...ALL_CURRENCIES.filter(c => !TOP_SET.has(c))]

function currencyLabel(code: string) {
  return `${currencySymbol(code)}  ${code} · ${currencyName(code)}`
}

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
  const { admin } = useAdminAuth()
  const isSuper = admin?.role === 'super'

  if (propertyId === null) return <GlobalCurrencyEditor isSuper={isSuper} />
  return <PropertyCurrencyEditor propertyId={propertyId ?? 0} />
}

function GlobalCurrencyEditor({ isSuper }: { isSuper: boolean }) {
  const { orgId: ctxOrgId } = useAdminProperty()
  const isSystemLevel = isSuper && !ctxOrgId
  if (isSystemLevel) return <SystemCurrencyEditor />
  return <OrgCurrencyEditor isSuper={isSuper} orgId={ctxOrgId} />
}

// ── System-level editor (super admin, no org selected) ────────────────────────

function SystemCurrencyEditor() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Partial<OrgDesignDefaultsConfig>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const initialized = useRef(false)

  const { data, isLoading } = useQuery<OrgDesignDefaultsConfig>({
    queryKey: ['system-design-defaults'],
    queryFn: () => apiClient.getSystemDesignDefaults(),
    staleTime: 0,
  })

  const { data: orgSettings } = useQuery({
    queryKey: ['admin-org'],
    queryFn: () => apiClient.getOrgSettings(),
  })

  const providerMutation = useMutation({
    mutationFn: (provider: string) => apiClient.setRateProvider(provider),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-org'] }),
  })

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true
      setDraft(data)
      setIsDirty(false)
    }
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: Partial<OrgDesignDefaultsConfig>) => apiClient.updateSystemDesignDefaults(d),
    onSuccess: (fresh) => {
      qc.setQueryData(['system-design-defaults'], fresh)
      initialized.current = false
      setIsDirty(false)
      setSaveError(null)
    },
    onError: (err: unknown) => setSaveError(err instanceof Error ? err.message : 'Save failed'),
  })

  function set<K extends keyof OrgDesignDefaultsConfig>(key: K, value: OrgDesignDefaultsConfig[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  if (isLoading) return <Spinner />

  const enabledCurrencies: string[] = (draft.enabledCurrencies as string[] | undefined) ?? []
  // Active currencies float to top, then the rest in default order
  const sortedCurrencies = [
    ...ORDERED_CURRENCIES.filter(c => enabledCurrencies.includes(c)),
    ...ORDERED_CURRENCIES.filter(c => !enabledCurrencies.includes(c)),
  ]

  function toggleCurrency(code: string) {
    const current = enabledCurrencies
    set('enabledCurrencies', current.includes(code) ? current.filter(c => c !== code) : [...current, code])
  }

  const defaultCurrency = (draft.defaultCurrency as string | undefined) ?? 'USD'
  const activeProvider = orgSettings?.rateProvider ?? 'frankfurter'

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Currency</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          System defaults — apply to all chains and hotels unless overridden.
        </p>
      </div>

      <div className="space-y-6">
        <Section title="Enabled Currencies">
          <div className="flex flex-wrap gap-2">
            {sortedCurrencies.map(code => {
              const active = enabledCurrencies.includes(code)
              return (
                <button key={code} type="button" onClick={() => toggleCurrency(code)}
                  className={['rounded-full border px-3 py-1 text-xs font-medium transition-all',
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {currencySymbol(code)} {code}
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="Default and Order">
          <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Default currency</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Shown to guests on their first visit.
              </p>
            </div>
            <select
              value={defaultCurrency}
              onChange={e => set('defaultCurrency', e.target.value)}
              className="ml-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
            >
              {(enabledCurrencies.length > 0 ? enabledCurrencies : ORDERED_CURRENCIES).map(code => (
                <option key={code} value={code}>{currencyLabel(code)}</option>
              ))}
            </select>
          </div>

          {enabledCurrencies.length > 1 && (
            <CurrencyOrderEditor
              currencies={enabledCurrencies}
              onReorder={newOrder => set('enabledCurrencies', newOrder)}
            />
          )}
        </Section>

        <Section title="Exchange Rate Provider">
          <RateProviderSelector activeProvider={activeProvider} onSelect={key => providerMutation.mutate(key)} />
        </Section>
      </div>

      {saveError && <p className="mt-4 text-sm text-[var(--color-error)]">{saveError}</p>}
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}

// ── Org-level editor (chain admin or super admin scoped to an org) ─────────────

function OrgCurrencyEditor({ isSuper, orgId }: { isSuper: boolean; orgId: number | null }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Partial<OrgDesignDefaultsConfig>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const initialized = useRef(false)

  const superOrgId = isSuper ? (orgId ?? undefined) : undefined
  const qKey = ['global-design-defaults', superOrgId ?? null] as const

  const { data, isLoading } = useQuery<GlobalDesignAdminResponse>({
    queryKey: qKey,
    queryFn: () => apiClient.getGlobalDesignDefaults(superOrgId),
    staleTime: 0,
  })

  const { data: orgSettings } = useQuery({
    queryKey: ['admin-org'],
    queryFn: () => apiClient.getOrgSettings(),
  })

  const providerMutation = useMutation({
    mutationFn: (provider: string) => apiClient.setRateProvider(provider),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-org'] }),
  })

  useEffect(() => {
    initialized.current = false
    setDraft({})
    setIsDirty(false)
    setSaveError(null)
  }, [superOrgId])

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true
      setDraft(data.overrides)
      setIsDirty(false)
    }
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: Partial<OrgDesignDefaultsConfig>) => apiClient.updateGlobalDesignDefaults(d, superOrgId),
    onSuccess: (fresh) => {
      qc.setQueryData(qKey, fresh)
      initialized.current = false
      setIsDirty(false)
      setSaveError(null)
    },
    onError: (err: unknown) => setSaveError(err instanceof Error ? err.message : 'Save failed'),
  })

  function set<K extends keyof OrgDesignDefaultsConfig>(key: K, value: OrgDesignDefaultsConfig[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  if (isLoading) return <Spinner />

  const enabledCurrencies: string[] = (draft.enabledCurrencies as string[] | undefined) ?? []
  const sortedCurrencies = [
    ...ORDERED_CURRENCIES.filter(c => enabledCurrencies.includes(c)),
    ...ORDERED_CURRENCIES.filter(c => !enabledCurrencies.includes(c)),
  ]

  function toggleCurrency(code: string) {
    const current = enabledCurrencies
    set('enabledCurrencies', current.includes(code) ? current.filter(c => c !== code) : [...current, code])
  }

  const sysDefs = data?.systemDefaults ?? ({} as OrgDesignDefaultsConfig)
  const defaultCurrency = (draft.defaultCurrency as string | undefined) ?? (sysDefs.defaultCurrency ?? 'USD')
  const activeProvider = orgSettings?.rateProvider ?? 'frankfurter'

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Currency</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Chain defaults — apply to all hotels unless overridden at the hotel level.
        </p>
      </div>

      <div className="space-y-6">
        <Section title="Enabled Currencies">
          <div className="flex flex-wrap gap-2">
            {sortedCurrencies.map(code => {
              const active = enabledCurrencies.includes(code)
              return (
                <button key={code} type="button" onClick={() => toggleCurrency(code)}
                  className={['rounded-full border px-3 py-1 text-xs font-medium transition-all',
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {currencySymbol(code)} {code}
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="Default and Order">
          <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Default currency</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Shown to guests on their first visit.
              </p>
            </div>
            <select
              value={defaultCurrency}
              onChange={e => set('defaultCurrency', e.target.value)}
              className="ml-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
            >
              {(enabledCurrencies.length > 0 ? enabledCurrencies : ORDERED_CURRENCIES).map(code => (
                <option key={code} value={code}>{currencyLabel(code)}</option>
              ))}
            </select>
          </div>

          {enabledCurrencies.length > 1 && (
            <CurrencyOrderEditor
              currencies={enabledCurrencies}
              onReorder={newOrder => set('enabledCurrencies', newOrder)}
            />
          )}
        </Section>

        <Section title="Exchange Rate Provider">
          <RateProviderSelector activeProvider={activeProvider} onSelect={key => providerMutation.mutate(key)} />
        </Section>
      </div>

      {saveError && <p className="mt-4 text-sm text-[var(--color-error)]">{saveError}</p>}
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}

// ── Property editor ───────────────────────────────────────────────────────────

function PropertyCurrencyEditor({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Partial<OrgDesignDefaultsConfig>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const { data: designData, isLoading } = useQuery<PropertyDesignAdminResponse>({
    queryKey: ['property-design-admin', propertyId],
    queryFn: () => apiClient.getPropertyDesignAdmin(propertyId),
    staleTime: Infinity,
  })

  const { data: orgSettings } = useQuery({
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

  if (isLoading) return <Spinner />

  const setStr = set as (key: keyof OrgDesignDefaultsConfig, val: string) => void

  // Full list, no restriction from chain — active ones float to top
  const enabledCurrenciesOverride = draft.enabledCurrencies as string[] | null | undefined
  const activeCurrencies: string[] = enabledCurrenciesOverride ?? (orgDefaults.enabledCurrencies ?? []) as string[]
  const currencyOptions = (activeCurrencies.length > 0 ? activeCurrencies : ORDERED_CURRENCIES).map(code => ({ value: code, label: currencyLabel(code) }))
  const currencyItems = [
    ...ORDERED_CURRENCIES.filter(c => activeCurrencies.includes(c)),
    ...ORDERED_CURRENCIES.filter(c => !activeCurrencies.includes(c)),
  ].map(code => ({ code, label: `${currencySymbol(code)} ${code}` }))

  const activeProvider = orgSettings?.rateProvider ?? 'frankfurter'

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-xl font-semibold text-[var(--color-text)]">Currency</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        Hotel overrides — inherit from chain or set a custom value for this hotel.
      </p>

      <div className="space-y-6">
        <Section title="Enabled Currencies">
          <OverrideLocalesRow
            label="Currencies shown to guests"
            fieldKey="enabledCurrencies"
            items={currencyItems}
            activeItems={activeCurrencies}
            draft={draft}
            orgDefaults={orgDefaults}
            onToggle={code => {
              const current = (draft.enabledCurrencies as string[] | null | undefined) ?? (orgDefaults.enabledCurrencies ?? []) as string[]
              set('enabledCurrencies', current.includes(code) ? current.filter((c: string) => c !== code) : [...current, code])
            }}
            onReset={reset}
            onOverride={() => set('enabledCurrencies', (orgDefaults.enabledCurrencies ?? []) as OrgDesignDefaultsConfig['enabledCurrencies'])}
          />
        </Section>

        <Section title="Default and Order">
          <OverrideSelectRow
            label="Default currency"
            fieldKey="defaultCurrency"
            systemDefault={sysDefs.defaultCurrency ?? 'USD'}
            options={currencyOptions}
            draft={draft}
            orgDefaults={orgDefaults}
            onSet={setStr}
            onReset={reset}
          />

          {enabledCurrenciesOverride != null && activeCurrencies.length > 1 && (
            <CurrencyOrderEditor
              currencies={activeCurrencies}
              onReorder={newOrder => set('enabledCurrencies', newOrder)}
            />
          )}
          {enabledCurrenciesOverride == null && activeCurrencies.length > 1 && (
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
              To reorder currencies for this hotel, override the currencies list above first.
            </p>
          )}
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

function CurrencyOrderEditor({
  currencies,
  onReorder,
}: {
  currencies: string[]
  onReorder: (newOrder: string[]) => void
}) {
  if (currencies.length <= 1) return null

  function move(idx: number, dir: -1 | 1) {
    const next = [...currencies]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    const tmp = next[idx]!; next[idx] = next[target]!; next[target] = tmp
    onReorder(next)
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-[var(--color-text-muted)]">
        Use arrows to set the order guests see in the currency selector.
      </p>
      <div className="flex flex-col gap-1">
        {currencies.map((code, idx) => (
          <div key={code} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <span className="flex-1 text-sm text-[var(--color-text)]">{currencySymbol(code)} {code} · {currencyName(code)}</span>
            <div className="flex flex-col gap-0">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => move(idx, -1)}
                className="rounded px-1.5 py-0.5 text-xs leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"
              >↑</button>
              <button
                type="button"
                disabled={idx === currencies.length - 1}
                onClick={() => move(idx, 1)}
                className="rounded px-1.5 py-0.5 text-xs leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"
              >↓</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

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
