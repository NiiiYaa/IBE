'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { useProperty } from '@/hooks/use-property'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import type { PropertyMode, PropertyRecord, PropertyUserAssignment, ImportSummary } from '@ibe/shared'

const DEFAULT_PROPERTY_ID = Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID'])

// ── Sub-components ────────────────────────────────────────────────────────────

function ModeSelector({ mode, onChange }: { mode: PropertyMode; onChange: (m: PropertyMode) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-1">
      {(['single', 'multi'] as PropertyMode[]).map(m => (
        <button key={m} onClick={() => onChange(m)}
          className={['flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            mode === m ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm'
                       : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'].join(' ')}>
          {m === 'single' ? 'Single property' : 'Multi-property'}
        </button>
      ))}
    </div>
  )
}

type SyncStatus = 'idle' | 'syncing' | 'done' | 'error'
type SearchStatus = 'idle' | 'searching' | 'found' | 'empty' | 'error'

function SyncButton({ propertyId, lastSyncedAt, onSynced }: {
  propertyId: number
  lastSyncedAt: string | null
  onSynced: () => void
}) {
  const [status, setStatus] = useState<SyncStatus>('idle')

  async function run() {
    setStatus('syncing')
    try {
      await apiClient.syncProperty(propertyId)
      setStatus('done')
      onSynced()
      setTimeout(() => setStatus('idle'), 3000)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 4000)
    }
  }

  const syncTitle = lastSyncedAt
    ? `Last synced ${formatRelative(lastSyncedAt)}`
    : 'Never synced'

  if (status === 'syncing') return (
    <span className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)]">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      Syncing…
    </span>
  )
  if (status === 'done') return (
    <span className="flex h-7 items-center gap-1 rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 px-3 text-xs font-medium text-[var(--color-success)]">
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
      Synced
    </span>
  )
  if (status === 'error') return (
    <span className="flex h-7 items-center gap-1 rounded-lg border border-[var(--color-error)]/40 bg-[var(--color-error)]/10 px-3 text-xs font-medium text-[var(--color-error)]">
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
      Failed
    </span>
  )
  return (
    <button onClick={run} title={syncTitle}
      className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      HG Sync
    </button>
  )
}

function SearchTestButton({ propertyId }: { propertyId: number }) {
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [count, setCount] = useState(0)

  async function run() {
    setStatus('searching')
    try {
      const today = new Date()
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const checkin = today.toISOString().slice(0, 10)
      const checkout = tomorrow.toISOString().slice(0, 10)
      const qs = new URLSearchParams({ hotelId: String(propertyId), checkIn: checkin, checkOut: checkout, 'rooms[0][adults]': '2' })
      const res = await apiClient.search(qs)
      const total = res.results.reduce((s, r) => s + r.rooms.length, 0)
      setCount(total)
      setStatus(total > 0 ? 'found' : 'empty')
      setTimeout(() => setStatus('idle'), 5000)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 4000)
    }
  }

  if (status === 'searching') return (
    <span className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)]">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      Searching…
    </span>
  )
  if (status === 'found') return (
    <span className="flex h-7 items-center gap-1 rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 px-3 text-xs font-medium text-[var(--color-success)]">
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
      {count} result{count !== 1 ? 's' : ''}
    </span>
  )
  if (status === 'empty') return (
    <span className="flex h-7 items-center rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)]">No results</span>
  )
  if (status === 'error') return (
    <span className="flex h-7 items-center gap-1 rounded-lg border border-[var(--color-error)]/40 bg-[var(--color-error)]/10 px-3 text-xs font-medium text-[var(--color-error)]">
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
      Failed
    </span>
  )
  return (
    <button onClick={run} title="Test search availability"
      className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      Search test
    </button>
  )
}

