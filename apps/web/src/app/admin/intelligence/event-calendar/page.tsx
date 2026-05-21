'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminProperty } from '../../property-context'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { apiClient } from '@/lib/api-client'
import { SaveBar } from '@/app/admin/design/components'
import type {
  SystemEventCalendarConfig,
  EventCalendarEvent,
} from '@ibe/shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!
}

function todayPlus30Str(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
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
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">System Configuration</h2>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={form.enabled ?? false}
          onChange={e => { setForm(f => ({ ...f, enabled: e.target.checked })); setDirty(true) }}
          className="h-4 w-4 rounded border-gray-300"
        />
        <span className="text-sm font-medium text-gray-700">Enable Event Calendar</span>
      </label>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Default Radius (km)</label>
        <input
          type="number"
          min={1}
          value={form.defaultRadiusKm ?? 50}
          onChange={e => { setForm(f => ({ ...f, defaultRadiusKm: parseInt(e.target.value, 10) })); setDirty(true) }}
          className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Cron Schedule</label>
        <input
          type="text"
          value={form.cronSchedule ?? '0 4 * * *'}
          onChange={e => { setForm(f => ({ ...f, cronSchedule: e.target.value })); setDirty(true) }}
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono"
        />
      </div>
      <SaveBar isDirty={dirty} isSaving={isPending} onSave={() => save(form)} />
    </div>
  )
}

// ── Property View ─────────────────────────────────────────────────────────────

function PropertyView({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayPlus30Str())
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

  const defaultRadius = sysConfig?.defaultRadiusKm ?? 50

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
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <button
          disabled={running}
          onClick={() => run()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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

// ── Chain View ────────────────────────────────────────────────────────────────

function ChainView({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: chainData } = useQuery({
    queryKey: ['eventCalendar', 'chain', orgId],
    queryFn: () => apiClient.getEventCalendarChainEvents(orgId),
  })

  async function refreshAll() {
    if (!chainData) return
    setRefreshing(true)
    setError(null)
    try {
      const from = todayStr()
      const to = todayPlus30Str()
      for (const { propertyId } of chainData) {
        await apiClient.runEventCalendar(propertyId, from, to).catch(() => null)
      }
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['eventCalendar', 'chain', orgId] })
        setRefreshing(false)
      }, 3000)
    } catch {
      setError('Refresh failed. Please try again.')
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">All Properties — Upcoming Events</h2>
        <button
          disabled={refreshing}
          onClick={() => void refreshAll()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing All…' : 'Refresh All'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {chainData?.map(({ propertyId, events }) => (
        <details key={propertyId} className="rounded-lg border border-gray-200" open>
          <summary className="cursor-pointer px-4 py-3 font-medium text-gray-800 hover:bg-gray-50">
            Property #{propertyId}
          </summary>
          <div className="space-y-3 p-4">
            {events.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No events found. Try refreshing.
              </p>
            ) : (
              events.map(e => <EventCard key={e.id} event={e} />)
            )}
          </div>
        </details>
      ))}
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
