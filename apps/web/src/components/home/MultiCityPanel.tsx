'use client'

import { useState, useRef, useEffect } from 'react'
import { addDays, todayIso, nightsBetween } from '@ibe/shared'
import { useT, useLocale } from '@/context/translations'
import { CalendarDropdown } from '@/components/search/CalendarDropdown'
import { GuestsDropdown, type GuestRoom } from '@/components/search/GuestsDropdown'
import { NationalityDropdown } from '@/components/search/NationalityDropdown'
import { encodeMultiCityParams } from '@/lib/search-params'
import { useSearchParams } from 'next/navigation'
import { displayDate } from '@/lib/calendar-utils'
import { countryFlag, countryName } from '@/lib/countries'
import { useCountryDetect } from '@/hooks/use-country-detect'
import type { PropertyOption } from '@/components/search/SearchBar'

// ── Types ─────────────────────────────────────────────────────────────────────

type MultiCityLeg = {
  id: string
  city: string
  propertyIds: number[]
  checkIn: string
  checkOut: string
}

function makeLeg(checkIn?: string): MultiCityLeg {
  const ci = checkIn ?? addDays(todayIso(), 7)
  return {
    id: Math.random().toString(36).slice(2, 9),
    city: '',
    propertyIds: [],
    checkIn: ci,
    checkOut: addDays(ci, 3),
  }
}

export interface MultiCityPanelProps {
  properties: PropertyOption[]
  maxLegs: number
  infantMaxAge: number
  childMaxAge: number
}

// ── Segment (identical to SearchBar) ─────────────────────────────────────────

function Segment({
  label,
  value,
  active,
  invalid,
  onClick,
  panelId,
  flex = 1,
}: {
  label: string
  value: string
  active: boolean
  invalid?: boolean
  onClick: () => void
  panelId?: string
  flex?: number
}) {
  return (
    <button
      onClick={onClick}
      data-segment={panelId}
      style={{ flexGrow: flex, flexShrink: 1, flexBasis: '0%' }}
      className={[
        'flex min-w-0 flex-col items-start justify-center px-4 py-2 transition-colors',
        active ? 'bg-[var(--color-primary-light)]' : invalid ? 'bg-red-50' : 'hover:bg-gray-50',
      ].join(' ')}
    >
      <span className={[
        'mb-0.5 whitespace-nowrap text-xs font-medium leading-none',
        invalid ? 'text-red-500' : 'text-[var(--color-text-muted)]',
      ].join(' ')}>
        {label}
      </span>
      <span className={[
        'block w-full truncate text-sm font-semibold',
        invalid ? 'text-red-500' : 'text-[var(--color-text)]',
      ].join(' ')} title={value}>
        {value}
      </span>
    </button>
  )
}

function Divider() {
  return <div className="my-3 w-px shrink-0 bg-[var(--color-border)]" />
}

// ── IndeterminateCheckbox — supports indeterminate state ──────────────────────

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  disabled,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate ?? false
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      onClick={e => e.stopPropagation()}
      className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    />
  )
}

// ── SharedBar — Guests + Nationality ─────────────────────────────────────────

