'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { PropertyFacility } from '@ibe/shared'
import { PropertyDetailModal } from './PropertyDetailModal'
import { facilityIcon } from '@/lib/facility-icon'
import { useT } from '@/context/translations'

interface PropertyRowProps {
  id: number
  name: string
  starRating: number
  imageUrl: string | null
  city: string
  address: string
  description: string
  facilities: PropertyFacility[]
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} className={`h-3 w-3 ${i < full ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export function PropertyRow({ id, name, starRating, imageUrl, city, address, description, facilities }: PropertyRowProps) {
  const t = useT('search')
  const [modalOpen, setModalOpen] = useState(false)
  const topFacilities = [
    ...facilities.filter(f => f.popular),
    ...facilities.filter(f => !f.popular),
  ].slice(0, 4)

  return (
    <>
      <div className="group flex items-center gap-4 border-b border-[var(--color-border)] px-2 -mx-2 py-3.5 transition-colors hover:bg-[var(--color-surface)] rounded-lg last:border-b-0">
        {/* Thumbnail */}
        <a
          href={`/?hotelId=${id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={name}
          className="relative h-[72px] w-[104px] shrink-0 overflow-hidden rounded-lg bg-[var(--color-background)]"
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={name}
              fill
              unoptimized
              sizes="104px"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-300 to-slate-400" />
          )}
        </a>

        {/* Info */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-2">
            <a
              href={`/?hotelId=${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-semibold text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary)]"
            >
              {name} <span className="font-normal text-[var(--color-text-muted)]">({id})</span>
            </a>
            {starRating > 0 && <StarRating rating={starRating} />}
          </div>
          {(city || address) && (
            <p className="truncate text-xs text-muted">{city || address}</p>
          )}
          {description && (
            <p className="mt-0.5 truncate text-xs leading-relaxed text-muted hidden sm:block">
              {description}
            </p>
          )}
          <div className="mt-1 flex items-center gap-1 overflow-hidden">
            {topFacilities.map(f => (
              <span
                key={f.id}
                className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5 text-xs text-muted"
              >
                {facilityIcon(f.name)}{f.name}
              </span>
            ))}
            <button
              onClick={() => setModalOpen(true)}
              className="shrink-0 whitespace-nowrap text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {t('seeMore')}
            </button>
          </div>
        </div>

        {/* CTA */}
        <div className="shrink-0">
          <a
            href={`/?hotelId=${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-[var(--radius-md)] border border-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white whitespace-nowrap"
          >
            {t('checkAvailability')}
          </a>
        </div>
      </div>

      {modalOpen && (
        <PropertyDetailModal
          id={id}
          name={name}
          starRating={starRating}
          imageUrl={imageUrl}
          city={city}
          address={address}
          description={description}
          facilities={facilities}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
