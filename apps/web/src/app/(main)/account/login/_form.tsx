'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '@/lib/api-client'

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

function LoginFormInner({ propertyId }: { propertyId: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const returnTo = searchParams.get('returnTo') || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)

  useEffect(() => {
    apiClient.getGuestAuthProviders().then(p => setGoogleEnabled(p.googleOAuth)).catch(() => {})
    if (searchParams.get('error') === 'oauth_failed') setError('Google sign-in failed. Please try again.')
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsPending(true)
    try {
      await apiClient.guestLogin(email.trim(), password, propertyId)
      await queryClient.invalidateQueries({ queryKey: ['guest-me'] })
      router.replace(returnTo)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.status === 403 ? 'Your account has been suspended. Please contact support.' : 'Invalid email or password.')
      } else {
        setError('Sign in failed. Please try again.')
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-[var(--color-text)]">Sign in</h1>

        {googleEnabled && (
          <>
            <a
              href={`/api/v1/guest/auth/google?state=${propertyId}`}
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
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]"
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
        </form>

        <p className="mt-5 text-sm text-[var(--color-text-muted)]">
          Don&apos;t have an account?{' '}
          <Link href={`/account/register?returnTo=${encodeURIComponent(returnTo)}`} className="font-medium text-[var(--color-primary)] hover:underline">
            Create account
          </Link>
        </p>

        <div className="mt-4 border-t border-[var(--color-border)] pt-4 text-center">
          <Link
            href={returnTo}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            Continue without signing in
          </Link>
        </div>
      </div>
    </main>
  )
}

export function LoginForm({ propertyId }: { propertyId: number }) {
  return (
    <Suspense>
      <LoginFormInner propertyId={propertyId} />
    </Suspense>
  )
}
