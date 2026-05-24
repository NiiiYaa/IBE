'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { SearchUrlParams } from '@/lib/search-params'
import type { InterHotelEffective, InterHotelPackageResponse } from '@ibe/shared'

export function useInterHotelSearch(
  baseParams: SearchUrlParams | null,
  config: InterHotelEffective | undefined,
  primaryHasResults: boolean,
): { packages: InterHotelPackageResponse[]; isLoading: boolean } {
  const active = config?.enabled === true && !primaryHasResults && baseParams !== null

  const { data, isLoading } = useQuery({
    queryKey: ['interhotel-search', baseParams],
    queryFn: async () => {
      if (!baseParams) return { packages: [] }
      const params: {
        propertyId: number
        checkIn: string
        checkOut: string
        rooms: SearchUrlParams['rooms']
        nationality?: string
        currency?: string
      } = {
        propertyId: baseParams.hotelId,
        checkIn: baseParams.checkIn,
        checkOut: baseParams.checkOut,
        rooms: baseParams.rooms,
      }
      if (baseParams.nationality) params.nationality = baseParams.nationality
      if (baseParams.currency) params.currency = baseParams.currency
      return apiClient.searchInterHotel(params)
    },
    enabled: active,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  if (!active) return { packages: [], isLoading: false }
  return { packages: data?.packages ?? [], isLoading }
}
