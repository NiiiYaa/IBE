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
  propertyId: number | null
  checkIn: string
  checkOut: string
}

function makeLeg(checkIn?: string): MultiCityLeg {
  const ci = checkIn ?? addDays(todayIso(), 7)
  return {
    id: Math.random().toString(36).slice(2, 9),
    city: '',
    propertyId: null,
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
      {/*
        Mirror LegBar column structure so Nationality aligns with Check-out:
        [Guests: flex=4.3] | [Nationality: flex=1.8] | [Nights spacer] | [Button spacer]
      */}
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
        {/* Invisible section — mirrors Nights + button column so Nationality aligns with Check-out */}
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

// ── LegBar — City + Check-in + Check-out + fixed-width Add/Remove ─────────────

interface LegBarProps {
  leg: MultiCityLeg
  properties: PropertyOption[]
  cities: string[]
  /** Cities already picked in other legs — excluded from this leg's dropdown */
  takenCities: string[]
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
  takenCities,
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setPanel(null)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [panel])

  function openCalendar(field: 'checkin' | 'checkout') {
    setCalField(field)
    setPanel(prev => prev === 'calendar' && calField === field ? null : 'calendar')
  }

  // Cities available for this leg = all cities minus those taken by other legs
  const availableCities = cities.filter(c => !takenCities.includes(c))

  const selectedProperty = properties.find(p => p.id === leg.propertyId)
  const cityDisplayValue = selectedProperty
    ? properties.filter(p => p.city === leg.city).length > 1
      ? `${leg.city} – ${selectedProperty.name}`
      : leg.city
    : leg.city || (t('multiCitySelectCity') ?? 'Select city')

  return (
    <div ref={containerRef} className="relative">
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

        {/* Nights — non-interactive display */}
        <div className="flex shrink-0 flex-col items-center justify-center px-2 py-2">
          <span className="mb-0.5 text-xs font-medium leading-none text-[var(--color-text-muted)]">
            {t('nightsLabel')}
          </span>
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {nights > 0 ? nights : '—'}
          </span>
        </div>

        {/*
          Button column — ALWAYS rendered at the same width so segments above
          don't shift. Buttons that aren't active are invisible (keep space).
        */}
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
        <div className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
          <div className="max-h-72 overflow-y-auto">
            {availableCities.length === 0 && (
              <p className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
                {t('multiCityNoCities') ?? 'No more cities available'}
              </p>
            )}
            {availableCities.map(city => {
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
  const locale = useLocale()
  const currentSearchParams = useSearchParams()
  const detectedCountry = useCountryDetect()

  const [legs, setLegs] = useState<MultiCityLeg[]>([makeLeg()])
  const [rooms, setRooms] = useState<GuestRoom[]>([{ adults: 2, children: 0, infants: 0 }])
  const [nationality, setNationality] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [showPromo, setShowPromo] = useState(false)

  useEffect(() => {
    if (detectedCountry && !nationality) setNationality(detectedCountry)
  }, [detectedCountry])

  const cities = Array.from(
    new Set(properties.map(p => p.city).filter((c): c is string => Boolean(c)))
  )

  function addLeg(afterIdx: number) {
    if (legs.length >= maxLegs) return
    const prevLeg = legs[afterIdx]
    // Require city to be selected before adding another leg
    if (!prevLeg?.propertyId) return
    const newCheckIn = prevLeg.checkOut
    setLegs(prev => {
      const newLeg = makeLeg(newCheckIn)
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
  const totalAdults = rooms.reduce((s, r) => s + r.adults, 0)

  // Summary stats — computed from configured legs (persists even when a new empty leg is added)
  const readyLegs = legs.filter(l => l.propertyId !== null && l.checkIn && l.checkOut)
  const sortedReady = [...readyLegs].sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  const minCheckIn = sortedReady[0]?.checkIn ?? null
  const maxCheckOut = sortedReady[sortedReady.length - 1]?.checkOut ?? null
  const totalNights = readyLegs.reduce((sum, l) => sum + nightsBetween(l.checkIn, l.checkOut), 0)
  const showSummary = readyLegs.length > 0 && minCheckIn && maxCheckOut

  // Gap detection across ready legs
  const sortedLegs = [...legs].sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  const gaps: { from: string; to: string }[] = []
  for (let i = 0; i < sortedLegs.length - 1; i++) {
    const cur = sortedLegs[i]
    const next = sortedLegs[i + 1]
    if (cur && next && cur.checkOut < next.checkIn) {
      gaps.push({ from: cur.checkOut, to: next.checkIn })
    }
  }

  function handleCheckAvailability() {
    const qs = encodeMultiCityParams({
      legs: legs
        .filter(l => l.propertyId !== null && l.checkIn && l.checkOut)
        .map(l => ({
          propertyId: l.propertyId!,
          checkIn: l.checkIn,
          checkOut: l.checkOut,
          city: l.city,
        })),
      adults: totalAdults,
      ...(nationality ? { nationality } : {}),
      ...(promoCode ? { promoCode } : {}),
    })
    // Preserve tenant routing params (used in non-subdomain dev/staging mode)
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

      {/* One bar per leg */}
      {legs.map((leg, idx) => {
        const takenCities = legs
          .filter((_, i) => i !== idx)
          .map(l => l.city)
          .filter(Boolean)
        return (
          <LegBar
            key={leg.id}
            leg={leg}
            properties={properties}
            cities={cities}
            takenCities={takenCities}
            canRemove={legs.length > 1}
            canAdd={idx === legs.length - 1 && legs.length < maxLegs && leg.propertyId !== null}
            onUpdate={(patch) => updateLeg(idx, patch)}
            onAdd={() => addLeg(idx)}
            onRemove={() => removeLeg(idx)}
          />
        )
      })}

      {/* Gap warning */}
      {allLegsReady && gaps.length > 0 && (
        <div className="hidden sm:flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">{t('multiCityGapWarning')}</span>
          <ul className="list-disc pl-4">
            {gaps.map((g, i) => (
              <li key={i}>{displayDate(g.from, locale)} – {displayDate(g.to, locale)}</li>
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
            disabled={!allLegsReady}
            className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
