'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSearch } from '@/hooks/use-search'
import { useProperty } from '@/hooks/use-property'
import { useConvertCurrency } from '@/hooks/use-exchange-rates'
import { usePreferences } from '@/context/preferences'
import { useT, useLocale } from '@/context/translations'
import { RoomCard } from '@/components/search/RoomCard'
import { encodeSearchParams, decodeMultiCityParams, type MultiCityLegParam } from '@/lib/search-params'
import { displayDate } from '@/lib/calendar-utils'
import { nightsBetween, formatCurrency } from '@ibe/shared'
import type { RoomOption, RateOption, RoomDetail } from '@ibe/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

type ParsedLeg = MultiCityLegParam

type CollectedItem = {
  id: string
  legIdx: number
  propertyId: number
  checkIn: string
  checkOut: string
  searchId: string
  room: RoomOption
  rate: RateOption
}

// ── TabBar ────────────────────────────────────────────────────────────────────

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { label: string; badge?: number }[]
  active: number
  onChange: (i: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 w-fit">
      {tabs.map((tab, i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className={[
            'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            active === i
              ? 'bg-[var(--color-primary)] text-white shadow-sm'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          ].join(' ')}
        >
          {tab.label}
          {tab.badge ? (
            <span className={[
              'rounded-full px-1.5 py-0.5 text-xs font-semibold',
              active === i ? 'bg-white/30 text-white' : 'bg-[var(--color-primary)] text-white',
            ].join(' ')}>
              {tab.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

// ── PropertyName — fetches and renders a property name inline ─────────────────

function PropertyName({ propertyId }: { propertyId: number }) {
  const { data } = useProperty(propertyId)
  return <>{data?.name ?? `Hotel ${propertyId}`}</>
}

// ── LegHeader ─────────────────────────────────────────────────────────────────

function LegHeader({ leg, adults }: { leg: ParsedLeg; adults: number }) {
  const t = useT('search')
  const locale = useLocale()
  const { data: property } = useProperty(leg.propertyId)
  const nights = nightsBetween(leg.checkIn, leg.checkOut)

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
      <h2 className="text-base font-semibold text-[var(--color-text)]">
        {property?.name ?? leg.city}
      </h2>
      <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
        {displayDate(leg.checkIn, locale)} – {displayDate(leg.checkOut, locale)}
        {' · '}{nights} {t('nightsLabel')}
        {' · '}{adults} {adults !== 1 ? t('adultPlural') : t('adultSingular')}
      </p>
    </div>
  )
}

// ── LegTab ────────────────────────────────────────────────────────────────────

function LegTab({
  leg,
  legIdx,
  adults,
  nationality,
  promoCode,
  onAdd,
}: {
  leg: ParsedLeg
  legIdx: number
  adults: number
  nationality?: string | undefined
  promoCode?: string | undefined
  onAdd: (item: CollectedItem) => void
}) {
  const t = useT('search')
  const locale = useLocale()
  const { currency: displayCurrency } = usePreferences()

  const { data, isLoading, isError } = useSearch({
    hotelId: leg.propertyId,
    checkIn: leg.checkIn,
    checkOut: leg.checkOut,
    rooms: [{ adults }],
    nationality,
    promoCode,
  })

  const { data: propertyData } = useProperty(leg.propertyId)
  const nativeCurrency = data?.currency ?? 'USD'
  const convert = useConvertCurrency(nativeCurrency, displayCurrency)
  const dispCur = displayCurrency || nativeCurrency
  const nights = nightsBetween(leg.checkIn, leg.checkOut)

  const allRooms = (data?.results.flatMap(r => r.rooms) ?? []).sort((a, b) => {
    const minA = Math.min(...a.rates.map(r => r.prices.sell.amount))
    const minB = Math.min(...b.rates.map(r => r.prices.sell.amount))
    return minA - minB
  })

  const roomDetailMap = new Map<number, RoomDetail>(
    (propertyData?.rooms ?? []).map(r => [r.roomId, r])
  )

  function handleRateSelect(room: RoomOption, rate: RateOption) {
    if (!data) return
    onAdd({
      id: `${legIdx}-${room.roomId}-${rate.ratePlanId}-${Date.now()}`,
      legIdx,
      propertyId: leg.propertyId,
      checkIn: leg.checkIn,
      checkOut: leg.checkOut,
      searchId: data.searchId,
      room,
      rate,
    })
  }

  return (
    <div className="space-y-4">
      <LegHeader leg={leg} adults={adults} />

      {isLoading && (
        <>
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-[var(--color-border)]" />
          ))}
        </>
      )}

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {t('searchFailed')}
        </div>
      )}

      {!isLoading && !isError && allRooms.length === 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <p className="text-[var(--color-text-muted)]">{t('noRoomsAvailable')}</p>
        </div>
      )}

      {allRooms.map(room => (
        <RoomCard
          key={room.roomId}
          room={room}
          nights={nights}
          locale={locale}
          roomDetail={roomDetailMap.get(room.roomId)}
          onRateSelect={handleRateSelect}
          displayCurrency={dispCur}
          convert={convert}
          selectLabel={t('multiCitySelect') ?? 'Select'}
          detailsLabel="Details"
        />
      ))}
    </div>
  )
}

