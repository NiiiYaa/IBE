'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { useAffiliateProfile, isProfileOperational } from '@/hooks/use-affiliate-profile'

export default function AffiliateHotelsPage() {
  const qc = useQueryClient()
  const [joining, setJoining] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Record<number, string>>({})

  const { data: hotels = [], isLoading } = useQuery({
    queryKey: ['affiliate-marketplace'],
    queryFn: () => apiClient.affiliateMarketplace(),
  })
  const { data: profile } = useAffiliateProfile()
  const operational = isProfileOperational(profile)

  const join = useMutation({
    mutationFn: (propertyId: number) => apiClient.affiliateJoin(propertyId),
    onMutate: (propertyId) => setJoining(propertyId),
    onSuccess: (res, propertyId) => {
      setFeedback(f => ({ ...f, [propertyId]: `Joined! Your code: ${res.code}` }))
      void qc.invalidateQueries({ queryKey: ['affiliate-marketplace'] })
      void qc.invalidateQueries({ queryKey: ['affiliate-links'] })
      void qc.invalidateQueries({ queryKey: ['affiliate-me'] })
    },
    onError: (err, propertyId) => {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to join'
      setFeedback(f => ({ ...f, [propertyId]: msg }))
    },
    onSettled: () => setJoining(null),
  })

  if (isLoading) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  if (hotels.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">No hotels are available in the marketplace yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Hotel Marketplace</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Join hotels to get your unique affiliate links and start earning commissions.
        </p>
      </div>

      {/* Profile gate banner */}
      {!operational && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            Complete your profile and accept the terms before joining hotel programs.
          </p>
          <Link
            href="/affiliate/onboarding"
            className="ml-4 shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            Complete profile
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hotels.map(hotel => (
          <div
            key={hotel.propertyId}
            className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 gap-4"
          >
            <div className="flex items-start gap-3">
              {hotel.logoUrl ? (
                <Image
                  src={hotel.logoUrl}
                  alt={hotel.displayName ?? hotel.propertyName}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-md object-contain"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[var(--color-background)] text-xl text-[var(--color-text-muted)]">
                  🏨
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--color-text)] truncate">
                  {hotel.displayName ?? hotel.propertyName}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {hotel.commissionRate}% commission
                </p>
              </div>
            </div>

            {feedback[hotel.propertyId] && (
              <p className={`text-xs ${feedback[hotel.propertyId]?.startsWith('Joined') ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {feedback[hotel.propertyId]}
              </p>
            )}

            {hotel.joined ? (
              <div className="mt-auto">
                <p className="text-xs font-medium text-[var(--color-success)]">✓ Joined</p>
                {hotel.affiliateCode && (
                  <p className="text-xs text-[var(--color-text-muted)]">Code: {hotel.affiliateCode}</p>
                )}
              </div>
            ) : !operational ? (
              <Link
                href="/affiliate/onboarding"
                className="mt-auto rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
              >
                Complete profile to join
              </Link>
            ) : (
              <button
                onClick={() => join.mutate(hotel.propertyId)}
                disabled={joining === hotel.propertyId}
                className="mt-auto rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
              >
                {joining === hotel.propertyId ? 'Joining…' : 'Join program'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
