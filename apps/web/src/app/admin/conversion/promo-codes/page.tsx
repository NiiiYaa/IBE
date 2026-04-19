'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PromoCode, CreatePromoCodeRequest, UpdatePromoCodeRequest } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { CalendarDropdown } from '@/components/search/CalendarDropdown'
import { useAdminProperty } from '../../property-context'

function effectiveActive(p: PromoCode): boolean {
  return p.propertyEnabled ?? p.isActive
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function generateCode(length: number): string {
  return Array.from({ length }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function toInputDate(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  code: string
  discountValue: number
  hasExpiry: boolean
  validFrom: string
  validTo: string
  validDateType: 'booking' | 'stay'
  description: string
  isLimited: boolean
  maxUses: number
  isActive: boolean
}

const DEFAULT_FORM: FormState = {
  code: generateCode(8),
  discountValue: 10,
  hasExpiry: false,
  validFrom: '',
  validTo: '',
  validDateType: 'booking',
  description: '',
  isLimited: false,
  maxUses: 100,
  isActive: true,
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PromoCodesPage() {
  const { propertyId } = useAdminProperty()
  return <PromoCodesEditor propertyId={propertyId} />
}

function PromoCodesEditor({ propertyId }: { propertyId: number | null | undefined }) {
  const scopedPropertyId = propertyId === null ? null : (propertyId ?? undefined)
  const qc = useQueryClient()
  const [codeLength, setCodeLength] = useState(8)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [codes, setCodes] = useState<PromoCode[]>([])

  const queryKey = useMemo(() => ['promo-codes', scopedPropertyId ?? 'global'], [scopedPropertyId])

  const { data: serverCodes, isLoading } = useQuery<PromoCode[]>({
    queryKey,
    queryFn: () => apiClient.listPromoCodes(scopedPropertyId),
  })

  // Keep local list in sync with server data
  useEffect(() => {
    if (serverCodes !== undefined) setCodes(serverCodes)
  }, [serverCodes])

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey })
  }, [qc, queryKey])

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: (payload: (CreatePromoCodeRequest & { propertyId?: number | null }) | { id: number; data: UpdatePromoCodeRequest }) => {
      if ('id' in payload) return apiClient.updatePromoCode(payload.id, payload.data)
      return apiClient.createPromoCode({ ...payload, propertyId: scopedPropertyId ?? null })
    },
    onSuccess: () => {
      invalidate()
      setForm({ ...DEFAULT_FORM, code: generateCode(codeLength) })
      setEditingId(null)
      setSaveError(null)
    },
    onError: (err: unknown) => setSaveError(err instanceof Error ? err.message : 'Unknown error'),
  })

  async function handleDelete(id: number) {
    setCodes(prev => prev.filter(c => c.id !== id))
    setDeleteConfirm(null)
    try {
      await apiClient.deletePromoCode(id)
      invalidate()
    } catch {
      invalidate()
    }
  }

  const { mutate: toggleOverride } = useMutation({
    mutationFn: ({ id, isEnabled }: { id: number; isEnabled: boolean }) =>
      apiClient.setPropertyOverride({ entityType: 'promo_code', entityId: id, propertyId: scopedPropertyId!, isEnabled }),
    onMutate: ({ id, isEnabled }) => {
      setCodes(prev => prev.map(c => c.id === id ? { ...c, propertyEnabled: isEnabled } : c))
    },
    onError: () => invalidate(),
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleRegenerate() {
    set('code', generateCode(codeLength))
  }

  function handleLengthChange(len: number) {
    setCodeLength(len)
    if (!editingId) set('code', generateCode(len))
  }

  function handleEdit(promo: PromoCode) {
    setEditingId(promo.id)
    setSaveError(null)
    setForm({
      code: promo.code,
      discountValue: promo.discountValue,
      hasExpiry: !!(promo.validFrom || promo.validTo),
      validFrom: toInputDate(promo.validFrom),
      validTo: toInputDate(promo.validTo),
      validDateType: promo.validDateType,
      description: promo.description ?? '',
      isLimited: promo.maxUses !== null,
      maxUses: promo.maxUses ?? 100,
      isActive: promo.isActive,
    })
  }

  function handleCancel() {
    setEditingId(null)
    setSaveError(null)
    setForm({ ...DEFAULT_FORM, code: generateCode(codeLength) })
  }

  function handleSubmit() {
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || null,
      discountValue: form.discountValue,
      maxUses: form.isLimited ? form.maxUses : null,
      validFrom: form.hasExpiry && form.validFrom ? form.validFrom : null,
      validTo: form.hasExpiry && form.validTo ? form.validTo : null,
      validDateType: form.hasExpiry ? form.validDateType : 'booking' as const,
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
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Promo Codes</h1>
        {scopedPropertyId == null
          ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">Global defaults — apply to all properties unless overridden at the property level.</p>
          : <p className="mt-1 text-sm text-[var(--color-text-muted)]">Property-specific codes plus inherited global codes.</p>}
      </div>

      {/* ── Form ─────────────────────────────────────────────────────────────── */}
      <div className="mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">
          {isEditing ? 'Edit code' : 'Generate new code'}
        </h2>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Code + length */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Code
            </label>
            {!isEditing && (
              <div className="mb-2 flex h-9 items-center gap-3">
                <span className="text-xs text-[var(--color-text-muted)]">Length</span>
                <input
                  type="range" min={4} max={16} step={1}
                  value={codeLength}
                  onChange={e => handleLengthChange(Number(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <span className="w-6 text-center text-xs font-semibold tabular-nums text-[var(--color-text)]">
                  {codeLength}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={form.code}
                onChange={e => set('code', e.target.value.toUpperCase())}
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-sm font-semibold uppercase tracking-widest text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
              />
              {!isEditing && (
                <button
                  type="button"
                  onClick={handleRegenerate}
                  title="Regenerate"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                >
                  <RefreshIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Discount */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Discount
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={1} max={100} step={1}
                value={form.discountValue}
                onChange={e => set('discountValue', Number(e.target.value))}
                className="flex-1 accent-[var(--color-primary)]"
              />
              <div className="flex h-9 w-20 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
                <input
                  type="number" min={1} max={100}
                  value={form.discountValue}
                  onChange={e => set('discountValue', Math.min(100, Math.max(1, Number(e.target.value))))}
                  className="w-full bg-transparent pl-3 text-sm font-semibold tabular-nums text-[var(--color-text)] focus:outline-none"
                />
                <span className="pr-2 text-sm text-[var(--color-text-muted)]">%</span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Description <span className="font-normal normal-case text-[var(--color-text-muted)]/60">optional</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="e.g. Summer promotion"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
            />
          </div>

          {/* Max uses */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Usage limit
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('isLimited', false)}
                className={[
                  'flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all',
                  !form.isLimited
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}
              >
                Unlimited
              </button>
              <button
                type="button"
                onClick={() => set('isLimited', true)}
                className={[
                  'flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all',
                  form.isLimited
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}
              >
                Limited
              </button>
            </div>
            {form.isLimited && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={form.maxUses}
                  onChange={e => set('maxUses', Math.max(1, Number(e.target.value)))}
                  className="w-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
                />
                <span className="text-xs text-[var(--color-text-muted)]">times</span>
              </div>
            )}
          </div>

          {/* Status */}
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

          {/* Expiry toggle */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Expiry
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('hasExpiry', false)}
                className={[
                  'flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all',
                  !form.hasExpiry
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}
              >
                No expiry
              </button>
              <button
                type="button"
                onClick={() => set('hasExpiry', true)}
                className={[
                  'flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all',
                  form.hasExpiry
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}
              >
                Date range
              </button>
            </div>
          </div>
        </div>

        {/* Date range calendar — full width, shown when expiry is set */}
        {form.hasExpiry && (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
            {/* Date type toggle */}
            <div className="mb-4 flex gap-2">
              {(['booking', 'stay'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => set('validDateType', type)}
                  className={[
                    'rounded-lg border px-4 py-1.5 text-xs font-semibold transition-all',
                    form.validDateType === type
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                  ].join(' ')}
                >
                  {type === 'booking' ? 'Booking date' : 'Stay date'}
                </button>
              ))}
              <span className="ml-2 self-center text-xs text-[var(--color-text-muted)]">
                {form.validDateType === 'booking'
                  ? 'Code valid only when the booking is made within these dates'
                  : 'Code valid only for stays falling within these dates'}
              </span>
            </div>
            <CalendarDropdown
              variant="inline"
              checkIn={form.validFrom}
              checkOut={form.validTo}
              initialField="checkin"
              onDatesChange={(from, to) => { set('validFrom', from); set('validTo', to) }}
              onClose={() => {}}
              labelStart="Start"
              labelEnd="End"
              labelDuration="Days"
            />
          </div>
        )}

        {saveError && (
          <div className="mt-4 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-4 py-2 text-sm text-[var(--color-error)]">
            {saveError}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || !form.code.trim()}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create code'}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : codes.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
            No promo codes yet. Create one above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                <Th>Code</Th>
                <Th>Discount</Th>
                <Th>Valid from</Th>
                <Th>Valid to</Th>
                <Th>Date type</Th>
                <Th>Uses</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {codes.map(promo => {
                const isGlobalInPropView = promo.isGlobal && scopedPropertyId != null
                const active = effectiveActive(promo)
                const hasOverride = promo.propertyEnabled !== null
                return (
                  <tr
                    key={promo.id}
                    className={editingId === promo.id ? 'bg-[var(--color-primary-light)]' : 'hover:bg-[var(--color-background)]'}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold tracking-widest text-[var(--color-text)]">{promo.code}</span>
                      {isGlobalInPropView && (
                        <span className="ml-2 rounded-full bg-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Global</span>
                      )}
                      {isGlobalInPropView && hasOverride && (
                        <span className="ml-1 rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">Overridden</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--color-primary)]">
                      {promo.discountValue}%
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{formatDate(promo.validFrom)}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{formatDate(promo.validTo)}</td>
                    <td className="px-4 py-3">
                      {promo.validFrom || promo.validTo ? (
                        <span className="rounded-full bg-[var(--color-border)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
                          {promo.validDateType === 'stay' ? 'Stay' : 'Booking'}
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--color-text-muted)]">
                      {promo.usesCount}
                      {promo.maxUses !== null && (
                        <span className="text-[var(--color-border)]"> / {promo.maxUses}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={[
                        'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        active
                          ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                          : 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
                      ].join(' ')}>
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isGlobalInPropView ? (
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => toggleOverride({ id: promo.id, isEnabled: !active })}
                            className={[
                              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                              active
                                ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]'
                                : 'text-[var(--color-success)]/80 hover:bg-[var(--color-success)]/10 hover:text-[var(--color-success)]',
                            ].join(' ')}
                          >
                            {active ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(promo)}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
                          >
                            Edit
                          </button>
                          {deleteConfirm === promo.id ? (
                            <>
                              <button
                                onClick={() => handleDelete(promo.id)}
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
                              onClick={() => setDeleteConfirm(promo.id)}
                              className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-error)]/70 transition-colors hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
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

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}
