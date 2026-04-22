'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { validatePassword } from '@ibe/shared'
import { PasswordInput } from '@/components/ui/PasswordInput'

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

export default function B2BForceChangePasswordPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errors = validatePassword(form.newPassword)
    if (errors.length > 0) { setError(errors.join(', ')); return }
    if (form.newPassword !== form.confirmPassword) { setError('Passwords do not match'); return }

    setSaving(true)
    setError(null)
    try {
      await apiClient.b2bChangePassword(form.newPassword)
      await queryClient.invalidateQueries({ queryKey: ['b2b-agent-me'] })
      router.replace('/b2b/bookings')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-[var(--color-text)]">Set your password</h1>
        <p className="mb-6 text-sm text-[var(--color-text-muted)]">
          You must set a personal password before continuing.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">New password</label>
            <PasswordInput
              value={form.newPassword}
              onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
              required
              autoFocus
              autoComplete="new-password"
              className={inputCls}
            />
            <PasswordStrengthHint password={form.newPassword} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Confirm password</label>
            <PasswordInput
              value={form.confirmPassword}
              onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
              required
              autoComplete="new-password"
              className={inputCls}
            />
          </div>

          <p className="text-xs text-[var(--color-text-muted)]">
            Min. 8 characters with uppercase, lowercase, number and special character.
          </p>

          {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Set password & continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
