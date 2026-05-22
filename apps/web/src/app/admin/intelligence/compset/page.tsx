'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../../property-context'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { SaveBar } from '@/app/admin/design/components'
import { CronPicker } from '../components/CronPicker'
import { UrlAnalysisSection } from '../components/UrlAnalysisSection'
import type { ExternalIBEAnalyzeResponse } from '@ibe/shared'
import type {
  SystemCompSetConfig,
  CompSetSearchParam,
  CompSetCompetitor,
  CompSetSearchParamCreate,
  CompSetResult,
  CompSetRoomMapping,
} from '@ibe/shared'

// ── Shared helpers ────────────────────────────────────────────────────────────

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
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

function Spinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
    </div>
  )
}

function TierBadge({ tier }: { tier: 'system' | 'chain' | 'hotel' }) {
  const map: Record<typeof tier, { label: string; className: string }> = {
    system: { label: 'System', className: 'bg-purple-100 text-purple-700' },
    chain: { label: 'Chain', className: 'bg-blue-100 text-blue-700' },
    hotel: { label: 'Hotel', className: 'bg-green-100 text-green-700' },
  }
  const { label, className } = map[tier]
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: CompSetCompetitor['status'] }) {
  const map: Record<CompSetCompetitor['status'], { label: string; className: string }> = {
    idle: { label: 'Idle', className: 'text-[var(--color-text-muted)]' },
    fetching: { label: 'Fetching…', className: 'text-amber-600 animate-pulse' },
    done: { label: 'Done', className: 'text-[var(--color-success,#16a34a)]' },
    error: { label: 'Error', className: 'text-[var(--color-error,#dc2626)]' },
  }
  const { label, className } = map[status]
  return <span className={`text-xs font-medium ${className}`}>{label}</span>
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function inputClass(extra = '') {
  return [
    'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]',
    'px-3 py-2 text-sm text-[var(--color-text)]',
    'placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

// ── Section A: System Config Panel ────────────────────────────────────────────

function SystemConfigPanel() {
  const qc = useQueryClient()
  const [dirty, setDirty] = useState(false)

  const [enabled, setEnabled] = useState(true)
  const [maxCompetitors, setMaxCompetitors] = useState(10)
  const [cronSchedule, setCronSchedule] = useState('0 2 * * *')

  const sysQuery = useQuery({
    queryKey: ['compset-system-config'],
    queryFn: () => apiClient.getCompSetSystemConfig(),
  })

  useEffect(() => {
    if (sysQuery.data && !dirty) {
      setEnabled(sysQuery.data.enabled)
      setMaxCompetitors(sysQuery.data.maxCompetitorsPerProperty)
      setCronSchedule(sysQuery.data.cronSchedule)
    }
  }, [sysQuery.data, dirty])

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.updateCompSetSystemConfig({
        enabled,
        maxCompetitorsPerProperty: maxCompetitors,
        cronSchedule,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-system-config'] })
      setDirty(false)
    },
  })

  function markDirty() {
    setDirty(true)
  }

  if (sysQuery.isLoading) return <Spinner />

  return (
    <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">System Configuration</h2>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">Enable CompSet</p>
          <p className="text-xs text-[var(--color-text-muted)]">Master switch for the entire CompSet feature</p>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => {
            setEnabled(v)
            markDirty()
          }}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-[var(--color-text)]">
          Max competitors per property
        </label>
        <input
          type="number"
          min={1}
          max={50}
          value={maxCompetitors}
          onChange={(e) => {
            setMaxCompetitors(Number(e.target.value))
            markDirty()
          }}
          className={inputClass('max-w-[120px]')}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-[var(--color-text)]">
          Cron schedule
        </label>
        <CronPicker
          value={cronSchedule}
          onChange={(v) => { setCronSchedule(v); markDirty() }}
        />
      </div>

      {saveMutation.isError && (
        <p className="text-sm text-[var(--color-error,#dc2626)]">
          {saveMutation.error instanceof Error ? saveMutation.error.message : 'Save failed'}
        </p>
      )}

      <SaveBar
        isDirty={dirty}
        isSaving={saveMutation.isPending}
        onSave={() => saveMutation.mutate()}
      />
    </section>
  )
}

// ── Section B: Add Search Param Form ─────────────────────────────────────────

interface AddParamFormProps {
  onAdd: (data: CompSetSearchParamCreate) => void
  isPending: boolean
  onCancel: () => void
}

function AddParamForm({ onAdd, isPending, onCancel }: AddParamFormProps) {
  const [offsetDays, setOffsetDays] = useState(7)
  const [nights, setNights] = useState(2)
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [childAges, setChildAges] = useState<number[]>([])

  function handleChildrenChange(count: number) {
    setChildren(count)
    setChildAges(prev => {
      if (count > prev.length) return [...prev, ...Array(count - prev.length).fill(8)]
      return prev.slice(0, count)
    })
  }

  function handleChildAge(index: number, age: number) {
    setChildAges(prev => prev.map((a, i) => (i === index ? age : a)))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onAdd({ offsetDays, nights, adults, children, childAges })
  }

  const fieldClass = inputClass('max-w-[100px]')

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background,#f9fafb)] p-4 space-y-3">
      <p className="text-sm font-medium text-[var(--color-text)]">Add search parameter</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Offset days</label>
          <input type="number" min={1} max={365} value={offsetDays}
            onChange={(e) => setOffsetDays(Number(e.target.value))}
            className={fieldClass} required />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Nights</label>
          <input type="number" min={1} max={30} value={nights}
            onChange={(e) => setNights(Number(e.target.value))}
            className={fieldClass} required />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Adults</label>
          <input type="number" min={1} max={10} value={adults}
            onChange={(e) => setAdults(Number(e.target.value))}
            className={fieldClass} required />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Children</label>
          <input type="number" min={0} max={10} value={children}
            onChange={(e) => handleChildrenChange(Number(e.target.value))}
            className={fieldClass} />
        </div>
        {childAges.map((age, i) => (
          <div key={i} className="space-y-1">
            <label className="block text-xs text-[var(--color-text-muted)]">Child {i + 1} age</label>
            <input type="number" min={0} max={17} value={age}
              onChange={(e) => handleChildAge(i, Number(e.target.value))}
              className={fieldClass} />
          </div>
        ))}
        <div className="flex gap-2">
          <button type="submit" disabled={isPending}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity">
            {isPending ? 'Adding…' : 'Add'}
          </button>
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}

// ── Section B: Edit Param Form ────────────────────────────────────────────────

interface EditParamFormProps {
  param: CompSetSearchParam
  onSave: (data: CompSetSearchParamCreate) => void
  isPending: boolean
  onCancel: () => void
}

function EditParamForm({ param, onSave, isPending, onCancel }: EditParamFormProps) {
  const [offsetDays, setOffsetDays] = useState(param.offsetDays)
  const [nights, setNights] = useState(param.nights)
  const [adults, setAdults] = useState(param.adults)
  const [children, setChildren] = useState(param.children)
  const [childAges, setChildAges] = useState<number[]>(param.childAges)

  function handleChildrenChange(count: number) {
    setChildren(count)
    setChildAges(prev => {
      if (count > prev.length) return [...prev, ...Array(count - prev.length).fill(8)]
      return prev.slice(0, count)
    })
  }

  function handleChildAge(index: number, age: number) {
    setChildAges(prev => prev.map((a, i) => (i === index ? age : a)))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({ offsetDays, nights, adults, children, childAges })
  }

  const fieldClass = inputClass('max-w-[100px]')

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-background,#f9fafb)] p-4 space-y-3">
      <p className="text-sm font-medium text-[var(--color-text)]">Edit search parameter</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Offset days</label>
          <input type="number" min={1} max={365} value={offsetDays}
            onChange={(e) => setOffsetDays(Number(e.target.value))}
            className={fieldClass} required />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Nights</label>
          <input type="number" min={1} max={30} value={nights}
            onChange={(e) => setNights(Number(e.target.value))}
            className={fieldClass} required />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Adults</label>
          <input type="number" min={1} max={10} value={adults}
            onChange={(e) => setAdults(Number(e.target.value))}
            className={fieldClass} required />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Children</label>
          <input type="number" min={0} max={10} value={children}
            onChange={(e) => handleChildrenChange(Number(e.target.value))}
            className={fieldClass} />
        </div>
        {childAges.map((age, i) => (
          <div key={i} className="space-y-1">
            <label className="block text-xs text-[var(--color-text-muted)]">Child {i + 1} age</label>
            <input type="number" min={0} max={17} value={age}
              onChange={(e) => handleChildAge(i, Number(e.target.value))}
              className={fieldClass} />
          </div>
        ))}
        <div className="flex gap-2">
          <button type="submit" disabled={isPending}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity">
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}

// ── Section B: Param Row ──────────────────────────────────────────────────────

interface ParamRowProps {
  param: CompSetSearchParam
  isOwn: boolean
  isTogglingActive?: boolean
  onToggleActive?: (isActive: boolean) => void
  isEditing?: boolean
  onEditRequest?: () => void
  onEditCancel?: () => void
  onEditSave?: (data: CompSetSearchParamCreate) => void
  isEditSaving?: boolean
  deleteConfirm?: boolean
  onDeleteRequest?: () => void
  onDeleteConfirm?: () => void
  onDeleteCancel?: () => void
  isDeleting?: boolean
}

function ParamRow({
  param,
  isOwn,
  isTogglingActive,
  onToggleActive,
  isEditing,
  onEditRequest,
  onEditCancel,
  onEditSave,
  isEditSaving,
  deleteConfirm,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  isDeleting,
}: ParamRowProps) {
  if (isEditing && isOwn) {
    return (
      <EditParamForm
        param={param}
        onSave={(data) => onEditSave!(data)}
        isPending={isEditSaving ?? false}
        onCancel={() => onEditCancel?.()}
      />
    )
  }

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-lg border px-4 py-3',
        isOwn
          ? 'border-[var(--color-border)] bg-[var(--color-surface)]'
          : 'border-[var(--color-border)] bg-[var(--color-background,#f9fafb)]',
      ].join(' ')}
    >
      <TierBadge tier={param.tier} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-text)] font-medium">{param.label}</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          +{param.offsetDays}d · {param.nights}n · {param.adults}A{param.children > 0 ? ` · ${param.children}C (${param.childAges.join(', ')})` : ''}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {isOwn && !deleteConfirm && (
          <>
            <button
              type="button"
              onClick={onEditRequest}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDeleteRequest}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error,#dc2626)] transition-colors"
            >
              Delete
            </button>
          </>
        )}
        {isOwn && deleteConfirm && (
          <>
            <span className="text-xs text-[var(--color-text-muted)]">Delete?</span>
            <button
              type="button"
              disabled={isDeleting}
              onClick={onDeleteConfirm}
              className="rounded bg-[var(--color-error,#dc2626)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {isDeleting ? '…' : 'Yes'}
            </button>
            <button
              type="button"
              onClick={onDeleteCancel}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              Cancel
            </button>
          </>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={param.resolvedIsActive}
          disabled={isTogglingActive}
          onClick={() => onToggleActive?.(!param.resolvedIsActive)}
          className={[
            'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50',
            param.resolvedIsActive ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
              param.resolvedIsActive ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>
    </div>
  )
}

// ── Section B: Search Configurations ─────────────────────────────────────────

interface SearchConfigSectionProps {
  propertyId: number | null
  orgId: number | null
  isSuper: boolean
}

function SearchConfigSection({ propertyId, orgId, isSuper }: SearchConfigSectionProps) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [editingParamId, setEditingParamId] = useState<number | null>(null)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const [activeErr, setActiveErr] = useState<string | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)

  const currentTier: 'system' | 'chain' | 'hotel' = propertyId
    ? 'hotel'
    : orgId
    ? 'chain'
    : 'system'

  const paramsQuery = useQuery({
    queryKey: ['compset-search-params', propertyId, orgId],
    queryFn: () =>
      apiClient.getCompSetSearchParams({
        ...(propertyId !== null ? { propertyId } : {}),
        ...(orgId !== null && propertyId === null ? { orgId } : {}),
        effective: true,
      }),
  })

  const createMutation = useMutation({
    mutationFn: (data: CompSetSearchParamCreate) =>
      apiClient.createCompSetSearchParam({
        ...data,
        ...(propertyId !== null ? { propertyId } : orgId !== null ? { orgId } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-search-params'] })
      setShowAdd(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CompSetSearchParamCreate }) =>
      apiClient.updateCompSetSearchParam(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-search-params'] })
      setEditingParamId(null)
      setEditErr(null)
    },
    onError: (e) => setEditErr(e instanceof Error ? e.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteCompSetSearchParam(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-search-params'] })
      setDeleteConfirmId(null)
      setDeleteErr(null)
    },
    onError: (e) => setDeleteErr(e instanceof Error ? e.message : 'Delete failed'),
  })

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiClient.patchCompSetSearchParamActive(id, {
        isActive,
        orgId: orgId ?? null,
        propertyId: propertyId ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-search-params'] })
      setActiveErr(null)
    },
    onError: (e) => setActiveErr(e instanceof Error ? e.message : 'Toggle failed'),
  })

  const params = paramsQuery.data ?? []

  const tierOrder: Record<'system' | 'chain' | 'hotel', number> = { system: 0, chain: 1, hotel: 2 }
  const currentTierOrder = tierOrder[currentTier]

  const inheritedParams = params.filter((p) => tierOrder[p.tier] < currentTierOrder)
  const ownParams = params.filter((p) => p.tier === currentTier)

  return (
    <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Search Configurations</h2>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-background,#f9fafb)] transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        )}
      </div>

      {paramsQuery.isLoading ? (
        <div className="h-12 animate-pulse rounded-lg bg-[var(--color-border)]" />
      ) : (
        <>
          {inheritedParams.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Inherited — you can activate or deactivate
              </p>
              {inheritedParams.map((param) => (
                <ParamRow
                  key={param.id}
                  param={param}
                  isOwn={false}
                  isTogglingActive={activeMutation.isPending}
                  onToggleActive={(isActive) => activeMutation.mutate({ id: param.id, isActive })}
                />
              ))}
            </div>
          )}

          {ownParams.length > 0 && (
            <div className="space-y-2">
              {inheritedParams.length > 0 && (
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  Own
                </p>
              )}
              {ownParams.map((param) => (
                <ParamRow
                  key={param.id}
                  param={param}
                  isOwn={true}
                  isTogglingActive={activeMutation.isPending}
                  onToggleActive={(isActive) => activeMutation.mutate({ id: param.id, isActive })}
                  isEditing={editingParamId === param.id}
                  onEditRequest={() => { setEditingParamId(param.id); setShowAdd(false) }}
                  onEditCancel={() => setEditingParamId(null)}
                  onEditSave={(data) => editMutation.mutate({ id: param.id, data })}
                  isEditSaving={editMutation.isPending && editingParamId === param.id}
                  deleteConfirm={deleteConfirmId === param.id}
                  onDeleteRequest={() => setDeleteConfirmId(param.id)}
                  onDeleteConfirm={() => deleteMutation.mutate(param.id)}
                  onDeleteCancel={() => setDeleteConfirmId(null)}
                  isDeleting={deleteMutation.isPending && deleteConfirmId === param.id}
                />
              ))}
            </div>
          )}

          {inheritedParams.length === 0 && ownParams.length === 0 && !showAdd && (
            <p className="text-sm text-[var(--color-text-muted)] italic">
              No search parameters configured. Click &quot;Add&quot; to create one.
            </p>
          )}
        </>
      )}

      {showAdd && (
        <AddParamForm
          onAdd={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {createMutation.isError && (
        <p className="text-sm text-[var(--color-error,#dc2626)]">
          {createMutation.error instanceof Error ? createMutation.error.message : 'Create failed'}
        </p>
      )}

      {deleteErr && (
        <p className="text-xs text-[var(--color-error,#dc2626)]">{deleteErr}</p>
      )}
      {activeErr && (
        <p className="text-xs text-[var(--color-error,#dc2626)]">{activeErr}</p>
      )}
      {editErr && (
        <p className="text-xs text-[var(--color-error,#dc2626)]">{editErr}</p>
      )}
    </section>
  )
}

// ── Section C: Add Competitor Form ───────────────────────────────────────────

interface AddCompetitorFormProps {
  propertyId: number
  orgId: number | null
  onSaved: () => void
  onCancel: () => void
}

function AddCompetitorForm({ propertyId, orgId, onSaved, onCancel }: AddCompetitorFormProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [analyzeResult, setAnalyzeResult] = useState<ExternalIBEAnalyzeResponse | null>(null)

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.createCompSetCompetitor({
        propertyId,
        name: name.trim(),
        searchUrl: analyzeResult?.template ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-competitors', propertyId] })
      onSaved()
    },
  })

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background,#f9fafb)] p-4 space-y-4">
      <p className="text-sm font-medium text-[var(--color-text)]">Add competitor</p>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-[var(--color-text-muted)]">
          Competitor name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Grand Hyatt Bangkok"
          className={inputClass()}
          required
        />
      </div>

      <UrlAnalysisSection
        orgId={orgId}
        propertyId={propertyId}
        result={analyzeResult}
        onResult={setAnalyzeResult}
      />

      {saveMutation.isError && (
        <p className="text-sm text-[var(--color-error,#dc2626)]">
          {saveMutation.error instanceof Error ? saveMutation.error.message : 'Save failed'}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!name.trim() || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Section C: Competitor Card ────────────────────────────────────────────────

interface CompetitorCardProps {
  competitor: CompSetCompetitor
  onRun: () => void
  isRunning: boolean
  onDelete: () => void
  isDeleting: boolean
  deleteConfirm: boolean
  onDeleteRequest: () => void
  onDeleteCancel: () => void
}

function CompetitorCard({
  competitor,
  onRun,
  isRunning,
  onDelete,
  isDeleting,
  deleteConfirm,
  onDeleteRequest,
  onDeleteCancel,
}: CompetitorCardProps) {
  const shortUrl = (url: string | null) => {
    if (!url) return null
    try {
      const u = new URL(url)
      const path = u.pathname.slice(0, 35)
      return u.hostname + path + (u.pathname.length > 35 ? '…' : '')
    } catch {
      return url.slice(0, 50)
    }
  }

  return (
    <div className="flex items-start gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-[var(--color-text)] truncate">{competitor.name}</p>
        {competitor.searchUrl && (
          <p
            className="text-xs text-[var(--color-text-muted)] font-mono truncate"
            title={competitor.searchUrl}
          >
            {shortUrl(competitor.searchUrl)}
          </p>
        )}
        {!competitor.searchUrl && (
          <p className="text-xs text-[var(--color-text-muted)] italic">No URL configured</p>
        )}
        <div className="flex items-center gap-3 pt-0.5">
          <StatusBadge status={competitor.status} />
          <span className="text-xs text-[var(--color-text-muted)]">
            Last: {fmtDateTime(competitor.lastFetchAt)}
          </span>
          {competitor.errorMsg && (
            <span
              className="text-xs text-[var(--color-error,#dc2626)] truncate max-w-[160px]"
              title={competitor.errorMsg}
            >
              {competitor.errorMsg}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={isRunning || competitor.status === 'fetching'}
          onClick={onRun}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-background,#f9fafb)] transition-colors"
        >
          {isRunning || competitor.status === 'fetching' ? 'Running…' : 'Run'}
        </button>

        {!deleteConfirm && (
          <button
            type="button"
            onClick={onDeleteRequest}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error,#dc2626)] hover:border-[var(--color-error,#dc2626)] transition-colors"
          >
            Delete
          </button>
        )}
        {deleteConfirm && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isDeleting}
              onClick={onDelete}
              className="rounded bg-[var(--color-error,#dc2626)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {isDeleting ? '…' : 'Yes'}
            </button>
            <button
              type="button"
              onClick={onDeleteCancel}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Mapping Section ───────────────────────────────────────────────────────────

interface MappingSectionProps {
  competitor: CompSetCompetitor
  results: CompSetResult[]
}

function MappingSection({ competitor, results }: MappingSectionProps) {
  const qc = useQueryClient()

  // Unique room names from latest results (no board/cancellation — those come from search results)
  const compRooms = [...new Set(
    results
      .filter(r => r.competitorId === competitor.id && r.searchStatus === 'found' && r.roomName)
      .map(r => r.roomName!),
  )]

  const ownRooms = [...new Set(
    results
      .filter(r => r.competitorId === null && r.searchStatus === 'found' && r.roomName)
      .map(r => r.roomName!),
  )]

  const mappingsQuery = useQuery({
    queryKey: ['compset-mappings', competitor.id],
    queryFn: () => apiClient.getCompSetRoomMappings(competitor.id),
  })

  // Local draft: compRoomName → ownRoomName (empty string = not mapped)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [draftInitialized, setDraftInitialized] = useState(false)

  useEffect(() => {
    setDraft({})
    setDraftInitialized(false)
  }, [competitor.id])

  useEffect(() => {
    if (mappingsQuery.data && !draftInitialized) {
      const init: Record<string, string> = {}
      for (const m of mappingsQuery.data) {
        init[m.compRoomName] = m.ownRoomName
      }
      setDraft(init)
      setDraftInitialized(true)
    }
  }, [mappingsQuery.data, draftInitialized])

  const modeMutation = useMutation({
    mutationFn: (mode: 'cheapest' | 'room_mapping') =>
      apiClient.updateCompSetCompetitor(competitor.id, { comparisonMode: mode }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['compset-competitors', competitor.propertyId] }),
  })

  const autoMutation = useMutation({
    mutationFn: () =>
      apiClient.autoCompSetRoomMappings(
        competitor.id,
        compRooms.map(r => ({ roomName: r })),
        ownRooms.map(r => ({ roomName: r })),
      ),
    onSuccess: (mappings) => {
      void qc.invalidateQueries({ queryKey: ['compset-mappings', competitor.id] })
      const init: Record<string, string> = {}
      for (const m of mappings) { init[m.compRoomName] = m.ownRoomName }
      setDraft(init)
      setDraftInitialized(true)
    },
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const mappings = compRooms
        .filter(cr => draft[cr])
        .map(cr => ({ compRoomName: cr, ownRoomName: draft[cr]! }))
      return apiClient.saveCompSetRoomMappings(competitor.id, mappings)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['compset-mappings', competitor.id] }),
  })

  const mode = competitor.comparisonMode ?? 'cheapest'
  const neverRun = !competitor.lastFetchAt
  const noResults = compRooms.length === 0

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">Comparison mode</h3>

      {/* Mode selector */}
      <div className="flex gap-4">
        {(['cheapest', 'room_mapping'] as const).map(m => (
          <label key={m} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`mode-${competitor.id}`}
              checked={mode === m}
              onChange={() => modeMutation.mutate(m)}
              className="accent-[var(--color-primary)]"
            />
            <span className="text-sm text-[var(--color-text)]">
              {m === 'cheapest' ? 'Cheapest rate' : 'Room mapping'}
            </span>
          </label>
        ))}
      </div>

      {/* Room mapping panel */}
      {mode === 'room_mapping' && (
        <div className="space-y-3">
          {noResults ? (
            <p className="text-xs text-[var(--color-text-muted)] italic">
              {neverRun
                ? 'Run the competitor first to see available rooms.'
                : 'No rooms found in the last run. Check the search URL and try running again.'}
            </p>
          ) : (
            <>
              {/* Auto-map button */}
              {ownRooms.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={autoMutation.isPending}
                    onClick={() => autoMutation.mutate()}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-background,#f9fafb)] transition-colors"
                  >
                    {autoMutation.isPending ? 'Mapping…' : 'Auto-map'}
                  </button>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    Suggests matches — override below
                  </span>
                </div>
              )}

              {/* Mapping table */}
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-background,#f9fafb)]">
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">Competitor room</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">My Hotel room</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {compRooms.map(cr => (
                      <tr key={cr}>
                        <td className="px-3 py-2 text-[var(--color-text)]">{cr}</td>
                        <td className="px-3 py-2">
                          {ownRooms.length === 0 ? (
                            <span className="text-[var(--color-text-muted)] italic">No own-hotel rooms yet</span>
                          ) : (
                            <select
                              value={draft[cr] ?? ''}
                              onChange={e => setDraft(prev => ({ ...prev, [cr]: e.target.value }))}
                              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                            >
                              <option value="">— not mapped —</option>
                              {ownRooms.map(o => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save mapping'}
                </button>
                {saveMutation.isSuccess && (
                  <span className="text-xs text-[var(--color-success,#16a34a)]">Saved</span>
                )}
                {saveMutation.isError && (
                  <span className="text-xs text-[var(--color-error,#dc2626)]">Save failed</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Section C: Competitors ────────────────────────────────────────────────────

interface CompetitorsSectionProps {
  propertyId: number
  orgId: number | null
  maxCompetitors: number
}

function CompetitorsSection({ propertyId, orgId, maxCompetitors }: CompetitorsSectionProps) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [selectedCompId, setSelectedCompId] = useState<number | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set())
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const competitorsQuery = useQuery({
    queryKey: ['compset-competitors', propertyId],
    queryFn: () => apiClient.getCompSetCompetitors(propertyId),
    refetchInterval: (query) =>
      query.state.data?.some((c) => c.status === 'fetching') ? 2000 : false,
  })

  const runAllMutation = useMutation({
    mutationFn: () => apiClient.runCompSet(propertyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-competitors', propertyId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteCompSetCompetitor(id),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ['compset-competitors', propertyId] })
      setDeleteConfirmId(null)
      setDeleteErr(null)
      if (selectedCompId === id) setSelectedCompId(null)
    },
    onError: (e) => setDeleteErr(e instanceof Error ? e.message : 'Delete failed'),
  })

  async function runSingle(id: number) {
    setRunningIds((prev) => new Set([...prev, id]))
    try {
      await apiClient.runSingleCompSet(id)
      void qc.invalidateQueries({ queryKey: ['compset-competitors', propertyId] })
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Run failed')
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const resultsQuery = useQuery({
    queryKey: ['compset-results', propertyId],
    queryFn: () => apiClient.getCompSetResults(propertyId),
    staleTime: 30_000,
  })

  const competitors = competitorsQuery.data ?? []
  const results = resultsQuery.data ?? []
  const maxReached = competitors.length >= maxCompetitors
  const activeId = selectedCompId ?? competitors[0]?.id ?? null
  const selectedComp = competitors.find((c) => c.id === activeId) ?? null

  return (
    <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      {/* Buttons row — always at the top */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={runAllMutation.isPending || competitors.some((c) => c.status === 'fetching')}
          onClick={() => runAllMutation.mutate()}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-background,#f9fafb)] transition-colors"
        >
          {runAllMutation.isPending ? 'Starting…' : 'Run All'}
        </button>

        <div className="relative group">
          <button
            type="button"
            disabled={maxReached || showAdd}
            onClick={() => { setShowAdd(true); setSelectedCompId(null) }}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-background,#f9fafb)] transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Competitor
          </button>
          {maxReached && (
            <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover:block w-max max-w-[200px] rounded-lg bg-[var(--color-text)] px-3 py-2 text-xs text-white shadow-lg">
              Maximum of {maxCompetitors} competitors reached
            </div>
          )}
        </div>
      </div>

      {competitorsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-[var(--color-border)]" />
          ))}
        </div>
      ) : (
        <>
          {/* Competitor sub-tabs */}
          {competitors.length > 0 && (
            <div className="flex gap-1 border-b border-[var(--color-border)] overflow-x-auto">
              {competitors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setSelectedCompId(c.id); setShowAdd(false) }}
                  className={[
                    'shrink-0 px-3 py-1.5 text-sm font-medium transition-colors truncate max-w-[160px]',
                    !showAdd && activeId === c.id
                      ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)] -mb-px'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                  ].join(' ')}
                  title={c.name}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Selected competitor detail */}
          {!showAdd && selectedComp && (
            <div className="space-y-4">
              <CompetitorCard
                competitor={selectedComp}
                onRun={() => void runSingle(selectedComp.id)}
                isRunning={runningIds.has(selectedComp.id)}
                onDelete={() => deleteMutation.mutate(selectedComp.id)}
                isDeleting={deleteMutation.isPending && deleteConfirmId === selectedComp.id}
                deleteConfirm={deleteConfirmId === selectedComp.id}
                onDeleteRequest={() => setDeleteConfirmId(selectedComp.id)}
                onDeleteCancel={() => setDeleteConfirmId(null)}
              />
              <MappingSection competitor={selectedComp} results={results} />
            </div>
          )}

          {!showAdd && competitors.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)] italic">
              No competitors added yet. Click &quot;Add Competitor&quot; to get started.
            </p>
          )}
        </>
      )}

      {showAdd && (
        <AddCompetitorForm
          propertyId={propertyId}
          orgId={orgId}
          onSaved={() => { setShowAdd(false); void qc.invalidateQueries({ queryKey: ['compset-competitors', propertyId] }) }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {runAllMutation.isError && (
        <p className="text-sm text-[var(--color-error,#dc2626)]">
          {runAllMutation.error instanceof Error ? runAllMutation.error.message : 'Run failed'}
        </p>
      )}

      {runError && (
        <p className="text-xs text-[var(--color-error,#dc2626)]">{runError}</p>
      )}

      {deleteErr && (
        <p className="text-xs text-[var(--color-error,#dc2626)]">{deleteErr}</p>
      )}
    </section>
  )
}

// ── Section D: Results ───────────────────────────────────────────────────────

function ResultCell({ result }: { result: CompSetResult | undefined }) {
  if (!result) return <td className="py-2.5 text-right text-xs text-[var(--color-text-muted)]" colSpan={5}>—</td>
  if (result.searchStatus === 'error') {
    return <td className="py-2.5 text-right text-xs text-red-500" colSpan={5}>Error</td>
  }
  if (result.searchStatus === 'not_found' || result.pricePerNight == null) {
    return <td className="py-2.5 text-right text-xs text-[var(--color-text-muted)] italic" colSpan={5}>Not found</td>
  }
  const cur = result.currency ?? ''
  return (
    <>
      <td className="py-2.5 text-xs text-[var(--color-text-muted)] max-w-[140px] truncate" title={result.roomName ?? undefined}>
        {result.roomName ?? '—'}
      </td>
      <td className="py-2.5 text-xs text-[var(--color-text-muted)]">{result.board ?? '—'}</td>
      <td className="py-2.5 text-xs text-[var(--color-text-muted)]">{result.cancellation ?? '—'}</td>
      <td className="py-2.5 text-right font-semibold text-[var(--color-text)]">
        {cur}{cur ? ' ' : ''}{result.pricePerNight.toLocaleString()}
      </td>
      <td className="py-2.5 text-right text-xs text-[var(--color-text-muted)]">
        {result.total != null ? `${cur}${cur ? ' ' : ''}${result.total.toLocaleString()}` : '—'}
      </td>
    </>
  )
}

function ResultsSection({ propertyId, orgId }: { propertyId: number; orgId: number | null }) {
  const resultsQuery = useQuery({
    queryKey: ['compset-results', propertyId],
    queryFn: () => apiClient.getCompSetResults(propertyId),
    refetchInterval: 8_000,
  })

  const competitorsQuery = useQuery({
    queryKey: ['compset-competitors', propertyId],
    queryFn: () => apiClient.getCompSetCompetitors(propertyId),
  })

  const paramsQuery = useQuery({
    queryKey: ['compset-search-params', propertyId, orgId],
    queryFn: () =>
      apiClient.getCompSetSearchParams({
        propertyId,
        ...(orgId !== null ? { orgId } : {}),
        effective: true,
      }),
  })

  const results = resultsQuery.data ?? []
  const competitors = competitorsQuery.data ?? []
  const params = paramsQuery.data ?? []

  if (resultsQuery.isLoading) return null

  const compById = new Map(competitors.map(c => [c.id, c]))
  const paramById = new Map(params.map(p => [p.id, p]))

  // Hide results whose check-in date has already passed
  const today = new Date().toISOString().split('T')[0]!
  const freshResults = results.filter(r => r.checkIn >= today)

  // unique param IDs ordered by first appearance in fresh results
  const paramIds = [...new Set(freshResults.map(r => r.searchParamId))]
  // unique competitor IDs ordered by first appearance
  const competitorIds = [...new Set(
    freshResults.map(r => r.competitorId).filter((id): id is number => id !== null)
  )]

  function bestResult(paramId: number, compId: number | null): CompSetResult | undefined {
    const rows = freshResults.filter(r => r.searchParamId === paramId && r.competitorId === compId)
    const found = rows.filter(r => r.searchStatus === 'found' && r.pricePerNight != null)
    if (found.length > 0) {
      return found.reduce((best, r) =>
        (r.pricePerNight ?? Infinity) < (best.pricePerNight ?? Infinity) ? r : best
      )
    }
    return rows[0]
  }

  const hasOwnResults = freshResults.some(r => r.competitorId === null)

  function fmtDate(iso: string): string {
    try {
      const [y, m, d] = iso.split('-')
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      return `${parseInt(d!)} ${MONTHS[parseInt(m!) - 1]} ${y}`
    } catch { return iso }
  }

  const lastFetch = results[0] ? fmtDateTime(results[0].fetchedAt) : null

  return (
    <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Results</h2>
        {lastFetch && (
          <span className="text-xs text-[var(--color-text-muted)]">Last run: {lastFetch}</span>
        )}
      </div>

      {freshResults.length === 0 ? (
        <p className="text-sm italic text-[var(--color-text-muted)]">
          {results.length > 0
            ? 'All results are for past dates. Run again to fetch current availability.'
            : 'No results yet. Add competitors and click Run to fetch price data.'}
        </p>
      ) : (
        <div className="space-y-6">
          {paramIds.map(paramId => {
            const param = paramById.get(paramId)
            const label = param?.label ?? `Config #${paramId}`
            const sampleResult = results.find(r => r.searchParamId === paramId)
            const dateRange = sampleResult
              ? `${fmtDate(sampleResult.checkIn)} → ${fmtDate(sampleResult.checkOut)}`
              : null
            return (
              <div key={paramId}>
                <div className="mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    {label}
                  </p>
                  {dateRange && (
                    <p className="text-xs text-[var(--color-text-muted)]">{dateRange}</p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        <th className="pb-2 text-left text-xs font-semibold text-[var(--color-text-muted)]">Competitor</th>
                        <th className="pb-2 text-left text-xs font-semibold text-[var(--color-text-muted)]">Room</th>
                        <th className="pb-2 text-left text-xs font-semibold text-[var(--color-text-muted)]">Board</th>
                        <th className="pb-2 text-left text-xs font-semibold text-[var(--color-text-muted)]">Cancel.</th>
                        <th className="pb-2 text-right text-xs font-semibold text-[var(--color-text-muted)]">Per night</th>
                        <th className="pb-2 text-right text-xs font-semibold text-[var(--color-text-muted)]">Total</th>
                        <th className="pb-2 text-right text-xs font-semibold text-[var(--color-text-muted)]">Fetched</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {hasOwnResults && (() => {
                        const result = bestResult(paramId, null)
                        return (
                          <tr key="own" className="bg-[var(--color-primary)]/5">
                            <td className="py-2.5 font-semibold text-[var(--color-primary)]">
                              My Hotel
                            </td>
                            <ResultCell result={result} />
                            <td className="py-2.5 text-right text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                              {result?.fetchedAt ? fmtDateTime(result.fetchedAt) : '—'}
                            </td>
                          </tr>
                        )
                      })()}
                      {competitorIds.map(compId => {
                        const comp = compById.get(compId)
                        const result = bestResult(paramId, compId)
                        return (
                          <tr key={compId}>
                            <td className="py-2.5 font-medium text-[var(--color-text)]">
                              {comp?.name ?? `#${compId}`}
                            </td>
                            <ResultCell result={result} />
                            <td className="py-2.5 text-right text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                              {result?.fetchedAt ? fmtDateTime(result.fetchedAt) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = ['Search Configurations', 'Competitors', 'Results'] as const
type Tab = typeof TABS[number]

export default function CompSetPage() {
  const { admin } = useAdminAuth()
  const { propertyId, orgId } = useAdminProperty()
  const [activeTab, setActiveTab] = useState<Tab>('Search Configurations')

  if (!admin) return null

  const isSuper = admin.role === 'super'
  const effectiveOrgId = orgId ?? admin.organizationId
  const isSystemLevel = isSuper && orgId === null && propertyId === null

  const sysConfigQuery = useQuery({
    queryKey: ['compset-system-config'],
    queryFn: () => apiClient.getCompSetSystemConfig(),
    enabled: isSuper,
  })
  const maxCompetitors = sysConfigQuery.data?.maxCompetitorsPerProperty ?? 10

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">CompSet</h1>

      {/* Tab bar */}
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

      {/* Tab: Search Configurations */}
      {activeTab === 'Search Configurations' && (
        <div className="space-y-6">
          {isSystemLevel && <SystemConfigPanel />}
          <SearchConfigSection
            propertyId={propertyId}
            orgId={effectiveOrgId}
            isSuper={isSuper}
          />
        </div>
      )}

      {/* Tab: Competitors */}
      {activeTab === 'Competitors' && (
        propertyId !== null ? (
          <CompetitorsSection
            propertyId={propertyId}
            orgId={effectiveOrgId}
            maxCompetitors={maxCompetitors}
          />
        ) : (
          <p className="text-sm text-[var(--color-text-muted)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            Select a property to manage competitors.
          </p>
        )
      )}

      {/* Tab: Results */}
      {activeTab === 'Results' && (
        propertyId !== null ? (
          <ResultsSection propertyId={propertyId} orgId={effectiveOrgId} />
        ) : (
          <p className="text-sm text-[var(--color-text-muted)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            Select a property to view results.
          </p>
        )
      )}
    </main>
  )
}
