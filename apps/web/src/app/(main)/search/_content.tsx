'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams, useRouter } from 'next/navigation'
import { decodeSearchParams, encodeSearchParams } from '@/lib/search-params'
import { useSearch } from '@/hooks/use-search'
import { useProperty } from '@/hooks/use-property'
import { useHotelConfig } from '@/hooks/use-hotel-config'
import { usePreferences } from '@/context/preferences'
import { useAiMode } from '@/context/ai-mode'
import { useConvertCurrency } from '@/hooks/use-exchange-rates'
import { useOffersConstraints } from '@/hooks/use-offers-constraints'
import { RoomCard } from '@/components/search/RoomCard'
import { RoomCardGrid } from '@/components/search/RoomCardGrid'
import { WeatherStrip } from '@/components/weather/WeatherStrip'
import { EventsStrip } from '@/components/weather/EventsStrip'
import { PriceComparisonBar } from '@/components/search/PriceComparisonBar'
import { PropertyHeader } from '@/components/layout/PropertyHeader'
import { OnsiteConversionOverlay } from '@/components/onsite/OnsiteConversionOverlay'
import { ChatWidget } from '@/components/chat/ChatWidget'
import type { CartItem } from '@/components/search/RoomCartPanel'
import type { RoomOption, RateOption, RoomDetail } from '@ibe/shared'
import { nightsBetween, formatCurrency } from '@ibe/shared'

const SearchSidebar = dynamic(
  () => import('@/components/search/SearchSidebar').then(m => ({ default: m.SearchSidebar })),
  { ssr: false },
)

const ConversationalSearchPanel = dynamic(
  () => import('@/components/conversational-search/conversational-search-panel').then(m => ({ default: m.ConversationalSearchPanel })),
  { ssr: false },
)

const LOCALE = 'en'

