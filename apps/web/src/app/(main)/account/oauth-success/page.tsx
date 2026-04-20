'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function OAuthSuccessInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const propertyId = searchParams.get('propertyId')
    if (propertyId && propertyId !== '0') {
      sessionStorage.setItem('guestPropertyId', propertyId)
    }
    router.replace('/account/bookings')
  }, [router, searchParams])

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
    </div>
  )
}

export default function OAuthSuccessPage() {
  return (
    <Suspense>
      <OAuthSuccessInner />
    </Suspense>
  )
}
