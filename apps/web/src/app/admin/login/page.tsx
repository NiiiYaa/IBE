'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '../../../lib/api-client'
import { PasswordInput } from '@/components/ui/PasswordInput'

type AccountChoice = { adminId: number; name: string; organizationName: string; role: string }

export default function AdminLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accounts, setAccounts] = useState<AccountChoice[] | null>(null)
  const [selectedAdminId, setSelectedAdminId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotPending, setForgotPending] = useState(false)
  const [forgotDone, setForgotDone] = useState(false)

  useEffect(() => {
    const oauthError = searchParams.get('error')
    if (oauthError === 'google_no_account') {
      setError('No account found for this Google account. Please sign up first.')
    } else if (oauthError === 'oauth_failed') {
      setError('Google sign-in failed. Please try again.')
    }
  }, [searchParams])

  useEffect(() => {
    apiClient.getAuthProviders().then(p => setGoogleEnabled(p.googleOAuth)).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError(null)
    setIsPending(true)
    try {
      const result = await apiClient.adminLogin(email.trim(), password, selectedAdminId ?? undefined)
      if (result.requiresSelection) {
        setAccounts(result.accounts)
        setSelectedAdminId(result.accounts[0]?.adminId ?? null)
        setIsPending(false)
        return
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-me'] })
      router.replace('/admin')
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 0 || err.message === 'Request failed') {
          setError('Could not reach the server. Please wait a moment and try again.')
        } else {
          setError(err.message)
        }
      } else {
        setError('Login failed. Please try again.')
      }
    } finally {
      setIsPending(false)
    }
  }

  function handleBack() {
    setAccounts(null)
    setSelectedAdminId(null)
    setError(null)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    if (!forgotEmail.trim()) return
    setForgotPending(true)
    await apiClient.adminForgotPassword(forgotEmail.trim()).catch(() => {})
    setForgotPending(false)
    setForgotDone(true)
  }

  const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Image src="/hyperguest-logo.png" alt="HyperGuest" width={160} height={38} priority />
          <p className="text-sm text-[var(--color-text-muted)]">Admin Portal</p>
        </div>

        {accounts ? (
          /* Step 2: account selection */
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              Multiple accounts found for <span className="font-medium text-[var(--color-text)]">{email}</span>. Select which to sign in to:
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Account</label>
              <select
                value={selectedAdminId ?? ''}
                onChange={e => setSelectedAdminId(Number(e.target.value))}
                className={inputCls}
              >
                {accounts.map(a => (
                  <option key={a.adminId} value={a.adminId}>
                    {a.organizationName}{a.role !== 'admin' ? ` (${a.role})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isPending || !selectedAdminId}
                className="flex-1 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
              >
                {isPending ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        ) : showForgot ? (
          forgotDone ? (
            <div className="text-center">
              <p className="mb-4 text-sm text-[var(--color-text-muted)]">
                If an account exists for <strong>{forgotEmail}</strong>, a temporary password has been sent to that email.
              </p>
              <button
                type="button"
                onClick={() => { setShowForgot(false); setForgotDone(false); setForgotEmail('') }}
                className="text-sm text-[var(--color-primary)] hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <p className="text-sm text-[var(--color-text-muted)]">Enter your email and we&apos;ll send you a temporary password.</p>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Email</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputCls}
                />
              </div>
              <button
                type="submit"
                disabled={forgotPending}
                className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
              >
                {forgotPending ? 'Sending…' : 'Send temporary password'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForgot(false); setForgotEmail('') }}
                className="w-full text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Back to sign in
              </button>
            </form>
          )
        ) : (
          /* Step 1: email + password */
          <>
            {googleEnabled && (
              <>
                <a
                  href="/api/v1/auth/google/login"
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
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Password</label>
                <PasswordInput
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className={inputCls}
                />
              </div>

              {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
              >
                {isPending ? 'Signing in…' : 'Sign in'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setForgotEmail(email) }}
                  className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:underline"
                >
                  Forgot your password?
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

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
