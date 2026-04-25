'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { EmailProvider } from '@ibe/shared'
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

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => isSystemLevel
      ? apiClient.getSystemCommunicationSettings()
      : apiClient.getCommunicationSettings(isSuper && orgId ? orgId : undefined),
  })

  useEffect(() => {
    if (!data) return
    setEnabled(data.emailEnabled)
    setProvider(data.emailProvider as EmailProvider)
    setFromName(data.emailFromName)
    setFromAddress(data.emailFromAddress)
    setSmtpHost(data.emailSmtpHost)
    setSmtpPort(data.emailSmtpPort)
    setSmtpUser(data.emailSmtpUser)
    setSmtpSecure(data.emailSmtpSecure)
    // passwords/keys are write-only — leave blank unless user types
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const payload = {
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
      }
      return isSystemLevel
        ? apiClient.updateSystemCommunicationSettings(payload)
        : apiClient.updateCommunicationSettings(payload)
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

  // Using system service = no own credentials configured
  const usingSystemEmail = !isSystemLevel && !data?.emailApiKeySet && !data?.emailSmtpPasswordSet
  const systemDisabled = data?.emailSystemServiceDisabled ?? false

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

      {/* When using system service: show status + from fields only */}
      {usingSystemEmail ? (
        <>
          {/* System service status */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">System Email service</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {systemDisabled
                    ? 'System email is disabled for this organisation by a super admin.'
                    : 'Using system email provider. Configure own SMTP or API key below to override.'}
                </p>
              </div>
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
                  systemDisabled ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' : 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
                ].join(' ')}>
                  {systemDisabled ? 'Disabled by admin' : 'Active'}
                </span>
              )}
            </div>
          </div>

          {/* From name/address — still customisable at org level */}
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

          {/* Own credentials — collapsed section to allow override */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Use own provider</h2>
            <p className="text-xs text-[var(--color-text-muted)]">Enter your own SMTP or API key to stop using the system provider.</p>
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
            {provider === 'smtp' && (
              <div className="space-y-3">
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
                      placeholder="Enter password" className={monoInputCls} />
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
                  placeholder={`Paste ${provider === 'sendgrid' ? 'SendGrid' : 'Mailgun'} API key`}
                  className={monoInputCls} />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Own credentials or system level — full form */}
          {!isSystemLevel && isSuper && (
            <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">System Email service</p>
                <p className="text-xs text-[var(--color-text-muted)]">This org uses its own credentials. System service setting is ignored.</p>
              </div>
              <span className="rounded-full bg-[var(--color-border)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-text-muted)]">
                Own credentials
              </span>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Enable email notifications</p>
              <p className="text-xs text-[var(--color-text-muted)]">Send booking confirmations and updates to guests via email</p>
            </div>
            <Toggle enabled={enabled} onChange={v => { setEnabled(v); markDirty() }} />
          </div>

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
        </>
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
