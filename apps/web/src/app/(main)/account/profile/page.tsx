'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRequireGuestAuth } from '@/hooks/use-guest-auth'
import { apiClient, ApiClientError } from '@/lib/api-client'

export default function GuestProfilePage() {
  const { guest } = useRequireGuestAuth()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', nationality: '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (guest) {
      setForm({
        firstName: guest.firstName,
        lastName: guest.lastName,
        phone: guest.phone ?? '',
        nationality: guest.nationality ?? '',
      })
    }
  }, [guest])

  const profileMutation = useMutation({
    mutationFn: () => apiClient.updateGuestMe({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim() || null,
      nationality: form.nationality.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-me'] })
      setProfileSuccess(true)
      setProfileError(null)
      setTimeout(() => setProfileSuccess(false), 3000)
    },
    onError: () => setProfileError('Failed to update profile.'),
  })

  const passwordMutation = useMutation({
    mutationFn: () => apiClient.updateGuestMe({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    }),
    onSuccess: () => {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordSuccess(true)
      setPasswordError(null)
      setTimeout(() => setPasswordSuccess(false), 3000)
    },
    onError: (err) => {
      setPasswordError(err instanceof ApiClientError && err.status === 401 ? 'Current password is incorrect.' : 'Failed to change password.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteGuestMe(),
    onSuccess: () => {
      queryClient.clear()
      window.location.href = '/'
    },
  })

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault()
    setProfileError(null)
    profileMutation.mutate()
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (passwordForm.newPassword.length < 8) { setPasswordError('New password must be at least 8 characters.'); return }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { setPasswordError('Passwords do not match.'); return }
    setPasswordError(null)
    passwordMutation.mutate()
  }

  function pset(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(f => ({ ...f, [field]: e.target.value }))
  }

  const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'

  return (
    <div className="max-w-lg space-y-6">
      {/* Profile details */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">Personal details</h2>
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">First name</label>
              <input type="text" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Last name</label>
              <input type="text" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Email</label>
            <input type="email" value={guest?.email ?? ''} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Phone <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></label>
            <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
          </div>
          {profileError && <p className="text-sm text-[var(--color-error)]">{profileError}</p>}
          {profileSuccess && <p className="text-sm text-green-600">Profile updated.</p>}
          <button type="submit" disabled={profileMutation.isPending}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60 transition-colors">
            {profileMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">Change password</h2>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Current password</label>
            <input type="password" value={passwordForm.currentPassword} onChange={pset('currentPassword')} required autoComplete="current-password" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">New password</label>
            <input type="password" value={passwordForm.newPassword} onChange={pset('newPassword')} required autoComplete="new-password" minLength={8} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Confirm new password</label>
            <input type="password" value={passwordForm.confirmPassword} onChange={pset('confirmPassword')} required autoComplete="new-password" className={inputCls} />
          </div>
          {passwordError && <p className="text-sm text-[var(--color-error)]">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm text-green-600">Password changed.</p>}
          <button type="submit" disabled={passwordMutation.isPending}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60 transition-colors">
            {passwordMutation.isPending ? 'Changing…' : 'Change password'}
          </button>
        </form>
      </div>

      {/* Delete account */}
      <div className="rounded-xl border border-[var(--color-error)]/30 bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-error)]">Delete account</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">This will anonymise your account. Your booking history will be retained.</p>
        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)}
            className="rounded-md border border-[var(--color-error)] px-4 py-2 text-sm font-medium text-[var(--color-error)] hover:bg-red-50 transition-colors">
            Delete account
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
              className="rounded-md bg-[var(--color-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-colors">
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button onClick={() => setShowDeleteConfirm(false)}
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
