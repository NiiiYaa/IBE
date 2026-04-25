'use client'

import { useEffect, useState } from 'react'

interface WeatherDay {
  date: string
  weatherCode: number
  description: string
  tempMin: number
  tempMax: number
  precipitation: number
}

interface WeatherData {
  enabled: boolean
  source?: 'forecast' | 'historical'
  message?: string
  units?: 'celsius' | 'fahrenheit'
  unitLabel?: string
  forecast?: WeatherDay[]
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
}

// ── Weather icons ─────────────────────────────────────────────────────────────

function getWeatherGroup(code: number): string {
  if (code === 0 || code === 1) return 'clear'
  if (code === 2) return 'partly-cloudy'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 55) return 'drizzle'
  if (code >= 61 && code <= 65) return 'rain'
  if (code >= 71 && code <= 75) return 'snow'
  if (code >= 80 && code <= 82) return 'showers'
  if (code >= 95) return 'thunderstorm'
  return 'cloudy'
}

function WeatherIcon({ code, size = 32 }: { code: number; size?: number }) {
  const group = getWeatherGroup(code)
  const s = size

  if (group === 'clear') return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="7" fill="#FBBF24" />
      {[0,45,90,135,180,225,270,315].map(deg => (
        <line key={deg} x1="16" y1="3" x2="16" y2="6"
          stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round"
          transform={`rotate(${deg} 16 16)`} />
      ))}
    </svg>
  )

  if (group === 'partly-cloudy') return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <circle cx="13" cy="13" r="5.5" fill="#FBBF24" />
      {[0,60,120,180,240,300].map(deg => (
        <line key={deg} x1="13" y1="3" x2="13" y2="5.5"
          stroke="#FBBF24" strokeWidth="2" strokeLinecap="round"
          transform={`rotate(${deg} 13 13)`} />
      ))}
      <rect x="8" y="19" width="17" height="9" rx="4.5" fill="#CBD5E1" />
      <circle cx="13" cy="19" r="4" fill="#CBD5E1" />
      <circle cx="20" cy="18" r="5" fill="#CBD5E1" />
    </svg>
  )

  if (group === 'cloudy') return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect x="5" y="17" width="22" height="10" rx="5" fill="#94A3B8" />
      <circle cx="11" cy="17" r="5" fill="#94A3B8" />
      <circle cx="20" cy="15" r="7" fill="#94A3B8" />
    </svg>
  )

  if (group === 'fog') return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      {[8,13,18,23].map(y => (
        <line key={y} x1="4" y1={y} x2="28" y2={y}
          stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" opacity={y === 13 ? 1 : 0.5} />
      ))}
    </svg>
  )

  if (group === 'drizzle') return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect x="6" y="5" width="20" height="11" rx="5.5" fill="#94A3B8" />
      <circle cx="12" cy="10" r="5" fill="#94A3B8" />
      <circle cx="20" cy="9" r="6" fill="#94A3B8" />
      {[10,16,22].map(x => (
        <line key={x} x1={x} y1="20" x2={x-2} y2="27"
          stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  )

  if (group === 'rain') return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect x="5" y="4" width="22" height="12" rx="6" fill="#64748B" />
      <circle cx="11" cy="10" r="5" fill="#64748B" />
      <circle cx="21" cy="9" r="6" fill="#64748B" />
      {[9,15,21].map(x => (
        <line key={x} x1={x} y1="20" x2={x-3} y2="29"
          stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
      ))}
    </svg>
  )

  if (group === 'snow') return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect x="5" y="4" width="22" height="11" rx="5.5" fill="#94A3B8" />
      <circle cx="11" cy="9" r="5" fill="#94A3B8" />
      <circle cx="21" cy="8" r="6" fill="#94A3B8" />
      {[9,15,21].map(x => (
        <g key={x}>
          <circle cx={x} cy={22} r="2" fill="#BAE6FD" />
          <circle cx={x} cy={29} r="2" fill="#BAE6FD" />
        </g>
      ))}
    </svg>
  )

  if (group === 'showers') return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect x="5" y="3" width="22" height="12" rx="6" fill="#64748B" />
      <circle cx="11" cy="9" r="5" fill="#64748B" />
      <circle cx="21" cy="8" r="6" fill="#64748B" />
      {[9,15,21].map((x, i) => (
        <line key={x} x1={x} y1="19" x2={x-3} y2={24 + i * 2}
          stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  )

  // thunderstorm
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect x="4" y="3" width="24" height="12" rx="6" fill="#475569" />
      <circle cx="10" cy="9" r="5" fill="#475569" />
      <circle cx="21" cy="8" r="7" fill="#475569" />
      <polygon points="18,17 13,25 17,25 14,32 22,22 18,22" fill="#FDE047" />
    </svg>
  )
}

// ── Strip component ───────────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })
}

interface WeatherStripProps {
  propertyId: number
  startDate: string
  endDate: string
}

export function WeatherStrip({ propertyId, startDate, endDate }: WeatherStripProps) {
  const [data, setData] = useState<WeatherData | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [folded, setFolded] = useState(false)

  useEffect(() => {
    if (!propertyId || !startDate || !endDate) return
    setData(null)
    setDismissed(false)
    setFolded(false)
    fetch(`/api/v1/weather?propertyId=${propertyId}&startDate=${startDate}&endDate=${endDate}`)
      .then(r => r.ok ? r.json() as Promise<WeatherData> : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
  }, [propertyId, startDate, endDate])

  useEffect(() => {
    if (!data?.enabled) return
    setFolded(data.stripDefaultFolded ?? false)
    const secs = data.stripAutoFoldSecs ?? 15
    if (secs === 0) return
    const t = setTimeout(() => setFolded(true), secs * 1000)
    return () => clearTimeout(t)
  }, [data])

  if (!data || !data.enabled || dismissed || !data.forecast?.length) return null

  const isHistorical = data.source === 'historical'

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 cursor-pointer select-none"
        onClick={() => setFolded(f => !f)}
      >
        <div className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
          <span className="text-xs font-medium text-[var(--color-text)]">
            {isHistorical ? 'Historical weather data' : 'Weather forecast'}
          </span>
          {isHistorical && (
            <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Based on last year
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <svg
            className={['h-3.5 w-3.5 text-[var(--color-text-muted)] transition-transform duration-200', folded ? '' : 'rotate-180'].join(' ')}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <button
            onClick={e => { e.stopPropagation(); setDismissed(true) }}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)] transition-colors"
            aria-label="Dismiss weather"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Days */}
      {!folded && (
        <div className="flex overflow-x-auto px-2 py-1.5 gap-0.5 scrollbar-hide border-t border-[var(--color-border)]">
          {data.forecast!.map(day => (
            <div key={day.date}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 min-w-[62px] hover:bg-[var(--color-background)] transition-colors"
              title={day.description}
            >
              <span className="text-[9px] text-[var(--color-text-muted)] whitespace-nowrap leading-none">
                {formatShortDate(day.date)}
              </span>
              <WeatherIcon code={day.weatherCode} size={22} />
              <div className="flex items-baseline gap-0.5 leading-none">
                <span className="text-[10px] font-semibold text-[var(--color-text)]">{day.tempMax}{data.unitLabel}</span>
                <span className="text-[9px] text-[var(--color-text-muted)]">{day.tempMin}{data.unitLabel}</span>
              </div>
              {day.precipitation > 0 && (
                <span className="text-[8px] text-blue-500 leading-none">{day.precipitation}mm</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
