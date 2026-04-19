'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { usePreferences } from '@/context/preferences'
import { localeName, localeFlag } from '@/lib/locales'
import { currencyName, currencySymbol, TOP_CURRENCIES, ALL_CURRENCIES } from '@/lib/currencies'
import { decodeSearchParams, encodeSearchParams } from '@/lib/search-params'
import { useGuestAuth } from '@/hooks/use-guest-auth'

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
  const { guest, isLoading, isAuthenticated } = useGuestAuth()

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

  return (
    <Link
      href="/account/login"
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      <span className="hidden sm:inline">Sign in</span>
    </Link>
  )
}

// ── Language selector ─────────────────────────────────────────────────────────

function LanguageSelector({ enabledLocales }: { enabledLocales: string[] }) {
  const { locale, setLocale } = usePreferences()

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
          {enabledLocales.map(code => (
            <Option
              key={code}
              active={locale === code}
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

  const pinnedSet = enabledCurrencies.length > 0 ? new Set(enabledCurrencies) : new Set(TOP_CURRENCIES)
  const topList = TOP_CURRENCIES.filter(c => pinnedSet.has(c))
  const topSet = new Set(topList)
  const allList = ALL_CURRENCIES.filter(c => !topSet.has(c))

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
          {topList.length > 0 && (
            <>
              <SectionLabel>Top currencies</SectionLabel>
              {topList.map(code => (
                <Option key={code} active={currency === code} onClick={() => handleSelect(code, close)}>
                  <span className="w-8 shrink-0 text-center text-sm font-semibold text-[var(--color-text-muted)]">{currencySymbol(code)}</span>
                  <span className="w-12 shrink-0 font-semibold text-[var(--color-text)]">{code}</span>
                  <span className="text-[var(--color-text-muted)]">{currencyName(code)}</span>
                </Option>
              ))}
              <div className="mx-4 my-2 border-t border-[var(--color-border)]" />
              <SectionLabel>All currencies</SectionLabel>
            </>
          )}
          {allList.map(code => (
            <Option key={code} active={currency === code} onClick={() => handleSelect(code, close)}>
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

interface HeaderSelectorsProps {
  enabledLocales: string[]
  enabledCurrencies: string[]
  defaultLocale: string
  defaultCurrency: string
}

export function HeaderSelectors({
  enabledLocales,
  enabledCurrencies,
  defaultLocale,
  defaultCurrency,
}: HeaderSelectorsProps) {
  const { setLocale, setCurrency } = usePreferences()

  useEffect(() => {
    const savedLocale = localStorage.getItem('ibe-locale')
    const savedCurrency = localStorage.getItem('ibe-currency')
    if (!savedLocale) setLocale(defaultLocale)
    if (!savedCurrency) setCurrency(defaultCurrency)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultLocale, defaultCurrency])

  const showLocale = enabledLocales.length > 1

  return (
    <div className="flex items-center gap-1">
      {showLocale && <LanguageSelector enabledLocales={enabledLocales} />}
      <CurrencySelector enabledCurrencies={enabledCurrencies} />
      <GuestAccountButton />
    </div>
  )
}
