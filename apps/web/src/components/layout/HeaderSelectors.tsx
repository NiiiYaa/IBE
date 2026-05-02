'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useT } from '@/context/translations'
import { usePreferences } from '@/context/preferences'
import { useSearchSelection } from '@/context/search-selection'
import { localeName, localeFlag } from '@/lib/locales'
import { currencyName, currencySymbol, TOP_CURRENCIES, ALL_CURRENCIES } from '@/lib/currencies'
import { decodeSearchParams, encodeSearchParams } from '@/lib/search-params'
import { useGuestAuth } from '@/hooks/use-guest-auth'
import { useB2BAgentAuth } from '@/hooks/use-b2b-agent-auth'
import { MapButton } from '@/components/map/MapButton'
import { NavMenu } from '@/components/layout/NavMenu'
import type { HeaderMapData } from '@/components/layout/Header'
import type { NavItem } from '@ibe/shared'

// ── Shared dropdown shell ─────────────────────────────────────────────────────

function Dropdown({
  trigger,
  width,
  children,
}: {
  trigger: React.ReactNode
  width?: string
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={[
          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
          open
            ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]',
        ].join(' ')}
      >
        {trigger}
        <svg
          className={['h-3.5 w-3.5 transition-transform', open ? 'rotate-180' : ''].join(' ')}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-xl ring-1 ring-black/8"
          style={{ width: width ?? '200px' }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

// ── Shared option row ─────────────────────────────────────────────────────────

function Option({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-primary-light)]',
        active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]',
      ].join(' ')}
    >
      {children}
      {active && (
        <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
      {children}
    </p>
  )
}

// ── Guest account button ──────────────────────────────────────────────────────

function GuestAccountButton() {
  const tAccount = useT('account')
  const { guest, isLoading, isAuthenticated } = useGuestAuth()
  const pathname = usePathname()
  const rawSearchParams = useSearchParams()

  if (isLoading) return null

  if (isAuthenticated && guest) {
    return (
      <Link
        href="/account/bookings"
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
        title="My account"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span className="hidden sm:inline">{guest.firstName}</span>
      </Link>
    )
  }

  const returnTo = rawSearchParams.toString()
    ? `${pathname}?${rawSearchParams.toString()}`
    : pathname

  return (
    <Link
      href={`/account/login?returnTo=${encodeURIComponent(returnTo)}`}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      <span className="hidden sm:inline">{tAccount('signIn')}</span>
    </Link>
  )
}

// ── Language selector ─────────────────────────────────────────────────────────

