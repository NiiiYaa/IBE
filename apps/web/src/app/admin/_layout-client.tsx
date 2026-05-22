'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useAdminAuth } from '../../hooks/use-admin-auth'
import { AdminPropertyProvider, useAdminProperty } from './property-context'
import { PropertySelector } from './PropertySelector'
import { apiClient } from '@/lib/api-client'

type NavItem = { href: string; label: string; minRole?: 'admin' | 'super'; propertyOnly?: boolean; multiPropertyOnly?: boolean; sellerOnly?: boolean; buyerAccessible?: boolean }
type Section = { title: string; items: NavItem[]; href?: string; minRole?: 'admin' | 'super'; comingSoon?: boolean; sellerOnly?: boolean; buyerAccessible?: boolean }

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' ||
    /^10\./.test(hostname) || /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
}

const SECTIONS: Section[] = [
  {
    title: 'Dashboard',
    href: '/admin/dashboard',
    items: [
      { href: '/admin/dashboard', label: 'Overview' },
    ],
  },
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
    sellerOnly: true,
    items: [
      { href: '/admin/config/marketing', label: 'Channels' },
      { href: '/admin/conversion/promo-codes', label: 'Promo Codes' },
      { href: '/admin/conversion/price-comparison', label: 'Price Comparison', propertyOnly: true },
      { href: '/admin/conversion/onsite', label: 'Onsite Conversion' },
      { href: '/admin/affiliates', label: 'Affiliates' },
      { href: '/admin/campaigns', label: 'Campaigns' },
      { href: '/admin/marketing/incentives', label: 'Incentives' },
    ],
  },
  {
    title: 'Cross-Sell',
    href: '/admin/config/cross-sell',
    sellerOnly: true,
    items: [],
  },
  {
    title: 'Groups',
    href: '/admin/config/groups',
    sellerOnly: true,
    items: [],
  },
  {
    title: 'Display & Design',
    sellerOnly: true,
    items: [
      { href: '/admin/design/brand', label: 'Brand defaults', minRole: 'super' },
      { href: '/admin/design/chain', label: 'Chain-page', multiPropertyOnly: true },
      { href: '/admin/design/homepage', label: 'Hotel-page' },
      { href: '/admin/design/search', label: 'Rooms-search-page' },
      { href: '/admin/design/header', label: 'Headers' },
      { href: '/admin/design/footer', label: 'Footers' },
      { href: '/admin/design/currency', label: 'Currencies' },
      { href: '/admin/design/language', label: 'Languages' },
      { href: '/admin/design/airports', label: 'Airports', sellerOnly: true },
      { href: '/admin/config/maps', label: 'Maps', sellerOnly: true },
      { href: '/admin/config/weather', label: 'Weather', sellerOnly: true },
      { href: '/admin/config/events', label: 'Activities', sellerOnly: true },
    ],
  },
  {
    title: 'AI',
    items: [
      { href: '/admin/config/ai', label: 'AI Assistant' },
      { href: '/admin/config/ai/channels', label: 'AI Channels' },
      { href: '/admin/ai/mcp', label: 'MCPs' },
    ],
  },
  {
    title: 'Guests',
    sellerOnly: true,
    items: [
      { href: '/admin/guests', label: 'All Guests' },
      { href: '/admin/communication/messages', label: 'Messages' },
    ],
  },
  {
    title: 'Intelligence',
    sellerOnly: true,
    items: [
      { href: '/admin/intelligence/compset', label: 'CompSet', sellerOnly: true },
      { href: '/admin/intelligence/event-calendar', label: 'Event Calendar', sellerOnly: true },
      { href: '/admin/intelligence/data-provider', label: 'Data Provider', sellerOnly: true },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { href: '/admin/config/properties', label: 'Properties', sellerOnly: true },
      { href: '/admin/config/org', label: 'Organization', minRole: 'admin', buyerAccessible: true },
      { href: '/admin/config/domain', label: 'Domain', sellerOnly: true },
      { href: '/admin/config/offers', label: 'Offers', sellerOnly: true },
      { href: '/admin/config/models', label: 'Channels', sellerOnly: true },
      { href: '/admin/config/external-ibe', label: 'External IBE', sellerOnly: true },
      { href: '/admin/config/pixels', label: 'Tracking & Analytics', sellerOnly: true },
      { href: '/admin/payments/gateway', label: 'Payment Gateway', minRole: 'admin', sellerOnly: true },
      { href: '/admin/communication/emails', label: 'Emails', sellerOnly: true },
      { href: '/admin/communication/whatsapp', label: 'WhatsApp', sellerOnly: true },
      { href: '/admin/communication/sms', label: 'SMS', sellerOnly: true },
      { href: '/admin/config/test-bookings', label: 'Test Bookings', sellerOnly: true },
      { href: '/admin/config/manual', label: 'User Manual', minRole: 'super' },
    ],
  },
  {
    title: 'Team',
    minRole: 'admin',
    buyerAccessible: true,
    items: [
      { href: '/admin/organizations', label: 'Organizations', minRole: 'super' },
      { href: '/admin/users', label: 'Users' },
      { href: '/admin/b2b', label: 'B2B Access', minRole: 'super' },
    ],
  },
]

