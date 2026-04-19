'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { apiClient } from '@/lib/api-client'

export default function SearchBarOptionsPage() {
  const qc = useQueryClient()
  const { isAuthenticated } = useAdminAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: () => apiClient.listProperties(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  })

  const citySelectorMutation = useMutation({
    mutationFn: (enabled: boolean) => apiClient.setShowCitySelector(enabled),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-properties'] }),
  })

  const showCitySelector = data?.showCitySelector ?? false

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-2 text-xl font-semibold text-[var(--color-text)]">Search Bar Options</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        Configure search bar behaviour for multiple-property mode.
      </p>

      {isLoading ? (
        <div className="h-20 animate-pulse rounded-xl bg-[var(--color-border)]" />
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Show city selector</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Groups properties by city. Guests pick a city first, then a hotel within it.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={showCitySelector}
            onClick={() => citySelectorMutation.mutate(!showCitySelector)}
            className={[
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
              showCitySelector ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
            ].join(' ')}
          >
            <span className={[
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
              showCitySelector ? 'translate-x-5' : 'translate-x-0',
            ].join(' ')} />
          </button>
        </div>
      )}
    </div>
  )
}
