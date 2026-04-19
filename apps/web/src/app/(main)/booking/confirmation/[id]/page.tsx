import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { PixelInjector } from '@/components/tracking/PixelInjector'

const PROPERTY_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_HOTEL_ID || 0)

interface PageProps {
  params: { id: string }
}

export default function ConfirmationPage({ params }: PageProps) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-12">
        {/* Success card */}
        <div className="overflow-hidden rounded-2xl border border-[var(--color-success)]/20 bg-[var(--color-surface)] shadow-md">
          {/* Top bar */}
          <div className="bg-success px-8 py-6 text-center text-white">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold">Booking confirmed!</h1>
            <p className="mt-1 text-white/80 text-sm">Your reservation is confirmed</p>
          </div>

          {/* Details */}
          <div className="px-8 py-6 space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-[var(--color-background)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Booking reference</p>
                <p className="mt-0.5 text-xl font-bold tracking-wider text-[var(--color-text)]">
                  #{params.id}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary-light)]">
                <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>

            <p className="text-sm text-center text-muted">
              Please keep your booking reference for your records.
            </p>
          </div>

          {/* Actions */}
          <div className="border-t border-[var(--color-border)] px-8 py-5 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-6 py-2.5 text-sm font-medium text-[var(--color-text)] hover:border-primary hover:text-primary transition-colors"
            >
              Make another booking
            </Link>
          </div>
        </div>
      </main>
      <PixelInjector propertyId={PROPERTY_ID} page="confirmation" />
    </>
  )
}
