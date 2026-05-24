import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useMultiCityConfig } from '../use-multicity-config'

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getOrgMultiCityEffective: vi.fn().mockResolvedValue({ enabled: true, maxLegs: 3 }),
  },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useMultiCityConfig', () => {
  it('returns undefined data when orgId is null', () => {
    const { result } = renderHook(() => useMultiCityConfig(null), { wrapper })
    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
  })

  it('fetches config when orgId is provided', async () => {
    const { result } = renderHook(() => useMultiCityConfig(5), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.enabled).toBe(true)
    expect(result.current.data?.maxLegs).toBe(3)
  })
})