// ── CollectedCard ─────────────────────────────────────────────────────────────

function CollectedCard({
  item,
  leg,
  locale,
  onRemove,
  onBook,
}: {
  item: CollectedItem
  leg: ParsedLeg
  locale: string
  onRemove: (id: string) => void
  onBook: (item: CollectedItem) => void
}) {
  const t = useT('search')
  const nights = nightsBetween(item.checkIn, item.checkOut)
  const { amount, currency } = item.rate.prices.sell
  const barAmount = item.rate.prices.bar.amount
  const hasDiscount = barAmount > amount
  const discountPct = hasDiscount ? Math.round((1 - amount / barAmount) * 100) : 0

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--color-primary)] px-2.5 py-0.5 text-xs font-semibold text-white">
            {leg.city}
          </span>
          <span className="truncate text-sm font-semibold text-[var(--color-text)]">
            <PropertyName propertyId={item.propertyId} />
          </span>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          {item.room.roomName} · {item.rate.ratePlanName}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {displayDate(item.checkIn, locale)} – {displayDate(item.checkOut, locale)}
          {' · '}{nights} {t('nightsLabel')}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="text-right">
          {hasDiscount && (
            <p className="text-xs text-[var(--color-text-muted)] line-through">
              {formatCurrency(barAmount, currency)}
            </p>
          )}
          <p className={['text-sm font-bold', hasDiscount ? 'text-green-600' : 'text-[var(--color-text)]'].join(' ')}>
            {formatCurrency(amount, currency)}
          </p>
          {hasDiscount && discountPct > 0 && (
            <span className="text-xs font-semibold text-green-600">-{discountPct}%</span>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={() => onBook(item)}
            className="whitespace-nowrap rounded-full bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white shadow transition-colors hover:opacity-90"
          >
            {t('multiCityBookItem') ?? 'Book →'}
          </button>
          <button
            onClick={() => onRemove(item.id)}
            className="text-xs font-medium text-red-500 transition-colors hover:text-red-700"
          >
            {t('multiCityRemove')} ×
          </button>
        </div>
      </div>
    </div>
  )
}

// ── SummaryTab ────────────────────────────────────────────────────────────────

function SummaryTab({
  collected,
  legs,
  adults,
  nationality,
  onRemove,
  onBookItem,
  onBookAll,
}: {
  collected: CollectedItem[]
  legs: ParsedLeg[]
  adults: number
  nationality?: string | undefined
  onRemove: (id: string) => void
  onBookItem: (item: CollectedItem) => void
  onBookAll: () => void
}) {
  const t = useT('search')
  const locale = useLocale()

  if (collected.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
        <p className="text-[var(--color-text-muted)]">
          {t('multiCitySummaryEmpty') ?? 'Select rooms from each city tab to add them here.'}
        </p>
      </div>
    )
  }

  // Total per currency
  const totals = collected.reduce<Record<string, number>>((acc, item) => {
    const { currency, amount } = item.rate.prices.sell
    acc[currency] = (acc[currency] ?? 0) + amount
    return acc
  }, {})

  return (
    <div className="space-y-3">
      {collected.map(item => {
        const leg = legs[item.legIdx] ?? legs[0]!
        return (
          <CollectedCard
            key={item.id}
            item={item}
            leg={leg}
            locale={locale}
            onRemove={onRemove}
            onBook={onBookItem}
          />
        )
      })}

      {/* Total + Book All */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            {t('multiCityTotal') ?? 'Total'}
          </p>
          {Object.entries(totals).map(([cur, amount]) => (
            <p key={cur} className="text-base font-bold text-[var(--color-text)]">
              {formatCurrency(amount, cur)}
            </p>
          ))}
        </div>
        <button
          onClick={onBookAll}
          className="rounded-full bg-[var(--color-primary)] px-8 py-3 text-sm font-semibold text-white shadow transition-colors hover:opacity-90"
        >
          {t('multiCityBookAll') ?? 'Book All'}
        </button>
      </div>
    </div>
  )
}

