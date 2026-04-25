'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SmsProvider } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { SaveBar } from '@/app/admin/design/components'
import { useAdminProperty } from '../../property-context'
import { useAdminAuth } from '@/hooks/use-admin-auth'

const PROVIDERS: { value: SmsProvider; label: string; hint: string }[] = [
  { value: 'twilio', label: 'Twilio', hint: 'Industry-standard SMS API with global reach' },
  { value: 'vonage', label: 'Vonage', hint: 'Vonage (formerly Nexmo) SMS API' },
  { value: 'aws', label: 'AWS SNS', hint: 'Amazon Simple Notification Service' },
]

export default function SmsPage() {
  const qc = useQueryClient()
  const { propertyId, orgId } = useAdminProperty()
  const { admin } = useAdminAuth()
  const isSystemLevel = admin?.role === 'super' && orgId === null && propertyId === null

  const queryKey = isSystemLevel ? ['system-communication'] : ['admin-communication']

  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState<SmsProvider>('twilio')
  const [fromNumber, setFromNumber] = useState('')
  const [twilioAccountSid, setTwilioAccountSid] = useState('')
  const [twilioAuthToken, setTwilioAuthToken] = useState('')
  const [vonageApiKey, setVonageApiKey] = useState('')
  const [vonageApiSecret, setVonageApiSecret] = useState('')
  const [awsAccessKey, setAwsAccessKey] = useState('')
  const [awsSecretKey, setAwsSecretKey] = useState('')
  const [awsRegion, setAwsRegion] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => isSystemLevel
      ? apiClient.getSystemCommunicationSettings()
      : apiClient.getCommunicationSettings(),
  })

  useEffect(() => {
    if (!data) return
    setEnabled(data.smsEnabled)
    setProvider(data.smsProvider as SmsProvider)
    setFromNumber(data.smsFromNumber)
    setTwilioAccountSid(data.smsTwilioAccountSid)
    setVonageApiKey(data.smsVonageApiKey)
    setAwsAccessKey(data.smsAwsAccessKey)
    setAwsRegion(data.smsAwsRegion)
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const payload = {
        smsEnabled: enabled,
        smsProvider: provider,
        smsFromNumber: fromNumber,
        smsTwilioAccountSid: twilioAccountSid,
        ...(twilioAuthToken ? { smsTwilioAuthToken: twilioAuthToken } : {}),
        smsVonageApiKey: vonageApiKey,
        ...(vonageApiSecret ? { smsVonageApiSecret: vonageApiSecret } : {}),
        smsAwsAccessKey: awsAccessKey,
        ...(awsSecretKey ? { smsAwsSecretKey: awsSecretKey } : {}),
        smsAwsRegion: awsRegion,
      }
      return isSystemLevel
        ? apiClient.updateSystemCommunicationSettings(payload)
        : apiClient.updateCommunicationSettings(payload)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey })
      setTwilioAuthToken('')
      setVonageApiSecret('')
      setAwsSecretKey('')
      setIsDirty(false)
      setError(null)
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Save failed'),
  })

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-mono focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

  if (isLoading) return <Spinner />

  function markDirty() { setIsDirty(true) }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          SMS{isSystemLevel ? ' — System defaults' : ''}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {isSystemLevel
            ? 'Default SMS configuration inherited by all organisations that have not configured their own.'
            : 'Send booking confirmations and alerts to guests via SMS.'}
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">Enable SMS notifications</p>
          <p className="text-xs text-[var(--color-text-muted)]">Send text messages to guests for booking events</p>
        </div>
        <Toggle enabled={enabled} onChange={v => { setEnabled(v); markDirty() }} />
      </div>

      <fieldset disabled={!enabled} className="space-y-5 disabled:opacity-50">
        {/* Provider */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Provider</h2>
          <div className="flex gap-2">
            {PROVIDERS.map(p => (
              <button key={p.value} type="button" onClick={() => { setProvider(p.value); markDirty() }}
                className={['flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all',
                  provider === p.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            {PROVIDERS.find(p => p.value === provider)?.hint}
          </p>

          {/* From number — shared across providers */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
              {provider === 'aws' ? 'Sender ID / number' : 'From number'}
            </label>
            <input type="text" value={fromNumber} onChange={e => { setFromNumber(e.target.value); markDirty() }}
              placeholder="+15551234567" className={inputCls} />
          </div>

          {provider === 'twilio' && (
            <div className="space-y-3 pt-1 border-t border-[var(--color-border)]">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Account SID</label>
                <input type="text" value={twilioAccountSid} onChange={e => { setTwilioAccountSid(e.target.value); markDirty() }}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Auth Token</label>
                <input type="password" value={twilioAuthToken} onChange={e => { setTwilioAuthToken(e.target.value); markDirty() }}
                  placeholder={data?.smsTwilioAuthTokenSet ? '(stored — leave blank to keep)' : 'Paste auth token'}
                  className={inputCls} />
              </div>
            </div>
          )}

          {provider === 'vonage' && (
            <div className="space-y-3 pt-1 border-t border-[var(--color-border)]">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">API Key</label>
                <input type="text" value={vonageApiKey} onChange={e => { setVonageApiKey(e.target.value); markDirty() }}
                  placeholder="a1b2c3d4" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">API Secret</label>
                <input type="password" value={vonageApiSecret} onChange={e => { setVonageApiSecret(e.target.value); markDirty() }}
                  placeholder={data?.smsVonageApiSecretSet ? '(stored — leave blank to keep)' : 'Paste API secret'}
                  className={inputCls} />
              </div>
            </div>
          )}

          {provider === 'aws' && (
            <div className="space-y-3 pt-1 border-t border-[var(--color-border)]">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Access Key ID</label>
                <input type="text" value={awsAccessKey} onChange={e => { setAwsAccessKey(e.target.value); markDirty() }}
                  placeholder="AKIAIOSFODNN7EXAMPLE" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Secret Access Key</label>
                <input type="password" value={awsSecretKey} onChange={e => { setAwsSecretKey(e.target.value); markDirty() }}
                  placeholder={data?.smsAwsSecretKeySet ? '(stored — leave blank to keep)' : 'Paste secret key'}
                  className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Region</label>
                <input type="text" value={awsRegion} onChange={e => { setAwsRegion(e.target.value); markDirty() }}
                  placeholder="us-east-1" className={inputCls} />
              </div>
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">What gets sent</p>
          <ul className="space-y-1 text-xs text-[var(--color-text-muted)]">
            <li>• Booking confirmation with reference number</li>
            <li>• Booking cancellation notification</li>
            <li>• Pre-arrival check-in reminder</li>
          </ul>
        </div>
      </fieldset>

      {error && <ErrorBanner message={error} />}
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate()} />
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
    </div>
  )
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!enabled)}
      className={['relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
      <span className={['pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
        enabled ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-4 py-2 text-sm text-[var(--color-error)]">
      {message}
    </div>
  )
}
