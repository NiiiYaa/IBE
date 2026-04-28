'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams as useNextSearchParams } from 'next/navigation'
import { addDays, nightsBetween, todayIso } from '@ibe/shared'
import { displayDate } from '@/lib/calendar-utils'
import { encodeSearchParams } from '@/lib/search-params'
import { countryFlag, countryName } from '@/lib/countries'
import { useCountryDetect } from '@/hooks/use-country-detect'
import { usePreferences } from '@/context/preferences'
import { useAiMode } from '@/context/ai-mode'
import { useSearchSelection } from '@/context/search-selection'
import { usePublicGroupConfig } from '@/hooks/use-public-group-config'
import { useOffersConstraints } from '@/hooks/use-offers-constraints'
import { CalendarDropdown } from './CalendarDropdown'
import { GuestsDropdown, type GuestRoom } from './GuestsDropdown'
import { NationalityDropdown } from './NationalityDropdown'
import { ConversationalSearchPanel } from '@/components/conversational-search/conversational-search-panel'

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
  showPromoCode?: boolean
  aiEnabled?: boolean
  orgId?: number
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
  showPromoCode = true,
  aiEnabled = false,
  orgId,
}: SearchBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const pageSearchParams = useNextSearchParams()
  const containerRef = useRef<HTMLDivElement>(null)
  const guestsPanelRef = useRef<HTMLDivElement>(null)
  const checkBtnRef = useRef<HTMLButtonElement>(null)
  const [promoLeft, setPromoLeft] = useState(0)

  function getSegmentLeft(panelId: string): number {
    const button = containerRef.current?.querySelector(`[data-segment="${panelId}"]`)
    if (!button || !containerRef.current) return 0
    const rect = button.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    return rect.left - containerRect.left
  }

  // ── AI Mode ──────────────────────────────────────────────────────────────────
  const { setSelection } = useSearchSelection()
  const { setAiLayout } = useAiMode()
  const [aiMode, setAiMode] = useState(false)

  function toggleAiMode() {
    setAiMode(v => {
      if (v) { setAiLayout(false) }
      else { setShowPromo(false); setAiLayout(true) }
      return !v
    })
  }

  useLayoutEffect(() => {
    if (aiMode || !checkBtnRef.current || !containerRef.current) return
    const rect = checkBtnRef.current.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    setPromoLeft(rect.left - containerRect.left + rect.width / 2)
  }, [aiMode])

  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyId)

  useEffect(() => {
    const prop = (properties ?? []).find(p => p.id === selectedPropertyId)
    setSelection({ propertyId: selectedPropertyId, propertyName: prop?.name ?? '', city: prop?.city ?? '' })
  }, [selectedPropertyId])

  // Derive unique cities and track selected city; '' means "All"
  const cities = showCitySelector && properties
    ? [...new Set(properties.map(p => p.city ?? '').filter(Boolean))].sort()
    : []
  const [selectedCity, setSelectedCity] = useState('')
  const [propertySearch, setPropertySearch] = useState('')
  const [citySearch, setCitySearch] = useState('')
  const [checkIn, setCheckIn] = useState(initialCheckIn ?? '')
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? '')
  const [rooms, setRooms] = useState<GuestRoom[]>(
    initialRooms ?? [{ adults: 2, children: 0, infants: 0 }],
  )
  const [nationality, setNationality] = useState(initialNationality ?? '')
  const [promoCode, setPromoCode] = useState('')
  const [showPromo, setShowPromo] = useState(false)
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<ActivePanel>(null)

  function toggleMobilePanel(panel: ActivePanel) {
    setMobilePanel(prev => prev === panel ? null : panel)
  }

  const openPanel = useCallback((panel: ActivePanel) => {
    setActivePanel(prev => {
      if (prev !== panel) { setPropertySearch(''); setCitySearch('') }
      return prev === panel ? null : panel
    })
  }, [])
  const [calendarInitialField, setCalendarInitialField] = useState<'checkin' | 'checkout'>('checkin')

  const detectedCountry = useCountryDetect()
  const { currency } = usePreferences()
  const { minNights, maxNights, minRooms, maxRooms } = useOffersConstraints(selectedPropertyId)
  const { data: groupConfig } = usePublicGroupConfig(selectedPropertyId)
  const groupsHref = groupConfig?.enabled
    ? `/groups?hotelId=${selectedPropertyId}&returnTo=${encodeURIComponent(pageSearchParams.toString() ? `${pathname}?${pageSearchParams.toString()}` : pathname)}`
    : undefined

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

  useEffect(() => {
    if (activePanel) {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activePanel])

  const prevRoomsLen = useRef(rooms.length)
  useEffect(() => {
    if (rooms.length > prevRoomsLen.current) {
      guestsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    } else if (rooms.length < prevRoomsLen.current) {
      guestsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    prevRoomsLen.current = rooms.length
  }, [rooms.length])

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
    const url = `/search?${qs.toString()}`
    if (properties && properties.length > 1) {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      router.push(url)
    }
  }

  const nationalityLabel = nationality
    ? `${countryFlag(nationality)} ${countryName(nationality)}`
    : 'Select country'

  // When city selector is active, filter properties by selected city ('' = All)
  const visibleProperties = showCitySelector && selectedCity
    ? (properties ?? []).filter(p => p.city === selectedCity)
    : (properties ?? [])

  // If selected property is no longer in the filtered list, reset to first of filtered
  const effectivePropertyId = visibleProperties?.some(p => p.id === selectedPropertyId)
    ? selectedPropertyId
    : (visibleProperties?.[0]?.id ?? selectedPropertyId)

  const selectedProperty = (visibleProperties ?? properties)?.find(p => p.id === effectivePropertyId)

  function handleCitySelect(city: string) {
    setSelectedCity(city)
    if (city) {
      const first = properties?.find(p => p.city === city)
      if (first) setSelectedPropertyId(first.id)
    }
    setActivePanel('property')
  }

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-5xl">
      {/* AI mode — full-screen overlay */}
      {aiMode && (
        <div className="fixed inset-0 z-50">
          <ConversationalSearchPanel
            propertyId={selectedPropertyId}
            {...(orgId ? { orgId } : {})}
            onClose={toggleAiMode}
            className="h-full"
          />
        </div>
      )}

      {/* Pill bar — desktop only */}
      <div className="hidden sm:flex items-stretch overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-200">
        {/* ── Standard bar ─────────────────────────────────────────────────── */}
        <>
            {/* AI Mode — far left */}
            {aiEnabled && (
              <>
                <div className="flex items-center py-2 pl-2 pr-1">
                  <AiModeButton active={aiMode} onClick={toggleAiMode} />
                </div>
                <Divider />
              </>
            )}

            {showCitySelector && cities.length > 1 && (
              <>
                <Segment
                  label="City"
                  value={selectedCity || 'All'}
                  active={activePanel === 'city'}
                  onClick={() => openPanel('city')}
                  flex={0.7}
                />
                <Divider />
              </>
            )}

            {properties && properties.length > 1 && (
              <>
                <Segment
                  label="Hotel"
                  value={selectedProperty?.name ?? 'Select property'}
                  active={activePanel === 'property'}
                  onClick={() => openPanel('property')}
                  flex={2.5}
                />
                <Divider />
              </>
            )}

            <Segment
              label="Check-in"
              value={displayDate(checkIn) || 'Select date'}
              active={activePanel === 'calendar' && calendarInitialField === 'checkin'}
              onClick={() => openCalendar('checkin')}
              flex={1.8}
            />

            <Divider />

            <Segment
              label="Check-out"
              value={displayDate(checkOut) || 'Select date'}
              active={activePanel === 'calendar' && calendarInitialField === 'checkout'}
              onClick={() => openCalendar('checkout')}
              flex={1.8}
            />

            <Divider />

            <div className="flex shrink-0 flex-col items-center justify-center px-2 py-2">
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
              panelId="guests"
            />

            <Divider />

            <Segment
              label="Nationality"
              value={nationalityLabel}
              active={activePanel === 'nationality'}
              onClick={() => setActivePanel(p => (p === 'nationality' ? null : 'nationality'))}
              panelId="nationality"
            />

            {/* CTA */}
            <div className="flex items-center py-2 pl-1 pr-1.5">
              <button
                ref={checkBtnRef}
                onClick={handleSearch}
                disabled={nights <= 0}
                className="whitespace-nowrap rounded-full bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Check availability
              </button>
            </div>

          </>
      </div>

      {/* Promo toggle + input — outside pill, centered below check button */}
      {!aiMode && showPromoCode && (
      <div
        className="hidden sm:flex absolute top-full z-10 mt-2 -translate-x-1/2 flex-col items-center gap-1.5"
        style={{ left: promoLeft }}
      >
        <button
          onClick={() => setShowPromo(v => !v)}
          className="text-[11px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          {showPromo ? 'Hide promo code ▴' : 'I have Promo code ▾'}
        </button>
        {showPromo && (
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
        )}
      </div>
      )}

      {/* ── Mobile summary card ──────────────────────────────────────── */}
      <button
        onClick={() => setMobileDrawerOpen(true)}
        className="sm:hidden mt-0 flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 shadow-2xl text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-[var(--color-text-muted)]">
            {checkIn && checkOut
              ? `${displayDate(checkIn)} – ${displayDate(checkOut)}${nights > 0 ? ` · ${nights} night${nights !== 1 ? 's' : ''}` : ''}`
              : 'Select dates'}
          </p>
          <p className="truncate text-sm font-semibold text-[var(--color-text)]">{guestSummary}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow">
          Search
        </span>
      </button>

      {/* ── Mobile full-screen drawer ────────────────────────────────── */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white sm:hidden">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-4">
            <h2 className="text-base font-semibold text-[var(--color-text)]">Search</h2>
            <button
              onClick={() => setMobileDrawerOpen(false)}
              className="rounded-full p-2 text-[var(--color-text-muted)] transition-colors hover:bg-gray-100"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            {/* City selector */}
            {showCitySelector && cities.length > 1 && (
              <MobileSection
                label="City"
                value={selectedCity || 'All cities'}
                open={mobilePanel === 'city'}
                onToggle={() => { if (mobilePanel === 'city') setCitySearch(''); toggleMobilePanel('city') }}
              >
                {cities.length > 10 && (
                  <input
                    type="text"
                    placeholder="Search cities…"
                    value={citySearch}
                    onChange={e => setCitySearch(e.target.value)}
                    className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
                  />
                )}
                <div className="space-y-1">
                  {[{ value: '', label: 'All cities' }, ...cities.map(c => ({ value: c, label: c }))]
                    .filter(({ value, label }) => !citySearch || value === '' || label.toLowerCase().includes(citySearch.toLowerCase()))
                    .map(({ value, label }) => (
                      <button
                        key={value || '__all__'}
                        onClick={() => { setCitySearch(''); handleCitySelect(value); setMobilePanel(null) }}
                        className={[
                          'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                          value === selectedCity ? 'bg-[var(--color-primary-light)] font-semibold text-[var(--color-primary)]' : 'hover:bg-gray-50 text-[var(--color-text)]',
                        ].join(' ')}
                      >
                        {label}
                        {value === selectedCity && <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    ))}
                </div>
              </MobileSection>
            )}

            {/* Property selector */}
            {properties && properties.length > 1 && (
              <MobileSection
                label="Property"
                value={selectedProperty?.name ?? 'Select property'}
                open={mobilePanel === 'property'}
                onToggle={() => { if (mobilePanel === 'property') setPropertySearch(''); toggleMobilePanel('property') }}
              >
                {visibleProperties.length > 10 && (
                  <input
                    type="text"
                    placeholder="Search properties…"
                    value={propertySearch}
                    onChange={e => setPropertySearch(e.target.value)}
                    className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
                  />
                )}
                <div className="space-y-1">
                  {visibleProperties
                    .filter(p => !propertySearch || p.name.toLowerCase().includes(propertySearch.toLowerCase()) || String(p.id).includes(propertySearch))
                    .map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setPropertySearch(''); setSelectedPropertyId(p.id); setMobilePanel(null) }}
                        className={[
                          'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                          p.id === effectivePropertyId ? 'bg-[var(--color-primary-light)] font-semibold text-[var(--color-primary)]' : 'hover:bg-gray-50 text-[var(--color-text)]',
                        ].join(' ')}
                      >
                        {p.name}
                        {p.id === effectivePropertyId && <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    ))}
                </div>
              </MobileSection>
            )}

            {/* Dates */}
            <MobileSection
              label="Dates"
              value={checkIn && checkOut
                ? `${displayDate(checkIn)} – ${displayDate(checkOut)}${nights > 0 ? ` (${nights} night${nights !== 1 ? 's' : ''})` : ''}`
                : 'Select dates'}
              open={mobilePanel === 'calendar'}
              onToggle={() => toggleMobilePanel('calendar')}
            >
              <CalendarDropdown
                checkIn={checkIn}
                checkOut={checkOut}
                initialField="checkin"
                onDatesChange={(ci, co) => { setCheckIn(ci); setCheckOut(co) }}
                onClose={() => setMobilePanel(null)}
                variant="inline"
                minNights={minNights}
                maxNights={maxNights}
              />
            </MobileSection>

            {/* Guests */}
            <MobileSection
              label="Guests"
              value={guestSummary}
              open={mobilePanel === 'guests'}
              onToggle={() => toggleMobilePanel('guests')}
            >
              <GuestsDropdown
                rooms={rooms}
                onChange={setRooms}
                infantMaxAge={infantMaxAge}
                childMaxAge={childMaxAge}
                minRooms={minRooms}
                maxRooms={maxRooms}
                groupsHref={groupsHref}
              />
            </MobileSection>

            {/* Nationality */}
            <MobileSection
              label="Nationality"
              value={nationalityLabel}
              open={mobilePanel === 'nationality'}
              onToggle={() => toggleMobilePanel('nationality')}
            >
              <NationalityDropdown
                value={nationality}
                onChange={(code) => { setNationality(code); setMobilePanel(null) }}
              />
            </MobileSection>

            {/* Promo code */}
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">Promo code</p>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5">
                <input
                  type="text"
                  placeholder="Enter promo code"
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value.toUpperCase())}
                  className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none"
                />
                {promoCode && (
                  <button onClick={() => setPromoCode('')} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">×</button>
                )}
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="shrink-0 border-t border-[var(--color-border)] p-4">
            <button
              onClick={() => { handleSearch(); setMobileDrawerOpen(false) }}
              disabled={nights <= 0}
              className="w-full rounded-xl bg-[var(--color-primary)] py-3.5 text-sm font-semibold text-white shadow transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Check availability
            </button>
          </div>
        </div>
      )}

      {/* ── Desktop panels (absolute-positioned) ─────────────────────── */}
      {activePanel === 'city' && cities.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
          {cities.length > 10 && (
            <div className="border-b border-[var(--color-border)] px-3 py-2">
              <input
                autoFocus
                type="text"
                value={citySearch}
                onChange={e => setCitySearch(e.target.value)}
                placeholder="Search cities…"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto">
            {[{ value: '', label: 'All' }, ...cities.map(c => ({ value: c, label: c }))]
              .filter(({ value, label }) => !citySearch || label === 'All' || label.toLowerCase().includes(citySearch.toLowerCase()))
              .map(({ value, label }) => (
                <button
                  key={value || '__all__'}
                  onClick={() => { handleCitySelect(value); setCitySearch('') }}
                  className={[
                    'flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--color-primary-light)]',
                    value === selectedCity ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-text)]',
                  ].join(' ')}
                >
                  <span>{label}</span>
                  {value === selectedCity && (
                    <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
          </div>
        </div>
      )}

      {activePanel === 'property' && visibleProperties && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
          {visibleProperties.length > 10 && (
            <div className="border-b border-[var(--color-border)] px-3 py-2">
              <input
                autoFocus
                type="text"
                value={propertySearch}
                onChange={e => setPropertySearch(e.target.value)}
                placeholder="Search by name or ID…"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto">
            {visibleProperties
              .filter(p => !propertySearch ||
                p.name.toLowerCase().includes(propertySearch.toLowerCase()) ||
                String(p.id).includes(propertySearch))
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPropertyId(p.id); setActivePanel(null); setPropertySearch('') }}
                  className={[
                    'flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--color-primary-light)]',
                    p.id === effectivePropertyId ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-text)]',
                  ].join(' ')}
                >
                  <span>{p.name}</span>
                  {p.id === effectivePropertyId && (
                    <svg className="h-4 w-4 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
          </div>
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
        <div
          ref={guestsPanelRef}
          className="absolute top-full z-50 mt-2"
          style={{ left: getSegmentLeft('guests') }}
        >
          <GuestsDropdown
            rooms={rooms}
            onChange={setRooms}
            infantMaxAge={infantMaxAge}
            childMaxAge={childMaxAge}
            minRooms={minRooms}
            maxRooms={maxRooms}
            groupsHref={groupsHref}
          />
        </div>
      )}

      {activePanel === 'nationality' && (
        <div
          className="absolute top-full z-50 mt-2"
          style={{ left: getSegmentLeft('nationality') }}
        >
          <NationalityDropdown
            value={nationality}
            onChange={handleNationalitySelect}
          />
        </div>
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

function SparkleIcon({ white }: { white?: boolean }) {
  const c1 = white ? 'white' : '#7c3aed'
  const c2 = white ? 'white' : '#3b82f6'
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 1 L10.5 6.5 L16 8 L10.5 9.5 L9 15 L7.5 9.5 L2 8 L7.5 6.5 Z" fill={c1} />
      <path d="M19 2 L19.9 4.6 L22.5 5.5 L19.9 6.4 L19 9 L18.1 6.4 L15.5 5.5 L18.1 4.6 Z" fill={c2} />
    </svg>
  )
}

const AI_GRADIENT = 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 40%, #ec4899 70%, #f97316 100%)'

function AiModeButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  if (active) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-primary-light)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-border)]"
        title="Exit AI Mode"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="5.5" cy="5.5" r="4" />
          <line x1="8.5" y1="8.5" x2="12" y2="12" />
        </svg>
        Standard
      </button>
    )
  }
  return (
    <div
      className="ai-mode-btn-wrap rounded-full p-[2px]"
      style={{ background: AI_GRADIENT }}
    >
      <button
        onClick={onClick}
        className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-white/90"
        title="Switch to AI Mode"
      >
        <span className="ai-spark-icon inline-flex">
          <SparkleIcon white={false} />
        </span>
        AI Mode
      </button>
    </div>
  )
}

function MobileSection({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string
  value: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-[var(--color-border)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
          <p className="truncate text-sm font-semibold text-[var(--color-text)]">{value}</p>
        </div>
        <svg
          className={['h-5 w-5 shrink-0 text-[var(--color-text-muted)] transition-transform', open ? 'rotate-180' : ''].join(' ')}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