function SharedBar({
  rooms,
  nationality,
  infantMaxAge,
  childMaxAge,
  onRoomsChange,
  onNationalityChange,
}: {
  rooms: GuestRoom[]
  nationality: string
  infantMaxAge: number
  childMaxAge: number
  onRoomsChange: (r: GuestRoom[]) => void
  onNationalityChange: (code: string) => void
}) {
  const t = useT('search')
  const [panel, setPanel] = useState<'guests' | 'nationality' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const totalAdults = rooms.reduce((s, r) => s + r.adults, 0)
  const totalChildren = rooms.reduce((s, r) => s + r.children, 0)
  const totalInfants = rooms.reduce((s, r) => s + r.infants, 0)

  const guestParts = [
    `${totalAdults} ${totalAdults !== 1 ? t('adultPlural') : t('adultSingular')}`,
    totalChildren > 0 ? `${totalChildren} ${totalChildren !== 1 ? t('childPlural') : t('childSingular')}` : null,
    totalInfants > 0 ? `${totalInfants} ${totalInfants !== 1 ? t('infantPlural') : t('infantSingular')}` : null,
    `${rooms.length} ${rooms.length !== 1 ? t('roomPlural') : t('roomSingular')}`,
  ].filter(Boolean).join(' · ')

  const nationalityLabel = nationality
    ? `${countryFlag(nationality)} ${countryName(nationality)}`
    : t('selectNationality') ?? 'Select country'

  useEffect(() => {
    if (!panel) return
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setPanel(null)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [panel])

  function getSegmentLeft(panelId: string): number {
    const btn = containerRef.current?.querySelector(`[data-segment="${panelId}"]`)
    if (!btn || !containerRef.current) return 0
    return btn.getBoundingClientRect().left - containerRef.current.getBoundingClientRect().left
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="hidden sm:flex items-stretch overflow-hidden rounded-2xl bg-white shadow-2xl">
        <Segment
          label={t('guests')}
          value={guestParts}
          active={panel === 'guests'}
          onClick={() => setPanel(p => p === 'guests' ? null : 'guests')}
          panelId="shared-guests"
          flex={4.3}
        />
        <Divider />
        <Segment
          label={t('nationality')}
          value={nationalityLabel}
          active={panel === 'nationality'}
          onClick={() => setPanel(p => p === 'nationality' ? null : 'nationality')}
          panelId="shared-nationality"
          flex={1.8}
        />
        {/* Invisible spacer — mirrors Nights + button column so Nationality aligns with Check-out */}
        <div className="invisible flex items-stretch" aria-hidden>
          <Divider />
          <div className="flex shrink-0 flex-col items-center justify-center px-2 py-2">
            <span className="mb-0.5 text-xs font-medium leading-none">0</span>
            <span className="text-sm font-semibold">0</span>
          </div>
          <Divider />
          <div className="flex shrink-0 items-center gap-1.5 py-2 pl-1 pr-1.5">
            <span className="whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold">− Remove</span>
            <span className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold">+ Add city</span>
          </div>
        </div>
      </div>

      {panel === 'guests' && (
        <div className="absolute top-full z-50 mt-2" style={{ left: getSegmentLeft('shared-guests') }}>
          <GuestsDropdown
            rooms={rooms}
            onChange={onRoomsChange}
            infantMaxAge={infantMaxAge}
            childMaxAge={childMaxAge}
          />
        </div>
      )}
      {panel === 'nationality' && (
        <div className="absolute top-full z-50 mt-2" style={{ left: getSegmentLeft('shared-nationality') }}>
          <NationalityDropdown
            value={nationality}
            onChange={(code) => { onNationalityChange(code); setPanel(null) }}
          />
        </div>
      )}
    </div>
  )
}

// ── LegBar ────────────────────────────────────────────────────────────────────

interface LegBarProps {
  leg: MultiCityLeg
  properties: PropertyOption[]
  cities: string[]
  takenPropertyIds: number[]
  canRemove: boolean
  canAdd: boolean
  showValidation: boolean
  onUpdate: (patch: Partial<Omit<MultiCityLeg, 'id'>>) => void
  onAdd: () => void
  onRemove: () => void
}

function LegBar({
  leg,
  properties,
  cities,
  takenPropertyIds,
  canRemove,
  canAdd,
  showValidation,
  onUpdate,
  onAdd,
  onRemove,
}: LegBarProps) {
  const t = useT('search')
  const locale = useLocale()
  const [panel, setPanel] = useState<'city' | 'calendar' | null>(null)
  const [calField, setCalField] = useState<'checkin' | 'checkout'>('checkin')
  const containerRef = useRef<HTMLDivElement>(null)

  const nights = nightsBetween(leg.checkIn, leg.checkOut)

  useEffect(() => {
    if (!panel) return
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setPanel(null)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [panel])

  function openCalendar(field: 'checkin' | 'checkout') {
    setCalField(field)
    setPanel(prev => prev === 'calendar' && calField === field ? null : 'calendar')
  }

  // Cities that have at least one hotel not taken by another leg
  const availableCities = cities.filter(city => {
    const hotelsInCity = properties.filter(p => p.city === city)
    return hotelsInCity.some(h => !takenPropertyIds.includes(h.id))
  })

  // Build display value for the city segment
  const hotelsInCurrentCity = leg.city ? properties.filter(p => p.city === leg.city) : []
  let cityDisplayValue: string
  if (leg.propertyIds.length === 0) {
    cityDisplayValue = t('multiCitySelectCity') ?? 'Select city'
  } else if (hotelsInCurrentCity.length === 1) {
    cityDisplayValue = leg.city
  } else if (leg.propertyIds.length === hotelsInCurrentCity.length) {
    cityDisplayValue = `${leg.city} (${t('multiCityAll') ?? 'all'})`
  } else if (leg.propertyIds.length === 1) {
    const hotel = properties.find(p => p.id === leg.propertyIds[0])
    cityDisplayValue = hotel ? `${leg.city} – ${hotel.name}` : leg.city
  } else {
    cityDisplayValue = `${leg.city} – ${leg.propertyIds.length} ${t('multiCityHotels') ?? 'hotels'}`
  }

  function toggleSingleHotel(city: string, propId: number) {
    const isSelected = leg.propertyIds.includes(propId)
    if (isSelected) {
      const newIds = leg.propertyIds.filter(id => id !== propId)
      onUpdate({ city: newIds.length > 0 ? city : '', propertyIds: newIds })
    } else {
      // Switching city: clear previous selection
      if (leg.city && leg.city !== city) {
        onUpdate({ city, propertyIds: [propId] })
      } else {
        onUpdate({ city, propertyIds: [...leg.propertyIds, propId] })
      }
    }
  }

  function toggleAllInCity(city: string, availableHotels: PropertyOption[]) {
    const allSelected = availableHotels.every(h => leg.propertyIds.includes(h.id))
    if (allSelected) {
      onUpdate({ city: '', propertyIds: [] })
    } else {
      // Switching city: replace selection with all from new city
      onUpdate({ city, propertyIds: availableHotels.map(h => h.id) })
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="hidden sm:flex items-stretch overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* City */}
        <Segment
          label={t('multiCityCity') ?? 'City'}
          value={cityDisplayValue}
          active={panel === 'city'}
          invalid={showValidation && leg.propertyIds.length === 0}
          onClick={() => setPanel(p => p === 'city' ? null : 'city')}
          flex={2.5}
        />

        <Divider />

        {/* Check-in */}
        <Segment
          label={t('checkIn')}
          value={displayDate(leg.checkIn, locale) || t('selectDate')}
          active={panel === 'calendar' && calField === 'checkin'}
          onClick={() => openCalendar('checkin')}
          flex={1.8}
        />

        <Divider />

        {/* Check-out */}
        <Segment
          label={t('checkOut')}
          value={displayDate(leg.checkOut, locale) || t('selectDate')}
          active={panel === 'calendar' && calField === 'checkout'}
          onClick={() => openCalendar('checkout')}
          flex={1.8}
        />

        <Divider />

        {/* Nights — non-interactive display */}
        <div className="flex shrink-0 flex-col items-center justify-center px-2 py-2">
          <span className="mb-0.5 text-xs font-medium leading-none text-[var(--color-text-muted)]">
            {t('nightsLabel')}
          </span>
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {nights > 0 ? nights : '—'}
          </span>
        </div>

        <Divider />
        <div className="flex shrink-0 items-center gap-1.5 py-2 pl-1 pr-1.5">
          <button
            onClick={onRemove}
            className={[
              'whitespace-nowrap rounded-full border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-gray-50',
              !canRemove ? 'invisible pointer-events-none' : '',
            ].join(' ')}
          >
            − {t('multiCityRemove') ?? 'Remove'}
          </button>
          <button
            onClick={onAdd}
            className={[
              'whitespace-nowrap rounded-full bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white shadow transition-colors hover:opacity-90',
              !canAdd ? 'invisible pointer-events-none' : '',
            ].join(' ')}
          >
            + {t('multiCityAddCity') ?? 'Add city'}
          </button>
        </div>
      </div>

      {/* City dropdown */}
      {panel === 'city' && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
          <div className="max-h-80 overflow-y-auto">
            {availableCities.length === 0 && (
              <p className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
                {t('multiCityNoCities') ?? 'No more cities available'}
              </p>
            )}
            {availableCities.map(city => {
              const hotelsInCity = properties.filter(p => p.city === city)
              const availableInCity = hotelsInCity.filter(h => !takenPropertyIds.includes(h.id))

              if (hotelsInCity.length === 1) {
                const prop = hotelsInCity[0]!
                const isTaken = takenPropertyIds.includes(prop.id)
                const isSelected = leg.propertyIds.includes(prop.id)
                return (
                  <button
                    key={city}
                    disabled={isTaken}
                    onClick={() => {
                      toggleSingleHotel(city, prop.id)
                      setPanel(null)
                    }}
                    className={[
                      'flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors',
                      isTaken
                        ? 'cursor-not-allowed opacity-40'
                        : 'hover:bg-[var(--color-primary-light)]',
                      isSelected ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-text)]',
                    ].join(' ')}
                  >
                    <span>{city}</span>
                    {isSelected && (
                      <svg className="h-4 w-4 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              }

              // Multi-hotel city — tree with checkboxes
              const selectedInCity = leg.city === city
                ? availableInCity.filter(h => leg.propertyIds.includes(h.id))
                : []
              const allAvailableSelected = availableInCity.length > 0 && availableInCity.every(h => leg.propertyIds.includes(h.id))
              const someSelected = selectedInCity.length > 0 && !allAvailableSelected

              return (
                <div key={city}>
                  {/* City header row with checkbox */}
                  <div
                    className="flex cursor-pointer items-center gap-3 bg-gray-50 px-4 py-2.5 hover:bg-[var(--color-primary-light)] transition-colors"
                    onClick={() => toggleAllInCity(city, availableInCity)}
                  >
                    <IndeterminateCheckbox
                      checked={allAvailableSelected}
                      indeterminate={someSelected}
                      onChange={() => toggleAllInCity(city, availableInCity)}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text)]">
                      {city}
                    </span>
                  </div>
                  {/* Individual hotel rows */}
                  {hotelsInCity.map(prop => {
                    const isTaken = takenPropertyIds.includes(prop.id)
                    const isSelected = leg.propertyIds.includes(prop.id)
                    return (
                      <div
                        key={prop.id}
                        onClick={() => !isTaken && toggleSingleHotel(city, prop.id)}
                        className={[
                          'flex cursor-pointer items-center gap-3 py-2.5 pl-10 pr-4 transition-colors',
                          isTaken
                            ? 'cursor-not-allowed opacity-40'
                            : 'hover:bg-[var(--color-primary-light)]',
                        ].join(' ')}
                      >
                        <IndeterminateCheckbox
                          checked={isSelected}
                          onChange={() => !isTaken && toggleSingleHotel(city, prop.id)}
                          disabled={isTaken}
                        />
                        <span className={[
                          'text-sm',
                          isSelected ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-text)]',
                        ].join(' ')}>
                          {prop.name}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          {/* Close button for multi-hotel selections */}
          {leg.propertyIds.length > 0 && (
            <div className="border-t border-[var(--color-border)] px-4 py-2.5">
              <button
                onClick={() => setPanel(null)}
                className="w-full rounded-lg bg-[var(--color-primary)] py-1.5 text-sm font-semibold text-white hover:opacity-90"
              >
                {t('multiCityDone') ?? 'Done'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Calendar dropdown */}
      {panel === 'calendar' && (
        <CalendarDropdown
          checkIn={leg.checkIn}
          checkOut={leg.checkOut}
          initialField={calField}
          onDatesChange={(ci, co) => { onUpdate({ checkIn: ci, checkOut: co }) }}
          onClose={() => setPanel(null)}
        />
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
  const locale = useLocale()
  const currentSearchParams = useSearchParams()
  const detectedCountry = useCountryDetect()

  const [legs, setLegs] = useState<MultiCityLeg[]>([makeLeg()])
  const [rooms, setRooms] = useState<GuestRoom[]>([{ adults: 2, children: 0, infants: 0 }])
  const [nationality, setNationality] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [showPromo, setShowPromo] = useState(false)
  const [showValidation, setShowValidation] = useState(false)

  useEffect(() => {
    if (detectedCountry && !nationality) setNationality(detectedCountry)
  }, [detectedCountry])

  const cities = Array.from(
    new Set(properties.map(p => p.city).filter((c): c is string => Boolean(c)))
  )

  function sortByCheckIn(arr: MultiCityLeg[]): MultiCityLeg[] {
    return [...arr].sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  }

  function addLeg(afterIdx: number) {
    if (legs.length >= maxLegs) return
    const prevLeg = legs[afterIdx]
    if (!prevLeg?.propertyIds.length) return
    const newCheckIn = prevLeg.checkOut
    setLegs(prev => {
      const newLeg = makeLeg(newCheckIn)
      const next = [...prev]
      next.splice(afterIdx + 1, 0, newLeg)
      return sortByCheckIn(next)
    })
  }

  function removeLeg(idx: number) {
    setLegs(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLeg(idx: number, patch: Partial<Omit<MultiCityLeg, 'id'>>) {
    setShowValidation(false)
    setLegs(prev => {
      const updated = prev.map((leg, i) => i === idx ? { ...leg, ...patch } : leg)
      // Re-sort whenever dates change so bars always appear earliest→latest
      if ('checkIn' in patch || 'checkOut' in patch) return sortByCheckIn(updated)
      return updated
    })
  }

  const allLegsReady = legs.every(l => l.propertyIds.length > 0 && l.checkIn && l.checkOut)
  const totalAdults = rooms.reduce((s, r) => s + r.adults, 0)

  // Summary stats from configured legs
  const readyLegs = legs.filter(l => l.propertyIds.length > 0 && l.checkIn && l.checkOut)
  const sortedReady = [...readyLegs].sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  const minCheckIn = sortedReady[0]?.checkIn ?? null
  const maxCheckOut = sortedReady[sortedReady.length - 1]?.checkOut ?? null
  const totalNights = readyLegs.reduce((sum, l) => sum + nightsBetween(l.checkIn, l.checkOut), 0)
  const showSummary = readyLegs.length > 0 && minCheckIn && maxCheckOut

  // Gap + overlap detection across sorted ready legs
  const gaps: { from: string; to: string; cityA: string; cityB: string }[] = []
  const overlaps: { cityA: string; cityB: string; from: string; to: string }[] = []
  for (let i = 0; i < sortedReady.length - 1; i++) {
    const cur = sortedReady[i]!
    const next = sortedReady[i + 1]!
    const labelA = cur.city || `Stay ${i + 1}`
    const labelB = next.city || `Stay ${i + 2}`
    if (cur.checkOut < next.checkIn) {
      gaps.push({ from: cur.checkOut, to: next.checkIn, cityA: labelA, cityB: labelB })
    } else if (cur.checkOut > next.checkIn) {
      overlaps.push({ cityA: labelA, cityB: labelB, from: next.checkIn, to: cur.checkOut })
    }
  }

  function handleCheckAvailability() {
    if (!allLegsReady) {
      setShowValidation(true)
      return
    }
    // Expand legs with multiple propertyIds into individual search legs
    const expandedLegs = legs
      .filter(l => l.propertyIds.length > 0 && l.checkIn && l.checkOut)
      .flatMap(l => l.propertyIds.map(pid => ({
        propertyId: pid,
        checkIn: l.checkIn,
        checkOut: l.checkOut,
        city: l.city,
      })))

    const qs = encodeMultiCityParams({
      legs: expandedLegs,
      adults: totalAdults,
      ...(nationality ? { nationality } : {}),
      ...(promoCode ? { promoCode } : {}),
    })
    const chain = currentSearchParams.get('chain')
    const hotelId = currentSearchParams.get('hotelId')
    if (chain) qs.set('chain', chain)
    if (hotelId) qs.set('hotelId', hotelId)
    window.open(`/multi-city?${qs.toString()}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="w-full space-y-2">
      {/* Bar 1: shared Guests + Nationality */}
      <SharedBar
        rooms={rooms}
        nationality={nationality}
        infantMaxAge={infantMaxAge}
        childMaxAge={childMaxAge}
        onRoomsChange={setRooms}
        onNationalityChange={setNationality}
      />

      {/* One bar per leg — always sorted by checkIn */}
      {legs.map((leg, idx) => {
        const takenPropertyIds = legs
          .filter((_, i) => i !== idx)
          .flatMap(l => l.propertyIds)
        return (
          <LegBar
            key={leg.id}
            leg={leg}
            properties={properties}
            cities={cities}
            takenPropertyIds={takenPropertyIds}
            canRemove={legs.length > 1}
            canAdd={idx === legs.length - 1 && legs.length < maxLegs && leg.propertyIds.length > 0}
            showValidation={showValidation}
            onUpdate={(patch) => updateLeg(idx, patch)}
            onAdd={() => addLeg(idx)}
            onRemove={() => removeLeg(idx)}
          />
        )
      })}

      {/* Overlap warning */}
      {allLegsReady && overlaps.length > 0 && (
        <div className="hidden sm:flex flex-col gap-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-medium">{t('multiCityOverlapWarning') ?? 'Date overlap between stays:'}</span>
          <ul className="list-disc pl-4">
            {overlaps.map((o, i) => (
              <li key={i}>{o.cityA} ↔ {o.cityB}: {displayDate(o.from, locale)} – {displayDate(o.to, locale)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Gap warning */}
      {allLegsReady && gaps.length > 0 && (
        <div className="hidden sm:flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">{t('multiCityGapWarning')}</span>
          <ul className="list-disc pl-4">
            {gaps.map((g, i) => (
              <li key={i}>{g.cityA} → {g.cityB}: {displayDate(g.from, locale)} – {displayDate(g.to, locale)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA row + summary */}
      <div className="hidden sm:flex flex-col items-end gap-1.5 pt-1">
        <div className="flex items-center gap-3">
          {showSummary && (
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
              <span>{readyLegs.length} {readyLegs.length !== 1 ? (t('multiCityCityPlural') ?? 'cities') : (t('multiCityCity') ?? 'city')}</span>
              <span>·</span>
              <span>{displayDate(minCheckIn!, locale)}</span>
              <span>→</span>
              <span>{displayDate(maxCheckOut!, locale)}</span>
              <span>·</span>
              <span>{totalNights} {t('nightsLabel')}</span>
            </span>
          )}
          <button
            onClick={handleCheckAvailability}
            className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:opacity-90"
          >
            {t('checkAvailability')}
          </button>
        </div>
        <button
          onClick={() => setShowPromo(v => !v)}
          className="text-[11px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          {showPromo ? `${t('hidePromoCode')} ▴` : `${t('havePromoCode')} ▾`}
        </button>
        {showPromo && (
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-lg ring-1 ring-black/10">
            <input
              type="text"
              placeholder={t('enterPromoCode')}
              value={promoCode}
              onChange={e => setPromoCode(e.target.value.toUpperCase())}
              autoFocus
              className="w-44 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
            />
            {promoCode && (
              <button
                onClick={() => setPromoCode('')}
                className="text-lg leading-none text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
