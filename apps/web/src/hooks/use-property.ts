'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export function useProperty(propertyId: number | null) {
  return useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => {
      if (!propertyId) throw new Error('No property ID')
      return apiClient.getProperty(propertyId)
    },
    enabled: !!propertyId,
    staleTime: 60 * 60 * 1000, // 1 hour — static data rarely changes
  })
}