export function SearchContent({ aiEnabled = false, searchAiLayoutDefault = false, orgId }: { aiEnabled?: boolean; searchAiLayoutDefault?: boolean; orgId?: number | null }) {
  const router = useRouter()
  const rawParams = useSearchParams()
  const searchParams = decodeSearchParams(rawParams)
  const { currency: displayCurrency } = usePreferences()

  const { aiLayout, setAiLayout } = useAiMode()

  useEffect(() => {
    setAiLayout(searchAiLayoutDefault)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isLoading, isError, error } = useSearch(searchParams)

  const nativeCurrency = data?.currency ?? 'USD'
  const convert = useConvertCurrency(nativeCurrency, displayCurrency)
  const { data: propertyData } = useProperty(searchParams?.hotelId ?? null)
  const { data: hotelConfig } = useHotelConfig(searchParams?.hotelId ?? null)
  const { bookingMode, maxRooms, multiRoomLimitBy } = useOffersConstraints(searchParams?.hotelId ?? null)
  const effectiveMaxRooms = bookingMode === 'multi' && multiRoomLimitBy === 'search' && searchParams !== null
    ? Math.min(searchParams.rooms.length, maxRooms)
    : maxRooms

  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [cartExpanded, setCartExpanded] = useState(false)

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
      const timesInCart = cartItems.filter(i => i.room.roomId === room.roomId).length
      if (timesInCart >= room.availableCount) return
      const key = `${room.roomId}-${rate.ratePlanId}-${Date.now()}`
      setCartItems(prev => [...prev, { key, room, rate }])
      return
    }

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
  const sidebarOnRight = hotelConfig?.searchSidebarPosition === 'right'
  const roomSearchLayout = hotelConfig?.roomSearchLayout ?? 'rows'
  const cartTotal = cartItems.reduce((sum, item) => sum + convert(item.rate.prices.sell.amount), 0)
  const showCartBar = isMultiMode && cartItems.length > 0

  const infantMaxAge = hotelConfig?.infantMaxAge ?? 2
  const childMaxAge = hotelConfig?.childMaxAge ?? 16
  const searchBarInitialRooms = searchParams?.rooms.map(r => ({
    adults: r.adults,
    children: (r.childAges ?? []).filter(age => age > infantMaxAge).length,
    infants: (r.childAges ?? []).filter(age => age <= infantMaxAge).length,
  }))

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

      {searchParams.hotelId > 0 && (
        <WeatherStrip
          propertyId={searchParams.hotelId}
          startDate={searchParams.checkIn}
          endDate={searchParams.checkOut}
          {...(orgId != null ? { orgId } : {})}
        />
      )}

      {searchParams.hotelId > 0 && (
        <EventsStrip
          propertyId={searchParams.hotelId}
          startDate={searchParams.checkIn}
          endDate={searchParams.checkOut}
          {...(orgId != null ? { orgId } : {})}
        />
      )}

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

      {data && displayCurrency && displayCurrency !== nativeCurrency && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Prices shown in <strong className="mx-0.5">{displayCurrency}</strong> are estimates based on today&apos;s exchange rate. You will be charged in <strong className="mx-0.5">{nativeCurrency}</strong>.
        </div>
      )}

      {isLoading && (
        roomSearchLayout === 'cards' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-[var(--color-border)]" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-[var(--color-border)]" />
            ))}
          </div>
        )
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

      {roomSearchLayout === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allRooms.map(room => (
            <RoomCardGrid
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
      ) : (
        allRooms.map(room => (
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
        ))
      )}
    </div>
  )

  return (
    <>
      <OnsiteConversionOverlay propertyId={searchParams.hotelId} page="room" />

      {aiLayout ? (
        <main className="mx-auto max-w-7xl px-4 py-6">
          <ConversationalSearchPanel
            propertyId={searchParams.hotelId}
            onClose={() => setAiLayout(false)}
            className="min-h-[calc(100vh-10rem)]"
          />
        </main>
      ) : (
        <>
          <main className={`mx-auto max-w-7xl px-4 py-4 ${showCartBar ? 'pb-24' : ''}`}>
            <div className={`flex gap-6 items-stretch ${sidebarOnRight ? 'flex-row-reverse' : ''}`}>

              {/* Collapsible sidebar — desktop only */}
              <aside className={`hidden shrink-0 lg:block transition-all duration-200 ${sidebarOpen ? 'w-64' : 'w-14'}`}>
                <SearchSidebar
                  propertyId={searchParams.hotelId}
                  initialCheckIn={searchParams.checkIn}
                  initialCheckOut={searchParams.checkOut}
                  initialNationality={searchParams.nationality}
                  infantMaxAge={infantMaxAge}
                  childMaxAge={childMaxAge}
                  isCollapsed={!sidebarOpen}
                  onToggle={() => setSidebarOpen(v => !v)}
                  aiEnabled={aiEnabled}
                  onAiToggle={() => setAiLayout(true)}
                />
              </aside>

              {roomList}
            </div>
          </main>

          <ChatWidget propertyId={searchParams.hotelId} />
        </>
      )}

      {isMultiMode && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
            showCartBar ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          {/* Expanded room list panel */}
          {cartExpanded && cartItems.length > 0 && (
            <div className="mx-auto max-w-7xl px-4">
              <div className="rounded-t-xl border border-b-0 border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg divide-y divide-[var(--color-border)]">
                {cartItems.map((item, idx) => (
                  <div key={item.key} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-xs font-bold text-primary">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">{item.room.roomName}</p>
                      <p className="truncate text-xs text-muted">{item.rate.ratePlanName}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-primary">
                      {formatCurrency(convert(item.rate.prices.sell.amount), dispCur, LOCALE)}
                    </span>
                    <button
                      onClick={() => setCartItems(prev => prev.filter(i => i.key !== item.key))}
                      aria-label="Remove room"
                      className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-[var(--color-error-light)] hover:text-error"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main bar */}
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
              {/* Left: room count + names */}
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                  {cartItems.length}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    {cartItems.length} of {effectiveMaxRooms} room{effectiveMaxRooms !== 1 ? 's' : ''} selected
                  </p>
                  <p className="truncate text-xs text-muted">
                    {cartItems.map(i => i.room.roomName).join(' · ')}
                  </p>
                </div>
              </div>

              {/* Right: total + expand + book */}
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-bold text-[var(--color-text)]">
                    {formatCurrency(cartTotal, dispCur, LOCALE)}
                  </p>
                  <p className="text-xs text-muted">{nights} night{nights !== 1 ? 's' : ''}</p>
                </div>

                <button
                  onClick={() => setCartExpanded(v => !v)}
                  aria-label={cartExpanded ? 'Collapse cart' : 'Expand cart'}
                  className="rounded-lg border border-[var(--color-border)] p-2 text-muted transition-colors hover:border-primary hover:text-primary"
                >
                  <svg
                    className={`h-4 w-4 transition-transform duration-200 ${cartExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <button
                  onClick={handleCartBook}
                  className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:bg-[var(--color-primary-hover)]"
                >
                  Book {cartItems.length} room{cartItems.length !== 1 ? 's' : ''} →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
