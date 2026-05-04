'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Affiliate, CreateAffiliateRequest, UpdateAffiliateRequest } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../property-context'

function effectiveActive(a: Affiliate): boolean {
  return a.propertyEnabled ?? a.isActive
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function generateCode(): string {
  return Array.from({ length: 10 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
  } else {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px'
    document.body.appendChild(ta); ta.focus(); ta.select()
    document.execCommand('copy'); document.body.removeChild(ta)
  }
}

function affiliateUrl(code: string): string {
  return `${window.location.origin}/search?affiliateId=${code}`
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  code: string
  name: string
  email: string
  hasCommission: boolean
  commissionRate: number
  hasDiscount: boolean
  discountRate: number
  displayText: string
  notes: string
  isActive: boolean
}

const DEFAULT_FORM: FormState = {
  code: generateCode(),
  name: '',
  email: '',
  hasCommission: false,
  commissionRate: 10,
  hasDiscount: false,
  discountRate: 0,
  displayText: '',
  notes: '',
  isActive: true,
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AffiliatesPage() {
  const { propertyId, orgId } = useAdminProperty()
  return <AffiliatesEditor propertyId={propertyId} contextOrgId={orgId} />
}

function AffiliatesEditor({ propertyId, contextOrgId }: { propertyId: number | null | undefined; contextOrgId: number | null }) {
  const scopedPropertyId = propertyId === null ? null : (propertyId ?? undefined)
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const queryKey = useMemo(() => ['affiliates', scopedPropertyId ?? 'global'], [scopedPropertyId])

  const { data: affiliates = [], isLoading } = useQuery<Affiliate[]>({
    queryKey,
    queryFn: () => apiClient.listAffiliates(scopedPropertyId),
    refetchOnWindowFocus: false,
  })

  const invalidate = useCallback(() => { qc.invalidateQueries({ queryKey }) }, [qc, queryKey])

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: (payload: CreateAffiliateRequest | { id: number; data: UpdateAffiliateRequest }) => {
      if ('id' in payload) return apiClient.updateAffiliate(payload.id, payload.data)
      return apiClient.createAffiliate(payload)
    },
    onSuccess: () => {
      invalidate()
      setForm({ ...DEFAULT_FORM, code: generateCode() })
      setEditingId(null)
      setSaveError(null)
    },
    onError: (err: unknown) => setSaveError(err instanceof Error ? err.message : 'Unknown error'),
  })

  async function handleDelete(id: number) {
    setDeleteConfirm(null)
    setDeleteError(null)
    setDeleting(id)
    try {
      await apiClient.deleteAffiliate(id)
      await qc.invalidateQueries({ queryKey })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  const { mutate: toggleOverride } = useMutation({
    mutationFn: ({ id, isEnabled }: { id: number; isEnabled: boolean }) =>
      apiClient.setPropertyOverride({ entityType: 'affiliate', entityId: id, propertyId: scopedPropertyId!, isEnabled }),
    onMutate: ({ id, isEnabled }) => {
      const prev = qc.getQueryData<Affiliate[]>(queryKey)
      qc.setQueryData<Affiliate[]>(queryKey, old => old?.map(a => a.id === id ? { ...a, propertyEnabled: isEnabled } : a) ?? [])
      return { prev }
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev)
    },
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleEdit(a: Affiliate) {
    setEditingId(a.id)
    setSaveError(null)
    setForm({
      code: a.code,
      name: a.name,
      email: a.email ?? '',
      hasCommission: a.commissionRate !== null,
      commissionRate: a.commissionRate ?? 10,
      hasDiscount: a.discountRate !== null,
      discountRate: a.discountRate ?? 5,
      displayText: a.displayText ?? '',
      notes: a.notes ?? '',
      isActive: a.isActive,
    })
  }

  function handleCancel() {
    setEditingId(null)
    setSaveError(null)
    setForm({ ...DEFAULT_FORM, code: generateCode() })
  }

  function handleSubmit() {
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      email: form.email.trim() || null,
      commissionRate: form.hasCommission ? form.commissionRate : null,
      discountRate: form.hasDiscount ? form.discountRate : null,
      displayText: form.displayText.trim() || null,
      notes: form.notes.trim() || null,
      isActive: form.isActive,
      propertyId: scopedPropertyId ?? null,
    }
    if (editingId !== null) save({ id: editingId, data: payload })
    else save(payload)
  }

  function handleCopyUrl(a: Affiliate) {
    copyToClipboard(affiliateUrl(a.code))
    setCopiedId(a.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const isEditing = editingId !== null

  // ── Marketplace config — chain level ─────────────────────────────────────────

  const chainMktQKey = useMemo(() => ['affiliate-marketplace-config', contextOrgId], [contextOrgId])
  const { data: chainMktConfig } = useQuery({
    queryKey: chainMktQKey,
    queryFn: () => apiClient.getAffiliateMarketplaceConfig(contextOrgId ?? undefined),
  })

  const [chainMktEnabled, setChainMktEnabled] = useState(false)
  const [chainMktRate, setChainMktRate] = useState<string>('')
  const [chainMktDirty, setChainMktDirty] = useState(false)

  useEffect(() => {
    if (!chainMktConfig) return
    setChainMktEnabled(chainMktConfig.affiliateMarketplace)
    setChainMktRate(chainMktConfig.affiliateDefaultCommissionRate != null ? String(chainMktConfig.affiliateDefaultCommissionRate) : '')
    setChainMktDirty(false)
  }, [chainMktConfig])

  const { mutate: saveChainMkt, isPending: isSavingChainMkt } = useMutation({
    mutationFn: () => apiClient.updateAffiliateMarketplaceConfig(
      { affiliateMarketplace: chainMktEnabled, affiliateDefaultCommissionRate: chainMktRate !== '' ? parseFloat(chainMktRate) : null },
      contextOrgId ?? undefined,
    ),
    onSuccess: updated => {
      qc.setQueryData(chainMktQKey, updated)
      setChainMktDirty(false)
    },
  })

  // ── Marketplace config — hotel level ──────────────────────────────────────────

  const configQKey = useMemo(() => ['hotel-config-admin', scopedPropertyId], [scopedPropertyId])
  const { data: hotelConfig } = useQuery({
    queryKey: configQKey,
    queryFn: () => apiClient.getHotelConfigAdmin(scopedPropertyId!),
    enabled: scopedPropertyId != null,
  })

  const [mktEnabled, setMktEnabled] = useState(false)
  const [mktRate, setMktRate] = useState<string>('')
  const [mktDirty, setMktDirty] = useState(false)

  useEffect(() => {
    if (!hotelConfig) return
    setMktEnabled(hotelConfig.affiliateMarketplace ?? false)
    setMktRate(hotelConfig.affiliateDefaultCommissionRate != null ? String(hotelConfig.affiliateDefaultCommissionRate) : '')
    setMktDirty(false)
  }, [hotelConfig])

  const { mutate: saveMkt, isPending: isSavingMkt } = useMutation({
    mutationFn: () => apiClient.updateHotelConfig(scopedPropertyId!, {
      affiliateMarketplace: mktEnabled,
      affiliateDefaultCommissionRate: mktRate !== '' ? parseFloat(mktRate) : null,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: configQKey })
      setMktDirty(false)
    },
  })

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Affiliates</h1>
        {scopedPropertyId == null
          ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">Global defaults — apply to all properties unless overridden at the property level.</p>
          : <p className="mt-1 text-sm text-[var(--color-text-muted)]">Property-specific affiliates plus inherited global affiliates.</p>}
      </div>

      {/* ── Marketplace Settings ────────────────────────────────────────────── */}
      <div className="mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-text)]">Affiliate Marketplace</h2>
        <p className="mb-4 text-xs text-[var(--color-text-muted)]">
          {scopedPropertyId == null
            ? 'Set chain-wide defaults. Each hotel can override these individually.'
            : 'Enable to list this hotel in the affiliate marketplace. Affiliates can then discover and join this hotel\'s program.'}
        </p>

        {scopedPropertyId == null ? (
          // Chain-level editor
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={chainMktEnabled}
                onChange={e => { setChainMktEnabled(e.target.checked); setChainMktDirty(true) }}
                className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-text)]">List all hotels in affiliate marketplace by default</span>
            </label>
            {chainMktEnabled && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-[var(--color-text)] whitespace-nowrap">Default commission rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={chainMktRate}
                  placeholder="e.g. 8"
                  onChange={e => { setChainMktRate(e.target.value); setChainMktDirty(true) }}
                  className="w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                />
                <span className="text-xs text-[var(--color-text-muted)]">Applied to affiliates joining via the marketplace (hotels can override)</span>
              </div>
            )}
            {chainMktDirty && (
              <button
                onClick={() => saveChainMkt()}
                disabled={isSavingChainMkt}
                className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
              >
                {isSavingChainMkt ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        ) : (
          // Hotel-level editor with chain inheritance hint
          <div className="space-y-4">
            {chainMktConfig && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Chain default: <span className="font-medium">{chainMktConfig.affiliateMarketplace ? 'Enabled' : 'Disabled'}</span>
                {chainMktConfig.affiliateDefaultCommissionRate != null && ` · ${chainMktConfig.affiliateDefaultCommissionRate}% commission`}
              </p>
            )}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={mktEnabled}
                onChange={e => { setMktEnabled(e.target.checked); setMktDirty(true) }}
                className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-text)]">List in affiliate marketplace</span>
            </label>
            {mktEnabled && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-[var(--color-text)] whitespace-nowrap">Default commission rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={mktRate}
                  placeholder={chainMktConfig?.affiliateDefaultCommissionRate != null ? `Chain: ${chainMktConfig.affiliateDefaultCommissionRate}` : 'e.g. 8'}
                  onChange={e => { setMktRate(e.target.value); setMktDirty(true) }}
                  className="w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                />
                <span className="text-xs text-[var(--color-text-muted)]">Applied to new affiliates who join via the marketplace</span>
              </div>
            )}
            {mktDirty && (
              <button
                onClick={() => saveMkt()}
                disabled={isSavingMkt}
                className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
              >
                {isSavingMkt ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        )}
      </div>

      {deleteError && (
        <div className="mb-4 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-4 py-2 text-sm text-[var(--color-error)]">
          Delete failed: {deleteError}
        </div>
      )}

      {/* ── Form ─────────────────────────────────────────────────────────────── */}
      <div className="mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">
          {isEditing ? 'Edit affiliate' : 'Add affiliate'}
        </h2>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Name */}
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Partner Company Ltd."
              className={inputCls}
            />
          </div>

          {/* Code */}
          <div>
            <label className={labelCls}>Affiliate code <span className="font-normal normal-case text-[var(--color-text-muted)]/60">used in URLs</span></label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.code}
                onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9-_]/g, ''))}
                className={`${inputCls} flex-1 font-mono font-semibold tracking-widest`}
              />
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => set('code', generateCode())}
                  title="Regenerate"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                >
                  <RefreshIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className={labelCls}>Email <span className="font-normal normal-case text-[var(--color-text-muted)]/60">optional</span></label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="partner@example.com"
              className={inputCls}
            />
          </div>

          {/* Commission */}
          <div>
            <label className={labelCls}>Commission</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('hasCommission', false)}
                className={toggleCls(!form.hasCommission)}
              >
                None
              </button>
              <button
                type="button"
                onClick={() => set('hasCommission', true)}
                className={toggleCls(form.hasCommission)}
              >
                Set rate
              </button>
            </div>
            {form.hasCommission && (
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range" min={0} max={50} step={0.5}
                  value={form.commissionRate}
                  onChange={e => set('commissionRate', Number(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <div className="flex h-9 w-20 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
                  <input
                    type="number" min={0} max={50} step={0.5}
                    value={form.commissionRate}
                    onChange={e => set('commissionRate', Math.min(50, Math.max(0, Number(e.target.value))))}
                    className="w-full bg-transparent pl-3 text-sm font-semibold tabular-nums text-[var(--color-text)] focus:outline-none"
                  />
                  <span className="pr-2 text-sm text-[var(--color-text-muted)]">%</span>
                </div>
              </div>
            )}
          </div>

          {/* Display text — always visible */}
          <div>
            <label className={labelCls}>Display text <span className="font-normal normal-case text-[var(--color-text-muted)]/60">shown as "Special for [text]"</span></label>
            <input
              type="text"
              value={form.displayText}
              onChange={e => set('displayText', e.target.value)}
              placeholder="e.g. Newsletter subscribers"
              className={inputCls}
            />
          </div>

          {/* Guest discount */}
          <div>
            <label className={labelCls}>Guest discount <span className="font-normal normal-case text-[var(--color-text-muted)]/60">optional price reduction</span></label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('hasDiscount', false)}
                className={toggleCls(!form.hasDiscount)}
              >
                None
              </button>
              <button
                type="button"
                onClick={() => set('hasDiscount', true)}
                className={toggleCls(form.hasDiscount)}
              >
                Set discount
              </button>
            </div>
            {form.hasDiscount && (
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range" min={0} max={50} step={0.5}
                  value={form.discountRate}
                  onChange={e => set('discountRate', Number(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <div className="flex h-9 w-20 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
                  <input
                    type="number" min={0} max={50} step={0.5}
                    value={form.discountRate}
                    onChange={e => set('discountRate', Math.min(50, Math.max(0, Number(e.target.value))))}
                    className="w-full bg-transparent pl-3 text-sm font-semibold tabular-nums text-[var(--color-text)] focus:outline-none"
                  />
                  <span className="pr-2 text-sm text-[var(--color-text-muted)]">%</span>
                </div>
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => set('isActive', true)}
                className={['flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all',
                  form.isActive ? 'border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}>Active</button>
              <button type="button" onClick={() => set('isActive', false)}
                className={['flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all',
                  !form.isActive ? 'border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-error)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}>Inactive</button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes <span className="font-normal normal-case text-[var(--color-text-muted)]/60">optional</span></label>
            <input
              type="text"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Internal notes about this affiliate"
              className={inputCls}
            />
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
            disabled={isSaving || !form.name.trim() || !form.code.trim()}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Add affiliate'}
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
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-x-auto">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : affiliates.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
            No affiliates yet. Add one above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Commission</Th>
                <Th>Guest Discount</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {affiliates.map(a => {
                const isGlobalInPropView = a.isGlobal && scopedPropertyId != null
                const active = effectiveActive(a)
                const hasOverride = a.propertyEnabled !== null
                return (
                  <tr
                    key={a.id}
                    className={editingId === a.id ? 'bg-[var(--color-primary-light)]' : 'hover:bg-[var(--color-background)]'}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                      <div className="flex items-center gap-2">
                        {a.name}
                        {isGlobalInPropView && (
                          <span className="rounded-full bg-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Global</span>
                        )}
                        {isGlobalInPropView && hasOverride && (
                          <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">Overridden</span>
                        )}
                      </div>
                      {a.email && (
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{a.email}</p>
                      )}
                      {a.notes && (
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate max-w-[200px]">{a.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold tracking-widest text-[var(--color-text)]">{a.code}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--color-primary)]">
                      {a.commissionRate !== null ? `${a.commissionRate}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {a.discountRate !== null ? (
                        <div>
                          <span className="font-semibold text-purple-700">{a.discountRate}%</span>
                          {a.displayText && (
                            <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate max-w-[160px]">
                              {a.displayText}
                            </p>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={[
                        'rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                        active
                          ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                          : 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
                      ].join(' ')}>
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <button
                          onClick={() => handleCopyUrl(a)}
                          title="Copy affiliate URL"
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)]"
                        >
                          {copiedId === a.id ? '✓ Copied' : 'Copy URL'}
                        </button>
                        {isGlobalInPropView ? (
                          <button
                            onClick={() => toggleOverride({ id: a.id, isEnabled: !active })}
                            className={[
                              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                              active
                                ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]'
                                : 'text-[var(--color-success)]/80 hover:bg-[var(--color-success)]/10 hover:text-[var(--color-success)]',
                            ].join(' ')}
                          >
                            {active ? 'Disable' : 'Enable'}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEdit(a)}
                              className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
                            >
                              Edit
                            </button>
                            {deleteConfirm === a.id ? (
                              <>
                                <button
                                  onClick={() => handleDelete(a.id)}
                                  disabled={deleting === a.id}
                                  className="rounded-md bg-[var(--color-error)] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                                >
                                  {deleting === a.id ? '…' : 'Confirm'}
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
                                onClick={() => setDeleteConfirm(a.id)}
                                className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-error)]/70 transition-colors hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
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

// ── Shared styles ──────────────────────────────────────────────────────────────

const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]'
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'
const toggleCls = (active: boolean) => [
  'flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all',
  active
    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
].join(' ')

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
