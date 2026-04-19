'use client'

import { useState } from 'react'
import { nightsBetween, todayIso, addDays } from '@ibe/shared'
import {
  addMonths,
  currentYearMonth,
  daysInMonth,
  firstWeekday,
  monthTitle,
  toIso,
  displayDate,
} from '@/lib/calendar-utils'

interface CalendarDropdownProps {
  checkIn: string
  checkOut: string
  initialField: 'checkin' | 'checkout'
  onDatesChange: (checkIn: string, checkOut: string) => void
  onClose: () => void
  variant?: 'dropdown' | 'inline'
  labelStart?: string
  labelEnd?: string
  labelDuration?: string
  minNights?: number
  maxNights?: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthShort(ym: string): string {
  const m = parseInt(ym.slice(5, 7), 10)
  return MONTH_SHORT[m - 1] ?? ''
}

export function CalendarDropdown({
  checkIn,
  checkOut,
  initialField,
  onDatesChange,
  onClose,
  variant = 'dropdown',
  labelStart = 'Check-in',
  labelEnd = 'Check-out',
  labelDuration = 'Nights',
  minNights = 1,
  maxNights = 365,
}: CalendarDropdownProps) {
  const today = todayIso()
  // When a check-in is selected and we're picking checkout, valid window is [checkIn+minNights, checkIn+maxNights]
  const minCheckOut = checkIn ? addDays(checkIn, minNights) : null
  const maxCheckOut = checkIn ? addDays(checkIn, maxNights) : null

  const [viewMonth, setViewMonth] = useState<string>(() => {
    const base = checkIn ? checkIn.slice(0, 7) : currentYearMonth()
    return base < currentYearMonth() ? currentYearMonth() : base
  })

  const [selecting, setSelecting] = useState<'checkin' | 'checkout'>(
    initialField === 'checkout' && !!checkIn ? 'checkout' : 'checkin',
  )

  const [hovered, setHovered] = useState<string | null>(null)

  const rangeEnd = selecting === 'checkout' ? hovered ?? checkOut : checkOut
  const canGoPrev = viewMonth > currentYearMonth()
  const nights = nightsBetween(checkIn, checkOut)

  function goToday() {
    setViewMonth(currentYearMonth())
  }

  function isDateDisabled(date: string): boolean {
    if (date < today) return true
    if (selecting === 'checkout' && checkIn) {
      if (minCheckOut && date < minCheckOut) return true
      if (maxCheckOut && date > maxCheckOut) return true
    }
    return false
  }

  function handleDayClick(date: string) {
    if (isDateDisabled(date)) return
    if (selecting === 'checkin') {
      onDatesChange(date, '')
      setSelecting('checkout')
      return
    }
    if (date > checkIn) {
      onDatesChange(checkIn, date)
      onClose()
    } else {
      onDatesChange(date, '')
      setSelecting('checkout')
    }
  }

  const dayProps = {
    today,
    checkIn,
    checkOut,
    rangeEnd: rangeEnd ?? null,
    minCheckOut,
    maxCheckOut,
    selecting,
    onDayClick: handleDayClick,
    onDayHover: (d: string) => !isDateDisabled(d) && setHovered(d),
    onMouseLeave: () => setHovered(null),
  }

  // ── Inline variant (sidebar) ───────────────────────────────────────────────

  if (variant === 'inline') {
    return (
      <div className="select-none">
        {/* Navigation */}
        <div className="mb-3 flex items-center justify-between">
          <NavBtn
            disabled={!canGoPrev}
            onClick={() => setViewMonth(m => addMonths(m, -1))}
            aria-label="Previous month"
          >
            ‹
          </NavBtn>

          <span className="text-sm font-semibold text-[var(--color-text)]">
            {monthTitle(viewMonth)}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={goToday}
              className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              Today
            </button>
            <NavBtn onClick={() => setViewMonth(m => addMonths(m, 1))} aria-label="Next month">
              ›
            </NavBtn>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="mb-1 grid grid-cols-[20px_repeat(7,1fr)]">
          <div />
          {WEEKDAYS.map(d => (
            <div
              key={d}
              className="text-center text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <InlineMonthGrid ym={viewMonth} monthShortFn={monthShort} {...dayProps} />

        {/* Summary */}
        <div className="mt-3 grid grid-cols-3 gap-1 border-t border-[var(--color-border)] pt-3">
          <SummaryItem label={labelStart} value={checkIn ? displayDate(checkIn) : '—'} />
          <SummaryItem label={labelEnd} value={checkOut ? displayDate(checkOut) : '—'} />
          <SummaryItem label={labelDuration} value={nights > 0 ? String(nights) : '—'} />
        </div>
      </div>
    )
  }

  // ── Dropdown variant (homepage search bar) ────────────────────────────────

  const rightMonth = addMonths(viewMonth, 1)

  return (
    <div className="absolute left-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
      <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
        {selecting === 'checkin' ? 'Select check-in date' : 'Select check-out date'}
      </p>
      <div className="flex items-start gap-6">
        <NavBtn
          disabled={!canGoPrev}
          onClick={() => setViewMonth(m => addMonths(m, -1))}
          aria-label="Previous month"
        >
          ‹
        </NavBtn>
        <DropdownMonthGrid ym={viewMonth} {...dayProps} />
        <DropdownMonthGrid ym={rightMonth} {...dayProps} />
        <NavBtn onClick={() => setViewMonth(m => addMonths(m, 1))} aria-label="Next month">
          ›
        </NavBtn>
      </div>
    </div>
  )
}

// ── Shared day props ──────────────────────────────────────────────────────────

interface DayProps {
  today: string
  checkIn: string
  checkOut: string
  rangeEnd: string | null
  minCheckOut: string | null
  maxCheckOut: string | null
  selecting: 'checkin' | 'checkout'
  onDayClick: (d: string) => void
  onDayHover: (d: string) => void
  onMouseLeave: () => void
}

// ── InlineMonthGrid (sidebar) ─────────────────────────────────────────────────

interface InlineMonthGridProps extends DayProps {
  ym: string
  monthShortFn: (ym: string) => string
}

function InlineMonthGrid({
  ym,
  today,
  checkIn,
  checkOut,
  rangeEnd,
  minCheckOut,
  maxCheckOut,
  selecting,
  onDayClick,
  onDayHover,
  onMouseLeave,
  monthShortFn,
}: InlineMonthGridProps) {
  const [year, month] = ym.split('-').map(Number) as [number, number]
  const startPad = firstWeekday(year, month)
  const totalDays = daysInMonth(year, month)

  type Cell = { date: string; isOverflow: boolean }
  const cells: Cell[] = []

  // Previous month overflow
  if (startPad > 0) {
    const pm = month === 1 ? 12 : month - 1
    const py = month === 1 ? year - 1 : year
    const pd = daysInMonth(py, pm)
    for (let i = startPad - 1; i >= 0; i--) {
      cells.push({ date: toIso(py, pm, pd - i), isOverflow: true })
    }
  }

  // Current month
  for (let i = 1; i <= totalDays; i++) {
    cells.push({ date: toIso(year, month, i), isOverflow: false })
  }

  // Next month overflow
  const nm = month === 12 ? 1 : month + 1
  const ny = month === 12 ? year + 1 : year
  let nd = 1
  while (cells.length % 7 !== 0) cells.push({ date: toIso(ny, nm, nd++), isOverflow: true })

  // Split into rows
  const rows: Cell[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  // Only show rows that include today or future dates
  const visibleRows = rows.filter(row => row.some(c => c.date >= today))

  // Month label for each row (show when the first cell's month changes)
  let lastYm = ''
  const rowLabels = visibleRows.map(row => {
    const ym = row[0]!.date.slice(0, 7)
    if (ym !== lastYm) { lastYm = ym; return monthShortFn(ym) }
    return ''
  })

  return (
    <div onMouseLeave={onMouseLeave}>
      {visibleRows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-[20px_repeat(7,1fr)]">
          {/* Month label */}
          <div className="flex items-center justify-end pr-1 text-[9px] font-semibold uppercase text-[var(--color-text-muted)]">
            {rowLabels[ri]}
          </div>

          {row.map(({ date, isOverflow }) => {
            const isPast = date < today
            const isOutOfRange = selecting === 'checkout' && checkIn
              ? (!!minCheckOut && date < minCheckOut) || (!!maxCheckOut && date > maxCheckOut)
              : false
            const isDisabled = isPast || isOutOfRange
            const isCheckIn = date === checkIn
            const isCheckOut = date === checkOut
            const isRangeEnd = !!rangeEnd && date === rangeEnd && date !== checkIn
            const inRange = !!(checkIn && rangeEnd && date > checkIn && date < rangeEnd)
            const isStart = isCheckIn
            const isEnd = isCheckOut || isRangeEnd
            const hasStrip = inRange
              || (isStart && !!rangeEnd && checkIn !== rangeEnd)
              || (isEnd && !!checkIn)

            return (
              <div
                key={date}
                className={['relative h-9', !isDisabled ? 'cursor-pointer' : ''].join(' ')}
                onClick={() => !isDisabled && onDayClick(date)}
                onMouseEnter={() => !isDisabled && onDayHover(date)}
              >
                {/* Range strip */}
                {hasStrip && !isDisabled && (
                  <div className={[
                    'absolute bottom-[3px] top-[3px] bg-[var(--color-primary-light)]',
                    isStart ? 'left-1/2 right-0' :
                    isEnd   ? 'left-0 right-1/2' :
                    'left-0 right-0',
                  ].join(' ')} />
                )}

                {/* Day circle */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={[
                    'relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors',
                    isDisabled
                      ? 'cursor-not-allowed text-[var(--color-text-muted)] opacity-30'
                      : (isStart || isEnd)
                      ? 'bg-[var(--color-text)] font-semibold text-white'
                      : isOverflow
                      ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-primary-light)]'
                      : 'font-medium text-[var(--color-text)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]',
                  ].join(' ')}>
                    {parseInt(date.slice(-2), 10)}
                    {date === today && (
                      <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--color-error)]" />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── DropdownMonthGrid (homepage search bar) ───────────────────────────────────

interface DropdownMonthGridProps extends DayProps {
  ym: string
}

function DropdownMonthGrid({
  ym,
  today,
  checkIn,
  checkOut,
  rangeEnd,
  minCheckOut,
  maxCheckOut,
  selecting,
  onDayClick,
  onDayHover,
  onMouseLeave,
}: DropdownMonthGridProps) {
  const [year, month] = ym.split('-').map(Number) as [number, number]
  const days = daysInMonth(year, month)
  const startPad = firstWeekday(year, month)

  const cells: Array<string | null> = [
    ...Array<null>(startPad).fill(null),
    ...Array.from({ length: days }, (_, i) => toIso(year, month, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="w-[224px]" onMouseLeave={onMouseLeave}>
      <p className="mb-3 text-center text-sm font-semibold text-[var(--color-text)]">
        {monthTitle(ym)}
      </p>

      <div className="grid grid-cols-7">
        {WEEKDAYS.map(d => (
          <div key={d} className="flex h-8 items-center justify-center text-[10px] font-medium uppercase text-[var(--color-text-muted)]">
            {d.slice(0, 2)}
          </div>
        ))}

        {cells.map((date, idx) => {
          if (!date) return <div key={`pad-${idx}`} className="h-9" />

          const isPast = date < today
          const isOutOfRange = selecting === 'checkout' && checkIn
            ? (!!minCheckOut && date < minCheckOut) || (!!maxCheckOut && date > maxCheckOut)
            : false
          const isDisabled = isPast || isOutOfRange
          const isCheckIn = date === checkIn
          const isCheckOut = date === checkOut
          const isRangeEnd = !!rangeEnd && date === rangeEnd && date !== checkIn
          const inRange = !!(checkIn && rangeEnd && date > checkIn && date < rangeEnd)
          const isStart = isCheckIn
          const isEnd = isCheckOut || isRangeEnd
          const hasStrip = inRange
            || (isStart && !!rangeEnd && checkIn !== rangeEnd)
            || (isEnd && !!checkIn)

          return (
            <div
              key={date}
              className={['relative h-9', !isDisabled ? 'cursor-pointer' : ''].join(' ')}
              onClick={() => !isDisabled && onDayClick(date)}
              onMouseEnter={() => !isDisabled && onDayHover(date)}
            >
              {hasStrip && !isDisabled && (
                <div className={[
                  'absolute bottom-[4px] top-[4px] bg-[var(--color-primary-light)]',
                  isStart ? 'left-1/2 right-0' :
                  isEnd   ? 'left-0 right-1/2' :
                  'left-0 right-0',
                ].join(' ')} />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={[
                  'relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium select-none transition-colors',
                  isDisabled
                    ? 'cursor-not-allowed text-[var(--color-text-muted)] opacity-40'
                    : (isStart || isEnd)
                    ? 'bg-[var(--color-text)] font-semibold text-white'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]',
                ].join(' ')}>
                  {parseInt(date.slice(-2), 10)}
                  {date === today && (
                    <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--color-error)]" />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── NavBtn ────────────────────────────────────────────────────────────────────

function NavBtn({
  children,
  onClick,
  disabled = false,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-base text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

// ── SummaryItem ───────────────────────────────────────────────────────────────

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        <svg className="h-3 w-3 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </span>
      </div>
      <span className="text-xs font-semibold text-[var(--color-text)]">{value}</span>
    </div>
  )
}
