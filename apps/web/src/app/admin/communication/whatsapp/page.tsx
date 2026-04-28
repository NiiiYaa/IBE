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
  { value: 'wwebjs', label: 'Local', hint: 'Connect any WhatsApp number via QR code using a local bridge service' },
]

// ── System service row — toggle (super) or status pill (org admin) ────────────

function SystemServiceRow({
  disabled, isSuper, onToggle, saving,
}: { disabled: boolean; isSuper: boolean; onToggle: (v: boolean) => void; saving: boolean }) {
  if (isSuper) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">System WhatsApp service</p>
          <p className="text-xs text-[var(--color-text-muted)]">When disabled, this org uses no WhatsApp unless it has its own credentials.</p>
        </div>
        <button type="button" role="switch" aria-checked={!disabled} disabled={saving}
          onClick={() => onToggle(!disabled)}
          className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40',
            !disabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
          <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            !disabled ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
        </button>
      </div>
    )
  }
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className={['rounded-full px-2.5 py-0.5 text-xs font-semibold',
        disabled ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' : 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
      ].join(' ')}>
        System WhatsApp: {disabled ? 'Disabled by admin' : 'Active'}
      </span>
    </div>
  )
}

// ── Section card wrapper ───────────────────────────────────────────────────────

function SectionCard({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="mb-5 flex items-center gap-2">
        <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
        {badge && (
          <span className="rounded bg-purple-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-purple-700">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Inherited config badge ─────────────────────────────────────────────────────

type CommData = {
  whatsappEnabled: boolean
  whatsappProvider: string
  whatsappPhoneNumberId: string
  whatsappTwilioNumber: string
  whatsappWebjsServiceUrl: string
  whatsappAccessTokenSet: boolean
  whatsappTwilioAuthTokenSet: boolean
}

function WhatsAppInheritedBadge({ data }: { data: CommData | undefined }) {
  if (!data?.whatsappProvider && !data?.whatsappEnabled) {
    return <p className="text-sm text-[var(--color-text-muted)]">No system config set yet.</p>
  }
  const providerLabel = data.whatsappProvider === 'wwebjs' ? 'Local'
    : data.whatsappProvider === 'meta' ? 'Meta' : data.whatsappProvider === 'twilio' ? 'Twilio' : data.whatsappProvider
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
      <span className="font-medium text-[var(--color-text)]">{providerLabel}</span>
      {data.whatsappProvider === 'twilio' && data.whatsappTwilioNumber && (
        <span> · {data.whatsappTwilioNumber}</span>
      )}
      {data.whatsappProvider === 'meta' && data.whatsappPhoneNumberId && (
        <span> · {data.whatsappPhoneNumberId}</span>
      )}
      {data.whatsappEnabled
        ? <span className="ml-2 text-[var(--color-success)] text-xs font-medium">● Enabled</span>
        : <span className="ml-2 text-[var(--color-error)] text-xs font-medium">● Disabled</span>}
    </div>
  )
}

export default function WhatsAppPage() {
  const qc = useQueryClient()
  const { propertyId, orgId } = useAdminProperty()
  const { admin } = useAdminAuth()
  const isSystemLevel = admin?.role === 'super' && orgId === null && propertyId === null
  const isSuper = admin?.role === 'super'

  const queryKey = isSystemLevel ? ['system-communication'] : ['admin-communication-wa', orgId]

  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState<WhatsAppProvider>('meta')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [businessAccountId, setBusinessAccountId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [twilioAccountSid, setTwilioAccountSid] = useState('')
  const [twilioAuthToken, setTwilioAuthToken] = useState('')
  const [twilioNumber, setTwilioNumber] = useState('')
  const [webjsServiceUrl, setWebjsServiceUrl] = useState('')
  const [webjsServiceUrlOwn, setWebjsServiceUrlOwn] = useState('')
  const [useSystemDefault, setUseSystemDefault] = useState(true)
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => isSystemLevel
      ? apiClient.getSystemCommunicationSettings()
      : apiClient.getCommunicationSettings(isSuper && orgId ? orgId : undefined),
  })

  const { data: orgSettingsData } = useQuery({
    queryKey: ['admin-org-super', orgId ?? 'self'],
    queryFn: () => apiClient.getOrgSettings(isSuper && orgId ? orgId : undefined),
    enabled: !isSystemLevel && !propertyId,
    staleTime: 5 * 60 * 1000,
  })

  const chainName = orgSettingsData?.orgName ?? admin?.orgName ?? null

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
    setWebjsServiceUrl(data.whatsappWebjsServiceUrl)
    setWebjsServiceUrlOwn(data.whatsappWebjsServiceUrlOwn ?? '')
    setUseSystemDefault(!data.whatsappAccessTokenSet && !data.whatsappTwilioAuthTokenSet && !(data.whatsappWebjsServiceUrlOwn ?? ''))
  }, [data])

  const testMutation = useMutation({
    mutationFn: () => apiClient.testWhatsappConnection(isSuper ? (orgId ?? undefined) : undefined),
    onSuccess: (r) => setTestResult(r),
    onError: (e) => setTestResult({ ok: false, error: String(e) }),
  })

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
        whatsappWebjsServiceUrl: isSystemLevel ? webjsServiceUrl : webjsServiceUrlOwn.trim(),
      }
      return isSystemLevel
        ? apiClient.updateSystemCommunicationSettings(payload)
        : apiClient.updateCommunicationSettings({ ...payload, ...(isSuper && orgId ? { orgId } : {}) })
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

  const disableSystemMutation = useMutation({
    mutationFn: (disabled: boolean) =>
      apiClient.updateCommunicationSettings({ whatsappSystemServiceDisabled: disabled, ...(orgId ? { orgId } : {}) } as never),
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  })

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-mono focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

  if (isLoading) return <Spinner />

  if (propertyId) {
    return <PropertyWebjsSection propertyId={propertyId} orgId={orgId} isSuper={isSuper} />
  }

  function markDirty() { setIsDirty(true) }

  const systemDisabled = data?.whatsappSystemServiceDisabled ?? false

  const credentialForm = (withStoredHints: boolean) => (
    <>
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
      <p className="text-xs text-[var(--color-text-muted)]">{PROVIDERS.find(p => p.value === provider)?.hint}</p>
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
              placeholder={withStoredHints && data?.whatsappAccessTokenSet ? '(stored — leave blank to keep)' : 'Paste permanent access token'}
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
              placeholder={withStoredHints && data?.whatsappTwilioAuthTokenSet ? '(stored — leave blank to keep)' : 'Paste auth token'}
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
      {provider === 'wwebjs' && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            Uses the built-in Baileys service — no external bridge needed.
            Save, then scan the QR code that appears below to connect a WhatsApp number.
          </p>
        </div>
      )}
    </>
  )

  // ── System level ──────────────────────────────────────────────────────────────

  if (isSystemLevel) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">WhatsApp — System defaults</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Default WhatsApp configuration inherited by all organisations that have not configured their own.
          </p>
        </div>

        <SectionCard title="System Default" badge="Super">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Enable WhatsApp notifications</p>
                <p className="text-xs text-[var(--color-text-muted)]">Message guests on WhatsApp for booking events</p>
              </div>
              <Toggle enabled={enabled} onChange={v => { setEnabled(v); markDirty() }} />
            </div>
            <fieldset disabled={!enabled} className="space-y-4 disabled:opacity-50">
              {credentialForm(true)}
            </fieldset>
          </div>
        </SectionCard>

        {provider === 'wwebjs' && (
          <WebjsStatusPanel orgId={undefined} inherited={false} />
        )}

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

        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" disabled={testMutation.isPending} onClick={() => testMutation.mutate()}
            className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40">
            {testMutation.isPending ? 'Testing…' : 'Test Connection'}
          </button>
          {testResult && (
            <p className={testResult.ok ? 'text-sm text-[var(--color-success)]' : 'text-sm text-[var(--color-error)]'}>
              {testResult.ok ? '✓ Connection successful' : '✗ ' + testResult.error}
            </p>
          )}
        </div>

        <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate()} />
      </div>
    )
  }

  // ── Org level ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">WhatsApp</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {chainName ? <><span className="font-medium text-[var(--color-text)]">{chainName}</span> — </> : ''}
          Send booking confirmations and updates to guests via WhatsApp.
        </p>
      </div>

      <SectionCard title="Chain / Organisation">
        <SystemServiceRow
          disabled={systemDisabled}
          isSuper={isSuper ?? false}
          onToggle={v => disableSystemMutation.mutate(!v)}
          saving={disableSystemMutation.isPending}
        />

        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={useSystemDefault}
            onClick={() => setUseSystemDefault(v => !v)}
            className={['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
              useSystemDefault ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}
          >
            <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
              useSystemDefault ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
          </button>
          <span className="text-sm text-[var(--color-text)]">Use system default</span>
        </div>

        {useSystemDefault ? (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Currently inheriting from System</p>
            <WhatsAppInheritedBadge data={data as CommData | undefined} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Enable WhatsApp notifications</p>
                <p className="text-xs text-[var(--color-text-muted)]">Message guests on WhatsApp for booking events</p>
              </div>
              <Toggle enabled={enabled} onChange={v => { setEnabled(v); markDirty() }} />
            </div>
            <fieldset disabled={!enabled} className="space-y-4 disabled:opacity-50">
              {credentialForm(true)}
            </fieldset>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">What gets sent</p>
              <ul className="space-y-1 text-xs text-[var(--color-text-muted)]">
                <li>• Booking confirmation (immediately after booking)</li>
                <li>• Booking cancellation</li>
                <li>• Pre-arrival reminder (configurable timing)</li>
              </ul>
            </div>
          </div>
        )}

        {/* Own number on system wwebjs — shown when inheriting and system uses Local */}
        {useSystemDefault && data?.whatsappProvider === 'wwebjs' && !systemDisabled && (
          <div className="mt-4">
            <OwnWebjsNumberSection
              orgId={orgId ?? undefined}
              onActivate={() => {
                apiClient.updateCommunicationSettings({
                  whatsappEnabled: true,
                  whatsappProvider: 'wwebjs',
                  ...(orgId ? { orgId } : {}),
                } as never).then(() => void qc.invalidateQueries({ queryKey }))
              }}
            />
          </div>
        )}
      </SectionCard>

      {!useSystemDefault && provider === 'wwebjs' && (
        <WebjsStatusPanel orgId={isSuper ? (orgId ?? undefined) : undefined} inherited={false} />
      )}

      {!useSystemDefault && provider === 'meta' && webhookInfo && (
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

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" disabled={testMutation.isPending} onClick={() => testMutation.mutate()}
          className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40">
          {testMutation.isPending ? 'Testing…' : 'Test Connection'}
        </button>
        {testResult && (
          <p className={testResult.ok ? 'text-sm text-[var(--color-success)]' : 'text-sm text-[var(--color-error)]'}>
            {testResult.ok ? '✓ Connection successful' : '✗ ' + testResult.error}
          </p>
        )}
      </div>

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

function WebjsStatusPanel({ orgId, inherited }: { orgId?: number | undefined; inherited?: boolean | undefined }) {
  const qc = useQueryClient()

  const { data: statusData, isLoading } = useQuery({
    queryKey: ['wwebjs-status', orgId],
    queryFn: () => apiClient.getWebjsStatus(orgId),
    refetchInterval: 3000,
  })

  const { data: qrData } = useQuery({
    queryKey: ['wwebjs-qr', orgId],
    queryFn: () => apiClient.getWebjsQr(orgId),
    enabled: statusData?.status === 'qr',
    refetchInterval: statusData?.status === 'qr' ? 5000 : false,
  })

  const connectMutation = useMutation({
    mutationFn: async () => {
      try { await apiClient.getWebjsQr(orgId) } catch { /* 404 expected — init still triggered */ }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['wwebjs-status', orgId] }),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => apiClient.disconnectWwebjs(orgId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['wwebjs-status', orgId] }),
  })

  if (isLoading) return null

  const status = statusData?.status ?? 'disconnected'

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">
            Local Connection
            {inherited && <span className="ml-2 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">System</span>}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {status === 'connected' && `Connected as +${statusData?.phoneNumber}`}
            {status === 'qr' && 'Scan the QR code with WhatsApp to connect'}
            {status === 'disconnected' && 'Not connected — click Connect to generate a QR code'}
          </p>
        </div>
        <span className={[
          'rounded-full px-2.5 py-0.5 text-xs font-semibold',
          status === 'connected' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
          status === 'qr' ? 'bg-amber-100 text-amber-700' :
          'bg-[var(--color-border)] text-[var(--color-text-muted)]',
        ].join(' ')}>
          {status === 'connected' ? 'Connected' : status === 'qr' ? 'Awaiting scan' : 'Disconnected'}
        </span>
      </div>

      {status === 'qr' && qrData?.qr && (
        <div className="flex justify-center">
          <img src={qrData.qr} alt="WhatsApp QR code" className="h-48 w-48 rounded-lg border border-[var(--color-border)]" />
        </div>
      )}

      {status === 'disconnected' && (
        <button
          type="button"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
          className="rounded-lg border border-[var(--color-primary)]/40 px-4 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40 transition-colors"
        >
          {connectMutation.isPending ? 'Connecting…' : 'Connect'}
        </button>
      )}

      {status === 'connected' && (
        <button
          type="button"
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
          className="rounded-lg border border-[var(--color-error)]/40 px-4 py-1.5 text-xs font-medium text-[var(--color-error)] hover:bg-[var(--color-error)]/5 disabled:opacity-40 transition-colors"
        >
          {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
        </button>
      )}
    </div>
  )
}

// ── Own number on system wwebjs (org level) ───────────────────────────────────

function OwnWebjsNumberSection({ orgId, onActivate }: { orgId?: number | undefined; onActivate: () => void }) {
  const { data: statusData, isLoading } = useQuery({
    queryKey: ['wwebjs-status', orgId],
    queryFn: () => apiClient.getWebjsStatus(orgId),
    refetchInterval: 3000,
  })

  const status = statusData?.status ?? 'disconnected'
  const isActive = status === 'connected' || status === 'qr'

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          Own WhatsApp number
          <span className="ml-2 rounded-full bg-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Local QR</span>
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          Scan a QR code to connect a dedicated number for this chain via the local WhatsApp bridge.
          Available because the super admin has enabled this for your account.
        </p>
      </div>

      {!isLoading && !isActive && (
        <button type="button" onClick={onActivate}
          className="rounded-lg border border-[var(--color-primary)]/40 px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors">
          Generate QR code
        </button>
      )}

      {isActive && <WebjsStatusPanel orgId={orgId} inherited={false} />}
    </div>
  )
}

