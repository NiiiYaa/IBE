'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrgRecord } from '@ibe/shared'
import { apiClient, ApiClientError } from '@/lib/api-client'

export default function OrganizationsPage() {
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [hgOrgId, setHgOrgId] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const { data: orgs = [], isLoading } = useQuery<OrgRecord[]>({
    queryKey: ['super-orgs'],
    queryFn: () => apiClient.listOrgs(),
    refetchOnWindowFocus: false,
  })

  async function handleCreate() {
    if (!name.trim()) return
    setSaveError(null); setIsSaving(true)
    try {
      await apiClient.createOrg({ name: name.trim(), hyperGuestOrgId: hgOrgId.trim() || null })
      await qc.invalidateQueries({ queryKey: ['super-orgs'] })
      setName(''); setHgOrgId('')
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Failed to create organization')
    } finally { setIsSaving(false) }
  }

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'
  const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]'

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Organizations</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">Manage customer organizations. Each org has its own users, properties, and settings.</p>

      {/* Create form */}
      <div className="mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">New organization</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Grand Palace Hotel"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>HyperGuest Org ID <span className="normal-case font-normal">(optional)</span></label>
            <input
              type="text"
              value={hgOrgId}
              onChange={e => setHgOrgId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. demand-org-123"
              className={`${inputCls} font-mono`}
            />
          </div>
        </div>
        {saveError && <p className="mt-3 text-sm text-[var(--color-error)]">{saveError}</p>}
        <button
          onClick={handleCreate}
          disabled={isSaving || !name.trim()}
          className="mt-4 rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? 'Creating…' : 'Create organization'}
        </button>
      </div>

      {/* Orgs table */}
      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : orgs.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">No organizations yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                {['Name', 'Slug', 'HG Org ID', 'Users', 'Created'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {orgs.map(org => (
                <tr key={org.id} className="hover:bg-[var(--color-background)]">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{org.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">{org.slug}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">
                    {org.hyperGuestOrgId ?? <span className="italic">not set</span>}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{org.userCount}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">
                    {new Date(org.createdAt).toLocaleDateString()}
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
