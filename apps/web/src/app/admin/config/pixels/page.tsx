'use client'

import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TrackingPixel, CreateTrackingPixelRequest, UpdateTrackingPixelRequest, TrackingPage } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../../property-context'

const PAGE_OPTIONS: { value: TrackingPage; label: string }[] = [
  { value: 'all', label: 'All pages' },
  { value: 'home', label: 'Home' },
  { value: 'search', label: 'Search results' },
  { value: 'booking', label: 'Booking / Checkout' },
  { value: 'confirmation', label: 'Booking confirmation' },
]

interface FormState {
  name: string
  code: string
  pages: TrackingPage[]
  isActive: boolean
}

const DEFAULT_FORM: FormState = { name: '', code: '', pages: ['all'], isActive: true }

export default function TrackingPixelsPage() {
  const { propertyId } = useAdminProperty()
  if (propertyId === undefined) return null
  return propertyId === null
    ? <PixelEditor
        queryKey={['tracking-pixels-org']}
        listFn={() => apiClient.listTrackingPixels()}
        createFn={(data) => apiClient.createTrackingPixel(data)}
        description="Org-level pixels fire on all properties. Add property-specific pixels by selecting a property."
      />
    : <PixelEditor
        key={propertyId}
        queryKey={['tracking-pixels-property', propertyId]}
        listFn={() => apiClient.listPropertyTrackingPixels(propertyId)}
        createFn={(data) => apiClient.createPropertyTrackingPixel(propertyId, data)}
        description="These pixels fire only on this property's pages. Org-level pixels also apply."
      />
}

// ── Shared editor ──────────────────────────────────────────────────────────────

function PixelEditor({
  queryKey,
  listFn,
  createFn,
  description,
}: {
  queryKey: unknown[]
  listFn: () => Promise<TrackingPixel[]>
  createFn: (data: CreateTrackingPixelRequest) => Promise<TrackingPixel>
  description: string
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pixels, setPixels] = useState<TrackingPixel[]>([])
  const [showForm, setShowForm] = useState(false)

  const { data: serverPixels, isLoading } = useQuery<TrackingPixel[]>({
    queryKey,
    queryFn: listFn,
  })

  useEffect(() => {
    if (serverPixels !== undefined) setPixels(serverPixels)
  }, [serverPixels])

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey })
  }, [qc, queryKey])

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: (payload: CreateTrackingPixelRequest | { id: number; data: UpdateTrackingPixelRequest }) => {
      if ('id' in payload) return apiClient.updateTrackingPixel(payload.id, payload.data)
      return createFn(payload)
    },
    onSuccess: () => {
      invalidate()
      setForm(DEFAULT_FORM)
      setEditingId(null)
      setShowForm(false)
      setSaveError(null)
    },
    onError: (err: unknown) => setSaveError(err instanceof Error ? err.message : 'Unknown error'),
  })

  async function handleDelete(id: number) {
    setPixels(prev => prev.filter(p => p.id !== id))
    setDeleteConfirm(null)
    try {
      await apiClient.deleteTrackingPixel(id)
      invalidate()
    } catch {
      invalidate()
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function togglePage(page: TrackingPage) {
    setForm(prev => {
      const has = prev.pages.includes(page)
      if (has) {
        const next = prev.pages.filter(p => p !== page)
        return { ...prev, pages: next.length === 0 ? [page] : next }
      }
      return { ...prev, pages: [...prev.pages, page] }
    })
  }

  function handleEdit(px: TrackingPixel) {
    setEditingId(px.id)
    setShowForm(true)
    setSaveError(null)
    setForm({ name: px.name, code: px.code, pages: px.pages, isActive: px.isActive })
  }

  function handleCancel() {
    setEditingId(null)
    setShowForm(false)
    setSaveError(null)
    setForm(DEFAULT_FORM)
  }

  function handleSubmit() {
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      pages: form.pages,
      isActive: form.isActive,
    }
    if (editingId !== null) {
      save({ id: editingId, data: payload })
    } else {
      save(payload)
    }
  }

  const isEditing = editingId !== null

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Tracking & Analytics</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          >
            Add pixel
          </button>
        )}
      </div>

      {/* ── Warning ──────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span>Scripts are executed as-is in visitors&apos; browsers. Only add code from trusted sources.</span>
      </div>

      {/* ── Form ─────────────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">
            {isEditing ? 'Edit pixel' : 'New tracking pixel'}
          </h2>

          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Google Analytics, Meta Pixel"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Code
              </label>
              <textarea
                value={form.code}
                onChange={e => set('code', e.target.value)}
                placeholder={'<script>\n  // paste your tracking script here\n</script>'}
                rows={8}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Pages
              </label>
              <div className="flex flex-wrap gap-2">
                {PAGE_OPTIONS.map(opt => {
                  const active = form.pages.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => togglePage(opt.value)}
                      className={[
                        'rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all',
                        active
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Status
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set('isActive', true)}
                  className={[
                    'flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all',
                    form.isActive
                      ? 'border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                  ].join(' ')}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => set('isActive', false)}
                  className={[
                    'flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all',
                    !form.isActive
                      ? 'border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-error)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                  ].join(' ')}
                >
                  Inactive
                </button>
              </div>
            </div>
          </div>

          {saveError && (
            <div className="mt-4 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-4 py-2 text-sm text-[var(--color-error)]">
              {saveError}
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving || !form.name.trim() || !form.code.trim() || form.pages.length === 0}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Add pixel'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : pixels.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
            No tracking pixels yet. Add one above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                <Th>Name</Th>
                <Th>Pages</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {pixels.map(px => (
                <tr
                  key={px.id}
                  className={editingId === px.id ? 'bg-[var(--color-primary-light)]' : 'hover:bg-[var(--color-background)]'}
                >
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{px.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {px.pages.map(p => (
                        <span
                          key={p}
                          className="rounded-full bg-[var(--color-border)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]"
                        >
                          {PAGE_OPTIONS.find(o => o.value === p)?.label ?? p}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={[
                      'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      px.isActive
                        ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                        : 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
                    ].join(' ')}>
                      {px.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(px)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
                      >
                        Edit
                      </button>
                      {deleteConfirm === px.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(px.id)}
                            className="rounded-md bg-[var(--color-error)] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:opacity-90"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(px.id)}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-error)]/70 transition-colors hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
      {children}
    </th>
  )
}
