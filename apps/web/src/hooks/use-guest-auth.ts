'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiClient } from '../lib/api-client'

export function useGuestAuth() {
  const queryClient = useQueryClient()
  const router = useRouter()

  const { data: guest, isLoading, isError } = useQuery({
    queryKey: ['guest-me'],
    queryFn: () => apiClient.getGuestMe(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const logoutMutation = useMutation({
    mutationFn: () => apiClient.guestLogout(),
    onSettled: () => {
      queryClient.clear()
      router.push('/account/login')
    },
  })

  return {
    guest,
    isLoading,
    isAuthenticated: !!guest && !isError,
    logout: () => logoutMutation.mutate(),
  }
}

export function useRequireGuestAuth() {
  const auth = useGuestAuth()
  const router = useRouter()

  if (!auth.isLoading && !auth.isAuthenticated) {
    router.replace('/account/login')
  }

  return auth
}
