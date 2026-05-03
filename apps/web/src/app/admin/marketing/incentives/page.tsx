'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { IncentiveChainConfig, IncentiveItem, IncentivePackage, IncentivePropertyConfig, OrgRecord } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../../property-context'
import { useAdminAuth } from '@/hooks/use-admin-auth'

// ── Shared UI ──────────────────────────────────────────────────────────────────

type Tab = 'items' | 'packages' | 'assignments'

const TABS: { key: Tab; label: string }[] = [
  { key: 'items', label: 'Items Library' },
  { key: 'packages', label: 'Packages' },
  { key: 'assignments', label: 'Assignments' },
]

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 border-b border-[var(--color-border)] pb-0">
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={[
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            active === t.key
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

function SystemBadge() {
  return (
    <span className="ml-1.5 rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide bg-purple-100 text-purple-700 border border-purple-200">
      System
    </span>
  )
}

function VisibilityBadge({ label }: { label: string }) {
  return (
    <span className="ml-1 rounded px-1.5 py-px text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200">
      {label}
    </span>
  )
}

// ── Context bar ────────────────────────────────────────────────────────────────

function ContextBar({ isSystem, isSuper, orgId, isHotelLevel, propertyId }: { isSystem: boolean; isSuper: boolean; orgId: number | null; isHotelLevel: boolean; propertyId: number | null }) {
  const { data: orgs } = useQuery<OrgRecord[]>({
    queryKey: ['admin-orgs'],
    queryFn: () => apiClient.listOrgs(),
    enabled: isSuper && !isSystem && orgId !== null,
    staleTime: 60_000,
  })

  if (!isSuper) return null

  const orgLabel = orgId !== null
    ? (orgs?.find(o => o.id === orgId)?.name ?? '…') + ` (id: ${orgId})`
    : null

  const colorClass = isSystem
    ? 'border-purple-200 bg-purple-50 text-purple-800'
    : isHotelLevel
      ? 'border-green-200 bg-green-50 text-green-800'
      : 'border-blue-200 bg-blue-50 text-blue-800'

  return (
    <div className={`mb-4 rounded-lg border px-4 py-2.5 text-xs ${colorClass}`}>
      {isSystem ? (
        <>
          <span className="font-semibold">System level</span>
          <span className="ml-1.5 text-purple-600">— items and packages defined here can be shared with chains</span>
        </>
      ) : isHotelLevel ? (
        <>
          <span className="font-semibold">Hotel level</span>
          <span className="ml-1.5 text-green-700">
            — managing hotel #{propertyId} within {orgLabel ?? `org ${orgId}`}. Inherited items/packages can be enabled or disabled.
          </span>
        </>
      ) : (
        <>
          <span className="font-semibold">Chain level</span>
          <span className="ml-1.5 text-blue-600">
            — managing {orgLabel}. System items/packages marked &quot;Visible to chains&quot; appear below.
          </span>
        </>
      )}
    </div>
  )
}

// ── Chain-level enable toggle ──────────────────────────────────────────────────

function ChainEnableToggle({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const qKey = ['incentive-chain-config', orgId]

  const { data } = useQuery<IncentiveChainConfig>({
    queryKey: qKey,
    queryFn: () => apiClient.getIncentiveChainConfig(orgId),
  })

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => apiClient.setIncentiveChainEnabled(orgId, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  const enabled = data?.incentivesEnabled ?? true

  return (
    <div className={[
      'flex items-center justify-between rounded-lg border px-4 py-3',
      enabled ? 'border-[var(--color-border)] bg-[var(--color-surface)]' : 'border-amber-200 bg-amber-50',
    ].join(' ')}>
      <div>
        <span className="text-sm font-semibold text-[var(--color-text)]">Incentives enabled</span>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {enabled ? 'Incentives are active for this chain.' : 'Incentives are disabled — nothing will display to guests.'}
        </p>
      </div>
      <ToggleSwitch
        checked={enabled}
        onChange={v => mutation.mutate(v)}
        disabled={mutation.isPending}
      />
    </div>
  )
}

// ── Items Library Tab ─────────────────────────────────────────────────────────

function ItemsTab({ orgId, propertyId, isSystem, isSuper, isChainLevel, isHotelLevel }: { orgId: number | null; propertyId: number | null; isSystem: boolean; isSuper: boolean; isChainLevel: boolean; isHotelLevel: boolean }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const qKey = ['incentive-items', orgId ?? 'system', propertyId ?? 'none']

  const { data: items = [], isLoading } = useQuery<IncentiveItem[]>({
    queryKey: qKey,
    queryFn: () => apiClient.listIncentiveItems(orgId, isHotelLevel, propertyId ?? undefined),
  })

  const ownItems = items.filter(i => !i.isSystem)
  const systemItems = items.filter(i => i.isSystem)

  const createMutation = useMutation({
    mutationFn: () => apiClient.createIncentiveItem({
      text: text.trim(), sortOrder: ownItems.length, orgId,
      ...(isSystem ? { visibleToChains: true, visibleToHotels: true } : {}),
      ...(isChainLevel ? { visibleToHotels: true } : {}),
      ...(isHotelLevel && propertyId ? { propertyId } : {}),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qKey }); setText(''); setError(null) },
    onError: (e: Error) => setError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, text: t, isActive, visibleToChains, visibleToHotels, itemPropertyId }: { id: number; text?: string; isActive?: boolean; visibleToChains?: boolean; visibleToHotels?: boolean; itemPropertyId?: number }) => {
      const patch: { text?: string; isActive?: boolean; visibleToChains?: boolean; visibleToHotels?: boolean } = {}
      if (t !== undefined) patch.text = t
      if (isActive !== undefined) patch.isActive = isActive
      if (visibleToChains !== undefined) patch.visibleToChains = visibleToChains
      if (visibleToHotels !== undefined) patch.visibleToHotels = visibleToHotels
      return apiClient.updateIncentiveItem(id, patch, orgId, itemPropertyId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey })
      qc.invalidateQueries({ queryKey: ['incentive-packages', orgId ?? 'system'] })
      setEditingId(null); setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, itemPropertyId }: { id: number; itemPropertyId?: number }) => apiClient.deleteIncentiveItem(id, orgId, itemPropertyId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qKey }); setDeleteConfirm(null) },
  })

  const itemOverrideMutation = useMutation({
    mutationFn: ({ itemId, disabled }: { itemId: number; disabled: boolean }) =>
      apiClient.setChainItemOverride(itemId, orgId!, disabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  const propertyItemOverrideMutation = useMutation({
    mutationFn: ({ itemId, disabled }: { itemId: number; disabled: boolean }) =>
      apiClient.setPropertyItemOverride(itemId, propertyId!, disabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  function startEdit(item: IncentiveItem) { setEditingId(item.id); setEditText(item.text); setError(null) }

  function renderItem(item: IncentiveItem) {
    const isHotelOwn = isHotelLevel && item.propertyId != null && item.propertyId === propertyId
    const canEdit = isHotelOwn || (!isHotelLevel && (isSystem ? item.isSystem : !item.isSystem))
    const isChainDisabled = item.chainDisabled ?? false
    const isPropertyDisabled = !isHotelOwn && (item.propertyDisabled ?? false)
    const isDimmed = !item.isActive || isChainDisabled || isPropertyDisabled
    const itemPropertyId: number | undefined = isHotelOwn && item.propertyId != null ? item.propertyId : undefined
    const itemPropertyIdArg = itemPropertyId !== undefined ? { itemPropertyId } : {}
    return (
      <li key={item.id} className={['flex items-center gap-3 px-3 py-2.5', isDimmed ? 'opacity-50' : ''].join(' ')}>
        {editingId === item.id && canEdit ? (
          <>
            <input
              autoFocus
              type="text"
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && editText.trim()) updateMutation.mutate({ id: item.id, text: editText.trim(), ...itemPropertyIdArg })
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              onClick={() => { if (editText.trim()) updateMutation.mutate({ id: item.id, text: editText.trim(), ...itemPropertyIdArg }) }}
              disabled={!editText.trim() || updateMutation.isPending}
              className="text-xs font-medium text-[var(--color-primary)] hover:underline disabled:opacity-50"
            >Save</button>
            <button onClick={() => setEditingId(null)} className="text-xs text-[var(--color-text-muted)] hover:underline">Cancel</button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-[var(--color-text)]">
              {item.text}
              {item.isSystem && <SystemBadge />}
              {isHotelOwn && (
                <span className="ml-1.5 rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 border border-green-200">Hotel</span>
              )}
              {isChainDisabled && (
                <span className="ml-1 rounded px-1.5 py-px text-[10px] font-semibold uppercase bg-amber-50 text-amber-700 border border-amber-200">Disabled for chain</span>
              )}
              {item.isSystem && item.visibleToChains && <VisibilityBadge label="Visible to chains" />}
              {item.isSystem && item.visibleToHotels && <VisibilityBadge label="Visible to hotels" />}
              {!item.isSystem && !isHotelOwn && item.visibleToHotels && <VisibilityBadge label="Visible to hotels" />}
              {isPropertyDisabled && (
                <span className="ml-1 rounded px-1.5 py-px text-[10px] font-semibold uppercase bg-amber-50 text-amber-700 border border-amber-200">Disabled for hotel</span>
              )}
            </span>
            {/* Hotel-level enable/disable toggle for inherited items only (not hotel-own items) */}
            {isHotelLevel && !isHotelOwn && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <ToggleSwitch
                  checked={!isPropertyDisabled}
                  onChange={v => propertyItemOverrideMutation.mutate({ itemId: item.id, disabled: !v })}
                  disabled={propertyItemOverrideMutation.isPending}
                />
                Enabled
              </label>
            )}
            {/* Hotels visibility toggle — chain admin on own items */}
            {isChainLevel && !item.isSystem && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <ToggleSwitch
                  checked={item.visibleToHotels}
                  onChange={v => updateMutation.mutate({ id: item.id, visibleToHotels: v })}
                  disabled={updateMutation.isPending}
                />
                Hotels
              </label>
            )}
            {/* Chain-level disable toggle for system items — only in chain context */}
            {isChainLevel && item.isSystem && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <ToggleSwitch
                  checked={!isChainDisabled}
                  onChange={v => itemOverrideMutation.mutate({ itemId: item.id, disabled: !v })}
                  disabled={itemOverrideMutation.isPending}
                />
                Enabled
              </label>
            )}
            {/* System-level toggles: Active, Visible to chains, Visible to hotels */}
            {isSystem && item.isSystem && (
              <>
                <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <ToggleSwitch
                    checked={item.isActive}
                    onChange={v => updateMutation.mutate(
                      v ? { id: item.id, isActive: true, visibleToChains: true, visibleToHotels: true }
                        : { id: item.id, isActive: false, visibleToChains: false, visibleToHotels: false }
                    )}
                    disabled={updateMutation.isPending}
                  />
                  Active
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <ToggleSwitch
                    checked={item.visibleToChains}
                    onChange={v => updateMutation.mutate({ id: item.id, visibleToChains: v })}
                    disabled={updateMutation.isPending}
                  />
                  Chains
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <ToggleSwitch
                    checked={item.visibleToHotels}
                    onChange={v => updateMutation.mutate({ id: item.id, visibleToHotels: v })}
                    disabled={updateMutation.isPending}
                  />
                  Hotels
                </label>
              </>
            )}
            {canEdit && (
              <>
                <button onClick={() => startEdit(item)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Edit</button>
                {deleteConfirm === item.id ? (
                  <>
                    <button onClick={() => deleteMutation.mutate({ id: item.id, ...itemPropertyIdArg })} disabled={deleteMutation.isPending} className="text-xs font-medium text-[var(--color-error)] hover:underline">Confirm</button>
                    <button onClick={() => setDeleteConfirm(null)} className="text-xs text-[var(--color-text-muted)] hover:underline">Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setDeleteConfirm(item.id)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]">Delete</button>
                )}
              </>
            )}
          </>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">
        Build a library of incentive items. Text in <code className="rounded bg-[var(--color-background)] px-1 text-xs">&#123;curly braces&#125;</code> renders smaller and lighter.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && text.trim()) createMutation.mutate() }}
          placeholder="e.g. Early check-in / late check-out {(subject to availability)}"
          className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        />
        <button
          onClick={() => { if (text.trim()) createMutation.mutate() }}
          disabled={!text.trim() || createMutation.isPending}
          className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >Add</button>
      </div>
      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No items yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)]">
          {/* System items first (with badge), then own */}
          {systemItems.map(renderItem)}
          {ownItems.map(renderItem)}
        </ul>
      )}
    </div>
  )
}

