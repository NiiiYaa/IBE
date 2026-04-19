'use client'

import { useAdminProperty } from '../../property-context'
import { NavItemEditor } from '../nav/NavItemEditor'
import { OrgNavItemEditor } from '../nav/OrgNavItemEditor'

export default function HeaderNavPage() {
  const { propertyId } = useAdminProperty()

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Header</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Items appear in the top navigation bar. Supports static text, links, and popups.
          {!propertyId && ' These are the default items inherited by all properties.'}
        </p>
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-card">
        {propertyId ? (
          <NavItemEditor section="header" title="Header navigation" propertyId={propertyId} />
        ) : (
          <OrgNavItemEditor section="header" title="Default header navigation" />
        )}
      </div>
    </div>
  )
}
