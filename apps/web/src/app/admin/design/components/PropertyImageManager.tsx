'use client'

import Image from 'next/image'
import type { PropertyImage } from '@ibe/shared'

interface PropertyImageManagerProps {
  images: PropertyImage[]
  heroImageUrl: string
  excludedIds: number[]
  onHeroChange: (url: string) => void
  onExcludedChange: (ids: number[]) => void
}

export function PropertyImageManager({
  images,
  heroImageUrl,
  excludedIds,
  onHeroChange,
  onExcludedChange,
}: PropertyImageManagerProps) {
  if (images.length === 0) return null

  const excludedSet = new Set(excludedIds)
  const hiddenCount = images.filter(img => excludedSet.has(img.id)).length

  function togglePrimary(img: PropertyImage) {
    if (heroImageUrl === img.url) {
      onHeroChange('')
    } else {
      onHeroChange(img.url)
      // un-exclude if it was excluded
      if (excludedSet.has(img.id)) {
        onExcludedChange(excludedIds.filter(x => x !== img.id))
      }
    }
  }

  function toggleExcluded(img: PropertyImage) {
    if (excludedSet.has(img.id)) {
      onExcludedChange(excludedIds.filter(x => x !== img.id))
    } else {
      // un-primary if it was primary
      if (heroImageUrl === img.url) {
        onHeroChange('')
      }
      onExcludedChange([...excludedIds, img.id])
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {images.length} image{images.length !== 1 ? 's' : ''}
          {hiddenCount > 0 && <span className="ml-1.5 text-[var(--color-error)]">{hiddenCount} hidden</span>}
          {heroImageUrl && images.some(img => img.url === heroImageUrl) && (
            <span className="ml-1.5 text-[var(--color-primary)]">· hero selected</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => onExcludedChange(excludedIds.filter(id => !images.some(img => img.id === id)))}
              className="text-[10px] text-[var(--color-text-muted)] underline-offset-2 hover:underline"
            >
              Show all
            </button>
          )}
          {hiddenCount < images.length && (
            <button
              type="button"
              onClick={() => {
                onExcludedChange(images.map(img => img.id))
                if (heroImageUrl) onHeroChange('')
              }}
              className="text-[10px] text-[var(--color-text-muted)] underline-offset-2 hover:underline"
            >
              Hide all
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {images.map(img => {
          const isPrimary = img.url === heroImageUrl
          const isExcluded = excludedSet.has(img.id)

          return (
            <div
              key={img.id}
              className={[
                'group relative aspect-video overflow-hidden rounded-lg border-2 transition-all',
                isPrimary  ? 'border-[var(--color-primary)]' :
                isExcluded ? 'border-[var(--color-error)] opacity-50' :
                'border-transparent',
              ].join(' ')}
            >
              <Image
                src={img.url}
                alt={img.description || ''}
                fill
                unoptimized
                sizes="120px"
                className="object-cover"
              />

              {isPrimary && (
                <div className="absolute bottom-1 left-1 rounded-full bg-[var(--color-primary)] p-1">
                  <StarIcon className="h-2.5 w-2.5 text-white" />
                </div>
              )}
              {isExcluded && (
                <div className="absolute bottom-1 left-1 rounded-full bg-[var(--color-error)] p-1">
                  <HideIcon className="h-2.5 w-2.5 text-white" />
                </div>
              )}

              <div className="absolute inset-0 flex items-start justify-between p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => togglePrimary(img)}
                  title={isPrimary ? 'Remove as hero' : 'Set as hero image'}
                  className={[
                    'rounded-full p-1 shadow transition-colors',
                    isPrimary
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-white/90 text-[var(--color-text-muted)] hover:bg-[var(--color-primary)] hover:text-white',
                  ].join(' ')}
                >
                  <StarIcon className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  onClick={() => toggleExcluded(img)}
                  title={isExcluded ? 'Show this image' : 'Hide from carousel'}
                  className={[
                    'rounded-full p-1 shadow transition-colors',
                    isExcluded
                      ? 'bg-[var(--color-error)] text-white'
                      : 'bg-white/90 text-[var(--color-text-muted)] hover:bg-[var(--color-error)] hover:text-white',
                  ].join(' ')}
                >
                  <HideIcon className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  )
}

function HideIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
    </svg>
  )
}
