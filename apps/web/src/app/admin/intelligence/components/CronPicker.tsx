'use client'

import { useState, useEffect } from 'react'

const DOW_OPTIONS = [
  { label: 'Sun', full: 'Sunday',    value: 0 },
  { label: 'Mon', full: 'Monday',    value: 1 },
  { label: 'Tue', full: 'Tuesday',   value: 2 },
  { label: 'Wed', full: 'Wednesday', value: 3 },
  { label: 'Thu', full: 'Thursday',  value: 4 },
  { label: 'Fri', full: 'Friday',    value: 5 },
  { label: 'Sat', full: 'Saturday',  value: 6 },
]

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th',
  '11th', '12th', '13th', '14th', '15th', '16th', '17th', '18th', '19th', '20th',
  '21st', '22nd', '23rd', '24th', '25th', '26th', '27th', '28th', '29th', '30th', '31st']

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function hourLabel(h: number): string {
  if (h === 0) return 'Midnight (12:00 AM)'
  if (h === 12) return '12:00 PM (noon)'
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`
}

function minuteLabel(m: number): string {
  return m === 0 ? '0 (on the hour)' : String(m)
}

// Parse a cron dow field like "1,3,5" or "*" into a Set of numbers (empty = *)
function parseDow(field: string): Set<number> {
  if (field === '*') return new Set()
  const nums = field.split(',').map(Number).filter(n => !isNaN(n))
  return new Set(nums)
}

// Serialize a Set back to cron field
function serializeDow(selected: Set<number>): string {
  if (selected.size === 0) return '*'
  return [...selected].sort((a, b) => a - b).join(',')
}

function parseCron(cron: string): [string, string, string, string, string] {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return ['0', '4', '*', '*', '*']
  return parts as [string, string, string, string, string]
}

function buildCron(parts: [string, string, string, string, string]): string {
  return parts.join(' ')
}

// ── Simple single-value select ────────────────────────────────────────────────

interface FieldSelectProps {
  label: string
  value: string
  options: { label: string; value: string }[]
  onChange: (v: string) => void
}

function FieldSelect({ label, value, options, onChange }: FieldSelectProps) {
  const known = options.some(o => o.value === value)
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={[
          'rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]',
          'px-2 py-1.5 text-sm text-[var(--color-text)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]',
        ].join(' ')}
      >
        {!known && <option value={value}>{value}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ── Day-of-week toggle buttons ────────────────────────────────────────────────

interface DowPickerProps {
  value: string        // cron dow field, e.g. "*" or "1,3,5"
  onChange: (v: string) => void
}

function DowPicker({ value, onChange }: DowPickerProps) {
  const [selected, setSelected] = useState<Set<number>>(() => parseDow(value))

  useEffect(() => {
    setSelected(parseDow(value))
  }, [value])

  function toggle(day: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day); else next.add(day)
      onChange(serializeDow(next))
      return next
    })
  }

  const allSelected = selected.size === 0

  function toggleAll() {
    const next = new Set<number>()
    onChange(serializeDow(next))
    setSelected(next)
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        Day of week
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={toggleAll}
          className={[
            'rounded px-2 py-1 text-xs font-medium border transition-colors',
            allSelected
              ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
              : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]',
          ].join(' ')}
        >
          Every
        </button>
        {DOW_OPTIONS.map(d => {
          const active = selected.has(d.value)
          return (
            <button
              key={d.value}
              type="button"
              title={d.full}
              onClick={() => toggle(d.value)}
              className={[
                'rounded px-2 py-1 text-xs font-medium border transition-colors',
                active
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]',
              ].join(' ')}
            >
              {d.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main CronPicker ───────────────────────────────────────────────────────────

interface CronPickerProps {
  value: string
  onChange: (value: string) => void
}

export function CronPicker({ value, onChange }: CronPickerProps) {
  const parts = parseCron(value)

  function setPart(index: number, v: string) {
    const next = [...parts] as [string, string, string, string, string]
    next[index] = v
    onChange(buildCron(next))
  }

  const minuteOpts = [
    { label: '* (every minute)', value: '*' },
    ...Array.from({ length: 60 }, (_, i) => ({ label: minuteLabel(i), value: String(i) })),
  ]

  const hourOpts = [
    { label: '* (every hour)', value: '*' },
    ...Array.from({ length: 24 }, (_, i) => ({ label: hourLabel(i), value: String(i) })),
  ]

  const domOpts = [
    { label: '* (every day)', value: '*' },
    ...Array.from({ length: 31 }, (_, i) => ({ label: ORDINAL[i + 1]!, value: String(i + 1) })),
  ]

  const monthOpts = [
    { label: '* (every month)', value: '*' },
    ...Array.from({ length: 12 }, (_, i) => ({ label: MONTH_NAMES[i + 1]!, value: String(i + 1) })),
  ]

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FieldSelect label="Minute"       value={parts[0]} options={minuteOpts} onChange={v => setPart(0, v)} />
      <FieldSelect label="Hour"         value={parts[1]} options={hourOpts}   onChange={v => setPart(1, v)} />
      <FieldSelect label="Day of month" value={parts[2]} options={domOpts}    onChange={v => setPart(2, v)} />
      <FieldSelect label="Month"        value={parts[3]} options={monthOpts}  onChange={v => setPart(3, v)} />
      <DowPicker value={parts[4]} onChange={v => setPart(4, v)} />
    </div>
  )
}
