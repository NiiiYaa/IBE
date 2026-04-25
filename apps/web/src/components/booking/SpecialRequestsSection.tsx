'use client'

import { useState } from 'react'

export interface SpecialRequestsState {
  highFloor: boolean
  lowFloor: boolean
  quietRoom: boolean
  quietWorkspace: boolean
  nearElevator: boolean
  awayFromElevator: boolean
  connectingRooms: boolean
  earlyCheckIn: string     // '' = not selected, '08:00' etc.
  lateCheckOut: string
  nonSmoking: boolean
  honeymoon: boolean
  birthdayAnniversary: boolean
  earlyBreakfast: boolean
  takeawayBreakfast: boolean
  other: string
}

export const DEFAULT_SPECIAL_REQUESTS: SpecialRequestsState = {
  highFloor: false, lowFloor: false, quietRoom: false, quietWorkspace: false,
  nearElevator: false, awayFromElevator: false, connectingRooms: false,
  earlyCheckIn: '', lateCheckOut: '',
  nonSmoking: false, honeymoon: false, birthdayAnniversary: false,
  earlyBreakfast: false, takeawayBreakfast: false,
  other: '',
}

export function serializeSpecialRequests(r: SpecialRequestsState): string[] {
  const out: string[] = []
  if (r.highFloor)           out.push('High floor')
  if (r.lowFloor)            out.push('Low floor')
  if (r.quietRoom)           out.push('Quiet room')
  if (r.quietWorkspace)      out.push('Quiet workspace')
  if (r.nearElevator)        out.push('Near elevator')
  if (r.awayFromElevator)    out.push('Away from elevator')
  if (r.connectingRooms)     out.push('Connecting / adjoining rooms')
  if (r.earlyCheckIn)        out.push(`Early check-in: ${r.earlyCheckIn}`)
  if (r.lateCheckOut)        out.push(`Late check-out: ${r.lateCheckOut}`)
  if (r.nonSmoking)          out.push('Non-smoking room')
  if (r.honeymoon)           out.push('Honeymoon setup')
  if (r.birthdayAnniversary) out.push('Birthday / anniversary surprise')
  if (r.earlyBreakfast)      out.push('Early breakfast')
  if (r.takeawayBreakfast)   out.push('Takeaway breakfast')
  if (r.other.trim())        out.push(`Other: ${r.other.trim()}`)
  return out
}

const EARLY_CHECKIN_HOURS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00']
const LATE_CHECKOUT_HOURS  = ['13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00']

function Checkbox({ id, label, checked, onChange }: {
  id: string; label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox" id={id} checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)] cursor-pointer"
      />
      <span className="text-sm text-[var(--color-text)]">{label}</span>
    </label>
  )
}

interface Props {
  value: SpecialRequestsState
  onChange: (v: SpecialRequestsState) => void
  multiRoom: boolean
}

export function SpecialRequestsSection({ value, onChange, multiRoom }: Props) {
  const [open, setOpen] = useState(false)
  const set = <K extends keyof SpecialRequestsState>(k: K, v: SpecialRequestsState[K]) =>
    onChange({ ...value, [k]: v })

  const selectedCount = serializeSpecialRequests(value).length

  const selectCls = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'
  const textareaCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)] resize-none'
  const groupLabel = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]'

  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-background)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm font-semibold text-[var(--color-text)]">Special Requests</span>
          {selectedCount > 0 && (
            <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
              {selectedCount}
            </span>
          )}
        </div>
        <svg
          className={['h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200', open ? 'rotate-180' : ''].join(' ')}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[var(--color-border)] px-4 py-4 space-y-5">

          {/* Room preferences */}
          <div>
            <span className={groupLabel}>Room preferences</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Checkbox id="sr-high-floor"   label="High floor"   checked={value.highFloor}   onChange={v => set('highFloor', v)} />
              <Checkbox id="sr-low-floor"    label="Low floor"    checked={value.lowFloor}    onChange={v => set('lowFloor', v)} />
              <Checkbox id="sr-quiet-room"   label="Quiet room"   checked={value.quietRoom}   onChange={v => set('quietRoom', v)} />
              <Checkbox id="sr-quiet-ws"     label="Quiet workspace" checked={value.quietWorkspace} onChange={v => set('quietWorkspace', v)} />
              <Checkbox id="sr-near-elev"    label="Near elevator"    checked={value.nearElevator}   onChange={v => set('nearElevator', v)} />
              <Checkbox id="sr-away-elev"    label="Away from elevator" checked={value.awayFromElevator} onChange={v => set('awayFromElevator', v)} />
              {multiRoom && (
                <Checkbox id="sr-connecting" label="Connecting / adjoining rooms" checked={value.connectingRooms} onChange={v => set('connectingRooms', v)} />
              )}
            </div>
          </div>

          {/* Timing */}
          <div>
            <span className={groupLabel}>Check-in / Check-out timing</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="sr-early-ci" checked={!!value.earlyCheckIn}
                  onChange={e => set('earlyCheckIn', e.target.checked ? '09:00' : '')}
                  className="h-4 w-4 shrink-0 accent-[var(--color-primary)] cursor-pointer"
                />
                <label htmlFor="sr-early-ci" className="text-sm text-[var(--color-text)] cursor-pointer">Early check-in</label>
                {value.earlyCheckIn && (
                  <select value={value.earlyCheckIn} onChange={e => set('earlyCheckIn', e.target.value)} className={selectCls}>
                    {EARLY_CHECKIN_HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="sr-late-co" checked={!!value.lateCheckOut}
                  onChange={e => set('lateCheckOut', e.target.checked ? '14:00' : '')}
                  className="h-4 w-4 shrink-0 accent-[var(--color-primary)] cursor-pointer"
                />
                <label htmlFor="sr-late-co" className="text-sm text-[var(--color-text)] cursor-pointer">Late check-out</label>
                {value.lateCheckOut && (
                  <select value={value.lateCheckOut} onChange={e => set('lateCheckOut', e.target.value)} className={selectCls}>
                    {LATE_CHECKOUT_HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Room type */}
          <div>
            <span className={groupLabel}>Room type</span>
            <Checkbox id="sr-non-smoking" label="Non-smoking room" checked={value.nonSmoking} onChange={v => set('nonSmoking', v)} />
          </div>

          {/* Special occasions */}
          <div>
            <span className={groupLabel}>Special occasions</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Checkbox id="sr-honeymoon"  label="Honeymoon setup"              checked={value.honeymoon}          onChange={v => set('honeymoon', v)} />
              <Checkbox id="sr-birthday"   label="Birthday / anniversary surprise" checked={value.birthdayAnniversary} onChange={v => set('birthdayAnniversary', v)} />
            </div>
          </div>

          {/* Breakfast */}
          <div>
            <span className={groupLabel}>Breakfast preferences</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Checkbox id="sr-early-bkfst"    label="Early breakfast"    checked={value.earlyBreakfast}    onChange={v => set('earlyBreakfast', v)} />
              <Checkbox id="sr-takeaway-bkfst" label="Takeaway breakfast" checked={value.takeawayBreakfast} onChange={v => set('takeawayBreakfast', v)} />
            </div>
          </div>

          {/* Other */}
          <div>
            <label htmlFor="sr-other" className={groupLabel}>Other requests</label>
            <textarea
              id="sr-other"
              rows={3}
              value={value.other}
              onChange={e => set('other', e.target.value)}
              placeholder="Any other requests for the hotel…"
              className={textareaCls}
              maxLength={500}
            />
          </div>
        </div>
      )}
    </div>
  )
}
