'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import type { AirportConfigResponse, AirportConfigUpdate } from '@ibe/shared'

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

function DatasetRefreshSection() {
  const qc = useQueryClient()
  const refreshMutation = useMutation({
    mutationFn: () => apiClient.refreshAirportDataset(),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['airport-config-system'] }) },
  })

  return (
    <div className="mt-4 border-t border-[var(--color-border)] pt-4">
      <p className="mb-1 text-sm font-medium text-[var(--color-text)]">Airport Dataset</p>
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Sourced from OpenFlights. The bundled dataset is used until refreshed.
      </p>
      <button type="button" disabled={refreshMutation.isPending} onClick={() => refreshMutation.mutate()}
        className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40">
        {refreshMutation.isPending ? 'Refreshing…' : 'Refresh Dataset'}
      </button>
      {refreshMutation.isSuccess && (
        <p className="mt-2 text-xs text-[var(--color-success)]">
          Dataset refreshed — {refreshMutation.data.count} airports loaded.
        </p>
      )}
      {refreshMutation.isError && <p className="mt-2 text-xs text-[var(--color-error)]">Refresh failed.</p>}
    </div>
  )
}

function AirportConfigForm({ data, onSave, saving, isSystem }: {
  data: AirportConfigResponse
  onSave: (u: AirportConfigUpdate) => void
  saving: boolean
  isSystem?: boolean
}) {
  const [enabled, setEnabled] = useState(data.enabled)
  const [radiusKm, setRadiusKm] = useState(data.radiusKm)
  const [maxCount, setMaxCount] = useState(data.maxCount)

  useEffect(() => {
    setEnabled(data.enabled)
    setRadiusKm(data.radiusKm)
    setMaxCount(data.maxCount)
  }, [data])

  return (
    <div className="space-y-5">
      {!isSystem && !data.hasOwnConfig && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <p className="text-sm text-[var(--color-text-muted)]">Using inherited settings from parent level.</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Toggle checked={enabled} onChange={setEnabled} />
        <span className="text-sm text-[var(--color-text)]">
          {enabled ? 'Nearest airports displayed' : 'Nearest airports hidden'}
        </span>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Search radius <span className="font-normal normal-case opacity-60">km around the hotel</span>
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={300} value={radiusKm}
            onChange={e => setRadiusKm(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]" />
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
            {radiusKm} km
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Show airports within this distance. Default: 100 km.</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Max airports shown
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={5} value={maxCount}
            onChange={e => setMaxCount(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]" />
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
            {maxCount}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Maximum airports to display per property. Default: 3.</p>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="button" disabled={saving}
          onClick={() => onSave({ enabled, radiusKm, maxCount })}
          className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {isSystem && <DatasetRefreshSection />}
    </div>
  )
}

function SystemSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['airport-config-system'],
    queryFn: () => apiClient.getSystemAirportConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (u: AirportConfigUpdate) => apiClient.updateSystemAirportConfig(u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['airport-config-system'] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <p className="mb-5 text-sm text-[var(--color-text-muted)]">
        System-level defaults. All organisations and properties inherit these unless overridden.
      </p>
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
      {data && <AirportConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending} isSystem />}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

function OrgSection({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['airport-config-org', orgId],
    queryFn: () => apiClient.getOrgAirportConfig(orgId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: AirportConfigUpdate) => apiClient.updateOrgAirportConfig(u, orgId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['airport-config-org', orgId] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
      {data && <AirportConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending} />}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

function PropertySection({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['airport-config-property', propertyId],
    queryFn: () => apiClient.getPropertyAirportConfig(propertyId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: AirportConfigUpdate) => apiClient.updatePropertyAirportConfig(propertyId, u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['airport-config-property', propertyId] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
      {data && <AirportConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending} />}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

export default function AirportConfigPage() {
  const { admin } = useAdminAuth()
  const { orgId: contextOrgId, propertyId: contextPropertyId } = useAdminProperty()
  const isSuper = admin?.role === 'super'
  const isSystemLevel = isSuper && contextOrgId === null
  const orgId = isSuper ? (contextOrgId ?? undefined) : (admin?.organizationId ?? undefined)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Nearest Airports</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Show the nearest airports and their distances on hotel pages. Uses the OpenFlights dataset.
          Settings inherit from system → organisation → property.
        </p>
      </div>

      {isSystemLevel && <SystemSection />}

      {!isSystemLevel && contextPropertyId !== null && (
        <PropertySection propertyId={contextPropertyId} />
      )}

      {!isSystemLevel && contextPropertyId === null && orgId !== undefined && (
        <OrgSection orgId={orgId} />
      )}
    </div>
  )
}
