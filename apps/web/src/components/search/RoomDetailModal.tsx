'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import type { RoomOption, RoomDetail } from '@ibe/shared'

interface RoomDetailModalProps {
  room: RoomOption
  roomDetail?: RoomDetail | undefined
  remarks?: string[]
  onClose: () => void
}

export function RoomDetailModal({ room, roomDetail, remarks = [], onClose }: RoomDetailModalProps) {
  const images = roomDetail?.images ?? []
  const [imgIndex, setImgIndex] = useState(0)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const description =
    roomDetail?.descriptions.find(d => d.locale === 'en')?.text ??
    roomDetail?.descriptions[0]?.text

  const currentImage = images[imgIndex]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-[var(--color-surface)] shadow-2xl sm:max-h-[88vh] sm:max-w-3xl sm:flex-row sm:rounded-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
        >
          ✕
        </button>

        {/* Image section — top on mobile, left column on desktop */}
        <div className="flex shrink-0 flex-col sm:w-2/5">
          <div className="group relative aspect-[3/2] w-full sm:aspect-auto sm:flex-1 sm:min-h-0">
            {currentImage ? (
              <Image
                key={currentImage.id}
                src={currentImage.url}
                alt={currentImage.description || room.roomName}
                fill
                unoptimized
                sizes="(max-width: 640px) 100vw, 40vw"
                className="object-cover"
              />
            ) : (
              <div className="h-full w-full bg-[var(--color-border)]" />
            )}

            {imgIndex > 0 && (
              <button
                onClick={() => setImgIndex(i => i - 1)}
                aria-label="Previous image"
                className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-xl text-white hover:bg-black/70"
              >
                ‹
              </button>
            )}
            {imgIndex < images.length - 1 && (
              <button
                onClick={() => setImgIndex(i => i + 1)}
                aria-label="Next image"
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-xl text-white hover:bg-black/70"
              >
                ›
              </button>
            )}

            {images.length > 1 && (
              <div className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                {imgIndex + 1} / {images.length}
              </div>
            )}
          </div>

          {/* Thumbnail strip — desktop only */}
          {images.length > 1 && (
            <div className="hidden sm:flex gap-1.5 overflow-x-auto bg-black/10 p-2">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setImgIndex(i)}
                  className={[
                    'relative h-12 w-16 shrink-0 overflow-hidden rounded transition-opacity',
                    i === imgIndex ? 'ring-2 ring-[var(--color-primary)]' : 'opacity-60 hover:opacity-100',
                  ].join(' ')}
                >
                  <Image src={img.url} alt={img.description || `Photo ${i + 1}`} fill unoptimized sizes="64px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details — scrollable */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-5 sm:p-6">
          <h2 className="pr-8 text-lg font-bold text-[var(--color-text)] sm:text-xl">{room.roomName}</h2>

          {/* Specs */}
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted">
            {room.roomSizeM2 > 0 && (
              <span className="flex items-center gap-1">
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                {room.roomSizeM2} m²
              </span>
            )}
            {room.maxAdults > 0 && (
              <span className="flex items-center gap-1">
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Up to {room.maxAdults} adults
              </span>
            )}
            {room.bedding[0] && (
              <span className="flex items-center gap-1">
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                {room.bedding[0].quantity}× {room.bedding[0].type}
              </span>
            )}
            <span className="font-medium text-success">
              {room.availableCount} room{room.availableCount !== 1 ? 's' : ''} left
            </span>
          </div>

          {/* Facilities */}
          {roomDetail?.facilities && roomDetail.facilities.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Facilities</h3>
              <div className="flex flex-wrap gap-1.5">
                {roomDetail.facilities.map(f => (
                  <span key={f.id} className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-0.5 text-xs text-muted">
                    {f.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {description && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-sm font-semibold text-[var(--color-text)]">Description</h3>
              <p className="text-sm leading-relaxed text-muted">{description}</p>
            </div>
          )}

          {/* Property remarks */}
          {remarks.length > 0 && (
            <div className="mt-4 space-y-2">
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
