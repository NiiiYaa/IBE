'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, nightsBetween, todayIso } from '@ibe/shared'
import { displayDate } from '@/lib/calendar-utils'
import { encodeSearchParams } from '@/lib/search-params'
import { countryFlag, countryName } from '@/lib/countries'
import { useCountryDetect } from '@/hooks/use-country-detect'
import { usePreferences } from '@/context/preferences'
import { useOffersConstraints } from '@/hooks/use-offers-constraints'
import { CalendarDropdown } from './CalendarDropdown'
import { GuestsDropdown, type GuestRoom } from './GuestsDropdown'
import { NationalityDropdown } from './NationalityDropdown'

export interface PropertyOption {
  id: number
  name: string
  city?: string
  isDefault?: boolean
}

interface SearchBarProps {
  propertyId: number
  initialCheckIn?: string
  initialCheckOut?: string
  initialRooms?: GuestRoom[]
  initialNationality?: string
  infantMaxAge?: number
  childMaxAge?: number
  properties?: PropertyOption[]
  showCitySelector?: boolean
}

type ActivePanel = 'city' | 'property' | 'calendar' | 'guests' | 'nationality' | null

/** Mid-point age used when collapsing a guest category to a single representative age. */
function repAge(lo: number, hi: number) {
  return Math.round((lo + hi) / 2)
}

