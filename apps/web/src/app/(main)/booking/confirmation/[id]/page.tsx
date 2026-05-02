'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PixelInjector } from '@/components/tracking/PixelInjector'
import type { BookingCancellationFrame, TaxEntry, NightlyPrice, PropertyDetail } from '@ibe/shared'
import { TaxRelation } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { useT, useLocale } from '@/context/translations'

const PROPERTY_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_HOTEL_ID || 0)

interface StoredRoom {
  roomCode: string
  board: string
  cancellationFrames?: BookingCancellationFrame[]
}

interface StoredSelectedRoom {
  roomName: string
  nightlyBreakdown: NightlyPrice[]
  sellTaxes: TaxEntry[]
  fees: TaxEntry[]
}

interface StoredConfirmation {
  totalAmount: number
  currency: string
  propertyId?: number
  checkIn?: string
  checkOut?: string
  leadGuest?: { firstName: string; lastName: string; email: string; phone?: string }
  rooms?: StoredRoom[]
  hyperGuestBookingId?: number
  selectedRooms?: StoredSelectedRoom[]
}

function makeFmtDate(locale: string) {
  return (iso: string): string =>
    new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}

function makeFmtAmount(locale: string) {
  return (amount: number, currency: string): string =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
}

function ConfirmTaxLine({ item, fmtAmount }: { item: TaxEntry; fmtAmount: (n: number, c: string) => string }) {
  const t = useT('confirmation')
  const amountStr = (item.relation === TaxRelation.Add ? '+' : '') + fmtAmount(item.amount, item.currency)
  if (item.relation === TaxRelation.Display) {
    return (
      <div className="flex justify-between text-xs">
        <span className="text-amber-700">{item.description} <span className="font-medium">({t('mandatoryPaidAtHotel')})</span></span>
        <span className="text-amber-700">{amountStr}</span>
      </div>
    )
  }
  if (item.relation === TaxRelation.Optional) {
    return (
      <div className="flex justify-between text-xs">
        <span className="text-blue-700">{item.description} <span className="font-medium">({t('optionalPaidAtHotel')})</span></span>
        <span className="text-blue-700">{amountStr}</span>
      </div>
    )
  }
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted">{item.description}</span>
      <span className="text-muted">{amountStr}</span>
    </div>
  )
}

function nights(checkIn: string, checkOut: string): number {
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
}

