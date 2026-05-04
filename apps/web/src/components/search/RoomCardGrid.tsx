'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { RoomOption, RateOption, RoomDetail } from '@ibe/shared'
import { formatCurrency } from '@ibe/shared'
import { facilityIcon } from '@/lib/facility-icon'
import { useT } from '@/context/translations'
import { RateSelectModal } from './RateSelectModal'
import { RoomDetailModal } from './RoomDetailModal'

interface RoomCardGridProps {
  room: RoomOption
  nights: number
  locale: string
  roomDetail?: RoomDetail | undefined
  remarks?: string[]
  defaultExpanded?: boolean
  onRateSelect: (room: RoomOption, rate: RateOption) => void
  displayCurrency?: string
  convert?: (amount: number) => number
  primaryImageId?: number
  selectLabel?: string
  selectDisabled?: ((rate: RateOption) => boolean) | undefined
}

function lowestRateCurrency(room: RoomOption): string {
  return room.rates[0]?.prices.sell.currency ?? 'USD'
}

export function RoomCardGrid({
  room, nights, locale, roomDetail, remarks = [],
  onRateSelect, displayCurrency, convert, primaryImageId, selectLabel, selectDisabled,
}: RoomCardGridProps) {
  const tFacility = useT('room_facilities')
  const conv = convert ?? ((n: number) => n)
  const dispCur = displayCurrency ?? lowestRateCurrency(room)
  const [rateModalOpen, setRateModalOpen] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  const images = roomDetail?.images ?? []
  const initialIdx = primaryImageId != null ? Math.max(0, images.findIndex(img => img.id === primaryImageId)) : 0
  const [imgIndex, setImgIndex] = useState(initialIdx)
  const currentImage = images[imgIndex]

  const sortedRates = [...room.rates].sort((a, b) => a.prices.sell.amount - b.prices.sell.amount)
  const lowestRate = sortedRates[0]!

  const hasDiscount = lowestRate.prices.bar.amount > lowestRate.prices.sell.amount
  const discountPct = hasDiscount
    ? Math.round((1 - lowestRate.prices.sell.amount / lowestRate.prices.bar.amount) * 100)
    : 0
  const hasPromotion = room.rates.some(r => r.isPromotion)

  function prevImage(e: React.MouseEvent) { e.stopPropagation(); setImgIndex(i => Math.max(0, i - 1)) }
  function nextImage(e: React.MouseEvent) { e.stopPropagation(); setImgIndex(i => Math.min(images.length - 1, i + 1)) }

  function handleSelect() {
    if (sortedRates.length === 1) {
      // Only one rate — skip the modal, go straight to booking
      onRateSelect(room, sortedRates[0]!)
    } else {
      setRateModalOpen(true)
    }
  }

  const desc = roomDetail?.descriptions.find(d => d.locale === 'en')?.text ?? roomDetail?.descriptions[0]?.text
  const facilities = roomDetail?.facilities ?? []
  const topFacilities = [
    ...facilities.filter(f => f.popular),
    ...facilities.filter(f => !f.popular),
  ].slice(0, 5)

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-card">

        {/* Photo */}
        <div className="group relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-[var(--color-background)]">
          {currentImage ? (
            <>
              <button
                onClick={() => setDetailModalOpen(true)}
                className="absolute inset-0 z-10 cursor-pointer"
                aria-label="View room details"
              />
              <Image
                key={currentImage.id}
                src={currentImage.url}
                alt={currentImage.description || room.roomName}
                fill
                unoptimized
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {hasPromotion && (
                <div className="absolute left-0 top-3 z-10 rounded-r-full bg-amber-500 px-3 py-0.5 text-xs font-semibold text-white shadow">
                  Special offer
                </div>
              )}
              {imgIndex > 0 && (
                <button onClick={prevImage} aria-label="Previous image"
                  className="absolute left-2 top-1/2 z-20 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70">
                  ‹
                </button>
              )}
              {imgIndex < images.length - 1 && (
                <button onClick={nextImage} aria-label="Next image"
                  className="absolute right-2 top-1/2 z-20 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70">
                  ›
                </button>
              )}
              {images.length > 1 && (
                <div className="absolute bottom-2 right-2 z-10 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                  {imgIndex + 1} / {images.length}
                </div>
              )}
            </>
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-300 to-slate-400" />
          )}
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col p-4">
          <h3 className="text-sm font-semibold leading-snug text-[var(--color-text)]">{room.roomName}</h3>

          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted">
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
                Up to {room.maxAdults}
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
              {room.availableCount} left
            </span>
          </div>

          {desc && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{desc}</p>
          )}

          {topFacilities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {topFacilities.map(f => (
                <span key={f.id} className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5 text-xs text-muted">
                  {facilityIcon(f.name)}{tFacility(f.nameSlug) || f.name}
                </span>
              ))}
            </div>
          )}

          {roomDetail && (
            <button onClick={() => setDetailModalOpen(true)}
              className="mt-1.5 self-start text-xs font-medium text-primary underline-offset-2 hover:underline">
              See more
            </button>
          )}

          {/* Price + CTA */}
          <div className="mt-auto pt-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-xs text-muted">Starting from</p>
                {lowestRate.originalSellAmount != null && (lowestRate.promoDiscount || lowestRate.affiliateDiscount) && (
                  <p className="text-xs text-muted line-through">
                    {formatCurrency(conv(lowestRate.originalSellAmount), dispCur, locale)}
                  </p>
                )}
                {hasDiscount && !lowestRate.promoCode && !lowestRate.affiliateCode && (
                  <p className="text-xs">
                    <span className="font-semibold text-[var(--color-success)]">-{discountPct}%</span>{' '}
                    <span className="line-through text-muted">
                      {formatCurrency(conv(lowestRate.prices.bar.amount), dispCur, locale)}
                    </span>
                  </p>
                )}
                <p className="text-xl font-bold leading-tight text-[var(--color-text)]">
                  {formatCurrency(conv(lowestRate.prices.sell.amount), dispCur, locale)}
                </p>
                {lowestRate.promoCode && (
                  <span className="mt-0.5 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    Promo -{lowestRate.promoDiscount}%
                  </span>
                )}
                {lowestRate.affiliateCode && lowestRate.affiliateDisplayText && (
                  <span className="mt-0.5 inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                    Special -{lowestRate.affiliateDiscount}%
                  </span>
                )}
                {nights > 1 && (
                  <p className="text-xs text-muted">{nights} nights</p>
                )}
              </div>

              <button
                onClick={handleSelect}
                className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-hover)] active:scale-95"
              >
                {sortedRates.length === 1 ? (selectLabel ?? 'Book') : 'Select'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {rateModalOpen && (
        <RateSelectModal
          room={room}
          roomDetail={roomDetail}
          remarks={remarks}
          nights={nights}
          locale={locale}
          displayCurrency={dispCur}
          convert={conv}
          primaryImageId={primaryImageId}
          selectLabel={selectLabel}
          selectDisabled={selectDisabled}
          onSelect={onRateSelect}
          onClose={() => setRateModalOpen(false)}
        />
      )}

      {detailModalOpen && (
        <RoomDetailModal
          room={room}
          roomDetail={roomDetail}
          remarks={remarks}
          onClose={() => setDetailModalOpen(false)}
        />
      )}
    </>
  )
}
