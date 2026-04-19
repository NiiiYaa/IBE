import type { NavItem } from '@ibe/shared'
import { NavMenu } from './NavMenu'

interface FooterProps {
  navItems?: NavItem[]
  displayName?: string | null
}

export function Footer({ navItems = [], displayName }: FooterProps) {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-6 sm:flex-row sm:justify-between">
        <p className="text-xs text-[var(--color-text-muted)]">
          © {new Date().getFullYear()} {displayName ?? 'Hotel Booking'}. All rights reserved.
        </p>

        <NavMenu
          items={navItems}
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
          itemClassName="text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary)] cursor-pointer"
        />
      </div>
    </footer>
  )
}
