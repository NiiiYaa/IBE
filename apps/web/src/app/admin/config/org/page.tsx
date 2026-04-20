'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">{label}</label>
      {hint && <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">{hint}</p>}
      {children}
    </div>
  )
}

function DomainField({
  label,
  hint,
  value,
  onChange,
  effectiveValue,
  hasDefault,
  isLocked,
  onUnlock,
  onReset,
  inputCls,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  effectiveValue: string
  hasDefault: boolean
  isLocked: boolean
  onUnlock: () => void
  onReset: () => void
  inputCls: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--color-text)]">{label}</label>
        {hasDefault && isLocked && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            System default
          </span>
        )}
      </div>
      {hint && <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">{hint}</p>}
      {isLocked ? (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 opacity-60">
          <span className="flex-1 truncate font-mono text-sm text-[var(--color-text)]">
            {effectiveValue || '—'}
          </span>
          <button
            type="button"
            onClick={onUnlock}
            className="shrink-0 text-xs font-medium text-[var(--color-primary)] opacity-100 hover:underline"
          >
            Override
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={hasDefault ? effectiveValue : 'e.g. domain.hyperguest.com'}
            className={inputCls}
          />
          {hasDefault && (
            <button
              type="button"
              onClick={onReset}
              className="shrink-0 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function OrgPage() {
  const qc = useQueryClient()
  const [hgOrgId, setHgOrgId] = useState('')
  const [token, setToken] = useState('')
  const [tokenVisible, setTokenVisible] = useState(false)
  const [staticDomain, setStaticDomain] = useState('')
  const [staticLocked, setStaticLocked] = useState(false)
  const [searchDomain, setSearchDomain] = useState('')
  const [searchLocked, setSearchLocked] = useState(false)
  const [bookingDomain, setBookingDomain] = useState('')
  const [bookingLocked, setBookingLocked] = useState(false)
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
      setStaticLocked(data.envFallback.staticDomain)
      setSearchDomain(data.hyperGuestSearchDomain ?? '')
      setSearchLocked(data.envFallback.searchDomain)
      setBookingDomain(data.hyperGuestBookingDomain ?? '')
      setBookingLocked(data.envFallback.bookingDomain)
    }
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      apiClient.updateOrgSettings({
        hyperGuestOrgId: hgOrgId,
        hyperGuestBearerToken: token,
        hyperGuestStaticDomain: staticLocked ? '' : staticDomain,
        hyperGuestSearchDomain: searchLocked ? '' : searchDomain,
        hyperGuestBookingDomain: bookingLocked ? '' : bookingDomain,
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
            HyperGuest API credentials. Domain fields showing a system default are shared across all accounts — click Override to set an account-specific value.
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
            ? 'HyperGuest is connected.'
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
              autoComplete="new-password"
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

        <DomainField
          label="Static Domain"
          hint="Used to fetch property static data (images, rooms, descriptions)."
          value={staticDomain}
          onChange={setStaticDomain}
          effectiveValue={data?.effectiveStaticDomain ?? ''}
          hasDefault={data?.envDefault.staticDomain ?? false}
          isLocked={staticLocked}
          onUnlock={() => { setStaticLocked(false); setStaticDomain(data?.effectiveStaticDomain ?? '') }}
          onReset={() => { setStaticLocked(true); setStaticDomain('') }}
          inputCls={inputCls}
        />

        <DomainField
          label="Search Domain"
          hint="Used for availability search requests."
          value={searchDomain}
          onChange={setSearchDomain}
          effectiveValue={data?.effectiveSearchDomain ?? ''}
          hasDefault={data?.envDefault.searchDomain ?? false}
          isLocked={searchLocked}
          onUnlock={() => { setSearchLocked(false); setSearchDomain(data?.effectiveSearchDomain ?? '') }}
          onReset={() => { setSearchLocked(true); setSearchDomain('') }}
          inputCls={inputCls}
        />

        <DomainField
          label="Booking Domain"
          hint="Used for create and list booking requests."
          value={bookingDomain}
          onChange={setBookingDomain}
          effectiveValue={data?.effectiveBookingDomain ?? ''}
          hasDefault={data?.envDefault.bookingDomain ?? false}
          isLocked={bookingLocked}
          onUnlock={() => { setBookingLocked(false); setBookingDomain(data?.effectiveBookingDomain ?? '') }}
          onReset={() => { setBookingLocked(true); setBookingDomain('') }}
          inputCls={inputCls}
        />
      </div>

      <p className="mt-3 text-xs text-[var(--color-text-muted)]">
        Changes apply within 60 seconds — no restart required.
      </p>
    </div>
  )
}
