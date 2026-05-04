import { useQuery } from '@tanstack/react-query'
import type { IncentiveSlots } from '@ibe/shared'

const API_URL = typeof window !== 'undefined' ? '' : (process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001')

async function fetchIncentive(propertyId: number, locale: string, sourceOrgSlug?: string): Promise<IncentiveSlots | null> {
  try {
    const params = new URLSearchParams({ locale })
    if (sourceOrgSlug) params.set('sourceOrg', sourceOrgSlug)
    const res = await fetch(`${API_URL}/api/v1/incentives/property/${propertyId}?${params}`)
    if (!res.ok) return null
    return res.json() as Promise<IncentiveSlots | null>
  } catch { return null }
}

export function useIncentive(propertyId: number | null, locale = 'en', sourceOrgSlug?: string) {
  return useQuery<IncentiveSlots | null>({
    queryKey: ['incentive', propertyId, locale, sourceOrgSlug ?? null],
    queryFn: () => (propertyId ? fetchIncentive(propertyId, locale, sourceOrgSlug) : Promise.resolve(null)),
    enabled: propertyId !== null,
    staleTime: 30_000,
  })
}
