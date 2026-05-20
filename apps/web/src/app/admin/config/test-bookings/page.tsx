'use client'

import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../../property-context'
import { CalendarDropdown } from '@/components/search/CalendarDropdown'
import { GuestsDropdown } from '@/components/search/GuestsDropdown'
import { NationalityDropdown } from '@/components/search/NationalityDropdown'
import type { GuestRoom } from '@/components/search/GuestsDropdown'
import { countryFlag, countryName } from '@/lib/countries'
import type { TestBookingRateResult, TestBookingBookResponse } from '@ibe/shared'

// ── Constants ─────────────────────────────────────────────────────────────────

interface CombinationRoom {
  adults: number
  childrenAges: number[]
}

interface Combination {
  rooms: CombinationRoom[]
  nationality: string
  offsetDays: number
  nights: number
}

const r = (adults: number, childrenAges: number[] = []): CombinationRoom => ({ adults, childrenAges })

const COMBINATIONS: Combination[] = [
  // ── Single room ───────────────────────────────────────────────────────────
  { rooms: [r(1)],          nationality: 'GR', offsetDays: 1,   nights: 2  },
  { rooms: [r(2)],          nationality: 'US', offsetDays: 7,   nights: 5  },
  { rooms: [r(1,[11])],     nationality: 'IN', offsetDays: 30,  nights: 3  },
  { rooms: [r(2,[4,9])],    nationality: 'EG', offsetDays: 90,  nights: 9  },
  { rooms: [r(3)],          nationality: 'UK', offsetDays: 290, nights: 11 },
  { rooms: [r(2)],          nationality: 'DE', offsetDays: 14,  nights: 7  },
  { rooms: [r(4)],          nationality: 'US', offsetDays: 21,  nights: 3  },
  { rooms: [r(1,[6,14])],   nationality: 'UK', offsetDays: 45,  nights: 7  },
  { rooms: [r(2,[2])],      nationality: 'FR', offsetDays: 60,  nights: 5  },
  { rooms: [r(2)],          nationality: 'JP', offsetDays: 180, nights: 2  },
  // ── 2 rooms ───────────────────────────────────────────────────────────────
  { rooms: [r(2), r(1)],            nationality: 'DE', offsetDays: 14,  nights: 7  },
  { rooms: [r(2), r(2,[10])],       nationality: 'US', offsetDays: 21,  nights: 3  },
  { rooms: [r(1,[8]), r(2)],        nationality: 'IT', offsetDays: 30,  nights: 4  },
  // ── 3 rooms ───────────────────────────────────────────────────────────────
  { rooms: [r(2), r(2), r(1)],      nationality: 'FR', offsetDays: 30,  nights: 5  },
  { rooms: [r(2), r(1,[5]), r(2)],  nationality: 'AU', offsetDays: 60,  nights: 3  },
]

function roomLabel(rm: CombinationRoom): string {
  const adults = `${rm.adults} ${rm.adults === 1 ? 'Adult' : 'Adults'}`
  const children = rm.childrenAges.length === 0 ? '' :
    ` + ${rm.childrenAges.length} ${rm.childrenAges.length === 1 ? 'Child' : 'Children'} (${rm.childrenAges.join(', ')})`
  return `${adults}${children}`
}

function comboLabel(c: Combination): string {
  const nightPart = `${c.nights} ${c.nights === 1 ? 'Night' : 'Nights'}`
  const country = countryName(c.nationality)
  if (c.rooms.length === 1) {
    return `${roomLabel(c.rooms[0]!)} · ${country} · Today+${c.offsetDays} · ${nightPart}`
  }
  const roomsPart = c.rooms.map(roomLabel).join(' / ')
  return `${c.rooms.length} Rooms: ${roomsPart} · ${country} · Today+${c.offsetDays} · ${nightPart}`
}

// ── Category chips ────────────────────────────────────────────────────────────

type Chip =
  | 'Close dates' | 'Mid dates'  | 'Far-away dates'
  | 'Short stay'  | 'Mid stay'   | 'Long stay'
  | 'One room'    | 'Multiple rooms'
  | 'Single'      | 'Couple' | 'Family'

const CHIP_GROUPS: Chip[][] = [
  ['Close dates', 'Mid dates', 'Far-away dates'],
  ['Short stay', 'Mid stay', 'Long stay'],
  ['One room', 'Multiple rooms'],
  ['Single', 'Couple', 'Family'],
]

const ALL_CHIPS: Set<Chip> = new Set(CHIP_GROUPS.flat())

