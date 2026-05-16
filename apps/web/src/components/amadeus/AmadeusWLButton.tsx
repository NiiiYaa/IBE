'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useLocale } from '@/context/translations'

const WL_BASE = 'https://experiences.amadeus-discover.com'
const WL_LANGS = new Set(['en', 'fr', 'es', 'de', 'it', 'pl'])
const WL_CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'NZD', 'AUD', 'AED', 'CHF', 'CNY', 'CAD'])

interface Props {
  propertyId: number
  orgId?: number
  currency?: string
  label: string
}

export function AmadeusWLButton({ propertyId, orgId, currency, label }: Props) {
  const locale = useLocale()

  const { data } = useQuery({
    queryKey: ['wl-config', propertyId],
    queryFn: () => apiClient.getResolvedWLConfig(propertyId, orgId),
    enabled: propertyId > 0,
  })

  if (!data?.enabled || !data.channelUuid) return null

  const lang = WL_LANGS.has(locale) ? locale : 'en'
  const qs = new URLSearchParams({ lang })
  if (currency && WL_CURRENCIES.has(currency)) qs.set('currency', currency)
  if (data.iataCode) qs.set('iataCode', data.iataCode)

  const url = `${WL_BASE}/${data.channelUuid}?${qs}`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors"
    >
      {label}
    </a>
  )
}
