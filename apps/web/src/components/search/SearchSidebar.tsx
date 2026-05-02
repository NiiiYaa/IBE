'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { addDays, todayIso, nightsBetween } from '@ibe/shared'
import { encodeSearchParams } from '@/lib/search-params'
import { displayDate } from '@/lib/calendar-utils'
import { COUNTRIES, countryFlag } from '@/lib/countries'
import { useCountryDetect } from '@/hooks/use-country-detect'
import { useOffersConstraints } from '@/hooks/use-offers-constraints'
import { usePublicGroupConfig } from '@/hooks/use-public-group-config'
import { CalendarDropdown } from './CalendarDropdown'
import { useT, useLocale } from '@/context/translations'

interface GuestRoom {
  adults: number
  children: number
  infants: number
}

interface SearchSidebarProps {
  propertyId: number
  initialCheckIn?: string
  initialCheckOut?: string
  initialRooms?: GuestRoom[]
  initialNationality?: string | undefined
  infantMaxAge?: number
  childMaxAge?: number
  isCollapsed?: boolean
  onToggle?: () => void
  aiEnabled?: boolean
  onAiToggle?: () => void
}

const MAX_CHILDREN_PER_ROOM = 6

function repAge(lo: number, hi: number) {
  return Math.round((lo + hi) / 2)
}

function roomSummary(room: GuestRoom): string {
  const parts: string[] = [`${room.adults} Adult${room.adults !== 1 ? 's' : ''}`]
  if (room.children > 0) parts.push(`${room.children} Child${room.children !== 1 ? 'ren' : ''}`)
  if (room.infants > 0) parts.push(`${room.infants} Infant${room.infants !== 1 ? 's' : ''}`)
  return parts.join(' · ')
}

function compactDate(iso: string, locale: string): string {
  if (!iso) return '—'
  const parts = iso.split('-').map(Number)
  if (parts.length < 3) return '—'
  const [year, month, day] = parts as [number, number, number]
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(year, month - 1, day))
}

