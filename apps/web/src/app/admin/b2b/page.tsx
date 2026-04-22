'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrgRecord } from '@ibe/shared'
import { apiClient, ApiClientError } from '@/lib/api-client'

type B2BAccessRow = {
  id: number
  buyerOrgId: number
  sellerOrgId: number
  createdAt: string
  buyerOrg: { id: number; name: string; slug: string }
  sellerOrg: { id: number; name: string; slug: string }
}

export default function B2BAccessPage() {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [buyerOrgId, setBuyerOrgId] = useState<number | ''>('')
  const [sellerOrgId, setSellerOrgId] = useState<number | ''>('')
  const [isPending, setIsPending] = useState(false)

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['b2b-access'],
    queryFn: () => apiClient.listB2BAccess(),
  })

  const { data: orgs = [] } = useQuery<OrgRecord[]>({
    queryKey: ['orgs'],
    queryFn: () => apiClient.listOrgs(),
  })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!buyerOrgId || !sellerOrgId) return
    setError(null)
    setIsPending(true)
    try {
      await apiClient.createB2BAccess(Number(buyerOrgId), Number(sellerOrgId))
      await qc.invalidateQueries({ queryKey: ['b2b-access'] })
      setShowAdd(false)
      setBuyerOrgId('')
      setSellerOrgId('')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create access')
    } finally {
      setIsPending(false)
    }
  }

  async function handleDelete(id: number, buyerName: string, sellerName: string) {
    if (!confirm(`Remove access: "${buyerName}" can book "${sellerName}"?`)) return
    setError(null)
    try {
      await apiClient.deleteB2BAccess(id)
      await qc.invalidateQueries({ queryKey: ['b2b-access'] })
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to remove access')
    }
  }

  const selectCls = 'rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'

  // Group rows by seller org for readability
  const grouped = rows.reduce<Record<number, B2BAccessRow[]>>((acc, row) => {
    if (!acc[row.sellerOrgId]) acc[row.sellerOrgId] = []
    acc[row.sellerOrgId]!.push(row)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">B2B Access</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Define which buyer organizations can book properties of each seller organization.
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(null) }}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Add access
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">New B2B Access</h2>
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-text-muted)]">Buyer org</label>
              <select
                value={buyerOrgId}
                onChange={e => setBuyerOrgId(e.target.value ? Number(e.target.value) : '')}
                required
                className={selectCls}
              >
                <option value="">Select buyer…</option>
                {orgs.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <span className="text-sm text-[var(--color-text-muted)]">can book</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-text-muted)]">Seller org</label>
              <select
                value={sellerOrgId}
                onChange={e => setSellerOrgId(e.target.value ? Number(e.target.value) : '')}
                required
                className={selectCls}
              >
                <option value="">Select seller…</option>
                {orgs.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setError(null) }}
                className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !buyerOrgId || !sellerOrgId}
                className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Access list grouped by seller */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">No B2B access relationships defined yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.values(grouped).map(group => {
            const seller = group[0]!.sellerOrg
            return (
              <div key={seller.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                <div className="border-b border-[var(--color-border)] bg-[var(--color-background)] px-5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Seller
                  </p>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{seller.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{seller.slug}</p>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {group.map(row => (
                    <div key={row.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm text-[var(--color-text)]">{row.buyerOrg.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{row.buyerOrg.slug}</p>
                      </div>
                      <button
                        onClick={() => handleDelete(row.id, row.buyerOrg.name, row.sellerOrg.name)}
                        className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
