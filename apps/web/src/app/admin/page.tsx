import Link from 'next/link'

const SECTIONS = [
  {
    href: '/admin/bookings',
    title: 'Bookings',
    description: 'View and manage all reservations',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
      </svg>
    ),
  },
  {
    href: '/admin/conversion/promo-codes',
    title: 'Marketing',
    description: 'Promo codes, price comparison, onsite conversion, affiliates, campaigns',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
  {
    href: '/admin/config/cross-sell',
    title: 'Cross-Sell',
    description: 'Post-booking upsells, add-on products, and local events',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  {
    href: '/admin/config/groups',
    title: 'Groups',
    description: 'Group and corporate booking configuration',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/admin/design/homepage',
    title: 'Display & Design',
    description: 'Colours, fonts, logo, hero images, layout',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
      </svg>
    ),
  },
  {
    href: '/admin/guests',
    title: 'Guests',
    description: 'Guest list, profiles, and messaging',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/admin/config/properties',
    title: 'Configuration',
    description: 'Properties, domain, offers, payments, integrations',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
      </svg>
    ),
  },
  {
    href: '/admin/users',
    title: 'Team',
    description: 'Admin users and organizations',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    href: '/admin/config/ai',
    title: 'AI',
    description: 'AI-powered tools and automation',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2.5 L13.3 10.7 L21.5 12 L13.3 13.3 L12 21.5 L10.7 13.3 L2.5 12 L10.7 10.7 Z" />
        <path d="M19 2 L19.7 5.3 L23 6 L19.7 6.7 L19 10 L18.3 6.7 L15 6 L18.3 5.3 Z" />
      </svg>
    ),
  },
]

const COMING_SOON = [
  {
    title: 'Dashboards',
    description: 'Analytics and reporting dashboards',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
]

export default function AdminHomePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Administration</h1>
      <p className="mb-8 text-sm text-[var(--color-text-muted)]">Configure your booking engine</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(s => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-all hover:border-[var(--color-primary)] hover:shadow-md"
          >
            <div className="mb-3 text-[var(--color-primary)]">{s.icon}</div>
            <h2 className="font-semibold text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary)]">
              {s.title}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{s.description}</p>
          </Link>
        ))}

        {COMING_SOON.map(s => (
          <div
            key={s.title}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 opacity-60 shadow-sm"
          >
            <div className="mb-3 flex items-start justify-between">
              <span className="text-[var(--color-primary)]">{s.icon}</span>
              <span className="rounded px-1.5 py-px text-[9px] font-bold uppercase leading-none tracking-wide bg-amber-100 text-amber-600">
                Soon
              </span>
            </div>
            <h2 className="font-semibold text-[var(--color-text)]">{s.title}</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{s.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
