'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrgRecord } from '@ibe/shared'
import { apiClient, ApiClientError } from '@/lib/api-client'

interface CreatedCredentials {
  orgName: string
  email: string
  temporaryPassword: string
}

function CredentialsModal({ creds, onClose }: { creds: CreatedCredentials; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(
      `Login: https://hyperguest.net/admin/login\nEmail: ${creds.email}\nTemporary password: ${creds.temporaryPassword}`
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <h2 className="text-base font-semibold text-[var(--color-text)]">Account created — {creds.orgName}</h2>
        </div>

        <p className="mb-4 text-sm text-[var(--color-text-muted)]">
          Share these credentials with the account admin. The password is temporary and should be changed on first login.
        </p>

        <div className="mb-4 space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 font-mono text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">Login URL</span>
            <span className="text-[var(--color-text)]">hyperguest.net/admin/login</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">Email</span>
            <span className="text-[var(--color-text)]">{creds.email}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">Password</span>
            <span className="font-bold text-[var(--color-text)]">{creds.temporaryPassword}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={copy}
            className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-background)]"
          >
            {copied ? 'Copied!' : 'Copy credentials'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrganizationsPage() {
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [hgOrgId, setHgOrgId] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [createdCreds, setCreatedCreds] = useState<CreatedCredentials | null>(null)

  const { data: orgs = [], isLoading } = useQuery<OrgRecord[]>({
    queryKey: ['super-orgs'],
    queryFn: () => apiClient.listOrgs(),
    refetchOnWindowFocus: false,
  })

  async function handleCreate() {
    if (!name.trim() || !adminName.trim() || !adminEmail.trim()) return
    setSaveError(null)
    setIsSaving(true)
    try {
      const org = await apiClient.createOrg({ name: name.trim(), hyperGuestOrgId: hgOrgId.trim() || null })
      const user = await apiClient.createAdminUser({
        email: adminEmail.trim(),
        name: adminName.trim(),
        role: 'admin',
        orgId: org.id,
      })
      await qc.invalidateQueries({ queryKey: ['super-orgs'] })
      setCreatedCreds({ orgName: org.name, email: user.email, temporaryPassword: user.temporaryPassword })
      setName(''); setHgOrgId(''); setAdminName(''); setAdminEmail('')
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Failed to create account')
    } finally {
      setIsSaving(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'
  const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]'

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {createdCreds && <CredentialsModal creds={createdCreds} onClose={() => setCreatedCreds(null)} />}

      <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Organizations</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">Create and manage hotel accounts. Each account gets its own admin user, properties, and settings.</p>

      {/* Create form */}
      <div className="mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">New account</h2>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Hotel / org name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Grand Palace Hotel" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>HyperGuest Org ID <span className="normal-case font-normal">(optional)</span></label>
            <input type="text" value={hgOrgId} onChange={e => setHgOrgId(e.target.value)} placeholder="e.g. demand-org-123" className={`${inputCls} font-mono`} />
          </div>
        </div>

        <div className="mb-1 border-t border-[var(--color-border)] pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">First admin user</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Name</label>
              <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Jane Smith" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="jane@grandpalace.com" className={inputCls} />
            </div>
          </div>
        </div>

        {saveError && <p className="mt-3 text-sm text-[var(--color-error)]">{saveError}</p>}

        <button
          onClick={handleCreate}
          disabled={isSaving || !name.trim() || !adminName.trim() || !adminEmail.trim()}
          className="mt-4 rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? 'Creating…' : 'Create account'}
        </button>
      </div>

      {/* Orgs table */}
      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : orgs.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">No accounts yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                {['Name', 'HG Org ID', 'Users', 'Created'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {orgs.map(org => (
                <tr key={org.id} className="hover:bg-[var(--color-background)]">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{org.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">
                    {org.hyperGuestOrgId ?? <span className="italic">not set</span>}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{org.userCount}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{new Date(org.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
