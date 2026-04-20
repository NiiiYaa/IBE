'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useAdminAuth } from '../../hooks/use-admin-auth'
import { AdminPropertyProvider, useAdminProperty } from './property-context'
import { apiClient } from '@/lib/api-client'

type NavItem = { href: string; label: string; minRole?: 'admin' | 'super'; propertyOnly?: boolean; multiPropertyOnly?: boolean }
type Section = { title: string; items: NavItem[]; minRole?: 'admin' | 'super' }

const SECTIONS: Section[] = [
  {
    title: 'Bookings',
    items: [
      { href: '/admin/bookings', label: 'All Bookings' },
      { href: '/admin/bookings/booked-today', label: 'Booked Today' },
      { href: '/admin/bookings/checkin-today', label: 'Check-in Today' },
      { href: '/admin/bookings/checkout-today', label: 'Check-out Today' },
      { href: '/admin/bookings/staying', label: 'Staying In' },
      { href: '/admin/bookings/deadline-today', label: 'CNXL Today' },
      { href: '/admin/bookings/cancelled-today', label: 'Cancelled Today' },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { href: '/admin/conversion/promo-codes', label: 'Promo Codes' },
      { href: '/admin/conversion/price-comparison', label: 'Price Comparison', propertyOnly: true },
      { href: '/admin/conversion/onsite', label: 'Onsite Conversion' },
      { href: '/admin/affiliates', label: 'Affiliate' },
    ],
  },
  {
    title: 'Display & Design',
    items: [
      { href: '/admin/design/chain', label: 'Chain-page', multiPropertyOnly: true },
      { href: '/admin/design/homepage', label: 'Hotel-page' },
      { href: '/admin/design/search', label: 'Rooms-search-page' },
      { href: '/admin/design/header', label: 'Header' },
      { href: '/admin/design/footer', label: 'Footer' },
      { href: '/admin/design/currency', label: 'Currency' },
      { href: '/admin/design/language', label: 'Language' },
    ],
  },
  {
    title: 'Guests',
    items: [
      { href: '/admin/guests', label: 'All Guests' },
      { href: '/admin/communication/messages', label: 'Messages' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { href: '/admin/config/properties', label: 'Properties' },
      { href: '/admin/config/org', label: 'Organization', minRole: 'admin' },
      { href: '/admin/config/domain', label: 'Domain' },
      { href: '/admin/config/offers', label: 'Offers' },
      { href: '/admin/config/pixels', label: 'Tracking & Analytics' },
      { href: '/admin/payments/gateway', label: 'Payment Gateway', minRole: 'admin' },
      { href: '/admin/communication/emails', label: 'Emails' },
      { href: '/admin/communication/whatsapp', label: 'WhatsApp' },
      { href: '/admin/communication/sms', label: 'SMS' },
    ],
  },
  {
    title: 'Team',
    minRole: 'admin',
    items: [
      { href: '/admin/organizations', label: 'Organizations', minRole: 'super' },
      { href: '/admin/users', label: 'Users' },
    ],
  },
]

const ROLE_LEVEL: Record<string, number> = { super: 2, admin: 1, observer: 0, user: 0 }

function filterSections(sections: Section[], role: string): Section[] {
  const level = ROLE_LEVEL[role] ?? 0
  return sections
    .filter(s => !s.minRole || level >= (s.minRole === 'super' ? 2 : 1))
    .map(s => ({
      ...s,
      items: s.items.filter(i => !i.minRole || level >= (i.minRole === 'super' ? 2 : 1)),
    }))
    .filter(s => s.items.length > 0)
}

function RoleBadge({ role }: { role: 'admin' | 'super' }) {
  return (
    <span
      className={[
        'ml-1.5 inline-block rounded px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wide',
        role === 'super'
          ? 'bg-purple-100 text-purple-700'
          : 'bg-blue-100 text-blue-600',
      ].join(' ')}
    >
      {role === 'super' ? 'Super' : 'Admin'}
    </span>
  )
}

// ── Inner layout — can consume AdminPropertyContext ────────────────────────────

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { admin, isLoading, isAuthenticated, logout } = useAdminAuth()
  const { propertyId, setPropertyId } = useAdminProperty()
  const role = admin?.role ?? 'admin'
  const visibleSections = filterSections(SECTIONS, role)

  const isSuper = role === 'super'

  const { data: propertiesData } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: () => apiClient.listProperties(),
    staleTime: Infinity,
    enabled: isAuthenticated && !isSuper,
  })

  const { data: allPropertiesData } = useQuery({
    queryKey: ['admin-super-properties'],
    queryFn: () => apiClient.listAllProperties(),
    staleTime: Infinity,
    enabled: isAuthenticated && isSuper,
  })

  const properties = isSuper
    ? (allPropertiesData?.properties ?? [])
    : (propertiesData?.properties ?? [])

  const propertyMode = isSuper ? 'multi' : (propertiesData?.mode ?? 'single')
  const realProperties = properties.filter(p => !p.isDemo)
  const showPropertySelector = isSuper
    ? properties.length > 1
    : propertyMode === 'multi' && realProperties.length > 1

  const nameQueries = useQueries({
    queries: properties
      .filter(p => !p.isDemo)
      .map(p => ({
        queryKey: ['property', p.propertyId],
        queryFn: () => apiClient.getProperty(p.propertyId),
        staleTime: 60 * 60 * 1000,
        enabled: isAuthenticated,
      })),
  })
  const propertyNameMap: Record<number, string> = {}
  properties.filter(p => !p.isDemo).forEach((p, i) => {
    const name = nameQueries[i]?.data?.name
    if (name) propertyNameMap[p.propertyId] = name
  })

  const initialOpen = () => {
    const set = new Set<string>()
    for (const s of visibleSections) {
      if (s.items.some(i => pathname.startsWith(i.href))) set.add(s.title)
    }
    return set
  }
  const [openSections, setOpenSections] = useState<Set<string>>(initialOpen)

  useEffect(() => {
    if (role === 'super') {
      setOpenSections(prev => {
        if (prev.has('Super Admin')) return prev
        const next = new Set(prev)
        next.add('Super Admin')
        return next
      })
    }
  }, [role])

  // Auto-select the only property when selector is hidden; reset invalid stored IDs
  useEffect(() => {
    if (!showPropertySelector && realProperties.length === 1 && realProperties[0] && propertyId !== realProperties[0].propertyId) {
      setPropertyId(realProperties[0].propertyId)
      return
    }
    if (propertyId !== null && properties.length > 0) {
      const isValid = properties.some(p => p.propertyId === propertyId)
      if (!isValid) setPropertyId(null)
    }
  }, [properties, realProperties, showPropertySelector, propertyId, setPropertyId])

  const isAuthPage = pathname === '/admin/login' || pathname === '/admin/signup'
  const isOnboarding = pathname === '/admin/onboarding'

  const { data: orgData } = useQuery({
    queryKey: ['admin-org'],
    queryFn: () => apiClient.getOrgSettings(),
    enabled: isAuthenticated && !isAuthPage && !isOnboarding && role !== 'super',
    staleTime: Infinity,
  })

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isAuthPage) {
      router.replace('/admin/login')
    }
  }, [isLoading, isAuthenticated, isAuthPage, pathname, router])

  useEffect(() => {
    if (isAuthenticated && !isAuthPage && !isOnboarding && orgData && !orgData.hyperGuestOrgId && role !== 'super') {
      router.replace('/admin/onboarding')
    }
  }, [isAuthenticated, isAuthPage, isOnboarding, orgData, role, router])

  function toggle(title: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      next.has(title) ? next.delete(title) : next.add(title)
      return next
    })
  }

  if (isLoading || (!isAuthenticated && !isAuthPage)) {
    return null
  }

  if (isAuthPage || isOnboarding) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className="w-[220px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]"
        style={{ position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            Admin
          </p>
        </div>

        {admin && (
          <div className="border-b border-[var(--color-border)] px-4 pb-4">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-xs font-medium text-[var(--color-text)]">{admin.name}</p>
              {(admin.role === 'super' || admin.role === 'admin') && (
                <RoleBadge role={admin.role as 'super' | 'admin'} />
              )}
            </div>
            <p className="truncate text-xs text-[var(--color-text-muted)]">{admin.email}</p>
          </div>
        )}

        {/* Property context selector */}
        {showPropertySelector && (
          <div className="border-b border-[var(--color-border)] px-3 py-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
              Property
            </p>
            <select
              value={propertyId ?? ''}
              onChange={e => setPropertyId(e.target.value === '' ? null : Number(e.target.value))}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-xs text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-light)]"
            >
              <option value="">All Properties</option>
              {isSuper ? (
                Object.entries(
                  properties.reduce<Record<string, typeof properties>>((acc, p) => {
                    const key = p.isDemo ? 'Demo' : (p.orgName ?? 'Unknown')
                    ;(acc[key] ??= []).push(p)
                    return acc
                  }, {})
                ).map(([groupName, groupProps]) => (
                  <optgroup key={groupName} label={groupName}>
                    {groupProps.map(p => (
                      <option key={p.propertyId} value={p.propertyId}>
                        {p.isDemo
                          ? `Demo Hotel (${p.propertyId})`
                          : `${propertyNameMap[p.propertyId] ?? `Property ${p.propertyId}`} (${p.propertyId})`}
                      </option>
                    ))}
                  </optgroup>
                ))
              ) : (
                properties.map(p => (
                  <option key={p.propertyId} value={p.propertyId}>
                    {p.isDemo
                      ? `Demo Hotel (${p.propertyId})`
                      : `${propertyNameMap[p.propertyId] ?? `Property ${p.propertyId}`} (${p.propertyId})`}
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        <nav className="space-y-1 px-3 pb-4 pt-2">
          {visibleSections.map(({ title, items: rawItems, minRole }) => {
            const items = rawItems.filter(i =>
              (!i.propertyOnly || propertyId !== null) &&
              (!i.multiPropertyOnly || realProperties.length > 1 || isSuper)
            )
            if (items.length === 0) return null
            const isOpen = openSections.has(title)
            const hasActive = items.some(i => pathname === i.href)
            return (
              <div key={title}>
                <button
                  onClick={() => toggle(title)}
                  className={[
                    'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors',
                    hasActive
                      ? 'text-[var(--color-primary)]'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-background)]',
                  ].join(' ')}
                >
                  <span className="flex items-center">
                    {title}
                    {minRole && <RoleBadge role={minRole} />}
                  </span>
                  <svg
                    className={['h-3.5 w-3.5 shrink-0 transition-transform duration-200', isOpen ? 'rotate-180' : ''].join(' ')}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <ul className="mt-0.5 mb-1 space-y-0.5">
                    {items.map(({ href, label, minRole: itemRole }) => {
                      const isActive = pathname === href
                      return (
                        <li key={href}>
                          <Link
                            href={href}
                            className={[
                              'flex items-center rounded-md py-1.5 pl-4 pr-2 text-sm transition-colors',
                              'border-l-2',
                              isActive
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] font-medium text-[var(--color-primary)]'
                                : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]',
                            ].join(' ')}
                          >
                            {label}
                            {itemRole && <RoleBadge role={itemRole} />}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-[var(--color-border)] p-3">
          <button
            onClick={logout}
            className="w-full rounded-md px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-error)]"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--color-background)]">
        {children}
      </main>
    </div>
  )
}

// ── Outer layout — provides context ───────────────────────────────────────────

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AdminPropertyProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AdminPropertyProvider>
  )
}
