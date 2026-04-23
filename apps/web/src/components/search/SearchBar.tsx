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
import { useChat } from '@/components/conversational-search/use-chat'
import { SearchResultCards, BookingHandoffCard } from '@/components/conversational-search/room-cards'
import type { GuestChatMessage } from '@ibe/shared'
import type { SearchResult, BookingHandoff } from '@/components/conversational-search/types'

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
  aiEnabled?: boolean
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
  aiEnabled = false,
}: SearchBarProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  // ── AI Mode ──────────────────────────────────────────────────────────────────
  const [aiMode, setAiMode] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const aiInputRef = useRef<HTMLInputElement>(null)
  const aiThreadRef = useRef<HTMLDivElement>(null)
  const { messages: aiMessages, isLoading: aiLoading, send: aiSend, reset: aiReset } = useChat({ propertyId })

  useEffect(() => {
    if (aiMode) aiInputRef.current?.focus()
  }, [aiMode])

  useEffect(() => {
    aiThreadRef.current?.scrollTo({ top: aiThreadRef.current.scrollHeight, behavior: 'smooth' })
  }, [aiMessages, aiLoading])

  function handleAiSend() {
    const text = aiInput.trim()
    if (!text || aiLoading) return
    setAiInput('')
    void aiSend(text)
  }

  function handleAiKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleAiSend()
  }

  function toggleAiMode() {
    setAiMode(v => {
      if (v) aiReset()
      return !v
    })
  }

  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyId)

  // Derive unique cities and track selected city; '' means "All"
  const cities = showCitySelector && properties
    ? [...new Set(properties.map(p => p.city ?? '').filter(Boolean))].sort()
    : []
  const [selectedCity, setSelectedCity] = useState('')
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
      {/* Pill bar */}
      <div className={[
        'flex items-stretch overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-200',
        aiMode ? 'ring-2 ring-[var(--color-primary)]' : '',
      ].join(' ')}>
        {aiMode ? (
          /* ── AI Mode bar ──────────────────────────────────────────────────── */
          <>
            <div className="flex flex-1 items-center gap-2 px-4 py-3">
              <span className="shrink-0 text-[var(--color-primary)]">
                <SparkleIcon />
              </span>
              <input
                ref={aiInputRef}
                type="text"
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={handleAiKeyDown}
                placeholder="Ask about rooms, dates, availability…"
                disabled={aiLoading}
                className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none disabled:opacity-50"
              />
            </div>
            <div className="flex items-center gap-2 py-2 pl-1 pr-3">
              <button
                onClick={handleAiSend}
                disabled={aiLoading || !aiInput.trim()}
                className="whitespace-nowrap rounded-full bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-white shadow transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiLoading ? '…' : 'Ask'}
              </button>
              <AiModeButton active={aiMode} onClick={toggleAiMode} />
            </div>
          </>
        ) : (
          /* ── Standard bar ─────────────────────────────────────────────────── */
          <>
            {showCitySelector && cities.length > 1 && (
              <>
                <Segment
                  label="City"
                  value={selectedCity || 'All'}
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
            {aiEnabled && (
              <div className="flex items-center pr-3">
                <AiModeButton active={aiMode} onClick={toggleAiMode} />
              </div>
            )}
          </>
        )}
      </div>

      {/* AI chat thread — slides in below the bar when AI Mode is active */}
      {aiMode && aiMessages.length > 0 && (
        <div
          ref={aiThreadRef}
          className="mt-3 max-h-96 overflow-y-auto rounded-2xl bg-white shadow-2xl"
        >
          <div className="space-y-3 p-4">
            {aiMessages.map((msg, i) => (
              <AiMessageBubble key={i} msg={msg} />
            ))}
            {aiLoading && aiMessages[aiMessages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-[var(--color-border)] bg-gray-50 px-4 py-3">
                  <span className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-muted)]"
                        style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
          {[{ value: '', label: 'All' }, ...cities.map(c => ({ value: c, label: c }))].map(({ value, label }) => (
            <button
              key={value || '__all__'}
              onClick={() => handleCitySelect(value)}
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

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  )
}

function AiModeButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-200',
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-sm'
          : 'border-[var(--color-border)] bg-white text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
      ].join(' ')}
      title={active ? 'Exit AI Mode' : 'Switch to AI Mode'}
    >
      <SparkleIcon />
      AI Mode
    </button>
  )
}

function AiMessageBubble({ msg }: { msg: GuestChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={[
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
        isUser
          ? 'bg-[var(--color-primary)] text-white'
          : 'border border-[var(--color-border)] bg-gray-50 text-[var(--color-text)]',
      ].join(' ')}>
        {msg.content && <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>}
        {msg.toolResults?.map((tr, i) => {
          if (tr.tool === 'search_availability' || tr.tool === 'filter_results') {
            const data = tr.data as SearchResult & { error?: string }
            if (data.error) return <p key={i} className="mt-1 text-xs text-red-400">{data.error}</p>
            return <SearchResultCards key={i} data={data} />
          }
          if (tr.tool === 'prepare_booking') {
            return <BookingHandoffCard key={i} data={tr.data as BookingHandoff} />
          }
          return null
        })}
      </div>
    </div>
  )
}
