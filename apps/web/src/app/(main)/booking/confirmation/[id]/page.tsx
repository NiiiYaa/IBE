'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { PixelInjector } from '@/components/tracking/PixelInjector'
import type { BookingCancellationFrame } from '@ibe/shared'

const PROPERTY_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_HOTEL_ID || 0)

interface StoredConfirmation {
  cancellationFrames: BookingCancellationFrame[]
  totalAmount: number
  currency: string
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
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

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="overflow-hidden rounded-2xl border border-[var(--color-success)]/20 bg-[var(--color-surface)] shadow-md">
          {/* Top bar */}
          <div className="bg-success px-8 py-6 text-center text-white">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold">Booking confirmed!</h1>
            <p className="mt-1 text-white/80 text-sm">Your reservation is confirmed</p>
          </div>

          {/* Booking reference */}
          <div className="px-8 pt-6 pb-2">
            <div className="flex items-center justify-between rounded-lg bg-[var(--color-background)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Booking reference</p>
                <p className="mt-0.5 text-xl font-bold tracking-wider text-[var(--color-text)]">#{params.id}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary-light)]">
                <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
          </div>

          {/* Cancellation policy */}
          {confirmation && (
            <div className="px-8 pb-4 pt-2 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Cancellation policy</p>
              <CancellationPolicy frames={confirmation.cancellationFrames} currency={confirmation.currency} />
            </div>
          )}

          <p className="px-8 pb-5 text-sm text-center text-muted">
            Please keep your booking reference for your records.
          </p>

          {/* Actions */}
          <div className="border-t border-[var(--color-border)] px-8 py-5 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-6 py-2.5 text-sm font-medium text-[var(--color-text)] hover:border-primary hover:text-primary transition-colors"
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