const CHIP_ROWS: { label: string; chips: Chip[] }[] = [
  { label: 'Dates',  chips: ['Close dates', 'Mid dates', 'Far-away dates'] },
  { label: 'Stay',   chips: ['Short stay', 'Mid stay', 'Long stay'] },
  { label: 'Rooms',  chips: ['One room', 'Multiple rooms'] },
  { label: 'Guests', chips: ['Single', 'Couple', 'Family'] },
]

function comboMatchesChips(c: Combination, selected: Set<Chip>): boolean {
  const totalAdults   = c.rooms.reduce((s, rm) => s + rm.adults, 0)
  const totalChildren = c.rooms.reduce((s, rm) => s + rm.childrenAges.length, 0)
  const chipOf: [Chip, boolean][] = [
    ['Close dates',    c.offsetDays <= 14],
    ['Mid dates',      c.offsetDays > 14 && c.offsetDays <= 60],
    ['Far-away dates', c.offsetDays > 60],
    ['Short stay',     c.nights <= 3],
    ['Mid stay',       c.nights >= 4 && c.nights <= 6],
    ['Long stay',      c.nights > 6],
    ['One room',       c.rooms.length === 1],
    ['Multiple rooms', c.rooms.length > 1],
    ['Family',         totalChildren > 0],
    ['Single',         totalChildren === 0 && totalAdults === 1],
    ['Couple',         totalChildren === 0 && totalAdults > 1],
  ]
  const has = (chip: Chip) => chipOf.find(([c]) => c === chip)?.[1] ?? false
  return CHIP_GROUPS.every(group => group.some(chip => selected.has(chip) && has(chip)))
}

function offsetDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const DISPLAY_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDateDisplay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${DISPLAY_MONTHS[parseInt(m!) - 1]}-${y!.slice(2)}`
}

// ── Rate state ────────────────────────────────────────────────────────────────

interface RateState {
  rate: TestBookingRateResult
  checked: boolean
  nrUnlocked: boolean
  booking: TestBookingBookResponse | null
  bookingError: string | null
  cancelStatus: 'idle' | 'cancelling' | 'cancelled' | 'error'
}

interface ComboState {
  status: 'idle' | 'searching' | 'done' | 'no-results' | 'error'
  error: string | null
  rates: RateState[]
}

// ── CancelButton ──────────────────────────────────────────────────────────────

function CancelButton({ rateState, onCancel }: {
  rateState: RateState
  onCancel: () => void
}) {
  if (rateState.cancelStatus === 'cancelled') {
    return <span className="text-xs font-medium text-[var(--color-text-muted)]">cancelled</span>
  }
  if (rateState.cancelStatus === 'cancelling') {
    return <span className="text-xs text-[var(--color-text-muted)]">cancelling…</span>
  }
  if (rateState.cancelStatus === 'error') {
    return <span className="text-xs text-error">cancel failed — retry?</span>
  }
  return (
    <button type="button" onClick={onCancel} className="text-xs text-error hover:underline">
      Cancel
    </button>
  )
}

// ── RatesSubTable ─────────────────────────────────────────────────────────────

export function RatesSubTable({ rates, onToggle, onCancel, onToggleNrUnlock }: {
  rates: RateState[]
  onToggle: (idx: number) => void
  onCancel: (idx: number, bookingId: number) => void
  onToggleNrUnlock: (idx: number) => void
}) {
  return (
    <table className="w-full text-xs border-collapse mt-1 table-fixed">
      <colgroup>
        <col className="w-16" />
        <col />
        <col className="w-10" />
        <col className="w-12" />
        <col className="w-28" />
        <col className="w-28" />
        <col className="w-32" />
      </colgroup>
      <thead>
        <tr className="text-left text-[var(--color-text-muted)]">
          <th className="pb-1 pr-2 font-medium">Book</th>
          <th className="pb-1 pr-2 font-medium">Room</th>
          <th className="pb-1 pr-2 font-medium">Board</th>
          <th className="pb-1 pr-2 font-medium">Cancel</th>
          <th className="pb-1 pr-2 font-medium">Per night</th>
          <th className="pb-1 pr-2 font-medium">Total</th>
          <th className="pb-1 font-medium">Reference</th>
        </tr>
      </thead>
      <tbody>
        {rates.map((rs, idx) => {
          const isNR = rs.rate.cancellationPolicy === 'NR'
          return (
            <tr
              key={idx}
              className={[
                'border-t border-[var(--color-border)]/30 align-top',
                isNR ? 'bg-red-50/60' : '',
              ].join(' ')}
            >
              <td className="py-1 pr-2">
                <div className="flex items-center gap-1.5">
                  {isNR && !rs.booking && (
                    <button
                      type="button"
                      onClick={() => onToggleNrUnlock(idx)}
                      title={rs.nrUnlocked ? 'Lock this NR rate' : 'Unlock to allow booking this NR rate'}
                      className={[
                        'relative inline-flex h-4 w-7 flex-shrink-0 items-center rounded-full transition-colors',
                        rs.nrUnlocked ? 'bg-red-400' : 'bg-gray-300',
                      ].join(' ')}
                    >
                      <span className={[
                        'inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform',
                        rs.nrUnlocked ? 'translate-x-3.5' : 'translate-x-0.5',
                      ].join(' ')} />
                    </button>
                  )}
                  {rs.booking ? (
                    <span className="text-success">✓</span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={rs.checked}
                      disabled={isNR && !rs.nrUnlocked}
                      onChange={() => onToggle(idx)}
                      className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  )}
                </div>
              </td>
              <td className="py-1 pr-2 text-[var(--color-text)] truncate">{rs.rate.roomName}</td>
              <td className="py-1 pr-2 text-[var(--color-text-muted)]">{rs.rate.board}</td>
              <td className={['py-1 pr-2 font-medium', isNR ? 'text-red-600' : 'text-[var(--color-text-muted)]'].join(' ')}>
                {isNR ? 'NR' : 'Flexi'}
              </td>
              <td className="py-1 pr-2 text-[var(--color-text)]">
                {rs.rate.pricePerNight.toFixed(2)} {rs.rate.currency}
              </td>
              <td className="py-1 pr-2 text-[var(--color-text)]">
                {rs.rate.totalPrice.toFixed(2)} {rs.rate.currency}
              </td>
              <td className="py-1">
                {rs.bookingError && <span className="text-error">{rs.bookingError}</span>}
                {rs.booking && !rs.bookingError && (
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[var(--color-text)]">{rs.booking.bookingReference}</span>
                    <CancelButton rateState={rs} onCancel={() => onCancel(idx, rs.booking!.bookingId)} />
                  </span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── CombinationsMode ──────────────────────────────────────────────────────────

function CombinationsMode({ propertyId, propertyName, comboStates, setComboStates }: {
  propertyId: number
  propertyName: string
  comboStates: ComboState[]
  setComboStates: React.Dispatch<React.SetStateAction<ComboState[]>>
}) {
  const [selected, setSelected] = useState<boolean[]>(Array(COMBINATIONS.length).fill(false))
  const [running, setRunning] = useState(false)
  const [selectedChips, setSelectedChips] = useState<Set<Chip>>(new Set(ALL_CHIPS))

  const [resultFilters, setResultFilters] = useState({
    status: 'all' as 'all' | 'with-results' | 'no-results',
    board: '',
    cancellation: 'all' as 'all' | 'R' | 'NR',
    booked: 'all' as 'all' | 'yes',
  })

  const visibleIndices = COMBINATIONS.map((c, i) => ({ c, i }))
    .filter(({ c }) => comboMatchesChips(c, selectedChips))
    .map(({ i }) => i)

  const hasAnySearched = comboStates.some(s => s.status !== 'idle')
  const availableBoards = [...new Set(
    comboStates.flatMap(s => s.rates.map(r => r.rate.board)).filter(Boolean)
  )].sort()

  function rateMatchesFilters(rs: RateState): boolean {
    if (resultFilters.board && rs.rate.board !== resultFilters.board) return false
    if (resultFilters.cancellation !== 'all' && rs.rate.cancellationPolicy !== resultFilters.cancellation) return false
    if (resultFilters.booked === 'yes' && rs.booking === null) return false
    return true
  }

  const baseFiltered = visibleIndices.filter(i => {
    const s = comboStates[i]!
    if (resultFilters.status === 'with-results' && s.status !== 'done') return false
    if (resultFilters.status === 'no-results' && s.status !== 'no-results') return false
    if (s.status === 'done' && !s.rates.some(rateMatchesFilters)) return false
    return true
  })
  const sortedVisible = [
    ...baseFiltered.filter(i => comboStates[i]!.status !== 'no-results'),
    ...baseFiltered.filter(i => comboStates[i]!.status === 'no-results'),
  ]

  const allVisSelected = sortedVisible.length > 0 && sortedVisible.every(i => selected[i])
  const anySelected = sortedVisible.some(i => selected[i])
  const anyBooking = comboStates.some(s => s.rates.some(r => r.booking !== null))

  function toggleChip(chip: Chip) {
    setSelectedChips(prev => {
      const next = new Set(prev)
      if (next.has(chip)) next.delete(chip); else next.add(chip)
      return next
    })
  }

  function updateCombo(i: number, update: Partial<ComboState>) {
    setComboStates(prev => {
      const next = [...prev]
      next[i] = { ...next[i]!, ...update }
      return next
    })
  }

  function updateRate(comboIdx: number, rateIdx: number, update: Partial<RateState>) {
    setComboStates(prev => {
      const next = [...prev]
      const combo = { ...next[comboIdx]! }
      const rates = [...combo.rates]
      rates[rateIdx] = { ...rates[rateIdx]!, ...update }
      combo.rates = rates
      next[comboIdx] = combo
      return next
    })
  }

  async function runSearches() {
    setRunning(true)
    setComboStates(prev => prev.map((s, i) =>
      selected[i] ? { status: 'searching', error: null, rates: [] } : s
    ))
    await Promise.all(
      COMBINATIONS.map(async (combo, i) => {
        if (!selected[i]) return
        const checkIn = offsetDate(combo.offsetDays)
        const checkOut = offsetDate(combo.offsetDays + combo.nights)
        try {
          const res = await apiClient.testBookingsSearch({
            propertyId, checkIn, checkOut,
            adults: combo.rooms[0]!.adults, childrenAges: combo.rooms[0]!.childrenAges,
            rooms: combo.rooms,
          })
          if (res.rates.length === 0) {
            updateCombo(i, { status: 'no-results' })
          } else {
            updateCombo(i, {
              status: 'done',
              rates: res.rates.map(r => ({ rate: r, checked: false, nrUnlocked: false, booking: null, bookingError: null, cancelStatus: 'idle' })),
            })
          }
        } catch (err) {
          updateCombo(i, { status: 'error', error: err instanceof Error ? err.message : 'Search failed' })
        }
      })
    )
    setRunning(false)
  }

  async function bookChecked() {
    await Promise.all(
      comboStates.map(async (combo, comboIdx) => {
        const combo_ = COMBINATIONS[comboIdx]!
        const checkIn = offsetDate(combo_.offsetDays)
        const checkOut = offsetDate(combo_.offsetDays + combo_.nights)
        await Promise.all(
          combo.rates.map(async (rateState, rateIdx) => {
            if (!rateState.checked || rateState.booking) return
            try {
              const result = await apiClient.testBookingsBook({
                propertyId, rateKey: rateState.rate.rateKey,
                checkIn, checkOut,
                adults: combo_.rooms[0]!.adults, childrenAges: combo_.rooms[0]!.childrenAges,
              })
              updateRate(comboIdx, rateIdx, { booking: result, bookingError: null })
            } catch (err) {
              updateRate(comboIdx, rateIdx, { bookingError: err instanceof Error ? err.message : 'Booking failed' })
            }
          })
        )
      })
    )
  }

  async function cancelBooking(comboIdx: number, rateIdx: number, bookingId: number) {
    updateRate(comboIdx, rateIdx, { cancelStatus: 'cancelling' })
    try {
      await apiClient.testBookingsCancel(bookingId)
      updateRate(comboIdx, rateIdx, { cancelStatus: 'cancelled' })
    } catch {
      updateRate(comboIdx, rateIdx, { cancelStatus: 'error' })
    }
  }

  const anyChecked = comboStates.some(s => s.rates.some(r => r.checked && !r.booking))
  const anyNrChecked = comboStates.some(s => s.rates.some(r => r.checked && r.rate.cancellationPolicy === 'NR' && !r.booking))
  const hasResults = comboStates.some(s => s.status === 'done' || s.status === 'no-results' || s.status === 'error')

  const rfChip = (active: boolean) => [
    'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border',
    active
      ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
      : 'bg-transparent border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
  ].join(' ')

  return (
    <div className="space-y-4">
      {/* ── Category chips ── */}
      <div className="space-y-1.5">
        {CHIP_ROWS.map(({ label, chips }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-[var(--color-text-muted)]">{label}</span>
            <div className="flex flex-wrap gap-1">
              {chips.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleChip(chip)}
                  className={[
                    'rounded-full px-3 py-0.5 text-xs font-medium transition-colors border',
                    selectedChips.has(chip)
                      ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                      : 'bg-transparent border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                  ].join(' ')}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <p className="text-xs text-[var(--color-text-muted)] flex-1">
          Select combinations, run searches to see available rates, then select rates to book.
        </p>
        <button
          type="button"
          disabled={running || !anySelected}
          onClick={() => { void runSearches() }}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          {running ? 'Searching…' : 'Run searches'}
        </button>
        {anyChecked && (
          <button
            type="button"
            onClick={() => { void bookChecked() }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Book selected
          </button>
        )}
        {hasResults && (
          <button
            type="button"
            onClick={() => exportToExcel(comboStates, propertyName, propertyId)}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors whitespace-nowrap"
          >
            Export Excel
          </button>
        )}
      </div>

      {/* ── Result filters (shown after any search) ── */}
      {hasAnySearched && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/50 px-3 py-2.5 space-y-1.5">
          <p className="text-xs font-semibold text-[var(--color-text-muted)]">Filter results</p>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-[var(--color-text-muted)]">Status</span>
            <div className="flex flex-wrap gap-1">
              {(['all', 'with-results', 'no-results'] as const).map(v => (
                <button key={v} type="button" onClick={() => setResultFilters(f => ({ ...f, status: v }))} className={rfChip(resultFilters.status === v)}>
                  {v === 'all' ? 'All' : v === 'with-results' ? 'With results' : 'No results'}
                </button>
              ))}
            </div>
          </div>
          {availableBoards.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-[var(--color-text-muted)]">Board</span>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => setResultFilters(f => ({ ...f, board: '' }))} className={rfChip(!resultFilters.board)}>All</button>
                {availableBoards.map(b => (
                  <button key={b} type="button" onClick={() => setResultFilters(f => ({ ...f, board: b }))} className={rfChip(resultFilters.board === b)}>{b}</button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-[var(--color-text-muted)]">Cancel</span>
            <div className="flex flex-wrap gap-1">
              {(['all', 'R', 'NR'] as const).map(v => (
                <button key={v} type="button" onClick={() => setResultFilters(f => ({ ...f, cancellation: v }))} className={rfChip(resultFilters.cancellation === v)}>
                  {v === 'all' ? 'All' : v === 'R' ? 'Flexi' : 'NR'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-[var(--color-text-muted)]">Booked</span>
            <div className="flex flex-wrap gap-1">
              {(['all', 'yes'] as const).map(v => (
                <button key={v} type="button" onClick={() => setResultFilters(f => ({ ...f, booked: v }))} className={rfChip(resultFilters.booked === v)}>
                  {v === 'all' ? 'All' : 'Booked'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {anyNrChecked && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Non-refundable rate selected.</strong> You are about to make a test booking for a non-refundable rate — make sure this is approved and that you will be able to cancel it.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-muted)]">
              <th className="pb-2 pr-3">
                <input
                  type="checkbox"
                  checked={allVisSelected}
                  onChange={() => setSelected(prev => {
                    const n = [...prev]
                    sortedVisible.forEach(i => { n[i] = !allVisSelected })
                    return n
                  })}
                  className="cursor-pointer"
                />
              </th>
              <th className="pb-2 pr-3 font-medium">Combination</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedVisible.map(i => {
              const combo = COMBINATIONS[i]!
              const state = comboStates[i]!
              const isNoResults = state.status === 'no-results'
              const filteredRates = state.rates
                .map((rs, origIdx) => ({ rs, origIdx }))
                .filter(({ rs }) => rateMatchesFilters(rs))
              return (
                <React.Fragment key={i}>
                  <tr className={['border-t border-[var(--color-border)] align-top', isNoResults ? 'bg-amber-50/70' : ''].join(' ')}>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selected[i] ?? false}
                        onChange={e => setSelected(prev => { const n = [...prev]; n[i] = e.target.checked; return n })}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--color-text)]">{comboLabel(combo)}</td>
                    <td className="py-2 text-xs">
                      {state.status === 'idle' && <span className="text-[var(--color-text-muted)]">—</span>}
                      {state.status === 'searching' && (
                        <span className="inline-flex items-center gap-1.5 text-[var(--color-text-muted)]">
                          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          searching…
                        </span>
                      )}
                      {state.status === 'no-results' && <span className="text-[var(--color-text-muted)]">no results</span>}
                      {state.status === 'error' && <span className="text-error">{state.error}</span>}
                      {state.status === 'done' && (
                        <span className="text-success">{filteredRates.length} rate{filteredRates.length !== 1 ? 's' : ''}</span>
                      )}
                    </td>
                  </tr>
                  {state.status === 'done' && filteredRates.length > 0 && (
                    <tr className="border-t border-[var(--color-border)]/50">
                      <td />
                      <td colSpan={2} className="pb-2 pl-2">
                        <RatesSubTable
                          rates={filteredRates.map(({ rs }) => rs)}
                          onToggle={filtIdx => {
                            const origIdx = filteredRates[filtIdx]!.origIdx
                            updateRate(i, origIdx, { checked: !state.rates[origIdx]!.checked })
                          }}
                          onCancel={(filtIdx, bookingId) => {
                            void cancelBooking(i, filteredRates[filtIdx]!.origIdx, bookingId)
                          }}
                          onToggleNrUnlock={filtIdx => {
                            const origIdx = filteredRates[filtIdx]!.origIdx
                            const wasUnlocked = state.rates[origIdx]!.nrUnlocked
                            updateRate(i, origIdx, { nrUnlocked: !wasUnlocked, ...(wasUnlocked ? { checked: false } : {}) })
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Excel export ──────────────────────────────────────────────────────────────

const EXPORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function excelFilename(propertyName: string, propertyId: number): string {
  const d = new Date()
  const date = `${String(d.getDate()).padStart(2,'0')}-${EXPORT_MONTHS[d.getMonth()]}-${d.getFullYear()}`
  return `Tests for ${propertyName} ${propertyId}_${date}.xlsx`
}

function exportToExcel(states: ComboState[], propertyName: string, propertyId: number) {
  const resultRows:   Record<string, unknown>[] = []
  const noResultRows: Record<string, unknown>[] = []
  const otherRows:    Record<string, unknown>[] = []

  states.forEach((state, comboIdx) => {
    const combo = COMBINATIONS[comboIdx]!
    const base = {
      'Combination #': comboIdx + 1,
      'Rooms': combo.rooms.length,
      'Nationality': combo.nationality,
      'Check-in': offsetDate(combo.offsetDays),
      'Check-out': offsetDate(combo.offsetDays + combo.nights),
      'Nights': combo.nights,
      'Combination': comboLabel(combo),
    }
    if (state.status === 'done') {
      state.rates.forEach(rs => {
        resultRows.push({
          ...base,
          'Search Status': 'Results found',
          'Room Name': rs.rate.roomName,
          'Board': rs.rate.board,
          'Cancellation': rs.rate.cancellationPolicy === 'R' ? 'Flexi' : 'NR',
          'Price/Night': rs.rate.pricePerNight,
          'Total': rs.rate.totalPrice,
          'Currency': rs.rate.currency,
          'Booked': rs.booking ? 'Yes' : 'No',
          'Booking Reference': rs.booking?.bookingReference ?? '—',
          'Booking Status': rs.booking
            ? (rs.cancelStatus === 'cancelled' ? 'Cancelled' : 'Booked')
            : '—',
        })
      })
    } else if (state.status === 'no-results') {
      noResultRows.push({
        ...base,
        'Search Status': 'No results',
        'Room Name': '—', 'Board': '—', 'Cancellation': '—',
        'Price/Night': '—', 'Total': '—', 'Currency': '—',
        'Booked': '—', 'Booking Reference': '—', 'Booking Status': '—',
      })
    } else if (state.status === 'idle') {
      otherRows.push({
        ...base,
        'Search Status': 'Not searched',
        'Room Name': '—', 'Board': '—', 'Cancellation': '—',
        'Price/Night': '—', 'Total': '—', 'Currency': '—',
        'Booked': '—', 'Booking Reference': '—', 'Booking Status': '—',
      })
    } else if (state.status === 'error') {
      otherRows.push({
        ...base,
        'Search Status': `Error: ${state.error ?? 'unknown'}`,
        'Room Name': '—', 'Board': '—', 'Cancellation': '—',
        'Price/Night': '—', 'Total': '—', 'Currency': '—',
        'Booked': '—', 'Booking Reference': '—', 'Booking Status': '—',
      })
    }
  })

  const allRows = [...resultRows, ...noResultRows, ...otherRows]
  if (allRows.length === 0) return

  const ws = XLSX.utils.json_to_sheet(allRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Test Bookings')
  XLSX.writeFile(wb, excelFilename(propertyName, propertyId))
}

function exportCustomToExcel(
  rates: RateState[],
  params: { checkIn: string; checkOut: string; adults: number; childrenAges: number[]; nationality: string },
  propertyName: string,
  propertyId: number,
) {
  const nights = Math.round((Date.parse(params.checkOut) - Date.parse(params.checkIn)) / 86_400_000)
  const rows = rates.map(rs => ({
    'Adults': params.adults,
    'Children': params.childrenAges.length,
    'Child Ages': params.childrenAges.join(', ') || '—',
    'Nationality': params.nationality,
    'Check-in': params.checkIn,
    'Check-out': params.checkOut,
    'Nights': nights,
    'Room Name': rs.rate.roomName,
    'Board': rs.rate.board,
    'Cancellation': rs.rate.cancellationPolicy === 'R' ? 'Flexi' : 'NR',
    'Price/Night': rs.rate.pricePerNight,
    'Total': rs.rate.totalPrice,
    'Currency': rs.rate.currency,
    'Booked': rs.booking ? 'Yes' : 'No',
    'Booking Reference': rs.booking?.bookingReference ?? '—',
    'Booking Status': rs.booking
      ? (rs.cancelStatus === 'cancelled' ? 'Cancelled' : 'Booked')
      : '—',
  }))

  if (rows.length === 0) return

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Test Bookings')
  XLSX.writeFile(wb, excelFilename(propertyName, propertyId))
}

// ── CustomMode ────────────────────────────────────────────────────────────────


function defaultDates() {
  const now = new Date()
  return {
    checkIn: new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10),
    checkOut: new Date(now.getTime() + 32 * 86400000).toISOString().slice(0, 10),
  }
}

function CustomMode({ propertyId, propertyName }: { propertyId: number; propertyName: string }) {
  const { checkIn: defaultCI, checkOut: defaultCO } = defaultDates()
  const [checkIn, setCheckIn] = useState(defaultCI)
  const [checkOut, setCheckOut] = useState(defaultCO)
  const [rooms, setRooms] = useState<GuestRoom[]>([{ adults: 2, children: 0, infants: 0 }])
  const [nationality, setNationality] = useState('US')
  const [openPanel, setOpenPanel] = useState<'dates' | 'guests' | 'nationality' | null>(null)
  const [rates, setRates] = useState<RateState[]>([])
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'done' | 'no-results' | 'error'>('idle')
  const [searchError, setSearchError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openPanel) return
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpenPanel(null)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [openPanel])

  const r = rooms[0]!
  const adults = r.adults
  const childrenAges = [...Array(r.children).fill(10), ...Array(r.infants).fill(1)] as number[]

  const anyBooking = rates.some(r => r.booking !== null)
  const anyChecked = rates.some(r => r.checked && !r.booking)
  const anyNrChecked = rates.some(r => r.checked && r.rate.cancellationPolicy === 'NR' && !r.booking)

  const datesLabel = checkIn && checkOut
    ? `${fmtDateDisplay(checkIn)} → ${fmtDateDisplay(checkOut)}`
    : 'Select dates'

  const guestParts = [`${adults} adult${adults !== 1 ? 's' : ''}`]
  if (r.children > 0) guestParts.push(`${r.children} child${r.children !== 1 ? 'ren' : ''}`)
  if (r.infants  > 0) guestParts.push(`${r.infants} infant${r.infants !== 1 ? 's' : ''}`)
  const guestsLabel = guestParts.join(' · ')

  function updateRate(idx: number, update: Partial<RateState>) {
    setRates(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx]!, ...update }
      return next
    })
  }

  async function runSearch() {
    setSearchStatus('searching')
    setSearchError(null)
    setRates([])
    setOpenPanel(null)
    try {
      const res = await apiClient.testBookingsSearch({ propertyId, checkIn, checkOut, adults, childrenAges })
      if (res.rates.length === 0) {
        setSearchStatus('no-results')
      } else {
        setRates(res.rates.map(r => ({ rate: r, checked: false, nrUnlocked: false, booking: null, bookingError: null, cancelStatus: 'idle' })))
        setSearchStatus('done')
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
      setSearchStatus('error')
    }
  }

  async function bookChecked() {
    await Promise.all(
      rates.map(async (rs, idx) => {
        if (!rs.checked || rs.booking) return
        try {
          const result = await apiClient.testBookingsBook({
            propertyId, rateKey: rs.rate.rateKey, checkIn, checkOut, adults, childrenAges,
          })
          updateRate(idx, { booking: result, bookingError: null })
        } catch (err) {
          updateRate(idx, { bookingError: err instanceof Error ? err.message : 'Booking failed' })
        }
      })
    )
  }

  async function cancelBooking(idx: number, bookingId: number) {
    updateRate(idx, { cancelStatus: 'cancelling' })
    try {
      await apiClient.testBookingsCancel(bookingId)
      updateRate(idx, { cancelStatus: 'cancelled' })
    } catch {
      updateRate(idx, { cancelStatus: 'error' })
    }
  }

  const btnBase = 'flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors'

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="flex flex-wrap items-center gap-2">
        {/* Date selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenPanel(p => p === 'dates' ? null : 'dates')}
            className={btnBase}
          >
            <svg className="h-4 w-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {datesLabel}
          </button>
          {openPanel === 'dates' && (
            <div className="absolute top-full left-0 z-50 mt-1">
              <CalendarDropdown
                checkIn={checkIn}
                checkOut={checkOut}
                initialField="checkin"
                onDatesChange={(ci, co) => { setCheckIn(ci); setCheckOut(co) }}
                onClose={() => setOpenPanel(null)}
                labelStart="Check-in"
                labelEnd="Check-out"
                labelDuration="Nights"
              />
            </div>
          )}
        </div>

        {/* Guests selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenPanel(p => p === 'guests' ? null : 'guests')}
            className={btnBase}
          >
            <svg className="h-4 w-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {guestsLabel}
          </button>
          {openPanel === 'guests' && (
            <div className="absolute top-full left-0 z-50 mt-1">
              <GuestsDropdown rooms={rooms} onChange={setRooms} maxRooms={1} />
            </div>
          )}
        </div>

        {/* Nationality selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenPanel(p => p === 'nationality' ? null : 'nationality')}
            className={btnBase}
          >
            <svg className="h-4 w-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {nationality ? `${countryFlag(nationality)} ${countryName(nationality)}` : 'Nationality'}
          </button>
          {openPanel === 'nationality' && (
            <div className="absolute top-full left-0 z-50 mt-1">
              <NationalityDropdown
                value={nationality}
                onChange={(code) => { setNationality(code); setOpenPanel(null) }}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={!checkIn || !checkOut || searchStatus === 'searching'}
          onClick={() => { void runSearch() }}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {searchStatus === 'searching' ? 'Searching…' : 'Run search'}
        </button>
        {anyChecked && (
          <button
            type="button"
            onClick={() => { void bookChecked() }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Book selected
          </button>
        )}
        {searchStatus === 'done' && rates.length > 0 && (
          <button
            type="button"
            onClick={() => exportCustomToExcel(rates, { checkIn, checkOut, adults, childrenAges, nationality }, propertyName, propertyId)}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
          >
            Export Excel
          </button>
        )}
      </div>

      {searchStatus === 'error' && <p className="text-sm text-error">{searchError}</p>}
      {searchStatus === 'no-results' && <p className="text-sm text-[var(--color-text-muted)]">No rates available for this combination.</p>}

      {anyNrChecked && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Non-refundable rate selected.</strong> You are about to make a test booking for a non-refundable rate — make sure this is approved and that you will be able to cancel it.
        </div>
      )}

      {searchStatus === 'done' && rates.length > 0 && (
        <RatesSubTable
          rates={rates}
          onToggle={idx => updateRate(idx, { checked: !rates[idx]!.checked })}
          onCancel={(idx, bookingId) => { void cancelBooking(idx, bookingId) }}
          onToggleNrUnlock={idx => {
            const wasUnlocked = rates[idx]!.nrUnlocked
            updateRate(idx, { nrUnlocked: !wasUnlocked, ...(wasUnlocked ? { checked: false } : {}) })
          }}
        />
      )}
    </div>
  )
}

// ── Page root (shell — CustomMode added in Task 7) ────────────────────────────

export default function TestBookingsPage() {
  const { propertyId } = useAdminProperty()
  const [activeTab, setActiveTab] = useState<'combinations' | 'custom'>('combinations')
  const [comboStates, setComboStates] = useState<ComboState[]>(
    COMBINATIONS.map(() => ({ status: 'idle', error: null, rates: [] }))
  )

  const { data: propertyDetail } = useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => apiClient.getProperty(propertyId!),
    staleTime: 60 * 60_000,
    enabled: !!propertyId,
  })
  const propertyName = propertyDetail?.name ?? (propertyId ? `Property ${propertyId}` : '')

  useEffect(() => {
    setComboStates(COMBINATIONS.map(() => ({ status: 'idle', error: null, rates: [] })))
  }, [propertyId])

  if (!propertyId) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-sm text-[var(--color-text-muted)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          Select a property to use Test Bookings.
        </p>
      </main>
    )
  }

  const tabClass = (tab: 'combinations' | 'custom') =>
    [
      'px-3 py-1.5 text-sm font-medium border-b-2 transition-colors',
      activeTab === tab
        ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
        : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
    ].join(' ')

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Test Bookings</h1>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Test Bookings</h2>
          <div className="flex gap-0">
            <button type="button" className={tabClass('combinations')} onClick={() => setActiveTab('combinations')}>
              Predefined
            </button>
            <button type="button" className={tabClass('custom')} onClick={() => setActiveTab('custom')}>
              Custom
            </button>
          </div>
        </div>

        {activeTab === 'combinations' && (
          <CombinationsMode
            propertyId={propertyId}
            propertyName={propertyName}
            comboStates={comboStates}
            setComboStates={setComboStates}
          />
        )}
        {activeTab === 'custom' && <CustomMode key={propertyId} propertyId={propertyId} propertyName={propertyName} />}
      </section>
    </main>
  )
}
