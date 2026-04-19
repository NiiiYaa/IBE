import Image from 'next/image'
import type { PropertyImage } from '@ibe/shared'

interface ImagePrimarySelectorProps {
  images: PropertyImage[]
  excludedIds: number[]
  primaryImageIds: Record<number, number>
  roomId: number
  onChange: (updated: Record<number, number>) => void
  label?: string
}

export function ImagePrimarySelector({
  images,
  excludedIds,
  primaryImageIds,
  roomId,
  onChange,
  label,
}: ImagePrimarySelectorProps) {
  const availableImages = images.filter(img => !excludedIds.includes(img.id))
  if (availableImages.length === 0) return null

  const currentPrimaryId = primaryImageIds[roomId]

  function select(id: number) {
    const next = { ...primaryImageIds }
    if (next[roomId] === id) {
      delete next[roomId]
    } else {
      next[roomId] = id
    }
    onChange(next)
  }

  return (
    <div>
      {label && (
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
          <span className="ml-2 font-normal normal-case text-[var(--color-text-muted)]">
            {currentPrimaryId ? 'custom primary selected' : 'using first image'}
          </span>
        </p>
      )}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {availableImages.map(img => {
          const isPrimary = img.id === currentPrimaryId
          return (
            <button
              key={img.id}
              type="button"
              onClick={() => select(img.id)}
              title={isPrimary ? 'Click to unset primary' : 'Click to set as primary image'}
              className={[
                'group relative aspect-video overflow-hidden rounded-lg border-2 transition-all',
                isPrimary
                  ? 'border-[var(--color-primary)]'
                  : 'border-transparent hover:border-[var(--color-primary)]/40',
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

              {/* Primary badge */}
              {isPrimary && (
                <div className="absolute left-1.5 top-1.5 rounded-full bg-[var(--color-primary)] p-1 shadow">
                  <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </div>
              )}

              {/* Hover overlay for non-primary */}
              {!isPrimary && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="rounded-full bg-black/50 p-1.5">
                    <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
