'use client'

import { useEffect, useState } from 'react'

interface EventItem {
  name: string
  date: string | null
  time: string | null
  category: string | null
  genre: string | null
  venue: string | null
  city: string | null
  ticketUrl: string | null
  thumb: string | null
}

interface EventsData {
  enabled: boolean
  radiusKm?: number
  events?: EventItem[]
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
}

function CategoryIcon({ category }: { category: string | null }) {
  const c = (category ?? '').toLowerCase()

  if (c === 'music') return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  )
  if (c === 'sports') return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={1.8} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10zM2 12h20" />
    </svg>
  )
  if (c.includes('art') || c.includes('theatre')) return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
    </svg>
  )
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  )
}

function categoryColor(category: string | null): string {
  const c = (category ?? '').toLowerCase()
  if (c === 'music') return 'text-violet-600 bg-violet-50'
  if (c === 'sports') return 'text-emerald-600 bg-emerald-50'
  if (c.includes('art') || c.includes('theatre')) return 'text-rose-600 bg-rose-50'
  return 'text-[var(--color-text-muted)] bg-[var(--color-background)]'
}

function formatDate(dateStr: string | null, time: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  const datePart = d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
  return time ? `${datePart} · ${time}` : datePart
}

interface EventsStripProps {
  propertyId: number
  startDate: string
  endDate: string
  showTicketLink?: boolean
  orgId?: number | null
}

export function EventsStrip({ propertyId, startDate, endDate, showTicketLink = false, orgId }: EventsStripProps) {
  const [data, setData] = useState<EventsData | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [folded, setFolded] = useState(false)

  useEffect(() => {
    if (!propertyId || !startDate || !endDate) return
    setData(null)
    setDismissed(false)
    setFolded(false)
    const qs = new URLSearchParams({ propertyId: String(propertyId), startDate, endDate })
    if (orgId) qs.set('orgId', String(orgId))
    fetch(`/api/v1/events?${qs.toString()}`)
      .then(r => r.ok ? r.json() as Promise<EventsData> : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
  }, [propertyId, startDate, endDate, orgId])

  useEffect(() => {
    if (!data?.enabled) return
    setFolded(data.stripDefaultFolded ?? false)
    const secs = data.stripAutoFoldSecs ?? 15
    if (secs === 0) return
    const t = setTimeout(() => setFolded(true), secs * 1000)
    return () => clearTimeout(t)
  }, [data])

  if (!data || !data.enabled || dismissed || !data.events?.length) return null

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 cursor-pointer select-none"
        onClick={() => setFolded(f => !f)}
      >
        <div className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
          </svg>
          <span className="text-xs font-medium text-[var(--color-text)]">Events nearby during your stay</span>
          <span className="text-[10px] text-[var(--color-text-muted)]">within {data.radiusKm} km</span>
        </div>
        <div className="flex items-center gap-1">
          <svg
            className={['h-3.5 w-3.5 text-[var(--color-text-muted)] transition-transform duration-200', folded ? '' : 'rotate-180'].join(' ')}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <button onClick={e => { e.stopPropagation(); setDismissed(true) }}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)] transition-colors"
            aria-label="Dismiss events">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Cards */}
      {!folded && (
      <div className="flex overflow-x-auto px-2 py-1.5 gap-1.5 scrollbar-hide border-t border-[var(--color-border)]">
        {data.events!.map((event, i) => (
          <div key={i}
            className="flex flex-col min-w-[148px] max-w-[156px] rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] overflow-hidden flex-shrink-0 hover:border-[var(--color-primary)] transition-colors">

            {/* Image or category band */}
            {event.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.thumb} alt={event.name} className="h-12 w-full object-cover" />
            ) : (
              <div className={['h-6 flex items-center justify-center gap-1 px-2', categoryColor(event.category)].join(' ')}>
                <CategoryIcon category={event.category} />
                {event.category && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide truncate">{event.category}</span>
                )}
              </div>
            )}

            <div className="px-1.5 py-1 flex flex-col gap-px">
              <p className="text-[10px] font-semibold text-[var(--color-text)] leading-snug line-clamp-2">{event.name}</p>
              {event.genre && event.genre !== 'Undefined' && (
                <p className="text-[9px] text-[var(--color-text-muted)]">{event.genre}</p>
              )}
              {event.date && (
                <p className="text-[9px] text-[var(--color-primary)] font-medium">{formatDate(event.date, event.time)}</p>
              )}
              {event.venue && (
                <p className="text-[9px] text-[var(--color-text-muted)] truncate">{event.venue}</p>
              )}
              {showTicketLink && event.ticketUrl && (
                <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-0.5 text-[9px] font-semibold text-[var(--color-primary)] hover:underline">
                  Get tickets →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}
