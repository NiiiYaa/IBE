'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import { SaveBar } from '../../design/components'
import type { DataProviderType, SystemDataProviderConfig, OrgDataProviderConfig } from '@ibe/shared'

function extractTripAdvisorKey(input: string): string | null {
  const match = input.match(/g\d+-d\d+/)
  return match ? match[0] : null
}

// ── Shared primitives ──────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
      ].join(' ')}
    >
      <span className={[
        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0',
      ].join(' ')} />
    </button>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="mb-5 text-base font-semibold text-[var(--color-text)]">{title}</h2>
      {children}
    </div>
  )
}

function ProviderTypeSelect({ value, onChange }: { value: DataProviderType; onChange: (v: DataProviderType) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Provider</label>
      <select value={value} onChange={e => onChange(e.target.value as DataProviderType)} className={inputCls}>
        <option value="dataforseo">DataForSEO</option>
        <option value="none">None (disabled)</option>
      </select>
    </div>
  )
}

function CredentialFields({
  loginSet,
  passwordMasked,
  login,
  password,
  onLoginChange,
  onPasswordChange,
}: {
  loginSet: boolean
  passwordMasked: string | null
  login: string
  password: string
  onLoginChange: (v: string) => void
  onPasswordChange: (v: string) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--color-text)]">Login (email)</label>
          {loginSet && !login && (
            <span className="flex items-center gap-1 text-xs font-medium text-[var(--color-success)]">
              <span>✓</span> Configured
            </span>
          )}
        </div>
        <input
          type="text"
          value={login}
          onChange={e => onLoginChange(e.target.value)}
          placeholder={loginSet ? 'Enter new value to replace…' : 'DataForSEO login email'}
          className={inputCls}
          autoComplete="off"
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--color-text)]">Password</label>
          {passwordMasked && !password && (
            <span className="flex items-center gap-1 text-xs font-medium text-[var(--color-success)]">
              <span>✓</span> Configured
            </span>
          )}
        </div>
        <input
          type="password"
          value={password}
          onChange={e => onPasswordChange(e.target.value)}
          placeholder={passwordMasked ? 'Leave blank to keep existing…' : 'DataForSEO password'}
          className={inputCls}
          autoComplete="new-password"
        />
      </div>
    </div>
  )
}

// ── Test connection button ─────────────────────────────────────────────────────

type TestStatus = 'idle' | 'testing' | 'ok' | 'error'

function TestConnectionButton() {
  const [status, setStatus] = useState<TestStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function run() {
    setStatus('testing')
    setErrorMsg(null)
    try {
      const result = await apiClient.testDataProviderConnection()
      if (result.success) {
        setStatus('ok')
        setTimeout(() => setStatus('idle'), 4000)
      } else {
        setStatus('error')
        setErrorMsg(result.error ?? 'Connection failed')
        setTimeout(() => { setStatus('idle'); setErrorMsg(null) }, 6000)
      }
    } catch {
      setStatus('error')
      setErrorMsg('Request failed')
      setTimeout(() => { setStatus('idle'); setErrorMsg(null) }, 6000)
    }
  }

  if (status === 'testing') return (
    <span className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)]">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      Testing…
    </span>
  )
  if (status === 'ok') return (
    <span className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 px-3 text-xs font-medium text-[var(--color-success)]">
      ✓ Connected
    </span>
  )
  if (status === 'error') return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 items-center gap-1 rounded-lg border border-[var(--color-error)]/40 bg-[var(--color-error)]/10 px-3 text-xs font-medium text-[var(--color-error)]">
        ✗ {errorMsg ?? 'Failed'}
      </span>
    </div>
  )
  return (
    <button
      onClick={run}
      className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
    >
      Test Connection
    </button>
  )
}

// ── Refresh button ─────────────────────────────────────────────────────────────

type RefreshStatus = 'idle' | 'refreshing' | 'done' | 'skipped' | 'error'

