'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export default function OnboardingPage() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [hyperGuestOrgId, setHyperGuestOrgId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-org'],
    queryFn: () => apiClient.getOrgSettings(),
  })

  useEffect(() => {
    if (data) {
      if (data.hyperGuestOrgId) {
        router.replace('/admin')
        return
      }
      setOrgName(data.orgName ?? '')
    }
  }, [data, router])

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      apiClient.updateOrgSettings({
        orgName: orgName.trim(),
        hyperGuestOrgId: hyperGuestOrgId.trim(),
      }),
    onSuccess: () => router.replace('/admin'),
    onError: () => setError('Failed to save. Please try again.'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgName.trim() || !hyperGuestOrgId.trim()) return
    setError(null)
    mutate()
  }

  const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)]'

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Set up your account</h1>
        <p className="mb-6 text-sm text-[var(--color-text-muted)]">
          Enter your HyperGuest details to connect the booking engine.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Hotel / organization name</label>
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              required
              placeholder="Grand Hotel Lisboa"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">HyperGuest Org ID</label>
            <input
              type="text"
              value={hyperGuestOrgId}
              onChange={e => setHyperGuestOrgId(e.target.value)}
              required
              placeholder="Your demand organization ID"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Your demand organization ID in HyperGuest</p>
          </div>

          {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
