'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import {
  AI_PROVIDERS,
  AI_PROVIDER_LABELS,
  AI_PROVIDER_MODELS,
} from '@ibe/shared'
import type { AIProvider, AIConfigResponse, AIConfigUpdate, OrgAIConfigUpdate, PropertyAIConfigUpdate } from '@ibe/shared'

// ── System service disable toggle (super admin) / status pill (org admin) ────

function SystemServiceRow({
  disabled, isSuper, onToggle, saving,
}: { disabled: boolean; isSuper: boolean; onToggle: (v: boolean) => void; saving: boolean }) {
  if (isSuper) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">System AI service</p>
          <p className="text-xs text-[var(--color-text-muted)]">When disabled, this org uses no AI unless it has its own API key.</p>
        </div>
        <button type="button" role="switch" aria-checked={!disabled} disabled={saving}
          onClick={() => onToggle(!disabled)}
          className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40',
            !disabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
          <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            !disabled ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
        </button>
      </div>
    )
  }
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className={['rounded-full px-2.5 py-0.5 text-xs font-semibold',
        disabled ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' : 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
      ].join(' ')}>
        System AI: {disabled ? 'Disabled by admin' : 'Active'}
      </span>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionCard({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="mb-5 flex items-center gap-2">
        <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
        {badge && (
          <span className="rounded bg-purple-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-purple-700">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function InheritedBadge({ config, from }: { config: AIConfigResponse | null; from?: string }) {
  if (!config?.provider) return (
    <p className="text-sm text-[var(--color-text-muted)]">No {from ?? 'inherited'} config set yet.</p>
  )
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
      <span className="font-medium text-[var(--color-text)]">{AI_PROVIDER_LABELS[config.provider as AIProvider]}</span>
      {' · '}{config.model}
      {config.apiKeySet && <span className="ml-2 font-mono text-xs">{config.apiKeyMasked}</span>}
      {config.enabled
        ? <span className="ml-2 text-[var(--color-success)] text-xs font-medium">● Enabled</span>
        : <span className="ml-2 text-[var(--color-error)] text-xs font-medium">● Disabled</span>}
    </div>
  )
}

function AIConfigForm({
  initialProvider,
  initialModel,
  initialWhatsappModel,
  initialWhatsappProvider,
  initialSystemPrompt,
  initialEnabled,
  isSuper,
  onSave,
  onTest,
  onTestStored,
  onTestWhatsapp,
  onTestWhatsappStored,
  saving,
  testing,
  testingStored,
  testResult,
  testStoredResult,
  testingWhatsapp,
  testWhatsappResult,
  testingWhatsappStored,
  testWhatsappStoredResult,
  apiKeySet,
  apiKeyMasked,
  whatsappApiKeySet,
  whatsappApiKeyMasked,
}: {
  initialProvider: AIProvider | null
  initialModel: string | null
  initialWhatsappModel: string | null
  initialWhatsappProvider: AIProvider | null
  initialSystemPrompt: string | null
  initialEnabled: boolean
  isSuper: boolean
  onSave: (data: AIConfigUpdate) => void
  onTest: (provider: AIProvider, apiKey: string, model: string) => void
  onTestStored?: () => void
  onTestWhatsapp?: (provider: AIProvider, apiKey: string, model: string) => void
  onTestWhatsappStored?: () => void
  saving: boolean
  testing: boolean
  testingStored?: boolean
  testResult: { ok: boolean; error?: string } | null
  testStoredResult?: { ok: boolean; error?: string } | null
  testingWhatsapp?: boolean
  testWhatsappResult?: { ok: boolean; error?: string } | null
  testingWhatsappStored?: boolean
  testWhatsappStoredResult?: { ok: boolean; error?: string } | null
  apiKeySet?: boolean
  apiKeyMasked?: string | null
  whatsappApiKeySet?: boolean
  whatsappApiKeyMasked?: string | null
}) {
  const [provider, setProvider] = useState<AIProvider>(initialProvider ?? 'openai')
  const [model, setModel] = useState(initialModel ?? AI_PROVIDER_MODELS[initialProvider ?? 'openai'][0])
  const [whatsappProvider, setWhatsappProvider] = useState<AIProvider | ''>(initialWhatsappProvider ?? '')
  const [whatsappApiKey, setWhatsappApiKey] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt ?? '')
  const [enabled, setEnabled] = useState(initialEnabled)

  const effectiveWAProvider = (initialWhatsappProvider || initialProvider || 'openai') as AIProvider
  const waModels = AI_PROVIDER_MODELS[effectiveWAProvider] ?? []
  const validInitialWAModel = waModels.includes(initialWhatsappModel ?? '') ? initialWhatsappModel! : waModels[0]
  const [whatsappModel, setWhatsappModel] = useState(validInitialWAModel)

  const isFake = provider === 'fake'
  const visibleProviders = isSuper ? AI_PROVIDERS : AI_PROVIDERS.filter(p => p !== 'fake')
  const models = AI_PROVIDER_MODELS[provider]
  const currentWAModels = AI_PROVIDER_MODELS[(whatsappProvider || provider) as AIProvider] ?? []

  function handleProviderChange(p: AIProvider) {
    setProvider(p)
    setModel(AI_PROVIDER_MODELS[p][0])
    if (!whatsappProvider) setWhatsappModel(AI_PROVIDER_MODELS[p][0])
  }

  function handleWhatsappProviderChange(p: AIProvider | '') {
    setWhatsappProvider(p)
    setWhatsappApiKey('')
    const effectiveP = (p || provider) as AIProvider
    setWhatsappModel(AI_PROVIDER_MODELS[effectiveP]?.[0] ?? '')
  }

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4">
        <p className="text-sm font-medium text-[var(--color-text)]">
          AI Provider
          {isFake && <span className="ml-2 font-normal text-amber-700 text-xs">(Fake — no real API calls)</span>}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Provider</label>
            <select value={provider} onChange={e => handleProviderChange(e.target.value as AIProvider)} className={inputCls}>
              {visibleProviders.map(p => (
                <option key={p} value={p}>{AI_PROVIDER_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Model</label>
            <select value={model} onChange={e => setModel(e.target.value)} className={inputCls}>
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {!isFake && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">API Key</label>
            {apiKeySet && apiKeyMasked && (
              <div className="mb-1.5 text-xs text-[var(--color-text-muted)]">
                <span className="font-mono tracking-wider">{apiKeyMasked}</span>
                <br />
                <span className="text-[var(--color-text-muted)]/60">· to replace, paste a new key below</span>
              </div>
            )}
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={apiKeySet ? 'Paste new key to replace…' : 'Paste API key…'}
              className={inputCls}
              autoComplete="off"
            />
          </div>
        )}

        {!isFake && (
          <div className="flex items-center gap-3">
            {apiKey ? (
              <button
                type="button"
                disabled={testing}
                onClick={() => onTest(provider, apiKey, model ?? '')}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-40"
              >
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
            ) : (apiKeySet && onTestStored) ? (
              <button
                type="button"
                disabled={testingStored}
                onClick={() => onTestStored()}
                className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
              >
                {testingStored ? 'Testing…' : 'Test stored key - main'}
              </button>
            ) : null}
            {apiKey && testResult && !testing && (
              <span className={`text-xs ${testResult.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
              </span>
            )}
            {!apiKey && testStoredResult && !testingStored && (
              <span className={`text-xs ${testStoredResult.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {testStoredResult.ok ? '✓ Connection successful' : `✗ ${testStoredResult.error}`}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4">
        <p className="text-sm font-medium text-[var(--color-text)]">WhatsApp AI Override <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Provider</label>
            <select
              value={whatsappProvider}
              onChange={e => handleWhatsappProviderChange(e.target.value as AIProvider | '')}
              className={inputCls}
            >
              <option value="">— Same as above —</option>
              {(isSuper ? AI_PROVIDERS : AI_PROVIDERS.filter(p => p !== 'fake')).map(p => (
                <option key={p} value={p}>{AI_PROVIDER_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Model</label>
            <select value={whatsappModel} onChange={e => setWhatsappModel(e.target.value)} className={inputCls}>
              {currentWAModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {whatsappProvider && whatsappProvider !== provider && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">WhatsApp API Key</label>
            {whatsappApiKeySet && whatsappApiKeyMasked && (
              <div className="mb-1.5 text-xs text-[var(--color-text-muted)]">
                <span className="font-mono tracking-wider">{whatsappApiKeyMasked}</span>
                <br />
                <span className="text-[var(--color-text-muted)]/60">· to replace, paste a new key below</span>
              </div>
            )}
            <input
              type="password"
              value={whatsappApiKey}
              onChange={e => setWhatsappApiKey(e.target.value)}
              placeholder={whatsappApiKeySet ? 'Paste new key to replace…' : 'Paste API key…'}
              className={inputCls}
              autoComplete="off"
            />
          </div>
        )}

        {whatsappProvider && whatsappProvider === provider && (
          <p className="text-xs text-[var(--color-text-muted)]">Uses your {AI_PROVIDER_LABELS[provider]} API key above.</p>
        )}

        {whatsappProvider && whatsappProvider !== 'fake' && (
          <div className="flex items-center gap-3">
            {(whatsappApiKey || (whatsappProvider === provider && apiKey)) ? (
              <button
                type="button"
                disabled={testingWhatsapp}
                onClick={() => onTestWhatsapp?.(
                  whatsappProvider as AIProvider,
                  whatsappProvider === provider ? apiKey : whatsappApiKey,
                  whatsappModel ?? '',
                )}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-40"
              >
                {testingWhatsapp ? 'Testing…' : 'Test Connection'}
              </button>
            ) : (whatsappApiKeySet && onTestWhatsappStored) ? (
              <button
                type="button"
                disabled={testingWhatsappStored}
                onClick={() => onTestWhatsappStored()}
                className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
              >
                {testingWhatsappStored ? 'Testing…' : 'Test stored key for WhatsApp'}
              </button>
            ) : null}
            {(whatsappApiKey || (whatsappProvider === provider && apiKey)) && testWhatsappResult && !testingWhatsapp && (
              <span className={`text-xs ${testWhatsappResult.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {testWhatsappResult.ok ? '✓ Connection successful' : `✗ ${testWhatsappResult.error}`}
              </span>
            )}
            {!(whatsappApiKey || (whatsappProvider === provider && apiKey)) && testWhatsappStoredResult && !testingWhatsappStored && (
              <span className={`text-xs ${testWhatsappStoredResult.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {testWhatsappStoredResult.ok ? '✓ Connection successful' : `✗ ${testWhatsappStoredResult.error}`}
              </span>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">System Prompt</label>
        <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">Optional. Customise the AI assistant's persona and tone for this hotel.</p>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          rows={3}
          placeholder="You are a helpful hotel concierge assistant for…"
          className={`${inputCls} resize-y`}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(v => !v)}
          className={[
            'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
            enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
          ].join(' ')}
        >
          <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200', enabled ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
        </button>
        <div>
          <span className="text-sm text-[var(--color-text)]">{enabled ? 'Enabled' : 'Disabled'}</span>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            When disabled, any chain or property that inherits from this level will have no AI service available unless they configure their own provider.
          </p>
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave({
            provider,
            ...(model ? { model } : {}),
            whatsappProvider: whatsappProvider || null,
            ...(whatsappApiKey ? { whatsappApiKey } : {}),
            whatsappModel: (whatsappModel ?? '').trim() || null,
            ...(apiKey ? { apiKey } : {}),
            systemPrompt: systemPrompt || null,
            enabled,
          })}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── System config section (super admin only) ──────────────────────────────────

function SystemConfigSection() {
  const qc = useQueryClient()
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testStoredResult, setTestStoredResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testWhatsappResult, setTestWhatsappResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testWhatsappStoredResult, setTestWhatsappStoredResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['ai-config-system'],
    queryFn: () => apiClient.getSystemAIConfig(),
  })

  const saveMutation = useMutation({
    mutationFn: (d: AIConfigUpdate) => apiClient.updateSystemAIConfig(d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ai-config-system'] }) },
  })

  const testMutation = useMutation({
    mutationFn: ({ provider, apiKey, model }: { provider: AIProvider; apiKey: string; model: string }) =>
      apiClient.testAIConnection(provider, apiKey, model),
    onSuccess: (result) => setTestResult(result),
  })

  const testWhatsappMutation = useMutation({
    mutationFn: ({ provider, apiKey, model }: { provider: AIProvider; apiKey: string; model: string }) =>
      apiClient.testAIConnection(provider, apiKey, model),
    onSuccess: (result) => setTestWhatsappResult(result),
  })

  const testStoredMutation = useMutation({
    mutationFn: () => apiClient.testStoredAIConnection('system'),
    onSuccess: (result) => setTestStoredResult(result),
  })

  const testStoredWhatsappMutation = useMutation({
    mutationFn: () => apiClient.testStoredAIConnection('system', { whatsapp: true }),
    onSuccess: (result) => setTestWhatsappStoredResult(result),
  })

  if (isLoading) return <SectionCard title="System Default" badge="Super"><p className="text-sm text-[var(--color-text-muted)]">Loading…</p></SectionCard>

  return (
    <SectionCard title="System Default" badge="Super">
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        Used as fallback for any chain or hotel that has not configured their own AI provider.
      </p>
      <AIConfigForm
        initialProvider={(data?.provider as AIProvider) ?? null}
        initialModel={data?.model ?? null}
        initialWhatsappModel={data?.whatsappModel ?? null}
        initialWhatsappProvider={(data?.whatsappProvider as AIProvider) ?? null}
        initialSystemPrompt={data?.systemPrompt ?? null}
        initialEnabled={data?.enabled ?? false}
        isSuper={true}
        onSave={d => saveMutation.mutate(d)}
        onTest={(provider, apiKey, model) => testMutation.mutate({ provider, apiKey, model })}
        onTestStored={() => testStoredMutation.mutate()}
        onTestWhatsapp={(provider, apiKey, model) => testWhatsappMutation.mutate({ provider, apiKey, model })}
        onTestWhatsappStored={() => testStoredWhatsappMutation.mutate()}
        saving={saveMutation.isPending}
        testing={testMutation.isPending}
        testingStored={testStoredMutation.isPending}
        testResult={testResult}
        testStoredResult={testStoredResult}
        testingWhatsapp={testWhatsappMutation.isPending}
        testWhatsappResult={testWhatsappMutation.isSuccess || testWhatsappMutation.isPending ? testWhatsappResult : null}
        testingWhatsappStored={testStoredWhatsappMutation.isPending}
        testWhatsappStoredResult={testStoredWhatsappMutation.isSuccess || testStoredWhatsappMutation.isPending ? testWhatsappStoredResult : null}
        apiKeySet={data?.apiKeySet ?? false}
        apiKeyMasked={data?.apiKeyMasked ?? null}
        whatsappApiKeySet={data?.whatsappApiKeySet ?? false}
        whatsappApiKeyMasked={data?.whatsappApiKeyMasked ?? null}
      />
      {saveMutation.isError && <p className="mt-2 text-sm text-[var(--color-error)]">Save failed. Please try again.</p>}
    </SectionCard>
  )
}

// ── Org config section ────────────────────────────────────────────────────────

function OrgConfigSection({ orgId, isSuper }: { orgId?: number; isSuper: boolean }) {
  const qc = useQueryClient()
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testStoredResult, setTestStoredResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testWhatsappResult, setTestWhatsappResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testWhatsappStoredResult, setTestWhatsappStoredResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['ai-config-org', orgId],
    queryFn: () => apiClient.getOrgAIConfig(orgId),
  })

  const saveMutation = useMutation({
    mutationFn: (d: OrgAIConfigUpdate & { orgId?: number }) => apiClient.updateOrgAIConfig(d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ai-config-org', orgId] }) },
  })

  const testMutation = useMutation({
    mutationFn: ({ provider, apiKey, model }: { provider: AIProvider; apiKey: string; model: string }) =>
      apiClient.testAIConnection(provider, apiKey, model),
    onSuccess: (result) => setTestResult(result),
  })

  const testWhatsappMutation = useMutation({
    mutationFn: ({ provider, apiKey, model }: { provider: AIProvider; apiKey: string; model: string }) =>
      apiClient.testAIConnection(provider, apiKey, model),
    onSuccess: (result) => setTestWhatsappResult(result),
  })

  const testStoredMutation = useMutation({
    mutationFn: () => apiClient.testStoredAIConnection('org', orgId ? { orgId } : undefined),
    onSuccess: (result) => setTestStoredResult(result),
  })

  const testStoredWhatsappMutation = useMutation({
    mutationFn: () => apiClient.testStoredAIConnection('org', { ...(orgId ? { orgId } : {}), whatsapp: true }),
    onSuccess: (result) => setTestWhatsappStoredResult(result),
  })

  const useInherited = data?.useInherited ?? true
  const systemServiceDisabled = data?.systemServiceDisabled ?? false

  const disableMutation = useMutation({
    mutationFn: (v: boolean) => apiClient.updateOrgAIConfig({ systemServiceDisabled: v, ...(orgId && { orgId }) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ai-config-org', orgId] }) },
  })

  if (isLoading) return <SectionCard title="Chain / Organisation"><p className="text-sm text-[var(--color-text-muted)]">Loading…</p></SectionCard>

  return (
    <SectionCard title="Chain / Organisation">
      <div className="mb-4 grid grid-cols-2 gap-3">
        {/* System AI service */}
        <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <div className="min-w-0 pr-3">
            <p className="text-sm font-medium text-[var(--color-text)]">System AI service</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">When disabled, this org uses no AI unless it has its own API key.</p>
          </div>
          {isSuper ? (
            <button type="button" role="switch" aria-checked={!systemServiceDisabled} disabled={disableMutation.isPending}
              onClick={() => disableMutation.mutate(!systemServiceDisabled)}
              className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40',
                !systemServiceDisabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
              <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                !systemServiceDisabled ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
            </button>
          ) : (
            <span className={['rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0',
              systemServiceDisabled ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' : 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
            ].join(' ')}>
              {systemServiceDisabled ? 'Off' : 'On'}
            </span>
          )}
        </div>

        {/* Use system default */}
        <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <div className="min-w-0 pr-3">
            <p className="text-sm font-medium text-[var(--color-text)]">Use system default</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Inherit the system-level AI provider instead of a custom configuration for this chain.</p>
          </div>
          <button type="button" role="switch" aria-checked={useInherited}
            onClick={() => saveMutation.mutate({ useInherited: !useInherited, ...(orgId && { orgId }) })}
            className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
              useInherited ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}
          >
            <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
              useInherited ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
          </button>
        </div>
      </div>

      {useInherited ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Currently inheriting from System</p>
          <InheritedBadge config={data?.inherited ?? null} from="system" />
        </div>
      ) : (
        <>
          <AIConfigForm
            initialProvider={(data?.provider as AIProvider) ?? null}
            initialModel={data?.model ?? null}
            initialWhatsappModel={data?.whatsappModel ?? null}
            initialWhatsappProvider={(data?.whatsappProvider as AIProvider) ?? null}
            initialSystemPrompt={data?.systemPrompt ?? null}
            initialEnabled={data?.enabled ?? false}
            isSuper={isSuper}
            onSave={d => saveMutation.mutate({ ...d, useInherited: false, ...(orgId && { orgId }) })}
            onTest={(provider, apiKey, model) => testMutation.mutate({ provider, apiKey, model })}
            onTestStored={() => testStoredMutation.mutate()}
            onTestWhatsapp={(provider, apiKey, model) => testWhatsappMutation.mutate({ provider, apiKey, model })}
            onTestWhatsappStored={() => testStoredWhatsappMutation.mutate()}
            saving={saveMutation.isPending}
            testing={testMutation.isPending}
            testingStored={testStoredMutation.isPending}
            testResult={testResult}
            testStoredResult={testStoredResult}
            testingWhatsapp={testWhatsappMutation.isPending}
            testWhatsappResult={testWhatsappMutation.isSuccess || testWhatsappMutation.isPending ? testWhatsappResult : null}
            testingWhatsappStored={testStoredWhatsappMutation.isPending}
            testWhatsappStoredResult={testStoredWhatsappMutation.isSuccess || testStoredWhatsappMutation.isPending ? testWhatsappStoredResult : null}
            apiKeySet={data?.apiKeySet ?? false}
            apiKeyMasked={data?.apiKeyMasked ?? null}
            whatsappApiKeySet={data?.whatsappApiKeySet ?? false}
            whatsappApiKeyMasked={data?.whatsappApiKeyMasked ?? null}
          />
        </>
      )}
      {saveMutation.isError && <p className="mt-2 text-sm text-[var(--color-error)]">Save failed. Please try again.</p>}
    </SectionCard>
  )
}

// ── Property config section ───────────────────────────────────────────────────

function PropertyConfigSection({ propertyId, isSuper }: { propertyId: number; isSuper: boolean }) {
  const qc = useQueryClient()
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testStoredResult, setTestStoredResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testWhatsappResult, setTestWhatsappResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testWhatsappStoredResult, setTestWhatsappStoredResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['ai-config-property', propertyId],
    queryFn: () => apiClient.getPropertyAIConfig(propertyId),
  })

  const saveMutation = useMutation({
    mutationFn: (d: PropertyAIConfigUpdate) => apiClient.updatePropertyAIConfig(propertyId, d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ai-config-property', propertyId] }) },
  })

  const testMutation = useMutation({
    mutationFn: ({ provider, apiKey, model }: { provider: AIProvider; apiKey: string; model: string }) =>
      apiClient.testAIConnection(provider, apiKey, model),
    onSuccess: (result) => setTestResult(result),
  })

  const testWhatsappMutation = useMutation({
    mutationFn: ({ provider, apiKey, model }: { provider: AIProvider; apiKey: string; model: string }) =>
      apiClient.testAIConnection(provider, apiKey, model),
    onSuccess: (result) => setTestWhatsappResult(result),
  })

  const testStoredMutation = useMutation({
    mutationFn: () => apiClient.testStoredAIConnection('property', { propertyId }),
    onSuccess: (result) => setTestStoredResult(result),
  })

  const testStoredWhatsappMutation = useMutation({
    mutationFn: () => apiClient.testStoredAIConnection('property', { propertyId, whatsapp: true }),
    onSuccess: (result) => setTestWhatsappStoredResult(result),
  })

  const useInherited = data?.useInherited ?? true
  const inheritedLabel = data?.inheritedFrom === 'org' ? 'Chain' : 'System'
  const systemServiceDisabled = data?.systemServiceDisabled ?? false

  const disableMutation = useMutation({
    mutationFn: (v: boolean) => apiClient.updatePropertyAIConfig(propertyId, { systemServiceDisabled: !v }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ai-config-property', propertyId] }) },
  })

  if (isLoading) return <SectionCard title="This Property"><p className="text-sm text-[var(--color-text-muted)]">Loading…</p></SectionCard>

  return (
    <SectionCard title="This Property">
      <SystemServiceRow disabled={systemServiceDisabled} isSuper={isSuper}
        onToggle={v => disableMutation.mutate(v)} saving={disableMutation.isPending} />
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={useInherited}
          onClick={() => saveMutation.mutate({ useInherited: !useInherited })}
          className={['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200', useInherited ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}
        >
          <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200', useInherited ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
        </button>
        <span className="text-sm text-[var(--color-text)]">Use {inheritedLabel.toLowerCase()} config</span>
      </div>

      {useInherited ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Currently inheriting from {inheritedLabel}</p>
          <InheritedBadge config={data?.inherited ?? null} from={inheritedLabel.toLowerCase()} />
        </div>
      ) : (
        <>
          <AIConfigForm
            initialProvider={(data?.provider as AIProvider) ?? null}
            initialModel={data?.model ?? null}
            initialWhatsappModel={data?.whatsappModel ?? null}
            initialWhatsappProvider={(data?.whatsappProvider as AIProvider) ?? null}
            initialSystemPrompt={data?.systemPrompt ?? null}
            initialEnabled={data?.enabled ?? false}
            isSuper={isSuper}
            onSave={d => saveMutation.mutate({ ...d, useInherited: false })}
            onTest={(provider, apiKey, model) => testMutation.mutate({ provider, apiKey, model })}
            onTestStored={() => testStoredMutation.mutate()}
            onTestWhatsapp={(provider, apiKey, model) => testWhatsappMutation.mutate({ provider, apiKey, model })}
            onTestWhatsappStored={() => testStoredWhatsappMutation.mutate()}
            saving={saveMutation.isPending}
            testing={testMutation.isPending}
            testingStored={testStoredMutation.isPending}
            testResult={testResult}
            testStoredResult={testStoredResult}
            testingWhatsapp={testWhatsappMutation.isPending}
            testWhatsappResult={testWhatsappMutation.isSuccess || testWhatsappMutation.isPending ? testWhatsappResult : null}
            testingWhatsappStored={testStoredWhatsappMutation.isPending}
            testWhatsappStoredResult={testStoredWhatsappMutation.isSuccess || testStoredWhatsappMutation.isPending ? testWhatsappStoredResult : null}
            apiKeySet={data?.apiKeySet ?? false}
            apiKeyMasked={data?.apiKeyMasked ?? null}
            whatsappApiKeySet={data?.whatsappApiKeySet ?? false}
            whatsappApiKeyMasked={data?.whatsappApiKeyMasked ?? null}
          />
        </>
      )}
      {saveMutation.isError && <p className="mt-2 text-sm text-[var(--color-error)]">Save failed. Please try again.</p>}
    </SectionCard>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AIConfigPage() {
  const { admin } = useAdminAuth()
  const { propertyId, orgId: selectedOrgId } = useAdminProperty()

  if (propertyId === undefined || !admin) return null

  const isSuper = admin.role === 'super'
  const effectiveOrgId = selectedOrgId ?? admin.organizationId ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">AI Assistant</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Configure the AI provider used for the conversational booking assistant. Settings inherit from System → Chain → Property.
        </p>
      </div>

      {isSuper && <SystemConfigSection />}
      {effectiveOrgId !== null && (
        <OrgConfigSection isSuper={isSuper} orgId={effectiveOrgId} />
      )}
      {propertyId !== null && <PropertyConfigSection propertyId={propertyId} isSuper={isSuper} />}
    </div>
  )
}