// ── Property-level wwebjs section ─────────────────────────────────────────────

function PropertyWebjsSection({ propertyId, orgId, isSuper }: { propertyId: number; orgId: number | null | undefined; isSuper: boolean }) {
  const qc = useQueryClient()
  const queryKey = ['property-wwebjs', propertyId]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiClient.getPropertyWebjsSettings(propertyId),
  })

  const [showOwn, setShowOwn] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [serviceUrlOwn, setServiceUrlOwn] = useState('')

  useEffect(() => {
    if (!data) return
    setServiceUrlOwn(data.whatsappWebjsServiceUrl)
    setShowOwn(!!data.whatsappWebjsServiceUrl)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => apiClient.updatePropertyWebjsSettings(propertyId, { whatsappWebjsServiceUrl: serviceUrlOwn.trim() }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey }); setIsDirty(false) },
  })

  const disableMutation = useMutation({
    mutationFn: (disabled: boolean) => apiClient.updatePropertyWebjsSettings(propertyId, { whatsappSystemServiceDisabled: disabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  })

  if (isLoading) return null

  const hasInherited = !!(data?.inheritedProvider === 'wwebjs' && data.inheritedWebjsUrl)
  const inheritedDisabled = data?.inheritedDisabled ?? false
  const ownUrl = data?.whatsappWebjsServiceUrl ?? ''
  const systemDisabled = data?.whatsappSystemServiceDisabled ?? false

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">WhatsApp</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">WhatsApp configuration for this hotel.</p>
      </div>

      {isSuper && hasInherited && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">
                Inherited WhatsApp service
                <span className="ml-2 rounded-full bg-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Local</span>
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {systemDisabled ? 'Inherited service is disabled for this hotel.' : inheritedDisabled ? 'Chain has disabled the inherited service.' : 'This hotel inherits the chain / system local number.'}
              </p>
            </div>
            <button type="button" role="switch" aria-checked={!systemDisabled}
              onClick={() => disableMutation.mutate(!systemDisabled)} disabled={disableMutation.isPending}
              className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40',
                !systemDisabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
              <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                !systemDisabled ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
            </button>
          </div>
        </div>
      )}

      {hasInherited && !systemDisabled && !inheritedDisabled && !ownUrl && (
        <PropertyWebjsStatusPanel propertyId={propertyId} orgId={orgId ?? undefined} hasOwn={false} />
      )}

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Own WhatsApp number
            <span className="ml-2 rounded-full bg-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Local QR</span>
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {ownUrl
              ? 'This hotel uses a dedicated number via the local WhatsApp bridge.'
              : 'Scan a QR code to connect a dedicated number for this hotel via the local WhatsApp bridge.'}
          </p>
        </div>
        {showOwn ? (
          <>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 space-y-2">
              <p className="text-xs text-[var(--color-text-muted)]">Save to generate a QR code, then scan it with the WhatsApp number you want to use.</p>
              {serviceUrlOwn && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Custom Service URL (advanced)</label>
                  <input type="text" value={serviceUrlOwn} onChange={e => { setServiceUrlOwn(e.target.value); setIsDirty(true) }}
                    placeholder="http://your-server:3002"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-mono focus:border-[var(--color-primary)] focus:outline-none" />
                </div>
              )}
              <button type="button" onClick={() => { setServiceUrlOwn(''); setShowOwn(false); setIsDirty(true) }}
                className="text-xs text-[var(--color-error)] underline underline-offset-2">
                Remove own number (revert to inherited)
              </button>
            </div>
            {ownUrl && <PropertyWebjsStatusPanel propertyId={propertyId} orgId={orgId ?? undefined} hasOwn={true} />}
          </>
        ) : (
          <button type="button" onClick={() => setShowOwn(true)}
            className="rounded-lg border border-[var(--color-primary)]/40 px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors">
            + Set up own number
          </button>
        )}
      </div>

      <SaveBar isDirty={isDirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate()} />
    </div>
  )
}

