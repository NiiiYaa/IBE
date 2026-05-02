'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, PropertyDesignAdminResponse, TranslationRow, AutoTranslateProgressEvent, GlobalDesignAdminResponse, TranslationAIConfigResponse, TranslationAIConfigUpdate, AIProvider } from '@ibe/shared'
import { TRANSLATION_NAMESPACES, AI_PROVIDERS, AI_PROVIDER_LABELS, AI_PROVIDER_MODELS } from '@ibe/shared'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import { apiClient } from '@/lib/api-client'
import { localeName, localeFlag } from '@/lib/locales'
import { SaveBar, Section } from '../components'
import { OverrideSelectRow, OverrideLocalesRow } from '../override-helpers'

const ALL_LOCALES = [
  // European
  'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'ru', 'pl', 'sv',
  'da', 'nb', 'fi', 'cs', 'sk', 'hu', 'ro', 'el', 'uk', 'bg',
  'hr', 'sr', 'sl', 'lt', 'lv', 'et', 'mk', 'sq', 'bs', 'ca',
  'gl', 'eu', 'is', 'mt', 'cy', 'ga', 'af',
  // Middle East & Central Asia
  'ar', 'he', 'tr', 'fa', 'ur', 'az', 'ka', 'hy', 'kk', 'uz',
  // South Asia
  'hi', 'bn', 'ta', 'te', 'ml', 'gu', 'pa', 'mr', 'ne', 'si',
  // East & Southeast Asia
  'zh', 'ja', 'ko', 'th', 'vi', 'id', 'ms', 'tl', 'my', 'km', 'lo', 'mn',
  // Africa
  'sw', 'am', 'yo', 'zu',
]

const NS_LABELS: Record<string, string> = {
  common: 'Common',
  search: 'Search',
  properties: 'Properties',
  rooms: 'Rooms',
  booking: 'Booking Form',
  confirmation: 'Confirmation',
  account: 'Account',
  groups: 'Groups',
  crossSell: 'Cross-sell',
}

export default function LanguagePage() {
  const { propertyId } = useAdminProperty()
  const { admin } = useAdminAuth()
  const isSuper = admin?.role === 'super'

  if (propertyId === null) return <GlobalLanguageEditor isSuper={isSuper} />
  return <PropertyLanguageEditor propertyId={propertyId ?? 0} />
}

// ── Global editor ─────────────────────────────────────────────────────────────

function GlobalLanguageEditor({ isSuper }: { isSuper: boolean }) {
  const { orgId: ctxOrgId } = useAdminProperty()
  // System level = super admin with no org selected
  const isSystemLevel = isSuper && !ctxOrgId

  if (isSystemLevel) return <SystemLanguageEditor />
  return <OrgLanguageEditor isSuper={isSuper} orgId={ctxOrgId} />
}

// ── System-level editor (super admin, no org selected) ────────────────────────

