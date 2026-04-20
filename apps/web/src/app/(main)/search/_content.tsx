'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams, useRouter } from 'next/navigation'
import { decodeSearchParams, encodeSearchParams } from '@/lib/search-params'
import { useSearch } from '@/hooks/use-search'
import { useProperty } from '@/hooks/use-property'
import { useHotelConfig } from '@/hooks/use-hotel-config'
import { usePreferences } from '@/context/preferences'
import { useConvertCurrency } from '@/hooks/use-exchange-rates'
import { useOffersConstraints } from '@/hooks/use-offers-constraints'
import { RoomCard } from '@/components/search/RoomCard'
import { PriceComparisonBar } from '@/components/search/PriceComparisonBar'
import { PropertyHeader } from '@/components/layout/PropertyHeader'
import { RoomCartPanel, type CartItem } from '@/components/search/RoomCartPanel'
import { OnsiteConversionOverlay } from '@/components/onsite/OnsiteConversionOverlay'
import type { RoomOption, RateOption, RoomDetail } from '@ibe/shared'
import { nightsBetween } from '@ibe/shared'

const SearchSidebar = dynamic(
  () => import('@/components/search/SearchSidebar').then(m => ({ default: m.SearchSidebar })),
  { ssr: false },
)

const LOCALE = 'en'

