'use client'

import { useEffect, useRef, useState } from 'react'
import { useOnsiteConversion } from '@/hooks/use-onsite-conversion'
import type { OnsiteConversionSettings, OnsitePage } from '@ibe/shared'

interface Props {
  propertyId: number
  page: OnsitePage
}

// ── Notification bar ──────────────────────────────────────────────────────────

interface Message {
  id: string
  text: string
}

function applyTemplate(template: string, count: number, extra?: number): string {
  return template
    .replace('[xx]', String(count))
    .replace('[hh]', extra != null ? String(extra) : '')
}

function buildMessages(
  settings: OnsiteConversionSettings,
  page: OnsitePage,
  viewerCount: number,
  recentBookingsCount: number,
): Message[] {
  const msgs: Message[] = []
  if (
    settings.presenceEnabled &&
    settings.presencePages.includes(page) &&
    viewerCount >= settings.presenceMinViewers
  ) {
    msgs.push({ id: 'presence', text: applyTemplate(settings.presenceMessage, viewerCount) })
  }
  if (
    settings.bookingsEnabled &&
    settings.bookingsPages.includes(page) &&
    recentBookingsCount >= settings.bookingsMinCount
  ) {
    msgs.push({
      id: 'bookings',
      text: applyTemplate(settings.bookingsMessage, recentBookingsCount, settings.bookingsWindowHours),
    })
  }
  return msgs
}

const AUTO_CLOSE_SECONDS = 8

function NotificationBar({ messages }: { messages: Message[] }) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  // Cycle through messages
  useEffect(() => {
    if (messages.length <= 1) return
    const timer = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % messages.length)
        setVisible(true)
      }, 400)
    }, 5000)
    return () => clearInterval(timer)
  }, [messages.length])

  // Auto-close
  useEffect(() => {
    const timer = setTimeout(() => setDismissed(true), AUTO_CLOSE_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [])

  if (messages.length === 0 || dismissed) return null

  const msg = messages[index % messages.length]
  if (!msg) return null

  const isBookings = msg.id === 'bookings'

  return (
    <div
      className="fixed bottom-6 left-6 z-40 max-w-xs"
      style={{ transition: 'opacity 0.4s ease', opacity: visible ? 1 : 0 }}
    >
      <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-lg">
        {isBookings ? (
          <svg className="h-4 w-4 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ) : (
          <svg className="h-4 w-4 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m4 6v-2m0 0a4 4 0 10-4-4 4 4 0 004 4zm0 0a4 4 0 104-4 4 4 0 00-4 4z" />
          </svg>
        )}
        <p className="flex-1 text-sm font-medium text-[var(--color-text)]">{msg.text}</p>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          aria-label="Dismiss"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Promo popup ───────────────────────────────────────────────────────────────

function PromoPopup({
  message,
  promoCode,
  onDismiss,
}: {
  message: string | null
  promoCode: string | null
  onDismiss: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copy() {
    if (!promoCode) return
    const finish = () => {
      setCopied(true)
      setTimeout(onDismiss, 1200)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(promoCode).then(finish)
    } else {
      const el = document.createElement('textarea')
      el.value = promoCode
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      finish()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
        <button
          onClick={onDismiss}
          className="absolute right-4 top-4 text-muted hover:text-[var(--color-text)]"
          aria-label="Dismiss"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-light)]">
          <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M17 17h.01M3 12a9 9 0 1118 0A9 9 0 013 12zm6-5h6m-3-3v6" />
          </svg>
        </div>

        {message && (
          <p className="mb-4 text-base font-medium text-[var(--color-text)]">{message}</p>
        )}

        {promoCode && (
          <div className="mt-2 flex items-center gap-3 rounded-lg border-2 border-dashed border-[var(--color-primary)] bg-[var(--color-primary-light)] px-4 py-3">
            <span className="flex-1 font-mono text-lg font-bold tracking-widest text-primary">
              {promoCode}
            </span>
            <button
              onClick={copy}
              className="shrink-0 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        <button
          onClick={onDismiss}
          className="mt-5 w-full rounded-lg border border-[var(--color-border)] py-2 text-sm text-muted transition hover:border-[var(--color-primary)] hover:text-primary"
        >
          No thanks
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function OnsiteConversionOverlay({ propertyId, page }: Props) {
  const { settings, viewerCount, recentBookingsCount, popupPromoDiscount, loaded } = useOnsiteConversion(propertyId)
  const [popupDismissed, setPopupDismissed] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const popupOnThisPage = settings?.popupEnabled && settings.popupPages.includes(page)

  useEffect(() => {
    if (!loaded || !popupOnThisPage || popupDismissed) return

    const delay = (settings!.popupDelaySeconds ?? 30) * 1000
    popupTimerRef.current = setTimeout(() => setShowPopup(true), delay)
    return () => {
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current)
    }
  }, [loaded, popupOnThisPage, settings?.popupDelaySeconds, popupDismissed])

  if (!loaded || !settings) return null

  const messages = buildMessages(settings, page, viewerCount, recentBookingsCount)

  // Replace [xx] in popup message with promo discount if available
  const resolvedPopupMessage = settings.popupMessage && popupPromoDiscount != null
    ? settings.popupMessage.replace('[xx]', String(popupPromoDiscount))
    : settings.popupMessage

  return (
    <>
      <NotificationBar messages={messages} />
      {showPopup && !popupDismissed && popupOnThisPage && (
        <PromoPopup
          message={resolvedPopupMessage}
          promoCode={settings.popupPromoCode}
          onDismiss={() => {
            setShowPopup(false)
            setPopupDismissed(true)
          }}
        />
      )}
    </>
  )
}