// ── Packages Tab ──────────────────────────────────────────────────────────────

function PackagesTab({ orgId, propertyId, isSystem, isSuper, isChainLevel, isHotelLevel }: { orgId: number | null; propertyId: number | null; isSystem: boolean; isSuper: boolean; isChainLevel: boolean; isHotelLevel: boolean }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingPropertyId, setEditingPropertyId] = useState<number | null>(null)
  const [form, setForm] = useState({
    name: '', isActive: true,
    showOnChainPage: false, showOnHotelPage: false, roomPageMode: null as string | null,
    visibleToChains: false, visibleToHotels: false, itemIds: [] as number[],
  })
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const qKey = ['incentive-packages', orgId ?? 'system', propertyId ?? 'none']
  const itemsKey = ['incentive-items', orgId ?? 'system', propertyId ?? 'none']

  const { data: items = [] } = useQuery<IncentiveItem[]>({
    queryKey: itemsKey,
    queryFn: () => apiClient.listIncentiveItems(orgId, isHotelLevel, propertyId ?? undefined),
  })

  const { data: packages = [], isLoading } = useQuery<IncentivePackage[]>({
    queryKey: qKey,
    queryFn: () => apiClient.listIncentivePackages(orgId, isHotelLevel, propertyId ?? undefined),
  })

  const ownPackages = packages.filter(p => !p.isSystem)
  const systemPackages = packages.filter(p => p.isSystem)

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        orgId,
        ...(isHotelLevel && propertyId && !editingId ? { propertyId } : {}),
      }
      return editingId
        ? apiClient.updateIncentivePackage(editingId, payload, orgId, editingPropertyId ?? undefined)
        : apiClient.createIncentivePackage(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey })
      setShowForm(false); setEditingId(null); setEditingPropertyId(null)
      setForm({ name: '', isActive: true, showOnChainPage: false, showOnHotelPage: false, roomPageMode: null, visibleToChains: false, visibleToHotels: false, itemIds: [] })
      setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, pkgPropertyId, ...data }: { id: number; pkgPropertyId?: number; isActive?: boolean; visibleToChains?: boolean; visibleToHotels?: boolean }) =>
      apiClient.updateIncentivePackage(id, data, orgId, pkgPropertyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  const overrideMutation = useMutation({
    mutationFn: ({ packageId, disabled }: { packageId: number; disabled: boolean }) =>
      apiClient.setChainPackageOverride(packageId, orgId!, disabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  const propertyOverrideMutation = useMutation({
    mutationFn: ({ packageId, disabled }: { packageId: number; disabled: boolean }) =>
      apiClient.setPropertyPackageOverride(packageId, propertyId!, disabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, pkgPropertyId }: { id: number; pkgPropertyId?: number }) => apiClient.deleteIncentivePackage(id, orgId, pkgPropertyId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qKey }); setDeleteConfirm(null) },
  })

  function startCreate() {
    setEditingId(null); setEditingPropertyId(null)
    setForm({ name: '', isActive: true, showOnChainPage: false, showOnHotelPage: false, roomPageMode: null, visibleToChains: isSystem, visibleToHotels: isSystem || isChainLevel, itemIds: [] })
    setShowForm(true); setError(null)
  }

  function startEdit(pkg: IncentivePackage) {
    setEditingId(pkg.id)
    setEditingPropertyId(pkg.propertyId ?? null)
    setForm({
      name: pkg.name, isActive: pkg.isActive,
      showOnChainPage: pkg.showOnChainPage, showOnHotelPage: pkg.showOnHotelPage,
      roomPageMode: pkg.roomPageMode,
      visibleToChains: pkg.visibleToChains, visibleToHotels: pkg.visibleToHotels,
      itemIds: pkg.items.map((pi: import('@ibe/shared').IncentivePackageItem) => pi.itemId),
    })
    setShowForm(true); setError(null)
  }

  function toggleItem(id: number) {
    setForm(f => ({ ...f, itemIds: f.itemIds.includes(id) ? f.itemIds.filter(x => x !== id) : [...f.itemIds, id] }))
  }

  // Items available for package composition (own + visible system items)
  const ownItems = items.filter(i => !i.isSystem)
  const visibleSystemItems = items.filter(i => i.isSystem && i.visibleToChains)
  const composableItems = isSystem ? items : isHotelLevel ? items : [...ownItems, ...visibleSystemItems]

  function renderPackage(pkg: IncentivePackage) {
    const isHotelOwn = isHotelLevel && pkg.propertyId != null && pkg.propertyId === propertyId
    const canEdit = isHotelOwn || (!isHotelLevel && (isSystem ? pkg.isSystem : !pkg.isSystem))
    const isChainDisabled = pkg.chainDisabled ?? false
    const isPropertyDisabled = !isHotelOwn && (pkg.propertyDisabled ?? false)
    const isDimmed = isChainDisabled || isPropertyDisabled
    const pkgPropertyId: number | undefined = isHotelOwn && pkg.propertyId != null ? pkg.propertyId : undefined
    const pkgPropertyIdArg = pkgPropertyId !== undefined ? { pkgPropertyId } : {}
    return (
      <li key={pkg.id} className={['flex items-start gap-3 px-4 py-3', isDimmed ? 'opacity-50' : ''].join(' ')}>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">{pkg.name}</span>
            {pkg.isSystem && <SystemBadge />}
            {isHotelOwn && (
              <span className="rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 border border-green-200">Hotel</span>
            )}
            {!pkg.isActive && (
              <span className="rounded px-1.5 py-px text-[10px] font-semibold uppercase bg-[var(--color-background)] text-[var(--color-text-muted)] border border-[var(--color-border)]">Inactive</span>
            )}
            {isChainDisabled && (
              <span className="rounded px-1.5 py-px text-[10px] font-semibold uppercase bg-amber-50 text-amber-700 border border-amber-200">Disabled for chain</span>
            )}
            {isPropertyDisabled && (
              <span className="rounded px-1.5 py-px text-[10px] font-semibold uppercase bg-amber-50 text-amber-700 border border-amber-200">Disabled for hotel</span>
            )}
            {pkg.showOnChainPage && <VisibilityBadge label="Chain page" />}
            {pkg.showOnHotelPage && <VisibilityBadge label="Hotel page" />}
            {pkg.roomPageMode && <VisibilityBadge label={pkg.roomPageMode === 'both' ? 'Room page (banner+display)' : pkg.roomPageMode === 'banner' ? 'Room page (banner)' : 'Room page (display)'} />}
            {pkg.isSystem && pkg.visibleToChains && <VisibilityBadge label="Visible to chains" />}
            {!isHotelOwn && pkg.visibleToHotels && <VisibilityBadge label="Visible to hotels" />}
          </div>
          {pkg.items.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {pkg.items.map((pi: import('@ibe/shared').IncentivePackageItem) => (
                <li key={pi.id} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <span className="text-[var(--color-primary)]">✓</span>{pi.item.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">No items</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {canEdit && (
            <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
              <ToggleSwitch
                checked={pkg.isActive}
                onChange={v => toggleMutation.mutate({
                  id: pkg.id,
                  ...pkgPropertyIdArg,
                  isActive: v,
                  ...(isSystem && pkg.isSystem ? { visibleToChains: v } : {}),
                  ...(!isHotelOwn ? { visibleToHotels: v } : {}),
                })}
                disabled={toggleMutation.isPending}
              />
              Active
            </label>
          )}
          {/* Hotel-level enable/disable toggle for inherited packages only (not hotel-own packages) */}
          {isHotelLevel && !isHotelOwn && (
            <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
              <ToggleSwitch
                checked={!isPropertyDisabled}
                onChange={v => propertyOverrideMutation.mutate({ packageId: pkg.id, disabled: !v })}
                disabled={propertyOverrideMutation.isPending}
              />
              Enabled
            </label>
          )}
          {/* Hotels visibility toggle — chain admin on own packages */}
          {isChainLevel && !pkg.isSystem && (
            <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
              <ToggleSwitch checked={pkg.visibleToHotels} onChange={v => toggleMutation.mutate({ id: pkg.id, visibleToHotels: v })} />
              Hotels
            </label>
          )}
          {/* Chain-level disable toggle for system packages — only in chain context */}
          {isChainLevel && pkg.isSystem && (
            <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
              <ToggleSwitch
                checked={!isChainDisabled}
                onChange={v => overrideMutation.mutate({ packageId: pkg.id, disabled: !v })}
                disabled={overrideMutation.isPending}
              />
              Enabled
            </label>
          )}
          {/* Super admin visibility toggles — only at system level */}
          {isSystem && pkg.isSystem && (
            <div className="flex items-center gap-2 ml-1">
              <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                <ToggleSwitch checked={pkg.visibleToChains} onChange={v => toggleMutation.mutate({ id: pkg.id, visibleToChains: v })} />
                Chains
              </label>
              <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                <ToggleSwitch checked={pkg.visibleToHotels} onChange={v => toggleMutation.mutate({ id: pkg.id, visibleToHotels: v })} />
                Hotels
              </label>
            </div>
          )}
          {canEdit && (
            <>
              <button onClick={() => startEdit(pkg)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Edit</button>
              {deleteConfirm === pkg.id ? (
                <>
                  <button onClick={() => deleteMutation.mutate({ id: pkg.id, ...pkgPropertyIdArg })} disabled={deleteMutation.isPending} className="text-xs font-medium text-[var(--color-error)] hover:underline">Confirm</button>
                  <button onClick={() => setDeleteConfirm(null)} className="text-xs text-[var(--color-text-muted)] hover:underline">Cancel</button>
                </>
              ) : (
                <button onClick={() => setDeleteConfirm(pkg.id)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]">Delete</button>
              )}
            </>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-text-muted)]">Create named packages composed of items.</p>
        <button onClick={startCreate} className="rounded bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity">
          New package
        </button>
      </div>

      {showForm && (
        <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{editingId ? 'Edit package' : 'New package'}</h3>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-muted)]">Package name</label>
            <input
              autoFocus type="text" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Little Emperors Benefits"
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <ToggleSwitch checked={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} />
              Active
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">Display on</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {!isHotelLevel && (
                <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                  <ToggleSwitch checked={form.showOnChainPage} onChange={v => setForm(f => ({ ...f, showOnChainPage: v }))} />
                  Chain page
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                <ToggleSwitch checked={form.showOnHotelPage} onChange={v => setForm(f => ({ ...f, showOnHotelPage: v }))} />
                Hotel page
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--color-text)]">Room page</span>
                <select
                  value={form.roomPageMode ?? ''}
                  onChange={e => setForm(f => ({ ...f, roomPageMode: e.target.value || null }))}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value="">Off</option>
                  <option value="banner">Top banner</option>
                  <option value="embedded">Room display</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            {isSystem && (
              <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                <ToggleSwitch checked={form.visibleToChains} onChange={v => setForm(f => ({ ...f, visibleToChains: v }))} />
                Visible to chains
              </label>
            )}
            {(isSystem || isChainLevel) && (
              <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                <ToggleSwitch checked={form.visibleToHotels} onChange={v => setForm(f => ({ ...f, visibleToHotels: v }))} />
                Visible to hotels
              </label>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">Items in this package</p>
            {composableItems.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">No items in library yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {composableItems.map(item => (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox" checked={form.itemIds.includes(item.id)}
                        onChange={() => toggleItem(item.id)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-primary)]"
                      />
                      <span className="text-sm text-[var(--color-text)]">
                        {item.text}
                        {item.isSystem && <SystemBadge />}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!form.name.trim() || saveMutation.isPending}
              className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
            >{saveMutation.isPending ? 'Saving…' : 'Save'}</button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null) }}
              className="rounded border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
      ) : packages.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No packages yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)]">
          {systemPackages.map(renderPackage)}
          {ownPackages.map(renderPackage)}
        </ul>
      )}
    </div>
  )
}

