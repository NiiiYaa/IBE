'use client'

import { useQueries } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { encodeSearchParams } from '@/lib/search-params'
import type { SearchUrlParams } from '@/lib/search-params'
import type { SearchResponse, FlexibleDatesEffective } from '@ibe/shared'

export interface FlexibleDateResult {
  label: string
  checkIn: string
  checkOut: string
  data: SearchResponse | undefined
  isLoading: boolean
}

/**
 * Shifts a YYYY-MM-DD date string by the given number of days.
 */
function shiftDate(dateStr: string, deltaDays: number): string {
  const parts = dateStr.split('-').map(Number)
  const year = parts[0] ?? 2000
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + deltaDays)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/**
 * Returns a human-readable label for a date delta.
 */
function deltaLabel(delta: number): string {
  const abs = Math.abs(delta)
  if (delta === -1) return '1 day before'
  if (delta < -1) return `${abs} days before`
  if (delta === 1) return '1 day after'
  return `${abs} days after`
}

/**
 * Builds the sorted list of deltas for the given daysBefore / daysAfter values.
 * Negative deltas (ascending) come first, then positive deltas (ascending).
 * e.g. daysBefore=2, daysAfter=2 → [-2, -1, +1, +2]
 */
function buildDeltas(daysBefore: number, daysAfter: number): number[] {
  const before: number[] = []
  for (let i = daysBefore; i >= 1; i--) before.push(-i)
  const after: number[] = []
  for (let i = 1; i <= daysAfter; i++) after.push(i)
  return [...before, ...after]
}

/**
 * Fans out parallel searches for nearby date windows when the primary search
 * returns zero rooms.
 *
 * Activation: config.enabled === true && !primaryHasResults && baseParams !== null
 */
export function useFlexibleDateSearch(
  baseParams: SearchUrlParams | null,
  config: FlexibleDatesEffective | undefined,
  primaryHasResults: boolean,
  getLabel?: (delta: number) => string,
): FlexibleDateResult[] {
  const active = config?.enabled === true && !primaryHasResults && baseParams !== null

  const deltas = active ? buildDeltas(config!.daysBefore, config!.daysAfter) : []

  const queries = active
    ? deltas.map((delta) => {
        const shiftedParams: SearchUrlParams = {
          ...baseParams!,
          checkIn: shiftDate(baseParams!.checkIn, delta),
          checkOut: shiftDate(baseParams!.checkOut, delta),
        }
        return {
          queryKey: ['flexible-search', shiftedParams],
          queryFn: () => apiClient.search(encodeSearchParams(shiftedParams)),
          staleTime: 4 * 60 * 1000, // 4 minutes — matches useSearch
          retry: 1,
        }
      })
    : []

  const results = useQueries({ queries })

  if (!active) return []

  const out: FlexibleDateResult[] = []

  for (let i = 0; i < deltas.length; i++) {
    const delta = deltas[i]!
    const result = results[i]
    if (!result) continue

    const shiftedCheckIn = shiftDate(baseParams!.checkIn, delta)
    const shiftedCheckOut = shiftDate(baseParams!.checkOut, delta)

    if (result.isLoading || result.isPending) {
      out.push({
        label: getLabel ? getLabel(delta) : deltaLabel(delta),
        checkIn: shiftedCheckIn,
        checkOut: shiftedCheckOut,
        data: undefined,
        isLoading: true,
      })
      continue
    }

    // Error or empty results → exclude
    if (result.isError) continue
    const allRooms = result.data?.results.flatMap((r) => r.rooms) ?? []
    if (allRooms.length === 0) continue

    out.push({
      label: getLabel ? getLabel(delta) : deltaLabel(delta),
      checkIn: shiftedCheckIn,
      checkOut: shiftedCheckOut,
      data: result.data,
      isLoading: false,
    })
  }

  return out
}
