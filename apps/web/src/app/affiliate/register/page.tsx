'use client'

import { useState } from 'react'
import Link from 'next/link'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { PasswordInput } from '@/components/ui/PasswordInput'

export default function AffiliateRegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsPending(true)
    try {
      await apiClient.affiliateRegister({
        email: email.trim(),
        password,
        name: name.trim(),
      })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Registration failed. Please try again.')
    } finally {
      setIsPending(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm text-center">
          <div className="mb-4 text-4xl">✉️</div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Check your email</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <Link href="/affiliate/login" className="mt-6 inline-block text-sm text-[var(--color-primary)] hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] py-10">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Create affiliate account</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Join the affiliate marketplace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Full name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required className={inputCls} autoComplete="name" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className={inputCls} autoComplete="email" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Password</label>
            <PasswordInput value={password} onChange={e => setPassword(e.target.value)} required className={inputCls} autoComplete="new-password" />
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

        <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
          Already have an account?{' '}
          <Link href="/affiliate/login" className="text-[var(--color-primary)] hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
