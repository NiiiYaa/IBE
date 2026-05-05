'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import { SaveBar } from '../../design/components'
import type { DataProviderType, SystemDataProviderConfig, OrgDataProviderConfig } from '@ibe/shared'

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
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Login (email)</label>
        {loginSet && (
          <p className="mb-1 text-xs text-[var(--color-text-muted)]">Login configured. Enter a new value to replace it.</p>
        )}
        <input
          type="text"
          value={login}
          onChange={e => onLoginChange(e.target.value)}
          placeholder={loginSet ? 'Enter new login to replace…' : 'DataForSEO login email'}
          className={inputCls}
          autoComplete="off"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Password</label>
        {passwordMasked && (
          <p className="mb-1 text-xs text-[var(--color-text-muted)]">Password set ({passwordMasked}). Leave blank to keep existing.</p>
        )}
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

// ── Refresh button ─────────────────────────────────────────────────────────────

type RefreshStatus = 'idle' | 'refreshing' | 'done' | 'error'

function RefreshButton({ propertyId, onRefreshed }: { propertyId: number; onRefreshed: () => void }) {
  const [status, setStatus] = useState<RefreshStatus>('idle')

  async function run() {
    setStatus('refreshing')
    try {
      await apiClient.refreshDataProviderProperty(propertyId)
      setStatus('done')
      onRefreshed()
      setTimeout(() => setStatus('idle'), 3000)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 4000)
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

function ScorePanel({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['dp-property', propertyId],
    queryFn: () => apiClient.getPropertyDataProviderConfig(propertyId),
  })
  const score = data?.score

  const statusColors: Record<string, string> = {
    idle: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
    fetching: 'bg-amber-100 text-amber-700',
    done: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
    error: 'bg-[var(--color-error)]/10 text-[var(--color-error)]',
  }

  return (
    <SectionCard title="Current Score">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {isLoading ? (
            <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
          ) : score ? (
            <>
              <div className="flex items-center gap-3">
                {score.score !== null
                  ? <span className="text-2xl font-bold text-[var(--color-text)]">{score.score.toFixed(1)}</span>
                  : <span className="text-sm text-[var(--color-text-muted)]">No score</span>
                }
                {score.reviewCount !== null && (
                  <span className="text-sm text-[var(--color-text-muted)]">{score.reviewCount.toLocaleString()} reviews</span>
                )}
                <span className={['rounded-full px-2 py-0.5 text-xs font-medium', statusColors[score.status] ?? statusColors.idle].join(' ')}>
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
    enabled !== data.enabled
  )

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      await apiClient.updateSystemDataProviderConfig({ openToAll, providerType, refreshIntervalDays, enabled })
      qc.invalidateQueries({ queryKey: ['dp-system'] })
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
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">System credentials are configured via environment variables, not stored in the database.</p>
        <div className="space-y-2 text-sm">
          <p className="text-[var(--color-text-muted)]">Login: <span className="font-mono">DATAFORSEO_LOGIN</span></p>
          <p className="text-[var(--color-text-muted)]">Password: <span className="font-mono">DATAFORSEO_PASSWORD</span></p>
        </div>
      </SectionCard>

      {saveError && <p className="text-sm text-[var(--color-error)]">{saveError}</p>}
      <SaveBar isDirty={isDirty} isSaving={saving} onSave={handleSave} />
    </div>
  )
}

// ── Org config section ─────────────────────────────────────────────────────────

function OrgConfigSection() {
  const { admin } = useAdminAuth()
  const qc = useQueryClient()
  const isSuper = admin?.role === 'super'

  const { data, isLoading } = useQuery({
    queryKey: ['dp-global'],
    queryFn: () => apiClient.getOrgDataProviderConfig(),
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
      await apiClient.updateOrgDataProviderConfig(body)
      qc.invalidateQueries({ queryKey: ['dp-global'] })
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
  const orgAccessible = !!(orgData && !propData?.orgServiceDisabled)

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

  const isDirty = !!propData && (
    useOrg !== propData.useOrg ||
    orgServiceDisabled !== propData.orgServiceDisabled ||
    (!useOrg && (
      providerType !== (propData.providerType ?? 'dataforseo') ||
      login !== '' ||
      password !== '' ||
      refreshIntervalDays !== propData.refreshIntervalDays
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
            {orgData && (
              <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
                <p>Provider: {orgData.providerType ?? 'dataforseo'}</p>
                {orgData.refreshIntervalDays !== null && <p>Refresh interval: {orgData.refreshIntervalDays} days</p>}
                {orgData.loginSet && <p>Login: configured ✓</p>}
              </div>
            )}
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
  return <OrgConfigSection />
}
