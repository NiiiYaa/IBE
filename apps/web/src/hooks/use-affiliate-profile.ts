import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { AffiliateProfile } from '@ibe/shared'

export function useAffiliateProfile() {
  return useQuery<AffiliateProfile>({
    queryKey: ['affiliate-profile'],
    queryFn: () => apiClient.affiliateProfile(),
    staleTime: 60_000,
  })
}

export function profileCompletionScore(p: AffiliateProfile | undefined): { score: number; missing: string[] } {
  if (!p) return { score: 0, missing: [] }
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: 'Promotion methods',     ok: p.promotionMethods.length > 0 },
    { label: 'Audience location',     ok: p.audienceLocations.length > 0 },
    { label: 'Audience type',         ok: p.audienceTypes.length > 0 },
    { label: 'Terms accepted',        ok: !!p.termsAgreedAt },
    { label: 'Primary language',      ok: !!p.primaryLanguage },
    { label: 'Monthly traffic',       ok: !!p.monthlyTraffic },
    { label: 'Payment method',        ok: !!p.paymentMethod },
  ]
  const missing = checks.filter(c => !c.ok).map(c => c.label)
  const score = Math.round(((checks.length - missing.length) / checks.length) * 100)
  return { score, missing }
}

export function isProfileOperational(p: AffiliateProfile | undefined): boolean {
  if (!p) return false
  return !!p.termsAgreedAt && p.promotionMethods.length > 0
}
