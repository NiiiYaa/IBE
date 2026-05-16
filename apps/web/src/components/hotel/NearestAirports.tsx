'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useT } from '@/context/translations'

interface Props {
  propertyId: number
}

export function NearestAirports({ propertyId }: Props) {
  const t = useT('search')
  const { data } = useQuery({
    queryKey: ['nearest-airports', propertyId],
    queryFn: () => apiClient.getNearestAirports(propertyId),
    enabled: propertyId > 0,
  })

  const airports = data?.airports ?? []
  if (airports.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
      <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
      </svg>
      <span className="font-medium">{t('nearestAirports')}:</span>
      {airports.map((a, i) => (
        <span key={a.code} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[var(--color-border)]">·</span>}
          <span className="font-semibold text-[var(--color-text)]">{a.code}</span>
          <span>{a.name}</span>
          <span className="text-[var(--color-text-muted)]">{a.distanceKm} km</span>
        </span>
      ))}
    </div>
  )
}
