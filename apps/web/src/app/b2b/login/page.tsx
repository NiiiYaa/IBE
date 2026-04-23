'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { PasswordInput } from '@/components/ui/PasswordInput'

type AccountChoice = { adminId: number; name: string; organizationName: string; role: string }

function B2BLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/'
  const sellerSlug = searchParams.get('seller') || ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [accounts, setAccounts] = useState<AccountChoice[] | null>(null)
  const [selectedAdminId, setSelectedAdminId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [sellerBranding, setSellerBranding] = useState<{ logoUrl: string | null; displayName: string | null } | null>(null)

  // Load seller branding
  useEffect(() => {
    if (!sellerSlug) return
    apiClient.getSellerConfig(sellerSlug)
      .then(data => setSellerBranding(data))
      .catch(() => {})
  }, [sellerSlug])

  // If already logged in, redirect immediately
  useEffect(() => {
    if (!sellerSlug) return
    apiClient.b2bMe()
      .then(() => router.replace(returnTo))
      .catch(() => {})
  }, [sellerSlug, returnTo, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password || !sellerSlug) return
    setError(null)
    setIsPending(true)
    try {
      const result = await apiClient.b2bLogin(
        email.trim(),
        password,
        sellerSlug,
        selectedAdminId ?? undefined,
        rememberMe,
      )
      if (result.requiresSelection) {
        setAccounts(result.accounts)
        setSelectedAdminId(result.accounts[0]?.adminId ?? null)
        setIsPending(false)
        return
      }
      if (result.mustChangePassword) {
        router.replace('/b2b/force-change-password')
        return
      }
      router.replace(returnTo)
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 403) {
          setError('Your organization does not have access to this portal.')
        } else if (err.status === 0 || err.message === 'Request failed') {
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

  const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          {sellerBranding?.logoUrl ? (
            <Image src={sellerBranding.logoUrl} alt={sellerBranding.displayName ?? 'Logo'} width={160} height={48} priority className="object-contain" />
          ) : sellerBranding?.displayName ? (
            <p className="text-lg font-semibold text-[var(--color-text)]">{sellerBranding.displayName}</p>
          ) : null}
          <p className="text-sm text-[var(--color-text-muted)]">Agent Portal</p>
        </div>

        {accounts ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              Multiple accounts found for <span className="font-medium text-[var(--color-text)]">{email}</span>. Select which to sign in with:
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Organization</label>
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

            <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="rounded border-[var(--color-border)]"
              />
              Keep me signed in for 7 days
            </label>

            {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
            >
              {isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function B2BLoginPage() {
  return (
    <Suspense>
      <B2BLoginForm />
    </Suspense>
  )
}
