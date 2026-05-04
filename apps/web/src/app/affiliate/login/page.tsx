'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { PasswordInput } from '@/components/ui/PasswordInput'

function AffiliateLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'invalid_token' ? 'Invalid or expired verification link.' : null,
  )
  const [isPending, setIsPending] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotPending, setForgotPending] = useState(false)
  const [forgotDone, setForgotDone] = useState(false)

  const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    if (!forgotEmail.trim()) return
    setForgotPending(true)
    await apiClient.adminForgotPassword(forgotEmail.trim()).catch(() => {})
    setForgotPending(false)
    setForgotDone(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsPending(true)
    try {
      const result = await apiClient.adminLogin(email.trim(), password)
      if (result.requiresSelection) {
        setError('Multiple accounts found — please use the admin portal.')
        return
      }
      if (result.role !== 'affiliate') {
        setError('This portal is for affiliate accounts only.')
        return
      }
      await queryClient.invalidateQueries({ queryKey: ['affiliate-me'] })
      router.replace('/affiliate/dashboard')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Login failed. Please try again.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Affiliate Portal</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Sign in to your affiliate account</p>
        </div>

        {showForgot ? (
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
                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required autoComplete="email" className={inputCls} />
              </div>
              <button type="submit" disabled={forgotPending} className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
                {forgotPending ? 'Sending…' : 'Send temporary password'}
              </button>
              <button type="button" onClick={() => { setShowForgot(false); setForgotEmail('') }} className="w-full text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                Back to sign in
              </button>
            </form>
          )
        ) : (
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
            <button type="button" onClick={() => { setShowForgot(true); setForgotEmail(email) }} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:underline">
              Forgot your password?
            </button>
          </div>
        </form>
        )}

        <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
          Don&apos;t have an account?{' '}
          <Link href="/affiliate/register" className="text-[var(--color-primary)] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function AffiliateLoginPage() {
  return (
    <Suspense>
      <AffiliateLoginForm />
    </Suspense>
  )
}