function CancellationPolicy({ frames, currency, fmtDate, fmtAmount }: { frames: BookingCancellationFrame[]; currency: string; fmtDate: (iso: string) => string; fmtAmount: (n: number, c: string) => string }) {
  const t = useT('confirmation')
  const penaltyFrames = frames.filter(f => f.penaltyAmount > 0)

  if (penaltyFrames.length === 0) {
    return (
      <div className="rounded-lg bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 px-4 py-3">
        <p className="text-sm font-medium text-success">{t('freeCancellation')}</p>
        <p className="text-xs text-success/80 mt-0.5">{t('noCancellationCharges')}</p>
      </div>
    )
  }

  const now = new Date()
  const firstPenalty = penaltyFrames[0]!
  const penaltyStartsNow = new Date(firstPenalty.from) <= now

  if (penaltyStartsNow) {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-3 rounded-lg bg-[var(--color-error-light)] border border-error/20 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm font-medium text-error">{t('nonRefundable')}</p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 space-y-1.5">
          {penaltyFrames.map((f, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 text-xs">
              <span className="text-[var(--color-text-muted)]">
                {i === 0 ? t('anyCancellation') : t('afterDate', { date: fmtDate(f.from) })}
              </span>
              <span className="font-medium text-error shrink-0">
                {fmtAmount(f.penaltyAmount, f.currency || currency)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Free window */}
      <div className="rounded-lg bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 px-4 py-3">
        <p className="text-sm font-medium text-success">{t('freeCancellationUntil', { date: fmtDate(firstPenalty.from) })}</p>
        <p className="text-xs text-success/80 mt-0.5">{t('cancelBeforeDateNoCharge')}</p>
      </div>

      {/* All penalty tiers */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1.5">
        <p className="text-xs font-semibold text-amber-800 mb-2">✘ {t('cancellationFeeAfter', { date: fmtDate(firstPenalty.from) })}</p>
        {penaltyFrames.map((f, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 text-xs">
            <span className="text-amber-700">
              {penaltyFrames.length === 1
                ? t('anyCancellation')
                : i === penaltyFrames.length - 1
                  ? t('afterDate', { date: fmtDate(f.from) })
                  : `${fmtDate(f.from)}${penaltyFrames[i + 1] ? ` – ${fmtDate(penaltyFrames[i + 1]!.from)}` : ''}`
              }
            </span>
            <span className="font-medium text-amber-900 shrink-0">
              {fmtAmount(f.penaltyAmount, f.currency || currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface PageProps {
  params: { id: string }
}

type SendChannel = 'email' | 'whatsapp'

export default function ConfirmationPage({ params }: PageProps) {
  const t = useT('confirmation')
  const locale = useLocale()
  const fmtDate = makeFmtDate(locale)
  const fmtAmount = makeFmtAmount(locale)
  const [confirmation, setConfirmation] = useState<StoredConfirmation | null>(null)
  const [property, setProperty] = useState<PropertyDetail | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)
  const [sendChannel, setSendChannel] = useState<SendChannel | null>(null)
  const [sendTo, setSendTo] = useState('')
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`ibe_confirm_${params.id}`)
      if (raw) setConfirmation(JSON.parse(raw))
    } catch {}
  }, [params.id])

  useEffect(() => {
    const pid = confirmation?.propertyId ?? PROPERTY_ID
    if (!pid) return
    apiClient.getHotelConfig(pid).then(cfg => {
      setEmailEnabled(cfg.emailEnabled)
      setWhatsappEnabled(cfg.whatsappEnabled)
      if (cfg.logoUrl) setLogoUrl(cfg.logoUrl)
    }).catch(() => {})
    apiClient.getProperty(pid).then(setProperty).catch(() => {})
  }, [confirmation?.propertyId])

  function openSend(channel: SendChannel) {
    setSendChannel(channel)
    setSendState('idle')
    setSendError('')
    if (channel === 'email') setSendTo(confirmation?.leadGuest?.email ?? '')
    if (channel === 'whatsapp') setSendTo(confirmation?.leadGuest?.phone ?? '')
  }

  async function submitSend() {
    if (!sendChannel || !sendTo.trim()) return
    setSendState('sending')
    try {
      const c = confirmation
      const guestName = c?.leadGuest ? `${c.leadGuest.firstName} ${c.leadGuest.lastName}`.trim() : undefined
      const inline = {
        ...(c?.propertyId !== undefined ? { propertyId: c.propertyId } : {}),
        ...(guestName ? { guestName } : {}),
        ...(c?.checkIn ? { checkIn: c.checkIn } : {}),
        ...(c?.checkOut ? { checkOut: c.checkOut } : {}),
        ...(c?.totalAmount !== undefined ? { totalAmount: c.totalAmount } : {}),
        ...(c?.currency ? { currency: c.currency } : {}),
        ...(c?.hyperGuestBookingId !== undefined ? { hyperGuestBookingId: c.hyperGuestBookingId } : {}),
        ...(c?.rooms ? { rooms: c.rooms.map(r => ({ roomCode: r.roomCode, board: r.board })) } : {}),
        ...(c?.selectedRooms ? { selectedRooms: c.selectedRooms.map(sr => ({
          roomName: sr.roomName,
          nightlyBreakdown: sr.nightlyBreakdown,
          sellTaxes: sr.sellTaxes,
          fees: sr.fees,
        })) } : {}),
      }
      await apiClient.sendBookingConfirmation(params.id, sendChannel, sendTo.trim(), inline)
      setSendState('sent')
    } catch (err) {
      setSendState('error')
      setSendError(err instanceof Error ? err.message : 'Send failed')
    }
  }

  const n = confirmation?.checkIn && confirmation?.checkOut
    ? nights(confirmation.checkIn, confirmation.checkOut)
    : null

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-12 print:py-4 print:px-0">
        <div className="overflow-hidden rounded-2xl border border-[var(--color-success)]/20 bg-[var(--color-surface)] shadow-md print:shadow-none print:border-gray-300">
          {/* Top bar */}
          <div className="bg-success px-8 py-6 text-center text-white print:py-4">
            {logoUrl && (
              <div className="mx-auto mb-4 flex h-16 w-40 items-center justify-center rounded-xl bg-white px-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Hotel logo" className="max-h-full max-w-full object-contain" />
              </div>
            )}
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20 print:hidden">
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold">{t('bookingConfirmed')}</h1>
            <p className="mt-1 text-white/80 text-sm">{t('yourReservationIsConfirmed')}</p>
          </div>

          <div className="px-8 py-6 space-y-5">
            {/* Booking reference */}
            <div className="flex items-center justify-between rounded-lg bg-[var(--color-background)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('bookingReference')}</p>
                <p className="mt-0.5 text-xl font-bold tracking-wider text-[var(--color-text)]">#{params.id}</p>
                {confirmation?.hyperGuestBookingId && (
                  <p className="mt-0.5 text-xs text-muted">HyperGuest ID: {confirmation.hyperGuestBookingId}</p>
                )}
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary-light)] print:hidden">
                <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>

            {/* Hotel info */}
            {property && (
              <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('hotel')}</p>
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-[var(--color-text)]">{property.name}</p>
                  {property.starRating > 0 && (
                    <span className="text-amber-400 text-sm leading-none">{'★'.repeat(property.starRating)}</span>
                  )}
                </div>
                <div className="flex flex-col gap-1 mt-1">
                  {property.location.address && (
                    <div className="flex items-start gap-1.5 text-xs text-muted">
                      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                      <span>{property.location.address}</span>
                    </div>
                  )}
                  {property.contact.phone && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <svg className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                      <a href={`tel:${property.contact.phone}`} className="text-primary hover:underline">{property.contact.phone}</a>
                    </div>
                  )}
                  {property.contact.email && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <svg className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                      <a href={`mailto:${property.contact.email}`} className="text-primary hover:underline">{property.contact.email}</a>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs">
                    <svg className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <a href={`/?hotelId=${property.propertyId}`} className="text-primary hover:underline">{t('hotelPage')}</a>
                  </div>
                </div>
              </div>
            )}

            {/* Guest & stay details */}
            {confirmation?.leadGuest && (
              <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('guestDetails')}</p>
                <p className="text-sm text-[var(--color-text)] font-medium">
                  {confirmation.leadGuest.firstName} {confirmation.leadGuest.lastName}
                </p>
                <p className="text-xs text-muted">{confirmation.leadGuest.email}</p>
              </div>
            )}

            {confirmation?.checkIn && confirmation?.checkOut && (
              <div className="rounded-lg border border-[var(--color-border)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">{t('stayDetails')}</p>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold text-[var(--color-text)]">{fmtDate(confirmation.checkIn)}</p>
                    <p className="text-xs text-muted">{t('checkIn')}</p>
                  </div>
                  {n && (
                    <div className="text-center">
                      <p className="text-xs text-muted">{t('nights', { count: String(n) })}</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="font-semibold text-[var(--color-text)]">{fmtDate(confirmation.checkOut)}</p>
                    <p className="text-xs text-muted">{t('checkOut')}</p>
                  </div>
                </div>

                {confirmation.rooms && confirmation.rooms.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-1">
                    {confirmation.rooms.map((r, i) => (
                      <p key={i} className="text-xs text-muted">
                        {t('roomLabel', { number: String(i + 1) })}: <span className="text-[var(--color-text)]">{r.roomCode}</span>
                        {r.board && <span className="ml-2">· {r.board}</span>}
                      </p>
                    ))}
                  </div>
                )}

                {/* Nightly breakdown */}
                {confirmation.selectedRooms?.some(r => r.nightlyBreakdown.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('nightlyBreakdown')}</p>
                    {confirmation.selectedRooms.map((sr, ri) => (
                      <div key={ri} className="space-y-1">
                        {confirmation.selectedRooms!.length > 1 && (
                          <p className="text-xs font-medium text-[var(--color-text)]">{sr.roomName}</p>
                        )}
                        {sr.nightlyBreakdown.map((n, ni) => (
                          <div key={ni} className="flex justify-between text-xs">
                            <span className="text-muted">{new Date(n.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>
                            <span className="text-[var(--color-text)]">{fmtAmount(n.sell, n.currency)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Taxes & Fees */}
                {confirmation.selectedRooms?.some(r => r.sellTaxes.length > 0 || r.fees.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-3">
                    {confirmation.selectedRooms.map((sr, ri) => {
                      const taxes = sr.sellTaxes.filter(t => t.relation !== TaxRelation.Ignore)
                      const fees = sr.fees.filter(f => f.relation !== TaxRelation.Ignore)
                      if (!taxes.length && !fees.length) return null
                      return (
                        <div key={ri} className="space-y-2">
                          {confirmation.selectedRooms!.length > 1 && (
                            <p className="text-xs font-medium text-[var(--color-text)]">{sr.roomName}</p>
                          )}
                          {taxes.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('taxes')}</p>
                              {taxes.map((t, i) => <ConfirmTaxLine key={i} item={t} fmtAmount={fmtAmount} />)}
                            </div>
                          )}
                          {fees.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('fees')}</p>
                              {fees.map((f, i) => <ConfirmTaxLine key={i} item={f} fmtAmount={fmtAmount} />)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex justify-between">
                  <span className="text-sm text-muted">{t('total')}</span>
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    {fmtAmount(confirmation.totalAmount, confirmation.currency)}
                  </span>
                </div>
              </div>
            )}

            {/* Cancellation policy — per room */}
            {confirmation?.rooms && confirmation.rooms.some(r => r.cancellationFrames) && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('cancellationPolicy')}</p>
                {confirmation.rooms.map((r, i) => (
                  <div key={i} className="space-y-1.5">
                    {confirmation.rooms!.length > 1 && (
                      <p className="text-xs font-medium text-[var(--color-text)]">{t('roomLabel', { number: String(i + 1) })}: {r.roomCode} · {r.board}</p>
                    )}
                    <CancellationPolicy
                      frames={r.cancellationFrames ?? []}
                      currency={confirmation.currency}
                      fmtDate={fmtDate}
                      fmtAmount={fmtAmount}
                    />
                  </div>
                ))}
              </div>
            )}

            <p className="text-sm text-center text-muted">
              {t('keepBookingReference')}
            </p>
          </div>

          {/* Actions */}
          <div className="border-t border-[var(--color-border)] px-8 py-5 space-y-4 print:hidden">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t('download')}
              </button>

              {emailEnabled && (
                <button
                  onClick={() => openSend('email')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {t('emailAction')}
                </button>
              )}

              {whatsappEnabled && (
                <button
                  onClick={() => openSend('whatsapp')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.374 0 0 5.374 0 12c0 2.117.554 4.103 1.523 5.828L.057 23.486a.5.5 0 00.609.61l5.757-1.51A11.943 11.943 0 0012 24c6.626 0 12-5.374 12-12S18.626 0 12 0zm0 21.818a9.805 9.805 0 01-5.031-1.383l-.36-.214-3.733.979.996-3.637-.235-.374A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/>
                  </svg>
                  {t('whatsapp')}
                </button>
              )}

              <Link
                href={(() => {
                  if (!confirmation?.propertyId) return '/'
                  const qs = new URLSearchParams({ hotelId: String(confirmation.propertyId) })
                  if (confirmation.checkIn) qs.set('checkIn', confirmation.checkIn)
                  if (confirmation.checkOut) qs.set('checkOut', confirmation.checkOut)
                  qs.set('rooms[0][adults]', '2')
                  return `/search?${qs.toString()}`
                })()}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                {t('makeAnotherBooking')}
              </Link>
            </div>

            {/* Inline send form */}
            {sendChannel && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-4 space-y-3">
                <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  {sendChannel === 'email' ? t('sendConfirmationViaEmail') : t('sendConfirmationViaWhatsapp')}
                </p>
                {sendState === 'sent' ? (
                  <p className="text-sm text-success font-medium">
                    {t('confirmationSent', { address: sendTo })}
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type={sendChannel === 'email' ? 'email' : 'tel'}
                      value={sendTo}
                      onChange={e => setSendTo(e.target.value)}
                      placeholder={sendChannel === 'email' ? t('emailAddress') : t('phoneNumber')}
                      className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      onClick={submitSend}
                      disabled={sendState === 'sending' || !sendTo.trim()}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {sendState === 'sending' ? t('sending') : t('send')}
                    </button>
                    <button
                      onClick={() => setSendChannel(null)}
                      className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-muted hover:text-[var(--color-text)] transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {sendState === 'error' && (
                  <p className="text-xs text-error">{sendError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
      <PixelInjector propertyId={PROPERTY_ID} page="confirmation" />
    </>
  )
}
