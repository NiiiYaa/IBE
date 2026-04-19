'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useExchangeRates } from '@/hooks/use-exchange-rates'

interface Props {
  checkin: string
  checkout: string
  adults: number
  children: number
  rooms: number
  propertyId: number
  directPrice: number | null
  currency: string
}

export function PriceComparisonBar({ checkin, checkout, adults, children, rooms, propertyId, directPrice, currency }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['price-comparison', checkin, checkout, adults, children, rooms, propertyId],
    queryFn: () => apiClient.getPriceComparison({ checkin, checkout, adults, children, rooms, propertyId }),
    staleTime: 2 * 60 * 60 * 1000,
    refetchInterval: (query) => {
      const results = query.state.data?.results ?? []
      const hasPending = results.some(r => r.status === 'pending')
      return hasPending ? 5000 : false
    },
  })

  const { data: usdRates } = useExchangeRates('USD')

  // Convert any price from its native OTA currency → the selected display currency
  const toSelected = (price: number, fromCurrency: string): number => {
    if (!usdRates || fromCurrency === currency) return price
    const inUsd = fromCurrency === 'USD' ? price : price / (usdRates.rates[fromCurrency] ?? 1)
    if (currency === 'USD') return inUsd
    return inUsd * (usdRates.rates[currency] ?? 1)
  }

  const results = data?.results ?? []
  const isPending = results.some(r => r.status === 'pending')
  const okResults = results.filter(r => r.status === 'ok' && r.price !== null)

  // Don't render if no OTAs configured and not loading
  if (!isLoading && results.length === 0) return null
  // Don't render if the only result is a nameless Xotelo pending placeholder
  const showSkeleton = isLoading || (isPending && okResults.length === 0)

  // Compute savings % against cheapest OTA — compare in the selected currency
  const lowestOta = okResults.length > 0
    ? Math.min(...okResults.map(r => toSelected(r.price!, r.currency)))
    : null
  const savings = directPrice && lowestOta && lowestOta > directPrice
    ? Math.round(((lowestOta - directPrice) / lowestOta) * 100)
    : null

  const fmt = (price: number, cur: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(price)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm shadow-sm">
      <span className="shrink-0 font-medium text-[var(--color-text-muted)]">Online rates</span>
      <span className="h-4 w-px shrink-0 bg-[var(--color-border)]" />

      {showSkeleton ? (
        <>
          {[1, 2, 3].map(i => (
            <div key={i} className="h-7 w-28 animate-pulse rounded-full bg-[var(--color-border)]" />
          ))}
        </>
      ) : (
        <>
          {okResults.map((r, i) => (
            <div
              key={`${r.otaId}-${i}`}
              className="flex items-center gap-1.5 rounded-full bg-pink-50 px-3 py-1 text-pink-800 ring-1 ring-inset ring-pink-200"
            >
              <span className="font-medium">{r.otaName}</span>
              <span>{fmt(toSelected(r.price!, r.currency), currency)}</span>
            </div>
          ))}
        </>
      )}

      {/* Direct booking pill */}
      {directPrice !== null && (
        <>
          <span className="h-4 w-px shrink-0 bg-[var(--color-border)]" />
          <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-green-800 ring-1 ring-inset ring-green-200 animate-[ourprice_2s_ease-in-out_infinite]">
            <span className="font-semibold">Our price</span>
            {savings !== null && (
              <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                -{savings}%
              </span>
            )}
            <span>{fmt(directPrice, currency)}</span>
          </div>
        </>
      )}
    </div>
  )
}
