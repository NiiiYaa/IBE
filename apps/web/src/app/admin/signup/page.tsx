import Link from 'next/link'

export default function AdminSignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm text-center">
        <h1 className="mb-3 text-xl font-semibold text-[var(--color-text)]">Account creation is managed by HyperGuest</h1>
        <p className="mb-6 text-sm text-[var(--color-text-muted)]">
          To set up a new hotel account, please contact your HyperGuest representative.
        </p>
        <Link
          href="/admin/login"
          className="inline-block rounded-md bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          Back to login
        </Link>
      </div>
    </div>
  )
}
