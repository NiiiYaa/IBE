'use client'

import { useState, useRef, useEffect } from 'react'
import { addDays, todayIso, nightsBetween } from '@ibe/shared'
import { useT, useLocale } from '@/context/translations'
import { CalendarDropdown } from '@/components/search/CalendarDropdown'
import { GuestsDropdown, type GuestRoom } from '@/components/search/GuestsDropdown'
import { NationalityDropdown } from '@/components/search/NationalityDropdown'
import { encodeSearchParams } from '@/lib/search-params'
import { displayDate } from '@/lib/calendar-utils'
import { countryFlag, countryName } from '@/lib/countries'
import { useCountryDetect } from '@/hooks/use-country-detect'
import type { PropertyOption } from '@/components/search/SearchBar'

// ── Types ─────────────────────────────────────────────────────────────────────

type MultiCityLeg = {
  id: string
  city: string
  propertyId: number | null
  checkIn: string
  checkOut: string
}

function makeLeg(offsetDays = 7): MultiCityLeg {
  return {
    id: Math.random().toString(36).slice(2, 9),
    city: '',
    propertyId: null,
    checkIn: addDays(todayIso(), offsetDays),
    checkOut: addDays(todayIso(), offsetDays + 3),
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
  onClick,
  panelId,
  flex = 1,
}: {
  label: string
  value: string
  active: boolean
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPanel(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [panel])

  function getSegmentLeft(panelId: string): number {
    const btn = containerRef.current?.querySelector(`[data-segment="${panelId}"]`)
    if (!btn || !containerRef.current) return 0
    const rect = btn.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    return rect.left - containerRect.left
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Desktop pill bar */}
      <div className="hidden sm:flex items-stretch overflow-hidden rounded-2xl bg-white shadow-2xl">
        <Segment
          label={t('guests')}
          value={guestParts}
          active={panel === 'guests'}
          onClick={() => setPanel(p => p === 'guests' ? null : 'guests')}
          panelId="shared-guests"
        />
        <Divider />
        <Segment
          label={t('nationality')}
          value={nationalityLabel}
          active={panel === 'nationality'}
          onClick={() => setPanel(p => p === 'nationality' ? null : 'nationality')}
          panelId="shared-nationality"
        />
      </div>

      {/* Guests dropdown */}
      {panel === 'guests' && (
        <div
          className="absolute top-full z-50 mt-2"
          style={{ left: getSegmentLeft('shared-guests') }}
        >
          <GuestsDropdown
            rooms={rooms}
            onChange={onRoomsChange}
            infantMaxAge={infantMaxAge}
            childMaxAge={childMaxAge}
          />
        </div>
      )}

      {/* Nationality dropdown */}
      {panel === 'nationality' && (
        <div
          className="absolute top-full z-50 mt-2"
          style={{ left: getSegmentLeft('shared-nationality') }}
        >
          <NationalityDropdown
            value={nationality}
            onChange={(code) => { onNationalityChange(code); setPanel(null) }}
          />
        </div>
      )}
    </div>
  )
}

// ── LegBar — City + Check-in + Check-out + Add/Remove ────────────────────────

interface LegBarProps {
  leg: MultiCityLeg
  properties: PropertyOption[]
  cities: string[]
  canRemove: boolean
  canAdd: boolean
  onUpdate: (patch: Partial<Omit<MultiCityLeg, 'id'>>) => void
  onAdd: () => void
  onRemove: () => void
}

