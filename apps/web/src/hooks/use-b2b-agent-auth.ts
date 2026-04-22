'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiClient } from '../lib/api-client'

export function useB2BAgentAuth() {
  const queryClient = useQueryClient()
  const router = useRouter()

  const { data: agent, isLoading, isError } = useQuery({
    queryKey: ['b2b-agent-me'],
    queryFn: () => apiClient.b2bMe(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const logoutMutation = useMutation({
    mutationFn: () => apiClient.b2bLogout(),
    onSettled: () => {
      queryClient.clear()
      router.push('/b2b/login')
    },
  })

  return {
    agent,
    isLoading,
    isAuthenticated: !!agent && !isError,
    logout: () => logoutMutation.mutate(),
  }
}
