import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export function usePublicGroupConfig(propertyId: number | null, orgId?: number | null) {
  return useQuery({
    queryKey: ['public-group-config', propertyId, orgId],
    queryFn: () => apiClient.getPublicGroupConfig(propertyId!, orgId),
    enabled: propertyId != null,
    staleTime: 5 * 60 * 1000,
  })
}