function PropertyWebjsStatusPanel({ propertyId, orgId, hasOwn }: { propertyId: number; orgId?: number | undefined; hasOwn: boolean }) {
  const qc = useQueryClient()

  const { data: statusData } = useQuery({
    queryKey: ['property-wwebjs-status', propertyId],
    queryFn: () => apiClient.getPropertyWebjsStatus(propertyId, orgId),
    refetchInterval: 3000,
  })

  const { data: qrData } = useQuery({
    queryKey: ['property-wwebjs-qr', propertyId],
    queryFn: () => apiClient.getPropertyWebjsQr(propertyId, orgId),
    enabled: statusData?.status === 'qr',
    refetchInterval: statusData?.status === 'qr' ? 5000 : false,
  })

  const disconnectMutation = useMutation({
    mutationFn: () => apiClient.disconnectPropertyWwebjs(propertyId, orgId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['property-wwebjs-status', propertyId] }),
  })

  const status = statusData?.status ?? 'disconnected'

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">
            Local Connection
            {!hasOwn && <span className="ml-2 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">Inherited</span>}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {status === 'connected' && `Connected as +${statusData?.phoneNumber}`}
            {status === 'qr' && 'Scan the QR code with WhatsApp to connect'}
            {status === 'disconnected' && 'Not connected'}
          </p>
        </div>
        <span className={['rounded-full px-2.5 py-0.5 text-xs font-semibold',
          status === 'connected' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
          status === 'qr' ? 'bg-amber-100 text-amber-700' :
          'bg-[var(--color-border)] text-[var(--color-text-muted)]'].join(' ')}>
          {status === 'connected' ? 'Connected' : status === 'qr' ? 'Awaiting scan' : 'Disconnected'}
        </span>
      </div>
      {status === 'qr' && qrData?.qr && (
        <div className="flex justify-center">
          <img src={qrData.qr} alt="WhatsApp QR code" className="h-48 w-48 rounded-lg border border-[var(--color-border)]" />
        </div>
      )}
      {status === 'connected' && hasOwn && (
        <button type="button" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}
          className="rounded-lg border border-[var(--color-error)]/40 px-4 py-1.5 text-xs font-medium text-[var(--color-error)] hover:bg-[var(--color-error)]/5 disabled:opacity-40 transition-colors">
          {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
        </button>
      )}
    </div>
  )
}
