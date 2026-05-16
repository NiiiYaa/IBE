'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT, useLocale } from '@/context/translations'
import { apiClient } from '@/lib/api-client'
import type { ActivitiesAndEventsResponse, AmadeusActivity } from '@ibe/shared'

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

function formatDate(dateStr: string | null, time: string | null, locale: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  const datePart = d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
  return time ? `${datePart} · ${time}` : datePart
}

interface TmEvent {
  name: string
  thumb?: string | null
  genre?: string | null
  category?: string | null
  date?: string | null
  time?: string | null
  venue?: string | null
  ticketUrl?: string | null
}

function TicketmasterEventCard({ event, locale, showBookButton }: { event: TmEvent; locale: string; showBookButton: boolean }) {
  return (
    <a
      href={event.ticketUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-[160px] max-w-[200px] flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition hover:border-[var(--color-primary)]"
    >
      {event.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.thumb} alt={event.name} className="mb-1 h-24 w-full rounded object-cover" />
      ) : (
        <div className={['mb-1 h-24 w-full rounded flex items-center justify-center', categoryColor(event.category ?? null)].join(' ')}>
          <CategoryIcon category={event.category ?? null} />
        </div>
      )}
      <p className="text-xs font-semibold leading-tight text-[var(--color-text)] line-clamp-2">{event.name}</p>
      {event.genre && event.genre !== 'Undefined' && (
        <p className="text-xs text-[var(--color-text-muted)]">{event.genre}</p>
      )}
      {event.date && (
        <p className="text-xs text-[var(--color-text-muted)]">{formatDate(event.date, event.time ?? null, locale)}</p>
      )}
      {event.venue && (
        <p className="text-xs text-[var(--color-text-muted)] truncate">{event.venue}</p>
      )}
      {showBookButton && (
        <span className={[
          'mt-1 self-start rounded px-2 py-0.5 text-xs font-medium',
          event.ticketUrl
            ? 'bg-[var(--color-primary)] text-white'
            : 'border border-[var(--color-border)] text-[var(--color-text)]',
        ].join(' ')}>
          {event.ticketUrl ? 'Get Tickets' : 'View'}
        </span>
      )}
    </a>
  )
}

function ActivityCard({ activity, showBookButton }: { activity: AmadeusActivity; showBookButton: boolean }) {
  return (
    <a
      href={activity.bookingUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-[160px] max-w-[200px] flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition hover:border-[var(--color-primary)]"
    >
      {activity.thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={activity.thumb} alt={activity.name}
          className="mb-1 h-24 w-full rounded object-cover" />
      )}
      <p className="text-xs font-semibold leading-tight text-[var(--color-text)] line-clamp-2">{activity.name}</p>
      {activity.category && (
        <p className="text-xs text-[var(--color-text-muted)]">{activity.category}</p>
      )}
      {activity.duration && (
        <p className="text-xs text-[var(--color-text-muted)]">{activity.duration}</p>
      )}
      {activity.price != null && (
        <p className="mt-auto text-xs font-semibold text-[var(--color-primary)]">
          {activity.currency ? `${activity.currency} ` : ''}{activity.price}
        </p>
      )}
      {showBookButton && (
        <span className={[
          'mt-1 self-start rounded px-2 py-0.5 text-xs font-medium',
          activity.bookable
            ? 'bg-[var(--color-primary)] text-white'
            : 'border border-[var(--color-border)] text-[var(--color-text)]',
        ].join(' ')}>
          {activity.bookable ? 'Book' : 'View'}
        </span>
      )}
    </a>
  )
}

interface EventsStripProps {
  propertyId: number
  startDate: string
  endDate: string
  showTicketLink?: boolean
  orgId?: number | null
}

function computeAmChips(activities: AmadeusActivity[]): string[] {
  const set = new Set<string>()
  for (const a of activities) {
    if (a.category) set.add(a.category)
  }
  return ['All', ...Array.from(set).sort()]
}

