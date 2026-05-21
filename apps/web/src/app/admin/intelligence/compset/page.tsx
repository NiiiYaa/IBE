'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../../property-context'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { SaveBar } from '@/app/admin/design/components'
import type {
  SystemCompSetConfig,
  CompSetSearchParam,
  CompSetCompetitor,
  CompSetSearchParamCreate,
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
        <input
          type="text"
          value={cronSchedule}
          onChange={(e) => {
            setCronSchedule(e.target.value)
            markDirty()
          }}
          placeholder="0 2 * * *"
          className={inputClass('font-mono max-w-[240px]')}
        />
        <p className="text-xs text-[var(--color-text-muted)]">
          Standard cron expression (e.g. <code className="font-mono">0 2 * * *</code> = daily at 02:00 UTC)
        </p>
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
  const [countryCode, setCountryCode] = useState('US')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onAdd({ offsetDays, nights, adults, countryCode: countryCode.trim().toUpperCase() })
  }

  const fieldClass = inputClass('max-w-[100px]')

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background,#f9fafb)] p-4 space-y-3">
      <p className="text-sm font-medium text-[var(--color-text)]">Add search parameter</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Offset days</label>
          <input
            type="number"
            min={1}
            max={365}
            value={offsetDays}
            onChange={(e) => setOffsetDays(Number(e.target.value))}
            className={fieldClass}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Nights</label>
          <input
            type="number"
            min={1}
            max={30}
            value={nights}
            onChange={(e) => setNights(Number(e.target.value))}
            className={fieldClass}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Adults</label>
          <input
            type="number"
            min={1}
            max={10}
            value={adults}
            onChange={(e) => setAdults(Number(e.target.value))}
            className={fieldClass}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Country code</label>
          <input
            type="text"
            maxLength={2}
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            placeholder="US"
            className={inputClass('w-[72px] uppercase font-mono')}
            required
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {isPending ? 'Adding…' : 'Add'}
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
    </form>
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
  const [deleteErr, setDeleteErr] = useState<string | null>(null)

  // Current tier
  const currentTier: 'system' | 'chain' | 'hotel' = propertyId
    ? 'hotel'
    : orgId
    ? 'chain'
    : 'system'

  // Fetch all effective params (including inherited)
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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteCompSetSearchParam(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-search-params'] })
      setDeleteConfirmId(null)
      setDeleteErr(null)
    },
    onError: (e) => setDeleteErr(e instanceof Error ? e.message : 'Delete failed'),
  })

  const params = paramsQuery.data ?? []

  // Tier ordering
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
                Inherited
              </p>
              {inheritedParams.map((param) => (
                <ParamRow key={param.id} param={param} readOnly />
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
                  readOnly={false}
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
    </section>
  )
}

interface ParamRowProps {
  param: CompSetSearchParam
  readOnly: boolean
  deleteConfirm?: boolean
  onDeleteRequest?: () => void
  onDeleteConfirm?: () => void
  onDeleteCancel?: () => void
  isDeleting?: boolean
}

function ParamRow({
  param,
  readOnly,
  deleteConfirm,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  isDeleting,
}: ParamRowProps) {
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-lg border px-4 py-3',
        readOnly
          ? 'border-[var(--color-border)] bg-[var(--color-background,#f9fafb)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)]',
      ].join(' ')}
    >
      <TierBadge tier={param.tier} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-text)] font-medium">{param.label}</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          +{param.offsetDays}d · {param.nights}n · {param.adults}A · {param.countryCode}
        </p>
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2 shrink-0">
          {!deleteConfirm && (
            <button
              type="button"
              onClick={onDeleteRequest}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error,#dc2626)] transition-colors"
            >
              Remove
            </button>
          )}
          {deleteConfirm && (
            <>
              <span className="text-xs text-[var(--color-text-muted)]">Remove?</span>
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
        </div>
      )}
    </div>
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
  const [rawUrl, setRawUrl] = useState('')
  const [template, setTemplate] = useState('')
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const analyzeMutation = useMutation({
    mutationFn: () =>
      apiClient.analyzeExternalIBEUrls({
        urls: rawUrl
          .split('\n')
          .map((u) => u.trim())
          .filter(Boolean),
        type: 'search',
        ...(orgId !== null ? { orgId } : {}),
        propertyId,
      }),
    onSuccess: (r) => {
      setTemplate(r.template)
      setAnalyzeError(null)
    },
    onError: (e: unknown) =>
      setAnalyzeError(e instanceof Error ? e.message : 'Analysis failed'),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.createCompSetCompetitor({
        propertyId,
        name: name.trim(),
        searchUrl: template.trim() || null,
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

      <div className="space-y-1">
        <label className="block text-xs font-medium text-[var(--color-text-muted)]">
          Sample URL(s) — paste one or more search page URLs
        </label>
        <textarea
          value={rawUrl}
          onChange={(e) => setRawUrl(e.target.value)}
          placeholder="https://..."
          rows={3}
          className={[
            'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]',
            'px-3 py-2 font-mono text-sm text-[var(--color-text)]',
            'placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none',
          ].join(' ')}
        />
      </div>

      <button
        type="button"
        disabled={!rawUrl.trim() || analyzeMutation.isPending}
        onClick={() => analyzeMutation.mutate()}
        className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-surface)] transition-colors"
      >
        {analyzeMutation.isPending ? 'Analysing…' : 'Analyse URL'}
      </button>

      {analyzeError && (
        <p className="text-sm text-[var(--color-error,#dc2626)]">{analyzeError}</p>
      )}

      {(template || analyzeMutation.isSuccess) && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[var(--color-text-muted)]">
            URL template (editable)
          </label>
          <input
            type="text"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className={inputClass('font-mono')}
            placeholder="https://..."
          />
        </div>
      )}

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

// ── Section C: Competitors ────────────────────────────────────────────────────

interface CompetitorsSectionProps {
  propertyId: number
  orgId: number | null
  maxCompetitors: number
}

function CompetitorsSection({ propertyId, orgId, maxCompetitors }: CompetitorsSectionProps) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compset-competitors', propertyId] })
      setDeleteConfirmId(null)
      setDeleteErr(null)
    },
    onError: (e) => setDeleteErr(e instanceof Error ? e.message : 'Delete failed'),
  })

  async function runSingle(id: number) {
    setRunningIds((prev) => new Set([...prev, id]))
    try {
      await apiClient.runCompSet(propertyId)
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

  const competitors = competitorsQuery.data ?? []
  const maxReached = competitors.length >= maxCompetitors

  return (
    <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Competitors</h2>
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
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-background,#f9fafb)] transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Competitor
            </button>
            {maxReached && (
              <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block w-max max-w-[200px] rounded-lg bg-[var(--color-text)] px-3 py-2 text-xs text-white shadow-lg">
                Maximum of {maxCompetitors} competitors reached
              </div>
            )}
          </div>
        </div>
      </div>

      {competitorsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--color-border)]" />
          ))}
        </div>
      ) : (
        <>
          {competitors.length === 0 && !showAdd && (
            <p className="text-sm text-[var(--color-text-muted)] italic">
              No competitors added yet. Click &quot;Add Competitor&quot; to get started.
            </p>
          )}

          <div className="space-y-3">
            {competitors.map((c) => (
              <CompetitorCard
                key={c.id}
                competitor={c}
                onRun={() => void runSingle(c.id)}
                isRunning={runningIds.has(c.id)}
                onDelete={() => deleteMutation.mutate(c.id)}
                isDeleting={deleteMutation.isPending && deleteConfirmId === c.id}
                deleteConfirm={deleteConfirmId === c.id}
                onDeleteRequest={() => setDeleteConfirmId(c.id)}
                onDeleteCancel={() => setDeleteConfirmId(null)}
              />
            ))}
          </div>
        </>
      )}

      {showAdd && (
        <AddCompetitorForm
          propertyId={propertyId}
          orgId={orgId}
          onSaved={() => setShowAdd(false)}
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CompSetPage() {
  const { admin } = useAdminAuth()
  const { propertyId, orgId } = useAdminProperty()

  if (!admin) return null

  const isSuper = admin.role === 'super'
  const effectiveOrgId = orgId ?? admin.organizationId

  // System level: super admin, no org selected, no property selected
  const isSystemLevel = isSuper && orgId === null && propertyId === null

  // Fetch system config to get maxCompetitors for CompetitorsSection
  const sysConfigQuery = useQuery({
    queryKey: ['compset-system-config'],
    queryFn: () => apiClient.getCompSetSystemConfig(),
    enabled: isSuper,
  })

  const maxCompetitors = sysConfigQuery.data?.maxCompetitorsPerProperty ?? 10

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">CompSet</h1>

      {/* Section A — System Config (super admin, system level only) */}
      {isSystemLevel && <SystemConfigPanel />}

      {/* Section B — Search Configurations (always visible) */}
      <SearchConfigSection
        propertyId={propertyId}
        orgId={effectiveOrgId}
        isSuper={isSuper}
      />

      {/* Section C — Competitors (only when a property is selected) */}
      {propertyId !== null && (
        <CompetitorsSection
          propertyId={propertyId}
          orgId={effectiveOrgId}
          maxCompetitors={maxCompetitors}
        />
      )}

      {/* Prompt when no property is selected and not system level */}
      {propertyId === null && !isSystemLevel && (
        <p className="text-sm text-[var(--color-text-muted)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          Select a property to manage competitors.
        </p>
      )}
    </main>
  )
}
