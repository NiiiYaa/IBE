'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, PropertyDesignAdminResponse, TranslationRow, AutoTranslateProgressEvent, GlobalDesignAdminResponse, TranslationAIConfigResponse, TranslationAIConfigUpdate, AIProvider } from '@ibe/shared'
import { TRANSLATION_NAMESPACES, AI_PROVIDERS, AI_PROVIDER_LABELS, AI_PROVIDER_MODELS } from '@ibe/shared'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import { apiClient } from '@/lib/api-client'
import { localeName, localeFlag, localeEnglishName } from '@/lib/locales'
import { SaveBar, Section } from '../components'
import { OverrideSelectRow, OverrideLocalesRow, OverrideToggleRow } from '../override-helpers'

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

type DynamicTranslationRow = { id: number; text: string; value: string | null }

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

  // 'en' is always active — normalise on read so the rest of the logic is uniform
  const rawEnabledLocalesSys = (draft.enabledLocales as string[] | undefined) ?? []
  const enabledLocales = rawEnabledLocalesSys.includes('en') ? rawEnabledLocalesSys : ['en', ...rawEnabledLocalesSys]
  const defaultLocale = draft.defaultLocale ?? 'en'
  const localeAlphabetical = (draft.localeAlphabetical as boolean | null | undefined) ?? false

  // Available-languages pill list: 'en' first, then enabled others, then remaining
  const sortedLocales = useMemo(() => {
    const enabledNonEn = ALL_LOCALES.filter(c => c !== 'en' && enabledLocales.includes(c))
    const rest = ALL_LOCALES.filter(c => c !== 'en' && !enabledLocales.includes(c))
    return ['en', ...enabledNonEn, ...rest]
  }, [enabledLocales])

  const enabledNonEnLocales = useMemo(() => enabledLocales.filter(c => c !== 'en'), [enabledLocales])

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
            const active = enabledLocales.includes(code)
            return (
              <button key={code} type="button"
                onClick={() => {
                  if (code === 'en') return
                  // Always keep 'en' in the stored array
                  const current = enabledLocales
                  const next = current.includes(code) ? current.filter(l => l !== code) : [...current, code]
                  set('enabledLocales', next.includes('en') ? next : ['en', ...next])
                }}
                disabled={code === 'en'}
                className={['rounded-full border px-3 py-1 text-xs font-medium transition-all',
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                  code === 'en' ? 'cursor-default opacity-80' : '',
                ].join(' ')}
              >
                {localeFlag(code)} {localeEnglishName(code)}
                {code !== 'en' && <span className="opacity-60"> · {localeName(code)}</span>}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Default and Order">
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
            {enabledLocales.map(code => (
              <option key={code} value={code}>{localeFlag(code)}  {localeEnglishName(code)}</option>
            ))}
          </select>
        </div>

        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <input
            type="checkbox"
            checked={localeAlphabetical}
            onChange={e => set('localeAlphabetical', e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)] cursor-pointer"
          />
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Alphabetical order</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              When checked, languages are shown alphabetically in the guest selector. Uncheck to set a custom order.
            </p>
          </div>
        </label>

        {!localeAlphabetical && enabledLocales.length > 1 && (
          <LocaleOrderEditor
            locales={enabledLocales}
            onReorder={newOrder => set('enabledLocales', newOrder)}
          />
        )}
      </Section>

      {saveError && <p className="text-sm text-[var(--color-error)]">{saveError}</p>}
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />

      {enabledNonEnLocales.length > 0 && (
        <Section title="Translation Coverage">
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">Translation progress for all enabled non-English languages.</p>
          <TranslationStats
            enabledLocales={enabledLocales}
            translationStatus={translationStatus}
            translationTotal={translationTotal}
          />
        </Section>
      )}

      <TranslationAISection />
      <TranslationManager enabledLocales={enabledLocales} />
      <DynamicStringsManager enabledLocales={enabledLocales} orgId={null} />
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

  // 'en' is always included — it's the invariant fallback language.
  // Stored arrays may omit it (legacy), so normalise on read.
  const rawEnabledLocales = (draft.enabledLocales as string[] | undefined) ?? []
  // Use a system-pool that always includes 'en' so the 'en' filter below never strips it.
  const systemLocalesWithEn = systemLocales.includes('en') ? systemLocales : ['en', ...systemLocales]
  const filteredLocales = rawEnabledLocales.filter(c => systemLocalesWithEn.includes(c))
  const enabledLocales = filteredLocales.includes('en') ? filteredLocales : ['en', ...filteredLocales]
  const defaultLocale = enabledLocales.includes(draft.defaultLocale ?? 'en')
    ? (draft.defaultLocale ?? 'en')
    : 'en'
  const localeAlphabetical = (draft.localeAlphabetical as boolean | null | undefined) ?? false

  function toggleLocale(code: string) {
    if (code === 'en') return  // 'en' is always on
    const current = enabledLocales
    const next = current.includes(code) ? current.filter(l => l !== code) : [...current, code]
    // Guarantee 'en' is always present
    set('enabledLocales', next.includes('en') ? next : ['en', ...next])
  }

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
          {systemLocalesWithEn.map(code => {
            const active = enabledLocales.includes(code)
            return (
              <button key={code} type="button"
                onClick={() => toggleLocale(code)}
                disabled={code === 'en'}
                className={['rounded-full border px-3 py-1 text-xs font-medium transition-all',
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
                  code === 'en' ? 'cursor-default opacity-80' : '',
                ].join(' ')}
              >
                {localeFlag(code)} {localeEnglishName(code)}
                {code !== 'en' && <span className="opacity-60"> · {localeName(code)}</span>}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Default and Order">
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
            {enabledLocales.map(code => (
              <option key={code} value={code}>{localeFlag(code)}  {localeEnglishName(code)}</option>
            ))}
          </select>
        </div>

        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <input
            type="checkbox"
            checked={localeAlphabetical}
            onChange={e => set('localeAlphabetical', e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)] cursor-pointer"
          />
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Alphabetical order</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              When checked, languages are shown alphabetically in the guest selector. Uncheck to set a custom order.
            </p>
          </div>
        </label>

        {!localeAlphabetical && enabledLocales.length > 1 && (
          <LocaleOrderEditor
            locales={enabledLocales}
            onReorder={newOrder => set('enabledLocales', newOrder)}
          />
        )}
      </Section>

      {enabledLocales.length > 1 && (
        <Section title="Translation Coverage">
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">Translation progress for all enabled non-English languages.</p>
          <TranslationStats
            enabledLocales={enabledLocales}
            translationStatus={translationStatus}
            translationTotal={translationTotal}
          />
        </Section>
      )}

      {saveError && <p className="text-sm text-[var(--color-error)]">{saveError}</p>}
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
      <DynamicStringsManager enabledLocales={enabledLocales} orgId={orgId ?? null} />
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
  const [missingOnly, setMissingOnly] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translateCount, setTranslateCount] = useState(0)
  const [translateError, setTranslateError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const localeOptions = enabledLocales.filter(l => l !== 'en')

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

  const allLanguagesMissing = useMemo(() => {
    if (!translationStatus || !translationTotal) return null
    const total = translationTotal.total
    return localeOptions.reduce((sum, code) => {
      const row = translationStatus.find(s => s.locale === code)
      const translated = row ? row.namespaces.reduce((s, n) => s + n.translated, 0) : 0
      return sum + (total - translated)
    }, 0)
  }, [translationStatus, translationTotal, localeOptions])

  // Fetch all namespaces in parallel for selected locale
  const { data: allRowsByNs, isLoading: rowsLoading, isError: rowsError, refetch: refetchRows } = useQuery({
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
        if (missingOnly) filtered = filtered.filter(r => !r.value)
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
  }, [allRowsByNs, nsFilter, searchText, missingOnly])

  async function streamTranslate(locale: string, limit?: number) {
    const res = await fetch('/api/v1/admin/design/translations/auto-translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ locale, ...(limit ? { limit } : {}) }),
      signal: abortRef.current!.signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(err.error ?? `Server error ${res.status}`)
    }
    if (!res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let finished = false
    while (!finished) {
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
            void qc.invalidateQueries({ queryKey: ['translation-status'] })
            finished = true
          }
        } catch { /* ignore parse errors */ }
      }
    }
    reader.cancel().catch(() => {/* ignore */})
  }

  async function runTranslate(limit?: number) {
    if (!selectedLocale || translating) return
    setTranslating(true)
    setTranslateCount(0)
    setTranslateError(null)
    abortRef.current = new AbortController()
    try {
      await streamTranslate(selectedLocale, limit)
      void refetchRows()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setTranslateError((err as Error).message ?? 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }

  async function runTranslateAll() {
    if (!window.confirm('Are you sure? This will AI-translate all missing strings for every language.')) return
    if (translating) return
    setTranslating(true)
    setTranslateCount(0)
    setTranslateError(null)
    abortRef.current = new AbortController()
    try {
      for (const locale of localeOptions) {
        try {
          await streamTranslate(locale)
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err
          // log per-language failures but continue with remaining languages
          console.warn(`Translation failed for ${locale}:`, err)
        }
      }
      void refetchRows()
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
        <div className="flex items-center gap-2">
          <button
            disabled={translating || allLanguagesMissing === 0}
            onClick={runTranslateAll}
            className={`${btnCls} text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]`}
          >
            {translating ? <>{spinner} {progressLabel}</> : `All Languages [${allLanguagesMissing ?? '…'}]`}
          </button>
          <select
            value={selectedLocale ?? ''}
            onChange={e => { setSelectedLocale(e.target.value || null); setSearchText(''); setNsFilter('') }}
            className={ctrlCls}
          >
            <option value="">Select language…</option>
            {localeOptions.map(code => (
              <option key={code} value={code}>{localeFlag(code)}  {localeEnglishName(code)}</option>
            ))}
          </select>
        </div>
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
              <button
                onClick={() => setMissingOnly(v => !v)}
                className={[btnCls, missingOnly
                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                  : 'text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                ].join(' ')}
              >
                Missing
              </button>
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
          ) : rowsError ? (
            <p className="py-10 text-center text-sm text-[var(--color-error)]">
              Failed to load translations. Check your connection and try refreshing.
            </p>
          ) : filteredGroups.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
              {missingOnly && !searchText && !nsFilter ? 'All strings are translated for this language.' : searchText || nsFilter || missingOnly ? 'No strings match your filters.' : 'All strings are translated.'}
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
  const setBool = set as (key: keyof OrgDesignDefaultsConfig, val: boolean) => void
  // Pool: org-enabled langs filtered against system pool → system pool → full list
  const sysPool: string[] = (sysDefs.enabledLocales as string[] | null | undefined) ?? ALL_LOCALES
  const orgPool = (orgDefaults.enabledLocales as string[] | null | undefined)
  const langPool: string[] = orgPool ? orgPool.filter(c => sysPool.includes(c)) : sysPool
  const localeOptions = langPool.map(code => ({ value: code, label: `${localeFlag(code)}  ${localeEnglishName(code)}` }))
  const localeItems = langPool.map(code => ({ code, label: `${localeFlag(code)} ${localeEnglishName(code)}` }))
  const enabledLocalesOverride = draft.enabledLocales as string[] | null | undefined
  const rawActiveLocales = enabledLocalesOverride ?? (orgDefaults.enabledLocales ?? ['en'])
  const activeLocales = rawActiveLocales.includes('en') ? rawActiveLocales : ['en', ...rawActiveLocales]

  // localeAlphabetical: inherit from chain if not overridden
  const alphaOverride = draft.localeAlphabetical as boolean | null | undefined
  const alphaEffective = alphaOverride ?? (orgDefaults.localeAlphabetical ?? (sysDefs.localeAlphabetical ?? false))

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
              if (code === 'en') return
              const current = (draft.enabledLocales as string[] | null | undefined) ?? (orgDefaults.enabledLocales ?? ['en'])
              const next = current.includes(code) ? current.filter((l: string) => l !== code) : [...current, code]
              set('enabledLocales', next.includes('en') ? next : ['en', ...next])
            }}
            onReset={reset}
            onOverride={() => {
              const base = orgDefaults.enabledLocales ?? ['en']
              set('enabledLocales', base.includes('en') ? base : ['en', ...base])
            }}
          />
        </Section>

        <Section title="Default and Order">
          <OverrideSelectRow label="Default language" fieldKey="defaultLocale"
            {...(sysDefs.defaultLocale ? { systemDefault: sysDefs.defaultLocale } : {})}
            options={localeOptions}
            draft={draft} orgDefaults={orgDefaults} onSet={setStr} onReset={reset} />

          <div className="mt-4">
            <OverrideToggleRow
              label="Alphabetical order"
              description="When on, languages are shown alphabetically in the guest selector. Turn off to set a custom order."
              fieldKey="localeAlphabetical"
              draft={draft}
              orgDefaults={orgDefaults}
              systemDefault={sysDefs.localeAlphabetical ?? false}
              onSet={setBool}
              onReset={reset}
            />
          </div>

          {!alphaEffective && enabledLocalesOverride != null && activeLocales.length > 1 && (
            <LocaleOrderEditor
              locales={activeLocales}
              onReorder={newOrder => set('enabledLocales', newOrder)}
            />
          )}
          {!alphaEffective && enabledLocalesOverride == null && activeLocales.length > 1 && (
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
              To reorder languages for this hotel, override the languages list above first.
            </p>
          )}
        </Section>

        {activeLocales.filter(c => c !== 'en').length > 0 && (
          <Section title="Translation Coverage">
            <p className="mb-3 text-xs text-[var(--color-text-muted)]">Translation progress for all enabled non-English languages.</p>
            <TranslationStats
              enabledLocales={activeLocales}
              translationStatus={translationStatus}
              translationTotal={translationTotal}
            />
          </Section>
        )}
      </div>
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function TranslationStats({
  enabledLocales,
  translationStatus,
  translationTotal,
}: {
  enabledLocales: string[]
  translationStatus: Array<{ locale: string; namespaces: Array<{ translated: number }> }> | undefined
  translationTotal: { total: number } | undefined
}) {
  const { orgId, propertyId } = useAdminProperty()
  const nonEn = useMemo(() => enabledLocales.filter(c => c !== 'en'), [enabledLocales])

  // Dynamic (incentive item) counts per locale
  const { data: dynamicCounts } = useQuery({
    queryKey: ['dynamic-coverage', orgId ?? 'system', propertyId ?? 'none', nonEn.join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        nonEn.map(locale =>
          apiClient.listIncentiveItemTranslations(locale, orgId ?? null, propertyId ?? undefined)
            .then(rows => ({ locale, translated: rows.filter(r => r.value).length, total: rows.length }))
            .catch(() => ({ locale, translated: 0, total: 0 }))
        )
      )
      return results
    },
    staleTime: 60_000,
    enabled: nonEn.length > 0,
  })

  const dynamicTotal = dynamicCounts ? Math.max(0, ...dynamicCounts.map(d => d.total)) : 0
  const dynamicMap = useMemo(
    () => Object.fromEntries((dynamicCounts ?? []).map(d => [d.locale, d.translated])),
    [dynamicCounts]
  )

  const staticTotal = translationTotal?.total ?? 0
  const total = staticTotal + dynamicTotal

  const stats = useMemo(
    () => nonEn.map(code => {
      const row = translationStatus?.find(s => s.locale === code)
      const staticTranslated = row ? row.namespaces.reduce((s, n) => s + n.translated, 0) : 0
      const dynamicTranslated = dynamicMap[code] ?? 0
      const translated = staticTranslated + dynamicTranslated
      const missing = total - translated
      const pct = total > 0 ? Math.round((translated / total) * 100) : 0
      return { code, translated, missing, pct }
    }).sort((a, b) => a.pct - b.pct),
    [nonEn, translationStatus, dynamicMap, total]
  )

  if (nonEn.length === 0) return null

  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
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
          ) : stats.map(({ code, translated, missing, pct }) => (
            <tr key={code} className="border-b border-[var(--color-border)] last:border-0">
              <td className="px-4 py-2.5 text-sm text-[var(--color-text)]">
                {localeFlag(code)} {localeEnglishName(code)}
                {code !== 'en' && <span className="ml-1 text-xs text-[var(--color-text-muted)]">· {localeName(code)}</span>}
              </td>
              <td className="px-4 py-2.5 text-sm text-right tabular-nums text-[var(--color-text)]">{translated}</td>
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
  )
}

function LocaleOrderEditor({
  locales,
  onReorder,
}: {
  locales: string[]
  onReorder: (newOrder: string[]) => void
}) {
  if (locales.length <= 1) return null

  function move(idx: number, dir: -1 | 1) {
    const next = [...locales]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    const tmp = next[idx]!; next[idx] = next[target]!; next[target] = tmp
    onReorder(next)
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-[var(--color-text-muted)]">
        Drag order — use arrows to set the order guests see in the language selector.
      </p>
      <div className="flex flex-col gap-1">
        {locales.map((code, idx) => (
          <div key={code} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <span className="flex-1 text-sm text-[var(--color-text)]">
              {localeFlag(code)} {localeEnglishName(code)}
              {code !== 'en' && <span className="ml-1 text-xs text-[var(--color-text-muted)]">· {localeName(code)}</span>}
            </span>
            <div className="flex flex-col gap-0">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => move(idx, -1)}
                className="rounded px-1.5 py-0.5 text-xs leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"
              >↑</button>
              <button
                type="button"
                disabled={idx === locales.length - 1}
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

// ── Dynamic Strings ───────────────────────────────────────────────────────────

const DYNAMIC_TYPES = [
  { key: 'incentive_items' as const, label: 'Incentives' },
  // Future types: { key: 'package_names', label: 'Package Names' }, etc.
] as const

type DynamicTypeKey = typeof DYNAMIC_TYPES[number]['key']

function DynamicStringsManager({
  enabledLocales,
  orgId,
}: {
  enabledLocales: string[]
  orgId: number | null
}) {
  const qc = useQueryClient()
  const [selectedType, setSelectedType] = useState<DynamicTypeKey>('incentive_items')
  const [selectedLocale, setSelectedLocale] = useState<string | null>(null)
  const [sourcePropertyId, setSourcePropertyId] = useState<number | undefined>(undefined)
  const [missingOnly, setMissingOnly] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [translating, setTranslating] = useState(false)
  const [translateCount, setTranslateCount] = useState(0)
  const [translateError, setTranslateError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const localeOptions = enabledLocales.filter(l => l !== 'en')

  // Fetch properties for source picker (only relevant when scoped to an org)
  const { data: propList } = useQuery({
    queryKey: ['properties-for-dynamic', orgId],
    queryFn: () => apiClient.listProperties(),
    staleTime: 300_000,
    enabled: orgId !== null,
  })
  const properties = propList?.properties ?? []

  // Source options: chain-level items, then each hotel
  const sourceOptions = useMemo(() => {
    const opts: { label: string; propertyId?: number }[] = [
      { label: orgId === null ? 'System items' : 'Chain items' },
      ...properties.map(p => ({ label: p.name ?? `Hotel ${p.propertyId}`, propertyId: p.propertyId })),
    ]
    return opts
  }, [orgId, properties])

  const sourceKey = sourcePropertyId ?? 'chain'

  const rowsKey = useMemo(
    () => ['incentive-item-translations', selectedType, selectedLocale, orgId ?? 'system', sourceKey],
    [selectedType, selectedLocale, orgId, sourceKey],
  )

  const { data: rows = [], isLoading: rowsLoading, refetch } = useQuery<DynamicTranslationRow[]>({
    queryKey: rowsKey,
    queryFn: () => apiClient.listIncentiveItemTranslations(selectedLocale!, orgId, sourcePropertyId),
    enabled: !!selectedLocale,
    staleTime: 30_000,
  })

  // Total missing across all locales for the current source
  const allMissingKey = useMemo(
    () => ['incentive-dynamic-all-missing', selectedType, orgId ?? 'system', sourceKey],
    [selectedType, orgId, sourceKey],
  )
  const { data: allLanguagesMissing } = useQuery({
    queryKey: allMissingKey,
    queryFn: async () => {
      const counts = await Promise.all(
        localeOptions.map(locale =>
          apiClient.listIncentiveItemTranslations(locale, orgId, sourcePropertyId)
            .then(r => r.filter(x => !x.value).length)
            .catch(() => 0)
        )
      )
      return counts.reduce((sum, n) => sum + n, 0)
    },
    staleTime: 60_000,
    enabled: localeOptions.length > 0,
  })

  const filteredRows = useMemo(() => {
    let r = rows
    if (missingOnly) r = r.filter(x => !x.value)
    if (searchText) {
      const q = searchText.toLowerCase()
      r = r.filter(x => x.text.toLowerCase().includes(q) || (x.value ?? '').toLowerCase().includes(q))
    }
    return r
  }, [rows, missingOnly, searchText])

  const missingCount = useMemo(() => rows.filter(r => !r.value).length, [rows])

  function invalidateAllMissing() {
    void qc.invalidateQueries({ queryKey: allMissingKey })
  }

  async function streamAutoTranslate(locale: string) {
    const params = new URLSearchParams()
    if (orgId != null) params.set('orgId', String(orgId))
    if (sourcePropertyId != null) params.set('propertyId', String(sourcePropertyId))
    const qs = params.toString() ? `?${params}` : ''

    const res = await fetch(`/api/v1/admin/incentives/translations/${locale}/auto-translate${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
      signal: abortRef.current!.signal,
    })
    if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`)
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
          if (event.type === 'done') void qc.invalidateQueries({ queryKey: ['incentive-item-translations'] })
        } catch { /* ignore */ }
      }
    }
    reader.cancel().catch(() => {})
  }

  async function runTranslate() {
    if (!selectedLocale || translating || missingCount === 0) return
    setTranslating(true); setTranslateCount(0); setTranslateError(null)
    abortRef.current = new AbortController()
    try {
      await streamAutoTranslate(selectedLocale)
      void refetch()
      invalidateAllMissing()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setTranslateError((err as Error).message)
    } finally { setTranslating(false) }
  }

  async function runTranslateAll() {
    if (!window.confirm('AI-translate all missing incentive item strings for every enabled language?')) return
    if (translating) return
    setTranslating(true); setTranslateCount(0); setTranslateError(null)
    abortRef.current = new AbortController()
    try {
      for (const locale of localeOptions) {
        try { await streamAutoTranslate(locale) }
        catch (err) {
          if ((err as Error).name === 'AbortError') throw err
          console.warn(`Dynamic translation failed for ${locale}:`, err)
        }
      }
      void refetch()
      invalidateAllMissing()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setTranslateError((err as Error).message)
    } finally { setTranslating(false) }
  }

  if (localeOptions.length === 0) return null

  const ctrlCls = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
  const btnCls = 'flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40'
  const progressLabel = translateCount > 0 ? `${translateCount} translated…` : 'Translating…'
  const spinner = <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
  const allMissingLabel = allLanguagesMissing == null ? '…' : String(allLanguagesMissing)

  return (
    <div className="border-t border-[var(--color-border)] pt-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text)]">Dynamic Strings</h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Translate incentive item text — custom strings defined in Marketing → Incentives.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={translating || allLanguagesMissing === 0}
            onClick={runTranslateAll}
            className={`${btnCls} text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]`}
          >
            {translating ? <>{spinner} {progressLabel}</> : `All Languages [${allMissingLabel}]`}
          </button>
          {/* Type / origin selector */}
          <select
            value={selectedType}
            onChange={e => {
              setSelectedType(e.target.value as DynamicTypeKey)
              setSourcePropertyId(undefined)
              setSelectedLocale(null)
              setSearchText('')
            }}
            className={ctrlCls}
          >
            {DYNAMIC_TYPES.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          {/* Source picker — visible when there are hotels to choose from */}
          {sourceOptions.length > 1 && (
            <select
              value={sourcePropertyId ?? ''}
              onChange={e => {
                setSourcePropertyId(e.target.value ? Number(e.target.value) : undefined)
                setSearchText('')
              }}
              className={ctrlCls}
            >
              {sourceOptions.map((opt, i) => (
                <option key={i} value={opt.propertyId ?? ''}>{opt.label}</option>
              ))}
            </select>
          )}
          <select
            value={selectedLocale ?? ''}
            onChange={e => { setSelectedLocale(e.target.value || null); setSearchText('') }}
            className={ctrlCls}
          >
            <option value="">Select language…</option>
            {localeOptions.map(code => (
              <option key={code} value={code}>{localeFlag(code)}  {localeEnglishName(code)}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedLocale && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              disabled={translating || missingCount === 0}
              onClick={runTranslate}
              className={`${btnCls} text-[var(--color-primary)] border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]`}
            >
              {translating ? <>{spinner} {progressLabel}</> : `AI Translate Missing (${missingCount})`}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <input
                type="search"
                placeholder="Search items…"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className={`${ctrlCls} w-44`}
              />
              <button
                onClick={() => setMissingOnly(v => !v)}
                className={[btnCls, missingOnly
                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                  : 'text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                ].join(' ')}
              >
                Missing
              </button>
            </div>
          </div>

          {translateError && (
            <p className="mb-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-4 py-2.5 text-sm text-[var(--color-error)]">
              {translateError}
            </p>
          )}

          {rowsLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
              {missingOnly ? 'All items are translated.' : 'No incentive items defined yet.'}
            </p>
          ) : (
            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="overflow-auto max-h-[460px]">
                <table className="w-full text-sm table-fixed">
                  <thead className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                    <tr>
                      <th className="w-[45%] px-4 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)]">Item (English)</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)]">
                        {localeFlag(selectedLocale)} {localeName(selectedLocale)}
                      </th>
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(row => (
                      <DynamicItemRow
                        key={row.id}
                        row={row}
                        locale={selectedLocale}
                        onSaved={() => { void refetch(); invalidateAllMissing() }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DynamicItemRow({
  row, locale, onSaved,
}: {
  row: DynamicTranslationRow
  locale: string
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
    setSaving(true); setRowError(null)
    try {
      await apiClient.upsertIncentiveItemTranslation(locale, row.id, trimmed)
      savedRef.current = trimmed
      setJustSaved(true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setJustSaved(false), 1800)
      onSaved()
    } catch {
      setRowError('Save failed')
    } finally { setSaving(false) }
  }

  async function aiTranslate() {
    setAiRunning(true); setRowError(null)
    try {
      const { value: translated } = await apiClient.aiTranslateIncentiveItem(locale, row.id, row.text)
      setValue(translated)
      savedRef.current = translated
      setJustSaved(true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setJustSaved(false), 1800)
      onSaved()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'AI failed')
    } finally { setAiRunning(false) }
  }

  const isDirty = value.trim() !== savedRef.current
  const isEmpty = !savedRef.current
  const busy = saving || aiRunning

  return (
    <tr className={['border-b border-[var(--color-border)] last:border-0', isEmpty ? 'bg-amber-50/40' : ''].join(' ')}>
      <td className="px-4 py-2 text-xs text-[var(--color-text-muted)] align-middle">{row.text}</td>
      <td className="px-4 py-2 align-middle">
        <div>
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={() => save()}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            placeholder={row.text}
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
          {isDirty && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save()}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-40 transition-colors"
            >
              {saving ? '…' : 'Save'}
            </button>
          )}
          {justSaved && !isDirty && (
            <span className="text-[10px] font-semibold text-[var(--color-success)]">✓</span>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={aiTranslate}
            title="AI translate this item"
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

function Spinner() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-3">
      {[1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--color-border)]" />)}
    </div>
  )
}
