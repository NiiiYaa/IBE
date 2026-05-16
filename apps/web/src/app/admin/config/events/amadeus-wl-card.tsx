'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { WLConfigResponse, WLConfigUpdate } from '@ibe/shared'

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

function WLConfigForm({
  data,
  onSave,
  saving,
  isSuper,
  isSystemTier,
}: {
  data: WLConfigResponse
  onSave: (u: WLConfigUpdate) => void
  saving: boolean
  isSuper?: boolean
  isSystemTier?: boolean
}) {
  const [channelUuid, setChannelUuid] = useState('')
  const [enabled, setEnabled] = useState(data.enabled)
  const [enforceChildCreds, setEnforceChildCreds] = useState(data.enforceChildCreds)

  useEffect(() => {
    setEnabled(data.enabled)
    setEnforceChildCreds(data.enforceChildCreds)
  }, [data])

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'

  function buildUpdate(): WLConfigUpdate {
    const u: WLConfigUpdate = { enabled }
    if (channelUuid) u.channelUuid = channelUuid
    if (isSuper) u.enforceChildCreds = enforceChildCreds
    return u
  }

  return (
    <div className="space-y-5">
      {!data.hasOwnConfig && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <p className="text-sm text-[var(--color-text-muted)]">Using inherited Channel UUID from parent level.</p>
        </div>
      )}

      {data.channelUuidSet && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Current: <span className="font-mono">{data.channelUuidMasked}</span> — leave blank to keep.
        </p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Channel UUID</label>
        <input
          type="text"
          value={channelUuid}
          onChange={e => setChannelUuid(e.target.value)}
          placeholder={data.channelUuidSet ? 'Enter new UUID to replace…' : 'Paste Channel UUID from Amadeus WL…'}
          className={inputCls}
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Provided by Amadeus WL during onboarding. Leave blank to keep existing.
        </p>
      </div>

      {isSuper && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <Toggle checked={enforceChildCreds} onChange={setEnforceChildCreds} />
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Lock UUID for levels below</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isSystemTier
                ? 'All chains and hotels will use the system UUID.'
                : 'Hotels in this chain cannot use their own UUID.'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Toggle checked={enabled} onChange={setEnabled} />
        <span className="text-sm text-[var(--color-text)]">
          {enabled ? 'Amadeus WL enabled' : 'Amadeus WL disabled'}
        </span>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(buildUpdate())}
          className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function SystemWLSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wl-config-system'],
    queryFn: () => apiClient.getSystemWLConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (u: WLConfigUpdate) => apiClient.updateSystemWLConfig(u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wl-config-system'] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <p className="mb-5 text-sm text-[var(--color-text-muted)]">
        System-level Amadeus WL Channel UUID. Used as fallback for all organisations without their own.
      </p>
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load.</p>}
      {data && (
        <WLConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending} isSuper isSystemTier />
      )}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

export function OrgWLCard({ orgId, isSuper }: { orgId: number; isSuper?: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wl-config-org', orgId],
    queryFn: () => apiClient.getOrgWLConfig(orgId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: WLConfigUpdate) => apiClient.updateOrgWLConfig(u, orgId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wl-config-org', orgId] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load.</p>}
      {data && (
        <WLConfigForm
          data={data}
          onSave={u => saveMutation.mutate(u)}
          saving={saveMutation.isPending}
          {...(isSuper !== undefined && { isSuper })}
        />
      )}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

export default function AmadeusWLCard({ isSystemLevel, orgId, isSuper }: {
  isSystemLevel: boolean
  orgId?: number
  isSuper?: boolean
}) {
  if (isSystemLevel) return <SystemWLSection />
  if (!orgId) return null
  return <OrgWLCard orgId={orgId} {...(isSuper !== undefined && { isSuper })} />
}
