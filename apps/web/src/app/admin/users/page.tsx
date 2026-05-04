'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminUserRecord, CreateAdminUserRequest, OrgRecord } from '@ibe/shared'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'

// ── Credentials modal (shown after user creation or password reset) ────────────

interface CredentialsInfo {
  label: string
  name: string
  email: string
  phone?: string | null
  temporaryPassword: string
  loginUrl: string
}

function CredentialsModal({ info, onClose }: { info: CredentialsInfo; onClose: () => void }) {
  const [sendTab, setSendTab] = useState<'email' | 'whatsapp' | null>(null)
  const [sendTo, setSendTo] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function openSendTab(tab: 'email' | 'whatsapp') {
    setSendTab(tab)
    setSendTo(tab === 'email' ? (info.email ?? '') : (info.phone ?? ''))
    setSendResult(null)
  }

  function copyAll() {
    copyToClipboard(`Login: ${info.loginUrl}\nEmail: ${info.email}\nTemporary password: ${info.temporaryPassword}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function handleSend() {
    if (!sendTo.trim() || !sendTab) return
    setSending(true); setSendResult(null)
    try {
      await apiClient.sendAdminCredentials({
        channel: sendTab,
        to: sendTo.trim(),
        credentials: { name: info.name, email: info.email, temporaryPassword: info.temporaryPassword, loginUrl: info.loginUrl },
      })
      setSendResult({ ok: true, msg: `Sent via ${sendTab === 'email' ? 'Email' : 'WhatsApp'}` })
    } catch (err) {
      setSendResult({ ok: false, msg: err instanceof ApiClientError ? err.message : 'Send failed' })
    } finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center gap-2">
          <svg className="h-5 w-5 text-[var(--color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <h2 className="text-base font-semibold text-[var(--color-text)]">{info.label}</h2>
        </div>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">Share these credentials with the user. The password is temporary.</p>

        {/* Credentials box */}
        <div className="mb-5 space-y-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 font-mono text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">Login URL</span>
            <span className="text-[var(--color-text)]">{info.loginUrl.replace(/^https?:\/\//, '')}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">Email</span>
            <span className="text-[var(--color-text)]">{info.email}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">Password</span>
            <span className="font-bold text-[var(--color-text)]">{info.temporaryPassword}</span>
          </div>
        </div>

        {/* Send tab (inline) */}
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

        {/* Action buttons */}
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

const ROLES = ['admin', 'observer', 'user'] as const
const SUPER_ROLES = ['admin', 'observer', 'user', 'affiliate'] as const

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  observer: 'Observer',
  user: 'User',
  super: 'Super',
  affiliate: 'Affiliate',
}

const ROLE_HINT: Record<string, string> = {
  admin: 'Full read & write access',
  observer: 'Read-only, no sensitive settings',
  user: 'Limited to assigned properties',
  affiliate: 'Affiliate portal access only',
}

// ── Searchable org dropdown ───────────────────────────────────────────────────

interface OrgOption { id?: number; name: string; hgId?: string | null }

function SearchableOrgSelect({
  value, onChange, orgs, placeholder, searchable = false,
}: {
  value: string
  onChange: (v: string) => void
  orgs: OrgOption[]
  placeholder: string
  searchable?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selectedOrg = orgs.find(o => String(o.id ?? o.name) === value)
  const filtered = query
    ? orgs.filter(o =>
        o.name.toLowerCase().includes(query.toLowerCase()) ||
        (o.hgId ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : orgs

  const baseInputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

  if (!searchable) {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
      >
        <option value="">{placeholder}</option>
        {orgs.map(o => (
          <option key={o.id ?? o.name} value={o.id ?? o.name}>{o.name}{o.hgId ? ` · ${o.hgId}` : ''}</option>
        ))}
      </select>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        className={`${baseInputCls} flex items-center justify-between gap-2 text-left`}
      >
        <span className={selectedOrg ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}>
          {selectedOrg ? selectedOrg.name : placeholder}
        </span>
        <svg className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[220px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or HG ID…"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setQuery('') }}
              className="w-full px-3 py-2 text-left text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-background)]"
            >
              {placeholder}
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">No matches</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o.id ?? o.name}
                  type="button"
                  onClick={() => { onChange(String(o.id ?? o.name)); setOpen(false); setQuery('') }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-background)] ${String(o.id ?? o.name) === value ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`}
                >
                  {o.name}
                  {o.hgId && <span className="ml-2 font-mono text-xs text-[var(--color-text-muted)]">{o.hgId}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
  } else {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px'
    document.body.appendChild(ta); ta.focus(); ta.select()
    document.execCommand('copy'); document.body.removeChild(ta)
  }
}

export default function UsersPage() {
  const qc = useQueryClient()
  const { admin: me } = useAdminAuth()
  const isSuper = me?.role === 'super'

  const { data: orgSettings } = useQuery({
    queryKey: ['admin-org'],
    queryFn: () => apiClient.getOrgSettings(),
    staleTime: Infinity,
    enabled: !isSuper,
  })

  const { data: connections } = useQuery({
    queryKey: ['admin-b2b-connections'],
    queryFn: () => apiClient.getB2BConnections(),
    staleTime: 60_000,
    enabled: !isSuper,
  })

  // invite form
  const [form, setForm] = useState<CreateAdminUserRequest>({ email: '', name: '', role: 'admin', phone: '' })
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // inline edit user
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; role: string; isActive: boolean; phone: string } | null>(null)
  const [editPropertyIds, setEditPropertyIds] = useState<number[]>([])

  // inline edit HG Org ID (super only)
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null)
  const [editingOrgHgId, setEditingOrgHgId] = useState('')
  const [orgSaveError, setOrgSaveError] = useState<string | null>(null)
  const [isSavingOrg, setIsSavingOrg] = useState(false)

  // delete
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // filters
  const [filterSearch, setFilterSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterOrg, setFilterOrg] = useState('')

  // credentials modal
  const [credentialsInfo, setCredentialsInfo] = useState<CredentialsInfo | null>(null)

  const showDeleted = filterStatus === 'deleted'
  const { data: users = [], isLoading } = useQuery<AdminUserRecord[]>({
    queryKey: ['admin-users', showDeleted],
    queryFn: () => apiClient.listAdminUsers(showDeleted),
    refetchOnWindowFocus: false,
  })

  const { data: orgProperties = [] } = useQuery({
    queryKey: ['user-org-properties', editingId],
    queryFn: () => apiClient.getUserOrgProperties(editingId!),
    enabled: editingId !== null && editForm?.role === 'user',
    refetchOnWindowFocus: false,
  })

  const { data: orgs = [] } = useQuery<OrgRecord[]>({
    queryKey: ['super-orgs'],
    queryFn: () => apiClient.listOrgs(),
    enabled: isSuper,
    refetchOnWindowFocus: false,
  })

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!form.email.trim() || !form.name.trim()) return
    if (isSuper && !form.orgId && form.role !== 'affiliate') return
    setSaveError(null); setIsSaving(true)
    try {
      const result = await apiClient.createAdminUser(form)
      await qc.invalidateQueries({ queryKey: ['admin-users'] })
      const loginUrl = `${window.location.origin}/admin/login`
      setCredentialsInfo({ label: `${result.name} — account created`, name: result.name, email: result.email, ...(result.phone != null ? { phone: result.phone } : {}), temporaryPassword: result.temporaryPassword, loginUrl })
      setForm({ email: '', name: '', role: 'admin', phone: '', ...(isSuper && form.orgId ? { orgId: form.orgId } : {}) })
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Failed to create user')
    } finally { setIsSaving(false) }
  }

  async function handleSaveEdit(id: number) {
    if (!editForm) return
    setSaveError(null); setIsSaving(true)
    try {
      await apiClient.updateAdminUser(id, { ...editForm, phone: editForm.phone || null })
      if (editForm.role === 'user') {
        await apiClient.setUserProperties(id, editPropertyIds)
      } else {
        await apiClient.setUserProperties(id, [])
      }
      await qc.invalidateQueries({ queryKey: ['admin-users'] })
      setEditingId(null); setEditForm(null); setEditPropertyIds([])
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Failed to update user')
    } finally { setIsSaving(false) }
  }

  async function handleResetPassword(u: AdminUserRecord) {
    try {
      const result = await apiClient.resetAdminUserPassword(u.id)
      const loginUrl = `${window.location.origin}/admin/login`
      setCredentialsInfo({ label: `Password reset — ${u.name}`, name: u.name, email: u.email, ...(u.phone != null ? { phone: u.phone } : {}), temporaryPassword: result.temporaryPassword, loginUrl })
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Failed to reset password')
    }
  }

  async function handleDelete(id: number) {
    setDeleteConfirm(null); setDeleteError(null); setDeleting(id)
    try {
      await apiClient.deleteAdminUser(id)
      await qc.invalidateQueries({ queryKey: ['admin-users'] })
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Delete failed')
    } finally { setDeleting(null) }
  }

  async function handleReviveUser(id: number) {
    try {
      await apiClient.reviveAdminUser(id)
      await qc.invalidateQueries({ queryKey: ['admin-users'] })
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Revive failed')
    }
  }

  function startEditOrg(orgId: number, current: string | null | undefined) {
    setEditingOrgId(orgId)
    setEditingOrgHgId(current ?? '')
    setOrgSaveError(null)
  }

  async function handleSaveOrgHgId(orgId: number) {
    setOrgSaveError(null); setIsSavingOrg(true)
    try {
      await apiClient.setOrgHyperGuestId(orgId, editingOrgHgId.trim() || null)
      await qc.invalidateQueries({ queryKey: ['admin-users'] })
      setEditingOrgId(null)
    } catch (err) {
      setOrgSaveError(err instanceof ApiClientError ? err.message : 'Failed to update')
    } finally { setIsSavingOrg(false) }
  }

  const filteredUsers = users.filter(u => {
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
    }
    if (filterRole && u.role !== filterRole) return false
    if (!showDeleted) {
      if (filterStatus === 'active' && !u.isActive) return false
      if (filterStatus === 'inactive' && u.isActive) return false
    }
    if (filterOrg && u.orgName !== filterOrg) return false
    return true
  })

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {credentialsInfo && <CredentialsModal info={credentialsInfo} onClose={() => setCredentialsInfo(null)} />}

      <h1 className="mb-6 text-xl font-semibold text-[var(--color-text)]">Users</h1>

      {/* Invite form */}
      <div className="mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">Invite user</h2>
        <div className={`grid gap-4 ${isSuper ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
          {isSuper && (
            <div>
              <label className={labelCls}>Organization</label>
              {orgs.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  No organizations yet.{' '}
                  <a href="/admin/organizations" className="font-medium text-[var(--color-primary)] underline underline-offset-2">
                    Create one first →
                  </a>
                </p>
              ) : (
                <SearchableOrgSelect
                  value={form.orgId ? String(form.orgId) : ''}
                  onChange={v => setForm(f => v ? { ...f, orgId: Number(v) } : { email: f.email, name: f.name, role: f.role, ...(f.phone ? { phone: f.phone } : {}) })}
                  orgs={orgs.map(o => ({ id: o.id, name: o.name, hgId: o.hyperGuestOrgId }))}
                  placeholder="Select org…"
                  searchable
                />
              )}
            </div>
          )}
          <div>
            <label className={labelCls}>Name</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Jane Smith" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jane@example.com" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone <span className="normal-case font-normal text-[var(--color-text-muted)]">(optional)</span></label>
            <input type="tel" value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+1 555 000 0000" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={inputCls}>
              {(isSuper ? SUPER_ROLES : ROLES).map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_HINT[r]}</option>
              ))}
            </select>
          </div>
        </div>
        {saveError && !editingId && <p className="mt-3 text-sm text-[var(--color-error)]">{saveError}</p>}
        <button
          onClick={handleCreate}
          disabled={isSaving || !form.name.trim() || !form.email.trim() || (isSuper && !form.orgId && form.role !== 'affiliate')}
          className="mt-4 rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving && !editingId ? 'Creating…' : 'Create user'}
        </button>
      </div>

      {deleteError && (
        <div className="mb-4 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-4 py-2 text-sm text-[var(--color-error)]">
          {deleteError}
        </div>
      )}

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search name or email…"
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-light)] min-w-[200px]"
        />
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
        >
          <option value="">All roles</option>
          {(isSuper ? ['super', 'admin', 'observer', 'user', 'affiliate'] : ['admin', 'observer', 'user']).map(r => (
            <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="deleted">Deleted</option>
        </select>
        {isSuper && (
          <SearchableOrgSelect
            value={filterOrg}
            onChange={setFilterOrg}
            orgs={[...new Set(users.map(u => u.orgName).filter(Boolean) as string[])].sort().map(n => ({ name: n, hgId: users.find(u => u.orgName === n)?.orgHyperGuestOrgId ?? null }))}
            placeholder="All orgs"
            searchable
          />
        )}
        {(filterSearch || filterRole || filterStatus || filterOrg) && (
          <button
            onClick={() => { setFilterSearch(''); setFilterRole(''); setFilterStatus(''); setFilterOrg('') }}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Users table */}
      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
            {users.length === 0 ? 'No users yet.' : 'No users match the current filters.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                <Th>Name</Th>
                <Th>Email</Th>
                {isSuper && <Th>Organization</Th>}
                {isSuper && <Th>HG Org ID</Th>}
                <Th>Role</Th>
                <Th>Status</Th>
                <th className="sticky right-0 bg-[var(--color-background)] px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredUsers.map(u => {
                const isMe = u.id === me?.id
                const isEditing = editingId === u.id
                const isEditingThisOrg = isSuper && editingOrgId === u.orgId
                const totalCols = isSuper ? 7 : 5
                return (
                  <React.Fragment key={u.id}>
                  <tr className={isEditing ? 'bg-[var(--color-primary-light)]' : 'hover:bg-[var(--color-background)]'}>
                    {/* Name */}
                    <td className="px-4 py-3">
                      {isEditing && editForm ? (
                        <input type="text" value={editForm.name}
                          onChange={e => setEditForm(f => f ? { ...f, name: e.target.value } : f)}
                          className={`${inputCls} py-1`} />
                      ) : (
                        <span className="font-medium text-[var(--color-text)]">
                          {u.name}
                          {isMe && <span className="ml-2 text-xs text-[var(--color-text-muted)]">(you)</span>}
                        </span>
                      )}
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 max-w-[220px]"><span className="block truncate text-[var(--color-text-muted)]" title={u.email}>{u.email}</span></td>

                    {/* Org name (super only) */}
                    {isSuper && (
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{u.orgName ?? '—'}</td>
                    )}

                    {/* HG Org ID (super only) */}
                    {isSuper && (
                      <td className="px-4 py-3">
                        {isEditingThisOrg ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingOrgHgId}
                              onChange={e => setEditingOrgHgId(e.target.value)}
                              placeholder="e.g. demand-org-123"
                              className={`${inputCls} py-1 font-mono text-xs`}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveOrgHgId(u.orgId!)
                                if (e.key === 'Escape') setEditingOrgId(null)
                              }}
                            />
                            <button
                              onClick={() => handleSaveOrgHgId(u.orgId!)}
                              disabled={isSavingOrg}
                              className="rounded-md bg-[var(--color-primary)] px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                            >
                              {isSavingOrg ? '…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingOrgId(null)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => u.orgId !== undefined && startEditOrg(u.orgId, u.orgHyperGuestOrgId)}
                            className="group flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-[var(--color-border)]"
                            title="Click to edit"
                          >
                            <span className={`font-mono text-xs ${u.orgHyperGuestOrgId ? 'text-[var(--color-text)]' : 'italic text-[var(--color-text-muted)]'}`}>
                              {u.orgHyperGuestOrgId ?? 'not set'}
                            </span>
                            <PencilIcon className="h-3 w-3 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                        )}
                        {isEditingThisOrg && orgSaveError && (
                          <p className="mt-1 text-xs text-[var(--color-error)]">{orgSaveError}</p>
                        )}
                      </td>
                    )}

                    {/* Role */}
                    <td className="px-4 py-3">
                      {isEditing && editForm && !isMe ? (
                        <select value={editForm.role}
                          onChange={e => setEditForm(f => f ? { ...f, role: e.target.value } : f)}
                          className={`${inputCls} py-1`}>
                          {(isSuper ? SUPER_ROLES : ROLES).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      ) : (
                        <RoleBadge role={u.role} />
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {isEditing && editForm && !isMe ? (
                        <div className="flex gap-1">
                          {[true, false].map(v => (
                            <button key={String(v)}
                              onClick={() => setEditForm(f => f ? { ...f, isActive: v } : f)}
                              className={activeBtnCls(editForm.isActive === v)}>
                              {v ? 'Active' : 'Inactive'}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <StatusBadge isActive={u.isActive} />
                      )}
                    </td>

                    {/* Actions */}
                    <td className={`sticky right-0 px-4 py-3 border-l border-[var(--color-border)] ${isEditing ? 'bg-[var(--color-primary-light)]' : 'bg-[var(--color-surface)]'}`}>
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        {isEditing ? (
                          <>
                            {saveError && <span className="mr-1 text-xs text-[var(--color-error)]">{saveError}</span>}
                            <button onClick={() => handleSaveEdit(u.id)} disabled={isSaving}
                              className="rounded-md bg-[var(--color-primary)] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                              {isSaving ? '…' : 'Save'}
                            </button>
                            <button onClick={() => { setEditingId(null); setEditForm(null); setEditPropertyIds([]); setSaveError(null) }}
                              className="rounded-md px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                              Cancel
                            </button>
                          </>
                        ) : showDeleted ? (
                          <button onClick={() => handleReviveUser(u.id)}
                            className="rounded-md bg-[var(--color-success)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--color-success)] transition-colors hover:bg-[var(--color-success)]/20">
                            Revive
                          </button>
                        ) : (
                          <>
                            {!isMe && (
                              <button onClick={() => handleResetPassword(u)}
                                className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]">
                                Reset pwd
                              </button>
                            )}
                            <button onClick={() => { setEditingId(u.id); setEditForm({ name: u.name, role: u.role, isActive: u.isActive, phone: u.phone ?? '' }); setEditPropertyIds(u.propertyIds ?? []); setSaveError(null) }}
                              className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]">
                              Edit
                            </button>
                            {!isMe && (
                              deleteConfirm === u.id ? (
                                <>
                                  <button onClick={() => handleDelete(u.id)} disabled={deleting === u.id}
                                    className="rounded-md bg-[var(--color-error)] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                                    {deleting === u.id ? '…' : 'Confirm'}
                                  </button>
                                  <button onClick={() => setDeleteConfirm(null)}
                                    className="rounded-md px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => setDeleteConfirm(u.id)}
                                  className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-error)]/70 transition-colors hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]">
                                  Delete
                                </button>
                              )
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isEditing && editForm && (
                    <tr key={`${u.id}-phone`} className="bg-[var(--color-primary-light)]">
                      <td colSpan={totalCols} className="border-t border-[var(--color-border)] px-6 py-3">
                        <div className="flex items-center gap-3">
                          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Phone</label>
                          <input
                            type="tel"
                            value={editForm.phone}
                            onChange={e => setEditForm(f => f ? { ...f, phone: e.target.value } : f)}
                            placeholder="+1 555 000 0000 (optional)"
                            className="max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                  {isEditing && editForm?.role === 'user' && (
                    <tr key={`${u.id}-properties`} className="bg-[var(--color-primary-light)]">
                      <td colSpan={totalCols} className="border-t border-[var(--color-border)] px-6 py-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                          Assigned Properties
                        </p>
                        {orgProperties.length === 0 ? (
                          <p className="text-xs text-[var(--color-text-muted)]">No properties available for this organization.</p>
                        ) : (
                          <div className="flex flex-wrap gap-3">
                            {orgProperties.map(p => {
                              const checked = editPropertyIds.includes(p.propertyId)
                              return (
                                <label key={p.propertyId} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:border-[var(--color-primary)]">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setEditPropertyIds(ids =>
                                        checked ? ids.filter(id => id !== p.propertyId) : [...ids, p.propertyId]
                                      )
                                    }
                                    className="accent-[var(--color-primary)]"
                                  />
                                  <span className="font-mono">{p.propertyId}</span>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* B2B connections — always visible for buyer/seller orgs */}
      {!isSuper && (orgSettings?.orgType === 'buyer' || orgSettings?.orgType === 'seller') && (
        <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">
            {orgSettings?.orgType === 'buyer' ? 'Selling partners' : 'Buying partners'}
          </h2>
          <div className="space-y-5">
            {orgSettings?.orgType === 'seller' && (
              (connections?.asSeller.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {connections!.asSeller.map(c => (
                    <span key={c.id} className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-sm text-[var(--color-text)]">
                      {c.org.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)]">No buyer organizations connected yet.</p>
              )
            )}
            {orgSettings?.orgType === 'buyer' && (
              (connections?.asBuyer.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {connections!.asBuyer.map(c => (
                    <span key={c.id} className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-sm text-[var(--color-text)]">
                      {c.org.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)]">No seller organizations connected yet.</p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles & sub-components ───────────────────────────────────────────────────

const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]'
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'
const activeBtnCls = (active: boolean) => [
  'rounded-md border px-2.5 py-0.5 text-xs font-medium transition-all',
  active ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
         : 'border-[var(--color-border)] text-[var(--color-text-muted)]',
].join(' ')

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
      {children}
    </th>
  )
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: 'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
    observer: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
    user: 'bg-amber-50 text-amber-700',
    super: 'bg-purple-50 text-purple-700',
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors[role] ?? colors.observer}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={[
      'rounded-full px-2.5 py-0.5 text-xs font-semibold',
      isActive ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
               : 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
    ].join(' ')}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a4 4 0 01-1.414.914l-3 1 1-3a4 4 0 01.914-1.414z" />
    </svg>
  )
}
