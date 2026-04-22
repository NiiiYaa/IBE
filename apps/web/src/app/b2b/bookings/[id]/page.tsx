'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${d.getDate()}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-[var(--color-border)] last:border-0">
      <span className="text-sm text-[var(--color-text-muted)] shrink-0">{label}</span>
      <span className="text-sm text-right text-[var(--color-text)]">{value}</span>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
}

export default function B2BBookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const { data: booking, isLoading } = useQuery({
    queryKey: ['b2b-booking', id],
    queryFn: () => apiClient.b2bGetBooking(Number(id)),
  })

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.cancelB2BBooking(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['b2b-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['b2b-booking', id] })
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
        <Link href="/b2b/bookings" className="mt-3 inline-block text-sm text-[var(--color-primary)] hover:underline">Back to bookings</Link>
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/b2b/bookings" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] flex items-center gap-1">
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
        <Row label="Guest" value={`${booking.leadGuestFirstName} ${booking.leadGuestLastName}`} />
        <Row label="Email" value={booking.leadGuestEmail} />
        <Row label="HyperGuest ID" value={booking.hyperGuestBookingId} />
        <Row label="Check-in" value={booking.checkIn} />
        <Row label="Check-out" value={booking.checkOut} />
        <Row label="Nights" value={booking.nights} />
        <Row label="Rooms" value={booking.rooms.length} />
        <Row label="Currency" value={booking.currency} />
        {booking.originalPrice && booking.originalPrice !== booking.totalAmount && (
          <Row label="Original price" value={<span className="line-through text-[var(--color-text-muted)]">{booking.originalPrice.toFixed(2)}</span>} />
        )}
        <Row label="Total" value={<span className="font-semibold">{booking.currency} {booking.totalAmount.toFixed(2)}</span>} />
        {booking.promoCode && <Row label="Promo code" value={booking.promoCode} />}
        {booking.agencyReference && <Row label="Reference" value={booking.agencyReference} />}
        {booking.cancellationDeadline && (
          <Row label="Free cancellation until" value={fmtDate(booking.cancellationDeadline)} />
        )}
        <Row label="Booked on" value={fmtDate(booking.createdAt)} />
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

      {booking.cancellationFrames !== undefined && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Cancellation policy</h3>
          {booking.isRefundable ? (
            <div className="flex items-start gap-2 text-sm text-success">
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span>Free cancellation — no charges apply</span>
            </div>
          ) : (
            <div className="space-y-2">
              {booking.cancellationFrames.filter(f => f.penaltyAmount > 0).map((f, i) => {
                const isPast = new Date(f.from) <= new Date()
                return (
                  <div key={i} className={`flex items-start gap-2 text-sm ${isPast ? 'text-error' : 'text-amber-700'}`}>
                    <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <span>
                      {isPast
                        ? <>Non-refundable — cancellation fee: <strong>{f.currency} {f.penaltyAmount.toFixed(2)}</strong></>
                        : <>Cancellation fee of <strong>{f.currency} {f.penaltyAmount.toFixed(2)}</strong> applies after {fmtDate(f.from)}</>
                      }
                    </span>
                  </div>
                )
              })}
            </div>
          )}
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
            <div className="rounded-xl border border-[var(--color-error)]/40 bg-red-50 p-4 space-y-3">
              {booking.isRefundable ? (
                <div className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm text-[var(--color-text)]">
                    <strong>No cancellation fee</strong> — this booking can be cancelled at no charge.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p className="text-sm text-[var(--color-text)]">
                    {booking.cancellationFrames.find(f => f.penaltyAmount > 0) ? (
                      <>A cancellation fee of <strong>{booking.cancellationFrames.find(f => f.penaltyAmount > 0)!.currency} {booking.cancellationFrames.find(f => f.penaltyAmount > 0)!.penaltyAmount.toFixed(2)}</strong> will apply.</>
                    ) : (
                      <>A cancellation fee may apply.</>
                    )}
                  </p>
                </div>
              )}
              <p className="text-sm font-medium text-[var(--color-text)]">Are you sure you want to cancel?</p>
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