function LegBar({
  leg,
  properties,
  cities,
  canRemove,
  canAdd,
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPanel(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [panel])

  function openCalendar(field: 'checkin' | 'checkout') {
    setCalField(field)
    setPanel(prev => prev === 'calendar' && calField === field ? null : 'calendar')
  }

  const selectedProperty = properties.find(p => p.id === leg.propertyId)
  const cityDisplayValue = selectedProperty
    ? properties.filter(p => p.city === leg.city).length > 1
      ? `${leg.city} – ${selectedProperty.name}`
      : leg.city
    : leg.city || (t('multiCitySelectCity') ?? 'Select city')

  return (
    <div ref={containerRef} className="relative">
      {/* Desktop pill bar */}
      <div className="hidden sm:flex items-stretch overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* City */}
        <Segment
          label={t('multiCityCity') ?? 'City'}
          value={cityDisplayValue}
          active={panel === 'city'}
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

        {/* Nights display */}
        <div className="flex shrink-0 flex-col items-center justify-center px-2 py-2">
          <span className="mb-0.5 text-xs font-medium leading-none text-[var(--color-text-muted)]">
            {t('nightsLabel')}
          </span>
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {nights > 0 ? nights : '—'}
          </span>
        </div>

        {/* Add / Remove */}
        {(canRemove || canAdd) && (
          <>
            <Divider />
            <div className="flex items-center gap-1.5 py-2 pl-1 pr-1.5">
              {canRemove && (
                <button
                  onClick={onRemove}
                  className="whitespace-nowrap rounded-full border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-gray-50"
                >
                  − {t('multiCityRemove') ?? 'Remove'}
                </button>
              )}
              {canAdd && (
                <button
                  onClick={onAdd}
                  className="whitespace-nowrap rounded-full bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white shadow transition-colors hover:opacity-90"
                >
                  + {t('multiCityAddCity') ?? 'Add city'}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* City dropdown */}
      {panel === 'city' && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
          <div className="max-h-72 overflow-y-auto">
            {cities.map(city => {
              const hotelsInCity = properties.filter(p => p.city === city)
              if (hotelsInCity.length === 1) {
                const prop = hotelsInCity[0]!
                return (
                  <button
                    key={city}
                    onClick={() => { onUpdate({ city, propertyId: prop.id }); setPanel(null) }}
                    className={[
                      'flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--color-primary-light)]',
                      leg.city === city ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-text)]',
                    ].join(' ')}
                  >
                    <span>{city}</span>
                    {leg.city === city && (
                      <svg className="h-4 w-4 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              }
              return (
                <div key={city}>
                  <div className="bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    {city}
                  </div>
                  {hotelsInCity.map(prop => (
                    <button
                      key={prop.id}
                      onClick={() => { onUpdate({ city, propertyId: prop.id }); setPanel(null) }}
                      className={[
                        'flex w-full items-center justify-between pl-7 pr-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-primary-light)]',
                        prop.id === leg.propertyId ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-text)]',
                      ].join(' ')}
                    >
                      <span>{prop.name}</span>
                      {prop.id === leg.propertyId && (
                        <svg className="h-4 w-4 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
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
  const detectedCountry = useCountryDetect()

  const [legs, setLegs] = useState<MultiCityLeg[]>([makeLeg(7)])
  const [rooms, setRooms] = useState<GuestRoom[]>([{ adults: 2, children: 0, infants: 0 }])
  const [nationality, setNationality] = useState('')

  useEffect(() => {
    if (detectedCountry && !nationality) setNationality(detectedCountry)
  }, [detectedCountry])

  const cities = Array.from(
    new Set(properties.map(p => p.city).filter((c): c is string => Boolean(c)))
  )

  function addLeg(afterIdx: number) {
    if (legs.length >= maxLegs) return
    const prev = legs[afterIdx]
    const newCheckIn = prev ? addDays(prev.checkOut, 0) : addDays(todayIso(), 10)
    const newCheckOut = addDays(newCheckIn, 3)
    const newLeg: MultiCityLeg = {
      id: Math.random().toString(36).slice(2, 9),
      city: '',
      propertyId: null,
      checkIn: newCheckIn,
      checkOut: newCheckOut,
    }
    setLegs(prev => {
      const next = [...prev]
      next.splice(afterIdx + 1, 0, newLeg)
      return next
    })
  }

  function removeLeg(idx: number) {
    setLegs(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLeg(idx: number, patch: Partial<Omit<MultiCityLeg, 'id'>>) {
    setLegs(prev => prev.map((leg, i) => i === idx ? { ...leg, ...patch } : leg))
  }

  const allLegsReady = legs.every(l => l.propertyId !== null && l.checkIn && l.checkOut)

  function handleCheckAvailability() {
    for (const leg of legs) {
      if (!leg.propertyId || !leg.checkIn || !leg.checkOut) continue
      const qs = encodeSearchParams({
        hotelId: leg.propertyId,
        checkIn: leg.checkIn,
        checkOut: leg.checkOut,
        rooms: [{ adults: rooms.reduce((s, r) => s + r.adults, 0) }],
        nationality: nationality || undefined,
      })
      window.open(`/search?${qs.toString()}`, '_blank', 'noopener,noreferrer')
    }
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

      {/* Bars 2..N: one per leg */}
      {legs.map((leg, idx) => (
        <LegBar
          key={leg.id}
          leg={leg}
          properties={properties}
          cities={cities}
          canRemove={legs.length > 1}
          canAdd={idx === legs.length - 1 && legs.length < maxLegs}
          onUpdate={(patch) => updateLeg(idx, patch)}
          onAdd={() => addLeg(idx)}
          onRemove={() => removeLeg(idx)}
        />
      ))}

      {/* Check availability CTA */}
      {allLegsReady && (
        <div className="flex justify-end pt-1">
          <button
            onClick={handleCheckAvailability}
            className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:opacity-90"
          >
            {t('checkAvailability')}
          </button>
        </div>
      )}
    </div>
  )
}
