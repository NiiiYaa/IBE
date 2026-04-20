'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { useRequireGuestAuth } from '@/hooks/use-guest-auth'
import { apiClient } from '@/lib/api-client'
import type { GuestBookingSummary } from '@ibe/shared'

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
}

function BookingCard({ b }: { b: GuestBookingSummary }) {
  const now = new Date()
  const checkIn = new Date(b.checkIn)
  const isUpcoming = checkIn >= now && b.status !== 'cancelled'

  return (
    <Link
      href={`/account/bookings/${b.id}`}
      className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm hover:border-[var(--color-primary)] transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Booking #{b.id}</p>
          <div className="flex items-center gap-3 mb-2">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {b.checkIn} → {b.checkOut}
            </p>
            <span className="text-xs text-[var(--color-text-muted)]">({b.nights} nights)</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {b.status}
            </span>
            <span className="text-[var(--color-text-muted)]">{b.currency} {b.totalAmount.toFixed(2)}</span>
            {b.roomCount > 1 && <span className="text-[var(--color-text-muted)]">{b.roomCount} rooms</span>}
          </div>
        </div>
        <svg className="h-5 w-5 flex-shrink-0 text-[var(--color-text-muted)] mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      {b.canCancel && (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          {b.cancellationDeadline
            ? `Free cancellation until ${new Date(b.cancellationDeadline).toLocaleDateString()}`
            : 'Free cancellation'}
        </p>
      )}
    </Link>
  )
}

export default function GuestBookingsPage() {
  useRequireGuestAuth()
  const searchParams = useSearchParams()
  const hotelId = searchParams.get('hotelId')
  const homeHref = hotelId ? `/?hotelId=${hotelId}` : '/'
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['guest-bookings'],
    queryFn: () => apiClient.getGuestBookings(),
  })

  const now = new Date()
  const upcoming = bookings.filter(b => b.status !== 'cancelled' && new Date(b.checkOut) >= now)
  const past = bookings.filter(b => b.status === 'cancelled' || new Date(b.checkOut) < now)
  const displayed = tab === 'upcoming' ? upcoming : past

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-[var(--color-border)]">
        {(['upcoming', 'past'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {t === 'upcoming' ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] py-12 text-center">
          <p className="text-[var(--color-text-muted)]">
            {tab === 'upcoming' ? 'No upcoming bookings.' : 'No past bookings.'}
          </p>
          {tab === 'upcoming' && (
            <Link
              href={homeHref}
              className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] hover:underline"
            >
              Browse hotels
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(b => <BookingCard key={b.id} b={b} />)}
        </div>
      )}
    </div>
  )
}
