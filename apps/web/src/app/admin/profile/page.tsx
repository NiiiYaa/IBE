'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { validatePassword } from '@ibe/shared'

function PasswordStrengthHint({ password }: { password: string }) {
  if (!password) return null
  const errors = validatePassword(password)
  if (errors.length === 0) return <p className="mt-1 text-xs text-green-600">Password meets all requirements</p>
  return (
    <ul className="mt-1 space-y-0.5">
      {errors.map(e => (
        <li key={e} className="text-xs text-[var(--color-error)]">• {e}</li>
      ))}
    </ul>
  )
}

export default function AdminProfilePage() {
  const { admin } = useAdminAuth()
  const queryClient = useQueryClient()

  const [profileForm, setProfileForm] = useState({ name: admin?.name ?? '', email: admin?.email ?? '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!admin) return null

  const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'
  const labelCls = 'mb-1 block text-sm font-medium text-[var(--color-text)]'

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!profileForm.name.trim()) return
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      await apiClient.updateMyAdminProfile({ name: profileForm.name.trim(), email: profileForm.email.trim() })
      await queryClient.invalidateQueries({ queryKey: ['admin-me'] })
      setProfileMsg({ ok: true, text: 'Profile updated.' })
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Update failed'
      setProfileMsg({ ok: false, text: msg })
    } finally {
      setProfileSaving(false)
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    const errors = validatePassword(pwForm.newPassword)
    if (errors.length > 0) { setPwMsg({ ok: false, text: errors.join(', ') }); return }
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwMsg({ ok: false, text: 'Passwords do not match' }); return }
    setPwSaving(true)
    setPwMsg(null)
    try {
      await apiClient.updateMyAdminProfile({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPwMsg({ ok: true, text: 'Password changed successfully.' })
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Password change failed'
      setPwMsg({ ok: false, text: msg })
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 p-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">My Profile</h1>

      {/* Profile info */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">Account details</h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              value={profileForm.name}
              onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input
              type="email"
              value={profileForm.email}
              onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
              required
              className={inputCls}
            />
          </div>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.ok ? 'text-green-600' : 'text-[var(--color-error)]'}`}>
              {profileMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={profileSaving}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {profileSaving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </section>

      {/* Change password */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">Change password</h2>
        <form onSubmit={savePassword} className="space-y-4">
          <div>
            <label className={labelCls}>Current password</label>
            <input
              type="password"
              value={pwForm.currentPassword}
              onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
              required
              autoComplete="current-password"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>New password</label>
            <input
              type="password"
              value={pwForm.newPassword}
              onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
              required
              autoComplete="new-password"
              className={inputCls}
            />
            <PasswordStrengthHint password={pwForm.newPassword} />
          </div>
          <div>
            <label className={labelCls}>Confirm new password</label>
            <input
              type="password"
              value={pwForm.confirmPassword}
              onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
              required
              autoComplete="new-password"
              className={inputCls}
            />
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.ok ? 'text-green-600' : 'text-[var(--color-error)]'}`}>
              {pwMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={pwSaving}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {pwSaving ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </section>
    </div>
  )
}
