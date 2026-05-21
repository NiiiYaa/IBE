'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarDropdown } from '@/components/search/CalendarDropdown'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminProperty } from '../../property-context'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { apiClient } from '@/lib/api-client'
import { SaveBar } from '@/app/admin/design/components'
import { CronPicker } from '../components/CronPicker'
import type {
  SystemEventCalendarConfig,
  EventCalendarEvent,
} from '@ibe/shared'

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!
}

function todayPlus60Str(): string {
  const d = new Date()
  d.setDate(d.getDate() + 60)
  return d.toISOString().split('T')[0]!
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (start === end) {
    return s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (s.getMonth() === e.getMonth()) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.getDate()}`
  }
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

const DEMAND_BADGE: Record<string, { label: string; className: string }> = {
  high: { label: 'High', className: 'bg-red-100 text-red-700' },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-700' },
  low: { label: 'Low', className: 'bg-green-100 text-green-700' },
}

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: EventCalendarEvent }) {
  const badge = DEMAND_BADGE[event.demandLevel] ?? DEMAND_BADGE.low!
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{event.name}</p>
          <p className="text-sm text-gray-500">{formatDateRange(event.startDate, event.endDate)}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-600">{event.description}</p>
      <p className="mt-1 text-xs text-gray-400 italic">{event.demandDescription}</p>
    </div>
  )
}

// ── System Config Panel ───────────────────────────────────────────────────────

function SystemConfigPanel() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['eventCalendar', 'system-config'],
    queryFn: () => apiClient.getEventCalendarSystemConfig(),
  })
  const [form, setForm] = useState<Partial<SystemEventCalendarConfig>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data) { setForm(data); setDirty(false) }
  }, [data])

  const { mutate: save, isPending } = useMutation({
    mutationFn: (d: Partial<SystemEventCalendarConfig>) => apiClient.updateEventCalendarSystemConfig(d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['eventCalendar', 'system-config'] })
      setDirty(false)
    },
  })

  if (!data) return <p className="text-sm text-gray-500">Loading…</p>

  return (
    <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">System Configuration</h2>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">Enable Event Calendar</p>
          <p className="text-xs text-[var(--color-text-muted)]">Master switch for the entire Event Calendar feature</p>
        </div>
        <Toggle
          checked={form.enabled ?? false}
          onChange={v => { setForm(f => ({ ...f, enabled: v })); setDirty(true) }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Default Radius (km)</label>
        <input
          type="number"
          min={1}
          value={form.defaultRadiusKm ?? 100}
          onChange={e => { setForm(f => ({ ...f, defaultRadiusKm: parseInt(e.target.value, 10) })); setDirty(true) }}
          className="w-32 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Cron Schedule</label>
        <CronPicker
          value={form.cronSchedule ?? '0 4 * * *'}
          onChange={v => { setForm(f => ({ ...f, cronSchedule: v })); setDirty(true) }}
        />
      </div>
      <SaveBar isDirty={dirty} isSaving={isPending} onSave={() => save(form)} />
    </section>
  )
}

// ── Property View ─────────────────────────────────────────────────────────────

function PropertyView({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayPlus60Str())
  const [openDates, setOpenDates] = useState(false)
  const [radiusInput, setRadiusInput] = useState<string>('')
  const [radDirty, setRadDirty] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: sysConfig } = useQuery({
    queryKey: ['eventCalendar', 'system-config'],
    queryFn: () => apiClient.getEventCalendarSystemConfig(),
  })

  const { data: propConfig } = useQuery({
    queryKey: ['eventCalendar', 'property-config', propertyId],
    queryFn: () => apiClient.getEventCalendarPropertyConfig(propertyId),
  })

  useEffect(() => {
    if (propConfig !== undefined) {
      setRadiusInput(propConfig?.radiusKm != null ? String(propConfig.radiusKm) : '')
      setRadDirty(false)
    }
  }, [propConfig])

  const { data: events } = useQuery({
    queryKey: ['eventCalendar', 'events', propertyId, from, to],
    queryFn: () => apiClient.getEventCalendarEvents(propertyId, from, to),
  })

  // Clean up poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const { mutate: saveRadius, isPending: savingRadius } = useMutation({
    mutationFn: (r: number | null) => apiClient.updateEventCalendarPropertyConfig(propertyId, { radiusKm: r }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['eventCalendar', 'property-config', propertyId] })
      setRadDirty(false)
    },
  })

  const { mutate: run, isPending: running } = useMutation({
    mutationFn: () => apiClient.runEventCalendar(propertyId, from, to),
    onSuccess: () => {
      setRunError(null)
      if (pollRef.current) clearInterval(pollRef.current)
      const start = Date.now()
      pollRef.current = setInterval(() => {
        if (Date.now() - start > 60000) {
          if (pollRef.current) clearInterval(pollRef.current)
          return
        }
        void qc.invalidateQueries({ queryKey: ['eventCalendar', 'events', propertyId, from, to] })
      }, 2000)
    },
    onError: () => setRunError('Failed to start refresh. Please try again.'),
  })

  const lastFetched = events && events.length > 0
    ? new Date(events[0]!.fetchedAt).toLocaleString()
    : null

  const defaultRadius = sysConfig?.defaultRadiusKm ?? 100

  return (
    <div className="space-y-6">
      {/* Radius override */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Radius Override (km)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            placeholder={`Default: ${defaultRadius}`}
            value={radiusInput}
            onChange={e => { setRadiusInput(e.target.value); setRadDirty(true) }}
            className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          {radDirty && (
            <button
              disabled={savingRadius}
              onClick={() => saveRadius(radiusInput ? parseInt(radiusInput, 10) : null)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingRadius ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Refresh controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenDates(p => !p)}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors"
          >
            <svg className="h-4 w-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {formatDateRange(from, to)}
          </button>
          {openDates && (
            <div className="absolute top-full left-0 z-50 mt-1">
              <CalendarDropdown
                checkIn={from}
                checkOut={to}
                initialField="checkin"
                onDatesChange={(ci, co) => { setFrom(ci); setTo(co) }}
                onClose={() => setOpenDates(false)}
                labelStart="From"
                labelEnd="To"
                labelDuration="Days"
              />
            </div>
          )}
        </div>
        <button
          disabled={running}
          onClick={() => run()}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {running ? 'Refreshing…' : 'Refresh Events'}
        </button>
      </div>
      {runError && <p className="text-sm text-red-600">{runError}</p>}

      {/* Event list */}
      {lastFetched && (
        <p className="text-xs text-gray-400">Last fetched: {lastFetched}</p>
      )}
      {events && events.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No events found for this period. Try refreshing or check that your AI provider supports live web search.
        </p>
      )}
      <div className="space-y-3">
        {events?.map(e => <EventCard key={e.id} event={e} />)}
      </div>
    </div>
  )
}

// ── Property Row ──────────────────────────────────────────────────────────────

function PropertyRow({
  propertyId, propertyName, events, isRefreshing, onRefresh,
}: {
  propertyId: number
  propertyName: string
  events: EventCalendarEvent[]
  isRefreshing: boolean
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <details
      open={open}
      onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-lg border border-gray-200"
    >
      <summary className="flex items-center justify-between px-4 py-3 font-medium text-gray-800 hover:bg-gray-50 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span>
          {propertyName} <span className="text-gray-400 font-normal text-sm">(#{propertyId})</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isRefreshing}
            onClick={e => { e.stopPropagation(); onRefresh() }}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </summary>
      <div className="space-y-3 p-4">
        {events.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No events found. Try refreshing.</p>
        ) : (
          events.map(e => <EventCard key={e.id} event={e} />)
        )}
      </div>
    </details>
  )
}

// ── Chain View ────────────────────────────────────────────────────────────────

function ChainView({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data: chainData } = useQuery({
    queryKey: ['eventCalendar', 'chain', orgId],
    queryFn: () => apiClient.getEventCalendarChainEvents(orgId),
  })

  function startPoll(propertyId?: number) {
    let elapsed = 0
    const poll = setInterval(() => {
      elapsed += 5000
      void qc.invalidateQueries({ queryKey: ['eventCalendar', 'chain', orgId] })
      if (elapsed >= 90000) {
        clearInterval(poll)
        if (propertyId != null) {
          setRefreshingIds(s => { const n = new Set(s); n.delete(propertyId); return n })
        } else {
          setRefreshingAll(false)
        }
      }
    }, 5000)
  }

  async function refreshAll() {
    if (!chainData) return
    setRefreshingAll(true)
    setError(null)
    const from = todayStr()
    const to = todayPlus60Str()
    await Promise.all(
      chainData.map(({ propertyId }) =>
        apiClient.runEventCalendar(propertyId, from, to).catch(() => null)
      )
    )
    startPoll()
  }

  async function refreshOne(propertyId: number) {
    setRefreshingIds(s => new Set(s).add(propertyId))
    const from = todayStr()
    const to = todayPlus60Str()
    await apiClient.runEventCalendar(propertyId, from, to).catch(() => null)
    startPoll(propertyId)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">All Properties — Upcoming Events</h2>
        <button
          disabled={refreshingAll}
          onClick={() => void refreshAll()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {refreshingAll ? 'Refreshing All…' : 'Refresh All'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Search filter */}
      <input
        type="text"
        placeholder="Filter by name or ID…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {(() => {
        const q = search.trim().toLowerCase()
        const filtered = q
          ? (chainData ?? []).filter(p =>
              p.propertyName.toLowerCase().includes(q) ||
              String(p.propertyId).includes(q)
            )
          : (chainData ?? [])
        if (chainData && filtered.length === 0) {
          return <p className="text-sm text-gray-500 italic">No properties match "{search}".</p>
        }
        return filtered.map(({ propertyId, propertyName, events }) => (
        <PropertyRow
          key={propertyId}
          propertyId={propertyId}
          propertyName={propertyName}
          events={events}
          isRefreshing={refreshingIds.has(propertyId)}
          onRefresh={() => void refreshOne(propertyId)}
        />
        ))
      })()}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EventCalendarPage() {
  const { admin } = useAdminAuth()
  const { propertyId, orgId } = useAdminProperty()

  if (!admin) return null

  const isSuper = admin.role === 'super'
  const effectiveOrgId = orgId ?? admin.organizationId

  // System level: super admin, no org selected, no property selected
  const isSystemLevel = isSuper && orgId === null && propertyId === null

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-bold text-gray-900">Event Calendar</h1>

      {isSystemLevel && <SystemConfigPanel />}

      {propertyId ? (
        <PropertyView propertyId={propertyId} />
      ) : effectiveOrgId ? (
        <ChainView orgId={effectiveOrgId} />
      ) : (
        <p className="text-sm text-gray-500">Select a property or organization to view events.</p>
      )}
    </div>
  )
}
