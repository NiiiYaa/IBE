import Link from 'next/link'

const SECTIONS = [
  {
    href: '/admin/design/homepage',
    title: 'Design & Branding',
    description: 'Colours, fonts, logo, hero image, tagline',
  },
]

function PaletteIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  )
}

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
            className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-card hover:border-[var(--color-primary)] hover:shadow-md transition-all"
          >
            <div className="mb-3 text-[var(--color-primary)]">
              <PaletteIcon />
            </div>
            <h2 className="font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
              {s.title}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
