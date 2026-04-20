'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '../../../lib/api-client'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

export default function AdminSignupPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', name: '', orgName: '', hyperGuestOrgId: '' })
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)

  useEffect(() => {
    apiClient.getAuthProviders().then(p => setGoogleEnabled(p.googleOAuth)).catch(() => {})
  }, [])

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setError(null)
    setIsPending(true)
    try {
      await apiClient.adminSignup({
        email: form.email,
        password: form.password,
        name: form.name,
        orgName: form.orgName,
        hyperGuestOrgId: form.hyperGuestOrgId.trim() || undefined,
      })
      await queryClient.invalidateQueries({ queryKey: ['admin-me'] })
      router.replace('/admin')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Sign up failed')
    } finally {
      setIsPending(false)
    }
  }

  const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Create account</h1>
        <p className="mb-6 text-sm text-[var(--color-text-muted)]">Set up your hotel booking engine</p>

        {googleEnabled && (
          <>
            <a
              href="/api/v1/auth/google/signup"
              className="mb-4 flex w-full items-center justify-center gap-3 rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)]"
            >
              <GoogleIcon />
              Continue with Google
            </a>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <span className="text-xs text-[var(--color-text-muted)]">or</span>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Your name</label>
            <input type="text" value={form.name} onChange={set('name')} required autoComplete="name" placeholder="Jane Smith" className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Hotel / organization name</label>
            <input type="text" value={form.orgName} onChange={set('orgName')} required placeholder="Grand Hotel Lisboa" className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">HyperGuest Org ID</label>
            <input type="text" value={form.hyperGuestOrgId} onChange={set('hyperGuestOrgId')} placeholder="Your HyperGuest demand org ID" className={inputCls} />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Required for login — your demand organization ID in HyperGuest</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Email</label>
            <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Password</label>
            <input type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" placeholder="Min. 8 characters" className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Confirm password</label>
            <input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} required autoComplete="new-password" placeholder="Repeat your password" className={inputCls} />
          </div>

          {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {isPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-[var(--color-text-muted)]">
          Already have an account?{' '}
          <Link href="/admin/login" className="font-medium text-[var(--color-primary)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
