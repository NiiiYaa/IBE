'use client'

import React, { useState } from 'react'
import * as XLSX from 'xlsx'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../../property-context'
import type { TestBookingRateResult, TestBookingBookResponse } from '@ibe/shared'

// ── Constants ─────────────────────────────────────────────────────────────────

interface Combination {
  adults: number
  childrenAges: number[]
  nationality: string
  offsetDays: number
  nights: number
  board: string
  cancellation: 'R' | 'NR'
  label: string
}

const COMBINATIONS: Combination[] = [
  { adults: 1, childrenAges: [],       nationality: 'GR', offsetDays: 1,   nights: 2,  board: 'RO', cancellation: 'NR', label: '1A · GR · today+1 · 2n · RO · NR' },
  { adults: 2, childrenAges: [],       nationality: 'US', offsetDays: 7,   nights: 5,  board: 'BB', cancellation: 'R',  label: '2A · US · today+7 · 5n · BB · R' },
  { adults: 1, childrenAges: [11],     nationality: 'IN', offsetDays: 30,  nights: 3,  board: 'RO', cancellation: 'R',  label: '1A+1C(11) · IN · today+30 · 3n · RO · R' },
  { adults: 2, childrenAges: [4, 9],   nationality: 'EG', offsetDays: 90,  nights: 9,  board: 'HB', cancellation: 'NR', label: '2A+2C(4,9) · EG · today+90 · 9n · HB · NR' },
  { adults: 3, childrenAges: [],       nationality: 'UK', offsetDays: 290, nights: 11, board: 'BB', cancellation: 'R',  label: '3A · UK · today+290 · 11n · BB · R' },
  { adults: 2, childrenAges: [],       nationality: 'DE', offsetDays: 14,  nights: 7,  board: 'HB', cancellation: 'R',  label: '2A · DE · today+14 · 7n · HB · R' },
  { adults: 4, childrenAges: [],       nationality: 'US', offsetDays: 21,  nights: 3,  board: 'BB', cancellation: 'NR', label: '4A · US · today+21 · 3n · BB · NR' },
  { adults: 1, childrenAges: [6, 14],  nationality: 'UK', offsetDays: 45,  nights: 7,  board: 'HB', cancellation: 'R',  label: '1A+2C(6,14) · UK · today+45 · 7n · HB · R' },
  { adults: 2, childrenAges: [2],      nationality: 'FR', offsetDays: 60,  nights: 5,  board: 'RO', cancellation: 'NR', label: '2A+1C(2) · FR · today+60 · 5n · RO · NR' },
  { adults: 2, childrenAges: [],       nationality: 'JP', offsetDays: 180, nights: 2,  board: 'BB', cancellation: 'R',  label: '2A · JP · today+180 · 2n · BB · R' },
]

function offsetDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Rate state ────────────────────────────────────────────────────────────────