const ROLE_LEVEL: Record<string, number> = { super: 2, admin: 1, observer: 0, user: 0, affiliate: -1 }

function filterSections(sections: Section[], role: string, isBuyerOrg: boolean): Section[] {
  const level = ROLE_LEVEL[role] ?? 0
  return sections
    .filter(s => !s.sellerOnly || !isBuyerOrg)
    .filter(s => s.comingSoon || (isBuyerOrg && s.buyerAccessible) || !s.minRole || level >= (s.minRole === 'super' ? 2 : 1))
    .map(s => ({
      ...s,
      items: s.items.filter(i =>
        ((!i.minRole || level >= (i.minRole === 'super' ? 2 : 1)) || (isBuyerOrg && i.buyerAccessible)) &&
        (!i.sellerOnly || !isBuyerOrg)
      ),
    }))
    .filter(s => s.comingSoon || s.href || s.items.length > 0)
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
  const { propertyId, orgId, setPropertyId, setSelection } = useAdminProperty()
  const role = admin?.role ?? 'admin'

  const [collapsed, setCollapsed] = useState(false)

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

  const { data: superOrgs } = useQuery({
    queryKey: ['super-orgs'],
    queryFn: () => apiClient.listOrgs(),
    staleTime: Infinity,
    enabled: isAuthenticated && isSuper,
  })

  const properties = isSuper
    ? (allPropertiesData?.properties ?? [])
    : (propertiesData?.properties ?? [])

  const propertyMode = isSuper ? 'multi' : (propertiesData?.mode ?? 'single')
  const realProperties = properties.filter(p => !p.isDemo)
  const showPropertySelector = isSuper
    ? true
    : propertyMode === 'multi' && realProperties.length > 1

  const isAuthPage = pathname === '/admin/login' || pathname === '/admin/signup'
  const isOnboarding = pathname === '/admin/onboarding'

  const { data: orgData } = useQuery({
    queryKey: ['admin-org'],
    queryFn: () => apiClient.getOrgSettings(),
    enabled: isAuthenticated && !isAuthPage && !isOnboarding && role !== 'super',
    staleTime: Infinity,
  })

  // For super admins, fetch the selected org's settings to drive View B2C/B2B links
  const { data: superOrgData } = useQuery({
    queryKey: ['admin-org-super', orgId],
    queryFn: () => apiClient.getOrgSettings(orgId!),
    enabled: isAuthenticated && isSuper && orgId != null,
    staleTime: 60_000,
  })

  const { data: systemMeta } = useQuery({
    queryKey: ['system-meta'],
    queryFn: () => apiClient.getSystemMeta(),
    staleTime: 60_000,
    enabled: isAuthenticated,
  })

  const isImpersonating = admin?.impersonatorId !== undefined

  const [impersonateDropdownOpen, setImpersonateDropdownOpen] = useState(false)
  const [impersonateSearch, setImpersonateSearch] = useState('')
  const impersonateDropdownRef = useRef<HTMLDivElement>(null)

  const [activateDropdownOpen, setActivateDropdownOpen] = useState(false)
  const [activateSearch, setActivateSearch] = useState('')
  const activateDropdownRef = useRef<HTMLDivElement>(null)

  const { data: allImpersonateUsers } = useQuery({
    queryKey: ['admin-users-impersonate'],
    queryFn: () => apiClient.listAdminUsers(false),
    enabled: isSuper || isImpersonating,
  })

  const effectiveOrgData = isSuper ? superOrgData : orgData
  const isBuyerOrg = effectiveOrgData?.orgType === 'buyer'
  const visibleSections = filterSections(SECTIONS, role, isBuyerOrg)

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
      const p = realProperties[0]
      setSelection(p.propertyId, p.orgId ?? null)
      return
    }
    if (propertyId !== null && properties.length > 0) {
      const isValid = properties.some(p => p.propertyId === propertyId)
      if (!isValid) setPropertyId(null)
    }
  }, [properties, realProperties, showPropertySelector, propertyId, setPropertyId, setSelection])

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isAuthPage) {
      router.replace('/admin/login')
    }
  }, [isLoading, isAuthenticated, isAuthPage, pathname, router])

  useEffect(() => {
    if (isAuthenticated && admin?.mustChangePassword && !isAuthPage && !isOnboarding && pathname !== '/admin/force-change-password') {
      router.replace('/admin/force-change-password')
    }
  }, [isAuthenticated, admin?.mustChangePassword, isAuthPage, isOnboarding, pathname, router])

  useEffect(() => {
    if (isAuthenticated && role === 'affiliate' && !isAuthPage) {
      router.replace('/affiliate/dashboard')
    }
  }, [isAuthenticated, role, isAuthPage, router])

  useEffect(() => {
    if (isAuthenticated && !isAuthPage && !isOnboarding && orgData && !orgData.hyperGuestOrgId && role !== 'super' && orgData.orgType !== 'buyer') {
      router.replace('/admin/onboarding')
    }
  }, [isAuthenticated, isAuthPage, isOnboarding, orgData, role, router])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (impersonateDropdownRef.current && !impersonateDropdownRef.current.contains(e.target as Node)) {
        setImpersonateDropdownOpen(false)
      }
      if (activateDropdownRef.current && !activateDropdownRef.current.contains(e.target as Node)) {
        setActivateDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Active section: whichever section owns the current pathname
  const activeSection = useMemo(() => {
    for (const s of visibleSections) {
      if (s.href && pathname.startsWith(s.href)) return s.title
      if (s.items.some(i => pathname.startsWith(i.href))) return s.title
    }
    return null
  }, [pathname, visibleSections])

  // Sub-menu items for the active section, filtered by context
  const activeSubItems = useMemo(() => {
    const section = visibleSections.find(s => s.title === activeSection)
    if (!section) return []
    return section.items.filter(i =>
      (!i.propertyOnly || propertyId !== null) &&
      (!i.multiPropertyOnly || realProperties.length > 1 || isSuper)
    )
  }, [activeSection, visibleSections, propertyId, realProperties, isSuper])

  if (isLoading || (!isAuthenticated && !isAuthPage)) {
    return null
  }

  if (isAuthPage || isOnboarding) {
    return <>{children}</>
  }

  if (role === 'affiliate') {
    return null
  }

  // Derive B2C / B2B view URLs from the active org settings + selected property
  const _od = effectiveOrgData
  const _enabledModels = _od?.enabledModels ?? []
  const _orgSlug = _od?.orgSlug ?? null
  const _webDomain = _od?.webDomain ?? null
  const _isBuyer = _od?.orgType === 'buyer'

  let b2cUrl: string | null = null
  if (!_isBuyer && _enabledModels.includes('b2c') && _od) {
    if (propertyId !== null) {
      const _p = properties.find(p => p.propertyId === propertyId)
      if (isLocalHost(window.location.hostname)) {
        b2cUrl = `http://${window.location.hostname}:3000/?hotelId=${propertyId}`
      } else if (_p?.subdomain) {
        b2cUrl = `https://${_p.subdomain}.hyperguest.net`
      } else if (_webDomain) {
        b2cUrl = `${_webDomain.replace(/\/$/, '')}/?hotelId=${propertyId}`
      } else if (_orgSlug) {
        b2cUrl = `https://${_orgSlug}.hyperguest.net/?hotelId=${propertyId}`
      }
    } else {
      if (isLocalHost(window.location.hostname)) {
        b2cUrl = _orgSlug
          ? `http://${window.location.hostname}:3000/?chain=${_orgSlug}`
          : `http://${window.location.hostname}:3000`
      } else {
        b2cUrl = _webDomain
          ? _webDomain.replace(/\/$/, '') + '/'
          : _orgSlug ? `https://${_orgSlug}.hyperguest.net` : null
      }
    }
  }

  const b2bUrl = _enabledModels.includes('b2b') && _orgSlug
    ? `https://${_orgSlug}-b2b.hyperguest.net`
    : null

  return (
    <div className="flex min-h-screen flex-col">

      {/* ── Top navigation bar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3">
        {/* Logo */}
        <div className="flex shrink-0 items-center border-r border-[var(--color-border)] pr-3">
          {systemMeta?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={systemMeta.logoUrl} alt={systemMeta.displayName ?? 'Admin'} className="h-6 max-w-[100px] object-contain" />
          ) : (
            <Image src="/hyperguest-logo.png" alt="HyperGuest" width={100} height={24} priority />
          )}
        </div>

        {/* Main nav */}
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {visibleSections.map(({ title, href: sectionHref, items: rawItems, minRole, comingSoon }) => {
            const isActive = activeSection === title
            if (comingSoon) return (
              <span key={title} className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] opacity-50">
                {title}
                <span className="rounded bg-amber-100 px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wide text-amber-600">Soon</span>
              </span>
            )
            const firstHref = sectionHref ?? rawItems.find(i =>
              (!i.propertyOnly || propertyId !== null) &&
              (!i.multiPropertyOnly || realProperties.length > 1 || isSuper)
            )?.href
            const cls = [
              'flex shrink-0 items-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]',
            ].join(' ')
            return firstHref ? (
              <Link key={title} href={firstHref} className={cls}>
                {title}{minRole && <RoleBadge role={minRole} />}
              </Link>
            ) : (
              <span key={title} className={cls}>
                {title}{minRole && <RoleBadge role={minRole} />}
              </span>
            )
          })}
        </nav>

        {/* User profile */}
        {admin && (
          <div className="flex shrink-0 items-center gap-2 border-l border-[var(--color-border)] pl-3">
            <div className="hidden min-w-0 text-right sm:block">
              <div className="flex items-center justify-end gap-1">
                <p className="max-w-[120px] truncate text-xs font-medium text-[var(--color-text)]">{admin.name}</p>
                {(admin.role === 'super' || admin.role === 'admin') && <RoleBadge role={admin.role as 'super' | 'admin'} />}
              </div>
              <p className="max-w-[160px] truncate text-xs text-[var(--color-text-muted)]">
                {admin.role === 'super' && !admin.organizationId
                  ? 'Super - no org'
                  : admin.orgName
                    ? `${admin.orgName}${admin.orgHyperGuestOrgId ? ` (${admin.orgHyperGuestOrgId})` : ''}`
                    : admin.email}
              </p>
            </div>
            <div className="flex items-center gap-0.5">
              <Link
                href="/admin/profile"
                title="My profile"
                className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </Link>
              <button
                onClick={logout}
                title="Sign out"
                className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-error)]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
              <a
                href="/HG-IBE-Admin-User-Manual.pdf"
                download
                title="Download user manual"
                className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </a>
            </div>
          </div>
        )}
      </header>

      {/* ── Configuring / Impersonation bar ──────────────────────────── */}
      {(isImpersonating || showPropertySelector || b2cUrl || b2bUrl) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs">

          {/* Activate impersonation — shown to super admins when not currently impersonating */}
          {isSuper && !isImpersonating && (
            <div className="relative" ref={activateDropdownRef}>
              <button
                onClick={() => { setActivateDropdownOpen(o => !o); setActivateSearch('') }}
                className="flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-700 transition-colors hover:bg-amber-100"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                Impersonate
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {activateDropdownOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
                  <div className="border-b border-[var(--color-border)] p-2">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search users…"
                      value={activateSearch}
                      onChange={e => setActivateSearch(e.target.value)}
                      className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-text)] focus:outline-none"
                    />
                  </div>
                  <ul className="max-h-48 overflow-y-auto py-1">
                    {(allImpersonateUsers ?? [])
                      .filter(u => {
                        if (u.id === admin?.id) return false
                        const q = activateSearch.toLowerCase()
                        return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
                      })
                      .map(u => (
                        <li key={u.id}>
                          <button
                            onClick={async () => {
                              setActivateDropdownOpen(false)
                              try {
                                await apiClient.impersonate(u.id)
                                window.location.href = '/admin'
                              } catch {
                                setActivateDropdownOpen(true)
                              }
                            }}
                            className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-[var(--color-background)]"
                          >
                            <span className="font-medium text-[var(--color-text)]">{u.name}</span>
                            <span className="text-[10px] text-[var(--color-text-muted)]">{u.email} · {u.role}</span>
                          </button>
                        </li>
                      ))
                    }
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Impersonation section */}
          {isImpersonating && (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-500">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              <span className="shrink-0 text-red-700">Configuring as:</span>

              <div className="relative" ref={impersonateDropdownRef}>
                <button
                  onClick={() => { setImpersonateDropdownOpen(o => !o); setImpersonateSearch('') }}
                  className="flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-0.5 font-medium text-red-700 transition-colors hover:bg-red-100"
                >
                  {admin?.name ?? '…'}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {impersonateDropdownOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
                    <div className="border-b border-[var(--color-border)] p-2">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search users…"
                        value={impersonateSearch}
                        onChange={e => setImpersonateSearch(e.target.value)}
                        className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-text)] focus:outline-none"
                      />
                    </div>
                    <ul className="max-h-48 overflow-y-auto py-1">
                      {(allImpersonateUsers ?? [])
                        .filter(u => {
                          if (u.id === admin?.id) return false
                          if (orgId !== null && u.orgId !== orgId) return false
                          const q = impersonateSearch.toLowerCase()
                          return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
                        })
                        .map(u => (
                          <li key={u.id}>
                            <button
                              onClick={async () => {
                                setImpersonateDropdownOpen(false)
                                try {
                                  await apiClient.impersonate(u.id)
                                  window.location.href = '/admin'
                                } catch {
                                  setImpersonateDropdownOpen(true)
                                }
                              }}
                              className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-[var(--color-background)]"
                            >
                              <span className="font-medium text-[var(--color-text)]">{u.name}</span>
                              <span className="text-[10px] text-[var(--color-text-muted)]">{u.email} · {u.role}</span>
                            </button>
                          </li>
                        ))
                      }
                    </ul>
                  </div>
                )}
              </div>

              <button
                onClick={async () => {
                  await apiClient.exitImpersonation()
                  window.location.href = '/admin'
                }}
                className="rounded border border-red-300 bg-white px-2 py-0.5 font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                Exit
              </button>
            </>
          )}

          {/* Separator between impersonation/activate and configuring sections */}
          {(isImpersonating || isSuper) && (showPropertySelector || b2cUrl || b2bUrl) && (
            <span className="select-none text-amber-400">|</span>
          )}

          {/* Configuring section */}
          {(showPropertySelector || b2cUrl || b2bUrl) && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-amber-500">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          )}
          {showPropertySelector && (
            <span className="flex-1 text-amber-800">
              {propertyId === null ? (
                isSuper && orgId === null ? (
                  <>Configuring: <span className="font-semibold">System</span><span className="ml-1 text-amber-600">— global defaults for all organisations</span></>
                ) : isSuper && orgId !== null ? (
                  <>
                    Configuring: <span className="font-semibold">
                      {(() => { const o = superOrgs?.find(o => o.id === orgId); const hgId = o?.hyperGuestOrgId; return o?.name ? `${o.name}${hgId ? ` (#${hgId})` : ''}` : `Org ${orgId}` })()}
                    </span>
                    <span className="ml-1 text-amber-600">— chain level</span>
                  </>
                ) : (
                  <>Configuring: <span className="font-semibold">Chain level</span><span className="ml-1 text-amber-600">— changes apply to all properties</span></>
                )
              ) : (
                <>
                  Configuring: <span className="font-semibold">{propertyNameMap[propertyId] ?? `Property ${propertyId}`}</span>
                  {(() => { const prop = properties.find(p => p.propertyId === propertyId); return prop?.orgName ? <span className="ml-1 text-amber-600">· {prop.orgName}</span> : null })()}
                  <span className="ml-1.5 font-mono text-amber-500">#{propertyId}</span>
                </>
              )}
            </span>
          )}
          {!showPropertySelector && <span className="flex-1" />}
          {(b2cUrl || b2bUrl) && (
            <div className="ml-2 flex shrink-0 items-center gap-1.5">
              {b2cUrl && (
                <a href={b2cUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-700 transition-colors hover:bg-amber-100">
                  View B2C
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              )}
              {b2bUrl && (
                <a href={b2bUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-700 transition-colors hover:bg-amber-100">
                  View B2B
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Content: sub-menu sidebar + main ──────────────────────────── */}
      <div className="flex min-h-0 flex-1">

        {/* Sub-menu sidebar */}
        <aside
          style={{ width: collapsed ? 0 : '180px', transition: 'width 200ms ease', overflow: 'hidden', flexShrink: 0 }}
          className="border-r border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <div style={{ width: '180px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Property selector */}
            {showPropertySelector && (
              <div className="border-b border-[var(--color-border)] px-3 py-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                  Hotels / Chains / Orgs
                </p>
                <PropertySelector
                  properties={properties}
                  isSuper={isSuper}
                  {...(superOrgs !== undefined ? { superOrgs } : {})}
                  selected={{ propertyId, orgId }}
                  onSelect={s => setSelection(s.propertyId, s.orgId)}
                  propertyNameMap={propertyNameMap}
                />
              </div>
            )}

            {/* Sub-menu items for active section */}
            {activeSubItems.length > 0 && (
              <nav className="px-2 py-2">
                <ul className="space-y-0.5">
                  {activeSubItems.map(({ href, label, minRole: itemRole }) => {
                    const isActive = pathname === href
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          className={[
                            'flex items-center rounded-md py-1.5 pl-3 pr-2 text-sm transition-colors border-l-2',
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
              </nav>
            )}

            {/* Collapse button at bottom of sidebar */}
            <div className="mt-auto flex justify-end border-t border-[var(--color-border)] p-2">
              <button
                onClick={() => setCollapsed(true)}
                title="Collapse sidebar"
                className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            </div>
          </div>
        </aside>

        {/* Expand button when sidebar is collapsed */}
        <div className="relative">
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              className="absolute left-0 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-r-md border border-l-0 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] shadow-sm transition-colors hover:text-[var(--color-text)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-background)]">
          {children}
        </main>
      </div>
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
