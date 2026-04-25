'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import {
  MAP_PROVIDERS,
  MAP_PROVIDER_LABELS,
  MAP_PROVIDER_DESCRIPTIONS,
  MAP_PROVIDER_NEEDS_KEY,
  MAP_PROVIDER_KEY_LABEL,
  POI_CATEGORIES,
  POI_CATEGORY_LABELS,
} from '@ibe/shared'
import type { MapProvider, PoiCategory, MapsConfigResponse, MapsConfigUpdate } from '@ibe/shared'

const POI_RADIUS_OPTIONS = [
  { value: 500, label: '500 m' },
  { value: 1000, label: '1 km' },
  { value: 2000, label: '2 km' },
  { value: 5000, label: '5 km' },
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
      ].join(' ')}
    >
      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function MapsConfigForm({ data, onSave, saving, orgId }: {
  data: MapsConfigResponse
  onSave: (update: MapsConfigUpdate & { orgId?: number }) => void
  saving: boolean
  orgId?: number
}) {
  const [provider, setProvider] = useState<MapProvider>(data.provider)
  const [apiKey, setApiKey] = useState('')
  const [poiRadius, setPoiRadius] = useState(data.poiRadius)
  const [poiCategories, setPoiCategories] = useState<PoiCategory[]>(data.poiCategories)
  const [enabled, setEnabled] = useState(data.enabled)

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'

  function toggleCategory(cat: PoiCategory) {
    setPoiCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  function handleSave() {
    const update: MapsConfigUpdate & { orgId?: number } = {
      provider,
      poiRadius,
      poiCategories,
      enabled,
      ...(orgId && { orgId }),
    }
    if (apiKey) update.apiKey = apiKey
    onSave(update)
  }

  return (
    <div className="space-y-6">

      {/* Provider */}
      <div>
        <label className="mb-3 block text-sm font-medium text-[var(--color-text)]">Map Provider</label>
        <div className="space-y-2">
          {MAP_PROVIDERS.map(p => (
            <label
              key={p}
              className={[
                'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                provider === p
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]',
              ].join(' ')}
            >
              <input
                type="radio"
                name="provider"
                value={p}
                checked={provider === p}
                onChange={() => setProvider(p)}
                className="mt-0.5 accent-[var(--color-primary)]"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">{MAP_PROVIDER_LABELS[p]}</span>
                  {!MAP_PROVIDER_NEEDS_KEY[p] && (
                    <span className="rounded bg-emerald-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-emerald-700">Free</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{MAP_PROVIDER_DESCRIPTIONS[p]}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* API key (only for providers that need one) */}
      {MAP_PROVIDER_NEEDS_KEY[provider] && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">{MAP_PROVIDER_KEY_LABEL[provider]}</label>
          {data.apiKeySet && data.provider === provider && (
            <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">
              Current key: <span className="font-mono">{data.apiKeyMasked}</span> — leave blank to keep it.
            </p>
          )}
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Paste API key…"
            className={inputCls}
            autoComplete="off"
          />
        </div>
      )}

      {/* POI radius */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">Points of Interest Radius</label>
        <div className="flex flex-wrap gap-2">
          {POI_RADIUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPoiRadius(opt.value)}
              className={[
                'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                poiRadius === opt.value
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                  : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* POI categories */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">POI Categories to Show</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {POI_CATEGORIES.map(cat => (
            <label
              key={cat}
              className={[
                'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                poiCategories.includes(cat)
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={poiCategories.includes(cat)}
                onChange={() => toggleCategory(cat)}
                className="accent-[var(--color-primary)]"
              />
              {POI_CATEGORY_LABELS[cat]}
            </label>
          ))}
        </div>
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center gap-3">
        <Toggle checked={enabled} onChange={setEnabled} />
        <span className="text-sm text-[var(--color-text)]">{enabled ? 'Map widget enabled' : 'Map widget disabled'}</span>
      </div>

      <div className="pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function SystemMapsSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['maps-config-system'],
    queryFn: () => apiClient.getSystemMapsConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (update: MapsConfigUpdate) => apiClient.updateSystemMapsConfig(update),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['maps-config-system'] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <p className="mb-5 text-sm text-[var(--color-text-muted)]">
        System-level defaults used as the fallback for all organisations that have not configured their own map provider.
      </p>
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
      {data && (
        <MapsConfigForm
          data={data}
          onSave={update => saveMutation.mutate(update)}
          saving={saveMutation.isPending}
        />
      )}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

export default function MapsConfigPage() {
  const { admin } = useAdminAuth()
  const { orgId: contextOrgId } = useAdminProperty()
  const qc = useQueryClient()
  const isSuper = admin?.role === 'super'

  // System level: super admin with no org selected (null in context)
  const isSystemLevel = isSuper && contextOrgId === null

  // Org-level: super uses context org; regular admin uses their own org
  const orgId = isSuper
    ? (contextOrgId ?? undefined)
    : (admin?.organizationId ?? undefined)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['maps-config', orgId],
    queryFn: () => apiClient.getMapsConfig(orgId),
    enabled: !!admin && !isSystemLevel && orgId !== undefined,
  })

  const saveMutation = useMutation({
    mutationFn: (update: MapsConfigUpdate & { orgId?: number }) =>
      apiClient.updateMapsConfig(update, orgId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['maps-config', orgId] }) },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Maps</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Configure the map provider used to display hotel locations and nearby points of interest.
          OpenStreetMap works out of the box — no API key required.
        </p>
      </div>

      {isSystemLevel ? (
        <SystemMapsSection />
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
          {isError && <p className="text-sm text-[var(--color-error)]">Failed to load maps config. Please refresh.</p>}
          {data && (
            <MapsConfigForm
              data={data}
              onSave={update => saveMutation.mutate(update)}
              saving={saveMutation.isPending}
              {...(orgId !== undefined ? { orgId } : {})}
            />
          )}
          {saveMutation.isError && (
            <p className="mt-3 text-sm text-[var(--color-error)]">Save failed. Please try again.</p>
          )}
          {saveMutation.isSuccess && (
            <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>
          )}
        </div>
      )}
    </div>
  )
}
