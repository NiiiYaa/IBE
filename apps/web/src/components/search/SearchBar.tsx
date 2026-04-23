'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
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
import { MarkdownContent } from '@/components/conversational-search/markdown-content'
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
  aiEnabled = false,
  orgId,
}: SearchBarProps) {
  const router = useRouter()
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
  const [aiMode, setAiMode] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const aiInputRef = useRef<HTMLInputElement>(null)
  const aiThreadRef = useRef<HTMLDivElement>(null)
  const { messages: aiMessages, isLoading: aiLoading, send: aiSend, reset: aiReset } = useChat({ propertyId, ...(orgId ? { orgId } : {}) })

  useEffect(() => {
    if (aiMode) aiInputRef.current?.focus()
  }, [aiMode])

  useEffect(() => {
    if (!aiThreadRef.current) return
    // Scroll internal content to top so newest messages are visible
    aiThreadRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    // Scroll page so bar reaches viewport top; thread ends up ~80px from top
    const rect = aiThreadRef.current.getBoundingClientRect()
    if (rect.top > 80) {
      window.scrollTo({ top: window.scrollY + rect.top - 80, behavior: 'smooth' })
    }
  }, [aiMessages, aiLoading])

  useEffect(() => {
    if (!aiLoading && aiMode && aiMessages.length > 0) aiInputRef.current?.focus()
  }, [aiLoading])

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
      else setShowPromo(false)
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
        aiMode ? 'ring-2 ring-violet-400' : '',
      ].join(' ')}>
        {aiMode ? (
          /* ── AI Mode bar ──────────────────────────────────────────────────── */
          <>
            <div className="flex flex-1 items-center gap-2 px-4 py-2">
              <span className="shrink-0">
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
                className="whitespace-nowrap rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
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

            <div className="flex shrink-0 flex-col items-center justify-center px-4 py-2">
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
            <div className="flex items-center gap-2 py-2 pl-1 pr-3">
              <button
                ref={checkBtnRef}
                onClick={handleSearch}
                disabled={nights <= 0}
                className="whitespace-nowrap rounded-full bg-[var(--color-primary)] px-7 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Check availability
              </button>
              {aiEnabled && <AiModeButton active={aiMode} onClick={toggleAiMode} />}
            </div>
          </>
        )}
      </div>

      {/* AI chat thread — slides in below the bar when AI Mode is active */}
      {aiMode && aiMessages.length > 0 && (
        <div
          ref={aiThreadRef}
          className="mt-3 max-h-[calc(100vh-120px)] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        >
          <div className="space-y-3 p-4">
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
            {(() => {
              const pairs: (typeof aiMessages[number])[][] = []
              for (let i = 0; i < aiMessages.length; i += 2) pairs.push(aiMessages.slice(i, i + 2))
              return pairs.reverse().flat().map((msg, i) => <AiMessageBubble key={i} msg={msg} {...(selectedPropertyId ? { fallbackPropertyId: selectedPropertyId } : {})} />)
            })()}
          </div>
        </div>
      )}

      {/* Promo toggle + input — outside pill, centered below check button */}
      {!aiMode && (
      <div
        className="absolute top-full z-10 mt-2 flex -translate-x-1/2 flex-col items-center gap-1.5"
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
}: {
  label: string
  value: string
  active: boolean
  onClick: () => void
  panelId?: string
}) {
  return (
    <button
      onClick={onClick}
      data-segment={panelId}
      className={[
        'flex min-w-0 flex-1 flex-col items-start justify-center px-4 py-2 transition-colors',
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
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1 L7.8 5.2 L12 6 L7.8 6.8 L7 11 L6.2 6.8 L2 6 L6.2 5.2 Z"
        fill={white ? 'white' : 'url(#ai-spark-grad)'}
      />
      <circle cx="11.2" cy="2.8" r="1.1" fill={white ? 'white' : '#a78bfa'} />
      <defs>
        <linearGradient id="ai-spark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const AI_GRADIENT = 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 40%, #ec4899 70%, #f97316 100%)'

function AiModeButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  if (active) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-primary-light)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-border)]"
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
      className="rounded-full p-[2px] transition-all duration-200"
      style={{ background: AI_GRADIENT }}
    >
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition-all duration-200 hover:bg-white/90"
        title="Switch to AI Mode"
      >
        <SparkleIcon white={false} />
        AI Mode
      </button>
    </div>
  )
}

function AiMessageBubble({ msg, fallbackPropertyId }: { msg: GuestChatMessage; fallbackPropertyId?: number }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={[
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
        isUser
          ? 'bg-[var(--color-primary)] text-white'
          : 'border border-[var(--color-border)] bg-gray-50 text-[var(--color-text)]',
      ].join(' ')}>
        {msg.content && (
          isUser
            ? <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            : <div className="text-sm"><MarkdownContent content={msg.content} /></div>
        )}
        {msg.toolResults?.map((tr, i) => {
          if (tr.tool === 'search_availability' || tr.tool === 'filter_results') {
            const data = tr.data as SearchResult & { error?: string }
            if (data.error) return <p key={i} className="mt-1 text-xs text-red-400">{data.error}</p>
            return <SearchResultCards key={i} data={data} {...(fallbackPropertyId ? { fallbackPropertyId } : {})} />
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
