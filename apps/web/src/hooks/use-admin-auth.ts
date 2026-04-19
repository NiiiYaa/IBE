'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiClient, ApiClientError } from '../lib/api-client'

export function useAdminAuth() {
  const queryClient = useQueryClient()
  const router = useRouter()

  const { data: admin, isLoading, isError } = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => apiClient.adminMe(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const logoutMutation = useMutation({
    mutationFn: () => apiClient.adminLogout(),
    onSettled: () => {
      queryClient.clear()
      router.push('/admin/login')
    },
  })

  return {
    admin,
    isLoading,
    isAuthenticated: !!admin && !isError,
    logout: () => logoutMutation.mutate(),
  }
}

export function useRequireAdminAuth() {
  const auth = useAdminAuth()
  const router = useRouter()

  if (!auth.isLoading && !auth.isAuthenticated) {
    router.replace('/admin/login')
  }

  return auth
}