export function SearchSidebar({
  propertyId,
  initialCheckIn,
  initialCheckOut,
  initialRooms,
  initialNationality,
  infantMaxAge = 2,
  childMaxAge = 16,
  isCollapsed = false,
  onToggle,
  aiEnabled = false,
  onAiToggle,
}: SearchSidebarProps) {
  const t = useT('search')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const pageSearchParams = useSearchParams()
  const containerRef = useRef<HTMLDivElement>(null)

  const [checkIn,  setCheckIn]  = useState(initialCheckIn  ?? '')
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? '')
  const [rooms, setRooms] = useState<GuestRoom[]>(
    initialRooms ?? [{ adults: 2, children: 0, infants: 0 }],
  )
  const [nationality, setNationality] = useState(initialNationality ?? '')
  const [promoCode, setPromoCode] = useState('')
  const [showPromo, setShowPromo] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarInitialField, setCalendarInitialField] = useState<'checkin' | 'checkout'>('checkin')
  const [expandedRooms, setExpandedRooms] = useState<Set<number>>(new Set())

  const { minNights, maxNights, minRooms, maxRooms } = useOffersConstraints(propertyId)
  const { data: groupConfig } = usePublicGroupConfig(propertyId)
  const groupsHref = groupConfig?.enabled
    ? `/groups?hotelId=${propertyId}&returnTo=${encodeURIComponent(pageSearchParams.toString() ? `${pathname}?${pageSearchParams.toString()}` : pathname)}`
    : undefined

  const detectedCountry = useCountryDetect()
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
    if (!calendarOpen) return
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setCalendarOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [calendarOpen])

  function openCalendar(field: 'checkin' | 'checkout') {
    setCalendarInitialField(field)
    setCalendarOpen(prev => !(prev && calendarInitialField === field))
  }

  function toggleRoom(i: number) {
    setExpandedRooms(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const nights = nightsBetween(checkIn, checkOut)

  function updateRoom(i: number, field: keyof GuestRoom, value: number) {
    setRooms(prev =>
      prev.map((r, idx) => {
        if (idx !== i) return r
        const next = { ...r, [field]: value }
        next.adults = Math.min(9, Math.max(1, next.adults))
        next.children = Math.min(MAX_CHILDREN_PER_ROOM, Math.max(0, next.children))
        next.infants = Math.min(MAX_CHILDREN_PER_ROOM, Math.max(0, next.infants))
        if (next.children + next.infants > MAX_CHILDREN_PER_ROOM) {
          if (field === 'children') next.infants = MAX_CHILDREN_PER_ROOM - next.children
          else next.children = MAX_CHILDREN_PER_ROOM - next.infants
        }
        return next
      }),
    )
  }

  function addRoom() {
    if (rooms.length >= maxRooms) return
    const newIdx = rooms.length
    setRooms(prev => [...prev, { adults: 2, children: 0, infants: 0 }])
    setExpandedRooms(prev => new Set([...prev, newIdx]))
  }

  function removeRoom(i: number) {
    if (rooms.length <= minRooms) return
    setRooms(prev => prev.filter((_, idx) => idx !== i))
    setExpandedRooms(prev => {
      const next = new Set<number>()
      prev.forEach(idx => {
        if (idx < i) next.add(idx)
        else if (idx > i) next.add(idx - 1)
      })
      return next
    })
  }

  function handleSearch() {
    if (nights <= 0) return
    const childRep = repAge(infantMaxAge + 1, childMaxAge)
    const infantRep = repAge(0, infantMaxAge)
    const qs = encodeSearchParams({
      hotelId: propertyId,
      checkIn,
      checkOut,
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

  // ── Collapsed strip ───────────────────────────────────────────────────────────
  if (isCollapsed) {
    return (
      <div className="sticky top-20 flex flex-col items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-card overflow-hidden">
        {/* Toggle button */}
        <button
          onClick={onToggle}
          title="Expand search panel"
          className="flex w-full flex-col items-center gap-1 px-2 py-3 text-primary hover:bg-[var(--color-primary-light)] transition-colors"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted" style={{ writingMode: 'vertical-rl' }}>
            Search
          </span>
        </button>

        {/* Date summary */}
        {checkIn && checkOut && (
          <div className="flex flex-col items-center gap-0.5 pb-3 text-center">
            <span className="text-xs font-bold text-[var(--color-text)]">{compactDate(checkIn, locale)}</span>
            <svg className="h-3 w-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span className="text-xs font-bold text-[var(--color-text)]">{compactDate(checkOut, locale)}</span>
            {nights > 0 && (
              <span className="mt-0.5 text-[10px] font-semibold text-primary">{nights}n</span>
            )}
          </div>
        )}

        {/* AI toggle */}
        {aiEnabled && onAiToggle && (
          <button
            onClick={onAiToggle}
            title="Switch to AI mode"
            className="ai-mode-btn-wrap flex w-full flex-col items-center gap-1 border-t border-[var(--color-border)] px-2 py-3 text-primary hover:bg-[var(--color-primary-light)] transition-colors"
          >
            <span className="ai-spark-icon inline-flex"><AiSparkleIcon className="h-5 w-5" /></span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted" style={{ writingMode: 'vertical-rl' }}>AI</span>
          </button>
        )}
      </div>
    )
  }

  // ── Full panel ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="sticky top-20 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-card overflow-hidden" style={{ maxHeight: 'calc(100vh - 5.5rem)' }}>
      {/* Header with collapse toggle */}
      <div className="flex items-center justify-between bg-primary px-5 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/70">{t('bookDirectly')}</p>
          <p className="text-base font-semibold text-white">{t('checkAvailability')}</p>
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            title="Collapse search panel"
            className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      <div className="overflow-y-auto p-5 space-y-4" style={{ maxHeight: 'calc(100vh - 9.5rem)' }}>

        {/* Dates + calendar inline */}
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                {t('checkIn')}
              </label>
              <button
                onClick={() => openCalendar('checkin')}
                className={[
                  'w-full rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors',
                  calendarOpen && calendarInitialField === 'checkin'
                    ? 'border-primary bg-[var(--color-primary-light)] text-primary'
                    : 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)] hover:border-primary',
                ].join(' ')}
              >
                {displayDate(checkIn) || t('selectDate')}
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                {t('checkOut')}
              </label>
              <button
                onClick={() => openCalendar('checkout')}
                className={[
                  'w-full rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors',
                  calendarOpen && calendarInitialField === 'checkout'
                    ? 'border-primary bg-[var(--color-primary-light)] text-primary'
                    : 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)] hover:border-primary',
                ].join(' ')}
              >
                {displayDate(checkOut) || t('selectDate')}
              </button>
            </div>
          </div>

          {nights > 0 && (
            <p className="mt-2 text-center text-xs text-muted">
              <span className="font-semibold text-primary">{nights}</span> night{nights !== 1 ? 's' : ''}
            </p>
          )}

          {calendarOpen && (
            <div className="mt-3">
              <CalendarDropdown
                checkIn={checkIn}
                checkOut={checkOut}
                initialField={calendarInitialField}
                onDatesChange={(ci, co) => { setCheckIn(ci); setCheckOut(co) }}
                onClose={() => setCalendarOpen(false)}
                variant="inline"
                minNights={minNights}
                maxNights={maxNights}
              />
            </div>
          )}
        </div>

        {/* Rooms & Guests */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            {t('roomsAndGuests')}
          </label>

          {rooms.map((room, i) => {
            const isExpanded = expandedRooms.has(i)
            return (
              <div key={i} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] overflow-hidden">
                <button
                  onClick={() => toggleRoom(i)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-primary-light)]"
                >
                  <div>
                    <p className="text-xs font-semibold text-muted">{t('roomNumber', { number: String(i + 1) })}</p>
                    <p className="text-sm font-medium text-[var(--color-text)]">{roomSummary(room)}</p>
                  </div>
                  <svg
                    className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-[var(--color-border)] px-3 py-3 space-y-2">
                    <GuestCounter
                      label={t('adults')}
                      hint={`Age ${childMaxAge + 1}+`}
                      value={room.adults}
                      min={1} max={9}
                      onChange={v => updateRoom(i, 'adults', v)}
                    />
                    <GuestCounter
                      label={t('children')}
                      hint={`Age ${infantMaxAge + 1}–${childMaxAge}`}
                      value={room.children}
                      min={0} max={MAX_CHILDREN_PER_ROOM}
                      onChange={v => updateRoom(i, 'children', v)}
                    />
                    <GuestCounter
                      label={t('infants')}
                      hint={`Age 0–${infantMaxAge}`}
                      value={room.infants}
                      min={0} max={MAX_CHILDREN_PER_ROOM}
                      onChange={v => updateRoom(i, 'infants', v)}
                    />
                    {rooms.length > minRooms && (
                      <button
                        onClick={() => removeRoom(i)}
                        className="pt-1 text-xs text-error hover:underline"
                      >
                        {t('removeRoom')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {rooms.length < maxRooms && (
            <button
              onClick={addRoom}
              className="w-full rounded-lg border border-dashed border-[var(--color-border)] py-2 text-xs font-medium text-primary transition-colors hover:border-primary hover:bg-[var(--color-primary-light)]"
            >
              + {t('addAnotherRoom')}
            </button>
          )}
          {rooms.length >= maxRooms && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {t('tooManyRooms', { max: String(maxRooms) })}{' '}
              {groupsHref ? (
                <a
                  href={groupsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--color-primary)] hover:underline"
                >
                  {t('goToGroupSection')}
                </a>
              ) : (
                t('contactHotel')
              )}
            </p>
          )}
        </div>

        {/* Nationality */}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            {t('nationality')}
          </label>
          <select
            value={nationality}
            onChange={e => setNationality(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
          >
            <option value="">{t('selectCountry')}</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>
                {countryFlag(c.code)} {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Promo code */}
        <div>
          <button
            onClick={() => setShowPromo(v => !v)}
            className="text-xs text-primary hover:underline"
          >
            {showPromo ? `− ${t('hidePromoCode')}` : `+ ${t('havePromoCode')}`}
          </button>
          {showPromo && (
            <input
              type="text"
              placeholder={t('enterPromoCode')}
              value={promoCode}
              onChange={e => setPromoCode(e.target.value.toUpperCase())}
              className="mt-2 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm uppercase tracking-wider"
            />
          )}
        </div>

        {/* CTA */}
        <button
          onClick={handleSearch}
          disabled={nights <= 0}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {nights > 0 ? `${t('search')} — ${nights} night${nights !== 1 ? 's' : ''}` : t('checkAvailability')}
        </button>

        {/* AI mode button */}
        {aiEnabled && onAiToggle && (
          <button
            onClick={onAiToggle}
            className="ai-mode-btn-wrap flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-[var(--color-primary-light)]"
          >
            <span className="ai-spark-icon inline-flex"><AiSparkleIcon className="h-4 w-4" /></span>
            {t('askAI')}
          </button>
        )}
      </div>
    </div>
  )
}

function AiSparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5 L13.3 10.7 L21.5 12 L13.3 13.3 L12 21.5 L10.7 13.3 L2.5 12 L10.7 10.7 Z" />
      <path d="M19 2 L19.7 5.3 L23 6 L19.7 6.7 L19 10 L18.3 6.7 L15 6 L18.3 5.3 Z" />
    </svg>
  )
}

function GuestCounter({
  label, hint, value, min, max, onChange,
}: {
  label: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-medium text-[var(--color-text)]">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-sm font-medium transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>
        <span className="w-4 text-center text-sm font-semibold">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-sm font-medium transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  )
}
