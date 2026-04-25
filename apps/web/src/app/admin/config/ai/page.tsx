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
  initialSystemPrompt,
  initialEnabled,
  isSuper,
  onSave,
  onTest,
  saving,
  testing,
  testResult,
}: {
  initialProvider: AIProvider | null
  initialModel: string | null
  initialSystemPrompt: string | null
  initialEnabled: boolean
  isSuper: boolean
  onSave: (data: AIConfigUpdate) => void
  onTest: (provider: AIProvider, apiKey: string, model: string) => void
  saving: boolean
  testing: boolean
  testResult: { ok: boolean; error?: string } | null
}) {
  const [provider, setProvider] = useState<AIProvider>(initialProvider ?? 'openai')
  const [model, setModel] = useState(initialModel ?? AI_PROVIDER_MODELS[initialProvider ?? 'openai'][0])
  const [apiKey, setApiKey] = useState('')
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt ?? '')
  const [enabled, setEnabled] = useState(initialEnabled)

  const isFake = provider === 'fake'
  const visibleProviders = isSuper ? AI_PROVIDERS : AI_PROVIDERS.filter(p => p !== 'fake')
  const models = AI_PROVIDER_MODELS[provider]

  function handleProviderChange(p: AIProvider) {
    setProvider(p)
    setModel(AI_PROVIDER_MODELS[p][0])
  }

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'

  return (
    <div className="space-y-4">
      {isFake && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Fake AI — no real API calls are made. For testing only.
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Provider</label>
          <select value={provider} onChange={e => handleProviderChange(e.target.value as AIProvider)} className={inputCls}>
            {visibleProviders.map(p => (
              <option key={p} value={p}>{AI_PROVIDER_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Model</label>
          <select value={model} onChange={e => setModel(e.target.value)} className={inputCls}>
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {!isFake && (
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">API Key</label>
        <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">Leave blank to keep the current key.</p>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="Paste new API key…"
          className={inputCls}
          autoComplete="off"
        />
      </div>
      )}

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
        <span className="text-sm text-[var(--color-text)]">{enabled ? 'Enabled' : 'Disabled'}</span>
      </div>

      {testResult && (
        <p className={`text-sm ${testResult.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
          {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        {!isFake && (
          <button
            type="button"
            disabled={testing || !apiKey}
            onClick={() => onTest(provider, apiKey, model ?? '')}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-background)] disabled:opacity-40"
          >
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave({ provider, ...(model ? { model } : {}), ...(apiKey ? { apiKey } : {}), systemPrompt: systemPrompt || null, enabled })}
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

  if (isLoading) return <SectionCard title="System Default" badge="Super"><p className="text-sm text-[var(--color-text-muted)]">Loading…</p></SectionCard>

  return (
    <SectionCard title="System Default" badge="Super">
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        Used as fallback for any chain or hotel that has not configured their own AI provider.
      </p>
      <AIConfigForm
        initialProvider={(data?.provider as AIProvider) ?? null}
        initialModel={data?.model ?? null}
        initialSystemPrompt={data?.systemPrompt ?? null}
        initialEnabled={data?.enabled ?? false}
        isSuper={true}
        onSave={d => saveMutation.mutate(d)}
        onTest={(provider, apiKey, model) => testMutation.mutate({ provider, apiKey, model })}
        saving={saveMutation.isPending}
        testing={testMutation.isPending}
        testResult={testResult}
      />
      {saveMutation.isError && <p className="mt-2 text-sm text-[var(--color-error)]">Save failed. Please try again.</p>}
    </SectionCard>
  )
}

// ── Org config section ────────────────────────────────────────────────────────

function OrgConfigSection({ orgId, isSuper }: { orgId?: number; isSuper: boolean }) {
  const qc = useQueryClient()
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

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

  const useInherited = data?.useInherited ?? true
  const systemServiceDisabled = data?.systemServiceDisabled ?? false

  const disableMutation = useMutation({
    mutationFn: (v: boolean) => apiClient.updateOrgAIConfig({ systemServiceDisabled: v, ...(orgId && { orgId }) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ai-config-org', orgId] }) },
  })

  if (isLoading) return <SectionCard title="Chain / Organisation"><p className="text-sm text-[var(--color-text-muted)]">Loading…</p></SectionCard>

  return (
    <SectionCard title="Chain / Organisation">
      <SystemServiceRow disabled={systemServiceDisabled} isSuper={isSuper}
        onToggle={v => disableMutation.mutate(!v)} saving={disableMutation.isPending} />
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={useInherited}
          onClick={() => saveMutation.mutate({ useInherited: !useInherited, ...(orgId && { orgId }) })}
          className={['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200', useInherited ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}
        >
          <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200', useInherited ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
        </button>
        <span className="text-sm text-[var(--color-text)]">Use system default</span>
      </div>

      {useInherited ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Currently inheriting from System</p>
          <InheritedBadge config={data?.inherited ?? null} from="system" />
        </div>
      ) : (
        <AIConfigForm
          initialProvider={(data?.provider as AIProvider) ?? null}
          initialModel={data?.model ?? null}
          initialSystemPrompt={data?.systemPrompt ?? null}
          initialEnabled={data?.enabled ?? false}
          isSuper={isSuper}
          onSave={d => saveMutation.mutate({ ...d, useInherited: false, ...(orgId && { orgId }) })}
          onTest={(provider, apiKey, model) => testMutation.mutate({ provider, apiKey, model })}
          saving={saveMutation.isPending}
          testing={testMutation.isPending}
          testResult={testResult}
        />
      )}
      {saveMutation.isError && <p className="mt-2 text-sm text-[var(--color-error)]">Save failed. Please try again.</p>}
    </SectionCard>
  )
}

// ── Property config section ───────────────────────────────────────────────────

function PropertyConfigSection({ propertyId, isSuper }: { propertyId: number; isSuper: boolean }) {
  const qc = useQueryClient()
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

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
        <AIConfigForm
          initialProvider={(data?.provider as AIProvider) ?? null}
          initialModel={data?.model ?? null}
          initialSystemPrompt={data?.systemPrompt ?? null}
          initialEnabled={data?.enabled ?? false}
          isSuper={isSuper}
          onSave={d => saveMutation.mutate({ ...d, useInherited: false })}
          onTest={(provider, apiKey, model) => testMutation.mutate({ provider, apiKey, model })}
          saving={saveMutation.isPending}
          testing={testMutation.isPending}
          testResult={testResult}
        />
      )}
      {saveMutation.isError && <p className="mt-2 text-sm text-[var(--color-error)]">Save failed. Please try again.</p>}
    </SectionCard>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AIConfigPage() {
  const { admin } = useAdminAuth()
  const { propertyId } = useAdminProperty()

  if (propertyId === undefined || !admin) return null

  const isSuper = admin.role === 'super'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">AI Assistant</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Configure the AI provider used for the conversational booking assistant. Settings inherit from System → Chain → Property.
        </p>
      </div>

      {isSuper && <SystemConfigSection />}
      <OrgConfigSection isSuper={isSuper} {...(admin.organizationId ? { orgId: admin.organizationId } : {})} />
      {propertyId !== null && <PropertyConfigSection propertyId={propertyId} isSuper={isSuper} />}
    </div>
  )
}
