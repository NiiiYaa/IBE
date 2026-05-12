'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { AmadeusConfigResponse, AmadeusConfigUpdate } from '@ibe/shared'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => !disabled && onChange(!checked)}
      className={['relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
        checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function AmadeusConfigForm({
  data,
  onSave,
  saving,
  isSystem,
  isSuper,
  orgId,
  propertyId,
  onToggleSystemService,
}: {
  data: AmadeusConfigResponse
  onSave: (u: AmadeusConfigUpdate) => void
  saving: boolean
  isSystem?: boolean
  isSuper?: boolean
  orgId?: number
  propertyId?: number
  onToggleSystemService?: (disabled: boolean) => void
}) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [tokenUrl, setTokenUrl] = useState(data.tokenUrl)
  const [activitiesUrl, setActivitiesUrl] = useState(data.activitiesUrl)
  const [enabled, setEnabled] = useState(data.enabled)
  const [enforceChildCreds, setEnforceChildCreds] = useState(data.enforceChildCreds)
  const [radiusKm, setRadiusKm] = useState(data.radiusKm)
  const [maxActivities, setMaxActivities] = useState(data.maxActivities)
  const [stripLabel, setStripLabel] = useState(data.stripLabel)
  const [stripMode, setStripMode] = useState<'merged' | 'separate'>(data.stripMode)
  const [stripDefaultFolded, setStripDefaultFolded] = useState(data.stripDefaultFolded)
  const [stripAutoFoldSecs, setStripAutoFoldSecs] = useState(data.stripAutoFoldSecs)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    setEnabled(data.enabled)
    setTokenUrl(data.tokenUrl)
    setActivitiesUrl(data.activitiesUrl)
    setEnforceChildCreds(data.enforceChildCreds)
    setRadiusKm(data.radiusKm)
    setMaxActivities(data.maxActivities)
    setStripLabel(data.stripLabel)
    setStripMode(data.stripMode)
    setStripDefaultFolded(data.stripDefaultFolded)
    setStripAutoFoldSecs(data.stripAutoFoldSecs)
    setTestResult(null)
  }, [data])

  const testMutation = useMutation({
    mutationFn: () => apiClient.testAmadeusConnection(isSuper ? orgId : undefined, isSuper ? propertyId : undefined),
    onSuccess: r => setTestResult(r),
    onError: e => setTestResult({ ok: false, error: String(e) }),
  })

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
  const credsLocked = data.credentialsLocked

  function buildUpdate(): AmadeusConfigUpdate {
    const u: AmadeusConfigUpdate = { enabled, stripLabel, stripMode }
    if (isSystem) { u.tokenUrl = tokenUrl; u.activitiesUrl = activitiesUrl }
    if (!isSystem) u.stripDefaultFolded = stripDefaultFolded
    if (!isSystem) u.stripAutoFoldSecs = stripAutoFoldSecs
    if (clientId) u.clientId = clientId
    if (clientSecret) u.clientSecret = clientSecret
    if (!propertyId) {
      u.radiusKm = radiusKm
      u.maxActivities = maxActivities
    } else {
      u.radiusKmOverride = radiusKm
      u.maxActivitiesOverride = maxActivities
    }
    if (isSuper && !isSystem) u.enforceChildCreds = enforceChildCreds
    return u
  }

  return (
    <div className="space-y-5">
      {/* Credentials locked banner */}
      {credsLocked && (
        <div className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-4 py-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Credentials are locked by the parent level. Your own Client ID / Secret are ignored.
          </p>
        </div>
      )}

      {/* System service status (org level, shown to non-system views) */}
      {!isSystem && onToggleSystemService !== undefined && (
        <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Amadeus service</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {data.systemServiceDisabled
                ? 'Disabled for this organisation by a super admin.'
                : !data.hasOwnConfig
                  ? 'Using inherited Amadeus credentials.'
                  : 'Using own Amadeus credentials.'}
            </p>
          </div>
          {isSuper ? (
            <Toggle checked={!data.systemServiceDisabled} onChange={v => onToggleSystemService(!v)} />
          ) : (
            <span className={['rounded-full px-2.5 py-0.5 text-xs font-semibold',
              data.systemServiceDisabled
                ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
                : 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
            ].join(' ')}>
              {data.systemServiceDisabled ? 'Disabled by admin' : 'Active'}
            </span>
          )}
        </div>
      )}

      {/* API endpoint URLs — system level only */}
      {isSystem && (
        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">API Endpoints</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Token URL</label>
            <input type="text" value={tokenUrl} onChange={e => setTokenUrl(e.target.value)}
              placeholder="https://…/oauth2/token"
              className={inputCls} autoComplete="off" />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">OAuth 2.0 token endpoint from Amadeus Discover Quick Connect docs.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Activities URL</label>
            <input type="text" value={activitiesUrl} onChange={e => setActivitiesUrl(e.target.value)}
              placeholder="https://…/v1/catalog/activities"
              className={inputCls} autoComplete="off" />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Activities search endpoint from Amadeus Discover Quick Connect docs.</p>
          </div>
        </div>
      )}

      {/* Client ID */}
      <div className={credsLocked ? 'opacity-50 pointer-events-none' : ''}>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Client ID</label>
        {data.credentialsSet && (
          <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">
            Current: <span className="font-mono">{data.clientIdMasked}</span> — leave blank to keep.
          </p>
        )}
        <input type="text" value={clientId} onChange={e => setClientId(e.target.value)}
          placeholder={data.credentialsSet ? 'Enter new Client ID to replace…' : 'Amadeus Client ID…'}
          className={inputCls} autoComplete="off" />
      </div>

      {/* Client Secret */}
      <div className={credsLocked ? 'opacity-50 pointer-events-none' : ''}>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Client Secret</label>
        <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
          placeholder={data.credentialsSet ? 'Enter new secret to replace…' : 'Amadeus Client Secret…'}
          className={inputCls} autoComplete="off" />
      </div>

      {/* Enforce credentials for children (super only) */}
      {!propertyId && isSuper && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <Toggle checked={enforceChildCreds} onChange={setEnforceChildCreds} />
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Lock credentials for levels below</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isSystem
                ? 'All orgs and hotels will use the system credentials.'
                : 'Hotels in this org cannot use their own credentials.'}
            </p>
          </div>
        </div>
      )}

      {/* Enable toggle */}
      <div className="flex items-center gap-3">
        <Toggle checked={enabled} onChange={setEnabled} />
        <span className="text-sm text-[var(--color-text)]">{enabled ? 'Amadeus Discover enabled' : 'Amadeus Discover disabled'}</span>
      </div>

      {/* Search radius */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Search Radius <span className="font-normal normal-case opacity-60">km around the hotel</span>
          {propertyId && <span className="ml-1 font-normal normal-case opacity-60">(overrides inherited value)</span>}
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={50} step={1} value={radiusKm}
            onChange={e => setRadiusKm(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]" />
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
            {radiusKm} km
          </span>
        </div>
        {propertyId && (
          <button type="button" onClick={() => onSave({ radiusKmOverride: null })}
            className="mt-1 text-xs text-[var(--color-primary)] hover:underline">
            Reset to inherited
          </button>
        )}
      </div>

      {/* Max activities */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Max Activities to Return
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={50} step={1} value={maxActivities}
            onChange={e => setMaxActivities(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]" />
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
            {maxActivities}
          </span>
        </div>
      </div>

      {/* Strip label */}
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Strip Label</label>
        <input type="text" value={stripLabel} onChange={e => setStripLabel(e.target.value)}
          placeholder="Activities & Tours" className={inputCls} />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Label shown on the guest activities strip.
        </p>
      </div>

      {/* Strip mode */}
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Strip Display Mode</label>
        <div className="flex gap-3">
          {(['separate', 'merged'] as const).map(mode => (
            <label key={mode} className="flex cursor-pointer items-center gap-2">
              <input type="radio" checked={stripMode === mode} onChange={() => setStripMode(mode)}
                className="accent-[var(--color-primary)]" />
              <span className="text-sm text-[var(--color-text)] capitalize">{mode}</span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {mode === 'separate' ? '(two strips)' : '(one unified strip)'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Strip display behaviour (not at property level) */}
      {!propertyId && (
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
              <input type="range" min={0} max={120} step={1} value={stripAutoFoldSecs}
                onChange={e => setStripAutoFoldSecs(Number(e.target.value))}
                className="flex-1 accent-[var(--color-primary)]" />
              <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
                {stripAutoFoldSecs === 0 ? 'Never' : `${stripAutoFoldSecs}s`}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="button" disabled={saving} onClick={() => onSave(buildUpdate())}
          className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {!propertyId && (
          <button type="button" disabled={testMutation.isPending} onClick={() => testMutation.mutate()}
            className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40">
            {testMutation.isPending ? 'Testing…' : 'Test Connection'}
          </button>
        )}
        {testResult && (
          <p className={testResult.ok ? 'text-sm text-[var(--color-success)]' : 'text-sm text-[var(--color-error)]'}>
            {testResult.ok ? '✓ Connection successful' : '✗ ' + testResult.error}
          </p>
        )}
      </div>
    </div>
  )
}

// ── System-level card ─────────────────────────────────────────────────────────

function SystemAmadeusSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['amadeus-config-system'],
    queryFn: () => apiClient.getSystemAmadeusConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (u: AmadeusConfigUpdate) => apiClient.updateSystemAmadeusConfig(u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['amadeus-config-system'] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <p className="mb-5 text-sm text-[var(--color-text-muted)]">
        System-level Amadeus credentials used as fallback for all organisations that have not configured their own.
      </p>
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load.</p>}
      {data && (
        <AmadeusConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending}
          isSystem isSuper />
      )}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

// ── Org-level card ────────────────────────────────────────────────────────────

export function OrgAmadeusCard({ orgId, isSuper }: { orgId: number; isSuper?: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['amadeus-config', orgId],
    queryFn: () => apiClient.getAmadeusConfig(orgId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: AmadeusConfigUpdate) => apiClient.updateAmadeusConfig(u, orgId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['amadeus-config', orgId] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load.</p>}
      {data && (
        <AmadeusConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending}
          {...(isSuper !== undefined && { isSuper })} orgId={orgId}
          onToggleSystemService={disabled => saveMutation.mutate({ systemServiceDisabled: disabled })}
        />
      )}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

// ── Default export: renders the right card based on context ───────────────────

export default function AmadeusConfigCard({ isSystemLevel, orgId, isSuper }: {
  isSystemLevel: boolean
  orgId?: number
  isSuper?: boolean
}) {
  if (isSystemLevel) return <SystemAmadeusSection />
  if (!orgId) return null
  return <OrgAmadeusCard orgId={orgId} {...(isSuper !== undefined && { isSuper })} />
}
