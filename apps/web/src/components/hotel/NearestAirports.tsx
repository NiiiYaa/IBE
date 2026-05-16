'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useT } from '@/context/translations'

interface Props {
  propertyId: number
}

const storageKey = (propertyId: number) => `nearest-airports-radius-${propertyId}`

export function NearestAirports({ propertyId }: Props) {
  const t = useT('search')
  const [dismissed, setDismissed] = useState(false)
  const [folded, setFolded] = useState(false)
  const [radiusKm, setRadiusKm] = useState<number | null>(null)
  const [debouncedRadius, setDebouncedRadius] = useState<number | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const autoFoldInit = useRef(false)

  // Read persisted radius from localStorage before firing the first query
  useEffect(() => {
    const saved = localStorage.getItem(storageKey(propertyId))
    if (saved) {
      const parsed = parseInt(saved, 10)
      if (!isNaN(parsed)) {
        setRadiusKm(parsed)
        setDebouncedRadius(parsed)
      }
    }
    setHydrated(true)
  }, [propertyId])

  const { data } = useQuery({
    queryKey: ['nearest-airports', propertyId, debouncedRadius],
    queryFn: () => apiClient.getNearestAirports(propertyId, debouncedRadius ?? undefined),
    enabled: propertyId > 0 && hydrated,
  })

  // Initialise slider from first response (only when no saved radius)
  useEffect(() => {
    if (!data || radiusKm !== null) return
    setRadiusKm(data.radiusKm)
    setDebouncedRadius(data.radiusKm)
  }, [data, radiusKm])

  // Auto-fold timer — runs only on first load, not on slider re-queries
  useEffect(() => {
    if (!data || autoFoldInit.current) return
    autoFoldInit.current = true
    setFolded(data.stripDefaultFolded ?? false)
    const secs = data.stripAutoFoldSecs ?? 0
    if (secs === 0) return
    const timer = setTimeout(() => setFolded(true), secs * 1000)
    return () => clearTimeout(timer)
  }, [data])

  // Debounce slider → re-query + persist
  useEffect(() => {
    if (radiusKm === null) return
    const timer = setTimeout(() => {
      setDebouncedRadius(radiusKm)
      localStorage.setItem(storageKey(propertyId), String(radiusKm))
    }, 400)
    return () => clearTimeout(timer)
  }, [radiusKm, propertyId])

  const airports = data?.airports ?? []
  if (airports.length === 0 && !data) return null
  if (dismissed) return null

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none"
        onClick={() => setFolded(f => !f)}
      >
        {/* Icon + label */}
        <svg className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
        <span className="text-xs font-medium text-[var(--color-text)] shrink-0">{t('nearestAirports')}</span>

        {/* Slider — shown only after first load */}
        {radiusKm !== null && (
          <div
            className="flex items-center gap-1.5 flex-1 min-w-0"
            onClick={e => e.stopPropagation()}
          >
            <input
              type="range"
              min={10}
              max={300}
              step={10}
              value={radiusKm}
              onChange={e => setRadiusKm(Number(e.target.value))}
              className="w-full h-1 accent-[var(--color-primary)] cursor-pointer"
            />
            <span className="text-xs text-[var(--color-text-muted)] shrink-0 tabular-nums w-14 text-right">
              {radiusKm} km
            </span>
          </div>
        )}

        {/* Chevron + dismiss */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <svg
            className={['h-3.5 w-3.5 text-[var(--color-text-muted)] transition-transform duration-200', folded ? '' : 'rotate-180'].join(' ')}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <button
            onClick={e => { e.stopPropagation(); setDismissed(true) }}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)] transition-colors"
            aria-label="Dismiss"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Airport list */}
      {!folded && (
        <div className="border-t border-[var(--color-border)]">
          {airports.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
              {airports.map(a => (
                <div key={a.code} className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold text-[var(--color-text)]">{a.code}</span>
                  <span className="text-[var(--color-text-muted)]">{a.name}</span>
                  <span className="text-[var(--color-text-muted)]">·</span>
                  <span className="text-[var(--color-text-muted)]">{a.distanceKm} km</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
              No airports found within {radiusKm ?? 0} km.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
