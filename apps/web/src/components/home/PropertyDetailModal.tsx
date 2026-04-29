'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import type { PropertyFacility } from '@ibe/shared'
import { facilityIcon } from '@/lib/facility-icon'

interface PropertyDetailModalProps {
  id: number
  name: string
  starRating: number
  imageUrl: string | null
  city: string
  address: string
  description: string
  facilities: PropertyFacility[]
  onClose: () => void
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} className={`h-3.5 w-3.5 ${i < full ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export function PropertyDetailModal({
  id, name, starRating, imageUrl, city, address, description, facilities, onClose,
}: PropertyDetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const popularFacilities = facilities.filter(f => f.popular)
  const otherFacilities = facilities.filter(f => !f.popular)

  const categoryGroups = new Map<string, PropertyFacility[]>()
  for (const f of otherFacilities) {
    const key = f.category || 'Other'
    if (!categoryGroups.has(key)) categoryGroups.set(key, [])
    categoryGroups.get(key)!.push(f)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl"
        style={{ maxHeight: '90vh' }}
      >
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

        {imageUrl && (
          <div className="relative h-48 w-full shrink-0 overflow-hidden">
            <Image src={imageUrl} alt={name} fill unoptimized sizes="512px" className="object-cover" />
          </div>
        )}

        <div className="overflow-y-auto px-5 py-4">
          {/* Header */}
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-lg font-bold text-[var(--color-text)]">{name}</h2>
              {starRating > 0 && <StarRating rating={starRating} />}
            </div>
            {(city || address) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {[city, address].filter(Boolean).join(', ')}
              </p>
            )}
          </div>

          {description && (
            <p className="mb-4 text-sm leading-relaxed text-muted">{description}</p>
          )}

          {popularFacilities.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Highlights</p>
              <div className="flex flex-wrap gap-1.5">
                {popularFacilities.map(f => (
                  <span key={f.id} className="rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-primary-light)] px-2.5 py-0.5 text-xs font-medium text-primary">
                    {facilityIcon(f.name)}{f.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {categoryGroups.size > 0 && (
            <div className="mb-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">All Amenities</p>
              {Array.from(categoryGroups.entries()).map(([cat, items]) => (
                <div key={cat}>
                  <p className="mb-1 text-xs font-medium text-[var(--color-text)]">{cat}</p>
                  <div className="flex flex-wrap gap-1">
                    {items.map(f => (
                      <span key={f.id} className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5 text-xs text-muted">
                        {facilityIcon(f.name)}{f.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <a
            href={`/?hotelId=${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block w-full rounded-[var(--radius-md)] bg-primary px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-hover)]"
          >
            Check Availability
          </a>
        </div>
      </div>
    </div>
  )
}
