'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export function useHotelConfig(propertyId: number | null) {
  return useQuery({
    queryKey: ['hotel-config', propertyId],
    queryFn: () => {
      if (!propertyId) throw new Error('No property ID')
      return apiClient.getHotelConfig(propertyId)
    },
    enabled: !!propertyId,
    staleTime: 60 * 60 * 1000,
  })
}
