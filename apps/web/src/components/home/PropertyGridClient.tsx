'use client'

import { useState, useEffect, useRef } from 'react'
import type { PropertyFacility } from '@ibe/shared'
import { PropertyCard } from './PropertyCard'
import { PropertyRow } from './PropertyRow'
import { useT } from '@/context/translations'

export interface PropertyData {
  id: number
  name: string
  starRating: number
  imageUrl: string | null
  city: string
  address: string
  description: string
  facilities: PropertyFacility[]
}

interface LightweightEntry {
  propertyId: number
  name: string
}

interface Props {
  initial: PropertyData[]
  remaining: LightweightEntry[]
  layout: 'grid' | 'list'
}

const LOAD_BATCH = 8
const SEARCH_THRESHOLD = 10

export function PropertyGridClient({ initial, remaining, layout }: Props) {
  const t = useT('properties')
  const tCommon = useT('common')
  const [loaded, setLoaded] = useState<PropertyData[]>([])
  const [loadedOffset, setLoadedOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const total = initial.length + remaining.length
  const showSearch = total > SEARCH_THRESHOLD

  // All properties we have full data for
  const allKnown = [...initial, ...loaded]

  // When search changes, auto-load remaining entries that match
  useEffect(() => {
    if (!search) return
    const q = search.toLowerCase()

    const unloaded = remaining.filter(
      r => !allKnown.some(k => k.id === r.propertyId) &&
        (r.name.toLowerCase().includes(q) || String(r.propertyId).includes(q))
    )
    if (unloaded.length === 0) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      const results = await fetchPropertyDetails(unloaded)
      setLoaded(prev => {
        const existingIds = new Set(prev.map(p => p.id))
        return [...prev, ...results.filter(r => !existingIds.has(r.id))]
      })
      setLoadedOffset(remaining.length) // mark all as "loaded" once searched
      setSearchLoading(false)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function fetchPropertyDetails(entries: LightweightEntry[]): Promise<PropertyData[]> {
    return Promise.all(
      entries.map(async entry => {
        const [detailRes, configRes] = await Promise.all([
          fetch(`/api/v1/properties/${entry.propertyId}`),
          fetch(`/api/v1/config/property/${entry.propertyId}`),
        ])
        const detail = detailRes.ok ? (await detailRes.json() as Record<string, unknown>) : null
        const cfg = configRes.ok ? (await configRes.json() as Record<string, unknown>) : null
        const images = ((detail?.images ?? []) as Array<{ priority: number; url: string }>)
          .sort((a, b) => a.priority - b.priority)
        const imageUrl: string | null = (cfg?.heroImageUrl as string | null) || images[0]?.url || null
        const descs = (detail?.descriptions ?? []) as Array<{ locale: string; text: string }>
        const desc = descs.find(d => d.locale === 'en') ?? descs[0]
        const location = detail?.location as { city?: string; address?: string } | undefined
        const tagline = cfg?.tagline as string | undefined
        return {
          id: entry.propertyId,
          name: (detail?.name as string | undefined) ?? entry.name,
          starRating: (detail?.starRating as number | undefined) ?? 0,
          imageUrl,
          city: tagline ? '' : (location?.city ?? ''),
          address: tagline ?? location?.address ?? '',
          description: desc?.text ?? '',
          facilities: (detail?.facilities ?? []) as PropertyFacility[],
        }
      })
    )
  }

  async function loadMore() {
    setLoadingMore(true)
    const batch = remaining.slice(loadedOffset, loadedOffset + LOAD_BATCH)
    const results = await fetchPropertyDetails(batch)
    setLoaded(prev => [...prev, ...results])
    setLoadedOffset(prev => prev + LOAD_BATCH)
    setLoadingMore(false)
  }

  // Filter logic
  const q = search.toLowerCase()
  const filteredKnown = search
    ? allKnown.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        String(p.id).includes(q)
      )
    : allKnown

  const unloadedRemaining = remaining.length - loadedOffset
  const hasMore = !search && unloadedRemaining > 0

  function renderGrid(props: PropertyData[]) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {props.map(p => <PropertyCard key={p.id} {...p} />)}
      </div>
    )
  }

  function renderList(props: PropertyData[]) {
    const groups = new Map<string, PropertyData[]>()
    for (const p of props) {
      const key = p.city || ''
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
    const hasMultipleCities = groups.size > 1
    return (
      <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        {Array.from(groups.entries()).map(([city, cityProps]) => (
          <div key={city || '__none__'}>
            {hasMultipleCities && city && (
              <div className="bg-[var(--color-background)] px-4 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{city}</p>
              </div>
            )}
            <div className="px-4">
              {cityProps.map(p => <PropertyRow key={p.id} {...p} />)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {showSearch && (
        <div className="mb-6 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('searchProperties', { count: String(total) })}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-4 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-light)]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchLoading && (
            <span className="text-xs text-[var(--color-text-muted)]">{tCommon('loading')}</span>
          )}
          {search && !searchLoading && (
            <span className="text-xs text-[var(--color-text-muted)]">
              {filteredKnown.length} of {total}
            </span>
          )}
        </div>
      )}

      {filteredKnown.length > 0
        ? (layout === 'list' ? renderList(filteredKnown) : renderGrid(filteredKnown))
        : search
          ? <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">{t('noPropertiesMatch', { query: search })}</p>
          : null
      }

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-full border border-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-50"
          >
            {loadingMore
              ? tCommon('loading')
              : `Show ${Math.min(LOAD_BATCH, unloadedRemaining)} more ${unloadedRemaining === 1 ? 'property' : 'properties'}`}
          </button>
        </div>
      )}
    </>
  )
}
