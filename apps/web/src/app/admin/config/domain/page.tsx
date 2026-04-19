'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { SaveBar } from '@/app/admin/design/components'

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseCertExpiry(pem: string): Date | null {
  try {
    // Extract base64 body from PEM
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
    const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    // Scan DER for UTCTime/GeneralizedTime tags that contain the validity dates
    // UTCTime = 0x17, GeneralizedTime = 0x18
    const dates: Date[] = []
    for (let i = 0; i < der.length - 15; i++) {
      if (der[i] === 0x17 || der[i] === 0x18) {
        const len = der[i + 1]
        if (len >= 12 && len <= 15) {
          const str = String.fromCharCode(...der.slice(i + 2, i + 2 + len))
          let d: Date | null = null
          if (der[i] === 0x17) {
            // UTCTime: YYMMDDHHMMSSZ
            const y = parseInt(str.slice(0, 2))
            d = new Date(`${y >= 50 ? 19 : 20}${str.slice(0, 2)}-${str.slice(2, 4)}-${str.slice(4, 6)}T${str.slice(6, 8)}:${str.slice(8, 10)}:${str.slice(10, 12)}Z`)
          } else {
            // GeneralizedTime: YYYYMMDDHHMMSSZ
            d = new Date(`${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T${str.slice(8, 10)}:${str.slice(10, 12)}:${str.slice(12, 14)}Z`)
          }
          if (d && !isNaN(d.getTime())) dates.push(d)
        }
      }
    }
    // The second date in the validity sequence is the "not after" (expiry)
    return dates.length >= 2 ? dates[1] : null
  } catch {
    return null
  }
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DomainPage() {
  const qc = useQueryClient()

  // Domain state
  const [webDomain, setWebDomain] = useState('')
  const [domainIsDirty, setDomainIsDirty] = useState(false)
  const [domainError, setDomainError] = useState<string | null>(null)

  // Certificate state
  const [tlsCert, setTlsCert] = useState('')
  const [tlsKey, setTlsKey] = useState('')
  const [certIsDirty, setCertIsDirty] = useState(false)
  const [certError, setCertError] = useState<string | null>(null)

  const certFileRef = useRef<HTMLInputElement>(null)
  const keyFileRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-org'],
    queryFn: () => apiClient.getOrgSettings(),
  })

  useEffect(() => {
    if (!data) return
    setWebDomain(data.webDomain ?? '')
    setTlsCert(data.tlsCert ?? '')
    // Key is never returned — leave blank (shows placeholder if set)
  }, [data])

  const { mutate: saveDomain, isPending: savingDomain } = useMutation({
    mutationFn: () => apiClient.updateOrgSettings({ webDomain: webDomain.trim() || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-org'] })
      setDomainIsDirty(false)
      setDomainError(null)
    },
    onError: (err: unknown) => setDomainError(err instanceof Error ? err.message : 'Save failed'),
  })

  const { mutate: saveCert, isPending: savingCert } = useMutation({
    mutationFn: () => apiClient.updateOrgSettings({
      tlsCert: tlsCert.trim() || undefined,
      tlsKey: tlsKey.trim() || undefined,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-org'] })
      setCertIsDirty(false)
      setCertError(null)
      setTlsKey('')
    },
    onError: (err: unknown) => setCertError(err instanceof Error ? err.message : 'Save failed'),
  })

  async function handleCertFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) { setTlsCert(await readFile(file)); setCertIsDirty(true) }
    e.target.value = ''
  }

  async function handleKeyFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) { setTlsKey(await readFile(file)); setCertIsDirty(true) }
    e.target.value = ''
  }

  const expiry = tlsCert ? parseCertExpiry(tlsCert) : null
  const isExpired = expiry ? expiry < new Date() : false
  const expiresInDays = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null

  const inputCls =
    'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-mono focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

  const textareaCls =
    'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs font-mono leading-relaxed focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)] resize-y'

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-8">

      {/* ── Domain ───────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Domain</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            The public URL where this booking engine is hosted.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Web domain</label>
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">
              Full URL without a trailing slash, e.g.{' '}
              <code className="rounded bg-[var(--color-background)] px-1 py-0.5">https://book.myhotel.com</code>.
              Used for canonical URLs, confirmation emails, and external redirects.
            </p>
            <input
              type="url"
              value={webDomain}
              onChange={e => { setWebDomain(e.target.value); setDomainIsDirty(true) }}
              placeholder="https://book.myhotel.com"
              className={inputCls}
            />
          </div>

          {webDomain && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Preview</p>
              <p className="break-all font-mono text-sm text-[var(--color-text)]">{webDomain.replace(/\/$/, '')}/</p>
            </div>
          )}
        </div>

        {domainError && <ErrorBanner message={domainError} />}
        <SaveBar isDirty={domainIsDirty} isSaving={savingDomain} onSave={() => saveDomain()} />
      </section>

      {/* ── TLS Certificate ───────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">SSL / TLS Certificate</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Upload your certificate and private key to enable HTTPS.
          </p>
        </div>

        {/* Status banner */}
        {(data?.tlsCertSet || data?.tlsKeySet) && (
          <div className={[
            'mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm',
            isExpired
              ? 'border-[var(--color-error)]/30 bg-[var(--color-error)]/5 text-[var(--color-error)]'
              : expiresInDays !== null && expiresInDays <= 30
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-[var(--color-success)]/30 bg-[var(--color-success)]/5 text-[var(--color-success)]',
          ].join(' ')}>
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isExpired
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />}
            </svg>
            <span>
              {data.tlsCertSet && data.tlsKeySet ? 'Certificate and key are configured' : data.tlsCertSet ? 'Certificate configured (no key)' : 'Key configured (no certificate)'}
              {expiry && (
                <span className="ml-2 text-xs opacity-80">
                  · {isExpired ? 'Expired' : `Expires`} {expiry.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                  {!isExpired && expiresInDays !== null && ` (${expiresInDays}d)`}
                </span>
              )}
            </span>
          </div>
        )}

        <div className="space-y-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          {/* Certificate */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--color-text)]">Certificate (PEM)</label>
              <button
                type="button"
                onClick={() => certFileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary-light)] hover:text-[var(--color-primary)]"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload file
              </button>
              <input ref={certFileRef} type="file" accept=".pem,.crt,.cer" className="hidden" onChange={handleCertFile} />
            </div>
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">
              Paste your certificate in PEM format, starting with <code className="rounded bg-[var(--color-background)] px-1">-----BEGIN CERTIFICATE-----</code>.
              Include the full chain if applicable.
            </p>
            <textarea
              rows={6}
              value={tlsCert}
              onChange={e => { setTlsCert(e.target.value); setCertIsDirty(true) }}
              placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----'}
              className={textareaCls}
              spellCheck={false}
            />
          </div>

          <div className="border-t border-[var(--color-border)]" />

          {/* Private key */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--color-text)]">Private Key (PEM)</label>
              <button
                type="button"
                onClick={() => keyFileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary-light)] hover:text-[var(--color-primary)]"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload file
              </button>
              <input ref={keyFileRef} type="file" accept=".pem,.key" className="hidden" onChange={handleKeyFile} />
            </div>
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">
              The private key is write-only — it is never displayed after saving.
            </p>
            <textarea
              rows={6}
              value={tlsKey}
              onChange={e => { setTlsKey(e.target.value); setCertIsDirty(true) }}
              placeholder={data?.tlsKeySet ? '(key is stored — paste a new one to replace it)' : '-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----'}
              className={textareaCls}
              spellCheck={false}
            />
          </div>

          {data?.tlsCertSet && (
            <button
              type="button"
              onClick={() => { setTlsCert(''); setTlsKey(''); saveCert() }}
              className="text-xs text-[var(--color-error)]/70 hover:text-[var(--color-error)] transition-colors"
            >
              Remove certificate and key
            </button>
          )}
        </div>

        {certError && <ErrorBanner message={certError} />}
        <SaveBar isDirty={certIsDirty} isSaving={savingCert} onSave={() => saveCert()} />

        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          The private key is stored encrypted and never returned by the API.
          Leave the key field blank to keep the existing key when updating the certificate only.
        </p>
      </section>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-4 py-2 text-sm text-[var(--color-error)]">
      {message}
    </div>
  )
}
