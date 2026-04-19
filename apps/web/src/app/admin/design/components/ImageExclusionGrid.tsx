import Image from 'next/image'
import type { PropertyImage } from '@ibe/shared'

interface ImageExclusionGridProps {
  images: PropertyImage[]
  excludedIds: number[]
  onChange: (ids: number[]) => void
  label?: string
}

export function ImageExclusionGrid({ images, excludedIds, onChange, label }: ImageExclusionGridProps) {
  if (images.length === 0) return null

  function toggle(id: number) {
    onChange(
      excludedIds.includes(id)
        ? excludedIds.filter(x => x !== id)
        : [...excludedIds, id],
    )
  }

  const excluded = excludedIds.length
  const total = images.length

  return (
    <div>
      {label && (
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
          <span className="ml-2 font-normal normal-case">
            {excluded === 0
              ? `all ${total} shown`
              : `${excluded} of ${total} hidden`}
          </span>
        </p>
      )}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {images.map(img => {
          const isExcluded = excludedIds.includes(img.id)
          return (
            <button
              key={img.id}
              type="button"
              onClick={() => toggle(img.id)}
              title={isExcluded ? 'Click to include' : 'Click to exclude'}
              className={[
                'group relative aspect-video overflow-hidden rounded-lg border-2 transition-all',
                isExcluded
                  ? 'border-[var(--color-error)] opacity-50'
                  : 'border-transparent hover:border-[var(--color-primary-light)]',
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
              {/* Overlay */}
              <div className={[
                'absolute inset-0 flex items-center justify-center transition-opacity',
                isExcluded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              ].join(' ')}>
                <div className={[
                  'rounded-full p-1.5',
                  isExcluded ? 'bg-[var(--color-error)]' : 'bg-black/50',
                ].join(' ')}>
                  {isExcluded ? (
                    <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {excluded > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="mt-2 text-xs text-[var(--color-text-muted)] underline-offset-2 hover:underline"
        >
          Show all images
        </button>
      )}
    </div>
  )
}
