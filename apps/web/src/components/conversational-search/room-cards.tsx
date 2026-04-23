'use client'

import { useRouter } from 'next/navigation'
import type { SearchResult, BookingHandoff } from './types'

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).replace(/ /g, '-')
}

function buildBookingUrl(data: SearchResult, roomId: number, ratePlanId: number, fallbackPropertyId?: number): string {
  const hotelId = data.propertyId ?? fallbackPropertyId
  const adults = data.adults ?? 2
  const params = new URLSearchParams({
    hotelId: String(hotelId),
    searchId: data.searchId,
    roomId: String(roomId),
    ratePlanId: String(ratePlanId),
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    'rooms[0][adults]': String(adults),
  })
  return `/booking?${params.toString()}`
}

export function SearchResultCards({ data, currency, fallbackPropertyId }: { data: SearchResult; currency?: string; fallbackPropertyId?: number }) {
  const router = useRouter()
  const cur = data.currency ?? currency ?? 'EUR'
  const fmt = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n)

  if (!data.rooms?.length) {
    return <p className="mt-2 text-sm text-[var(--color-text-muted)]">No rooms matched your request.</p>
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {data.found} room{data.found !== 1 ? 's' : ''} · {fmtDate(data.checkIn)} → {fmtDate(data.checkOut)} ({data.nights} night{data.nights !== 1 ? 's' : ''})
      </p>
      {data.rooms.map(room => (
        <div key={room.roomId} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{room.roomName}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{room.bedding} · up to {room.maxOccupancy} guests</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {room.boardLabel}
                {room.isRefundable
                  ? <span className="ml-1 text-[var(--color-success)]">· Free cancellation</span>
                  : <span className="ml-1 text-[var(--color-error)]">· Non-refundable</span>}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-base font-bold text-[var(--color-primary)]">{fmt(room.lowestPrice)}</p>
              <p className="text-[10px] text-[var(--color-text-muted)]">per night</p>
            </div>
          </div>
          <button
            onClick={() => router.push(buildBookingUrl(data, room.roomId, room.ratePlanId, fallbackPropertyId))}
            className="mt-2.5 w-full rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          >
            Book · {fmt(room.lowestPrice * data.nights)}
          </button>
        </div>
      ))}
    </div>
  )
}

export function BookingHandoffCard({ data }: { data: BookingHandoff }) {
  const router = useRouter()
  return (
    <div className="mt-3 rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary-light,#e8f0fb)] p-3">
      <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Ready to book?</p>
      <button
        onClick={() => router.push(data.url)}
        className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
      >
        Continue to Booking
      </button>
    </div>
  )
}
