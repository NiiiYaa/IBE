'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '../../../lib/api-client'

export default function AdminSignupPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({ email: '', password: '', name: '', orgName: '', hyperGuestOrgId: '' })
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsPending(true)
    try {
      await apiClient.adminSignup({
        ...form,
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Create account</h1>
        <p className="mb-6 text-sm text-[var(--color-text-muted)]">Set up your hotel booking engine</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Your name</label>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              required
              autoComplete="name"
              placeholder="Jane Smith"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Hotel / organization name</label>
            <input
              type="text"
              value={form.orgName}
              onChange={set('orgName')}
              required
              placeholder="Grand Hotel Lisboa"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">HyperGuest Org ID</label>
            <input
              type="text"
              value={form.hyperGuestOrgId}
              onChange={set('hyperGuestOrgId')}
              placeholder="Your HyperGuest demand org ID"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Required for login — your demand organization ID in HyperGuest</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              required
              autoComplete="email"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]"
            />
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
