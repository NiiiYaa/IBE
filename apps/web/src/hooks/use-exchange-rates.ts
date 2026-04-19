'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export function useExchangeRates(base: string | null | undefined) {
  return useQuery({
    queryKey: ['exchange-rates', base],
    queryFn: () => apiClient.getExchangeRates(base!),
    enabled: !!base,
    staleTime: 6 * 60 * 60 * 1000, // 6 hours — matches server cache TTL
    gcTime: 12 * 60 * 60 * 1000,
  })
}

/** Returns a function that converts an amount from `base` to `target`. */
export function useConvertCurrency(base: string | null | undefined, target: string) {
  const { data: rates } = useExchangeRates(base)
  return (amount: number): number => {
    if (!rates || !base || base === target) return amount
    const rate = rates.rates[target]
    if (!rate) return amount
    return amount * rate
  }
}
