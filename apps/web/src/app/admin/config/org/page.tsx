'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

function EnvBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-600">
      from env
    </span>
  )
}

function Field({
  label,
  hint,
  envFallback,
  children,
}: {
  label: string
  hint?: string
  envFallback?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-center">
        <label className="text-sm font-medium text-[var(--color-text)]">{label}</label>
        {envFallback && <EnvBadge />}
      </div>
      {hint && <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">{hint}</p>}
      {children}
    </div>
  )
}

export default function OrgPage() {
  const qc = useQueryClient()
  const [hgOrgId, setHgOrgId] = useState('')
  const [token, setToken] = useState('')
  const [tokenVisible, setTokenVisible] = useState(false)
  const [staticDomain, setStaticDomain] = useState('')
  const [searchDomain, setSearchDomain] = useState('')
  const [bookingDomain, setBookingDomain] = useState('')
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-org'],
    queryFn: () => apiClient.getOrgSettings(),
  })

  useEffect(() => {
    if (data) {
      setHgOrgId(data.hyperGuestOrgId ?? '')
      setToken(data.hyperGuestBearerToken ?? '')
      setStaticDomain(data.hyperGuestStaticDomain ?? '')
      setSearchDomain(data.hyperGuestSearchDomain ?? '')
      setBookingDomain(data.hyperGuestBookingDomain ?? '')
    }
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      apiClient.updateOrgSettings({
        hyperGuestOrgId: hgOrgId,
        hyperGuestBearerToken: token,
        hyperGuestStaticDomain: staticDomain,
        hyperGuestSearchDomain: searchDomain,
        hyperGuestBookingDomain: bookingDomain,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-org'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const inputCls =
    'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-mono focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Organization</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            HyperGuest API credentials. Leave a field blank to keep using the environment variable.
          </p>
        </div>
        <button
          onClick={() => mutate()}
          disabled={isPending}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {isPending ? (
            <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</>
          ) : saved ? (
            <><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Saved</>
          ) : 'Save'}
        </button>
      </div>

      {data && (
        <div className={[
          'mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs',
          data.effectiveBearerTokenSet
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-amber-200 bg-amber-50 text-amber-700',
        ].join(' ')}>
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {data.effectiveBearerTokenSet
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />}
          </svg>
          {data.effectiveBearerTokenSet
            ? 'HyperGuest is connected. Domain fields marked "from env" are using environment variables — override them here if needed.'
            : 'No Bearer Token configured. The IBE will not function until a valid token is saved here.'}
        </div>
      )}

      <div className="space-y-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <Field
          label="HyperGuest Org ID"
          hint="Your demand organization ID in HyperGuest — required for admin login."
        >
          <input
            type="text"
            value={hgOrgId}
            onChange={e => setHgOrgId(e.target.value)}
            placeholder="e.g. demand-org-123"
            className={inputCls}
          />
        </Field>

        <div className="border-t border-[var(--color-border)]" />

        <Field
          label="Bearer Token"
          hint={data?.hyperGuestBearerTokenSet ? 'A token is stored. Enter a new value to replace it, or leave blank to keep the existing one.' : undefined}
        >
          <div className="relative">
            <input
              type={tokenVisible ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Paste token…"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setTokenVisible(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              {tokenVisible ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>

        <div className="border-t border-[var(--color-border)]" />

        <Field
          label="Static Domain"
          envFallback={data?.envFallback.staticDomain}
          hint={data?.effectiveStaticDomain ? `Active: ${data.effectiveStaticDomain}` : 'Used to fetch property static data (images, rooms, descriptions).'}
        >
          <input
            type="text"
            value={staticDomain}
            onChange={e => setStaticDomain(e.target.value)}
            placeholder={data?.envFallback.staticDomain ? `(using env var: ${data.effectiveStaticDomain})` : 'e.g. static.hyperguest.com'}
            className={inputCls}
          />
        </Field>

        <Field
          label="Search Domain"
          envFallback={data?.envFallback.searchDomain}
          hint={data?.effectiveSearchDomain ? `Active: ${data.effectiveSearchDomain}` : 'Used for availability search requests.'}
        >
          <input
            type="text"
            value={searchDomain}
            onChange={e => setSearchDomain(e.target.value)}
            placeholder={data?.envFallback.searchDomain ? `(using env var: ${data.effectiveSearchDomain})` : 'e.g. search.hyperguest.com'}
            className={inputCls}
          />
        </Field>

        <Field
          label="Booking Domain"
          envFallback={data?.envFallback.bookingDomain}
          hint={data?.effectiveBookingDomain ? `Active: ${data.effectiveBookingDomain}` : 'Used for create and list booking requests.'}
        >
          <input
            type="text"
            value={bookingDomain}
            onChange={e => setBookingDomain(e.target.value)}
            placeholder={data?.envFallback.bookingDomain ? `(using env var: ${data.effectiveBookingDomain})` : 'e.g. booking.hyperguest.com'}
            className={inputCls}
          />
        </Field>
      </div>

      <p className="mt-3 text-xs text-[var(--color-text-muted)]">
        Changes apply within 60 seconds — no restart required. Environment variables are used as fallbacks when a field is left blank.
      </p>
    </div>
  )
}