function RefreshButton({ propertyId, onRefreshed }: { propertyId: number; onRefreshed: () => void }) {
  const [status, setStatus] = useState<RefreshStatus>('idle')
  const [msg, setMsg] = useState<string | null>(null)

  async function run() {
    setStatus('refreshing')
    setMsg(null)
    try {
      const result = await apiClient.refreshDataProviderProperty(propertyId)
      if (result.skipped) {
        setStatus('skipped')
        setMsg(result.reason ?? 'Skipped')
        setTimeout(() => { setStatus('idle'); setMsg(null) }, 5000)
      } else {
        setStatus('done')
        onRefreshed()
        setTimeout(() => { setStatus('idle'); setMsg(null) }, 3000)
      }
    } catch {
      setStatus('error')
      setTimeout(() => { setStatus('idle'); setMsg(null) }, 4000)
    }
  }

  if (status === 'refreshing') return (
    <span className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)]">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      Refreshing…
    </span>
  )
  if (status === 'done') return (
    <span className="flex h-7 items-center gap-1 rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 px-3 text-xs font-medium text-[var(--color-success)]">
      ✓ Refreshed
    </span>
  )
  if (status === 'skipped') return (
    <span className="flex h-7 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-700">
      ⚠ {msg ?? 'Skipped'}
    </span>
  )
  if (status === 'error') return (
    <span className="flex h-7 items-center gap-1 rounded-lg border border-[var(--color-error)]/40 bg-[var(--color-error)]/10 px-3 text-xs font-medium text-[var(--color-error)]">
      ✗ Failed
    </span>
  )
  return (
    <button
      onClick={run}
      className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
    >
      Refresh Now
    </button>
  )
}

// ── Score panel ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
  fetching: 'bg-amber-100 text-amber-700',
  done: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  error: 'bg-[var(--color-error)]/10 text-[var(--color-error)]',
}