function SystemLanguageEditor() {
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

  const { data: translationStatus } = useQuery({
    queryKey: ['translation-status'],
    queryFn: () => apiClient.getTranslationStatus(),
    staleTime: 60_000,
  })

  const { data: translationTotal } = useQuery({
    queryKey: ['translation-total'],
    queryFn: () => apiClient.getTranslationTotal(),
    staleTime: Infinity,
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

  const enabledLocales = (draft.enabledLocales as string[] | undefined) ?? []
  const defaultLocale = draft.defaultLocale ?? 'en'

  // English always first, then other enabled locales, then the rest
  const sortedLocales = useMemo(() => {
    const enabledNonEn = ALL_LOCALES.filter(c => c !== 'en' && enabledLocales.includes(c))
    const rest = ALL_LOCALES.filter(c => c !== 'en' && !enabledLocales.includes(c))
    return ['en', ...enabledNonEn, ...rest]
  }, [enabledLocales])

  // Per-language translation stats for the stats table
  const enabledNonEnLocales = useMemo(() => enabledLocales.filter(c => c !== 'en'), [enabledLocales])
  const total = translationTotal?.total ?? 0
  const langStats = useMemo(() => {
    return enabledNonEnLocales
      .map(code => {
        const statusRow = translationStatus?.find(s => s.locale === code)
        const translated = statusRow
          ? statusRow.namespaces.reduce((sum, n) => sum + n.translated, 0)
          : 0
        const missing = total - translated
        const pct = total > 0 ? Math.round((translated / total) * 100) : 0
        return { code, translated, missing, pct }
      })
      .sort((a, b) => a.pct - b.pct)
  }, [enabledNonEnLocales, translationStatus, total])

  if (isLoading) return <Spinner />

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Language</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          System-wide language pool — defines which languages organizations can enable for their guests.
        </p>
      </div>

      <Section title="Available Languages">
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Toggle languages to make them available across the platform.</p>
        <div className="flex flex-wrap gap-2">
          {sortedLocales.map(code => {
            const active = enabledLocales.includes(code) || code === 'en'
            return (
              <button key={code} type="button"
                onClick={() => {
                  if (code === 'en') return
                  const current = (draft.enabledLocales as string[] | undefined) ?? []
                  set('enabledLocales', current.includes(code) ? current.filter(l => l !== code) : [...current, code])
                }}
                disabled={code === 'en'}
                className={['rounded-full border px-3 py-1 text-xs font-medium transition-all',
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                  code === 'en' ? 'cursor-default opacity-80' : '',
                ].join(' ')}
              >
                {localeFlag(code)} {localeName(code)}
              </button>
            )
          })}
        </div>

        {/* Per-language translation stats */}
        {enabledNonEnLocales.length > 0 && (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)]">Language</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-[var(--color-text-muted)]">Translated</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-[var(--color-text-muted)]">Missing</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)] w-40">Progress</th>
                </tr>
              </thead>
              <tbody>
                {!translationTotal ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-3">
                      <div className="h-4 w-48 animate-pulse rounded bg-[var(--color-border)]" />
                    </td>
                  </tr>
                ) : langStats.map(({ code, translated, missing, pct }) => (
                  <tr key={code} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 text-sm text-[var(--color-text)]">
                      {localeFlag(code)} {localeName(code)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right tabular-nums text-[var(--color-text)]">
                      {translated}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right tabular-nums">
                      {missing > 0
                        ? <span className="text-amber-600">{missing}</span>
                        : <span className="text-[var(--color-success)]">0</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)]">
                          <div
                            className={['h-full rounded-full transition-all',
                              pct === 100 ? 'bg-[var(--color-success)]' : pct >= 50 ? 'bg-[var(--color-primary)]' : 'bg-amber-400',
                            ].join(' ')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-[var(--color-text-muted)] w-9 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Default Language">
        <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">System default language</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Fallback language shown to guests when no chain or hotel default is configured.
            </p>
          </div>
          <select
            value={defaultLocale}
            onChange={e => set('defaultLocale', e.target.value)}
            className="ml-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
          >
            {(enabledLocales.length > 0 ? enabledLocales : ALL_LOCALES).map(code => (
              <option key={code} value={code}>{localeFlag(code)}  {localeName(code)}</option>
            ))}
          </select>
        </div>
      </Section>

      {saveError && <p className="text-sm text-[var(--color-error)]">{saveError}</p>}
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />

      <TranslationAISection />
      <TranslationManager enabledLocales={enabledLocales} />
    </div>
  )
}

// ── Org-level editor (chain admin or super admin scoped to an org) ─────────────

function OrgLanguageEditor({ isSuper, orgId }: { isSuper: boolean; orgId: number | null }) {
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

  // Load system-level pool so chain admin only sees available languages
  const { data: systemData } = useQuery<OrgDesignDefaultsConfig>({
    queryKey: ['system-design-defaults'],
    queryFn: () => apiClient.getSystemDesignDefaults(),
    staleTime: 300_000,
  })
  const systemLocales = (systemData?.enabledLocales as string[] | undefined) ?? ALL_LOCALES

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

  // Filter org's saved selection against the system pool — removes stale languages
  const rawEnabledLocales = (draft.enabledLocales as string[] | undefined) ?? []
  const enabledLocales = rawEnabledLocales.filter(c => systemLocales.includes(c))
  const defaultLocale = enabledLocales.includes(draft.defaultLocale ?? 'en')
    ? (draft.defaultLocale ?? 'en')
    : enabledLocales[0] ?? 'en'

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Language</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Chain defaults — apply to all hotels unless overridden at the hotel level.
        </p>
      </div>

      <Section title="Enabled Languages">
        <div className="flex flex-wrap gap-2">
          {systemLocales.map(code => {
            const active = enabledLocales.includes(code)
            return (
              <button key={code} type="button"
                onClick={() => {
                  const current = rawEnabledLocales.filter(c => systemLocales.includes(c))
                  set('enabledLocales', current.includes(code) ? current.filter(l => l !== code) : [...current, code])
                }}
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
            {(enabledLocales.length > 0 ? enabledLocales : systemLocales).map(code => (
              <option key={code} value={code}>{localeFlag(code)}  {localeName(code)}</option>
            ))}
          </select>
        </div>
      </Section>

      {saveError && <p className="text-sm text-[var(--color-error)]">{saveError}</p>}
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}

// ── Translation AI config ─────────────────────────────────────────────────────

function TranslationAISection() {
  const qc = useQueryClient()
  const initialized = useRef(false)

  const [useSystemDefault, setUseSystemDefault] = useState(true)
  const [provider, setProvider] = useState<AIProvider>('openai')
  const [model, setModel] = useState(AI_PROVIDER_MODELS['openai'][0])
  const [apiKey, setApiKey] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data, isLoading } = useQuery<TranslationAIConfigResponse>({
    queryKey: ['translation-ai-config'],
    queryFn: () => apiClient.getTranslationAIConfig(),
    staleTime: 60_000,
  })

  // Fetch system AI directly — same query key the Config → AI page uses
  const { data: systemAI } = useQuery({
    queryKey: ['ai-config-system'],
    queryFn: () => apiClient.getSystemAIConfig(),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true
      setUseSystemDefault(data.useSystemDefault)
      if (data.provider) {
        setProvider(data.provider)
        setModel(data.model ?? AI_PROVIDER_MODELS[data.provider][0])
      }
      setIsDirty(false)
    }
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: TranslationAIConfigUpdate) => apiClient.updateTranslationAIConfig(d),
    onSuccess: (fresh) => {
      qc.setQueryData(['translation-ai-config'], fresh)
      setApiKey('')
      setSaveError(null)
      setIsDirty(false)
    },
    onError: (err: unknown) => setSaveError(err instanceof Error ? err.message : 'Save failed'),
  })

  function handleProviderChange(p: AIProvider) {
    setProvider(p)
    setModel(AI_PROVIDER_MODELS[p][0])
    setIsDirty(true)
  }

  function handleToggle() {
    setUseSystemDefault(v => !v)
    setIsDirty(true)
  }

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'

  return (
    <Section title="Translation AI">
      <p className="mb-4 text-xs text-[var(--color-text-muted)]">
        Choose which AI provider to use for auto-translating UI strings.
      </p>

      {isLoading ? (
        <div className="h-8 w-48 animate-pulse rounded bg-[var(--color-border)]" />
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={useSystemDefault}
              onClick={handleToggle}
              className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                useSystemDefault ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}
            >
              <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                useSystemDefault ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
            </button>
            <span className="text-sm text-[var(--color-text)]">Use system default AI</span>
          </div>

          {useSystemDefault ? (
            systemAI?.provider ? (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                <span className="font-medium text-[var(--color-text)]">{AI_PROVIDER_LABELS[systemAI.provider]}</span>
                <span> · {systemAI.model}</span>
                <span className="ml-2 text-xs opacity-60">inherited from System AI</span>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">
                No system AI configured yet — set one in <strong>Config → AI</strong> first.
              </p>
            )
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">Provider</label>
                  <select value={provider} onChange={e => handleProviderChange(e.target.value as AIProvider)} className={inputCls}>
                    {AI_PROVIDERS.filter(p => p !== 'fake').map(p => (
                      <option key={p} value={p}>{AI_PROVIDER_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">Model</label>
                  <select value={model} onChange={e => { setModel(e.target.value); setIsDirty(true) }} className={inputCls}>
                    {AI_PROVIDER_MODELS[provider].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">API Key</label>
                {data?.apiKeySet && !apiKey && (
                  <p className="mb-1 text-xs text-[var(--color-text-muted)]">
                    Current key: <span className="font-mono">{data.apiKeyMasked}</span> — leave blank to keep.
                  </p>
                )}
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setIsDirty(true) }}
                  placeholder="Paste API key…"
                  autoComplete="off"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {saveError && <p className="mt-3 text-sm text-[var(--color-error)]">{saveError}</p>}
          <SaveBar
            isDirty={isDirty}
            isSaving={isPending}
            onSave={() => mutate({
              useSystemDefault,
              ...(useSystemDefault ? {} : { provider, model }),
              ...(apiKey ? { apiKey } : {}),
            })}
          />
        </>
      )}
    </Section>
  )
}

const SAMPLE_SIZE = 5

// ── Translation Manager ───────────────────────────────────────────────────────

function TranslationManager({ enabledLocales }: { enabledLocales: string[] }) {
  const qc = useQueryClient()
  const [selectedLocale, setSelectedLocale] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [nsFilter, setNsFilter] = useState('')
  const [translating, setTranslating] = useState(false)
  const [translateCount, setTranslateCount] = useState(0)
  const [translateError, setTranslateError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const localeOptions = enabledLocales.filter(l => l !== 'en')

  // Fetch all namespaces in parallel for selected locale
  const { data: allRowsByNs, isLoading: rowsLoading, refetch: refetchRows } = useQuery({
    queryKey: ['translation-rows-all', selectedLocale],
    queryFn: () => Promise.all(
      TRANSLATION_NAMESPACES.map(ns =>
        apiClient.getTranslationRows(selectedLocale!, ns).then(rows => ({ namespace: ns, rows }))
      )
    ),
    enabled: !!selectedLocale,
    staleTime: 30_000,
  })

  const totalMissing = useMemo(
    () => allRowsByNs?.reduce((sum, { rows }) => sum + rows.filter(r => !r.value).length, 0) ?? 0,
    [allRowsByNs]
  )

  const filteredGroups = useMemo(() => {
    if (!allRowsByNs) return []
    return allRowsByNs
      .map(({ namespace, rows }) => {
        let filtered = rows
        if (nsFilter && namespace !== nsFilter) return { namespace, rows: [] }
        if (searchText) {
          const q = searchText.toLowerCase()
          filtered = filtered.filter(r =>
            r.key.toLowerCase().includes(q) ||
            r.en.toLowerCase().includes(q) ||
            (r.value ?? '').toLowerCase().includes(q)
          )
        }
        return { namespace, rows: filtered }
      })
      .filter(g => g.rows.length > 0)
  }, [allRowsByNs, nsFilter, searchText])

  async function runTranslate(limit?: number) {
    if (!selectedLocale || translating) return
    setTranslating(true)
    setTranslateCount(0)
    setTranslateError(null)
    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/v1/admin/design/translations/auto-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locale: selectedLocale, ...(limit ? { limit } : {}) }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        setTranslateError(err.error ?? `Server error ${res.status}`)
        return
      }
      if (!res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as AutoTranslateProgressEvent
            if (event.type === 'progress') setTranslateCount(c => c + 1)
            if (event.type === 'error') setTranslateError(event.message)
            if (event.type === 'done') {
              void refetchRows()
              void qc.invalidateQueries({ queryKey: ['translation-status'] })
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setTranslateError((err as Error).message ?? 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }

  const ctrlCls = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
  const btnCls = 'flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40'

  const progressLabel = translateCount > 0 ? `${translateCount} translated…` : 'Translating…'
  const spinner = <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />

  return (
    <div className="border-t border-[var(--color-border)] pt-6">
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text)]">Translation Management</h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Review and edit UI string translations per language.
          </p>
        </div>
        <select
          value={selectedLocale ?? ''}
          onChange={e => { setSelectedLocale(e.target.value || null); setSearchText(''); setNsFilter('') }}
          className={ctrlCls}
        >
          <option value="">Select language…</option>
          {localeOptions.map(code => (
            <option key={code} value={code}>{localeFlag(code)}  {localeName(code)}</option>
          ))}
        </select>
      </div>

      {selectedLocale && (
        <>
          {/* Action bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              disabled={translating || totalMissing === 0}
              onClick={() => runTranslate(SAMPLE_SIZE)}
              className={`${btnCls} text-[var(--color-primary)] border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]`}
            >
              {translating ? <>{spinner} {progressLabel}</> : `Sample (${SAMPLE_SIZE})`}
            </button>
            <button
              disabled={translating || totalMissing === 0}
              onClick={() => runTranslate()}
              className={`${btnCls} text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]`}
            >
              {translating ? <>{spinner} {progressLabel}</> : `All (${totalMissing} remaining)`}
            </button>

            <div className="ml-auto flex items-center gap-2">
              <input
                type="search"
                placeholder="Search strings…"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className={`${ctrlCls} w-44`}
              />
              <select value={nsFilter} onChange={e => setNsFilter(e.target.value)} className={ctrlCls}>
                <option value="">All pages</option>
                {TRANSLATION_NAMESPACES.map(ns => (
                  <option key={ns} value={ns}>{NS_LABELS[ns] ?? ns}</option>
                ))}
              </select>
            </div>
          </div>

          {translateError && (
            <p className="mb-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-4 py-2.5 text-sm text-[var(--color-error)]">
              {translateError}
            </p>
          )}

          {/* Table */}
          {rowsLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
              {searchText || nsFilter ? 'No strings match your filters.' : 'All strings are translated.'}
            </p>
          ) : (
            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="overflow-auto max-h-[560px]">
                <table className="w-full text-sm table-fixed">
                  <thead className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                    <tr>
                      <th className="w-28 px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)]">Key</th>
                      <th className="w-[36%] px-4 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)]">English</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)]">
                        {localeFlag(selectedLocale)} {localeName(selectedLocale)}
                      </th>
                      <th className="w-16 px-2 py-2" />
                    </tr>
                  </thead>
                  {filteredGroups.map(({ namespace, rows }) => {
                    const missing = rows.filter(r => !r.value).length
                    return (
                      <tbody key={namespace}>
                        <tr className="border-t-2 border-[var(--color-border)] first:border-t-0">
                          <td colSpan={4} className="bg-[var(--color-background)] px-4 py-2 border-b border-[var(--color-border)]">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                                {NS_LABELS[namespace] ?? namespace}
                              </span>
                              {missing > 0 && (
                                <span className="rounded-full bg-amber-100 px-2 py-px text-[10px] font-semibold text-amber-700">
                                  {missing} missing
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {rows.map(row => (
                          <TranslationRow
                            key={`${namespace}.${row.key}`}
                            row={row}
                            locale={selectedLocale}
                            namespace={namespace}
                            onSaved={() => {
                              void refetchRows()
                              void qc.invalidateQueries({ queryKey: ['translation-status'] })
                            }}
                          />
                        ))}
                      </tbody>
                    )
                  })}
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TranslationRow({
  row, locale, namespace, onSaved,
}: {
  row: TranslationRow
  locale: string
  namespace: string
  onSaved: () => void
}) {
  const [value, setValue] = useState(row.value ?? '')
  const [saving, setSaving] = useState(false)
  const [aiRunning, setAiRunning] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const savedRef = useRef(row.value ?? '')
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setValue(row.value ?? ''); savedRef.current = row.value ?? '' }, [row.value])
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  async function save(val = value) {
    const trimmed = val.trim()
    if (trimmed === savedRef.current) return
    setSaving(true)
    setRowError(null)
    try {
      await apiClient.upsertTranslation(locale, namespace, row.key, trimmed)
      savedRef.current = trimmed
      setJustSaved(true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setJustSaved(false), 1800)
      onSaved()
    } catch {
      setRowError('Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function aiTranslate() {
    setAiRunning(true)
    setRowError(null)
    try {
      const { value: translated } = await apiClient.translateOneString(locale, namespace, row.key)
      setValue(translated)
      savedRef.current = translated
      setJustSaved(true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setJustSaved(false), 1800)
      onSaved()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'AI failed')
    } finally {
      setAiRunning(false)
    }
  }

  const isDirty = value.trim() !== savedRef.current
  const isEmpty = !savedRef.current
  const busy = saving || aiRunning

  return (
    <tr className={['border-b border-[var(--color-border)] last:border-0', isEmpty ? 'bg-amber-50/40' : ''].join(' ')}>
      <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-muted)] align-middle truncate">{row.key}</td>
      <td className="px-4 py-2 text-xs text-[var(--color-text-muted)] align-middle">{row.en}</td>
      <td className="px-4 py-2 align-middle">
        <div>
          <input
            type="text"
            value={value}
            onChange={e => { setValue(e.target.value); setJustSaved(false) }}
            onBlur={() => save()}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            placeholder={row.en}
            disabled={busy}
            className={[
              'w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 disabled:opacity-60',
              isDirty
                ? 'border-[var(--color-primary)] focus:ring-[var(--color-primary-light)]'
                : isEmpty
                  ? 'border-amber-300 bg-amber-50 focus:ring-amber-200'
                  : 'border-[var(--color-border)] focus:ring-[var(--color-primary-light)]',
            ].join(' ')}
          />
          {rowError && <p className="mt-0.5 text-[10px] text-[var(--color-error)]">{rowError}</p>}
        </div>
      </td>
      <td className="px-2 py-2 align-middle">
        <div className="flex items-center justify-end gap-1">
          {/* Save button — visible when dirty */}
          {isDirty && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save()}
              title="Save"
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40 transition-colors"
            >
              {saving ? '…' : 'Save'}
            </button>
          )}
          {/* Saved flash */}
          {justSaved && !isDirty && (
            <span className="text-[10px] font-semibold text-[var(--color-success)]">✓</span>
          )}
          {/* AI translate button */}
          <button
            type="button"
            disabled={busy}
            onClick={aiTranslate}
            title="AI translate this string"
            className="rounded px-1.5 py-0.5 text-[10px] font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40 transition-colors"
          >
            {aiRunning
              ? <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
              : 'AI'}
          </button>
        </div>
      </td>
    </tr>
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
  // Pool: org-enabled langs filtered against system pool → system pool → full list
  const sysPool: string[] = (sysDefs.enabledLocales as string[] | null | undefined) ?? ALL_LOCALES
  const orgPool = (orgDefaults.enabledLocales as string[] | null | undefined)
  const langPool: string[] = orgPool ? orgPool.filter(c => sysPool.includes(c)) : sysPool
  const localeOptions = langPool.map(code => ({ value: code, label: `${localeFlag(code)}  ${localeName(code)}` }))
  const localeItems = langPool.map(code => ({ code, label: `${localeFlag(code)} ${localeName(code)}` }))
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
              set('enabledLocales', current.includes(code) ? current.filter((l: string) => l !== code) : [...current, code])
            }}
            onReset={reset}
            onOverride={() => set('enabledLocales', orgDefaults.enabledLocales ?? ['en'])}
          />
        </Section>
        <Section title="Default Language">
          <OverrideSelectRow label="Default language" fieldKey="defaultLocale"
            {...(sysDefs.defaultLocale ? { systemDefault: sysDefs.defaultLocale } : {})}
            options={localeOptions}
            draft={draft} orgDefaults={orgDefaults} onSet={setStr} onReset={reset} />
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
