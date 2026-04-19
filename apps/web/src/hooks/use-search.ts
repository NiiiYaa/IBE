'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { encodeSearchParams } from '@/lib/search-params'
import type { SearchUrlParams } from '@/lib/search-params'

export function useSearch(params: SearchUrlParams | null) {
  return useQuery({
    queryKey: ['search', params],
    queryFn: () => {
      if (!params) throw new Error('No search params')
      return apiClient.search(encodeSearchParams(params))
    },
    enabled: !!params,
    staleTime: 4 * 60 * 1000, // 4 minutes (slightly under the 5-min server cache)
    retry: 1,
  })
}
