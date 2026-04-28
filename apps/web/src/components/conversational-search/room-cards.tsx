'use client'

import { useRouter } from 'next/navigation'
import type { SearchResult, RateOffer, BookingHandoff } from './types'

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
        <div key={room.roomId} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
          {/* Room header */}
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{room.roomName}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{room.bedding} · up to {room.maxOccupancy} guests</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] text-[var(--color-text-muted)]">Starting from</p>
              <p className="text-sm font-bold text-[var(--color-primary)]">{fmt(room.lowestPrice)}</p>
              <p className="text-[10px] text-[var(--color-text-muted)]">per night</p>
            </div>
          </div>

          {/* Offer buttons — one per board+refundable combo */}
          <div className="flex flex-wrap gap-1.5">
            {room.offers.map(offer => (
              <OfferButton
                key={`${offer.ratePlanId}`}
                offer={offer}
                total={fmt(offer.price * data.nights)}
                onClick={() => router.push(buildBookingUrl(data, room.roomId, offer.ratePlanId, fallbackPropertyId))}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function OfferButton({ offer, total, onClick }: { offer: RateOffer; total: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0 rounded-lg bg-[var(--color-primary)] px-2.5 py-1 text-center transition-opacity hover:opacity-90"
    >
      <span className="text-xs font-extrabold uppercase tracking-wide text-white">Book</span>
      <span className={`text-[9px] font-semibold ${offer.isRefundable ? 'text-emerald-300' : 'text-orange-300'}`}>
        {offer.boardAbbr} / {offer.isRefundable ? 'Refundable' : 'Non-refundable'}
      </span>
      <span className="text-sm font-extrabold text-white">{total}</span>
    </button>
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
