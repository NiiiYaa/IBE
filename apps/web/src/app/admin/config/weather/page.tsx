'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import type { WeatherConfigResponse, WeatherConfigUpdate, WeatherUnits } from '@ibe/shared'

const FORECAST_DAYS_OPTIONS = [3, 5, 7, 10, 14]

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

function WeatherConfigForm({ data, onSave, saving, isSystem, isSuper, onToggleSystemService }: {
  data: WeatherConfigResponse
  onSave: (update: WeatherConfigUpdate) => void
  saving: boolean
  isSystem?: boolean
  isSuper?: boolean
  onToggleSystemService?: (disabled: boolean) => void
}) {
  const [units, setUnits] = useState<WeatherUnits>(data.units)
  const [forecastDays, setForecastDays] = useState(data.forecastDays)
  const [enabled, setEnabled] = useState(data.enabled)
  const [stripDefaultFolded, setStripDefaultFolded] = useState(data.stripDefaultFolded)
  const [stripAutoFoldSecs, setStripAutoFoldSecs] = useState(data.stripAutoFoldSecs)

  useEffect(() => {
    setUnits(data.units)
    setForecastDays(data.forecastDays)
    setEnabled(data.enabled)
    setStripDefaultFolded(data.stripDefaultFolded)
    setStripAutoFoldSecs(data.stripAutoFoldSecs)
  }, [data])

  const usingSystem = !isSystem && onToggleSystemService !== undefined && !data.hasOwnConfig

  return (
    <div className="space-y-6">
      {/* System service status banner (org level only) */}
      {!isSystem && onToggleSystemService !== undefined && (
        <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">System Weather service</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {data.systemServiceDisabled
                ? 'Weather service is disabled for this organisation by a super admin.'
                : usingSystem
                  ? 'Using system weather defaults. Configure below to override.'
                  : 'This org has its own weather configuration.'}
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

      {/* Temperature units */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">Temperature Units</label>
        <div className="flex gap-3">
          {(['celsius', 'fahrenheit'] as WeatherUnits[]).map(u => (
            <label key={u} className={['flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm transition-colors',
              units === u ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]',
            ].join(' ')}>
              <input type="radio" name="units" value={u} checked={units === u} onChange={() => setUnits(u)}
                className="accent-[var(--color-primary)]" />
              {u === 'celsius' ? '°C — Celsius' : '°F — Fahrenheit'}
            </label>
          ))}
        </div>
      </div>

      {/* Forecast days */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">Default Forecast Window</label>
        <div className="flex flex-wrap gap-2">
          {FORECAST_DAYS_OPTIONS.map(d => (
            <button key={d} type="button" onClick={() => setForecastDays(d)}
              className={['rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                forecastDays === d ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]',
              ].join(' ')}>
              {d} days
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">Days of forecast shown by the AI agent when asked about the weather.</p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center gap-3">
        <Toggle checked={enabled} onChange={setEnabled} />
        <span className="text-sm text-[var(--color-text)]">{enabled ? 'Weather feature enabled' : 'Weather feature disabled'}</span>
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

      <div className="pt-1">
        <button type="button" disabled={saving} onClick={() => onSave({ units, forecastDays, enabled, stripDefaultFolded, stripAutoFoldSecs })}
          className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function SystemWeatherSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['weather-config-system'],
    queryFn: () => apiClient.getSystemWeatherConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (update: WeatherConfigUpdate) => apiClient.updateSystemWeatherConfig(update),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['weather-config-system'] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <p className="mb-5 text-sm text-[var(--color-text-muted)]">
        System-level defaults used as the fallback for all organisations. Open-Meteo is free with no API key required.
      </p>
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
      {data && (
        <WeatherConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending} isSystem isSuper />
      )}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

export default function WeatherConfigPage() {
  const { admin } = useAdminAuth()
  const { orgId: contextOrgId } = useAdminProperty()
  const qc = useQueryClient()
  const isSuper = admin?.role === 'super'
  const isSystemLevel = isSuper && contextOrgId === null
  const orgId = isSuper ? (contextOrgId ?? undefined) : (admin?.organizationId ?? undefined)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['weather-config', orgId],
    queryFn: () => apiClient.getWeatherConfig(orgId),
    enabled: !!admin && !isSystemLevel && orgId !== undefined,
  })

  const saveMutation = useMutation({
    mutationFn: (update: WeatherConfigUpdate) => apiClient.updateWeatherConfig(update, orgId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['weather-config', orgId] }) },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Weather</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Configure the weather forecast service. Powered by Open-Meteo — free, no API key required.
          The AI agent uses this to answer guest questions about the weather during their stay.
        </p>
      </div>

      {isSystemLevel ? (
        <SystemWeatherSection />
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
          {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
          {data && (
            <WeatherConfigForm
              data={data}
              onSave={u => saveMutation.mutate(u)}
              saving={saveMutation.isPending}
              isSuper={isSuper}
              onToggleSystemService={disabled => saveMutation.mutate({ systemServiceDisabled: disabled })}
              {...(orgId !== undefined ? { orgId } : {})}
            />
          )}
          {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
          {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
        </div>
      )}
    </div>
  )
}