export function SearchBar({
  propertyId,
  initialCheckIn,
  initialCheckOut,
  initialRooms,
  initialNationality,
  infantMaxAge = 2,
  childMaxAge = 16,
  properties,
  showCitySelector = false,
}: SearchBarProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyId)

  // Derive unique cities and track selected city
  const cities = showCitySelector && properties
    ? [...new Set(properties.map(p => p.city ?? '').filter(Boolean))].sort()
    : []
  const defaultCity = properties?.find(p => p.id === propertyId)?.city ?? cities[0] ?? ''
  const [selectedCity, setSelectedCity] = useState(defaultCity)
  const [checkIn, setCheckIn] = useState(initialCheckIn ?? '')
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? '')
  const [rooms, setRooms] = useState<GuestRoom[]>(
    initialRooms ?? [{ adults: 2, children: 0, infants: 0 }],
  )
  const [nationality, setNationality] = useState(initialNationality ?? '')
  const [promoCode, setPromoCode] = useState('')
  const [showPromo, setShowPromo] = useState(false)
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [calendarInitialField, setCalendarInitialField] = useState<'checkin' | 'checkout'>('checkin')

  const detectedCountry = useCountryDetect()
  const { currency } = usePreferences()
  const { minNights, maxNights, minRooms, maxRooms } = useOffersConstraints(selectedPropertyId)

  useEffect(() => {
    if (detectedCountry && !nationality) setNationality(detectedCountry)
  }, [detectedCountry])

  useEffect(() => {
    if (!checkIn) {
      const today = todayIso()
      setCheckIn(addDays(today, 1))
      if (!checkOut) setCheckOut(addDays(today, 3))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!activePanel) return
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActivePanel(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [activePanel])

  const nights = nightsBetween(checkIn, checkOut)
  const totalAdults = rooms.reduce((s, r) => s + r.adults, 0)
  const totalChildren = rooms.reduce((s, r) => s + r.children, 0)
  const totalInfants = rooms.reduce((s, r) => s + r.infants, 0)

  const guestParts = [
    `${totalAdults} Adult${totalAdults !== 1 ? 's' : ''}`,
    totalChildren > 0 ? `${totalChildren} Child${totalChildren !== 1 ? 'ren' : ''}` : null,
    totalInfants > 0 ? `${totalInfants} Infant${totalInfants !== 1 ? 's' : ''}` : null,
    `${rooms.length} Room${rooms.length !== 1 ? 's' : ''}`,
  ].filter(Boolean)
  const guestSummary = guestParts.join(' · ')

  function openCalendar(field: 'checkin' | 'checkout') {
    setCalendarInitialField(field)
    setActivePanel(prev => (prev === 'calendar' && calendarInitialField === field ? null : 'calendar'))
  }

  function handleNationalitySelect(code: string) {
    setNationality(code)
    setActivePanel(null)
  }

  function handleSearch() {
    if (nights <= 0) return

    const childRep = repAge(infantMaxAge + 1, childMaxAge)
    const infantRep = repAge(0, infantMaxAge)

    const qs = encodeSearchParams({
      hotelId: effectivePropertyId,
      checkIn,
      checkOut,
      currency: currency || undefined,
      rooms: rooms.map(r => {
        const childAges = [
          ...Array<number>(r.children).fill(childRep),
          ...Array<number>(r.infants).fill(infantRep),
        ]
        return { adults: r.adults, ...(childAges.length > 0 ? { childAges } : {}) }
      }),
      nationality: nationality || undefined,
      promoCode: promoCode || undefined,
    })
    router.push(`/search?${qs.toString()}`)
  }

  const nationalityLabel = nationality
    ? `${countryFlag(nationality)} ${countryName(nationality)}`
    : 'Select country'

  // When city selector is active, filter properties by selected city
  const visibleProperties = showCitySelector && selectedCity
    ? (properties ?? []).filter(p => p.city === selectedCity)
    : properties

  // If selected property is no longer in the filtered list, reset to first of filtered
  const effectivePropertyId = visibleProperties?.some(p => p.id === selectedPropertyId)
    ? selectedPropertyId
    : (visibleProperties?.[0]?.id ?? selectedPropertyId)

  const selectedProperty = (visibleProperties ?? properties)?.find(p => p.id === effectivePropertyId)

  function handleCitySelect(city: string) {
    setSelectedCity(city)
    setActivePanel(null)
    // auto-select first property in that city
    const first = properties?.find(p => p.city === city)
    if (first) setSelectedPropertyId(first.id)
  }

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-5xl">
      {/* Pill bar */}
      <div className="flex items-stretch overflow-hidden rounded-2xl bg-white shadow-2xl">
        {showCitySelector && cities.length > 1 && (
          <>
            <Segment
              label="City"
              value={selectedCity || 'Select city'}
              active={activePanel === 'city'}
              onClick={() => setActivePanel(p => (p === 'city' ? null : 'city'))}
            />
            <Divider />
          </>
        )}

        {properties && properties.length > 1 && (
          <>
            <Segment
              label="Property"
              value={selectedProperty?.name ?? 'Select property'}
              active={activePanel === 'property'}
              onClick={() => setActivePanel(p => (p === 'property' ? null : 'property'))}
            />
            <Divider />
          </>
        )}

        <Segment
          label="Check-in"
          value={displayDate(checkIn) || 'Select date'}
          active={activePanel === 'calendar' && calendarInitialField === 'checkin'}
          onClick={() => openCalendar('checkin')}
        />

        <Divider />

        <Segment
          label="Check-out"
          value={displayDate(checkOut) || 'Select date'}
          active={activePanel === 'calendar' && calendarInitialField === 'checkout'}
          onClick={() => openCalendar('checkout')}
        />

        <Divider />

        <div className="flex shrink-0 flex-col items-center justify-center px-4 py-3">
          <span className="mb-0.5 text-xs font-medium leading-none text-[var(--color-text-muted)]">
            Nights
          </span>
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {nights > 0 ? nights : '—'}
          </span>
        </div>

        <Divider />

        <Segment
          label="Guests"
          value={guestSummary}
          active={activePanel === 'guests'}
          onClick={() => setActivePanel(p => (p === 'guests' ? null : 'guests'))}
        />

        <Divider />

        <Segment
          label="Nationality"
          value={nationalityLabel}
          active={activePanel === 'nationality'}
          onClick={() => setActivePanel(p => (p === 'nationality' ? null : 'nationality'))}
        />

        {/* CTA */}
        <div className="flex flex-col items-center justify-center gap-1.5 py-2 pl-1 pr-3">
          <button
            onClick={handleSearch}
            disabled={nights <= 0}
            className="whitespace-nowrap rounded-full bg-[var(--color-primary)] px-7 py-3 text-sm font-semibold text-white shadow transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Check availability
          </button>
          <button
            onClick={() => setShowPromo(v => !v)}
            className="text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
          >
            {showPromo ? 'Hide promo code ▴' : 'I have a promo code ▾'}
          </button>
        </div>
      </div>

      {/* Promo input — floats below the box, aligned under the CTA */}
      {showPromo && (
        <div className="absolute right-3 top-full z-10 mt-2">
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-lg ring-1 ring-black/10">
            <input
              type="text"
              placeholder="Enter promo code"
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
        </div>
      )}

      {activePanel === 'city' && cities.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
          {cities.map(city => (
            <button
              key={city}
              onClick={() => handleCitySelect(city)}
              className={[
                'flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--color-primary-light)]',
                city === selectedCity ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-text)]',
              ].join(' ')}
            >
              <span>{city}</span>
              {city === selectedCity && (
                <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      {activePanel === 'property' && visibleProperties && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
          {visibleProperties.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedPropertyId(p.id); setActivePanel(null) }}
              className={[
                'flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--color-primary-light)]',
                p.id === effectivePropertyId ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-text)]',
              ].join(' ')}
            >
              <span>{p.name}</span>
              {p.id === effectivePropertyId && (
                <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      {activePanel === 'calendar' && (
        <CalendarDropdown
          checkIn={checkIn}
          checkOut={checkOut}
          initialField={calendarInitialField}
          onDatesChange={(ci, co) => { setCheckIn(ci); setCheckOut(co) }}
          onClose={() => setActivePanel(null)}
          minNights={minNights}
          maxNights={maxNights}
        />
      )}

      {activePanel === 'guests' && (
        <GuestsDropdown
          rooms={rooms}
          onChange={setRooms}
          infantMaxAge={infantMaxAge}
          childMaxAge={childMaxAge}
          minRooms={minRooms}
          maxRooms={maxRooms}
        />
      )}

      {activePanel === 'nationality' && (
        <NationalityDropdown
          value={nationality}
          onChange={handleNationalitySelect}
        />
      )}
    </div>
  )
}

// ── Segment ───────────────────────────────────────────────────────────────────

function Segment({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex min-w-0 flex-1 flex-col items-start justify-center px-4 py-3 transition-colors',
        active ? 'bg-[var(--color-primary-light)]' : 'hover:bg-gray-50',
      ].join(' ')}
    >
      <span className="mb-0.5 whitespace-nowrap text-xs font-medium leading-none text-[var(--color-text-muted)]">
        {label}
      </span>
      <span className="block w-full truncate text-sm font-semibold text-[var(--color-text)]" title={value}>
        {value}
      </span>
    </button>
  )
}

function Divider() {
  return <div className="my-3 w-px shrink-0 bg-[var(--color-border)]" />
}