// ── Assignments Tab ───────────────────────────────────────────────────────────

function AssignmentsTab({ propertyId, orgId }: { propertyId: number | null; orgId: number | null }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const { data: packages = [] } = useQuery<IncentivePackage[]>({
    queryKey: ['incentive-packages-assignable', orgId ?? 'system', propertyId ?? 'none'],
    queryFn: () => apiClient.listAssignablePackages(orgId, propertyId ?? undefined),
  })

  const { data: config, isLoading } = useQuery<IncentivePropertyConfig | null>({
    queryKey: ['incentive-property-config', propertyId],
    queryFn: () => (propertyId ? apiClient.getIncentivePropertyConfig(propertyId) : Promise.resolve(null)),
    enabled: propertyId !== null,
  })

  const saveMutation = useMutation({
    mutationFn: (data: Parameters<typeof apiClient.upsertIncentivePropertyConfig>[1]) =>
      apiClient.upsertIncentivePropertyConfig(propertyId!, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-property-config', propertyId] }); setError(null) },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteIncentivePropertyConfig(propertyId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-property-config', propertyId] }); setDeleteConfirm(false) },
  })

  if (propertyId === null) {
    return <p className="text-sm text-[var(--color-text-muted)]">Select a property to manage its incentive assignment.</p>
  }

  function handlePackageChange(packageId: number) {
    saveMutation.mutate({
      packageId,
      showOnHotelPage: config?.showOnHotelPage ?? false,
      roomPageMode: config?.roomPageMode ?? null,
    })
  }

  function handleToggle(field: 'enabled' | 'showOnHotelPage', value: boolean) {
    if (!config) return
    saveMutation.mutate({
      packageId: config.packageId,
      enabled: field === 'enabled' ? value : config.enabled,
      showOnHotelPage: field === 'showOnHotelPage' ? value : config.showOnHotelPage,
      roomPageMode: config.roomPageMode,
    })
  }

  function handleRoomPageMode(mode: string) {
    if (!config) return
    saveMutation.mutate({
      packageId: config.packageId,
      enabled: config.enabled,
      showOnHotelPage: config.showOnHotelPage,
      roomPageMode: mode || null,
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--color-text-muted)]">Assign a package and choose where to display it.</p>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
      ) : (
        <>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-muted)]">Active package</label>
            {packages.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No active packages available.</p>
            ) : (
              <select
                value={config?.packageId ?? ''}
                onChange={e => handlePackageChange(Number(e.target.value))}
                className="w-full max-w-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="">— none —</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.isSystem ? ' [System]' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {config && (
            <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3 mb-1">
                <span className="text-sm font-semibold text-[var(--color-text)]">Incentives enabled</span>
                <ToggleSwitch checked={config.enabled} onChange={v => handleToggle('enabled', v)} disabled={saveMutation.isPending} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Display on</p>
              <label className={['flex items-center gap-3', !config.enabled ? 'opacity-40' : ''].join(' ')}>
                <ToggleSwitch checked={config.showOnHotelPage} onChange={v => handleToggle('showOnHotelPage', v)} disabled={!config.enabled || saveMutation.isPending} />
                <span className="text-sm text-[var(--color-text)]">Hotel page</span>
              </label>
              <div className={['flex items-center gap-3', !config.enabled ? 'opacity-40' : ''].join(' ')}>
                <span className="text-sm text-[var(--color-text)]">Room page</span>
                <select
                  value={config.roomPageMode ?? ''}
                  onChange={e => handleRoomPageMode(e.target.value)}
                  disabled={!config.enabled || saveMutation.isPending}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-40"
                >
                  <option value="">Off</option>
                  <option value="banner">Top banner</option>
                  <option value="embedded">Room display</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>
          )}

          {config && (
            <div>
              {deleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--color-text-muted)]">Remove assignment?</span>
                  <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="text-sm font-medium text-[var(--color-error)] hover:underline">Confirm</button>
                  <button onClick={() => setDeleteConfirm(false)} className="text-sm text-[var(--color-text-muted)] hover:underline">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setDeleteConfirm(true)} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors">
                  Remove assignment
                </button>
              )}
            </div>
          )}

          {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
        </>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function IncentivesPage() {
  const [tab, setTab] = useState<Tab>('items')
  const { propertyId, orgId } = useAdminProperty()
  const { admin } = useAdminAuth()
  const isSuper = admin?.role === 'super'

  // System level: super admin with no org selected
  const isSystem = isSuper && orgId === null && propertyId === null
  // Effective orgId: null for system level, orgId for chain, fallback to admin's own org
  const effectiveOrgId = isSystem ? null : (orgId ?? null)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Incentives</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Create and manage incentive packages — special perks offered as part of a booking.
        </p>
      </div>

      <ContextBar isSystem={isSystem} isSuper={isSuper} orgId={effectiveOrgId} isHotelLevel={(propertyId ?? null) !== null} propertyId={propertyId ?? null} />

      {/* Chain-level master enable toggle (shown to chain admins and super admins in chain context) */}
      {!isSystem && effectiveOrgId !== null && propertyId === null && (
        <ChainEnableToggle orgId={effectiveOrgId} />
      )}

      <TabBar active={tab} onChange={setTab} />

      <div className="pt-2">
        {tab === 'items' && <ItemsTab orgId={effectiveOrgId} propertyId={propertyId ?? null} isSystem={isSystem} isSuper={isSuper} isChainLevel={effectiveOrgId !== null && (propertyId ?? null) === null} isHotelLevel={(propertyId ?? null) !== null} />}
        {tab === 'packages' && <PackagesTab orgId={effectiveOrgId} propertyId={propertyId ?? null} isSystem={isSystem} isSuper={isSuper} isChainLevel={effectiveOrgId !== null && (propertyId ?? null) === null} isHotelLevel={(propertyId ?? null) !== null} />}
        {tab === 'assignments' && <AssignmentsTab propertyId={propertyId ?? null} orgId={effectiveOrgId} />}
      </div>
    </div>
  )
}
