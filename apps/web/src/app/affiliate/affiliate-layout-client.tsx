'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

const NAV = [
  { href: '/affiliate/dashboard', label: 'Dashboard' },
  { href: '/affiliate/hotels', label: 'Hotels' },
  { href: '/affiliate/links', label: 'My Links' },
  { href: '/affiliate/bookings', label: 'Bookings' },
]

const PUBLIC_PATHS = ['/affiliate/login', '/affiliate/register', '/affiliate/verify-email']

export default function AffiliateLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  const { data: me, isPending, isError } = useQuery({
    queryKey: ['affiliate-me'],
    queryFn: () => apiClient.affiliateMe(),
    enabled: !isPublic,
    retry: false,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!isPublic && !isPending && (isError || !me)) {
      router.replace('/affiliate/login')
    }
  }, [isPublic, isPending, isError, me, router])

  if (isPublic) return <>{children}</>

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>
      </div>
    )
  }

  if (!me) return null

  async function handleLogout() {
    await apiClient.adminLogout()
    router.replace('/affiliate/login')
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/affiliate/dashboard" className="flex items-center gap-2 shrink-0">
              <Image src="/affiliate-logo.png" alt="HG Affiliates" width={180} height={48} className="h-12 w-auto object-contain" />
            </Link>
            <nav className="flex gap-1">
              {NAV.map(n => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    pathname.startsWith(n.href)
                      ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--color-text-muted)]">{me.name}</span>
            <Link
              href="/affiliate/account"
              title="Account settings"
              className={`rounded-md p-1.5 transition-colors ${
                pathname.startsWith('/affiliate/account')
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            &copy; {new Date().getFullYear()} HyperGuest. All rights reserved.
          </p>
          <Link href="/affiliate/terms" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">
            Affiliate T&amp;C
          </Link>
        </div>
      </footer>
    </div>
  )
}
