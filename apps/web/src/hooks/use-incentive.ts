import { useQuery } from '@tanstack/react-query'
import type { IncentiveSlots } from '@ibe/shared'

const API_URL = typeof window !== 'undefined' ? '' : (process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001')

async function fetchIncentive(propertyId: number): Promise<IncentiveSlots | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/incentives/property/${propertyId}`)
    if (!res.ok) return null
    return res.json() as Promise<IncentiveSlots | null>
  } catch { return null }
}

export function useIncentive(propertyId: number | null) {
  return useQuery<IncentiveSlots | null>({
    queryKey: ['incentive', propertyId],
    queryFn: () => (propertyId ? fetchIncentive(propertyId) : Promise.resolve(null)),
    enabled: propertyId !== null,
    staleTime: 30_000,
  })
}