function ScorePanel({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['dp-property', propertyId],
    queryFn: () => apiClient.getPropertyDataProviderConfig(propertyId),
  })
  const score = data?.score

  return (
    <SectionCard title="Current Score">
      <div className="grid grid-cols-2 gap-4">
        {/* Google (DataForSEO) */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Google</p>
          <div className="space-y-1">
            {isLoading ? (
              <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
            ) : score ? (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  {score.score !== null
                    ? <span className="text-2xl font-bold text-[var(--color-text)]">{score.score.toFixed(1)}</span>
                    : <span className="text-sm text-[var(--color-text-muted)]">No score</span>
                  }
                  {score.reviewCount !== null && (
                    <span className="text-sm text-[var(--color-text-muted)]">{score.reviewCount.toLocaleString()} reviews</span>
                  )}
                  <span className={['rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[score.status] ?? STATUS_COLORS.idle].join(' ')}>
                    {score.status}
                  </span>
                </div>
                {score.source && <p className="text-xs text-[var(--color-text-muted)]">Source: {score.source}</p>}
                {score.fetchedAt && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Last fetched: {new Date(score.fetchedAt).toLocaleString()}
                  </p>
                )}
                {score.errorMsg && (
                  <p className="text-xs text-[var(--color-error)]">Error: {score.errorMsg}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">No score fetched yet.</p>
            )}
          </div>
          <RefreshButton
            propertyId={propertyId}
            onRefreshed={() => qc.invalidateQueries({ queryKey: ['dp-property', propertyId] })}
          />
        </div>

        {/* TripAdvisor — placeholder, API coming later */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">TripAdvisor</p>
          <div className="space-y-1">
            <p className="text-sm text-[var(--color-text-muted)]">No score fetched yet.</p>
          </div>
          <button
            disabled
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] opacity-50 cursor-not-allowed"
            title="TripAdvisor score refresh coming soon"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    </SectionCard>
  )
}

// ── Google section ─────────────────────────────────────────────────────────────

function GoogleSection({ propertyId, propertyName }: { propertyId: number; propertyName: string | null }) {
  const qc = useQueryClient()
  const [urlInput, setUrlInput] = useState('')
  const [saved, setSaved] = useState(false)
  const initialized = useRef(false)

  const { data } = useQuery({
    queryKey: ['dp-property', propertyId],
    queryFn: () => apiClient.getPropertyDataProviderConfig(propertyId),
  })
  const propData = data?.propertyConfig ?? null

  useEffect(() => {
    initialized.current = false
    setUrlInput('')
  }, [propertyId])

  useEffect(() => {
    if (!initialized.current && propData !== undefined) {
      initialized.current = true
      setUrlInput(propData?.googleMapsUrl ?? '')
    }
  }, [propData])

  const { mutate, isPending } = useMutation({
    mutationFn: (url: string | null) =>
      apiClient.updatePropertyDataProviderConfig(propertyId, { googleMapsUrl: url }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dp-property', propertyId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const parsed = (() => {
    const cidMatch = urlInput.match(/!1s0x[0-9a-f]+:0x([0-9a-f]+)/i)
    let cid: string | null = null
    if (cidMatch) { try { cid = BigInt(`0x${cidMatch[1]}`).toString() } catch { /* ignore */ } }
    const coordMatch = urlInput.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    return {
      cid,
      lat: coordMatch?.[1] ? parseFloat(coordMatch[1]) : null,
      lng: coordMatch?.[2] ? parseFloat(coordMatch[2]) : null,
    }
  })()

  const currentUrl = propData?.googleMapsUrl ?? null
  const isDirty = urlInput !== (currentUrl ?? '')

  return (
    <SectionCard title="Google">
      <div className="space-y-3">
        {propertyName && (
          <a
            href={`https://www.google.com/maps/search/${encodeURIComponent(propertyName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            Open in Google Maps →
          </a>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Google Maps URL</label>
          <input
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://www.google.com/maps/place/..."
            className={inputCls}
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Find the hotel, copy the full URL from the browser, and paste it here.
          </p>
        </div>
        {urlInput && (
          parsed.cid
            ? (
              <div className="space-y-0.5 text-xs text-[var(--color-success)]">
                <p>CID: {parsed.cid}</p>
                {parsed.lat !== null && <p>Coordinates: {parsed.lat}, {parsed.lng}</p>}
              </div>
            )
            : <p className="text-xs text-[var(--color-error)]">Could not extract CID — make sure to use a full Google Maps URL.</p>
        )}
        {!urlInput && currentUrl && (() => {
          const cidMatch = currentUrl.match(/!1s0x[0-9a-f]+:0x([0-9a-f]+)/i)
          let savedCid: string | null = null
          if (cidMatch) { try { savedCid = BigInt(`0x${cidMatch[1]}`).toString() } catch { /* ignore */ } }
          return (
            <div className="space-y-0.5 text-xs text-[var(--color-text-muted)]">
              {savedCid
                ? <p>CID: <span className="font-mono text-[var(--color-text)]">{savedCid}</span></p>
                : <p>URL saved (no CID — re-paste the full Google Maps URL)</p>
              }
              {propData?.lat !== null && propData?.lat !== undefined && (
                <p>Coordinates: {propData.lat}, {propData.lng}</p>
              )}
            </div>
          )
        })()}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => mutate(urlInput || null)}
            disabled={isPending || !isDirty || (urlInput !== '' && !parsed.cid)}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          {currentUrl && (
            <button
              type="button"
              onClick={() => { setUrlInput(''); mutate(null) }}
              disabled={isPending}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-50"
            >
              Remove
            </button>
          )}
          {saved && <span className="text-xs text-[var(--color-success)]">Saved</span>}
        </div>
      </div>
    </SectionCard>
  )
}

// ── TripAdvisor section ────────────────────────────────────────────────────────

function TripAdvisorSection({ propertyId, propertyName }: { propertyId: number; propertyName: string | null }) {
  const qc = useQueryClient()
  const [urlInput, setUrlInput] = useState('')
  const [saved, setSaved] = useState(false)
  const initialized = useRef(false)

  const { data: config } = useQuery({
    queryKey: ['admin-config', propertyId],
    queryFn: () => apiClient.getHotelConfigAdmin(propertyId),
    staleTime: Infinity,
  })

  useEffect(() => {
    initialized.current = false
    setUrlInput('')
  }, [propertyId])

  useEffect(() => {
    if (!initialized.current && config?.tripadvisorHotelKey !== undefined) {
      initialized.current = true
      setUrlInput(config.tripadvisorHotelKey ?? '')
    }
  }, [config?.tripadvisorHotelKey])

  const { mutate, isPending } = useMutation({
    mutationFn: (key: string | null) =>
      apiClient.updateHotelConfig(propertyId, { tripadvisorHotelKey: key }),
    onSuccess: (fresh) => {
      qc.setQueryData(['admin-config', propertyId], fresh)
      qc.setQueryData(['hotel-config', propertyId], fresh)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const extractedKey = extractTripAdvisorKey(urlInput)
  const currentKey = config?.tripadvisorHotelKey ?? null
  const isDirty = extractedKey !== currentKey

  return (
    <SectionCard title="TripAdvisor">
      <div className="space-y-3">
        {propertyName && (
          <a
            href={`https://www.tripadvisor.com/Search?q=${encodeURIComponent(propertyName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            Open in TripAdvisor →
          </a>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">TripAdvisor URL or hotel key</label>
          <input
            type="text"
            placeholder="https://www.tripadvisor.com/Hotel_Review-g293916-d305496-... or g293916-d305496"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            className={inputCls}
          />
          {urlInput && (
            <p className="mt-1 text-xs">
              {extractedKey
                ? <span className="text-[var(--color-success)]">Hotel key: <strong>{extractedKey}</strong></span>
                : <span className="text-[var(--color-error)]">No hotel key found — paste the full TripAdvisor URL</span>
              }
            </p>
          )}
          {!urlInput && currentKey && (
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Current key: <strong>{currentKey}</strong></p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => mutate(extractedKey)}
            disabled={isPending || !isDirty || (urlInput !== '' && !extractedKey)}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          {currentKey && (
            <button
              type="button"
              onClick={() => { setUrlInput(''); mutate(null) }}
              disabled={isPending}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-50"
            >
              Remove
            </button>
          )}
          {saved && <span className="text-xs text-[var(--color-success)]">Saved</span>}
        </div>
      </div>
    </SectionCard>
  )
}

// ── System config section ──────────────────────────────────────────────────────

function SystemConfigSection() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['dp-system'],
    queryFn: () => apiClient.getSystemDataProviderConfig(),
  })

  const [openToAll, setOpenToAll] = useState(true)
  const [providerType, setProviderType] = useState<DataProviderType>('dataforseo')
  const [refreshIntervalDays, setRefreshIntervalDays] = useState(30)
  const [enabled, setEnabled] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setOpenToAll(data.openToAll)
      setProviderType(data.providerType)
      setRefreshIntervalDays(data.refreshIntervalDays)
      setEnabled(data.enabled)
    }
  }, [data])

  const isDirty = !!data && (
    openToAll !== data.openToAll ||
    providerType !== data.providerType ||
    refreshIntervalDays !== data.refreshIntervalDays ||
    enabled !== data.enabled ||
    login !== '' ||
    password !== ''
  )

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const body: Record<string, unknown> = { openToAll, providerType, refreshIntervalDays, enabled }
      if (login) body.login = login
      if (password) body.password = password
      await apiClient.updateSystemDataProviderConfig(body)
      qc.invalidateQueries({ queryKey: ['dp-system'] })
      setLogin('')
      setPassword('')
    } catch {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Loading…</div>

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Data Provider</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">System-level configuration for hotel score enrichment.</p>
      </div>

      <SectionCard title="Access Control">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Open to lower levels</p>
            <p className="text-xs text-[var(--color-text-muted)]">When off, all orgs and hotels must configure their own credentials.</p>
          </div>
          <Toggle checked={openToAll} onChange={setOpenToAll} />
        </div>
      </SectionCard>

      <SectionCard title="Provider Settings">
        <div className="space-y-4">
          <ProviderTypeSelect value={providerType} onChange={setProviderType} />
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Refresh Interval (days)</label>
            <input
              type="number"
              min={1}
              value={refreshIntervalDays}
              onChange={e => setRefreshIntervalDays(Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div className="flex items-center gap-3">
            <Toggle checked={enabled} onChange={setEnabled} />
            <span className="text-sm text-[var(--color-text)]">{enabled ? 'Enabled' : 'Disabled'} (daily cron)</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="System Credentials">
        <div className="space-y-4">
          <CredentialFields
            loginSet={data?.loginSet ?? false}
            passwordMasked={data?.passwordMasked ?? null}
            login={login}
            password={password}
            onLoginChange={setLogin}
            onPasswordChange={setPassword}
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            If not configured here, falls back to <span className="font-mono">DATAFORSEO_LOGIN</span> / <span className="font-mono">DATAFORSEO_PASSWORD</span> env vars.
          </p>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-[var(--color-text-muted)]">Verify the credentials work:</span>
            <TestConnectionButton />
          </div>
        </div>
      </SectionCard>

      {saveError && <p className="text-sm text-[var(--color-error)]">{saveError}</p>}
      <SaveBar isDirty={isDirty} isSaving={saving} onSave={handleSave} />
    </div>
  )
}

// ── Org config section ─────────────────────────────────────────────────────────

function OrgConfigSection({ orgId }: { orgId: number | null }) {
  const { admin } = useAdminAuth()
  const qc = useQueryClient()
  const isSuper = admin?.role === 'super'

  const { data, isLoading } = useQuery({
    queryKey: ['dp-global', orgId],
    queryFn: () => apiClient.getOrgDataProviderConfig(orgId),
  })

  const orgData: OrgDataProviderConfig | null = data?.orgConfig ?? null
  const sysData: SystemDataProviderConfig | null = data?.systemConfig ?? null
  const systemAccessible = !!(sysData?.openToAll && !orgData?.systemServiceDisabled)

  const [useSystem, setUseSystem] = useState(true)
  const [providerType, setProviderType] = useState<DataProviderType>('dataforseo')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [refreshIntervalDays, setRefreshIntervalDays] = useState<number | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [systemServiceDisabled, setSystemServiceDisabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (orgData) {
      setUseSystem(orgData.useSystem)
      setProviderType(orgData.providerType ?? 'dataforseo')
      setRefreshIntervalDays(orgData.refreshIntervalDays)
      setEnabled(orgData.enabled)
      setSystemServiceDisabled(orgData.systemServiceDisabled)
    }
  }, [orgData])

  const isDirty = !!orgData && (
    useSystem !== orgData.useSystem ||
    systemServiceDisabled !== orgData.systemServiceDisabled ||
    (!useSystem && (
      providerType !== (orgData.providerType ?? 'dataforseo') ||
      login !== '' ||
      password !== '' ||
      refreshIntervalDays !== orgData.refreshIntervalDays ||
      enabled !== orgData.enabled
    ))
  )

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const body: Record<string, unknown> = { useSystem, systemServiceDisabled }
      if (!useSystem) {
        body.providerType = providerType
        if (login) body.login = login
        if (password) body.password = password
        if (refreshIntervalDays !== null) body.refreshIntervalDays = refreshIntervalDays
        if (enabled !== null) body.enabled = enabled
      }
      await apiClient.updateOrgDataProviderConfig(body, orgId)
      qc.invalidateQueries({ queryKey: ['dp-global', orgId] })
      setLogin('')
      setPassword('')
    } catch {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Loading…</div>

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Data Provider</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Configure hotel score enrichment for this organization.</p>
      </div>

      {isSuper && (
        <SectionCard title="System Access">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Block system access for this org</p>
              <p className="text-xs text-[var(--color-text-muted)]">When on, this org cannot use system-level credentials even if the system is open.</p>
            </div>
            <Toggle checked={systemServiceDisabled} onChange={setSystemServiceDisabled} />
          </div>
        </SectionCard>
      )}

      <SectionCard title="Configuration">
        {systemAccessible && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Use system configuration</p>
              <p className="text-xs text-[var(--color-text-muted)]">Inherit provider type and credentials from the system level.</p>
            </div>
            <Toggle checked={useSystem} onChange={setUseSystem} />
          </div>
        )}

        {(useSystem && systemAccessible) ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm">
            <p className="font-medium text-[var(--color-text)] mb-1">Inheriting from system</p>
            {sysData && (
              <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
                <p>Provider: {sysData.providerType}</p>
                <p>Refresh interval: {sysData.refreshIntervalDays} days</p>
                <p>Status: {sysData.enabled ? '● Enabled' : '○ Disabled'}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {!systemAccessible && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                System access is not available for this org. Configure your own credentials below.
              </div>
            )}
            <ProviderTypeSelect value={providerType} onChange={setProviderType} />
            <CredentialFields
              loginSet={orgData?.loginSet ?? false}
              passwordMasked={orgData?.passwordMasked ?? null}
              login={login}
              password={password}
              onLoginChange={setLogin}
              onPasswordChange={setPassword}
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Refresh Interval (days)</label>
              <input
                type="number"
                min={1}
                value={refreshIntervalDays ?? ''}
                onChange={e => setRefreshIntervalDays(e.target.value ? Number(e.target.value) : null)}
                placeholder="Leave blank to inherit system default"
                className={inputCls}
              />
            </div>
            <div className="flex items-center gap-3">
              <Toggle checked={enabled ?? false} onChange={setEnabled} />
              <span className="text-sm text-[var(--color-text)]">{enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>
        )}
      </SectionCard>

      {saveError && <p className="text-sm text-[var(--color-error)]">{saveError}</p>}
      <SaveBar isDirty={isDirty} isSaving={saving} onSave={handleSave} />
    </div>
  )
}

// ── Property config section ────────────────────────────────────────────────────

function PropertyConfigSection({ propertyId }: { propertyId: number }) {
  const { admin } = useAdminAuth()
  const qc = useQueryClient()
  const isAdmin = admin?.role === 'admin' || admin?.role === 'super'

  const { data, isLoading } = useQuery({
    queryKey: ['dp-property', propertyId],
    queryFn: () => apiClient.getPropertyDataProviderConfig(propertyId),
  })

  const propData = data?.propertyConfig ?? null
  const orgData = data?.orgConfig ?? null
  const sysData = data?.systemConfig ?? null
  // orgData null means org has no explicit config row but may still inherit from system.
  // Org level is accessible when orgServiceDisabled is not set AND either the org has its own
  // config row OR the system is open (so the org can inherit from system).
  const orgAccessible = !propData?.orgServiceDisabled && (orgData !== null || (sysData?.openToAll ?? true))

  const [useOrg, setUseOrg] = useState(true)
  const [providerType, setProviderType] = useState<DataProviderType>('dataforseo')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [refreshIntervalDays, setRefreshIntervalDays] = useState<number | null>(null)
  const [orgServiceDisabled, setOrgServiceDisabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (propData) {
      setUseOrg(propData.useOrg)
      setProviderType(propData.providerType ?? 'dataforseo')
      setRefreshIntervalDays(propData.refreshIntervalDays)
      setOrgServiceDisabled(propData.orgServiceDisabled)
    }
  }, [propData])

  const isDirty = (
    useOrg !== (propData?.useOrg ?? true) ||
    orgServiceDisabled !== (propData?.orgServiceDisabled ?? false) ||
    (!useOrg && (
      providerType !== (propData?.providerType ?? 'dataforseo') ||
      login !== '' ||
      password !== '' ||
      refreshIntervalDays !== (propData?.refreshIntervalDays ?? null)
    ))
  )

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const body: Record<string, unknown> = { useOrg, orgServiceDisabled }
      if (!useOrg) {
        body.providerType = providerType
        if (login) body.login = login
        if (password) body.password = password
        if (refreshIntervalDays !== null) body.refreshIntervalDays = refreshIntervalDays
      }
      await apiClient.updatePropertyDataProviderConfig(propertyId, body)
      qc.invalidateQueries({ queryKey: ['dp-property', propertyId] })
      setLogin('')
      setPassword('')
    } catch {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Loading…</div>

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Data Provider</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Hotel score enrichment configuration for this property.</p>
      </div>

      <ScorePanel propertyId={propertyId} />

      {isAdmin && (
        <SectionCard title="Org Access">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Block org access for this property</p>
              <p className="text-xs text-[var(--color-text-muted)]">When on, this property cannot use org-level credentials.</p>
            </div>
            <Toggle checked={orgServiceDisabled} onChange={setOrgServiceDisabled} />
          </div>
        </SectionCard>
      )}

      <SectionCard title="Configuration">
        {orgAccessible && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Use org configuration</p>
              <p className="text-xs text-[var(--color-text-muted)]">Inherit provider type and credentials from the organization level.</p>
            </div>
            <Toggle checked={useOrg} onChange={setUseOrg} />
          </div>
        )}

        {(useOrg && orgAccessible) ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm">
            <p className="font-medium text-[var(--color-text)] mb-1">Inheriting from organization</p>
            <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
              <p>Provider: {orgData?.providerType ?? sysData?.providerType ?? 'dataforseo'}</p>
              {(orgData?.refreshIntervalDays ?? sysData?.refreshIntervalDays) != null && (
                <p>Refresh interval: {orgData?.refreshIntervalDays ?? sysData?.refreshIntervalDays} days</p>
              )}
              {(orgData?.loginSet || sysData?.loginSet) && <p>Login: configured ✓</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!orgAccessible && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                Org access is not available for this property. Configure your own credentials below.
              </div>
            )}
            <ProviderTypeSelect value={providerType} onChange={setProviderType} />
            <CredentialFields
              loginSet={propData?.loginSet ?? false}
              passwordMasked={propData?.passwordMasked ?? null}
              login={login}
              password={password}
              onLoginChange={setLogin}
              onPasswordChange={setPassword}
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Refresh Interval (days)</label>
              <input
                type="number"
                min={1}
                value={refreshIntervalDays ?? ''}
                onChange={e => setRefreshIntervalDays(e.target.value ? Number(e.target.value) : null)}
                placeholder="Leave blank to inherit default"
                className={inputCls}
              />
            </div>
          </div>
        )}
      </SectionCard>

      <GoogleSection propertyId={propertyId} propertyName={data?.propertyName ?? null} />

      <TripAdvisorSection propertyId={propertyId} propertyName={data?.propertyName ?? null} />

      {saveError && <p className="text-sm text-[var(--color-error)]">{saveError}</p>}
      <SaveBar isDirty={isDirty} isSaving={saving} onSave={handleSave} />
    </div>
  )
}

// ── Page root ──────────────────────────────────────────────────────────────────

export default function DataProviderPage() {
  const { admin } = useAdminAuth()
  const { propertyId, orgId } = useAdminProperty()

  const isSuper = admin?.role === 'super'
  const isSystemLevel = isSuper && orgId === null

  if (isSystemLevel) return <SystemConfigSection />
  if (propertyId !== null) return <PropertyConfigSection propertyId={propertyId} />
  return <OrgConfigSection orgId={orgId} />
}
