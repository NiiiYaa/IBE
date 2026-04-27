'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useB2BAgentAuth } from '@/hooks/use-b2b-agent-auth'
import { useEffect } from 'react'

export default function B2BBookingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { agent, isLoading, isAuthenticated, logout } = useB2BAgentAuth()

  useEffect(() => {
    if (!isLoading && isAuthenticated && agent?.mustChangePassword) {
      router.replace('/b2b/force-change-password')
    }
  }, [isLoading, isAuthenticated, agent, router])

  if (isLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </main>
    )
  }

  if (!isAuthenticated) return null
  if (agent?.mustChangePassword) return null

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Agent Portal</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {agent?.name}
            {agent?.organizationName && <span className="ml-1 text-[var(--color-text-muted)]">· {agent.organizationName}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          >
            Search hotels
          </Link>
          <button
            onClick={logout}
            className="rounded-md border border-[var(--color-border)] px-4 py-1.5 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-1 border-b border-[var(--color-border)]">
        <Link
          href="/b2b/bookings"
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            pathname === '/b2b/bookings' || pathname.startsWith('/b2b/bookings/')
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          My Bookings
        </Link>
      </div>

      {children}
    </main>
  )
}
