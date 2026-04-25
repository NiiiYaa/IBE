'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import { compressImage } from '@/lib/compress-image'
import type {
  CrossSellConfig, CrossSellProduct, CrossSellProductCreate, CrossSellProductUpdate,
  CrossSellPricingModel, CrossSellProductStatus, CrossSellPaymentMode,
} from '@ibe/shared'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'ILS', 'THB', 'SGD', 'AUD', 'CAD', 'JPY']

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]'

const EMPTY_FORM: CrossSellProductCreate = {
  name: '', description: '', imageUrl: null,
  price: 0, tax: 0, pricingModel: 'per_item', currency: 'USD', status: 'active', sortOrder: 0,
}

function ProductModal({ initial, onSave, onClose, saving }: {
  initial: CrossSellProductCreate | CrossSellProduct | null
  onSave: (data: CrossSellProductCreate) => void
  onClose: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<CrossSellProductCreate>(
    initial ? { ...EMPTY_FORM, ...initial } : { ...EMPTY_FORM }
  )
  const imgRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof CrossSellProductCreate>(k: K, v: CrossSellProductCreate[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl bg-[var(--color-surface)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text)]">
            {initial && 'id' in initial ? 'Edit Product' : 'New Product'}
          </h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-background)]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Name *</label>
            <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Airport Transfer" />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea className={inputCls + ' resize-none'} rows={2} value={form.description}
              onChange={e => set('description', e.target.value)} placeholder="Short description shown to guests" />
          </div>

          {/* Image */}
          <div>
            <label className={labelCls}>Image</label>
            <div className="flex items-center gap-3">
              {form.imageUrl && (
                <img src={form.imageUrl} alt="" className="h-14 w-20 rounded-lg object-cover border border-[var(--color-border)]" />
              )}
              <div className="flex flex-col gap-1.5">
                <button type="button" onClick={() => imgRef.current?.click()}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                  {form.imageUrl ? 'Replace image' : 'Upload image'}
                </button>
                <p className="text-[10px] text-[var(--color-text-muted)]">JPG, PNG or SVG · max 5 MB · resized to 600 px</p>
                {form.imageUrl && (
                  <button type="button" onClick={() => set('imageUrl', null)}
                    className="text-xs text-[var(--color-text-muted)] underline-offset-2 hover:underline">Remove</button>
                )}
              </div>
              <input ref={imgRef} type="file" accept="image/*" className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 5 * 1024 * 1024) {
                    alert('Image must be under 5 MB.')
                    e.target.value = ''
                    return
                  }
                  set('imageUrl', await compressImage(file, 600))
                  e.target.value = ''
                }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Price</label>
              <input type="number" min={0} step={0.01} className={inputCls}
                value={form.price} onChange={e => set('price', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Tax (%)</label>
              <input type="number" min={0} max={100} step={0.1} className={inputCls}
                value={form.tax} onChange={e => set('tax', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Pricing Model</label>
              <select className={inputCls} value={form.pricingModel}
                onChange={e => set('pricingModel', e.target.value as CrossSellPricingModel)}>
                <option value="per_item">Per item</option>
                <option value="per_night">Per night</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <select className={inputCls} value={form.currency}
                onChange={e => set('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status}
              onChange={e => set('status', e.target.value as CrossSellProductStatus)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-background)]">
            Cancel
          </button>
          <button type="button" disabled={saving || !form.name.trim()}
            onClick={() => onSave(form)}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductRow({ product, orgId, onRefresh }: { product: CrossSellProduct; orgId?: number; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateMut = useMutation({
    mutationFn: (data: CrossSellProductUpdate) => apiClient.updateCrossSellProduct(product.id, data, orgId),
    onSuccess: () => { setEditing(false); onRefresh() },
  })
  const deleteMut = useMutation({
    mutationFn: () => apiClient.deleteCrossSellProduct(product.id, orgId),
    onSuccess: onRefresh,
  })

  const priceLabel = `${product.currency} ${(product.price * (1 + product.tax / 100)).toFixed(2)} ${product.pricingModel === 'per_night' ? '/ night' : '/ item'}`

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        {product.imageUrl
          ? <img src={product.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
          : <div className="h-12 w-16 shrink-0 rounded-lg bg-[var(--color-background)] flex items-center justify-center">
              <svg className="h-5 w-5 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
        }
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-text)]">{product.name}</p>
          {product.description && <p className="truncate text-xs text-[var(--color-text-muted)]">{product.description}</p>}
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{priceLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={['rounded-full px-2 py-0.5 text-[10px] font-semibold',
            product.status === 'active'
              ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
              : 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
          ].join(' ')}>
            {product.status === 'active' ? 'Active' : 'Inactive'}
          </span>
          <button onClick={() => updateMut.mutate({ status: product.status === 'active' ? 'inactive' : 'active' })}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            {product.status === 'active' ? 'Deactivate' : 'Activate'}
          </button>
          <button onClick={() => setEditing(true)}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            Edit
          </button>
          {confirmDelete
            ? <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--color-error)]">Delete?</span>
                <button onClick={() => deleteMut.mutate()} className="text-xs font-semibold text-[var(--color-error)]">Yes</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-[var(--color-text-muted)]">No</button>
              </div>
            : <button onClick={() => setConfirmDelete(true)}
                className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-error)] hover:border-[var(--color-error)]">
                Delete
              </button>
          }
        </div>
      </div>
      {editing && (
        <ProductModal
          initial={product}
          onSave={data => updateMut.mutate(data)}
          onClose={() => setEditing(false)}
          saving={updateMut.isPending}
        />
      )}
    </>
  )
}

export default function CrossSellConfigPage() {
  const { admin } = useAdminAuth()
  const { orgId: contextOrgId } = useAdminProperty()
  const qc = useQueryClient()
  const isSuper = admin?.role === 'super'
  const orgId = isSuper ? (contextOrgId ?? undefined) : (admin?.organizationId ?? undefined)

  const queryKey = ['cross-sell-config', orgId]
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiClient.getCrossSellConfig(orgId),
    enabled: !!admin && orgId !== undefined,
  })

  const saveCfgMut = useMutation({
    mutationFn: (update: Parameters<typeof apiClient.updateCrossSellConfig>[0]) =>
      apiClient.updateCrossSellConfig(update, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const createMut = useMutation({
    mutationFn: (d: CrossSellProductCreate) => apiClient.createCrossSellProduct(d, orgId),
    onSuccess: () => { setCreating(false); void qc.invalidateQueries({ queryKey }) },
  })

  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Cross-Sell</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Offer additional products and services to guests after their booking is confirmed.
        </p>
      </div>

      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}

      {data && (
        <>
          {/* Enable + Payment Mode */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-5">
            <div className="flex items-center gap-3">
              <Toggle checked={data.enabled} onChange={v => saveCfgMut.mutate({ enabled: v })} />
              <span className="text-sm text-[var(--color-text)]">
                {data.enabled ? 'Cross-sell enabled — shown after booking confirmation' : 'Cross-sell disabled'}
              </span>
            </div>

            <div>
              <label className={labelCls}>Payment method for selected items</label>
              <select className={'w-64 ' + inputCls}
                value={data.paymentMode}
                onChange={e => saveCfgMut.mutate({ paymentMode: e.target.value as CrossSellPaymentMode })}>
                <option value="informational">Informational — pay at hotel</option>
                <option value="online">Online payment (coming soon)</option>
              </select>
            </div>

            {saveCfgMut.isError && <p className="text-xs text-[var(--color-error)]">Save failed.</p>}
          </div>

          {/* Products */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Internal Products</h2>
              <button onClick={() => setCreating(true)}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)]">
                + Add product
              </button>
            </div>

            {data.products.length === 0 && (
              <p className="text-sm text-[var(--color-text-muted)]">No products yet. Add one to get started.</p>
            )}

            <div className="space-y-2">
              {data.products.map(p => (
                <ProductRow key={p.id} product={p} onRefresh={() => qc.invalidateQueries({ queryKey })}
                  {...(orgId !== undefined ? { orgId } : {})} />
              ))}
            </div>
          </div>

          {/* External products */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-3">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">External Products (Ticketmaster)</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Events near the hotel from the Ticketmaster feed, shown as affiliate links.
                Managed under <span className="font-medium text-[var(--color-text)]">Configuration → Events</span>.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Toggle
                checked={data.showExternalEvents}
                onChange={v => saveCfgMut.mutate({ showExternalEvents: v })}
              />
              <span className="text-sm text-[var(--color-text)]">
                {data.showExternalEvents ? 'Show on cross-sell page' : 'Hidden from cross-sell page'}
              </span>
            </div>
          </div>
        </>
      )}

      {creating && (
        <ProductModal
          initial={null}
          onSave={d => createMut.mutate(d)}
          onClose={() => setCreating(false)}
          saving={createMut.isPending}
        />
      )}
    </div>
  )
}