function LanguageSelector({ enabledLocales }: { enabledLocales: string[] }) {
  const { locale, setLocale } = usePreferences()

  const others = enabledLocales.filter(c => c !== locale)

  return (
    <Dropdown
      trigger={
        <>
          <span>{localeFlag(locale)}</span>
          <span>{localeName(locale)}</span>
        </>
      }
    >
      {close => (
        <div className="py-1">
          <Option key={locale} active onClick={() => close()}>
            <span className="text-base leading-none">{localeFlag(locale)}</span>
            <span>{localeName(locale)}</span>
          </Option>
          {others.length > 0 && <div className="mx-4 my-1 border-t border-[var(--color-border)]" />}
          {others.map(code => (
            <Option
              key={code}
              active={false}
              onClick={() => { setLocale(code); close() }}
            >
              <span className="text-base leading-none">{localeFlag(code)}</span>
              <span>{localeName(code)}</span>
            </Option>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

// ── Currency selector ─────────────────────────────────────────────────────────

function CurrencySelector({ enabledCurrencies }: { enabledCurrencies: string[] }) {
  const { currency, setCurrency } = usePreferences()
  const router = useRouter()
  const pathname = usePathname()
  const rawParams = useSearchParams()

  const restricted = enabledCurrencies.length > 0
  const baseList = restricted ? enabledCurrencies : [...TOP_CURRENCIES, ...ALL_CURRENCIES.filter(c => !new Set(TOP_CURRENCIES).has(c))]
  const others = baseList.filter(c => c !== currency)

  function handleSelect(code: string, close: () => void) {
    setCurrency(code)
    // On the search page, immediately replace the URL so useSearch re-fires with the new currency
    if (pathname === '/search') {
      const searchParams = decodeSearchParams(rawParams)
      if (searchParams) {
        const qs = encodeSearchParams({ ...searchParams, currency: code })
        router.replace(`/search?${qs.toString()}`)
      }
    }
    close()
  }

  return (
    <Dropdown trigger={<span>{currencyName(currency)}</span>} width="360px">
      {close => (
        <div className="max-h-80 overflow-y-auto py-1">
          <Option active onClick={() => close()}>
            <span className="w-8 shrink-0 text-center text-sm font-semibold text-[var(--color-text-muted)]">{currencySymbol(currency)}</span>
            <span className="w-12 shrink-0 font-semibold text-[var(--color-text)]">{currency}</span>
            <span className="text-[var(--color-text-muted)]">{currencyName(currency)}</span>
          </Option>
          {others.length > 0 && <div className="mx-4 my-1 border-t border-[var(--color-border)]" />}
          {others.map(code => (
            <Option key={code} active={false} onClick={() => handleSelect(code, close)}>
              <span className="w-8 shrink-0 text-center text-sm font-semibold text-[var(--color-text-muted)]">{currencySymbol(code)}</span>
              <span className="w-12 shrink-0 font-semibold text-[var(--color-text)]">{code}</span>
              <span className="text-[var(--color-text-muted)]">{currencyName(code)}</span>
            </Option>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

// ── B2B agent button ──────────────────────────────────────────────────────────

function B2BAgentButton() {
  const { agent, isLoading, isAuthenticated, logout } = useB2BAgentAuth()

  if (isLoading) return null

  if (isAuthenticated && agent) {
    return (
      <Dropdown
        trigger={
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="hidden sm:inline">{agent.name}</span>
          </>
        }
      >
        {close => (
          <div className="py-1">
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <p className="text-xs font-semibold text-[var(--color-text)]">{agent.name}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{agent.organizationName}</p>
            </div>
            <Link
              href="/b2b/bookings"
              onClick={close}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-light)]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              My bookings
            </Link>
            <button
              onClick={() => { close(); logout() }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-light)]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        )}
      </Dropdown>
    )
  }

  return null
}

// ── Export ────────────────────────────────────────────────────────────────────

interface HeaderSelectorsProps {
  enabledLocales: string[]
  enabledCurrencies: string[]
  defaultLocale: string
  defaultCurrency: string
  isB2BMode?: boolean | undefined
  mapData?: HeaderMapData
  showGroupsButton?: boolean
  groupsPropertyId?: number
  navItems?: NavItem[]
}

export function HeaderSelectors({
  enabledLocales,
  enabledCurrencies,
  defaultLocale,
  defaultCurrency,
  isB2BMode,
  mapData,
  showGroupsButton,
  groupsPropertyId,
  navItems = [],
}: HeaderSelectorsProps) {
  const t = useT('common')
  const { setLocale, setCurrency } = usePreferences()
  const { selection } = useSearchSelection()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)

  const effectiveGroupsPropertyId = selection.propertyId ?? groupsPropertyId

  useEffect(() => {
    const savedLocale = localStorage.getItem('ibe-locale')
    const savedCurrency = localStorage.getItem('ibe-currency')
    if (!savedLocale) setLocale(defaultLocale)
    if (!savedCurrency) setCurrency(defaultCurrency)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultLocale, defaultCurrency])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const showLocale = enabledLocales.length > 1

  const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname

  const groupsHref = pathname.startsWith('/groups')
    ? (searchParams.get('returnTo') ?? '/')
    : (effectiveGroupsPropertyId ? `/groups?hotelId=${effectiveGroupsPropertyId}` : '/groups') +
      `&returnTo=${encodeURIComponent(currentUrl)}`

  return (
    <>
      {/* Desktop selectors */}
      <div className="hidden sm:flex items-center gap-1">
        {showGroupsButton && (
          <a
            href={groupsHref}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
          >
            {pathname.startsWith('/groups') ? t('fit') : t('groups')}
          </a>
        )}
        {mapData && <MapButton mapData={mapData} />}
        <CurrencySelector enabledCurrencies={enabledCurrencies} />
        {showLocale && <LanguageSelector enabledLocales={enabledLocales} />}
        {isB2BMode ? <B2BAgentButton /> : <GuestAccountButton />}
      </div>

      {/* Mobile hamburger button */}
      <button
        className="sm:hidden flex items-center justify-center w-9 h-9 rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)]"
        onClick={() => setMenuOpen(v => !v)}
        aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
      >
        {menuOpen ? (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile menu panel */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setMenuOpen(false)} />
          <div
            className="fixed inset-x-0 top-14 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg sm:hidden"
            onClick={e => e.stopPropagation()}
          >
            {navItems.length > 0 && (
              <div className="border-b border-[var(--color-border)] px-4 py-3">
                <NavMenu
                  items={navItems}
                  className="flex flex-col gap-1"
                  itemClassName="block rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
                />
              </div>
            )}
            <div className="flex flex-col px-2 py-2">
              {showGroupsButton && (
                <a
                  href={groupsHref}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
                  onClick={() => setMenuOpen(false)}
                >
                  {pathname.startsWith('/groups') ? t('fit') : t('groups')}
                </a>
              )}
              {mapData && <MapButton mapData={mapData} />}
              <CurrencySelector enabledCurrencies={enabledCurrencies} />
              {showLocale && <LanguageSelector enabledLocales={enabledLocales} />}
              {isB2BMode ? <B2BAgentButton /> : <GuestAccountButton />}
            </div>
          </div>
        </>
      )}
    </>
  )
}
