'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function VerifyEmailInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  useEffect(() => {
    if (token) {
      window.location.href = `/api/v1/affiliate/verify-email?token=${encodeURIComponent(token)}`
    } else {
      window.location.href = '/affiliate/login?error=invalid_token'
    }
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="text-sm text-[var(--color-text-muted)]">Verifying your email…</div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  )
}
