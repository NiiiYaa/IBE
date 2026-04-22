'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import type { RoomOption, RateOption, RoomDetail } from '@ibe/shared'
import { RateRow } from './RateRow'

interface RateSelectModalProps {
  room: RoomOption
  roomDetail?: RoomDetail | undefined
  remarks?: string[]
  nights: number
  locale: string
  displayCurrency?: string | undefined
  convert?: ((amount: number) => number) | undefined
  primaryImageId?: number | undefined
  selectLabel?: string | undefined
  selectDisabled?: ((rate: RateOption) => boolean) | undefined
  onSelect: (room: RoomOption, rate: RateOption) => void
  onClose: () => void
}

export function RateSelectModal({
  room, roomDetail, remarks = [], nights, locale,
  displayCurrency, convert, primaryImageId,
  selectLabel, selectDisabled, onSelect, onClose,
}: RateSelectModalProps) {
  const conv = convert ?? ((n: number) => n)
  const dispCur = displayCurrency ?? room.rates[0]?.prices.sell.currency ?? 'USD'
  const sortedRates = [...room.rates].sort((a, b) => a.prices.sell.amount - b.prices.sell.amount)

  const images = roomDetail?.images ?? []
  const heroIdx = primaryImageId != null
    ? Math.max(0, images.findIndex(img => img.id === primaryImageId))
    : 0
  const heroImage = images[heroIdx] ?? null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl"
        style={{ maxHeight: '90vh' }}>

        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Room header */}
        <div className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-background)] px-5 py-4">
          {heroImage && (
            <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg">
              <Image
                src={heroImage.url}
                alt={room.roomName}
                fill
                unoptimized
                sizes="112px"
                className="object-cover"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-[var(--color-text)]">{room.roomName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {room.roomSizeM2 > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  {room.roomSizeM2} m²
                </span>
              )}
              {room.maxAdults > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Up to {room.maxAdults} adults
                </span>
              )}
              {room.bedding[0] && (
                <span className="flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a1 1 0 011-1h16a1 1 0 011 1v6H3V9zM1 15h22M1 19h22" />
                  </svg>
                  {room.bedding[0].quantity}× {room.bedding[0].type}
                </span>
              )}
              <span className="font-medium text-[var(--color-success)]">
                {room.availableCount} room{room.availableCount !== 1 ? 's' : ''} left
              </span>
            </div>
          </div>
        </div>

        {/* Rate list */}
        <div className="overflow-y-auto">
          <div className="px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {sortedRates.length} rate option{sortedRates.length !== 1 ? 's' : ''} · {nights} night{nights !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="divide-y divide-[var(--color-border)]">
            {sortedRates.map(rate => (
              <RateRow
                key={rate.ratePlanId}
                rate={rate}
                room={room}
                nights={nights}
                locale={locale}
                onSelect={() => { onSelect(room, rate); onClose() }}
                displayCurrency={dispCur}
                convert={conv}
                {...(selectLabel != null ? { selectLabel } : {})}
                {...(selectDisabled != null ? { disabled: selectDisabled(rate) } : {})}
              />
            ))}
          </div>

          {remarks.length > 0 && (
            <div className="space-y-2 border-t border-[var(--color-border)] px-5 py-4">
              {remarks.map((r, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-primary-light)] px-3 py-2 text-xs text-primary">
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  {r}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
