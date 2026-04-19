'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export function useOffersConstraints(propertyId: number | null) {
  const { data } = useQuery({
    queryKey: ['offers-constraints', propertyId],
    queryFn: () => apiClient.getOffersConstraints(propertyId!),
    enabled: propertyId !== null && propertyId > 0,
    staleTime: 30 * 1000,
  })
  return {
    minNights: data?.minNights ?? 1,
    maxNights: data?.maxNights ?? 30,
    minRooms: data?.minRooms ?? 1,
    maxRooms: data?.maxRooms ?? 4,
    bookingMode: (data?.bookingMode ?? 'single') as 'single' | 'multi',
    multiRoomLimitBy: (data?.multiRoomLimitBy ?? 'hotel') as 'search' | 'hotel',
  }
}
