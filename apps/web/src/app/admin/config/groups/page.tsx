'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import { SaveBar } from '../../design/components'
import type {
  GroupConfig, GroupConfigUpdate, GroupPropertyOverride,
  GroupCancellationRange, GroupPaymentRange,
  GroupBookingMode, GroupPricingDirection,
  GroupMealsConfig, GroupMeetingRoomConfig, GroupFreeRoomsConfig,
  GroupRateSelection, GroupRatePriorityItem,
} from '@ibe/shared'
import { DEFAULT_RATE_PRIORITY } from '@ibe/shared'

const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

// ── Cancellation / Payment Ranges editor ──────────────────────────────────────

type RangeItem = { triggerType: 'on_confirmation' | 'days_before'; daysBeforeCheckin?: number; pct: number }

function maxDaysForIndex(ranges: RangeItem[], i: number): number {
  let min = 364
  for (let j = 0; j < i; j++) {
    const prev = ranges[j]
    if (prev?.triggerType === 'days_before') min = Math.min(min, (prev.daysBeforeCheckin ?? 365) - 1)
  }
  return min
}

function RangesEditor({
  label,
  hint,
  ranges,
  onChange,
}: {
  label: string
  hint: string
  ranges: RangeItem[]
  onChange: (r: RangeItem[]) => void
}) {
  function add() {
    const existing = ranges.filter(r => r.triggerType === 'days_before').map(r => r.daysBeforeCheckin ?? 0)
    const startDays = existing.length === 0 ? 30 : Math.max(1, Math.min(...existing) - 1)
    onChange([...ranges, { triggerType: 'days_before', daysBeforeCheckin: startDays, pct: 0 }])
  }
  function remove(i: number) { onChange(ranges.filter((_, idx) => idx !== i)) }
  function update(i: number, patch: Partial<RangeItem>) {
    onChange(ranges.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  const total = ranges.reduce((s, r) => s + r.pct, 0)

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-[var(--color-text)]">{label}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{hint} Only the first range may be &ldquo;on confirmation&rdquo;; subsequent ranges must be days before check-in.</p>
      </div>

      {ranges.map((r, i) => {
        const cap = maxDaysForIndex(ranges, i)
        const pctMax = 100 - ranges.reduce((s, x, idx) => idx !== i ? s + x.pct : s, 0)
        return (
          <div key={i} className="flex items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
            {i === 0 ? (
              <div className="flex-1">
                <label className={labelCls}>Trigger</label>
                <select className={inputCls} value={r.triggerType}
                  onChange={e => {
                    const t = e.target.value as RangeItem['triggerType']
                    update(i, { triggerType: t, ...(t === 'days_before' && !r.daysBeforeCheckin ? { daysBeforeCheckin: 30 } : {}) })
                  }}>
                  <option value="on_confirmation">On confirmation</option>
                  <option value="days_before">Days before check-in</option>
                </select>
              </div>
            ) : null}
            {(i > 0 || r.triggerType === 'days_before') && (
              <div className={i === 0 ? 'w-32' : 'flex-1'}>
                <label className={labelCls}>
                  Days before check-in{i > 0 && cap < 364 ? <span className="ml-1 text-[var(--color-text-muted)]">(max {cap})</span> : null}
                </label>
                <input type="number" min={1} max={cap} className={inputCls}
                  value={r.daysBeforeCheckin ?? cap}
                  onFocus={e => e.target.select()}
                  onChange={e => update(i, { daysBeforeCheckin: Math.min(parseInt(e.target.value) || 1, cap) })} />
              </div>
            )}
            <div className="w-24">
              <label className={labelCls}>% of total</label>
              <input type="number" min={0} max={pctMax} step={1} className={inputCls}
                value={r.pct}
                onFocus={e => e.target.select()}
                onChange={e => update(i, { pct: Math.min(parseFloat(e.target.value) || 0, pctMax) })} />
            </div>
            <button onClick={() => remove(i)}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-error)] hover:border-[var(--color-error)]">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}

      <div className="flex items-center justify-between">
        <button onClick={add}
          className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
          + Add range
        </button>
        {ranges.length > 0 && (
          <span className={['text-xs font-medium', total === 100 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'].join(' ')}>
            Total: {total}% {total !== 100 ? '(should be 100%)' : '✓'}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Chain config editor ───────────────────────────────────────────────────────

const BOARD_LABELS: Record<string, string> = {
  RO: 'Room Only',
  BB: 'Bed & Breakfast',
  HB: 'Half Board',
  FB: 'Full Board',
  AI: 'All Inclusive',
}

function RatePriorityEditor({
  items,
  onChange,
}: {
  items: GroupRatePriorityItem[]
  onChange: (items: GroupRatePriorityItem[]) => void
}) {
  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    const tmp = next[i]!
    next[i] = next[j]!
    next[j] = tmp
    onChange(next)
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={`${item.board}-${item.isRefundable}`}
          className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-muted)]">{i + 1}</span>
          <span className="flex-1 text-sm text-[var(--color-text)]">
            {BOARD_LABELS[item.board] ?? item.board}
            <span className={['ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium',
              item.isRefundable
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
            ].join(' ')}>
              {item.isRefundable ? 'Refundable' : 'Non-refundable'}
            </span>
          </span>
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-border)] disabled:opacity-30">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-border)] disabled:opacity-30">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={() => onChange(DEFAULT_RATE_PRIORITY)}
        className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] underline">
        Reset to default order
      </button>
    </div>
  )
}

type ChainForm = {
  enabled: boolean
  bookingMode: GroupBookingMode
  groupEmail: string
  pricingDirection: GroupPricingDirection
  pricingPct: number
  cancellationRanges: GroupCancellationRange[]
  paymentInParWithCancellation: boolean
  paymentRanges: GroupPaymentRange[]
  mealsConfig: GroupMealsConfig
  meetingRoomConfig: GroupMeetingRoomConfig
  freeRoomsConfig: GroupFreeRoomsConfig
  groupPolicies: string
  rateSelection: GroupRateSelection
  ratePriority: GroupRatePriorityItem[]
}

function toForm(d: GroupConfig): ChainForm {
  return {
    enabled: d.enabled,
    bookingMode: d.bookingMode,
    groupEmail: d.groupEmail ?? '',
    pricingDirection: d.pricingDirection,
    pricingPct: d.pricingPct,
    cancellationRanges: d.cancellationRanges,
    paymentInParWithCancellation: d.paymentInParWithCancellation,
    paymentRanges: d.paymentRanges,
    mealsConfig: d.mealsConfig,
    meetingRoomConfig: d.meetingRoomConfig,
    freeRoomsConfig: d.freeRoomsConfig,
    groupPolicies: d.groupPolicies ?? '',
    rateSelection: d.rateSelection ?? 'all',
    ratePriority: d.ratePriority ?? DEFAULT_RATE_PRIORITY,
  }
}

function ChainGroupsConfig({ orgId }: { orgId?: number }) {
  const qc = useQueryClient()
  const queryKey = ['groups-config', orgId]
  const { propertyId } = useAdminProperty()

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiClient.getGroupConfig(orgId),
    enabled: orgId !== undefined,
  })

  const { data: hotelCfg } = useQuery({
    queryKey: ['hotel-config-admin', propertyId],
    queryFn: () => apiClient.getHotelConfigAdmin(propertyId!),
    enabled: propertyId !== null,
  })
  const currency = hotelCfg?.defaultCurrency ?? 'USD'

  const saveMut = useMutation({
    mutationFn: (u: GroupConfigUpdate) => apiClient.updateGroupConfig(u, orgId),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey })
      setForm(toForm(saved))
    },
  })

  const [form, setForm] = useState<ChainForm | null>(null)

  useEffect(() => {
    if (data && form === null) setForm(toForm(data))
  }, [data, form])

  const isDirty = form !== null && data !== undefined && JSON.stringify(form) !== JSON.stringify(toForm(data))

  function set<K extends keyof ChainForm>(k: K, v: ChainForm[K]) {
    setForm(f => f ? { ...f, [k]: v } : f)
  }

  function save() {
    if (!form) return
    saveMut.mutate({
      enabled: form.enabled,
      bookingMode: form.bookingMode,
      groupEmail: form.groupEmail || null,
      pricingDirection: form.pricingDirection,
      pricingPct: form.pricingPct,
      cancellationRanges: form.cancellationRanges,
      paymentInParWithCancellation: form.paymentInParWithCancellation,
      paymentRanges: form.paymentRanges,
      mealsConfig: form.mealsConfig,
      meetingRoomConfig: form.meetingRoomConfig,
      freeRoomsConfig: form.freeRoomsConfig,
      groupPolicies: form.groupPolicies || null,
      rateSelection: form.rateSelection,
      ratePriority: form.ratePriority,
    })
  }

  if (orgId === undefined) return <p className="text-sm text-[var(--color-text-muted)]">Select a property to configure groups.</p>
  if (isError) return <p className="text-sm text-[var(--color-error)]">Failed to load.</p>
  if (isLoading || !form) return <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>

  return (
    <div className="space-y-5">
      {/* Enable + Mode + Email */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Toggle checked={form.enabled} onChange={v => set('enabled', v)} />
          <span className="text-sm text-[var(--color-text)]">
            {form.enabled ? 'Groups module enabled' : 'Groups module disabled'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Booking mode</label>
            <select className={inputCls} value={form.bookingMode}
              onChange={e => set('bookingMode', e.target.value as GroupBookingMode)}>
              <option value="offline">Offline — email inquiry</option>
              <option value="online">Online — direct booking</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Group department email</label>
            <input className={inputCls} type="email" value={form.groupEmail}
              placeholder="groups@hotel.com"
              onChange={e => set('groupEmail', e.target.value)} />
            <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
              Inquiry emails for offline mode are sent here.
            </p>
          </div>
        </div>
      </div>

      {/* Pricing modifier */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Group Pricing</p>
          <p className="text-xs text-[var(--color-text-muted)]">Adjust rack rates for group bookings.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Direction</label>
            <select className={inputCls} value={form.pricingDirection}
              onChange={e => set('pricingDirection', e.target.value as GroupPricingDirection)}>
              <option value="decrease">Discount (decrease)</option>
              <option value="increase">Surcharge (increase)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Percentage (%)</label>
            <input type="number" min={0} max={100} step={0.5} className={inputCls}
              value={form.pricingPct}
              onFocus={e => e.target.select()}
              onChange={e => set('pricingPct', parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          Applied to rack rates to compute group price shown to guests.
        </p>
      </div>

      {/* Cancellation policy */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <RangesEditor
          label="Cancellation Policy"
          hint="Define when each portion of the total becomes non-refundable."
          ranges={form.cancellationRanges}
          onChange={r => set('cancellationRanges', r as GroupCancellationRange[])}
        />
      </div>

      {/* Payment schedule */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Payment Schedule</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {form.paymentInParWithCancellation
                ? 'Payment mirrors the cancellation waterfall.'
                : 'Custom payment schedule (independent of cancellation policy).'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">Custom schedule</span>
            <Toggle
              checked={!form.paymentInParWithCancellation}
              onChange={v => set('paymentInParWithCancellation', !v)}
            />
          </div>
        </div>
        {!form.paymentInParWithCancellation && (
          <RangesEditor
            label="Payment Milestones"
            hint="Define when each payment installment is due."
            ranges={form.paymentRanges}
            onChange={r => set('paymentRanges', r as GroupPaymentRange[])}
          />
        )}
      </div>

      {/* Meals */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Meals</p>
          <p className="text-xs text-[var(--color-text-muted)]">Configure included or add-on meal options for group bookings.</p>
        </div>
        {(['breakfast', 'lunch', 'dinner'] as const).map(meal => {
          const m = form.mealsConfig[meal]
          const label = meal.charAt(0).toUpperCase() + meal.slice(1)
          const currentMeals = form.mealsConfig
          function setMeal(patch: Partial<typeof m>) {
            set('mealsConfig', { ...currentMeals, [meal]: { ...m, ...patch } })
          }
          return (
            <div key={meal} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Toggle checked={m.enabled} onChange={v => setMeal({ enabled: v })} />
                <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
              </div>
              {m.enabled && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Adult ({currency})</label>
                    <input type="number" min={0} step={0.01} className={inputCls}
                      value={m.priceAdult}
                      onFocus={e => e.target.select()}
                      onChange={e => setMeal({ priceAdult: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label className={labelCls}>Child ({currency})</label>
                    <input type="number" min={0} step={0.01} className={inputCls}
                      value={m.priceChild}
                      onFocus={e => e.target.select()}
                      onChange={e => setMeal({ priceChild: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label className={labelCls}>Infant ({currency})</label>
                    <input type="number" min={0} step={0.01} className={inputCls}
                      value={m.priceInfant}
                      onFocus={e => e.target.select()}
                      onChange={e => setMeal({ priceInfant: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <p className="text-[10px] text-[var(--color-text-muted)]">
          Child/Infant age ranges are set in Room Search &rarr; Guest Age Groups.
        </p>
      </div>

      {/* Meeting Room */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Meeting Room</p>
          <p className="text-xs text-[var(--color-text-muted)]">Offer a meeting room add-on for group bookings.</p>
        </div>
        <div className="flex items-center gap-3">
          <Toggle checked={form.meetingRoomConfig.enabled}
            onChange={v => set('meetingRoomConfig', { ...form.meetingRoomConfig, enabled: v })} />
          <span className="text-sm text-[var(--color-text)]">
            {form.meetingRoomConfig.enabled ? 'Meeting room enabled' : 'Meeting room disabled'}
          </span>
        </div>
        {form.meetingRoomConfig.enabled && (
          <div className="max-w-xs">
            <label className={labelCls}>Price per day ({currency})</label>
            <input type="number" min={0} step={0.01} className={inputCls}
              value={form.meetingRoomConfig.pricePerDay}
              onFocus={e => e.target.select()}
              onChange={e => set('meetingRoomConfig', { ...form.meetingRoomConfig, pricePerDay: parseFloat(e.target.value) || 0 })} />
          </div>
        )}
      </div>

      {/* Free Rooms */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Free Rooms</p>
          <p className="text-xs text-[var(--color-text-muted)]">Complimentary rooms for guide, driver, or staff.</p>
        </div>
        <div className="flex items-center gap-3">
          <Toggle checked={form.freeRoomsConfig.enabled}
            onChange={v => set('freeRoomsConfig', { ...form.freeRoomsConfig, enabled: v })} />
          <span className="text-sm text-[var(--color-text)]">
            {form.freeRoomsConfig.enabled ? 'Free rooms enabled' : 'Free rooms disabled'}
          </span>
        </div>
        {form.freeRoomsConfig.enabled && (
          <div className="max-w-xs">
            <label className={labelCls}>Free rooms (guide, driver, etc.)</label>
            <input type="number" min={0} step={1} className={inputCls}
              value={form.freeRoomsConfig.count}
              onFocus={e => e.target.select()}
              onChange={e => set('freeRoomsConfig', { ...form.freeRoomsConfig, count: parseInt(e.target.value) || 0 })} />
          </div>
        )}
      </div>

      {/* Rates */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-5">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Rates</p>
          <p className="text-xs text-[var(--color-text-muted)]">Control which rates are eligible for groups and the order they are displayed and selected.</p>
        </div>

        {/* Rate Selection */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Rate Selection</p>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 hover:border-[var(--color-primary)]">
            <input type="radio" name="rateSelection" value="all"
              checked={form.rateSelection === 'all'}
              onChange={() => set('rateSelection', 'all')}
              className="mt-0.5 accent-[var(--color-primary)]" />
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">All Rates</p>
              <p className="text-xs text-[var(--color-text-muted)]">Use all available rates returned by the search.</p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 hover:border-[var(--color-primary)]">
            <input type="radio" name="rateSelection" value="group_only"
              checked={form.rateSelection === 'group_only'}
              onChange={() => set('rateSelection', 'group_only')}
              className="mt-0.5 accent-[var(--color-primary)]" />
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Group-Designated Rates Only</p>
              <p className="text-xs text-[var(--color-text-muted)]">Use only rates whose name contains &ldquo;group&rdquo; or &ldquo;groups&rdquo;, or that are explicitly tagged as group rates.</p>
            </div>
          </label>
        </div>

        {/* Rate Priority */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Rate Priority Order</p>
          <p className="text-xs text-[var(--color-text-muted)]">The first matching rate in this list is used for pricing. Reorder with the arrows.</p>
          <RatePriorityEditor
            items={form.ratePriority}
            onChange={v => set('ratePriority', v)}
          />
        </div>
      </div>

      {/* Group Policies */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Group Policies</p>
          <p className="text-xs text-[var(--color-text-muted)]">General terms and conditions shown to guests on the booking confirmation step.</p>
        </div>
        <textarea
          className={inputCls + ' resize-y min-h-[120px]'}
          value={form.groupPolicies}
          onChange={e => set('groupPolicies', e.target.value)}
          placeholder="e.g. A deposit of 30% is required within 3 days of confirmation. Rooms must be confirmed 14 days prior to arrival…"
          rows={5}
        />
      </div>

      {saveMut.isError && <p className="text-sm text-[var(--color-error)]">Save failed. Please try again.</p>}

      <SaveBar isDirty={isDirty} isSaving={saveMut.isPending} onSave={save} />
    </div>
  )
}

// ── Property override editor ──────────────────────────────────────────────────

type OverrideForm = {
  enabled: '' | 'true' | 'false'
  bookingMode: string
  groupEmail: string
  pricingDirection: string
  pricingPct: string
}

function toOverrideForm(d: GroupPropertyOverride): OverrideForm {
  return {
    enabled: d.enabled === null ? '' : d.enabled ? 'true' : 'false',
    bookingMode: d.bookingMode ?? '',
    groupEmail: d.groupEmail ?? '',
    pricingDirection: d.pricingDirection ?? '',
    pricingPct: d.pricingPct !== null ? String(d.pricingPct) : '',
  }
}

function PropertyGroupsOverride({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const queryKey = ['groups-property-override', propertyId]

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiClient.getPropertyGroupOverride(propertyId),
  })

  const saveMut = useMutation({
    mutationFn: (u: Partial<GroupPropertyOverride>) => apiClient.updatePropertyGroupOverride(propertyId, u),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey })
      setForm(toOverrideForm(saved))
    },
  })

  const [form, setForm] = useState<OverrideForm | null>(null)

  useEffect(() => {
    if (data && form === null) setForm(toOverrideForm(data))
  }, [data, form])

  const isDirty = form !== null && data !== undefined && JSON.stringify(form) !== JSON.stringify(toOverrideForm(data))

  function set<K extends keyof OverrideForm>(k: K, v: OverrideForm[K]) {
    setForm(f => f ? { ...f, [k]: v } : f)
  }

  function save() {
    if (!form) return
    saveMut.mutate({
      enabled: form.enabled === '' ? null : form.enabled === 'true',
      bookingMode: (form.bookingMode as GroupBookingMode) || null,
      groupEmail: form.groupEmail || null,
      pricingDirection: (form.pricingDirection as GroupPricingDirection) || null,
      pricingPct: form.pricingPct !== '' ? parseFloat(form.pricingPct) : null,
    })
  }

  if (isError) return <p className="text-sm text-[var(--color-error)]">Failed to load property override.</p>
  if (isLoading || !form) return <p className="text-sm text-[var(--color-text-muted)]">Loading property override…</p>

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-5">
      <div>
        <p className="text-sm font-semibold text-[var(--color-text)]">Property Override</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Set to override chain-level defaults for this property. Leave blank to inherit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Enable override</label>
          <select className={inputCls} value={form.enabled}
            onChange={e => set('enabled', e.target.value as OverrideForm['enabled'])}>
            <option value="">Inherit from chain</option>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Booking mode override</label>
          <select className={inputCls} value={form.bookingMode}
            onChange={e => set('bookingMode', e.target.value)}>
            <option value="">Inherit from chain</option>
            <option value="offline">Offline — email inquiry</option>
            <option value="online">Online — direct booking</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Group email override</label>
          <input className={inputCls} type="email" value={form.groupEmail}
            placeholder="Leave blank to inherit"
            onChange={e => set('groupEmail', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Pricing direction override</label>
          <select className={inputCls} value={form.pricingDirection}
            onChange={e => set('pricingDirection', e.target.value)}>
            <option value="">Inherit from chain</option>
            <option value="decrease">Discount (decrease)</option>
            <option value="increase">Surcharge (increase)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Pricing % override</label>
          <input type="number" min={0} max={100} step={0.5} className={inputCls}
            value={form.pricingPct}
            placeholder="Inherit from chain"
            onChange={e => set('pricingPct', e.target.value)} />
        </div>
      </div>

      {saveMut.isError && <p className="text-xs text-[var(--color-error)]">Save failed.</p>}

      <SaveBar isDirty={isDirty} isSaving={saveMut.isPending} onSave={save} />
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function GroupsConfigPage() {
  const { admin } = useAdminAuth()
  const { propertyId, orgId: contextOrgId } = useAdminProperty()
  const qc = useQueryClient()
  const isSuper = admin?.role === 'super'

  // For super admins, contextOrgId may be null if they navigated directly or
  // auto-select ran before the fix. Fall back to the cached property list.
  const orgId = useMemo(() => {
    if (!isSuper) return admin?.organizationId ?? undefined
    if (contextOrgId != null) return contextOrgId
    if (propertyId != null) {
      const cached = qc.getQueryData<{ properties: { propertyId: number; orgId?: number }[] }>(['admin-super-properties'])
      const match = cached?.properties.find(p => p.propertyId === propertyId)
      if (match?.orgId) return match.orgId
    }
    return undefined
  }, [isSuper, admin?.organizationId, contextOrgId, propertyId, qc])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Groups</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Configure group booking settings — pricing, cancellation policy, and payment schedule.
          The FIT threshold (max individual rooms) is set under <strong>Offers → Max rooms</strong>.
        </p>
      </div>

      <ChainGroupsConfig {...(orgId !== undefined ? { orgId } : {})} />

      {propertyId !== null && propertyId !== undefined && (
        <PropertyGroupsOverride propertyId={propertyId} />
      )}
    </div>
  )
}
