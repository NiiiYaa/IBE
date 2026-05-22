'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { apiClient } from '@/lib/api-client'
import type {
  Cluster, ClusterDetail, ClusterRole,
  HotelClusterRow, AdminClusterSummary,
} from '@ibe/shared'

type Tab = 'Configurations' | 'Hotels' | 'Users'
const TABS: Tab[] = ['Configurations', 'Hotels', 'Users']

const ROLES: ClusterRole[] = ['admin', 'user', 'observer']
const ROLE_LABELS: Record<ClusterRole, string> = {
  admin: 'Admin',
  user: 'User',
  observer: 'Observer',
}

function inputClass(...extra: string[]) {
  return [
    'rounded-lg border border-[var(--color-border)] bg-[var(--color-background,#fff)]',
    'px-3 py-1.5 text-sm text-[var(--color-text)] outline-none',
    'focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]',
    ...extra,
  ].join(' ')
}

// ─── ClusterCard ──────────────────────────────────────────────────────────────

function ClusterCard({
  cluster, orgId, onChanged,
}: {
  cluster: Cluster
  orgId: number | null
  onChanged: () => void
}) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(cluster.name)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['cluster-detail', cluster.id],
    queryFn: () => apiClient.getClusterDetail(cluster.id, orgId ?? undefined),
    enabled: expanded,
  })
  const detail = detailQuery.data

  const hotelsQuery = useQuery({
    queryKey: ['clusters-hotels', orgId],
    queryFn: () => apiClient.listClustersHotels(orgId ?? undefined),
    enabled: expanded,
  })
  const usersQuery = useQuery({
    queryKey: ['clusters-users', orgId],
    queryFn: () => apiClient.listClustersUsers(orgId ?? undefined),
    enabled: expanded,
  })

  const [addHotelId, setAddHotelId] = useState('')
  const [addUserId, setAddUserId] = useState('')
  const [addUserRole, setAddUserRole] = useState<ClusterRole>('user')

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['clusters', orgId] })
    void qc.invalidateQueries({ queryKey: ['cluster-detail', cluster.id] })
    void qc.invalidateQueries({ queryKey: ['clusters-hotels', orgId] })
    void qc.invalidateQueries({ queryKey: ['clusters-users', orgId] })
    onChanged()
  }

  const renameMutation = useMutation({
    mutationFn: () => apiClient.updateCluster(cluster.id, { name: nameInput.trim() }, orgId ?? undefined),
    onSuccess: () => { setEditing(false); invalidate() },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Save failed'),
  })

  const statusMutation = useMutation({
    mutationFn: () => cluster.status === 'active'
      ? apiClient.deactivateCluster(cluster.id, orgId ?? undefined)
      : apiClient.activateCluster(cluster.id, orgId ?? undefined),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteCluster(cluster.id, orgId ?? undefined),
    onSuccess: () => { setDeleteConfirm(false); invalidate() },
  })

  const addHotelMutation = useMutation({
    mutationFn: () => apiClient.addHotelToCluster(cluster.id, { propertyId: parseInt(addHotelId, 10) }, orgId ?? undefined),
    onSuccess: () => { setAddHotelId(''); invalidate() },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Failed to add hotel'),
  })

  const removeHotelMutation = useMutation({
    mutationFn: (propertyId: number) => apiClient.removeHotelFromCluster(cluster.id, propertyId, orgId ?? undefined),
    onSuccess: invalidate,
  })

  const addUserMutation = useMutation({
    mutationFn: () => apiClient.addUserToCluster(cluster.id, { adminUserId: parseInt(addUserId, 10), role: addUserRole }, orgId ?? undefined),
    onSuccess: () => { setAddUserId(''); invalidate() },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Failed to add user'),
  })

  const changeRoleMutation = useMutation({
    mutationFn: ({ adminUserId, role }: { adminUserId: number; role: ClusterRole }) =>
      apiClient.updateUserClusterRole(cluster.id, adminUserId, { role }, orgId ?? undefined),
    onSuccess: invalidate,
  })

  const removeUserMutation = useMutation({
    mutationFn: (adminUserId: number) => apiClient.removeUserFromCluster(cluster.id, adminUserId, orgId ?? undefined),
    onSuccess: invalidate,
  })

  const assignedHotelIds = new Set(detail?.hotels.map(h => h.propertyId) ?? [])
  const assignedUserIds = new Set(detail?.users.map(u => u.adminUserId) ?? [])
  const availableHotels = (hotelsQuery.data ?? []).filter(h => !assignedHotelIds.has(h.propertyId))
  const availableUsers = (usersQuery.data ?? []).filter(u => !assignedUserIds.has(u.adminUserId))

  const statusDot = cluster.status === 'active'
    ? 'bg-green-500'
    : 'bg-[var(--color-text-muted)]'

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${statusDot}`} />
        {editing ? (
          <input
            className={inputClass('flex-1')}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') renameMutation.mutate(); if (e.key === 'Escape') setEditing(false) }}
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-[var(--color-text)]">
            {cluster.name}
            <span className="ml-2 text-xs text-[var(--color-text-muted)]">
              {cluster.hotelCount} hotel{cluster.hotelCount !== 1 ? 's' : ''} · {cluster.userCount} user{cluster.userCount !== 1 ? 's' : ''}
            </span>
          </span>
        )}
        {editing ? (
          <>
            <button type="button" onClick={() => renameMutation.mutate()} disabled={renameMutation.isPending}
              className="text-xs text-[var(--color-primary)] hover:opacity-80">Save</button>
            <button type="button" onClick={() => setEditing(false)}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Cancel</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => { setEditing(true); setNameInput(cluster.name) }}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Edit</button>
            <button type="button" onClick={() => setExpanded(v => !v)}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              {expanded ? '▴' : '▾'}
            </button>
          </>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[var(--color-border)] px-4 py-3 space-y-4">
          {detailQuery.isLoading ? (
            <div className="h-8 animate-pulse rounded bg-[var(--color-border)]" />
          ) : (
            <>
              {/* Hotels */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Hotels ({detail?.hotels.length ?? 0})
                  </p>
                </div>
                {detail?.hotels.map(h => (
                  <div key={h.propertyId} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text)]">{h.propertyName}</span>
                    <button type="button" onClick={() => removeHotelMutation.mutate(h.propertyId)}
                      className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error,#dc2626)]">✕</button>
                  </div>
                ))}
                {availableHotels.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <select value={addHotelId} onChange={e => setAddHotelId(e.target.value)} className={inputClass('flex-1')}>
                      <option value="">Select hotel…</option>
                      {availableHotels.map(h => (
                        <option key={h.propertyId} value={h.propertyId}>{h.propertyName}</option>
                      ))}
                    </select>
                    <button type="button" disabled={!addHotelId || addHotelMutation.isPending}
                      onClick={() => addHotelMutation.mutate()}
                      className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs text-white disabled:opacity-50">
                      Add
                    </button>
                  </div>
                )}
              </div>

              {/* Users */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Users ({detail?.users.length ?? 0})
                </p>
                {detail?.users.map(u => (
                  <div key={u.adminUserId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-[var(--color-text)]">{u.name}</span>
                    <select
                      value={u.role}
                      onChange={e => changeRoleMutation.mutate({ adminUserId: u.adminUserId, role: e.target.value as ClusterRole })}
                      className={inputClass('text-xs py-1')}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    <button type="button" onClick={() => removeUserMutation.mutate(u.adminUserId)}
                      className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error,#dc2626)]">✕</button>
                  </div>
                ))}
                {availableUsers.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <select value={addUserId} onChange={e => setAddUserId(e.target.value)} className={inputClass('flex-1')}>
                      <option value="">Select user…</option>
                      {availableUsers.map(u => (
                        <option key={u.adminUserId} value={u.adminUserId}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                    <select value={addUserRole} onChange={e => setAddUserRole(e.target.value as ClusterRole)} className={inputClass()}>
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    <button type="button" disabled={!addUserId || addUserMutation.isPending}
                      onClick={() => addUserMutation.mutate()}
                      className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs text-white disabled:opacity-50">
                      Add
                    </button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-border)]">
                <button type="button" onClick={() => statusMutation.mutate()} disabled={statusMutation.isPending}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50">
                  {cluster.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
                {deleteConfirm ? (
                  <>
                    <span className="text-xs text-[var(--color-error,#dc2626)]">Delete this cluster?</span>
                    <button type="button" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
                      className="text-xs text-[var(--color-error,#dc2626)] font-semibold">Yes, delete</button>
                    <button type="button" onClick={() => setDeleteConfirm(false)}
                      className="text-xs text-[var(--color-text-muted)]">Cancel</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setDeleteConfirm(true)}
                    className="text-xs text-[var(--color-error,#dc2626)]">Delete</button>
                )}
              </div>
            </>
          )}
          {err && <p className="text-xs text-[var(--color-error,#dc2626)]">{err}</p>}
        </div>
      )}
    </div>
  )
}

// ─── ConfigurationsTab ────────────────────────────────────────────────────────

function ConfigurationsTab({ orgId }: { orgId: number | null }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [addErr, setAddErr] = useState<string | null>(null)

  const clustersQuery = useQuery({
    queryKey: ['clusters', orgId],
    queryFn: () => apiClient.listClusters(orgId ?? undefined),
  })

  const createMutation = useMutation({
    mutationFn: () => apiClient.createCluster({ name: newName.trim() }, orgId ?? undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clusters', orgId] })
      setNewName('')
      setShowAdd(false)
      setAddErr(null)
    },
    onError: (e) => setAddErr(e instanceof Error ? e.message : 'Create failed'),
  })

  const clusters = clustersQuery.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-muted)]">{clusters.length} cluster{clusters.length !== 1 ? 's' : ''}</p>
        {!showAdd && (
          <button type="button" onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-background,#f9fafb)] transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New cluster
          </button>
        )}
      </div>

      {showAdd && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <input
            className={inputClass('flex-1')}
            placeholder="Cluster name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createMutation.mutate(); if (e.key === 'Escape') setShowAdd(false) }}
            autoFocus
          />
          <button type="button" onClick={() => createMutation.mutate()} disabled={!newName.trim() || createMutation.isPending}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm text-white disabled:opacity-50">
            Create
          </button>
          <button type="button" onClick={() => { setShowAdd(false); setAddErr(null) }}
            className="text-sm text-[var(--color-text-muted)]">Cancel</button>
        </div>
      )}
      {addErr && <p className="text-xs text-[var(--color-error,#dc2626)]">{addErr}</p>}

      {clustersQuery.isLoading ? (
        <div className="h-12 animate-pulse rounded-xl bg-[var(--color-border)]" />
      ) : clusters.length === 0 ? (
        <p className="text-sm italic text-[var(--color-text-muted)]">No clusters yet. Create one to get started.</p>
      ) : (
        clusters.map(cluster => (
          <ClusterCard
            key={cluster.id}
            cluster={cluster}
            orgId={orgId}
            onChanged={() => void qc.invalidateQueries({ queryKey: ['clusters', orgId] })}
          />
        ))
      )}
    </div>
  )
}

// ─── Placeholder tabs (filled in Tasks 11-12) ─────────────────────────────────

function HotelsTab({ orgId }: { orgId: number | null }) {
  const hotelsQuery = useQuery({
    queryKey: ['clusters-hotels', orgId],
    queryFn: () => apiClient.listClustersHotels(orgId ?? undefined),
  })
  const clustersQuery = useQuery({
    queryKey: ['clusters', orgId],
    queryFn: () => apiClient.listClusters(orgId ?? undefined),
  })
  const qc = useQueryClient()
  const [managingId, setManagingId] = useState<number | null>(null)
  const [addClusterId, setAddClusterId] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const addMutation = useMutation({
    mutationFn: ({ propertyId }: { propertyId: number }) =>
      apiClient.addHotelToCluster(parseInt(addClusterId, 10), { propertyId }, orgId ?? undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clusters-hotels', orgId] })
      setAddClusterId('')
      setErr(null)
    },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Failed'),
  })

  const removeMutation = useMutation({
    mutationFn: ({ clusterId, propertyId }: { clusterId: number; propertyId: number }) =>
      apiClient.removeHotelFromCluster(clusterId, propertyId, orgId ?? undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clusters-hotels', orgId] }),
  })

  const hotels = hotelsQuery.data ?? []
  const clusters = clustersQuery.data ?? []

  if (hotelsQuery.isLoading) return <div className="h-12 animate-pulse rounded-xl bg-[var(--color-border)]" />

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-muted)]">Hotel</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-muted)]">Clusters</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-muted)]"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {hotels.map(hotel => {
            const isManaging = managingId === hotel.propertyId
            const assignedClusterIds = new Set(hotel.clusters.map(c => c.id))
            const availableClusters = clusters.filter(c => !assignedClusterIds.has(c.id) && c.status === 'active')
            return (
              <tr key={hotel.propertyId}>
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">{hotel.propertyName}</td>
                <td className="px-4 py-3">
                  {hotel.clusters.length === 0 ? (
                    <span className="text-xs italic text-[var(--color-text-muted)]">Unassigned</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {hotel.clusters.map(c => (
                        <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs text-[var(--color-primary)]">
                          {c.name}
                          <button type="button" onClick={() => removeMutation.mutate({ clusterId: c.id, propertyId: hotel.propertyId })}
                            className="hover:text-[var(--color-error,#dc2626)]">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isManaging ? (
                    <div className="flex items-center gap-2">
                      <select value={addClusterId} onChange={e => setAddClusterId(e.target.value)} className={inputClass('text-xs py-1')}>
                        <option value="">Select cluster…</option>
                        {availableClusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button type="button" disabled={!addClusterId || addMutation.isPending}
                        onClick={() => addMutation.mutate({ propertyId: hotel.propertyId })}
                        className="text-xs text-[var(--color-primary)] disabled:opacity-50">Add</button>
                      <button type="button" onClick={() => { setManagingId(null); setAddClusterId(''); setErr(null) }}
                        className="text-xs text-[var(--color-text-muted)]">Done</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setManagingId(hotel.propertyId); setAddClusterId('') }}
                      className="text-xs text-[var(--color-primary)] hover:opacity-80">Manage</button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {err && <p className="px-4 py-2 text-xs text-[var(--color-error,#dc2626)]">{err}</p>}
    </div>
  )
}

function UsersTab({ orgId }: { orgId: number | null }) {
  return <p className="text-sm text-[var(--color-text-muted)] italic">Loading users…</p>
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClustersPage() {
  const { admin } = useAdminAuth()
  const [activeTab, setActiveTab] = useState<Tab>('Configurations')

  if (!admin) return null

  const isSuper = admin.role === 'super'
  const orgId = isSuper ? null : admin.organizationId   // super passes orgId via query when needed

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Clusters</h1>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab
                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)] -mb-px'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Configurations' && <ConfigurationsTab orgId={orgId} />}
      {activeTab === 'Hotels' && <HotelsTab orgId={orgId} />}
      {activeTab === 'Users' && <UsersTab orgId={orgId} />}
    </main>
  )
}