interface RateState {
  rate: TestBookingRateResult
  checked: boolean
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

export function RatesSubTable({ rates, onToggle, onCancel }: {
  rates: RateState[]
  onToggle: (idx: number) => void
  onCancel: (idx: number, bookingId: number) => void
}) {
  return (
    <table className="w-full text-xs border-collapse mt-1">
      <thead>
        <tr className="text-left text-[var(--color-text-muted)]">
          <th className="pb-1 pr-2 font-medium">Book</th>
          <th className="pb-1 pr-2 font-medium">Room</th>
          <th className="pb-1 pr-2 font-medium">Board</th>
          <th className="pb-1 pr-2 font-medium">Cancel</th>
          <th className="pb-1 pr-2 font-medium text-right">Per night</th>
          <th className="pb-1 pr-2 font-medium text-right">Total</th>
          <th className="pb-1 font-medium">Reference</th>
        </tr>
      </thead>
      <tbody>
        {rates.map((rs, idx) => (
          <tr key={idx} className="border-t border-[var(--color-border)]/30 align-top">
            <td className="py-1 pr-2">
              {rs.booking ? (
                <span className="text-success">✓</span>
              ) : (
                <input
                  type="checkbox"
                  checked={rs.checked}
                  onChange={() => onToggle(idx)}
                  className="cursor-pointer"
                />
              )}
            </td>
            <td className="py-1 pr-2 text-[var(--color-text)]">{rs.rate.roomName}</td>
            <td className="py-1 pr-2 text-[var(--color-text-muted)]">{rs.rate.board}</td>
            <td className="py-1 pr-2 text-[var(--color-text-muted)]">{rs.rate.cancellationPolicy}</td>
            <td className="py-1 pr-2 text-right text-[var(--color-text)]">
              {rs.rate.pricePerNight.toFixed(2)} {rs.rate.currency}
            </td>
            <td className="py-1 pr-2 text-right text-[var(--color-text)]">
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
        ))}
      </tbody>
    </table>
  )
}

// ── CombinationsMode ──────────────────────────────────────────────────────────

function CombinationsMode({ propertyId, comboStates, setComboStates }: {
  propertyId: number
  comboStates: ComboState[]
  setComboStates: React.Dispatch<React.SetStateAction<ComboState[]>>
}) {
  const [selected, setSelected] = useState<boolean[]>(Array(COMBINATIONS.length).fill(false))
  const [running, setRunning] = useState(false)

  const allSelected = selected.every(Boolean)
  const anySelected = selected.some(Boolean)
  const anyBooking = comboStates.some(s => s.rates.some(r => r.booking !== null))

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
            propertyId, checkIn, checkOut, adults: combo.adults, childrenAges: combo.childrenAges,
          })
          if (res.rates.length === 0) {
            updateCombo(i, { status: 'no-results' })
          } else {
            updateCombo(i, {
              status: 'done',
              rates: res.rates.map(r => ({ rate: r, checked: false, booking: null, bookingError: null, cancelStatus: 'idle' })),
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
                checkIn, checkOut, adults: combo_.adults, childrenAges: combo_.childrenAges,
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

  return (
    <div className="space-y-4">
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
        {anyBooking && (
          <button
            type="button"
            onClick={() => exportToExcel(comboStates)}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors whitespace-nowrap"
          >
            Export Excel
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-muted)]">
              <th className="pb-2 pr-3">
                <input type="checkbox" checked={allSelected} onChange={() => setSelected(prev => prev.map(() => !allSelected))} className="cursor-pointer" />
              </th>
              <th className="pb-2 pr-3 font-medium">Combination</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {COMBINATIONS.map((combo, i) => {
              const state = comboStates[i]!
              return (
                <React.Fragment key={i}>
                  <tr className="border-t border-[var(--color-border)] align-top">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selected[i] ?? false}
                        onChange={e => setSelected(prev => { const n = [...prev]; n[i] = e.target.checked; return n })}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--color-text)]">{combo.label}</td>
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
                        <span className="text-success">{state.rates.length} rate{state.rates.length !== 1 ? 's' : ''}</span>
                      )}
                    </td>
                  </tr>
                  {state.status === 'done' && state.rates.length > 0 && (
                    <tr className="border-t border-[var(--color-border)]/50">
                      <td />
                      <td colSpan={2} className="pb-2 pl-2">
                        <RatesSubTable
                          rates={state.rates}
                          onToggle={rateIdx => updateRate(i, rateIdx, { checked: !state.rates[rateIdx]!.checked })}
                          onCancel={(rateIdx, bookingId) => { void cancelBooking(i, rateIdx, bookingId) }}
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

function exportToExcel(states: ComboState[]) {
  const rows: Record<string, unknown>[] = []

  states.forEach((state, comboIdx) => {
    const combo = COMBINATIONS[comboIdx]!
    state.rates.forEach(rs => {
      if (!rs.booking) return
      rows.push({
        'Combination #': comboIdx + 1,
        'Adults': combo.adults,
        'Children': combo.childrenAges.length,
        'Child Ages': combo.childrenAges.join(', ') || '—',
        'Nationality': combo.nationality,
        'Check-in': offsetDate(combo.offsetDays),
        'Check-out': offsetDate(combo.offsetDays + combo.nights),
        'Nights': combo.nights,
        'Board (combo)': combo.board,
        'Cancellation (combo)': combo.cancellation,
        'Room Name': rs.rate.roomName,
        'Board (rate)': rs.rate.board,
        'Cancellation (rate)': rs.rate.cancellationPolicy,
        'Price/Night': rs.rate.pricePerNight,
        'Total': rs.rate.totalPrice,
        'Currency': rs.rate.currency,
        'Booking Reference': rs.booking.bookingReference,
        'Status': rs.cancelStatus === 'cancelled' ? 'cancelled' : 'booked',
      })
    })
  })

  if (rows.length === 0) return

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Test Bookings')
  XLSX.writeFile(wb, `test-bookings-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function exportCustomToExcel(
  rates: RateState[],
  params: { checkIn: string; checkOut: string; adults: number; childrenAges: number[]; nationality: string }
) {
  const nights = Math.round((Date.parse(params.checkOut) - Date.parse(params.checkIn)) / 86_400_000)
  const rows = rates
    .filter(rs => rs.booking)
    .map(rs => ({
      'Adults': params.adults,
      'Children': params.childrenAges.length,
      'Child Ages': params.childrenAges.join(', ') || '—',
      'Nationality': params.nationality,
      'Check-in': params.checkIn,
      'Check-out': params.checkOut,
      'Nights': nights,
      'Room Name': rs.rate.roomName,
      'Board': rs.rate.board,
      'Cancellation': rs.rate.cancellationPolicy,
      'Price/Night': rs.rate.pricePerNight,
      'Total': rs.rate.totalPrice,
      'Currency': rs.rate.currency,
      'Booking Reference': rs.booking!.bookingReference,
      'Status': rs.cancelStatus === 'cancelled' ? 'cancelled' : 'booked',
    }))

  if (rows.length === 0) return

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Test Bookings')
  XLSX.writeFile(wb, `test-bookings-custom-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── CustomMode ────────────────────────────────────────────────────────────────

const NATIONALITIES = ['GR', 'US', 'UK', 'DE', 'FR', 'IN', 'EG', 'JP', 'AU', 'IT', 'ES', 'CN', 'BR', 'RU', 'CA']

function defaultDates() {
  const now = new Date()
  return {
    checkIn: new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10),
    checkOut: new Date(now.getTime() + 32 * 86400000).toISOString().slice(0, 10),
  }
}

function CustomMode({ propertyId }: { propertyId: number }) {
  const { checkIn: defaultCI, checkOut: defaultCO } = defaultDates()
  const [checkIn, setCheckIn] = useState(defaultCI)
  const [checkOut, setCheckOut] = useState(defaultCO)
  const [adults, setAdults] = useState(2)
  const [childrenAges, setChildrenAges] = useState<number[]>([])
  const [nationality, setNationality] = useState('US')
  const [rates, setRates] = useState<RateState[]>([])
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'done' | 'no-results' | 'error'>('idle')
  const [searchError, setSearchError] = useState<string | null>(null)

  const anyBooking = rates.some(r => r.booking !== null)
  const anyChecked = rates.some(r => r.checked && !r.booking)

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
    try {
      const res = await apiClient.testBookingsSearch({ propertyId, checkIn, checkOut, adults, childrenAges })
      if (res.rates.length === 0) {
        setSearchStatus('no-results')
      } else {
        setRates(res.rates.map(r => ({ rate: r, checked: false, booking: null, bookingError: null, cancelStatus: 'idle' })))
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

  const inputClass = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Check-in</label>
          <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Check-out</label>
          <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Adults</label>
          <select value={adults} onChange={e => setAdults(Number(e.target.value))} className={inputClass}>
            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Children ages (comma-separated)</label>
          <input
            type="text"
            placeholder="e.g. 5,10"
            className={inputClass}
            onChange={e => {
              const val = e.target.value.trim()
              if (!val) { setChildrenAges([]); return }
              const ages = val.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
              setChildrenAges(ages)
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-[var(--color-text-muted)]">Nationality</label>
          <select value={nationality} onChange={e => setNationality(e.target.value)} className={inputClass}>
            {NATIONALITIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
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
        {anyBooking && (
          <button
            type="button"
            onClick={() => exportCustomToExcel(rates, { checkIn, checkOut, adults, childrenAges, nationality })}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
          >
            Export Excel
          </button>
        )}
      </div>

      {searchStatus === 'error' && <p className="text-sm text-error">{searchError}</p>}
      {searchStatus === 'no-results' && <p className="text-sm text-[var(--color-text-muted)]">No rates available for this combination.</p>}

      {searchStatus === 'done' && rates.length > 0 && (
        <RatesSubTable
          rates={rates}
          onToggle={idx => updateRate(idx, { checked: !rates[idx]!.checked })}
          onCancel={(idx, bookingId) => { void cancelBooking(idx, bookingId) }}
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
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Booking test</h2>
          <div className="flex gap-0">
            <button type="button" className={tabClass('combinations')} onClick={() => setActiveTab('combinations')}>
              Pre-made Combinations
            </button>
            <button type="button" className={tabClass('custom')} onClick={() => setActiveTab('custom')}>
              Custom
            </button>
          </div>
        </div>

        {activeTab === 'combinations' && (
          <CombinationsMode
            propertyId={propertyId}
            comboStates={comboStates}
            setComboStates={setComboStates}
          />
        )}
        {activeTab === 'custom' && <CustomMode propertyId={propertyId} />}
      </section>
    </main>
  )
}
