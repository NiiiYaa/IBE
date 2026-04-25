'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import type { EventsConfigResponse, EventsConfigUpdate } from '@ibe/shared'


function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
        checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function EventsConfigForm({ data, onSave, saving, isSystem, isSuper, orgId, onToggleSystemService }: {
  data: EventsConfigResponse
  onSave: (update: EventsConfigUpdate) => void
  saving: boolean
  isSystem?: boolean
  isSuper?: boolean
  orgId?: number
  onToggleSystemService?: (disabled: boolean) => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(data.enabled)
  const [radiusKm, setRadiusKm] = useState(data.radiusKm)
  const [maxEvents, setMaxEvents] = useState(data.maxEvents)
  const [stripDefaultFolded, setStripDefaultFolded] = useState(data.stripDefaultFolded)
  const [stripAutoFoldSecs, setStripAutoFoldSecs] = useState(data.stripAutoFoldSecs)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    setEnabled(data.enabled)
    setRadiusKm(data.radiusKm)
    setMaxEvents(data.maxEvents)
    setStripDefaultFolded(data.stripDefaultFolded)
    setStripAutoFoldSecs(data.stripAutoFoldSecs)
    setTestResult(null)
  }, [data])

  const testMutation = useMutation({
    mutationFn: () => apiClient.testEventsConnection(isSuper ? orgId : undefined),
    onSuccess: r => setTestResult(r),
    onError: e => setTestResult({ ok: false, error: String(e) }),
  })

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'

  return (
    <div className="space-y-6">
      {/* System service status banner (org level) */}
      {!isSystem && onToggleSystemService !== undefined && (
        <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">System Events service</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {data.systemServiceDisabled
                ? 'Events service is disabled for this organisation by a super admin.'
                : !data.hasOwnConfig
                  ? 'Using system Ticketmaster key. Enter own key below to override.'
                  : 'This org uses its own Ticketmaster API key.'}
            </p>
          </div>
          {isSuper ? (
            <button type="button" role="switch" aria-checked={!data.systemServiceDisabled}
              onClick={() => onToggleSystemService(!data.systemServiceDisabled)}
              className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                !data.systemServiceDisabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
              <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                !data.systemServiceDisabled ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
            </button>
          ) : (
            <span className={['rounded-full px-2.5 py-0.5 text-xs font-semibold',
              data.systemServiceDisabled ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' : 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
            ].join(' ')}>
              {data.systemServiceDisabled ? 'Disabled by admin' : 'Active'}
            </span>
          )}
        </div>
      )}

      {/* API key */}
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Ticketmaster API Key</label>
        {data.apiKeySet && (
          <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">
            Current key: <span className="font-mono">{data.apiKeyMasked}</span> — leave blank to keep it.
          </p>
        )}
        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
          placeholder={data.apiKeySet ? 'Enter new key to replace…' : 'Paste Ticketmaster API key…'}
          className={inputCls} autoComplete="off" />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Get a free key at{' '}
          <span className="font-medium text-[var(--color-primary)]">developer.ticketmaster.com</span>
          {' '}— 5,000 requests/day on the free tier.
        </p>
      </div>

      {/* Search radius */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Search Radius <span className="font-normal normal-case opacity-60">km around the hotel</span>
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={50} step={1}
            value={radiusKm}
            onChange={e => setRadiusKm(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]"
          />
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
            {radiusKm} km
          </span>
        </div>
      </div>

      {/* Max events */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Max Events to Return
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={50} step={1}
            value={maxEvents}
            onChange={e => setMaxEvents(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]"
          />
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
            {maxEvents}
          </span>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center gap-3">
        <Toggle checked={enabled} onChange={setEnabled} />
        <span className="text-sm text-[var(--color-text)]">{enabled ? 'Events feature enabled' : 'Events feature disabled'}</span>
      </div>

      {/* Strip display behaviour */}
      <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Strip display behaviour</p>
        <div className="flex items-center gap-3">
          <Toggle checked={stripDefaultFolded} onChange={setStripDefaultFolded} />
          <span className="text-sm text-[var(--color-text)]">Start collapsed by default</span>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Auto-collapse after <span className="font-normal normal-case opacity-60">seconds (0 = never)</span>
          </label>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={120} step={1}
              value={stripAutoFoldSecs}
              onChange={e => setStripAutoFoldSecs(Number(e.target.value))}
              className="flex-1 accent-[var(--color-primary)]"
            />
            <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
              {stripAutoFoldSecs === 0 ? 'Never' : `${stripAutoFoldSecs}s`}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="button" disabled={saving} onClick={() => onSave({ enabled, radiusKm, maxEvents, stripDefaultFolded, stripAutoFoldSecs, ...(apiKey ? { apiKey } : {}) })}
          className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" disabled={testMutation.isPending} onClick={() => testMutation.mutate()}
          className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40">
          {testMutation.isPending ? 'Testing…' : 'Test Connection'}
        </button>
        {testResult && (
          <p className={testResult.ok ? 'text-sm text-[var(--color-success)]' : 'text-sm text-[var(--color-error)]'}>
            {testResult.ok ? '✓ Connection successful' : '✗ ' + testResult.error}
          </p>
        )}
      </div>
    </div>
  )
}

function SystemEventsSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['events-config-system'],
    queryFn: () => apiClient.getSystemEventsConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (update: EventsConfigUpdate) => apiClient.updateSystemEventsConfig(update),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['events-config-system'] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <p className="mb-5 text-sm text-[var(--color-text-muted)]">
        System-level Ticketmaster API key used as fallback for all organisations that have not configured their own key.
      </p>
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
      {data && (
        <EventsConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending} isSystem isSuper />
      )}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

export default function EventsConfigPage() {
  const { admin } = useAdminAuth()
  const { orgId: contextOrgId } = useAdminProperty()
  const qc = useQueryClient()
  const isSuper = admin?.role === 'super'
  const isSystemLevel = isSuper && contextOrgId === null
  const orgId = isSuper ? (contextOrgId ?? undefined) : (admin?.organizationId ?? undefined)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['events-config', orgId],
    queryFn: () => apiClient.getEventsConfig(orgId),
    enabled: !!admin && !isSystemLevel && orgId !== undefined,
  })

  const saveMutation = useMutation({
    mutationFn: (update: EventsConfigUpdate) => apiClient.updateEventsConfig(update, orgId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['events-config', orgId] }) },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Events</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Configure the events service powered by Ticketmaster. Once an API key is set, the AI agent can answer
          guest questions about concerts, sports, theatre, and other events near the hotel.
        </p>
      </div>

      {isSystemLevel ? (
        <SystemEventsSection />
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
          {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
          {data && (
            <EventsConfigForm
              data={data}
              onSave={u => saveMutation.mutate(u)}
              saving={saveMutation.isPending}
              isSuper={isSuper}
              {...(orgId !== undefined ? { orgId } : {})}
              onToggleSystemService={disabled => saveMutation.mutate({ systemServiceDisabled: disabled })}
            />
          )}
          {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
          {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
        </div>
      )}
    </div>
  )
}
