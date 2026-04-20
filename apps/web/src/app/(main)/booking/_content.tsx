'use client'

import { useSearchParams } from 'next/navigation'
import { decodeSearchParams } from '@/lib/search-params'
import { useSearch } from '@/hooks/use-search'
import { BookingForm } from '@/components/booking/BookingForm'
import { BookingSummary, type SelectedRoom } from '@/components/booking/BookingSummary'
import Link from 'next/link'

export function BookingContent() {
  const rawParams = useSearchParams()
  const searchId   = rawParams.get('searchId') ?? ''
  const affiliateId = rawParams.get('affiliateId') ?? undefined

  const searchParams = decodeSearchParams(rawParams)
  const { data: searchData, isLoading } = useSearch(searchParams)

  // Support both single-room (?roomId=X&ratePlanId=Y) and multi-room (?rooms[0][roomId]=X...) formats
  const singleRoomId   = Number(rawParams.get('roomId'))
  const singleRatePlanId = Number(rawParams.get('ratePlanId'))

  const multiRoomPairs: { roomId: number; ratePlanId: number }[] = []
  for (let i = 0; ; i++) {
    const rId = Number(rawParams.get(`rooms[${i}][roomId]`))
    const rpId = Number(rawParams.get(`rooms[${i}][ratePlanId]`))
    if (!rId || !rpId) break
    multiRoomPairs.push({ roomId: rId, ratePlanId: rpId })
  }

  const isMulti = multiRoomPairs.length > 0
  const hasSelection = isMulti || (singleRoomId && singleRatePlanId)

  if (!searchParams || !hasSelection) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <p className="font-medium text-[var(--color-text)]">Invalid booking link</p>
          <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
            ← Start a new search
          </Link>
        </div>
      </main>
    )
  }

  if (isLoading || !searchData) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--color-border)]" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-[var(--color-border)]" />
        </div>
      </main>
    )
  }

  const allRooms = searchData.results.flatMap(r => r.rooms)

  // Resolve selected rooms — same roomId can appear multiple times (multi-room cart)
  const pairs = isMulti ? multiRoomPairs : [{ roomId: singleRoomId, ratePlanId: singleRatePlanId }]
  const selectedRooms: SelectedRoom[] = []
  for (const { roomId, ratePlanId } of pairs) {
    const room = allRooms.find(r => r.roomId === roomId)
    const rate = room?.rates.find(r => r.ratePlanId === ratePlanId)
    if (room && rate) selectedRooms.push({ room, rate })
  }

  if (selectedRooms.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-xl border border-error/20 bg-[var(--color-error-light)] p-8 text-center">
          <p className="font-medium text-error">Room no longer available</p>
          <Link href={`/search?${rawParams.toString()}`} className="mt-4 inline-block text-sm text-primary hover:underline">
            ← Back to results
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href={`/search?${rawParams.toString()}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to results
      </Link>

      <h1 className="mb-6 text-xl font-semibold text-[var(--color-text)]">Complete your booking</h1>

      {searchData.results.flatMap(r => r.remarks).map((remark, i) => (
        <div key={i} className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-primary-light)] px-4 py-3 text-sm text-primary">
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          {remark}
        </div>
      ))}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-card">
          <BookingForm
            propertyId={searchParams.hotelId}
            checkIn={searchParams.checkIn}
            checkOut={searchParams.checkOut}
            rooms={selectedRooms}
            searchId={searchId}
            {...(affiliateId ? { affiliateId } : {})}
            locale="en"
          />
        </div>
        <div>
          <BookingSummary
            rooms={selectedRooms}
            checkIn={searchParams.checkIn}
            checkOut={searchParams.checkOut}
            locale="en"
          />
        </div>
      </div>
    </main>
  )
}
