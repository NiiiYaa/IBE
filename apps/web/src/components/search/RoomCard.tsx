'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { RoomOption, RateOption, RoomDetail, IncentivePackageDisplay } from '@ibe/shared'
import { formatCurrency } from '@ibe/shared'
import { facilityIcon } from '@/lib/facility-icon'
import { RateRow } from './RateRow'
import { RoomDetailModal } from './RoomDetailModal'
import { IncentiveWidget } from '@/components/incentive/IncentiveWidget'
import { useT } from '@/context/translations'

interface RoomCardProps {
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
  incentive?: IncentivePackageDisplay | null
}

function lowestRateCurrency(room: RoomOption): string {
  return room.rates[0]?.prices.sell.currency ?? 'USD'
}

export function RoomCard({ room, nights, locale, roomDetail, remarks = [], defaultExpanded = false, onRateSelect, displayCurrency, convert, primaryImageId, selectLabel, selectDisabled, incentive }: RoomCardProps) {
  const t = useT('rooms')
  const conv = convert ?? ((n: number) => n)
  const dispCur = displayCurrency ?? lowestRateCurrency(room)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const images = roomDetail?.images ?? []
  const initialIdx = primaryImageId != null ? Math.max(0, images.findIndex(img => img.id === primaryImageId)) : 0
  const [imgIndex, setImgIndex] = useState(initialIdx)
  const [modalOpen, setModalOpen] = useState(false)

  const currentImage = images[imgIndex]

  const sortedRates = [...room.rates].sort((a, b) => a.prices.sell.amount - b.prices.sell.amount)
  const lowestRate = sortedRates[0]!

  const hasDiscount = lowestRate.prices.bar.amount > lowestRate.prices.sell.amount
  const discountPct = hasDiscount
    ? Math.round((1 - lowestRate.prices.sell.amount / lowestRate.prices.bar.amount) * 100)
    : 0

  const hasPromotion = room.rates.some(r => r.isPromotion)

  function prevImage(e: React.MouseEvent) {
    e.stopPropagation()
    setImgIndex(i => Math.max(0, i - 1))
  }

  function nextImage(e: React.MouseEvent) {
    e.stopPropagation()
    setImgIndex(i => Math.min(images.length - 1, i + 1))
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-card">
        <div className="flex flex-col sm:flex-row">
          {/* Image carousel — full-width on mobile, square sidebar on desktop */}
          {currentImage && (
            <div className="group relative aspect-[3/2] w-full overflow-hidden sm:aspect-square sm:w-56 sm:shrink-0">
              <button
                onClick={() => setModalOpen(true)}
                className="absolute inset-0 z-10 cursor-pointer"
                aria-label="View room details"
              />

              <Image
                key={currentImage.id}
                src={currentImage.url}
                alt={currentImage.description || room.roomName}
                fill
                unoptimized
                sizes="(max-width: 640px) 100vw, 224px"
                className="object-cover transition-opacity duration-300"
              />

              {hasPromotion && (
                <div className="absolute left-0 top-3 z-10 rounded-r-full bg-amber-500 px-3 py-0.5 text-xs font-semibold text-white shadow">
                  {t('specialOffer')}
                </div>
              )}

              {imgIndex > 0 && (
                <button
                  onClick={prevImage}
                  aria-label={t('previousImage')}
                  className="absolute left-2 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
                >
                  ‹
                </button>
              )}

              {imgIndex < images.length - 1 && (
                <button
                  onClick={nextImage}
                  aria-label={t('nextImage')}
                  className="absolute right-2 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
                >
                  ›
                </button>
              )}

              {images.length > 1 && (
                <div className="absolute bottom-2 right-2 z-10 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                  {imgIndex + 1} / {images.length}
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 z-10 translate-y-full bg-black/60 py-1.5 text-center text-xs font-medium text-white transition-transform group-hover:translate-y-0">
                {t('seeMore')}
              </div>
            </div>
          )}

          {/* Room info + price box */}
          <div className="flex flex-1 min-w-0 items-stretch gap-4 p-5">
            {/* Room text */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-[var(--color-text)]">
                {room.roomName}
              </h3>

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
                    {t('upToAdults', { count: String(room.maxAdults) })}
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
                  {room.availableCount === 1 ? t('roomLeft') : t('roomsLeft', { count: String(room.availableCount) })}
                </span>
              </div>

              {(() => {
                const desc = roomDetail?.descriptions.find(d => d.locale === 'en')?.text
                  ?? roomDetail?.descriptions[0]?.text
                return desc ? (
                  <p className="mt-2 text-xs text-muted line-clamp-3 leading-relaxed">{desc}</p>
                ) : null
              })()}

              {roomDetail?.facilities && roomDetail.facilities.length > 0 && (() => {
                const top = [
                  ...roomDetail.facilities.filter(f => f.popular),
                  ...roomDetail.facilities.filter(f => !f.popular),
                ].slice(0, 7)
                return (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {top.map(f => (
                      <span key={f.id} className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5 text-xs text-muted">
                        {facilityIcon(f.name)}{f.name}
                      </span>
                    ))}
                  </div>
                )
              })()}

              {roomDetail && (
                <button
                  onClick={() => setModalOpen(true)}
                  className="mt-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  {t('seeMore')}
                </button>
              )}

              {incentive && (
                <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
                  <IncentiveWidget incentive={incentive} variant="inline" />
                </div>
              )}
            </div>

            {/* Starting from price + Details & book */}
            <div className="shrink-0 flex flex-col items-end justify-between rounded-lg bg-[var(--color-background)] px-4 py-3 min-w-[168px] border border-[var(--color-border)]">
              <div className="text-right">
                <p className="text-xs text-muted">{t('startingFrom')}</p>
                {lowestRate.originalSellAmount != null && (lowestRate.promoDiscount || lowestRate.affiliateDiscount) && (
                  <p className="text-sm text-muted line-through">
                    {formatCurrency(conv(lowestRate.originalSellAmount), dispCur, locale)}
                  </p>
                )}
                <p className="text-2xl font-bold text-[var(--color-text)] leading-tight">
                  {formatCurrency(conv(lowestRate.prices.sell.amount), dispCur, locale)}
                </p>
                {lowestRate.promoCode && (
                  <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 mt-1">
                    {t('promoDiscount', { pct: String(lowestRate.promoDiscount) })}
                  </span>
                )}
                {lowestRate.affiliateCode && lowestRate.affiliateDisplayText && (
                  <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 mt-1">
                    {t('specialFor', { name: lowestRate.affiliateDisplayText })}
                    {(lowestRate.affiliateDiscount ?? 0) > 0 && ` -${lowestRate.affiliateDiscount}%`}
                  </span>
                )}
                {hasDiscount && !lowestRate.promoCode && !lowestRate.affiliateCode && (
                  <p className="text-xs mt-0.5">
                    <span className="font-semibold text-[var(--color-success)]">-{discountPct}%</span>{' '}
                    <span className="line-through text-muted">
                      {formatCurrency(conv(lowestRate.prices.bar.amount), dispCur, locale)}
                    </span>
                  </p>
                )}
                {nights > 1 && (
                  <p className="text-xs text-muted mt-0.5">{t('forNights', { count: String(nights) })}</p>
                )}
              </div>

              <button
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-hover)] active:scale-95"
              >
                {t('detailsAndBook')}
                <svg
                  className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Rate rows — sorted cheapest first */}
        {expanded && (
          <div className="border-t border-[var(--color-border)]">
            {sortedRates.map(rate => (
              <RateRow
                key={rate.ratePlanId}
                rate={rate}
                room={room}
                nights={nights}
                locale={locale}
                onSelect={() => onRateSelect(room, rate)}
                displayCurrency={dispCur}
                convert={conv}
                {...(selectLabel != null ? { selectLabel } : {})}
                {...(selectDisabled != null ? { disabled: selectDisabled(rate) } : {})}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <RoomDetailModal
          room={room}
          roomDetail={roomDetail}
          remarks={remarks}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
