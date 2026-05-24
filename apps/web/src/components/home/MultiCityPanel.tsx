'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { addDays, todayIso } from '@ibe/shared'
import { useT } from '@/context/translations'
import { apiClient } from '@/lib/api-client'
import { encodeSearchParams } from '@/lib/search-params'
import type { PropertyOption } from '@/components/search/SearchBar'
import type { GuestRoom } from '@/components/search/GuestsDropdown'
import type { SearchResponse } from '@ibe/shared'

// ── Internal types ────────────────────────────────────────────────────────────

type MultiCitySelectedOffer = {
  roomId: number
  roomName: string
  rateId: number
  rateName: string
  sellAmount: number
  currency: string
}

type MultiCityLeg = {
  id: string
  city: string
  propertyId: number | null
  checkIn: string
  checkOut: string
  rooms: GuestRoom[]
  searched: boolean
  selectedOffer: MultiCitySelectedOffer | null
}

function makeLeg(): MultiCityLeg {
  return {
    id: Math.random().toString(36).slice(2, 9),
    city: '',
    propertyId: null,
    checkIn: addDays(todayIso(), 7),
    checkOut: addDays(todayIso(), 10),
    rooms: [{ adults: 2, children: 0, infants: 0 }],
    searched: false,
    selectedOffer: null,
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MultiCityPanelProps {
  properties: PropertyOption[]
  maxLegs: number
  infantMaxAge: number
  childMaxAge: number
}

// ── MultiCitySummary ──────────────────────────────────────────────────────────

function MultiCitySummary({ legs }: { legs: MultiCityLeg[] }) {
  const t = useT('search')
  const router = useRouter()

  const hasAnyOffer = legs.some((l) => l.selectedOffer !== null)

  if (!hasAnyOffer) {
    return (
      <div className="p-6 text-center text-[var(--color-text-muted)]">
        {t('multiCityEmpty')}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {legs.map((leg, idx) => {
        if (!leg.selectedOffer) {
          return (
            <div
              key={leg.id}
              className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] opacity-50"
            >
              <span className="text-[var(--color-text-muted)]">
                {t('multiCityLeg').replace('{n}', String(idx + 1))} — {t('multiCityNoOfferSelected')}
              </span>
            </div>
          )
        }

        const offer = leg.selectedOffer

        const qs = encodeSearchParams({
          hotelId: leg.propertyId!,
          checkIn: leg.checkIn,
          checkOut: leg.checkOut,
          rooms: [{ adults: leg.rooms[0]?.adults ?? 2 }],
        })

        return (
          <div
            key={leg.id}
            className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="font-semibold text-[var(--color-text)]">
                  {t('multiCityLeg').replace('{n}', String(idx + 1))}: {leg.city}
                </div>
                <div className="text-sm text-[var(--color-text-muted)]">
                  {leg.checkIn} → {leg.checkOut}
                </div>
                <div className="text-sm text-[var(--color-text)]">{offer.roomName}</div>
                <div className="text-sm text-[var(--color-text-muted)]">{offer.rateName}</div>
                <div className="font-semibold text-[var(--color-primary)]">
                  {offer.currency} {offer.sellAmount.toFixed(2)}
                </div>
              </div>
              <button
                onClick={() => router.push(`/search?${qs.toString()}`)}
                className="shrink-0 px-4 py-2 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {t('multiCityBook')}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── MultiCityLegForm ──────────────────────────────────────────────────────────

interface MultiCityLegFormProps {
  leg: MultiCityLeg
  legIndex: number
  cities: string[]
  properties: PropertyOption[]
  canRemove: boolean
  infantMaxAge: number
  childMaxAge: number
  onUpdate: (patch: Partial<Omit<MultiCityLeg, 'id' | 'searched' | 'selectedOffer'>>) => void
  onSearch: () => void
  onRemove: () => void
  onSelectOffer: (offer: MultiCitySelectedOffer) => void
}

function MultiCityLegForm({
  leg,
  legIndex,
  cities,
  properties,
  canRemove,
  onUpdate,
  onSearch,
  onRemove,
  onSelectOffer,
}: MultiCityLegFormProps) {
  const t = useT('search')

  const filteredProperties = leg.city
    ? properties.filter((p) => p.city === leg.city)
    : properties

  const { data: searchResult, isFetching } = useQuery<SearchResponse>({
    queryKey: ['multicity-leg-search', leg.propertyId, leg.checkIn, leg.checkOut, leg.rooms],
    queryFn: () => {
      const qs = encodeSearchParams({
        hotelId: leg.propertyId!,
        checkIn: leg.checkIn,
        checkOut: leg.checkOut,
        rooms: [{ adults: leg.rooms[0]?.adults ?? 2 }],
      })
      return apiClient.search(qs)
    },
    enabled: leg.searched && !!leg.propertyId && !!leg.checkIn && !!leg.checkOut,
    staleTime: 5 * 60 * 1000,
  })

  const adults = leg.rooms[0]?.adults ?? 2

  function setAdults(val: number) {
    if (val < 1) return
    const updated: GuestRoom[] = [{ adults: val, children: 0, infants: 0 }]
    onUpdate({ rooms: updated })
  }

  function handleSearch() {
    if (!leg.propertyId) return
    onSearch()
  }

  return (
    <div className="p-4 space-y-4 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
      {/* City select */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-[var(--color-text)]">{t('multiCityCity')}</label>
        <select
          value={leg.city}
          onChange={(e) => onUpdate({ city: e.target.value, propertyId: null })}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">{t('multiCitySelectCity')}</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </div>

      {/* Hotel select — shown when city is selected */}
      {leg.city && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-[var(--color-text)]">{t('multiCityHotel')}</label>
          <select
            value={leg.propertyId ?? ''}
            onChange={(e) =>
              onUpdate({ propertyId: e.target.value ? Number(e.target.value) : null })
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          >
            <option value="">{t('multiCitySelectHotel')}</option>
            {filteredProperties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Date inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-[var(--color-text)]">{t('checkIn')}</label>
          <input
            type="date"
            value={leg.checkIn}
            onChange={(e) => onUpdate({ checkIn: e.target.value })}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-[var(--color-text)]">{t('checkOut')}</label>
          <input
            type="date"
            value={leg.checkOut}
            onChange={(e) => onUpdate({ checkOut: e.target.value })}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
      </div>

      {/* Adults +/- */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[var(--color-text)]">{t('adults')}:</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdults(adults - 1)}
            className="w-8 h-8 rounded-full border border-[var(--color-border)] text-[var(--color-text)] flex items-center justify-center text-lg leading-none hover:bg-[var(--color-border)] transition-colors"
            aria-label="Decrease adults"
          >
            −
          </button>
          <span className="w-6 text-center text-sm font-semibold text-[var(--color-text)]">{adults}</span>
          <button
            onClick={() => setAdults(adults + 1)}
            className="w-8 h-8 rounded-full border border-[var(--color-border)] text-[var(--color-text)] flex items-center justify-center text-lg leading-none hover:bg-[var(--color-border)] transition-colors"
            aria-label="Increase adults"
          >
            +
          </button>
        </div>
      </div>

      {/* Search button */}
      <button
        disabled={!leg.propertyId}
        onClick={handleSearch}
        className="w-full py-2 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        {isFetching ? t('searching') : t('multiCitySearch')}
      </button>

      {/* Search results */}
      {leg.searched && leg.propertyId && (
        <div className="space-y-3">
          {isFetching && (
            <div className="text-center text-sm text-[var(--color-text-muted)] py-4">
              {t('searching')}…
            </div>
          )}
          {!isFetching && searchResult && searchResult.results.length === 0 && (
            <div className="text-center text-sm text-[var(--color-text-muted)] py-4">
              {t('noRoomsAvailable')}
            </div>
          )}
          {!isFetching &&
            searchResult?.results.flatMap((result) =>
              result.rooms.map((room) => {
                const rate = room.rates[0]
                if (!rate) return null
                return (
                  <div
                    key={`${room.roomId}-${rate.ratePlanId}`}
                    className="p-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] space-y-1"
                  >
                    <div className="font-medium text-sm text-[var(--color-text)]">{room.roomName}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">{rate.ratePlanName}</div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-[var(--color-primary)]">
                        {rate.prices.sell.currency} {rate.prices.sell.amount.toFixed(2)}
                      </span>
                      <button
                        onClick={() =>
                          onSelectOffer({
                            roomId: room.roomId,
                            roomName: room.roomName,
                            rateId: rate.ratePlanId,
                            rateName: rate.ratePlanName,
                            sellAmount: rate.prices.sell.amount,
                            currency: rate.prices.sell.currency,
                          })
                        }
                        className="px-3 py-1 rounded-md bg-[var(--color-primary)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        {t('multiCitySelect')}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
        </div>
      )}

      {/* Selected offer confirmation */}
      {leg.selectedOffer && (
        <div className="p-3 rounded-md border border-green-500 bg-green-50 space-y-1">
          <div className="text-sm font-semibold text-green-800">{t('multiCityOfferSelected')}</div>
          <div className="text-sm text-green-700">{leg.selectedOffer.roomName}</div>
          <div className="text-xs text-green-600">{leg.selectedOffer.rateName}</div>
          <div className="text-sm font-bold text-green-800">
            {leg.selectedOffer.currency} {leg.selectedOffer.sellAmount.toFixed(2)}
          </div>
        </div>
      )}

      {/* Remove button */}
      {canRemove && (
        <button
          onClick={onRemove}
          className="text-sm text-red-500 hover:text-red-700 transition-colors"
        >
          {t('multiCityRemove')}
        </button>
      )}
    </div>
  )
}

// ── MultiCityPanel ────────────────────────────────────────────────────────────

export function MultiCityPanel({
  properties,
  maxLegs,
  infantMaxAge,
  childMaxAge,
}: MultiCityPanelProps) {
  const t = useT('search')
  const [legs, setLegs] = useState<MultiCityLeg[]>([makeLeg()])
  const [activeTab, setActiveTab] = useState<number | 'summary'>(0)

  // Derive unique cities from properties
  const cities = Array.from(
    new Set(properties.map((p) => p.city).filter((c): c is string => Boolean(c)))
  )

  function addLeg() {
    if (legs.length >= maxLegs) return
    const newLeg = makeLeg()
    setLegs((prev) => [...prev, newLeg])
    setActiveTab(legs.length) // index of the new leg
  }

  function removeLeg(idx: number) {
    setLegs((prev) => prev.filter((_, i) => i !== idx))
    setActiveTab(Math.max(0, idx - 1))
  }

  function updateLeg(idx: number, patch: Partial<Omit<MultiCityLeg, 'id'>>) {
    setLegs((prev) =>
      prev.map((leg, i) =>
        i === idx
          ? { ...leg, ...patch, searched: false, selectedOffer: null }
          : leg
      )
    )
  }

  function triggerSearch(idx: number) {
    setLegs((prev) =>
      prev.map((leg, i) => (i === idx ? { ...leg, searched: true } : leg))
    )
  }

  function selectOffer(idx: number, offer: MultiCitySelectedOffer) {
    setLegs((prev) =>
      prev.map((leg, i) => (i === idx ? { ...leg, selectedOffer: offer } : leg))
    )
    // Auto-advance: next leg or summary
    const nextIdx = idx + 1
    if (nextIdx < legs.length) {
      setActiveTab(nextIdx)
    } else {
      setActiveTab('summary')
    }
  }

  const tabClass = (isActive: boolean) =>
    [
      'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
      isActive
        ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
        : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
    ].join(' ')

  return (
    <div className="w-full bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--color-border)] overflow-x-auto">
        {legs.map((leg, idx) => {
          const raw = t('multiCityLeg')
          // If translation contains {n} placeholder, replace it; otherwise use "City N"
          const tabLabel = raw.includes('{n}')
            ? raw.replace('{n}', String(idx + 1))
            : `City ${idx + 1}`
          return (
            <button
              key={leg.id}
              onClick={() => setActiveTab(idx)}
              className={tabClass(activeTab === idx)}
            >
              {tabLabel}
            </button>
          )
        })}

        {/* Summary tab */}
        <button
          onClick={() => setActiveTab('summary')}
          className={tabClass(activeTab === 'summary')}
        >
          {t('multiCitySummary')}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add city button */}
        {legs.length < maxLegs && (
          <button
            onClick={addLeg}
            className="px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:opacity-80 transition-opacity whitespace-nowrap"
          >
            + {t('multiCityAddCity')}
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === 'summary' ? (
          <MultiCitySummary legs={legs} />
        ) : (
          typeof activeTab === 'number' &&
          legs[activeTab] && (
            <MultiCityLegForm
              leg={legs[activeTab]}
              legIndex={activeTab}
              cities={cities}
              properties={properties}
              canRemove={legs.length > 1}
              infantMaxAge={infantMaxAge}
              childMaxAge={childMaxAge}
              onUpdate={(patch) => updateLeg(activeTab, patch)}
              onSearch={() => triggerSearch(activeTab)}
              onRemove={() => removeLeg(activeTab)}
              onSelectOffer={(offer) => selectOffer(activeTab, offer)}
            />
          )
        )}
      </div>
    </div>
  )
}
