'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { countryFlag, countryName } from '@/lib/countries'
import { todayIso, addDays, nightsBetween } from '@ibe/shared'
import { displayDate } from '@/lib/calendar-utils'
import { useLocale, useT } from '@/context/translations'
import { CalendarDropdown } from '@/components/search/CalendarDropdown'
import { NationalityDropdown } from '@/components/search/NationalityDropdown'
import { useCountryDetect } from '@/hooks/use-country-detect'
import { BoardType } from '@ibe/shared'
import type { RoomOption, RateOption, GroupInquiryRequest, GroupRatePriorityItem, PublicGroupConfig } from '@ibe/shared'
import { DEFAULT_RATE_PRIORITY } from '@ibe/shared'

const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]'
const numInputCls = 'w-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-center text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed'

function fmtAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
}

function addDaysToDate(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function fmtDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function isGroupRate(rate: RateOption): boolean {
  return /\bgroups?\b/i.test(rate.ratePlanName)
}

function filterRates(rates: RateOption[], cfg: PublicGroupConfig | undefined): RateOption[] {
  if (!cfg || cfg.rateSelection !== 'group_only') return rates
  const filtered = rates.filter(isGroupRate)
  return filtered.length > 0 ? filtered : rates  // fallback to all if none match
}

function pickRate(room: RoomOption, cfg?: PublicGroupConfig): RateOption | undefined {
  const priority: GroupRatePriorityItem[] = cfg?.ratePriority ?? DEFAULT_RATE_PRIORITY
  const eligible = filterRates(room.rates, cfg)
  for (const p of priority) {
    const match = eligible.find(x => x.board === p.board && x.isRefundable === p.isRefundable)
    if (match) return match
  }
  return eligible[0]
}

function applyGroupPrice(base: number, direction: 'increase' | 'decrease', pct: number): number {
  const m = direction === 'increase' ? 1 + pct / 100 : 1 - pct / 100
  return Math.round(base * m * 100) / 100
}

// ── Pill-bar sub-components (same as SearchBar) ───────────────────────────────

function Segment({ label, value, active, onClick, panelId }: {
  label: string; value: string; active: boolean; onClick: () => void; panelId?: string
}) {
  return (
    <button
      onClick={onClick}
      data-segment={panelId}
      className={[
        'flex min-w-0 flex-1 flex-col items-start justify-center px-6 py-4 transition-colors',
        active ? 'bg-[var(--color-primary-light)]' : 'hover:bg-gray-50',
      ].join(' ')}
    >
      <span className="mb-0.5 whitespace-nowrap text-xs font-medium leading-none text-[var(--color-text-muted)]">{label}</span>
      <span className="block w-full truncate text-sm font-semibold text-[var(--color-text)]" title={value}>{value}</span>
    </button>
  )
}

function Divider() {
  return <div className="my-4 w-px shrink-0 bg-[var(--color-border)]" />
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const tGroups = useT('groups')
  const steps = [tGroups('step1'), tGroups('step2'), tGroups('step3')]
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <div key={n} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div className={['flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                active ? 'bg-[var(--color-primary)] text-white'
                  : done ? 'bg-[var(--color-success)] text-white'
                    : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'].join(' ')}>
                {done ? '✓' : n}
              </div>
              <span className={['hidden sm:inline text-xs font-medium', active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'].join(' ')}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={['mx-2 sm:mx-3 h-px w-6 sm:w-8', done ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'].join(' ')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type ActivePanel = 'calendar' | 'nationality' | null
type MealType = 'breakfast' | 'lunch' | 'dinner'
type MealSelection = { selected: boolean; adults: number; children: number; infants: number }


export function GroupsContent({ propertyId, returnTo, orgId }: { propertyId: number; returnTo?: string; orgId?: number }) {
  const today = todayIso()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [checkIn, setCheckIn] = useState(addDays(today, 1))
  const [checkOut, setCheckOut] = useState(addDays(today, 3))
  const [nationality, setNationality] = useState('')
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [calendarInitialField, setCalendarInitialField] = useState<'checkin' | 'checkout'>('checkin')
  const [selections, setSelections] = useState<Record<number, number>>({})
  const [searchTriggered, setSearchTriggered] = useState(false)

  const [mealSelections, setMealSelections] = useState<Record<MealType, MealSelection>>({
    breakfast: { selected: false, adults: 0, children: 0, infants: 0 },
    lunch: { selected: false, adults: 0, children: 0, infants: 0 },
    dinner: { selected: false, adults: 0, children: 0, infants: 0 },
  })
  const [meetingRoomSelected, setMeetingRoomSelected] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const detectedCountry = useCountryDetect()
  const locale = useLocale()
  const t = useT('search')
  const tGroups = useT('groups')
  const MEAL_LABELS: Record<MealType, string> = { breakfast: tGroups('breakfast'), lunch: tGroups('lunch'), dinner: tGroups('dinner') }

  useEffect(() => {
    if (detectedCountry && !nationality) setNationality(detectedCountry)
  }, [detectedCountry])

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

  function getSegmentLeft(panelId: string): number {
    const button = containerRef.current?.querySelector(`[data-segment="${panelId}"]`)
    if (!button || !containerRef.current) return 0
    const rect = button.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    return rect.left - containerRect.left
  }

  function openCalendar(field: 'checkin' | 'checkout') {
    setCalendarInitialField(field)
    setActivePanel(prev => (prev === 'calendar' && calendarInitialField === field ? null : 'calendar'))
  }

  // Contact form
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const nights = nightsBetween(checkIn, checkOut)

  // ── Fetch public groups config ────────────────────────────────────────────
  const { data: groupCfg, isLoading: cfgLoading } = useQuery({
    queryKey: ['public-group-config', propertyId, orgId],
    queryFn: () => apiClient.getPublicGroupConfig(propertyId, orgId),
    enabled: !!propertyId,
  })

  // ── Search ────────────────────────────────────────────────────────────────
  const searchParams = new URLSearchParams({
    hotelId: String(propertyId),
    checkIn,
    checkOut,
    adults: '1',
    ...(nationality ? { nationality } : {}),
  })

  const { data: searchData, isFetching: searching, error: searchError, refetch: doSearch } = useQuery({
    queryKey: ['groups-search', propertyId, checkIn, checkOut, nationality],
    queryFn: () => apiClient.search(searchParams),
    enabled: false,
  })

  function handleSearch() {
    if (!checkIn || !checkOut || checkOut <= checkIn) return
    setSearchTriggered(true)
    void doSearch()
    setSelections({})
  }

  useEffect(() => {
    if (searchTriggered && searchData) {
      setStep(2)
    }
  }, [searchTriggered, searchData])

  // ── Compute selections ────────────────────────────────────────────────────
  const rooms: RoomOption[] = searchData?.results[0]?.rooms ?? []
  const showChildren = rooms.some(r => r.maxChildren > 0)

  const currency = rooms[0]?.rates[0]?.prices.sell.currency ?? 'USD'

  function groupPrice(room: RoomOption): number {
    const base = pickRate(room, groupCfg ?? undefined)?.prices.sell.amount ?? 0
    if (!groupCfg) return base
    return applyGroupPrice(base, groupCfg.pricingDirection, groupCfg.pricingPct)
  }

  function roomTotal(room: RoomOption): number {
    return groupPrice(room) * (selections[room.roomId] ?? 0)
  }

  const roomsSubtotal = rooms.reduce((s, r) => s + roomTotal(r), 0)
  const hasSelections = Object.values(selections).some(q => q > 0)

  function mealCost(type: MealType): number {
    if (!groupCfg) return 0
    const cfg = groupCfg.mealsConfig[type]
    if (!cfg.enabled) return 0
    const sel = mealSelections[type]
    if (!sel.selected) return 0
    return (sel.adults * cfg.priceAdult + sel.children * cfg.priceChild + sel.infants * cfg.priceInfant) * nights
  }

  const totalMealCost = (['breakfast', 'lunch', 'dinner'] as MealType[]).reduce((s, t) => s + mealCost(t), 0)
  const meetingRoomCost = (meetingRoomSelected && groupCfg?.meetingRoomConfig?.enabled)
    ? groupCfg.meetingRoomConfig.pricePerDay * nights
    : 0

  const grandTotal = roomsSubtotal + totalMealCost + meetingRoomCost

  // ── Inquiry submit ────────────────────────────────────────────────────────
  const inquiryMut = useMutation({
    mutationFn: (data: GroupInquiryRequest) => apiClient.submitGroupInquiry(data),
    onSuccess: () => setSubmitted(true),
    onError: (e: Error) => setSubmitError(e.message),
  })

  function handleSubmitInquiry() {
    if (!contactName || !contactEmail || !groupCfg) return
    const selectedRooms = rooms.filter(r => (selections[r.roomId] ?? 0) > 0)

    const selectedMeals: GroupInquiryRequest['meals'] = (['breakfast', 'lunch', 'dinner'] as MealType[])
      .filter(t => groupCfg.mealsConfig[t].enabled && mealSelections[t].selected)
      .map(t => {
        const cfg = groupCfg.mealsConfig[t]
        const sel = mealSelections[t]
        return {
          type: t,
          adults: sel.adults,
          children: sel.children,
          infants: sel.infants,
          priceAdult: cfg.priceAdult,
          priceChild: cfg.priceChild,
          priceInfant: cfg.priceInfant,
          nights,
          totalAmount: mealCost(t),
        }
      })

    const payload: GroupInquiryRequest = {
      propertyId,
      checkIn,
      checkOut,
      nationality,
      contactName,
      contactEmail,
      ...(contactPhone ? { contactPhone } : {}),
      ...(message ? { message } : {}),
      rooms: selectedRooms.map(r => ({
        roomId: r.roomId,
        roomName: r.roomName,
        roomTypeCode: r.roomTypeCode,
        quantity: selections[r.roomId] ?? 0,
        unitPrice: groupPrice(r),
        nights,
        totalAmount: roomTotal(r),
      })),
      ...(selectedMeals && selectedMeals.length > 0 ? { meals: selectedMeals } : {}),
      ...(meetingRoomSelected && groupCfg.meetingRoomConfig.enabled ? {
        meetingRoom: {
          pricePerDay: groupCfg.meetingRoomConfig.pricePerDay,
          nights,
          totalAmount: meetingRoomCost,
        }
      } : {}),
      totalAmount: grandTotal,
      currency,
    }
    inquiryMut.mutate(payload)
  }

  // ── Handle online booking — redirect to search with dates ─────────────────
  function handleOnlineBook() {
    const qs = new URLSearchParams({ hotelId: String(propertyId), checkIn, checkOut, adults: '1', nationality })
    window.location.href = `/search?${qs.toString()}`
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (cfgLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="h-64 animate-pulse rounded-xl bg-[var(--color-border)]" />
      </main>
    )
  }

  if (!groupCfg?.enabled) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-center">
        <p className="text-lg text-[var(--color-text-muted)]">{tGroups('groupBookingsNotAvailable')}</p>
      </main>
    )
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-success)]/10">
            <svg className="h-7 w-7 text-[var(--color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">{tGroups('inquirySubmitted')}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {tGroups('thankYouMessage', { name: contactName })}
          </p>
          <button onClick={() => { setSubmitted(false); setStep(1); setSelections({}) }}
            className="mt-6 rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-background)]">
            {tGroups('submitAnotherInquiry')}
          </button>
        </div>
      </main>
    )
  }

  const nationalityLabel = nationality
    ? `${countryFlag(nationality)} ${countryName(nationality)}`
    : tGroups('selectCountry')

  const enabledMeals = (['breakfast', 'lunch', 'dinner'] as MealType[]).filter(t => groupCfg.mealsConfig[t].enabled)

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">{tGroups('groupBooking')}</h1>
          {returnTo && (
            <a
              href={returnTo}
              className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {tGroups('backToFit')}
            </a>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {tGroups('specialRates')}
        </p>
      </div>

      <div className="mb-8">
        <StepIndicator step={step} />
      </div>

      {/* ── Step 1: Search ──────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Pill bar — desktop */}
          <div ref={containerRef} className="relative mx-auto w-full">
            <div className="hidden sm:flex items-stretch overflow-hidden rounded-2xl bg-white shadow-2xl">
              <Segment
                label={t('checkIn')}
                value={displayDate(checkIn, locale) || t('selectDates')}
                active={activePanel === 'calendar' && calendarInitialField === 'checkin'}
                onClick={() => openCalendar('checkin')}
              />
              <Divider />
              <Segment
                label={t('checkOut')}
                value={displayDate(checkOut, locale) || t('selectDates')}
                active={activePanel === 'calendar' && calendarInitialField === 'checkout'}
                onClick={() => openCalendar('checkout')}
              />
              <Divider />
              <div className="flex shrink-0 flex-col items-center justify-center px-6 py-4">
                <span className="mb-0.5 text-xs font-medium leading-none text-[var(--color-text-muted)]">{t('nightsLabel')}</span>
                <span className="text-sm font-semibold text-[var(--color-text)]">{nights > 0 ? nights : '—'}</span>
              </div>
              <Divider />
              <Segment
                label={t('nationality')}
                value={nationalityLabel}
                active={activePanel === 'nationality'}
                onClick={() => setActivePanel(p => p === 'nationality' ? null : 'nationality')}
                panelId="nationality"
              />
              <div className="flex items-center py-3 pl-2 pr-4">
                <button
                  onClick={handleSearch}
                  disabled={searching || nights <= 0}
                  className="whitespace-nowrap rounded-full bg-[var(--color-primary)] px-8 py-3 text-sm font-semibold text-white shadow transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {searching ? tGroups('searching') : tGroups('checkAvailability')}
                </button>
              </div>
            </div>

            {/* Mobile summary card */}
            <div className="sm:hidden flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 shadow-2xl">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-xs font-medium text-[var(--color-text-muted)]">
                  {checkIn && checkOut
                    ? `${displayDate(checkIn, locale)} – ${displayDate(checkOut, locale)}${nights > 0 ? ` · ${tGroups('nightCount', { count: String(nights) })}` : ''}`
                    : tGroups('selectDates')}
                </p>
                <p className="truncate text-sm font-semibold text-[var(--color-text)]">{nationalityLabel}</p>
              </div>
              <button
                onClick={handleSearch}
                disabled={searching || nights <= 0}
                className="shrink-0 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
              >
                {searching ? '…' : tGroups('search')}
              </button>
            </div>

            {/* Mobile inline editors */}
            <div className="sm:hidden mt-3 space-y-2">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className={labelCls}>{tGroups('dates')}</p>
                <CalendarDropdown
                  checkIn={checkIn}
                  checkOut={checkOut}
                  initialField="checkin"
                  onDatesChange={(ci, co) => { setCheckIn(ci); setCheckOut(co) }}
                  onClose={() => {}}
                  variant="inline"
                  minNights={1}
                />
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className={labelCls}>{tGroups('nationality')}</p>
                <NationalityDropdown value={nationality} onChange={setNationality} />
              </div>
            </div>

            {/* Desktop dropdown panels */}
            {activePanel === 'calendar' && (
              <CalendarDropdown
                checkIn={checkIn}
                checkOut={checkOut}
                initialField={calendarInitialField}
                onDatesChange={(ci, co) => { setCheckIn(ci); setCheckOut(co) }}
                onClose={() => setActivePanel(null)}
                minNights={1}
              />
            )}
            {activePanel === 'nationality' && (
              <div
                className="absolute top-full z-50 mt-2"
                style={{ left: getSegmentLeft('nationality') }}
              >
                <NationalityDropdown
                  value={nationality}
                  onChange={(code) => { setNationality(code); setActivePanel(null) }}
                />
              </div>
            )}
          </div>

          {searchError && (
            <p className="text-sm text-[var(--color-error)]">{tGroups('searchError')}</p>
          )}
        </div>
      )}

      {/* ── Step 2: Room selection ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">
                {displayDate(checkIn, locale)} → {displayDate(checkOut, locale)} · {tGroups('nightCount', { count: String(nights) })}
                <span className="hidden sm:inline"> · {countryName(nationality)}</span>
              </p>
            </div>
            <button onClick={() => { setStep(1); setSelections({}) }}
              className="text-sm text-[var(--color-text-muted)] underline-offset-2 hover:underline">
              {tGroups('editSearch')}
            </button>
          </div>

          {rooms.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">{tGroups('noRoomsAvailable')}</p>
            </div>
          ) : (
            <>
              {/* Rooms sub-section */}
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('rooms')}</h3>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-hidden rounded-xl border border-[var(--color-border)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-background)]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('roomType')}</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('adults')}</th>
                        {showChildren && <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('children')}</th>}
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('max')}</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('available')}</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('groupRatePerRoom')}</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('quantity')}</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('total')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {rooms.map(room => {
                        const gp = groupPrice(room)
                        const qty = selections[room.roomId] ?? 0
                        const total = gp * qty
                        return (
                          <tr key={room.roomId} className="bg-[var(--color-surface)]">
                            <td className="px-4 py-3 font-medium text-[var(--color-text)]">{room.roomName}</td>
                            <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{room.maxAdults}</td>
                            {showChildren && <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{room.maxChildren || '—'}</td>}
                            <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{room.maxOccupancy}</td>
                            <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{room.availableCount}</td>
                            <td className="px-4 py-3 text-right text-[var(--color-text)]">
                              {fmtAmount(gp, currency)}
                              <span className="ml-1 text-xs text-[var(--color-text-muted)]">/ {nights}n</span>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                className="mx-auto block w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-center text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                value={qty}
                                onChange={e => setSelections(prev => ({ ...prev, [room.roomId]: parseInt(e.target.value) }))}
                              >
                                {Array.from({ length: room.availableCount + 1 }, (_, i) => (
                                  <option key={i} value={i}>{i}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-[var(--color-text)]">
                              {qty > 0 ? fmtAmount(total, currency) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {rooms.map(room => {
                    const gp = groupPrice(room)
                    const qty = selections[room.roomId] ?? 0
                    return (
                      <div key={room.roomId} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <p className="font-semibold text-[var(--color-text)]">{room.roomName}</p>
                          <p className="shrink-0 text-sm font-bold text-[var(--color-primary)]">{fmtAmount(gp, currency)}<span className="text-xs font-normal text-[var(--color-text-muted)]"> / {nights}n</span></p>
                        </div>
                        <div className="mb-4 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
                          <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5">👤 {tGroups('adults')}: {room.maxAdults}</span>
                          {showChildren && room.maxChildren > 0 && <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5">👶 {tGroups('children')}: {room.maxChildren}</span>}
                          <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5">{tGroups('max')}: {room.maxOccupancy}</span>
                          <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5">{tGroups('available')}: {room.availableCount}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setSelections(prev => ({ ...prev, [room.roomId]: Math.max(0, (prev[room.roomId] ?? 0) - 1) }))}
                              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] text-lg font-medium text-[var(--color-text)] hover:bg-[var(--color-background)] disabled:opacity-30"
                              disabled={qty === 0}
                            >−</button>
                            <span className="w-6 text-center text-base font-semibold text-[var(--color-text)]">{qty}</span>
                            <button
                              onClick={() => setSelections(prev => ({ ...prev, [room.roomId]: Math.min(room.availableCount, (prev[room.roomId] ?? 0) + 1) }))}
                              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] text-lg font-medium text-[var(--color-text)] hover:bg-[var(--color-background)] disabled:opacity-30"
                              disabled={qty >= room.availableCount}
                            >+</button>
                          </div>
                          <p className="text-sm font-semibold text-[var(--color-text)]">
                            {qty > 0 ? fmtAmount(gp * qty, currency) : '—'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Meals sub-section */}
              {enabledMeals.length > 0 && (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('meals')}</h3>

                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-hidden rounded-xl border border-[var(--color-border)]">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--color-background)]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('meal')}</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('add')}</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('adults')}</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('children')}</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('infants')}</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('ratePerPerson')}</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('total')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {enabledMeals.map(type => {
                          const cfg = groupCfg.mealsConfig[type]
                          const sel = mealSelections[type]
                          const cost = mealCost(type)
                          return (
                            <tr key={type} className="bg-[var(--color-surface)]">
                              <td className="px-4 py-3 font-medium text-[var(--color-text)]">{MEAL_LABELS[type]}</td>
                              <td className="px-4 py-3 text-center">
                                <input type="checkbox" checked={sel.selected}
                                  onChange={e => setMealSelections(prev => ({ ...prev, [type]: { ...prev[type], selected: e.target.checked } }))}
                                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]" />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input type="number" min={0} disabled={!sel.selected} value={sel.adults}
                                  onChange={e => setMealSelections(prev => ({ ...prev, [type]: { ...prev[type], adults: Math.max(0, parseInt(e.target.value) || 0) } }))}
                                  className={numInputCls} />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input type="number" min={0} disabled={!sel.selected} value={sel.children}
                                  onChange={e => setMealSelections(prev => ({ ...prev, [type]: { ...prev[type], children: Math.max(0, parseInt(e.target.value) || 0) } }))}
                                  className={numInputCls} />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input type="number" min={0} disabled={!sel.selected} value={sel.infants}
                                  onChange={e => setMealSelections(prev => ({ ...prev, [type]: { ...prev[type], infants: Math.max(0, parseInt(e.target.value) || 0) } }))}
                                  className={numInputCls} />
                              </td>
                              <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">
                                <div className="space-y-0.5 text-xs">
                                  <div>{tGroups('adult')}: {fmtAmount(cfg.priceAdult, currency)}</div>
                                  {cfg.priceChild > 0 && <div>{tGroups('child')}: {fmtAmount(cfg.priceChild, currency)}</div>}
                                  {cfg.priceInfant > 0 && <div>{tGroups('infant')}: {fmtAmount(cfg.priceInfant, currency)}</div>}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-[var(--color-text)]">
                                {sel.selected && cost > 0 ? fmtAmount(cost, currency) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-3">
                    {enabledMeals.map(type => {
                      const cfg = groupCfg.mealsConfig[type]
                      const sel = mealSelections[type]
                      const cost = mealCost(type)
                      return (
                        <div key={type} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                          <label className="flex items-center justify-between gap-3 cursor-pointer">
                            <div className="flex items-center gap-3">
                              <input type="checkbox" checked={sel.selected}
                                onChange={e => setMealSelections(prev => ({ ...prev, [type]: { ...prev[type], selected: e.target.checked } }))}
                                className="h-5 w-5 rounded border-[var(--color-border)] accent-[var(--color-primary)]" />
                              <span className="text-sm font-semibold text-[var(--color-text)]">{MEAL_LABELS[type]}</span>
                            </div>
                            <span className="text-sm font-semibold text-[var(--color-primary)]">
                              {sel.selected && cost > 0 ? fmtAmount(cost, currency) : '—'}
                            </span>
                          </label>
                          {sel.selected && (
                            <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
                              {[
                                { key: 'adults' as const, label: tGroups('adults'), price: cfg.priceAdult },
                                ...(cfg.priceChild > 0 ? [{ key: 'children' as const, label: tGroups('children'), price: cfg.priceChild }] : []),
                                ...(cfg.priceInfant > 0 ? [{ key: 'infants' as const, label: tGroups('infants'), price: cfg.priceInfant }] : []),
                              ].map(({ key, label, price }) => (
                                <div key={key} className="flex items-center justify-between">
                                  <span className="text-xs text-[var(--color-text-muted)]">{label} — {fmtAmount(price, currency)}{tGroups('perPerson')}</span>
                                  <input type="number" min={0} value={sel[key]}
                                    onChange={e => setMealSelections(prev => ({ ...prev, [type]: { ...prev[type], [key]: Math.max(0, parseInt(e.target.value) || 0) } }))}
                                    className="w-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-center text-sm focus:border-[var(--color-primary)] focus:outline-none" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Meeting Room sub-section */}
              {groupCfg.meetingRoomConfig.enabled && (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('meetingRoom')}</h3>
                  <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                    <div className="flex items-center justify-between px-4 py-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={meetingRoomSelected}
                          onChange={e => setMeetingRoomSelected(e.target.checked)}
                          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                        />
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text)]">{tGroups('conferenceRoom')}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {tGroups('meetingRoomRate', { amount: fmtAmount(groupCfg.meetingRoomConfig.pricePerDay, currency), count: String(nights) })}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-[var(--color-text)]">
                        {meetingRoomSelected ? fmtAmount(meetingRoomCost, currency) : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Free Rooms sub-section */}
              {groupCfg.freeRoomsConfig.enabled && groupCfg.freeRoomsConfig.count > 0 && (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    {tGroups('freeRooms', { count: String(groupCfg.freeRoomsConfig.count) })}
                  </h3>
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4">
                    <p className="text-sm text-[var(--color-text)]">
                      {tGroups('freeRoomsDesc', { count: String(groupCfg.freeRoomsConfig.count) })}
                    </p>
                  </div>
                </div>
              )}

              {/* Grand Total */}
              <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
                <span className="text-sm font-semibold text-[var(--color-text)]">{tGroups('grandTotal')}</span>
                <span className="text-base font-bold text-[var(--color-primary)]">{fmtAmount(grandTotal, currency)}</span>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setStep(3)}
                  disabled={!hasSelections}
                  className="rounded-xl bg-[var(--color-primary)] px-8 py-3 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40 transition-colors"
                >
                  {tGroups('continue')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 3: Contact / Submit ───────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              {groupCfg.bookingMode === 'offline' ? tGroups('sendInquiry') : tGroups('yourDetails')}
            </h2>
            <button onClick={() => setStep(2)}
              className="text-sm text-[var(--color-text-muted)] underline-offset-2 hover:underline">
              {tGroups('backToRoomSelection')}
            </button>
          </div>

          {/* Booking summary */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('yourSelection')}</p>
            {rooms.filter(r => (selections[r.roomId] ?? 0) > 0).map(r => (
              <div key={r.roomId} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text)]">{r.roomName} × {selections[r.roomId]}</span>
                <span className="text-[var(--color-text-muted)]">{fmtAmount(roomTotal(r), currency)}</span>
              </div>
            ))}
            {(['breakfast', 'lunch', 'dinner'] as MealType[])
              .filter(t => groupCfg.mealsConfig[t].enabled && mealSelections[t].selected && mealCost(t) > 0)
              .map(t => (
                <div key={t} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--color-text)]">{MEAL_LABELS[t]}</span>
                  <span className="text-[var(--color-text-muted)]">{fmtAmount(mealCost(t), currency)}</span>
                </div>
              ))}
            {meetingRoomSelected && groupCfg.meetingRoomConfig.enabled && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text)]">{tGroups('meetingRoom')}</span>
                <span className="text-[var(--color-text-muted)]">{fmtAmount(meetingRoomCost, currency)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-sm font-semibold">
              <span className="text-[var(--color-text)]">{tGroups('totalForNights', { count: String(nights) })}</span>
              <span className="text-[var(--color-primary)]">{fmtAmount(grandTotal, currency)}</span>
            </div>
          </div>

          {/* Contact form */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{tGroups('fullName')} *</label>
                <input className={inputCls} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <label className={labelCls}>{tGroups('emailAddress')} *</label>
                <input type="email" className={inputCls} value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="jane@company.com" />
              </div>
              <div>
                <label className={labelCls}>{tGroups('phone')}</label>
                <input type="tel" className={inputCls} value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+1 555 000 0000" />
              </div>
            </div>

            {groupCfg.bookingMode === 'offline' && (
              <div>
                <label className={labelCls}>{tGroups('message')}</label>
                <textarea className={inputCls + ' resize-none'} rows={3}
                  value={message} onChange={e => setMessage(e.target.value)}
                  placeholder={tGroups('messagePlaceholder')} />
              </div>
            )}
          </div>

          {/* Cancellation policy */}
          {groupCfg.cancellationRanges.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('cancellationPolicy')}</p>
              {groupCfg.cancellationRanges.map((r, i) => {
                const amount = fmtAmount(Math.round(grandTotal * r.pct) / 100, currency)
                if (r.triggerType === 'on_confirmation') {
                  return (
                    <p key={i} className="text-sm text-[var(--color-text)]">
                      {tGroups('uponConfirmationDeposit', { pct: String(r.pct), amount })}
                    </p>
                  )
                }
                const deadline = addDaysToDate(checkIn, -(r.daysBeforeCheckin ?? 0))
                const isPast = deadline < todayIso()
                return (
                  <p key={i} className={['text-sm', isPast ? 'text-[var(--color-error)]' : 'text-[var(--color-text)]'].join(' ')}>
                    {tGroups('fromDeadlineNonRefundable', { deadline: fmtDate(deadline), days: String(r.daysBeforeCheckin ?? 0), pct: String(r.pct), amount })}
                    {isPast && ' ' + tGroups('deadlinePassed')}
                  </p>
                )
              })}
            </div>
          )}

          {/* Payment schedule */}
          {(groupCfg.paymentInParWithCancellation
            ? groupCfg.cancellationRanges.length > 0
            : groupCfg.paymentRanges.length > 0) && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('paymentSchedule')}</p>
              {(groupCfg.paymentInParWithCancellation ? groupCfg.cancellationRanges : groupCfg.paymentRanges).map((r, i) => {
                const amount = fmtAmount(Math.round(grandTotal * r.pct) / 100, currency)
                if (r.triggerType === 'on_confirmation') {
                  return (
                    <p key={i} className="text-sm text-[var(--color-text)]">
                      {tGroups('uponConfirmationDue', { pct: String(r.pct), amount })}
                    </p>
                  )
                }
                const deadline = addDaysToDate(checkIn, -(r.daysBeforeCheckin ?? 0))
                const isPast = !groupCfg.paymentInParWithCancellation && deadline < todayIso()
                return (
                  <p key={i} className={['text-sm', isPast ? 'text-[var(--color-error)]' : 'text-[var(--color-text)]'].join(' ')}>
                    {tGroups('byDeadlineDue', { deadline: fmtDate(deadline), days: String(r.daysBeforeCheckin ?? 0), pct: String(r.pct), amount })}
                    {isPast && ' — ' + tGroups('overdue')}
                  </p>
                )
              })}
            </div>
          )}

          {/* Group policies */}
          {groupCfg.groupPolicies && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{tGroups('groupPolicies')}</p>
              <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{groupCfg.groupPolicies}</p>
            </div>
          )}

          {submitError && <p className="text-sm text-[var(--color-error)]">{submitError}</p>}

          {groupCfg.bookingMode === 'offline' ? (
            <div className="flex justify-end gap-3">
              <button
                onClick={handleSubmitInquiry}
                disabled={!contactName || !contactEmail || inquiryMut.isPending}
                className="rounded-xl bg-[var(--color-primary)] px-8 py-3 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40 transition-colors"
              >
                {inquiryMut.isPending ? tGroups('submitting') : tGroups('submitInquiry')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-muted)]">
                {tGroups('redirectToComplete')}
              </p>
              <div className="flex justify-end">
                <button
                  onClick={handleOnlineBook}
                  disabled={!contactName || !contactEmail}
                  className="rounded-xl bg-[var(--color-primary)] px-8 py-3 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40 transition-colors"
                >
                  {tGroups('proceedToBook')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
