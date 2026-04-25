'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PixelInjector } from '@/components/tracking/PixelInjector'
import type { BookingCancellationFrame, TaxEntry, HGNightlyEntry as NightlyEntry } from '@ibe/shared'
import { TaxRelation } from '@ibe/shared'

const PROPERTY_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_HOTEL_ID || 0)

interface StoredRoom {
  roomCode: string
  board: string
  cancellationFrames?: BookingCancellationFrame[]
}

interface StoredSelectedRoom {
  roomName: string
  nightlyBreakdown: NightlyEntry[]
  sellTaxes: TaxEntry[]
  fees: TaxEntry[]
}

interface StoredConfirmation {
  totalAmount: number
  currency: string
  propertyId?: number
  checkIn?: string
  checkOut?: string
  leadGuest?: { firstName: string; lastName: string; email: string }
  rooms?: StoredRoom[]
  hyperGuestBookingId?: number
  selectedRooms?: StoredSelectedRoom[]
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function ConfirmTaxLine({ item, fmtAmount }: { item: TaxEntry; fmtAmount: (n: number, c: string) => string }) {
  const amountStr = (item.relation === TaxRelation.Add ? '+' : '') + fmtAmount(item.amount, item.currency)
  if (item.relation === TaxRelation.Display) {
    return (
      <div className="flex justify-between text-xs">
        <span className="text-amber-700">{item.description} <span className="font-medium">(mandatory — paid at hotel)</span></span>
        <span className="text-amber-700">{amountStr}</span>
      </div>
    )
  }
  if (item.relation === TaxRelation.Optional) {
    return (
      <div className="flex justify-between text-xs">
        <span className="text-blue-700">{item.description} <span className="font-medium">(optional — paid at hotel)</span></span>
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

function CancellationPolicy({ frames, currency }: { frames: BookingCancellationFrame[]; currency: string }) {
  const penaltyFrames = frames.filter(f => f.penaltyAmount > 0)

  if (penaltyFrames.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 px-4 py-3">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        <div>
          <p className="text-sm font-medium text-success">Free cancellation</p>
          <p className="text-xs text-success/80 mt-0.5">You will not be charged if you cancel this booking.</p>
        </div>
      </div>
    )
  }

  const now = new Date()
  const firstPenalty = penaltyFrames[0]!
  const penaltyStartsNow = new Date(firstPenalty.from) <= now

  if (penaltyStartsNow) {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-[var(--color-error-light)] border border-error/20 px-4 py-3">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-error">Non-refundable</p>
          <p className="text-xs text-error/80 mt-0.5">
            Cancellation fee: <strong>{fmtAmount(firstPenalty.penaltyAmount, firstPenalty.currency || currency)}</strong> — this charge applies to any cancellation.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 rounded-lg bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 px-4 py-3">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        <div>
          <p className="text-sm font-medium text-success">Free cancellation until {fmtDate(firstPenalty.from)}</p>
          <p className="text-xs text-success/80 mt-0.5">Cancel before this date at no charge.</p>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p className="text-xs text-amber-700">
          After {fmtDate(firstPenalty.from)}: cancellation fee of <strong>{fmtAmount(firstPenalty.penaltyAmount, firstPenalty.currency || currency)}</strong>.
        </p>
      </div>
    </div>
  )
}

interface PageProps {
  params: { id: string }
}

export default function ConfirmationPage({ params }: PageProps) {
  const [confirmation, setConfirmation] = useState<StoredConfirmation | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`ibe_confirm_${params.id}`)
      if (raw) setConfirmation(JSON.parse(raw))
    } catch {}
  }, [params.id])

  const n = confirmation?.checkIn && confirmation?.checkOut
    ? nights(confirmation.checkIn, confirmation.checkOut)
    : null

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-12 print:py-4 print:px-0">
        <div className="overflow-hidden rounded-2xl border border-[var(--color-success)]/20 bg-[var(--color-surface)] shadow-md print:shadow-none print:border-gray-300">
          {/* Top bar */}
          <div className="bg-success px-8 py-6 text-center text-white print:py-4">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20 print:hidden">
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold">Booking confirmed!</h1>
            <p className="mt-1 text-white/80 text-sm">Your reservation is confirmed</p>
          </div>

          <div className="px-8 py-6 space-y-5">
            {/* Booking reference */}
            <div className="flex items-center justify-between rounded-lg bg-[var(--color-background)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Booking reference</p>
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

            {/* Guest & stay details */}
            {confirmation?.leadGuest && (
              <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Guest details</p>
                <p className="text-sm text-[var(--color-text)] font-medium">
                  {confirmation.leadGuest.firstName} {confirmation.leadGuest.lastName}
                </p>
                <p className="text-xs text-muted">{confirmation.leadGuest.email}</p>
              </div>
            )}

            {confirmation?.checkIn && confirmation?.checkOut && (
              <div className="rounded-lg border border-[var(--color-border)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Stay details</p>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold text-[var(--color-text)]">{fmtDate(confirmation.checkIn)}</p>
                    <p className="text-xs text-muted">Check-in</p>
                  </div>
                  {n && (
                    <div className="text-center">
                      <p className="text-xs text-muted">{n} night{n !== 1 ? 's' : ''}</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="font-semibold text-[var(--color-text)]">{fmtDate(confirmation.checkOut)}</p>
                    <p className="text-xs text-muted">Check-out</p>
                  </div>
                </div>

                {confirmation.rooms && confirmation.rooms.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-1">
                    {confirmation.rooms.map((r, i) => (
                      <p key={i} className="text-xs text-muted">
                        Room {i + 1}: <span className="text-[var(--color-text)]">{r.roomCode}</span>
                        {r.board && <span className="ml-2">· {r.board}</span>}
                      </p>
                    ))}
                  </div>
                )}

                {/* Nightly breakdown */}
                {confirmation.selectedRooms?.some(r => r.nightlyBreakdown.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Nightly breakdown</p>
                    {confirmation.selectedRooms.map((sr, ri) => (
                      <div key={ri} className="space-y-1">
                        {confirmation.selectedRooms!.length > 1 && (
                          <p className="text-xs font-medium text-[var(--color-text)]">{sr.roomName}</p>
                        )}
                        {sr.nightlyBreakdown.map((n, ni) => (
                          <div key={ni} className="flex justify-between text-xs">
                            <span className="text-muted">{new Date(n.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                            <span className="text-[var(--color-text)]">{n.prices?.sell ? fmtAmount(n.prices.sell.price, n.prices.sell.currency) : '—'}</span>
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
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Taxes</p>
                              {taxes.map((t, i) => <ConfirmTaxLine key={i} item={t} fmtAmount={fmtAmount} />)}
                            </div>
                          )}
                          {fees.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Fees</p>
                              {fees.map((f, i) => <ConfirmTaxLine key={i} item={f} fmtAmount={fmtAmount} />)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex justify-between">
                  <span className="text-sm text-muted">Total</span>
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    {fmtAmount(confirmation.totalAmount, confirmation.currency)}
                  </span>
                </div>
              </div>
            )}

            {/* Cancellation policy — per room */}
            {confirmation?.rooms && confirmation.rooms.some(r => r.cancellationFrames) && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Cancellation policy</p>
                {confirmation.rooms.map((r, i) => (
                  <div key={i} className="space-y-1.5">
                    {confirmation.rooms!.length > 1 && (
                      <p className="text-xs font-medium text-[var(--color-text)]">Room {i + 1}: {r.roomCode} · {r.board}</p>
                    )}
                    <CancellationPolicy
                      frames={r.cancellationFrames ?? []}
                      currency={confirmation.currency}
                    />
                  </div>
                ))}
              </div>
            )}

            <p className="text-sm text-center text-muted">
              Please keep your booking reference for your records.
            </p>
          </div>

          {/* Actions */}
          <div className="border-t border-[var(--color-border)] px-8 py-5 flex flex-wrap items-center justify-center gap-3 print:hidden">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download confirmation
            </button>
            <Link
              href={(() => {
                if (!confirmation?.propertyId) return '/'
                const qs = new URLSearchParams({ hotelId: String(confirmation.propertyId) })
                if (confirmation.checkIn) qs.set('checkIn', confirmation.checkIn)
                if (confirmation.checkOut) qs.set('checkOut', confirmation.checkOut)
                qs.set('rooms[0][adults]', '2')
                return `/search?${qs.toString()}`
              })()}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] hover:border-primary hover:text-primary transition-colors"
            >
              Make another booking
            </Link>
          </div>
        </div>
      </main>
      <PixelInjector propertyId={PROPERTY_ID} page="confirmation" />
    </>
  )
}
