'use client'

import { useState } from 'react'
import { apiClient, ApiClientError } from '@/lib/api-client'

export interface CredentialsInfo {
  label: string
  name: string
  email: string
  phone?: string | null
  temporaryPassword: string
  loginUrl: string
}

export function CredentialsModal({ info, onClose }: { info: CredentialsInfo; onClose: () => void }) {
  const [sendTab, setSendTab] = useState<'email' | 'whatsapp' | null>(null)
  const [sendTo, setSendTo] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function openSendTab(tab: 'email' | 'whatsapp') {
    setSendTab(tab)
    setSendTo(tab === 'email' ? (info.email ?? '') : (info.phone ?? ''))
    setSendResult(null)
  }

  function copyAll() {
    const text = `Login: ${info.loginUrl}\nEmail: ${info.email}\nTemporary password: ${info.temporaryPassword}`
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px'
      document.body.appendChild(ta); ta.focus(); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function handleSend() {
    if (!sendTo.trim() || !sendTab) return
    setSending(true); setSendResult(null)
    try {
      await apiClient.sendAdminCredentials({
        channel: sendTab,
        to: sendTo.trim(),
        credentials: { name: info.name, email: info.email, temporaryPassword: info.temporaryPassword, loginUrl: info.loginUrl },
      })
      setSendResult({ ok: true, msg: `Sent via ${sendTab === 'email' ? 'Email' : 'WhatsApp'}` })
    } catch (err) {
      setSendResult({ ok: false, msg: err instanceof ApiClientError ? err.message : 'Send failed' })
    } finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <svg className="h-5 w-5 text-[var(--color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <h2 className="text-base font-semibold text-[var(--color-text)]">{info.label}</h2>
        </div>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">Share these credentials. The password is temporary.</p>

        <div className="mb-5 space-y-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 font-mono text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">Login URL</span>
            <span className="text-[var(--color-text)]">{info.loginUrl.replace(/^https?:\/\//, '')}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">Email</span>
            <span className="text-[var(--color-text)]">{info.email}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-text-muted)]">Password</span>
            <span className="font-bold text-[var(--color-text)]">{info.temporaryPassword}</span>
          </div>
        </div>

        {sendTab && (
          <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Send via {sendTab === 'email' ? 'Email' : 'WhatsApp'}
              </span>
              <button onClick={() => { setSendTab(null); setSendResult(null) }} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                type={sendTab === 'email' ? 'email' : 'tel'}
                value={sendTo}
                onChange={e => setSendTo(e.target.value)}
                placeholder={sendTab === 'email' ? 'email@example.com' : '+1 555 000 0000'}
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
                onKeyDown={e => e.key === 'Enter' && handleSend()}
              />
              <button
                onClick={handleSend}
                disabled={sending || !sendTo.trim()}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
            {sendResult && (
              <p className={`mt-2 text-xs ${sendResult.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {sendResult.msg}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openSendTab('email')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              sendTab === 'email'
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-background)]'
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email
          </button>
          <button
            onClick={() => openSendTab('whatsapp')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              sendTab === 'whatsapp'
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-background)]'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </button>
          <button
            onClick={copyAll}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-background)]"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
