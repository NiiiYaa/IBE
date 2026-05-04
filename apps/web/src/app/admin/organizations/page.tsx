'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrgRecord, OrgType } from '@ibe/shared'
import { apiClient, ApiClientError } from '@/lib/api-client'

interface CreatedCredentials {
  label: string
  name: string
  email: string
  phone?: string | null
  temporaryPassword: string
  loginUrl: string
}

function CredentialsModal({ creds, onClose }: { creds: CreatedCredentials; onClose: () => void }) {
  const [sendTab, setSendTab] = useState<'email' | 'whatsapp' | null>(null)
  const [sendTo, setSendTo] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function openSendTab(tab: 'email' | 'whatsapp') {
    setSendTab(tab)
    setSendTo(tab === 'email' ? (creds.email ?? '') : (creds.phone ?? ''))
    setSendResult(null)
  }

  function copyAll() {
    void navigator.clipboard.writeText(
      `Login: ${creds.loginUrl}\nEmail: ${creds.email}\nTemporary password: ${creds.temporaryPassword}`
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSend() {
    if (!sendTo.trim() || !sendTab) return
    setSending(true); setSendResult(null)
    try {
      await apiClient.sendAdminCredentials({
        channel: sendTab,
        to: sendTo.trim(),
        credentials: { name: creds.name, email: creds.email, temporaryPassword: creds.temporaryPassword, loginUrl: creds.loginUrl },
      })
      setSendResult({ ok: true, msg: `Sent via ${sendTab === 'email' ? 'Email' : 'WhatsApp'}` })
    } catch (err) {
      setSendResult({ ok: false, msg: err instanceof ApiClientError ? err.message : 'Send failed' })
    } finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <svg className="h-5 w-5 text-[var(--color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <h2 className="text-base font-semibold text-[var(--color-text)]">{creds.label}</h2>
        </div>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">Share these credentials with the account admin. The password is temporary.</p>

        <div className="mb-5 space-y-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 font-mono text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">Login URL</span>
            <span className="text-[var(--color-text)]">{creds.loginUrl.replace(/^https?:\/\//, '')}</span>
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

        {sendTab && (
          <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Send via {sendTab === 'email' ? 'Email' : 'WhatsApp'}
              </span>
              <button onClick={() => { setSendTab(null); setSendResult(null) }} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                type={sendTab === 'email' ? 'email' : 'tel'}
                value={sendTo}
                onChange={e => setSendTo(e.target.value)}
                placeholder={sendTab === 'email' ? 'email@example.com' : '+1 555 000 0000'}
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
                onKeyDown={e => e.key === 'Enter' && handleSend()}
              />
              <button
                onClick={handleSend}
                disabled={sending || !sendTo.trim()}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
            {sendResult && (
              <p className={`mt-2 text-xs ${sendResult.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {sendResult.msg}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openSendTab('email')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              sendTab === 'email'
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-background)]'
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email
          </button>
          <button
            onClick={() => openSendTab('whatsapp')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              sendTab === 'whatsapp'
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-background)]'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </button>
          <button
            onClick={copyAll}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-background)]"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
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
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

  async function save() {
    if (!name.trim()) return
    setSaving(true); setError(null)
    try {
      const updated = await apiClient.updateOrg(org.id, {
        name: name.trim(),
        hyperGuestOrgId: hgOrgId.trim() || null,
        orgType,
        ...(token.trim() !== '' ? { hyperGuestBearerToken: token.trim() } : {}),
      })
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
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">HyperGuest Bearer Token <span className="normal-case font-normal">(leave blank to keep current)</span></label>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste new token to update" className={`${inputCls} font-mono`} />
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
  const [token, setToken] = useState('')
  const [orgType, setOrgType] = useState<OrgType>('seller')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPhone, setAdminPhone] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [createdCreds, setCreatedCreds] = useState<CreatedCredentials | null>(null)
  const [editingOrg, setEditingOrg] = useState<OrgRecord | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<OrgRecord | null>(null)

  const [filterSearch, setFilterSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const showDeleted = filterStatus === 'deleted'
  const { data: orgs = [], isLoading } = useQuery<OrgRecord[]>({
    queryKey: ['super-orgs', showDeleted],
    queryFn: () => apiClient.listOrgs(showDeleted),
    refetchOnWindowFocus: false,
  })

  const filteredOrgs = orgs.filter(o => {
    if (filterSearch && !o.name.toLowerCase().includes(filterSearch.toLowerCase()) && !(o.hyperGuestOrgId ?? '').includes(filterSearch)) return false
    if (filterType && o.orgType !== filterType) return false
    if (!showDeleted) {
      if (filterStatus === 'active' && !o.isActive) return false
      if (filterStatus === 'disabled' && o.isActive) return false
    }
    return true
  })

  async function handleCreate() {
    if (!name.trim() || !adminName.trim() || !adminEmail.trim()) return
    setSaveError(null); setIsSaving(true)
    try {
      const org = await apiClient.createOrg({ name: name.trim(), hyperGuestOrgId: hgOrgId.trim() || null, hyperGuestBearerToken: token.trim() || null, orgType })
      const user = await apiClient.createAdminUser({ email: adminEmail.trim(), name: adminName.trim(), role: 'admin', orgId: org.id, ...(adminPhone.trim() ? { phone: adminPhone.trim() } : {}) })
      await qc.invalidateQueries({ queryKey: ['super-orgs'] })
      const loginUrl = `${window.location.origin}/admin/login`
      setCreatedCreds({ label: `Account created — ${org.name}`, name: adminName.trim(), email: user.email, ...(adminPhone.trim() ? { phone: adminPhone.trim() } : {}), temporaryPassword: user.temporaryPassword, loginUrl })
      setName(''); setHgOrgId(''); setToken(''); setOrgType('seller'); setAdminName(''); setAdminEmail(''); setAdminPhone('')
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

  async function handleRevive(org: OrgRecord) {
    await apiClient.reviveOrg(org.id)
    await qc.invalidateQueries({ queryKey: ['super-orgs'] })
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
            <input type="text" value={hgOrgId} onChange={e => setHgOrgId(e.target.value)} placeholder="e.g. 141580" className={`${inputCls} font-mono`} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>HyperGuest Bearer Token <span className="normal-case font-normal">(optional)</span></label>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste API token" className={`${inputCls} font-mono`} />
          </div>
        </div>
        <div className="mb-1 border-t border-[var(--color-border)] pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">First admin user</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Name</label>
              <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Jane Smith" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="jane@grandpalace.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone <span className="normal-case font-normal">(optional)</span></label>
              <input type="tel" value={adminPhone} onChange={e => setAdminPhone(e.target.value)} placeholder="+1 555 000 0000" className={inputCls} />
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

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search by name…"
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-light)] min-w-[200px]"
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
        >
          <option value="">All types</option>
          <option value="seller">Seller</option>
          <option value="buyer">Buyer</option>
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
          <option value="deleted">Deleted</option>
        </select>
        {(filterSearch || filterType || filterStatus) && (
          <button
            onClick={() => { setFilterSearch(''); setFilterType(''); setFilterStatus('') }}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Orgs table */}
      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : filteredOrgs.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
            {orgs.length === 0 ? 'No accounts yet.' : 'No accounts match the current filters.'}
          </div>
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
              {filteredOrgs.map(org => (
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
                      {showDeleted ? (
                        <button onClick={() => handleRevive(org)} className="text-xs font-semibold text-[var(--color-success)] hover:underline">Revive</button>
                      ) : (
                        <>
                          <button onClick={() => setEditingOrg(org)} className="text-xs font-medium text-[var(--color-primary)] hover:underline">Edit</button>
                          <button onClick={() => toggleActive(org)} className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline">
                            {org.isActive ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => setConfirmDelete(org)} className="text-xs font-medium text-red-500 hover:underline">Delete</button>
                        </>
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
