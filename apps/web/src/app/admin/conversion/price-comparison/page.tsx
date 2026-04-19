'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import type { PriceComparisonOta } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../../property-context'

const DEFAULT_PROPERTY_ID = Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID'])

function extractHotelKey(input: string): string | null {
  const match = input.match(/g\d+-d\d+/)
  return match ? match[0] : null
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
      ].join(' ')}
    >
      <span className={[
        'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200',
        checked ? 'translate-x-4' : 'translate-x-0',
      ].join(' ')} />
    </button>
  )
}

function EnableSection({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()

  const { data: config } = useQuery({
    queryKey: ['admin-config', propertyId],
    queryFn: () => apiClient.getHotelConfigAdmin(propertyId),
    staleTime: Infinity,
  })

  const { mutate, isPending } = useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient.updateHotelConfig(propertyId, { priceComparisonEnabled: enabled }),
    onSuccess: (fresh) => {
      qc.setQueryData(['admin-config', propertyId], fresh)
      qc.setQueryData(['hotel-config', propertyId], fresh)
    },
  })

  const enabled = config?.priceComparisonEnabled ?? true

  return (
    <div className="mb-6 flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
      <div>
        <p className="text-sm font-semibold text-[var(--color-text)]">Price Comparison Widget</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          When enabled, guests see live OTA prices next to your direct rate on the search results page.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 ml-6">
        {isPending && <span className="text-xs text-[var(--color-text-muted)]">Saving…</span>}
        <Toggle checked={enabled} onChange={(v) => mutate(v)} />
        <span className={`text-sm font-medium ${enabled ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
    </div>
  )
}

function TripAdvisorSection({ propertyId }: { propertyId: number }) {
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

  const extractedKey = extractHotelKey(urlInput)
  const currentKey = config?.tripadvisorHotelKey ?? null
  const isDirty = extractedKey !== currentKey

  return (
    <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">TripAdvisor Hotel Key</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          Paste your hotel's TripAdvisor URL to enable live price comparison via the Xotelo API — no scraping needed.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">TripAdvisor URL or hotel key</label>
        <input
          type="text"
          placeholder="https://www.tripadvisor.com/Hotel_Review-g293916-d305496-... or g293916-d305496"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
        />
        {urlInput && (
          <p className="mt-1 text-xs">
            {extractedKey
              ? <span className="text-[var(--color-success)]">Hotel key detected: <strong>{extractedKey}</strong></span>
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
  )
}

const KNOWN_OTAS = ['Booking.com', 'Expedia', 'Hotels.com', 'Agoda', 'TripAdvisor', 'Airbnb', 'Google Hotels']

interface OtaFormState {
  name: string
  url: string
  isEnabled: boolean
}

const EMPTY_FORM: OtaFormState = { name: '', url: '', isEnabled: true }

function OtaForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: OtaFormState
  onSave: (s: OtaFormState) => Promise<void>
  onCancel: () => void
}) {
  const [state, setState] = useState<OtaFormState>(initial)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const isCustomName = !KNOWN_OTAS.includes(state.name) && state.name !== ''

  async function handleSubmit() {
    if (!state.name.trim()) { setError('OTA name is required'); return }
    if (!state.url.trim()) { setError('Hotel URL is required'); return }
    try { new URL(state.url.trim()) } catch { setError('Enter a valid URL'); return }
    setError(null)
    setIsPending(true)
    try {
      await onSave(state)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">OTA</label>
          <select
            value={isCustomName ? '__custom__' : state.name}
            onChange={e => setState(s => ({ ...s, name: e.target.value === '__custom__' ? '' : e.target.value }))}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
          >
            <option value="">Select OTA…</option>
            {KNOWN_OTAS.map(n => <option key={n} value={n}>{n}</option>)}
            <option value="__custom__">Other (custom name)</option>
          </select>
          {(isCustomName || state.name === '') && (
            <input
              type="text"
              placeholder="e.g. Kayak"
              value={state.name}
              onChange={e => setState(s => ({ ...s, name: e.target.value }))}
              className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
            />
          )}
        </div>

        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <Toggle checked={state.isEnabled} onChange={v => setState(s => ({ ...s, isEnabled: v }))} />
            <span className="text-sm text-[var(--color-text)]">Enabled</span>
          </label>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Hotel page URL</label>
        <input
          type="url"
          placeholder="https://www.booking.com/hotel/..."
          value={state.url}
          onChange={e => setState(s => ({ ...s, url: e.target.value }))}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
        />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Paste your hotel page URL from this OTA — with or without dates. Check-in, check-out and guest counts are automatically replaced from the guest's search when fetching prices.
        </p>
      </div>

      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function OtaRow({
  ota,
  onToggle,
  onEdit,
  onDelete,
}: {
  ota: PriceComparisonOta
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const hostname = (() => { try { return new URL(ota.url).hostname } catch { return ota.url } })()

  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
      <div className="flex items-center gap-4 min-w-0">
        <Toggle checked={ota.isEnabled} onChange={onToggle} />
        <div className="min-w-0">
          <p className="font-medium text-[var(--color-text)]">{ota.name}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]" title={ota.url}>{hostname}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 ml-4">
        <a
          href={ota.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open OTA page"
          className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open
        </a>
        <button
          onClick={onEdit}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          Edit
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--color-error)]">Delete?</span>
            <button
              onClick={onDelete}
              className="rounded-lg bg-[var(--color-error)] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-80"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-error)] hover:text-[var(--color-error)]"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

export default function PriceComparisonPage() {
  const qc = useQueryClient()
  const { propertyId: adminPropertyId } = useAdminProperty()
  const propertyId = adminPropertyId ?? DEFAULT_PROPERTY_ID
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data: otas = [], isLoading } = useQuery<PriceComparisonOta[]>({
    queryKey: ['price-comparison-otas'],
    queryFn: () => apiClient.listPriceComparisonOtas(),
  })

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['price-comparison-otas'] })
  }

  async function handleAdd(state: OtaFormState): Promise<void> {
    await apiClient.createPriceComparisonOta(state)
    setShowAddForm(false)
    invalidate()
  }

  async function handleEdit(id: number, state: OtaFormState): Promise<void> {
    await apiClient.updatePriceComparisonOta(id, state)
    setEditingId(null)
    invalidate()
  }

  async function handleToggle(ota: PriceComparisonOta) {
    try {
      await apiClient.updatePriceComparisonOta(ota.id, { isEnabled: !ota.isEnabled })
    } finally {
      invalidate()
    }
  }

  async function handleDelete(id: number) {
    try {
      await apiClient.deletePriceComparisonOta(id)
    } finally {
      invalidate()
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Price Comparison</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Show guests how your direct rate compares to OTAs in real time.
        </p>
      </div>

      <EnableSection propertyId={propertyId} />

      <TripAdvisorSection propertyId={propertyId} />

      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">OTA Fallback URLs</h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Used when no TripAdvisor key is configured. Prices are scraped via browser automation.
          </p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => { setShowAddForm(true); setEditingId(null) }}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          >
            + Add OTA
          </button>
        )}
      </div>

      <div className="mt-4">
        {showAddForm && (
          <div className="mb-4">
            <OtaForm
              initial={EMPTY_FORM}
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        )}

        {otas.length === 0 && !showAddForm ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center">
            <p className="text-sm font-medium text-[var(--color-text)]">No OTA URLs added</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Add Booking.com, Expedia or any OTA where your hotel is listed.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {otas.map(ota => (
              editingId === ota.id ? (
                <OtaForm
                  key={ota.id}
                  initial={{ name: ota.name, url: ota.url, isEnabled: ota.isEnabled }}
                  onSave={s => handleEdit(ota.id, s)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <OtaRow
                  key={ota.id}
                  ota={ota}
                  onToggle={() => handleToggle(ota)}
                  onEdit={() => { setEditingId(ota.id); setShowAddForm(false) }}
                  onDelete={() => handleDelete(ota.id)}
                />
              )
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