// ── MultiCityContent ──────────────────────────────────────────────────────────

export function MultiCityContent() {
  const t = useT('search')
  const rawQs = useSearchParams()
  const router = useRouter()

  const parsed = decodeMultiCityParams(rawQs)
  const [activeTab, setActiveTab] = useState(1) // 0 = summary, 1..N = legs
  const [collected, setCollected] = useState<CollectedItem[]>([])

  if (!parsed || parsed.legs.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <p className="text-[var(--color-text-muted)]">{t('invalidSearch')}</p>
        </div>
      </main>
    )
  }

  const { legs, adults, nationality, promoCode } = parsed

  function addItem(item: CollectedItem) {
    setCollected(prev => [...prev, item])
  }

  function removeItem(id: string) {
    setCollected(prev => prev.filter(i => i.id !== id))
  }

  function bookItem(item: CollectedItem) {
    const qs = encodeSearchParams({
      hotelId: item.propertyId,
      checkIn: item.checkIn,
      checkOut: item.checkOut,
      rooms: [{ adults }],
      nationality,
    })
    qs.set('roomId', String(item.room.roomId))
    qs.set('ratePlanId', String(item.rate.ratePlanId))
    qs.set('searchId', item.searchId)
    qs.set('price', String(item.rate.prices.sell.amount))
    qs.set('priceCurrency', item.rate.prices.sell.currency)
    router.push(`/booking?${qs.toString()}`)
  }

  function bookAll() {
    const key = String(Date.now())
    const enriched = collected.map(item => ({
      ...item,
      city: legs[item.legIdx]?.city ?? '',
    }))
    try {
      sessionStorage.setItem(`mc_booking_${key}`, JSON.stringify({
        items: enriched,
        adults,
        ...(nationality ? { nationality } : {}),
      }))
    } catch {}
    const qs = new URLSearchParams({ key })
    const chain = rawQs.get('chain')
    const hotelId = rawQs.get('hotelId')
    if (chain) qs.set('chain', chain)
    if (hotelId) qs.set('hotelId', hotelId)
    router.push(`/multi-city-booking?${qs.toString()}`)
  }

  const tabs = [
    { label: t('multiCitySummary') ?? 'Summary', ...(collected.length > 0 ? { badge: collected.length } : {}) },
    ...legs.map((leg, i) => ({ label: leg.city || `City ${i + 1}` })),
  ]

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            {t('multiCityPageTitle') ?? 'Multi-city booking'}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {t('multiCityPageSubtitle') ?? 'Browse each city tab to find your ideal room, then review and book everything from the Summary tab.'}
          </p>
        </div>
        <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {activeTab === 0 && (
          <SummaryTab
            collected={collected}
            legs={legs}
            adults={adults}
            nationality={nationality}
            onRemove={removeItem}
            onBookItem={bookItem}
            onBookAll={bookAll}
          />
        )}

        {legs.map((leg, idx) =>
          activeTab === idx + 1 ? (
            <LegTab
              key={leg.propertyId}
              leg={leg}
              legIdx={idx}
              adults={adults}
              nationality={nationality}
              promoCode={promoCode}
              onAdd={(item) => {
                addItem(item)
                setActiveTab(0)
              }}
            />
          ) : null
        )}
      </div>
    </main>
  )
}
