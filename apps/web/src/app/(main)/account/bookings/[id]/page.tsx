'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRequireGuestAuth } from '@/hooks/use-guest-auth'
import { apiClient } from '@/lib/api-client'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-[var(--color-border)] last:border-0">
      <span className="text-sm text-[var(--color-text-muted)] shrink-0">{label}</span>
      <span className="text-sm text-right text-[var(--color-text)]">{value}</span>
    </div>
  )
}

export default function GuestBookingDetailPage() {
  useRequireGuestAuth()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const { data: booking, isLoading } = useQuery({
    queryKey: ['guest-booking', id],
    queryFn: () => apiClient.getGuestBooking(Number(id)),
  })

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.cancelGuestBooking(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['guest-booking', id] })
      setConfirming(false)
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-text-muted)]">Booking not found.</p>
        <Link href="/account/bookings" className="mt-3 inline-block text-sm text-[var(--color-primary)] hover:underline">Back to bookings</Link>
      </div>
    )
  }

  const STATUS_COLORS: Record<string, string> = {
    confirmed: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  return (
    <div className="max-w-xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/account/bookings" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] flex items-center gap-1">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Booking #{booking.id}</h2>
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[booking.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {booking.status}
        </span>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <Row label="HyperGuest ID" value={booking.hyperGuestBookingId} />
        <Row label="Check-in" value={booking.checkIn} />
        <Row label="Check-out" value={booking.checkOut} />
        <Row label="Nights" value={booking.nights} />
        <Row label="Rooms" value={booking.roomCount} />
        <Row label="Currency" value={booking.currency} />
        {booking.originalPrice && booking.originalPrice !== booking.totalAmount && (
          <Row label="Original price" value={<span className="line-through text-[var(--color-text-muted)]">{booking.originalPrice.toFixed(2)}</span>} />
        )}
        <Row label="Total" value={<span className="font-semibold">{booking.currency} {booking.totalAmount.toFixed(2)}</span>} />
        {booking.promoCode && <Row label="Promo code" value={booking.promoCode} />}
        {booking.promoDiscountPct && <Row label="Promo discount" value={`${booking.promoDiscountPct}%`} />}
        {booking.affiliateCode && <Row label="Affiliate" value={booking.affiliateCode} />}
        <Row label="Payment method" value={booking.paymentMethod} />
        {booking.agencyReference && <Row label="Reference" value={booking.agencyReference} />}
        {booking.cancellationDeadline && (
          <Row label="Free cancellation until" value={new Date(booking.cancellationDeadline).toLocaleString()} />
        )}
        <Row label="Booked on" value={new Date(booking.createdAt).toLocaleDateString()} />
      </div>

      {booking.rooms.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Rooms</h3>
          <div className="space-y-2">
            {booking.rooms.map((r, i) => (
              <div key={i} className="text-sm text-[var(--color-text)]">
                <span className="font-medium">{r.roomCode}</span>
                {r.board && <span className="ml-2 text-[var(--color-text-muted)]">{r.board}</span>}
                {r.status && r.status !== booking.status && (
                  <span className="ml-2 text-xs text-[var(--color-text-muted)]">({r.status})</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {booking.canCancel && (
        <div className="mt-6">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="rounded-md border border-[var(--color-error)] px-4 py-2 text-sm font-medium text-[var(--color-error)] hover:bg-red-50 transition-colors"
            >
              Cancel booking
            </button>
          ) : (
            <div className="rounded-xl border border-[var(--color-error)]/40 bg-red-50 p-4">
              <p className="mb-3 text-sm text-[var(--color-text)]">Are you sure you want to cancel this booking?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="rounded-md bg-[var(--color-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-colors"
                >
                  {cancelMutation.isPending ? 'Cancelling…' : 'Yes, cancel'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  Keep booking
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
