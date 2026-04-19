'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useGuestAuth } from '@/hooks/use-guest-auth'

const NAV = [
  { href: '/account/bookings', label: 'My Bookings' },
  { href: '/account/profile', label: 'Profile' },
]

const AUTH_PAGES = ['/account/login', '/account/register']

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { guest, isLoading, isAuthenticated, logout } = useGuestAuth()

  // Login/register pages render themselves — no nav wrapper needed
  if (AUTH_PAGES.includes(pathname)) return <>{children}</>

  if (isLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </main>
    )
  }

  if (!isAuthenticated) {
    // Redirect via replace so back-button works correctly
    if (typeof window !== 'undefined') window.location.replace('/account/login')
    return null
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">My Account</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{guest?.firstName} {guest?.lastName}</p>
        </div>
        <button
          onClick={logout}
          className="rounded-md border border-[var(--color-border)] px-4 py-1.5 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] transition-colors"
        >
          Sign out
        </button>
      </div>

      <div className="mb-6 flex gap-1 border-b border-[var(--color-border)]">
        {NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              pathname.startsWith(item.href)
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {children}
    </main>
  )
}
