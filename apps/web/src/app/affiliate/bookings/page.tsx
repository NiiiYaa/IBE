'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export default function AffiliateBookingsPage() {
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['affiliate-bookings'],
    queryFn: () => apiClient.affiliateBookings(),
  })

  if (isLoading) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Bookings</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">All bookings referred by your affiliate links.</p>
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">No bookings yet. Share your affiliate links to start earning.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Ref</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Hotel</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Guest</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Dates</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">Total</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
              {bookings.map(b => (
                <tr key={b.id}>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text)]">{b.bookingRef}</td>
                  <td className="px-4 py-3 text-[var(--color-text)]">{b.propertyName}</td>
                  <td className="px-4 py-3 text-[var(--color-text)]">{b.guestName}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                    {new Date(b.checkIn).toLocaleDateString()} – {new Date(b.checkOut).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--color-text)]">
                    {b.currency} {b.totalAmount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--color-success)]">
                    {b.currency} {b.commissionAmount.toFixed(2)}
                    <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">({b.commissionRate}%)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
