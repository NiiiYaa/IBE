import { Suspense } from 'react'
import type { NavItem } from '@ibe/shared'
import { NavMenu } from './NavMenu'
import { HeaderSelectors } from './HeaderSelectors'
import { DynamicBrand } from './DynamicBrand'

export type HeaderMapData =
  | { mode: 'hotel'; propertyId: number; lat: number; lng: number; name: string; address: string; orgId?: number }
  | { mode: 'chain'; orgId: number }

interface HeaderProps {
  logoUrl?: string | null
  displayName?: string | null
  propertyId?: number
  navItems?: NavItem[]
  enabledLocales?: string[]
  enabledCurrencies?: string[]
  defaultLocale?: string
  defaultCurrency?: string
  isB2BMode?: boolean
  mapData?: HeaderMapData
  showGroupsButton?: boolean
}

export function Header({
  logoUrl,
  displayName,
  propertyId,
  navItems = [],
  enabledLocales = [],
  enabledCurrencies = [],
  defaultLocale = 'en',
  defaultCurrency = 'USD',
  isB2BMode,
  mapData,
  showGroupsButton,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Suspense fallback={
          <span className="text-lg font-semibold text-[var(--color-primary)]">
            {displayName ?? 'Hotel Booking'}
          </span>
        }>
          <DynamicBrand fallbackLogoUrl={logoUrl} fallbackDisplayName={displayName} isB2BMode={isB2BMode} />
        </Suspense>

        <div className="flex items-center gap-4">
          <NavMenu
            items={navItems}
            className="hidden sm:flex items-center gap-4"
            itemClassName="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary)]"
          />
          <Suspense>
            <HeaderSelectors
              enabledLocales={enabledLocales}
              enabledCurrencies={enabledCurrencies}
              defaultLocale={defaultLocale}
              defaultCurrency={defaultCurrency}
              isB2BMode={isB2BMode}
              navItems={navItems}
              {...(mapData ? { mapData } : {})}
              {...(showGroupsButton ? { showGroupsButton } : {})}
              {...(propertyId ? { groupsPropertyId: propertyId } : {})}
            />
          </Suspense>
        </div>
      </div>
    </header>
  )
}
