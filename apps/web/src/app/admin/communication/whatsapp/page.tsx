'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { WhatsAppProvider } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { SaveBar } from '@/app/admin/design/components'
import { useAdminProperty } from '../../property-context'
import { useAdminAuth } from '@/hooks/use-admin-auth'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs font-mono text-[var(--color-text)]">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

const PROVIDERS: { value: WhatsAppProvider; label: string; hint: string }[] = [
  { value: 'meta', label: 'Meta (Cloud API)', hint: 'Official WhatsApp Business Cloud API — no middleware required' },
  { value: 'twilio', label: 'Twilio', hint: "Send WhatsApp messages via Twilio's WhatsApp Business API" },
]

export default function WhatsAppPage() {
  const qc = useQueryClient()
  const { propertyId, orgId } = useAdminProperty()
  const { admin } = useAdminAuth()
  const isSystemLevel = admin?.role === 'super' && orgId === null && propertyId === null

  const queryKey = isSystemLevel ? ['system-communication'] : ['admin-communication']

  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState<WhatsAppProvider>('meta')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [businessAccountId, setBusinessAccountId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [twilioAccountSid, setTwilioAccountSid] = useState('')
  const [twilioAuthToken, setTwilioAuthToken] = useState('')
  const [twilioNumber, setTwilioNumber] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => isSystemLevel
      ? apiClient.getSystemCommunicationSettings()
      : apiClient.getCommunicationSettings(),
  })

  const { data: webhookInfo } = useQuery({
    queryKey: ['whatsapp-webhook-info'],
    queryFn: () => apiClient.getWhatsAppWebhookInfo(),
    enabled: !isSystemLevel,
  })

  useEffect(() => {
    if (!data) return
    setEnabled(data.whatsappEnabled)
    setProvider(data.whatsappProvider as WhatsAppProvider)
    setPhoneNumberId(data.whatsappPhoneNumberId)
    setBusinessAccountId(data.whatsappBusinessAccountId)
    setTwilioAccountSid(data.whatsappTwilioAccountSid)
    setTwilioNumber(data.whatsappTwilioNumber)
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const payload = {
        whatsappEnabled: enabled,
        whatsappProvider: provider,
        whatsappPhoneNumberId: phoneNumberId,
        whatsappBusinessAccountId: businessAccountId,
        ...(accessToken ? { whatsappAccessToken: accessToken } : {}),
        whatsappTwilioAccountSid: twilioAccountSid,
        ...(twilioAuthToken ? { whatsappTwilioAuthToken: twilioAuthToken } : {}),
        whatsappTwilioNumber: twilioNumber,
      }
      return isSystemLevel
        ? apiClient.updateSystemCommunicationSettings(payload)
        : apiClient.updateCommunicationSettings(payload)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey })
      setAccessToken('')
      setTwilioAuthToken('')
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
          WhatsApp{isSystemLevel ? ' — System defaults' : ''}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {isSystemLevel
            ? 'Default WhatsApp configuration inherited by all organisations that have not configured their own.'
            : 'Send booking confirmations and updates to guests via WhatsApp.'}
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">Enable WhatsApp notifications</p>
          <p className="text-xs text-[var(--color-text-muted)]">Message guests on WhatsApp for booking events</p>
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

          {provider === 'meta' && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Phone Number ID</label>
                <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">Found in Meta Business → WhatsApp → Phone Numbers</p>
                <input type="text" value={phoneNumberId} onChange={e => { setPhoneNumberId(e.target.value); markDirty() }}
                  placeholder="123456789012345" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">WhatsApp Business Account ID</label>
                <input type="text" value={businessAccountId} onChange={e => { setBusinessAccountId(e.target.value); markDirty() }}
                  placeholder="987654321098765" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Access Token</label>
                <input type="password" value={accessToken} onChange={e => { setAccessToken(e.target.value); markDirty() }}
                  placeholder={data?.whatsappAccessTokenSet ? '(stored — leave blank to keep)' : 'Paste permanent access token'}
                  className={inputCls} />
              </div>

            </div>
          )}

          {provider === 'twilio' && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Account SID</label>
                <input type="text" value={twilioAccountSid} onChange={e => { setTwilioAccountSid(e.target.value); markDirty() }}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Auth Token</label>
                <input type="password" value={twilioAuthToken} onChange={e => { setTwilioAuthToken(e.target.value); markDirty() }}
                  placeholder={data?.whatsappTwilioAuthTokenSet ? '(stored — leave blank to keep)' : 'Paste auth token'}
                  className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">WhatsApp number</label>
                <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">Your Twilio WhatsApp-enabled number (e.g. whatsapp:+14155238886)</p>
                <input type="text" value={twilioNumber} onChange={e => { setTwilioNumber(e.target.value); markDirty() }}
                  placeholder="whatsapp:+14155238886" className={inputCls} />
              </div>
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">What gets sent</p>
          <ul className="space-y-1 text-xs text-[var(--color-text-muted)]">
            <li>• Booking confirmation (immediately after booking)</li>
            <li>• Booking cancellation</li>
            <li>• Pre-arrival reminder (configurable timing)</li>
          </ul>
        </div>
      </fieldset>

      {provider === 'meta' && webhookInfo && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Webhook configuration</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            In Meta Business Manager → WhatsApp → Configuration, paste these values:
          </p>
          <CopyField label="Callback URL" value={webhookInfo.webhookUrl} />
          <CopyField label="Verify Token" value={webhookInfo.verifyToken} />
          <p className="text-xs text-[var(--color-text-muted)]">
            Then subscribe to the <span className="font-mono font-medium">messages</span> field under Webhook Fields.
          </p>
        </div>
      )}

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
