'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useAdminAuth } from '../../hooks/use-admin-auth'
import { AdminPropertyProvider, useAdminProperty } from './property-context'
import { PropertySelector } from './PropertySelector'
import { apiClient } from '@/lib/api-client'

type NavItem = { href: string; label: string; minRole?: 'admin' | 'super'; propertyOnly?: boolean; multiPropertyOnly?: boolean; sellerOnly?: boolean; buyerAccessible?: boolean }
type Section = { title: string; items: NavItem[]; href?: string; minRole?: 'admin' | 'super'; comingSoon?: boolean; sellerOnly?: boolean; buyerAccessible?: boolean }

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
      { href: '/admin/design/header', label: 'Header' },
      { href: '/admin/design/footer', label: 'Footer' },
      { href: '/admin/design/currency', label: 'Currency' },
      { href: '/admin/design/language', label: 'Language' },
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
    title: 'Configuration',
    items: [
      { href: '/admin/config/properties', label: 'Properties', sellerOnly: true },
      { href: '/admin/config/org', label: 'Organization', minRole: 'admin', buyerAccessible: true },
      { href: '/admin/config/domain', label: 'Domain', sellerOnly: true },
      { href: '/admin/config/offers', label: 'Offers', sellerOnly: true },
      { href: '/admin/config/models', label: 'Channels', sellerOnly: true },
      { href: '/admin/config/pixels', label: 'Tracking & Analytics', sellerOnly: true },
      { href: '/admin/payments/gateway', label: 'Payment Gateway', minRole: 'admin', sellerOnly: true },
      { href: '/admin/communication/emails', label: 'Emails', sellerOnly: true },
      { href: '/admin/communication/whatsapp', label: 'WhatsApp', sellerOnly: true },
      { href: '/admin/communication/sms', label: 'SMS', sellerOnly: true },
      { href: '/admin/config/maps', label: 'Maps', sellerOnly: true },
      { href: '/admin/config/weather', label: 'Weather', sellerOnly: true },
      { href: '/admin/config/events', label: 'Events', sellerOnly: true },
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

const ROLE_LEVEL: Record<string, number> = { super: 2, admin: 1, observer: 0, user: 0 }

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
    ? properties.length > 1
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
    if (isAuthenticated && !isAuthPage && !isOnboarding && orgData && !orgData.hyperGuestOrgId && role !== 'super' && orgData.orgType !== 'buyer') {
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
      if (_p?.subdomain) {
        b2cUrl = `https://${_p.subdomain}.hyperguest.net`
      } else if (_webDomain) {
        b2cUrl = `${_webDomain.replace(/\/$/, '')}/?hotelId=${propertyId}`
      } else if (_orgSlug) {
        b2cUrl = `https://${_orgSlug}.hyperguest.net/?hotelId=${propertyId}`
      }
    } else {
      b2cUrl = _webDomain
        ? _webDomain.replace(/\/$/, '') + '/'
        : _orgSlug ? `https://${_orgSlug}.hyperguest.net` : null
    }
  }

  const b2bUrl = _enabledModels.includes('b2b') && _orgSlug
    ? `https://${_orgSlug}-b2b.hyperguest.net`
    : null

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        style={{
          width: collapsed ? 0 : '220px',
          transition: 'width 200ms ease',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
        className="border-r border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        {/* Fixed-width inner so content doesn't reflow during animation */}
        <div style={{ width: '220px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Logo + collapse button */}
          <div className="flex items-center justify-between px-4 py-5">
            <Image src="/hyperguest-logo.png" alt="HyperGuest" width={120} height={28} priority />
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </div>

          {admin && (
            <div className="border-b border-[var(--color-border)] px-4 pb-3">
              <div className="flex items-center justify-between gap-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-medium text-[var(--color-text)]">{admin.name}</p>
                    {(admin.role === 'super' || admin.role === 'admin') && (
                      <RoleBadge role={admin.role as 'super' | 'admin'} />
                    )}
                  </div>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">{admin.email}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  <Link
                    href="/admin/profile"
                    title="My profile"
                    className="flex-shrink-0 rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                    </svg>
                  </Link>
                  <a
                    href="/HG-IBE-Admin-User-Manual.pdf"
                    download
                    title="Download user manual"
                    className="flex-shrink-0 rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </a>
                </div>
              </div>
              <button
                onClick={logout}
                className="mt-2 text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-error)]"
              >
                Sign out
              </button>
            </div>
          )}

          {/* Property context selector */}
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

          <nav className="space-y-1 px-3 pb-4 pt-2">
            {openSections.size > 0 && (
              <div className="flex justify-end px-2 pb-1">
                <button
                  onClick={() => setOpenSections(new Set())}
                  className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  Collapse all ▴
                </button>
              </div>
            )}
            {visibleSections.map(({ title, href: sectionHref, items: rawItems, minRole, comingSoon }) => {
              if (comingSoon) {
                return (
                  <div key={title} className="flex items-center justify-between rounded-md px-2 py-1.5">
                    <span className="text-xs font-semibold text-[var(--color-text-muted)]">{title}</span>
                    <span className="rounded px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wide bg-amber-100 text-amber-600">
                      Soon
                    </span>
                  </div>
                )
              }
              if (sectionHref) {
                const isActive = pathname === sectionHref
                return (
                  <Link
                    key={title}
                    href={sectionHref}
                    className={[
                      'flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors',
                      isActive
                        ? 'text-[var(--color-primary)]'
                        : 'text-[var(--color-text)] hover:bg-[var(--color-background)]',
                    ].join(' ')}
                  >
                    {title}
                    {minRole && <RoleBadge role={minRole} />}
                  </Link>
                )
              }
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
        </div>
      </aside>

      {/* Main content + expand button when collapsed */}
      <div className="relative min-w-0 flex-1 flex flex-col">
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

        {/* Context bar — shown when there's a property selector or view links */}
        {(showPropertySelector || b2cUrl || b2bUrl) && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-amber-500">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
            {showPropertySelector && (
              <span className="flex-1 text-amber-800">
                {propertyId === null ? (
                  isSuper && orgId === null ? (
                    <>
                      Configuring: <span className="font-semibold">System</span>
                      <span className="ml-1 text-amber-600">— global defaults for all organisations</span>
                    </>
                  ) : isSuper && orgId !== null ? (
                    <>
                      Configuring: <span className="font-semibold">
                        {(() => {
                          const o = superOrgs?.find(o => o.id === orgId)
                          const hgId = o?.hyperGuestOrgId
                          return o?.name ? `${o.name}${hgId ? ` (#${hgId})` : ''}` : `Org ${orgId}`
                        })()}
                      </span>
                      <span className="ml-1 text-amber-600">— chain level</span>
                    </>
                  ) : (
                    <>
                      Configuring: <span className="font-semibold">Chain level</span>
                      <span className="ml-1 text-amber-600">— changes apply to all properties</span>
                    </>
                  )
                ) : (
                  <>
                    Configuring: <span className="font-semibold">
                      {propertyNameMap[propertyId] ?? `Property ${propertyId}`}
                    </span>
                    {(() => {
                      const prop = properties.find(p => p.propertyId === propertyId)
                      return prop?.orgName ? (
                        <span className="ml-1 text-amber-600">· {prop.orgName}</span>
                      ) : null
                    })()}
                    <span className="ml-1.5 font-mono text-amber-500">#{propertyId}</span>
                  </>
                )}
              </span>
            )}
            {!showPropertySelector && <span className="flex-1" />}
            {(b2cUrl || b2bUrl) && (
              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                {b2cUrl && (
                  <a
                    href={b2cUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    View B2C
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                )}
                {b2bUrl && (
                  <a
                    href={b2bUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    View B2B
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                )}
              </div>
            )}
          </div>
        )}

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