function computeTmChips(events: TmEvent[]): string[] {
  const set = new Set<string>()
  for (const e of events) {
    if (e.category) set.add(e.category)
    if (e.genre && e.genre !== 'Undefined') set.add(e.genre)
  }
  return ['All', ...Array.from(set).sort()]
}

function computeMergedChips(activities: AmadeusActivity[], events: TmEvent[]): string[] {
  const set = new Set<string>()
  for (const a of activities) {
    if (a.category) set.add(a.category)
  }
  for (const e of events) {
    if (e.category) set.add(e.category)
    if (e.genre && e.genre !== 'Undefined') set.add(e.genre)
  }
  return ['All', ...Array.from(set).sort()]
}

function StripSection({
  label,
  icon,
  hasItems,
  stripDefaultFolded,
  stripAutoFoldSecs,
  onDismiss,
  chips,
  activeChip,
  onChipChange,
  children,
}: {
  label: React.ReactNode
  icon?: React.ReactNode
  hasItems: boolean
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
  onDismiss: () => void
  chips?: string[]
  activeChip?: string
  onChipChange?: (chip: string) => void
  children: React.ReactNode
}) {
  const [folded, setFolded] = useState(stripDefaultFolded ?? false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setFolded(stripDefaultFolded ?? false)
    const secs = stripAutoFoldSecs ?? 15
    if (secs === 0) return
    const timer = setTimeout(() => setFolded(true), secs * 1000)
    return () => clearTimeout(timer)
  }, [stripDefaultFolded, stripAutoFoldSecs])

  if (dismissed) return null

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header */}
      <div
        className={['flex items-center justify-between px-3 py-1.5 select-none', hasItems ? 'cursor-pointer' : ''].join(' ')}
        onClick={() => hasItems && setFolded(f => !f)}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium text-[var(--color-text)]">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <svg
            className={['h-3.5 w-3.5 text-[var(--color-text-muted)] transition-transform duration-200', (!hasItems || folded) ? '' : 'rotate-180'].join(' ')}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <button onClick={e => { e.stopPropagation(); setDismissed(true); onDismiss() }}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)] transition-colors"
            aria-label="Dismiss">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chip row */}
      {!folded && chips && chips.length > 1 && (
        <div className="flex overflow-x-auto gap-1.5 px-3 py-1.5 scrollbar-hide border-t border-[var(--color-border)]">
          {chips.map(chip => (
            <button
              key={chip}
              type="button"
              onClick={() => onChipChange?.(chip)}
              className={[
                'rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors',
                chip === (activeChip ?? 'All')
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
              ].join(' ')}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      {hasItems && !folded && (
        <div className="flex overflow-x-auto px-2 py-1.5 gap-1.5 scrollbar-hide border-t border-[var(--color-border)]">
          {children}
        </div>
      )}
    </div>
  )
}

export function EventsStrip({ propertyId, startDate, endDate, showTicketLink = false, orgId }: EventsStripProps) {
  const t = useT('events')
  const locale = useLocale()
  const [tmDismissed, setTmDismissed] = useState(false)
  const [amDismissed, setAmDismissed] = useState(false)

  const { data, isLoading } = useQuery<ActivitiesAndEventsResponse>({
    queryKey: ['activities-and-events', propertyId, orgId],
    queryFn: () => apiClient.getActivitiesAndEvents(propertyId, orgId ?? undefined),
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  })

  const tmEnabled = data?.ticketmaster?.enabled ?? false
  const amEnabled = data?.amadeus?.enabled ?? false
  const stripMode = data?.amadeus?.stripMode ?? 'separate'

  if (!isLoading && !tmEnabled && !amEnabled) return null
  if (!data) return null

  const tmEvents = data.ticketmaster?.events ?? []
  const amActivities = data.amadeus?.activities ?? []
  const tmShowBook = data.ticketmaster?.showBookButton ?? true
  const amShowBook = data.amadeus?.showBookButton ?? true

  const ticketIcon = (
    <svg className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  )

  const activityIcon = (
    <svg className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </svg>
  )

  // Merged mode: one strip alternating TM / Amadeus cards
  if (stripMode === 'merged' && (tmDismissed === false || amDismissed === false)) {
    if (tmDismissed && amDismissed) return null

    type MergedItem =
      | { kind: 'event'; item: typeof tmEvents[number] }
      | { kind: 'activity'; item: AmadeusActivity }

    const tmItems = tmEnabled ? tmEvents.map(e => ({ kind: 'event' as const, item: e })) : []
    const amItems = amEnabled ? amActivities.map(a => ({ kind: 'activity' as const, item: a })) : []
    const maxLen = Math.max(tmItems.length, amItems.length)
    const mergedItems: MergedItem[] = []
    for (let i = 0; i < maxLen; i++) {
      if (i < tmItems.length) mergedItems.push(tmItems[i]!)
      if (i < amItems.length) mergedItems.push(amItems[i]!)
    }

    const mergedLabel = data.amadeus?.stripLabel ?? t('activitiesAndTours')

    return (
      <StripSection
        label={mergedLabel}
        icon={activityIcon}
        hasItems={mergedItems.length > 0}
        {...(data.amadeus?.stripDefaultFolded !== undefined && { stripDefaultFolded: data.amadeus.stripDefaultFolded })}
        {...(data.amadeus?.stripAutoFoldSecs !== undefined && { stripAutoFoldSecs: data.amadeus.stripAutoFoldSecs })}
        onDismiss={() => { setTmDismissed(true); setAmDismissed(true) }}
      >
        {mergedItems.map((item, i) =>
          item.kind === 'event'
            ? <TicketmasterEventCard key={`event-${i}`} event={item.item} locale={locale} showBookButton={tmShowBook} />
            : <ActivityCard key={`activity-${i}`} activity={item.item} showBookButton={amShowBook} />
        )}
      </StripSection>
    )
  }

  // Separate mode: one strip per provider
  return (
    <div className="flex flex-col gap-2">
      {tmEnabled && !tmDismissed && (
        <StripSection
          label={
            <>
              <span>{t('eventsNearby')}</span>
              {(data.ticketmaster?.events?.length ?? 0) === 0 && (
                <span className="text-[10px] text-[var(--color-text-muted)]">{t('noEventsFound')}</span>
              )}
            </>
          }
          icon={ticketIcon}
          hasItems={tmEvents.length > 0}
          {...(data.ticketmaster?.stripDefaultFolded !== undefined && { stripDefaultFolded: data.ticketmaster.stripDefaultFolded })}
          {...(data.ticketmaster?.stripAutoFoldSecs !== undefined && { stripAutoFoldSecs: data.ticketmaster.stripAutoFoldSecs })}
          onDismiss={() => setTmDismissed(true)}
        >
          {tmEvents.map((event, i) => (
            <TicketmasterEventCard key={i} event={event} locale={locale} showBookButton={tmShowBook} />
          ))}
        </StripSection>
      )}

      {amEnabled && !amDismissed && (
        <StripSection
          label={data.amadeus?.stripLabel ?? t('activitiesAndTours')}
          icon={activityIcon}
          hasItems={amActivities.length > 0}
          {...(data.amadeus?.stripDefaultFolded !== undefined && { stripDefaultFolded: data.amadeus.stripDefaultFolded })}
          {...(data.amadeus?.stripAutoFoldSecs !== undefined && { stripAutoFoldSecs: data.amadeus.stripAutoFoldSecs })}
          onDismiss={() => setAmDismissed(true)}
        >
          {amActivities.map((activity, i) => (
            <ActivityCard key={i} activity={activity} showBookButton={amShowBook} />
          ))}
        </StripSection>
      )}
    </div>
  )
}
