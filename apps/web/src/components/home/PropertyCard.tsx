'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { PropertyFacility } from '@ibe/shared'
import { PropertyDetailModal } from './PropertyDetailModal'
import { facilityIcon } from '@/lib/facility-icon'

interface PropertyCardProps {
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
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} className={`h-3.5 w-3.5 ${i < full ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export function PropertyCard({ id, name, starRating, imageUrl, city, address, description, facilities }: PropertyCardProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const topFacilities = [
    ...facilities.filter(f => f.popular),
    ...facilities.filter(f => !f.popular),
  ].slice(0, 5)

  return (
    <>
      <div className="group flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-shadow hover:shadow-md">
        <a
          href={`/?hotelId=${id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={name}
          className="relative block h-48 w-full shrink-0 overflow-hidden bg-[var(--color-background)]"
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={name}
              fill
              unoptimized
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-300 to-slate-400" />
          )}
        </a>

        <div className="flex flex-1 flex-col p-4">
          {starRating > 0 && (
            <div className="mb-1.5">
              <StarRating rating={starRating} />
            </div>
          )}
          <a href={`/?hotelId=${id}`} target="_blank" rel="noopener noreferrer">
            <h3 className="line-clamp-1 text-sm font-semibold leading-snug text-[var(--color-text)] transition-colors hover:text-primary">
              {name} <span className="font-normal text-[var(--color-text-muted)]">({id})</span>
            </h3>
          </a>
          <p className="mt-0.5 truncate text-xs text-muted">{city || address}</p>
          {description && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{description}</p>
          )}

          {topFacilities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {topFacilities.map(f => (
                <span key={f.id} className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5 text-xs text-muted">
                  {facilityIcon(f.name)}{f.name}
                </span>
              ))}
            </div>
          )}

          <button
            onClick={() => setModalOpen(true)}
            className="mt-1.5 self-start text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            See more
          </button>

          <div className="mt-auto pt-3">
            <a
              href={`/?hotelId=${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-[var(--radius-md)] border border-[var(--color-primary)] px-4 py-2 text-center text-xs font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
            >
              Check Availability
            </a>
          </div>
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