export function SearchContent() {
  const router = useRouter()
  const rawParams = useSearchParams()
  const searchParams = decodeSearchParams(rawParams)
  const { currency: displayCurrency } = usePreferences()

  const { data, isLoading, isError, error } = useSearch(searchParams)

  // Native currency is whatever HG returned in prices
  const nativeCurrency = data?.currency ?? 'USD'
  const convert = useConvertCurrency(nativeCurrency, displayCurrency)
  const { data: propertyData } = useProperty(searchParams?.hotelId ?? null)
  const { data: hotelConfig } = useHotelConfig(searchParams?.hotelId ?? null)
  const { bookingMode, maxRooms, multiRoomLimitBy } = useOffersConstraints(searchParams?.hotelId ?? null)
  const effectiveMaxRooms = bookingMode === 'multi' && multiRoomLimitBy === 'search' && searchParams !== null
    ? Math.min(searchParams.rooms.length, maxRooms)
    : maxRooms

  const [cartItems, setCartItems] = useState<CartItem[]>([])

  if (!searchParams) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <p className="text-muted">Invalid search. Please start a new search.</p>
        </div>
      </main>
    )
  }

  const nights = nightsBetween(searchParams.checkIn, searchParams.checkOut)
  const allRooms = (data?.results.flatMap(r => r.rooms) ?? []).sort((a, b) => {
    const minA = Math.min(...a.rates.map(r => r.prices.sell.amount))
    const minB = Math.min(...b.rates.map(r => r.prices.sell.amount))
    return minA - minB
  })

  const excludedRoomImageIds = new Set(hotelConfig?.excludedRoomImageIds ?? [])
  const roomDetailMap = new Map<number, RoomDetail>(
    (propertyData?.rooms ?? []).map(r => [
      r.roomId,
      excludedRoomImageIds.size > 0
        ? { ...r, images: r.images.filter(img => !excludedRoomImageIds.has(img.id)) }
        : r,
    ])
  )

  function handleRateSelect(room: RoomOption, rate: RateOption) {
    if (!data || !searchParams) return

    if (bookingMode === 'multi') {
      if (cartItems.length >= effectiveMaxRooms) return
      // Count how many times this room is already in the cart to enforce availableCount
      const timesInCart = cartItems.filter(i => i.room.roomId === room.roomId).length
      if (timesInCart >= room.availableCount) return
      const key = `${room.roomId}-${rate.ratePlanId}-${Date.now()}`
      setCartItems(prev => [...prev, { key, room, rate }])
      return
    }

    // single mode — original flow
    const qs = encodeSearchParams(searchParams)
    qs.set('roomId', String(room.roomId))
    qs.set('ratePlanId', String(rate.ratePlanId))
    qs.set('searchId', data.searchId)
    router.push(`/booking?${qs.toString()}`)
  }

  function handleCartBook() {
    if (!data || !searchParams || cartItems.length === 0) return
    const qs = encodeSearchParams(searchParams)
    qs.set('searchId', data.searchId)
    cartItems.forEach((item, i) => {
      qs.set(`rooms[${i}][roomId]`, String(item.room.roomId))
      qs.set(`rooms[${i}][ratePlanId]`, String(item.rate.ratePlanId))
    })
    router.push(`/booking?${qs.toString()}`)
  }

  function canAddToCart(room: RoomOption): boolean {
    if (cartItems.length >= effectiveMaxRooms) return false
    const timesInCart = cartItems.filter(i => i.room.roomId === room.roomId).length
    return timesInCart < room.availableCount
  }

  const isMultiMode = bookingMode === 'multi'
  const dispCur = displayCurrency || nativeCurrency

  const roomList = (
    <div className="min-w-0 flex-1 space-y-4">
      {propertyData && hotelConfig && (!!hotelConfig.searchResultsImageUrl || hotelConfig.searchResultsImageMode === 'carousel') && (() => {
        const imageMode = hotelConfig.searchResultsImageMode ?? 'fixed'
        const excludedIds = new Set(hotelConfig.searchResultsExcludedImageIds ?? [])
        const allPropertyImages = (propertyData.images ?? [])
          .filter(img => !excludedIds.has(img.id))
          .sort((a, b) => a.priority - b.priority)
          .map(img => img.url)
        const carouselImages = hotelConfig.searchResultsImageUrl
          ? [hotelConfig.searchResultsImageUrl, ...allPropertyImages.filter(u => u !== hotelConfig.searchResultsImageUrl)]
          : allPropertyImages
        return (
          <PropertyHeader
            property={propertyData}
            heroImageUrl={hotelConfig.searchResultsImageUrl}
            tagline={hotelConfig?.tagline || null}
            displayName={hotelConfig?.displayName || null}
            imageMode={imageMode}
            carouselInterval={hotelConfig.searchResultsCarouselInterval ?? 5}
            carouselImages={carouselImages}
          />
        )
      })()}


      {searchParams.hotelId > 0 && (
        <PriceComparisonBar
          checkin={searchParams.checkIn}
          checkout={searchParams.checkOut}
          adults={searchParams.rooms.reduce((s, r) => s + r.adults, 0)}
          children={searchParams.rooms.reduce((s, r) => s + (r.childAges?.length ?? 0), 0)}
          rooms={searchParams.rooms.length}
          propertyId={searchParams.hotelId}
          directPrice={allRooms.length > 0
            ? Math.min(...allRooms.flatMap(r => r.rates.map(rate => convert(rate.prices.sell.amount))))
            : null}
          currency={dispCur}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {isLoading ? 'Searching…' : data
              ? `${allRooms.length} room type${allRooms.length !== 1 ? 's' : ''} available`
              : 'Available rooms'}
          </h2>
          <p className="text-sm text-muted">
            {nights} night{nights !== 1 ? 's' : ''} · {searchParams.rooms.reduce((s, r) => s + r.adults, 0)} adult{searchParams.rooms.reduce((s, r) => s + r.adults, 0) !== 1 ? 's' : ''}
          </p>
        </div>
        {isMultiMode && cartItems.length > 0 && (
          <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white">
            {cartItems.length} room{cartItems.length !== 1 ? 's' : ''} selected
          </span>
        )}
      </div>

      {data && displayCurrency && displayCurrency !== nativeCurrency && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Prices shown in <strong className="mx-0.5">{displayCurrency}</strong> are estimates based on today&apos;s exchange rate. You will be charged in <strong className="mx-0.5">{nativeCurrency}</strong>.
        </div>
      )}


      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-[var(--color-border)]" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-error/20 bg-[var(--color-error-light)] p-6">
          <p className="font-semibold text-error">Something went wrong</p>
          <p className="mt-1 text-sm text-error/80">
            {error instanceof Error ? error.message : 'Please try again'}
          </p>
        </div>
      )}

      {data && allRooms.length === 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
          <p className="font-medium text-[var(--color-text)]">No rooms available</p>
          <p className="mt-1 text-sm text-muted">Try different dates or fewer guests.</p>
        </div>
      )}

      {allRooms.map(room => (
        <RoomCard
          key={room.roomId}
          room={room}
          nights={nights}
          locale={LOCALE}
          roomDetail={roomDetailMap.get(room.roomId)}
          remarks={data?.results.flatMap(r => r.remarks) ?? []}
          defaultExpanded={hotelConfig?.roomRatesDefaultExpanded ?? false}
          onRateSelect={handleRateSelect}
          displayCurrency={dispCur}
          convert={convert}
          {...(hotelConfig?.roomPrimaryImageIds?.[room.roomId] != null
            ? { primaryImageId: hotelConfig.roomPrimaryImageIds[room.roomId] }
            : {})}
          {...(isMultiMode
            ? { selectLabel: 'Add to booking', selectDisabled: (_rate: RateOption) => !canAddToCart(room) }
            : {})}
        />
      ))}
    </div>
  )

  return (
    <>
      <OnsiteConversionOverlay propertyId={searchParams.hotelId} page="room" />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex gap-6 items-stretch">
          <aside className="hidden w-64 shrink-0 lg:block">
            <SearchSidebar
              propertyId={searchParams.hotelId}
              initialCheckIn={searchParams.checkIn}
              initialCheckOut={searchParams.checkOut}
              initialNationality={searchParams.nationality}
              infantMaxAge={hotelConfig?.infantMaxAge ?? 2}
              childMaxAge={hotelConfig?.childMaxAge ?? 16}
            />
          </aside>

          {roomList}

          {isMultiMode && (
            <aside className="hidden w-64 shrink-0 lg:block sticky top-6 self-start" style={{ maxHeight: 'calc(100vh - 3rem)' }}>
              <RoomCartPanel
                items={cartItems}
                maxRooms={effectiveMaxRooms}
                nights={nights}
                locale={LOCALE}
                displayCurrency={dispCur}
                convert={convert}
                onRemove={key => setCartItems(prev => prev.filter(i => i.key !== key))}
                onBook={handleCartBook}
              />
            </aside>
          )}
        </div>
      </main>
    </>
  )
}

