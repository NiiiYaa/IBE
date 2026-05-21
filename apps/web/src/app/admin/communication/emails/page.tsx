'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { EmailProvider, PropertyEmailSettingsResponse } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { SaveBar } from '@/app/admin/design/components'
import { useAdminProperty } from '../../property-context'
import { useAdminAuth } from '@/hooks/use-admin-auth'

const PROVIDERS: { value: EmailProvider; label: string; hint: string }[] = [
  { value: 'smtp', label: 'SMTP', hint: 'Any SMTP server (Gmail, custom mail server, etc.)' },
  { value: 'sendgrid', label: 'SendGrid', hint: 'Twilio SendGrid transactional email API' },
  { value: 'mailgun', label: 'Mailgun', hint: 'Mailgun transactional email API' },
]

const SMTP_PORTS = [25, 465, 587, 2525]

export default function EmailsPage() {
  const qc = useQueryClient()
  const { propertyId, orgId } = useAdminProperty()
  const { admin } = useAdminAuth()
  const isSystemLevel = admin?.role === 'super' && orgId === null && propertyId === null
  const isSuper = admin?.role === 'super'

  const queryKey = isSystemLevel ? ['system-communication'] : ['admin-communication', orgId]

  const [useOwnEmail, setUseOwnEmail] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState<EmailProvider>('smtp')
  const [fromName, setFromName] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [emailSharedWithOrgs, setEmailSharedWithOrgs] = useState(true)
  const [emailSharedWithProperties, setEmailSharedWithProperties] = useState(true)

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => isSystemLevel
      ? apiClient.getSystemCommunicationSettings()
      : apiClient.getCommunicationSettings(isSuper && orgId ? orgId : undefined),
  })

  const { data: orgSettings } = useQuery({
    queryKey: ['org-settings', orgId ?? 'self'],
    queryFn: () => apiClient.getOrgSettings(isSuper && orgId ? orgId : undefined),
    enabled: !isSystemLevel,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!data) return
    const orgName = orgSettings?.orgName ?? ''
    const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '')
    setUseOwnEmail(data.emailUseOwn)
    setEnabled(data.emailEnabled)
    setProvider(data.emailProvider as EmailProvider)
    setFromName(data.emailFromName || orgName)
    setFromAddress(data.emailFromAddress || (orgSlug ? `no-reply@${orgSlug}.com` : ''))
    // Only populate SMTP fields when org has its own config — system values leak in otherwise
    if (data.emailUseOwn) {
      setSmtpHost(data.emailSmtpHost)
      setSmtpPort(data.emailSmtpPort)
      setSmtpUser(data.emailSmtpUser)
      setSmtpSecure(data.emailSmtpSecure)
    } else {
      setSmtpHost('')
      setSmtpPort(587)
      setSmtpUser('')
      setSmtpSecure(true)
    }
    // passwords/keys are write-only — leave blank unless user types
    setEmailSharedWithOrgs(data.emailSharedWithOrgs ?? true)
    setEmailSharedWithProperties(data.emailSharedWithProperties ?? true)
  }, [data, orgSettings])

  const testMutation = useMutation({
    mutationFn: () => apiClient.testEmailConnection(isSuper ? (orgId ?? undefined) : undefined),
    onSuccess: (r) => setTestResult(r),
    onError: (e) => setTestResult({ ok: false, error: String(e) }),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const sharingFlags = isSystemLevel
        ? { emailSharedWithOrgs }
        : { emailSharedWithProperties }
      const payload = (!isSystemLevel && !useOwnEmail) ? {
        emailUseOwn: false,
        emailFromName: fromName,
        emailFromAddress: fromAddress,
        emailSmtpPassword: null as null,
        emailApiKey: null as null,
        ...sharingFlags,
      } : {
        ...(!isSystemLevel ? { emailUseOwn: true as const } : {}),
        emailEnabled: enabled,
        emailProvider: provider,
        emailFromName: fromName,
        emailFromAddress: fromAddress,
        emailSmtpHost: smtpHost,
        emailSmtpPort: smtpPort,
        emailSmtpUser: smtpUser,
        emailSmtpSecure: smtpSecure,
        ...(smtpPassword ? { emailSmtpPassword: smtpPassword } : {}),
        ...(apiKey ? { emailApiKey: apiKey } : {}),
        ...sharingFlags,
      }
      return isSystemLevel
        ? apiClient.updateSystemCommunicationSettings(payload)
        : apiClient.updateCommunicationSettings({ ...payload, ...(isSuper && orgId ? { orgId } : {}) })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey })
      setSmtpPassword('')
      setApiKey('')
      setIsDirty(false)
      setError(null)
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Save failed'),
  })

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'
  const monoInputCls = inputCls + ' font-mono'

  if (isLoading) return <Spinner />

  function markDirty() { setIsDirty(true) }

  if (propertyId) {
    return <PropertyEmailSection propertyId={propertyId} orgId={orgId} isSuper={isSuper ?? false} />
  }

  const systemDisabled = data?.emailSystemServiceDisabled ?? false

  const providerForm = (
    <fieldset disabled={!enabled} className="space-y-5 disabled:opacity-50">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Sender</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">From name</label>
            <input type="text" value={fromName} onChange={e => { setFromName(e.target.value); markDirty() }}
              placeholder="Grand Hotel" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">From address</label>
            <input type="email" value={fromAddress} onChange={e => { setFromAddress(e.target.value); markDirty() }}
              placeholder="reservations@myhotel.com" className={monoInputCls} />
          </div>
        </div>
      </div>

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
        <p className="text-xs text-[var(--color-text-muted)]">{PROVIDERS.find(p => p.value === provider)?.hint}</p>
        {provider === 'smtp' && (
          <div className="space-y-3 pt-1">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">SMTP host</label>
                <input type="text" value={smtpHost} onChange={e => { setSmtpHost(e.target.value); markDirty() }}
                  placeholder="smtp.example.com" className={monoInputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Port</label>
                <select value={smtpPort} onChange={e => { setSmtpPort(Number(e.target.value)); markDirty() }} className={inputCls}>
                  {SMTP_PORTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Username</label>
                <input type="text" value={smtpUser} onChange={e => { setSmtpUser(e.target.value); markDirty() }}
                  placeholder="user@example.com" className={monoInputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Password</label>
                <input type="password" value={smtpPassword} onChange={e => { setSmtpPassword(e.target.value); markDirty() }}
                  placeholder={data?.emailSmtpPasswordSet ? '(stored — leave blank to keep)' : 'Enter password'}
                  className={monoInputCls} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={smtpSecure} onChange={e => { setSmtpSecure(e.target.checked); markDirty() }}
                className="h-4 w-4 accent-[var(--color-primary)]" />
              <span className="text-sm text-[var(--color-text)]">Use TLS / SSL</span>
            </label>
          </div>
        )}
        {(provider === 'sendgrid' || provider === 'mailgun') && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">API Key</label>
            <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); markDirty() }}
              placeholder={data?.emailApiKeySet ? '(stored — leave blank to keep)' : `Paste ${provider === 'sendgrid' ? 'SendGrid' : 'Mailgun'} API key`}
              className={monoInputCls} />
          </div>
        )}
      </div>
    </fieldset>
  )

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          Emails{isSystemLevel ? ' — System defaults' : ''}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {isSystemLevel
            ? 'Default email configuration inherited by all organisations that have not configured their own.'
            : 'Configure outbound email for booking confirmations and guest notifications.'}
        </p>
      </div>

      {/* Enable toggle — always at the top */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">Enable email notifications</p>
          <p className="text-xs text-[var(--color-text-muted)]">Send booking confirmations and updates to guests via email</p>
        </div>
        <Toggle enabled={enabled} onChange={v => { setEnabled(v); markDirty() }} />
      </div>

      {enabled && (<>

      {/* System level: provider form only */}
      {isSystemLevel && providerForm}

      {/* Org level: explicit toggle then content */}
      {!isSystemLevel && (
        <>
          {/* Use System / Use my own toggle */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <div className="flex items-center gap-3">
              <button type="button" role="switch" aria-checked={useOwnEmail}
                onClick={() => { setUseOwnEmail(v => !v); markDirty() }}
                className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                  useOwnEmail ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
                <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                  useOwnEmail ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
              </button>
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {useOwnEmail ? 'Use my own credentials' : 'Use System (if allowed)'}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {useOwnEmail
                    ? 'Emails are sent via your own SMTP or API key.'
                    : 'Emails are sent via the system provider. No credentials needed.'}
                </p>
              </div>
            </div>
          </div>

          {/* Use System: service status + sender branding */}
          {!useOwnEmail && (
            <>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">System Email service</p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                      {systemDisabled
                        ? 'System email is disabled for this organisation by a super admin.'
                        : data?.emailEnabled
                          ? 'Active — emails are sent via the system provider.'
                          : 'System email is not currently configured or enabled.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!systemDisabled && data?.emailEnabled && data?.emailProvider && (
                      <span className="rounded bg-[var(--color-border)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                        {PROVIDERS.find(p => p.value === data.emailProvider)?.label ?? data.emailProvider}
                      </span>
                    )}
                    {isSuper ? (
                      <button type="button" role="switch" aria-checked={!systemDisabled}
                        onClick={() => {
                          apiClient.updateCommunicationSettings({ emailSystemServiceDisabled: !systemDisabled, ...(orgId ? { orgId } : {}) } as never)
                            .then(() => void qc.invalidateQueries({ queryKey }))
                        }}
                        className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                          !systemDisabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
                        <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                          !systemDisabled ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
                      </button>
                    ) : (
                      <span className={['rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        systemDisabled || !data?.emailEnabled
                          ? 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                          : 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
                      ].join(' ')}>
                        {systemDisabled ? 'Disabled by admin' : data?.emailEnabled ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-text)]">Sender branding</h2>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Override the sender name and address used in emails sent for this organisation.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">From name</label>
                    <input type="text" value={fromName} onChange={e => { setFromName(e.target.value); markDirty() }}
                      placeholder="Grand Hotel" className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">From address</label>
                    <input type="email" value={fromAddress} onChange={e => { setFromAddress(e.target.value); markDirty() }}
                      placeholder="reservations@myhotel.com" className={monoInputCls} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Use my own: sender + provider + credentials */}
          {useOwnEmail && providerForm}
        </>
      )}

      </>)}

      {/* Sharing controls */}
      {isSystemLevel && (
        <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Share with organisations</p>
            <p className="text-xs text-[var(--color-text-muted)]">Allow organisations to inherit and use this email service</p>
          </div>
          <Toggle enabled={emailSharedWithOrgs} onChange={v => { setEmailSharedWithOrgs(v); markDirty() }} />
        </div>
      )}
      {!isSystemLevel && (<>
        {data?.emailSharedWithOrgs === false && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-border)]/30 px-5 py-4">
            <p className="text-sm font-medium text-[var(--color-text-muted)]">System email not shared with organisations</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">The system has restricted sharing of this service. You must configure your own email credentials.</p>
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Share with hotels</p>
            <p className="text-xs text-[var(--color-text-muted)]">Allow hotels to inherit and use this organisation's email service</p>
          </div>
          <Toggle enabled={emailSharedWithProperties} onChange={v => { setEmailSharedWithProperties(v); markDirty() }} />
        </div>
      </>)}

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

// ── Property-level Email Section ───────────────────────────────────────────────

function PropertyEmailSection({ propertyId, orgId, isSuper }: { propertyId: number; orgId: number | null | undefined; isSuper: boolean }) {
  const qc = useQueryClient()
  const queryKey = ['property-email', propertyId]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiClient.getPropertyEmailSettings(propertyId, orgId ?? undefined),
  })

  const [useOwn, setUseOwn] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState<EmailProvider>('smtp')
  const [fromName, setFromName] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    if (!data) return
    const hgName = data.hgName ?? ''
    const hgSlug = hgName.toLowerCase().replace(/[^a-z0-9]/g, '')
    setUseOwn(data.useOwn)
    setEnabled(data.enabled)
    setProvider(data.provider)
    setFromName(data.fromName || hgName)
    setFromAddress(data.fromAddress || data.hgContactEmail || (hgSlug ? `no-reply@${hgSlug}.com` : ''))
    // Only populate SMTP fields from hotel's own values — not from inherited chain/system data
    if (data.useOwn) {
      setSmtpHost(data.smtpHost)
      setSmtpPort(data.smtpPort)
      setSmtpUser(data.smtpUser)
      setSmtpSecure(data.smtpSecure)
    } else {
      setSmtpHost('')
      setSmtpPort(587)
      setSmtpUser('')
      setSmtpSecure(true)
    }
  }, [data])

  const testMutation = useMutation({
    mutationFn: () => apiClient.testPropertyEmailConnection(propertyId, orgId ?? undefined),
    onSuccess: (r) => setTestResult(r),
    onError: (e) => setTestResult({ ok: false, error: String(e) }),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => apiClient.updatePropertyEmailSettings(propertyId,
      !useOwn ? { useOwn: false, fromName, fromAddress } : {
        useOwn: true,
        enabled,
        provider,
        fromName,
        fromAddress,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpSecure,
        ...(smtpPassword ? { smtpPassword } : {}),
        ...(apiKey ? { apiKey } : {}),
      }, orgId ?? undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey })
      setSmtpPassword('')
      setApiKey('')
      setIsDirty(false)
      setError(null)
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Save failed'),
  })

  const disableMutation = useMutation({
    mutationFn: (disabled: boolean) => apiClient.updatePropertyEmailSettings(propertyId, { systemServiceDisabled: disabled }, orgId ?? undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  })

  if (isLoading) return <Spinner />

  function markDirty() { setIsDirty(true) }

  const inh = data?.inherited
  const inheritedLabel = data?.inheritedFrom === 'org' ? 'Chain' : 'System'
  const systemDisabled = data?.systemServiceDisabled ?? false
  const effectiveEnabled = useOwn ? enabled : ((inh?.enabled ?? false) && !systemDisabled)

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'
  const monoInputCls = inputCls + ' font-mono'

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Emails</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Email configuration for this hotel.</p>
      </div>

      {/* Enable toggle — always at top, read-only when inherited */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">Enable email notifications</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {useOwn ? 'Send booking confirmations and updates to guests' : `Controlled by ${inheritedLabel.toLowerCase()} settings`}
          </p>
        </div>
        {useOwn
          ? <Toggle enabled={enabled} onChange={v => { setEnabled(v); markDirty() }} />
          : <span className={['rounded-full px-2.5 py-0.5 text-xs font-semibold',
              (inh?.enabled && !systemDisabled) ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
            ].join(' ')}>
              {(inh?.enabled && !systemDisabled) ? 'Active' : 'Inactive'}
            </span>
        }
      </div>

      {data?.inheritedBlocked && !useOwn && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-border)]/30 px-5 py-4">
          <p className="text-sm font-medium text-[var(--color-text-muted)]">Email not available from chain</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">The organisation has not shared its email service with hotels. Use your own credentials below.</p>
        </div>
      )}

      {effectiveEnabled && (<>

      {/* Use inherited / Use own toggle */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div className="flex items-center gap-3">
          <button type="button" role="switch" aria-checked={useOwn}
            onClick={() => { setUseOwn(v => { if (!v) setEnabled(true); return !v }); markDirty() }}
            className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              useOwn ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
            <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
              useOwn ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
          </button>
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Use own email configuration</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {useOwn ? 'Hotel uses its own credentials.' : `Hotel inherits from ${inheritedLabel.toLowerCase()}.`}
            </p>
          </div>
        </div>
      </div>

      {/* Inherited mode: service status + sender branding */}
      {!useOwn && (
        <>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Inherited Email service
                  <span className="ml-2 rounded-full bg-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{inheritedLabel}</span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {systemDisabled
                    ? 'Inherited service is disabled for this hotel.'
                    : inh
                      ? `Using ${inheritedLabel.toLowerCase()} email provider (${inh.provider.toUpperCase()}${inh.fromAddress ? ` · ${inh.fromAddress}` : ''}).`
                      : 'No inherited email service configured.'}
                </p>
              </div>
              {isSuper ? (
                <button type="button" role="switch" aria-checked={!systemDisabled}
                  onClick={() => disableMutation.mutate(!systemDisabled)} disabled={disableMutation.isPending}
                  className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40',
                    !systemDisabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
                  <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                    !systemDisabled ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
                </button>
              ) : (
                <span className={['rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  systemDisabled ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' : 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
                ].join(' ')}>
                  {systemDisabled ? 'Disabled' : 'Active'}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Sender branding</h2>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Override the sender name and address used in emails sent for this hotel.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">From name</label>
                <input type="text" value={fromName} onChange={e => { setFromName(e.target.value); markDirty() }}
                  placeholder="Grand Hotel" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">From address</label>
                <input type="email" value={fromAddress} onChange={e => { setFromAddress(e.target.value); markDirty() }}
                  placeholder="reservations@myhotel.com" className={monoInputCls} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Own mode: sender + provider */}
      {useOwn && (
        <>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Sender</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">From name</label>
                <input type="text" value={fromName} onChange={e => { setFromName(e.target.value); markDirty() }}
                  placeholder="Grand Hotel" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">From address</label>
                <input type="email" value={fromAddress} onChange={e => { setFromAddress(e.target.value); markDirty() }}
                  placeholder="reservations@myhotel.com" className={monoInputCls} />
              </div>
            </div>
          </div>

          <fieldset disabled={!enabled} className="space-y-5 disabled:opacity-50">
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
              <p className="text-xs text-[var(--color-text-muted)]">{PROVIDERS.find(p => p.value === provider)?.hint}</p>
              {provider === 'smtp' && (
                <div className="space-y-3 pt-1">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">SMTP host</label>
                      <input type="text" value={smtpHost} onChange={e => { setSmtpHost(e.target.value); markDirty() }}
                        placeholder="smtp.example.com" className={monoInputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Port</label>
                      <select value={smtpPort} onChange={e => { setSmtpPort(Number(e.target.value)); markDirty() }} className={inputCls}>
                        {SMTP_PORTS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Username</label>
                      <input type="text" value={smtpUser} onChange={e => { setSmtpUser(e.target.value); markDirty() }}
                        placeholder="user@example.com" className={monoInputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Password</label>
                      <input type="password" value={smtpPassword} onChange={e => { setSmtpPassword(e.target.value); markDirty() }}
                        placeholder={data?.passwordSet ? '(stored — leave blank to keep)' : 'Enter password'}
                        className={monoInputCls} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={smtpSecure} onChange={e => { setSmtpSecure(e.target.checked); markDirty() }}
                      className="h-4 w-4 accent-[var(--color-primary)]" />
                    <span className="text-sm text-[var(--color-text)]">Use TLS / SSL</span>
                  </label>
                </div>
              )}
              {(provider === 'sendgrid' || provider === 'mailgun') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">API Key</label>
                  <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); markDirty() }}
                    placeholder={data?.apiKeySet ? '(stored — leave blank to keep)' : `Paste ${provider === 'sendgrid' ? 'SendGrid' : 'Mailgun'} API key`}
                    className={monoInputCls} />
                </div>
              )}
            </div>
          </fieldset>

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
        </>
      )}

      </>)}

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate()} />
    </div>
  )
}