function SubdomainPanel({ record, onClose, onSaved }: { record: PropertyRecord; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subdomain, setSubdomain] = useState(record.subdomain ?? '')

  async function save() {
    setSaving(true); setError(null)
    try {
      await apiClient.setPropertySubdomain(record.id, subdomain.trim() || null)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  const inputClass = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none'

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-primary-light)] px-5 py-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Platform subdomain — guests access via <code>subdomain.hyperguest.net</code>
      </p>
      <div className="flex items-center gap-2">
        <input
          className={inputClass}
          placeholder="e.g. grandhotel"
          value={subdomain}
          onChange={e => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        />
        <span className="shrink-0 text-sm text-[var(--color-text-muted)]">.hyperguest.net</span>
      </div>
      {subdomain && (
        <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
          URL: <span className="font-mono">https://{subdomain}.hyperguest.net</span>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-[var(--color-error)]">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={saving}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onClose} className="rounded-lg px-4 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          Cancel
        </button>
      </div>
    </div>
  )
}

function HGCredentialsPanel({ record, onClose, onSaved }: { record: PropertyRecord; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bearerToken, setBearerToken] = useState('')
  const [staticDomain, setStaticDomain] = useState(record.hyperGuestStaticDomain ?? '')
  const [searchDomain, setSearchDomain] = useState(record.hyperGuestSearchDomain ?? '')
  const [bookingDomain, setBookingDomain] = useState(record.hyperGuestBookingDomain ?? '')

  async function save() {
    setSaving(true); setError(null)
    try {
      await apiClient.setPropertyHGCredentials(record.id, {
        bearerToken: bearerToken || undefined,
        staticDomain: staticDomain || undefined,
        searchDomain: searchDomain || undefined,
        bookingDomain: bookingDomain || undefined,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  const inputClass = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none'

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-primary-light)] px-5 py-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        HyperGuest credentials — overrides org-level settings for this property
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Bearer token {record.hyperGuestBearerToken && <span className="ml-1 text-[var(--color-text-muted)]/60">(current: {record.hyperGuestBearerToken})</span>}
          </label>
          <input className={inputClass} placeholder="Leave blank to keep current" value={bearerToken} onChange={e => setBearerToken(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Static domain</label>
          <input className={inputClass} placeholder="hg-static.hyperguest.com" value={staticDomain} onChange={e => setStaticDomain(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Search domain</label>
          <input className={inputClass} placeholder="search-api.hyperguest.io" value={searchDomain} onChange={e => setSearchDomain(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Booking domain</label>
          <input className={inputClass} placeholder="book-api.hyperguest.io" value={bookingDomain} onChange={e => setBookingDomain(e.target.value)} />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--color-error)]">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={saving}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onClose} className="rounded-lg px-4 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          Cancel
        </button>
      </div>
    </div>
  )
}

function AssignUsersPanel({ record, onClose }: { record: PropertyRecord; onClose: () => void }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: users = [], isLoading } = useQuery<PropertyUserAssignment[]>({
    queryKey: ['property-users', record.id],
    queryFn: () => apiClient.getPropertyUsers(record.id),
    refetchOnWindowFocus: false,
  })

  const [checked, setChecked] = useState<Set<number> | null>(null)
  const effectiveChecked = checked ?? new Set(users.filter(u => u.assigned).map(u => u.id))

  function toggle(id: number) {
    const next = new Set(effectiveChecked)
    next.has(id) ? next.delete(id) : next.add(id)
    setChecked(next)
  }

  async function save() {
    setSaving(true); setError(null)
    try {
      await apiClient.setPropertyUsers(record.id, [...effectiveChecked])
      void qc.invalidateQueries({ queryKey: ['admin-users'] })
      onClose()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-primary-light)] px-5 py-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Assign to users (role: User)
      </p>
      {isLoading ? (
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-border)]" />
      ) : users.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">No users with role "User" in this organization.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {users.map(u => {
            const isChecked = effectiveChecked.has(u.id)
            return (
              <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-xs hover:border-[var(--color-primary)]">
                <input type="checkbox" checked={isChecked} onChange={() => toggle(u.id)}
                  className="accent-[var(--color-primary)]" />
                <span className="font-medium text-[var(--color-text)]">{u.name}</span>
                <span className="text-[var(--color-text-muted)]">{u.email}</span>
              </label>
            )
          })}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-[var(--color-error)]">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={saving || users.length === 0}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onClose} className="rounded-lg px-4 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          Cancel
        </button>
      </div>
    </div>
  )
}

function PropertyRow({
  record, onSetDefault, showDefault, onRefresh,
}: {
  record: PropertyRecord
  onSetDefault?: () => void
  showDefault?: boolean
  onRefresh: () => void
}) {
  const qc = useQueryClient()
  const { data: property, isLoading } = useProperty(record.propertyId)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [showCreds, setShowCreds] = useState(false)
  const [showSubdomain, setShowSubdomain] = useState(false)
  const isDemo = record.isDemo ?? false

  const activeMutation = useMutation({
    mutationFn: (active: boolean) => apiClient.setPropertyActive(record.id, active),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-properties'] })
      void qc.invalidateQueries({ queryKey: ['admin-super-properties'] })
    },
  })

  async function handleDelete() {
    setDeleting(true)
    try {
      await apiClient.removeProperty(record.id)
      void qc.invalidateQueries({ queryKey: ['admin-properties'] })
      void qc.invalidateQueries({ queryKey: ['admin-super-properties'] })
    } finally { setDeleting(false) }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      {isDemo && (
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-amber-50 px-5 py-2.5 text-xs text-amber-700">
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          This is a demo property. Add your own HyperGuest property to get started — the demo will disappear once you do.
        </div>
      )}
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-sm font-bold text-[var(--color-primary)]">
            {record.propertyId}
          </div>
          <div className="min-w-0">
            {isLoading ? (
              <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-border)]" />
            ) : (
              <p className="truncate font-medium text-[var(--color-text)]">{property?.name ?? `Property ${record.propertyId}`}</p>
            )}
            <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
              HyperGuest ID: {record.propertyId}
              {record.orgName && (
                <span className="ml-2 text-[var(--color-text-muted)]/70">· {record.orgName}</span>
              )}
              {isDemo && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Demo
                </span>
              )}
              {!isDemo && record.isDefault && (
                <span className="ml-2 rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
                  Default
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {/* Row 1: view / sync */}
          <div className="flex items-center gap-1.5">
            <a
              href={record.subdomain
                ? `https://${record.subdomain}.hyperguest.net`
                : `https://ibe-web.onrender.com/?hotelId=${record.propertyId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              title={record.subdomain ? `https://${record.subdomain}.hyperguest.net` : 'Open booking engine'}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              IBE
            </a>
            <SearchTestButton propertyId={record.propertyId} />
            <SyncButton propertyId={record.propertyId} lastSyncedAt={record.lastSyncedAt} onSynced={onRefresh} />
          </div>

          {/* Row 2: management (non-demo only) */}
          {!isDemo && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowSubdomain(v => !v)}
                className={['h-7 rounded-lg border px-3 text-xs transition-colors',
                  showSubdomain
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                ].join(' ')}
                title={record.subdomain ? `Subdomain: ${record.subdomain}.hyperguest.net` : 'Set subdomain'}
              >
                {record.subdomain ? `${record.subdomain}.hyperguest.net` : 'Set subdomain'}
              </button>

              <button
                onClick={() => setShowCreds(v => !v)}
                className={['h-7 rounded-lg border px-3 text-xs transition-colors',
                  showCreds
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                ].join(' ')}
              >
                HG credentials
              </button>

              <button
                onClick={() => activeMutation.mutate(!record.isActive)}
                disabled={activeMutation.isPending}
                title={record.isActive ? 'Disable property' : 'Enable property'}
                className={[
                  'h-7 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-50',
                  record.isActive
                    ? 'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                ].join(' ')}
              >
                {record.isActive ? 'Enabled' : 'Disabled'}
              </button>

              <button
                onClick={() => setShowAssign(v => !v)}
                className={['h-7 rounded-lg border px-3 text-xs transition-colors',
                  showAssign
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                ].join(' ')}
              >
                Assign users
              </button>

              {showDefault && !record.isDefault && onSetDefault && (
                <button onClick={onSetDefault}
                  className="h-7 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                  Set default
                </button>
              )}

              {deleteConfirm ? (
                <div className="flex items-center gap-1">
                  <button onClick={handleDelete} disabled={deleting}
                    className="h-7 rounded-lg bg-[var(--color-error)] px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {deleting ? '…' : 'Confirm delete'}
                  </button>
                  <button onClick={() => setDeleteConfirm(false)}
                    className="h-7 rounded-lg px-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setDeleteConfirm(true)}
                  className="h-7 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-error)] hover:text-[var(--color-error)]">
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showSubdomain && !isDemo && (
        <SubdomainPanel
          record={record}
          onClose={() => setShowSubdomain(false)}
          onSaved={onRefresh}
        />
      )}

      {showAssign && !isDemo && (
        <AssignUsersPanel record={record} onClose={() => setShowAssign(false)} />
      )}

      {showCreds && !isDemo && (
        <HGCredentialsPanel
          record={record}
          onClose={() => setShowCreds(false)}
          onSaved={onRefresh}
        />
      )}
    </div>
  )
}

function AddPropertyPanel({ onAdd, onImportDone, isPending, error }: { onAdd: (id: number) => void; onImportDone: () => void; isPending: boolean; error: string | null }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [newId, setNewId] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const importMutation = useMutation({
    mutationFn: (file: File) => apiClient.importProperties(file),
    onSuccess: (result) => { setImportSummary(result); if (result.successCount > 0) onImportDone() },
    onError: (err: Error) => setImportError(err.message),
  })

  function handleAdd() {
    const id = parseInt(newId, 10)
    if (isNaN(id) || id <= 0) { setLocalError('Enter a valid HyperGuest property ID'); return }
    setLocalError(null)
    onAdd(id)
    setNewId('')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportSummary(null)
    setImportError(null)
    importMutation.mutate(file)
    e.target.value = ''
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <div className="flex divide-x divide-[var(--color-border)]">

        {/* Left — add manually */}
        <div className="flex-1 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Add manually</p>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder={`e.g. ${DEFAULT_PROPERTY_ID}`}
              value={newId}
              onChange={e => { setNewId(e.target.value); setLocalError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
            />
            <button
              onClick={handleAdd}
              disabled={isPending}
              className="shrink-0 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
          {(localError ?? error) && (
            <p className="mt-2 text-xs text-[var(--color-error)]">{localError ?? error}</p>
          )}
        </div>

        {/* Right — import */}
        <div className="flex-1 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Import</p>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importMutation.isPending}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface)] disabled:opacity-50"
          >
            {importMutation.isPending ? 'Importing…' : 'CSV / Excel'}
          </button>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">One property ID per row</p>

          {importError && <p className="mt-2 text-xs text-[var(--color-error)]">{importError}</p>}

          {importSummary && (
            <div className="mt-3 text-xs">
              <p className="font-medium text-[var(--color-text)]">
                {importSummary.successCount} added
                {importSummary.failureCount > 0 && `, ${importSummary.failureCount} failed`}
              </p>
              {importSummary.failureCount > 0 && (
                <table className="mt-2 w-full">
                  <thead>
                    <tr className="text-left text-[var(--color-text-muted)]">
                      <th className="pb-1 pr-3 font-medium">Row</th>
                      <th className="pb-1 pr-3 font-medium">Value</th>
                      <th className="pb-1 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importSummary.results.filter(r => !r.succeeded).map(r => (
                      <tr key={r.row} className="border-t border-[var(--color-border)]">
                        <td className="py-1 pr-3 text-[var(--color-text-muted)]">{r.row}</td>
                        <td className="py-1 pr-3 font-mono">{r.value}</td>
                        <td className="py-1 text-[var(--color-error)]">{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PropertiesPage() {
  const qc = useQueryClient()
  const [addError, setAddError] = useState<string | null>(null)
  const { admin, isAuthenticated } = useAdminAuth()
  const isSuper = admin?.role === 'super'

  // Wait until admin role is confirmed before firing queries to avoid wrong endpoint
  const { data, isLoading } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: () => apiClient.listProperties(),
    enabled: isAuthenticated && !isSuper,
    staleTime: 30_000,
  })

  const { data: superData, isLoading: superLoading } = useQuery({
    queryKey: ['admin-super-properties'],
    queryFn: () => apiClient.listAllProperties(),
    enabled: isAuthenticated && isSuper,
    staleTime: 30_000,
  })

  const loading = !admin || (isSuper ? superLoading : isLoading)
  const mode = data?.mode ?? 'single'
  const showDemoProperty = data?.showDemoProperty ?? false
  const properties = isSuper ? (superData?.properties ?? []) : (data?.properties ?? [])

  const modeMutation = useMutation({
    mutationFn: (m: PropertyMode) => apiClient.setPropertyMode(m),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-properties'] }),
  })

  const addMutation = useMutation({
    mutationFn: (propertyId: number) => apiClient.addProperty(propertyId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-properties'] }); setAddError(null) },
    onError: (err: Error) => setAddError(err.message),
  })

  const defaultMutation = useMutation({
    mutationFn: (id: number) => apiClient.setDefaultProperty(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-properties'] }),
  })

  const demoMutation = useMutation({
    mutationFn: (enabled: boolean) => apiClient.setShowDemoProperty(enabled),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-properties'] }),
  })

  const realProperties = properties.filter(p => !p.isDemo)
  const canAddMore = !isSuper && (mode === 'multi' || realProperties.length === 0)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-2 text-xl font-semibold text-[var(--color-text)]">Properties</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        {isSuper ? 'All properties across all organizations.' : 'Configure the HyperGuest properties that power this IBE.'}
      </p>

      {!isSuper && (
        <>
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Mode</p>
            <ModeSelector mode={mode} onChange={m => modeMutation.mutate(m)} />
            {mode === 'multi' && (
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                In multi-property mode, guests can search across all active properties. The default property is used as the landing page.
              </p>
            )}
          </div>

          {canAddMore && (
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Add Properties</p>
              <AddPropertyPanel
                onAdd={id => addMutation.mutate(id)}
                onImportDone={() => void qc.invalidateQueries({ queryKey: ['admin-properties'] })}
                isPending={addMutation.isPending}
                error={addError}
              />
            </div>
          )}

          {!loading && realProperties.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Demo</p>
              <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">Show demo property</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    Include the demo hotel (HG ID 125346) alongside your properties. It does not count toward single/multi mode.
                  </p>
                </div>
                <button role="switch" aria-checked={showDemoProperty}
                  onClick={() => demoMutation.mutate(!showDemoProperty)}
                  className={['relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                    showDemoProperty ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
                  <span className={['pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
                    showDemoProperty ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--color-border)]" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map(r => (
            <PropertyRow key={`${r.orgId ?? 0}-${r.propertyId}`} record={r}
              showDefault={!isSuper && mode === 'multi'}
              onSetDefault={() => defaultMutation.mutate(r.id)}
              onRefresh={() => void qc.invalidateQueries({ queryKey: [isSuper ? 'admin-super-properties' : 'admin-properties'] })}
            />
          ))}
        </div>
      )}

    </div>
  )
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString()
}
