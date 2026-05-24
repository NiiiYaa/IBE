import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export function useMultiCityConfig(orgId: number | null) {
  return useQuery({
    queryKey: ['multi-city-config', orgId],
    queryFn: () => apiClient.getOrgMultiCityEffective(orgId!),
    enabled: orgId != null,
    staleTime: 5 * 60 * 1000,
  })
}
