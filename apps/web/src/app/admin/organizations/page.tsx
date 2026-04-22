'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrgRecord, OrgType } from '@ibe/shared'
import { apiClient, ApiClientError } from '@/lib/api-client'

interface CreatedCredentials {
  orgName: string
  hyperGuestOrgId: string
  email: string
  temporaryPassword: string
}

function CredentialsModal({ creds, onClose }: { creds: CreatedCredentials; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    void navigator.clipboard.writeText(
      `Login: https://hyperguest.net/admin/login\nHyperGuest Org ID: ${creds.hyperGuestOrgId}\nEmail: ${creds.email}\nTemporary password: ${creds.temporaryPassword}`
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
          Share these credentials with the account admin. The password is temporary.
        </p>
        <div className="mb-4 space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 font-mono text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">Login URL</span>
            <span className="text-[var(--color-text)]">hyperguest.net/admin/login</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">HyperGuest Org ID</span>
            <span className="font-bold text-[var(--color-text)]">{creds.hyperGuestOrgId}</span>
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
          <button onClick={copy} className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-background)]">
            {copied ? 'Copied!' : 'Copy credentials'}
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function OrgTypeSelector({ value, onChange }: { value: OrgType; onChange: (v: OrgType) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Account type</label>
      <div className="grid grid-cols-2 gap-2">
        {(['seller', 'buyer'] as OrgType[]).map(t => (
          <label key={t} className={[
            'flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2.5 transition-colors',
            value === t ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/40',
          ].join(' ')}>
            <input type="radio" name="orgType" value={t} checked={value === t} onChange={() => onChange(t)} className="accent-[var(--color-primary)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)] capitalize">{t}</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {t === 'seller' ? 'Hotel / chain — full admin' : 'Travel agent — bookings only'}
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

function EditModal({ org, onClose, onSaved }: { org: OrgRecord; onClose: () => void; onSaved: (updated: OrgRecord) => void }) {
  const [name, setName] = useState(org.name)
  const [hgOrgId, setHgOrgId] = useState(org.hyperGuestOrgId ?? '')
  const [orgType, setOrgType] = useState<OrgType>(org.orgType)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

  async function save() {
    if (!name.trim()) return
    setSaving(true); setError(null)
    try {
      const updated = await apiClient.updateOrg(org.id, { name: name.trim(), hyperGuestOrgId: hgOrgId.trim() || null, orgType })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-[var(--color-text)]">Edit account</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">HyperGuest Org ID</label>
            <input type="text" value={hgOrgId} onChange={e => setHgOrgId(e.target.value)} className={`${inputCls} font-mono`} placeholder="optional" />
          </div>
          <OrgTypeSelector value={orgType} onChange={setOrgType} />
        </div>
        {error && <p className="mt-3 text-sm text-[var(--color-error)]">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-background)]">Cancel</button>
          <button onClick={save} disabled={saving || !name.trim()} className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
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
  const [orgType, setOrgType] = useState<OrgType>('seller')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [createdCreds, setCreatedCreds] = useState<CreatedCredentials | null>(null)
  const [editingOrg, setEditingOrg] = useState<OrgRecord | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<OrgRecord | null>(null)

  const { data: orgs = [], isLoading } = useQuery<OrgRecord[]>({
    queryKey: ['super-orgs'],
    queryFn: () => apiClient.listOrgs(),
    refetchOnWindowFocus: false,
  })

  async function handleCreate() {
    if (!name.trim() || !adminName.trim() || !adminEmail.trim()) return
    setSaveError(null); setIsSaving(true)
    try {
      const org = await apiClient.createOrg({ name: name.trim(), hyperGuestOrgId: hgOrgId.trim() || null, orgType })
      const user = await apiClient.createAdminUser({ email: adminEmail.trim(), name: adminName.trim(), role: 'admin', orgId: org.id })
      await qc.invalidateQueries({ queryKey: ['super-orgs'] })
      setCreatedCreds({ orgName: org.name, hyperGuestOrgId: org.hyperGuestOrgId ?? hgOrgId.trim(), email: user.email, temporaryPassword: user.temporaryPassword })
      setName(''); setHgOrgId(''); setOrgType('seller'); setAdminName(''); setAdminEmail('')
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Failed to create account')
    } finally { setIsSaving(false) }
  }

  async function toggleActive(org: OrgRecord) {
    await apiClient.setOrgActive(org.id, !org.isActive)
    await qc.invalidateQueries({ queryKey: ['super-orgs'] })
  }

  async function handleDelete(org: OrgRecord) {
    await apiClient.deleteOrg(org.id)
    await qc.invalidateQueries({ queryKey: ['super-orgs'] })
    setConfirmDelete(null)
  }

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'
  const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]'

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {createdCreds && <CredentialsModal creds={createdCreds} onClose={() => setCreatedCreds(null)} />}
      {editingOrg && (
        <EditModal
          org={editingOrg}
          onClose={() => setEditingOrg(null)}
          onSaved={() => { void qc.invalidateQueries({ queryKey: ['super-orgs'] }); setEditingOrg(null) }}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-[var(--color-text)]">Delete account?</h2>
            <p className="mb-5 text-sm text-[var(--color-text-muted)]">
              <strong>{confirmDelete.name}</strong> will be disabled and hidden. All users will lose access immediately. This cannot be undone from the UI.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-background)]">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Organizations</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">Create and manage hotel accounts. Each account gets its own admin user, properties, and settings.</p>

      {/* Create form */}
      <div className="mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">New account</h2>
        <div className="mb-4">
          <OrgTypeSelector value={orgType} onChange={setOrgType} />
        </div>
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{orgType === 'seller' ? 'Hotel / org name' : 'Agency name'}</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={orgType === 'seller' ? 'e.g. Grand Palace Hotel' : 'e.g. Acme Travel Agency'} className={inputCls} />
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
                {['Name', 'Type', 'HG Org ID', 'Users', 'Status', 'Created', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {orgs.map(org => (
                <tr key={org.id} className={['hover:bg-[var(--color-background)]', !org.isActive ? 'opacity-50' : ''].join(' ')}>
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{org.name}</td>
                  <td className="px-4 py-3">
                    <span className={[
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      org.orgType === 'buyer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700',
                    ].join(' ')}>
                      {org.orgType === 'buyer' ? 'Buyer' : 'Seller'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">
                    {org.hyperGuestOrgId ?? <span className="italic">not set</span>}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{org.userCount}</td>
                  <td className="px-4 py-3">
                    <span className={['inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', org.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'].join(' ')}>
                      {org.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{new Date(org.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingOrg(org)} className="text-xs font-medium text-[var(--color-primary)] hover:underline">Edit</button>
                      <button onClick={() => toggleActive(org)} className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline">
                        {org.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => setConfirmDelete(org)} className="text-xs font-medium text-red-500 hover:underline">Delete</button>
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
