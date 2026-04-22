import Image from 'next/image'

interface PropertyRowProps {
  id: number
  name: string
  starRating: number
  imageUrl: string | null
  city: string
  address: string
  description: string
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} className={`h-3 w-3 ${i < full ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export function PropertyRow({ id, name, starRating, imageUrl, city, address, description }: PropertyRowProps) {
  return (
    <a
      href={`/?hotelId=${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 border-b border-[var(--color-border)] py-4 transition-colors hover:bg-[var(--color-surface)] px-2 -mx-2 rounded-lg last:border-b-0"
    >
      {/* Thumbnail */}
      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-[var(--color-background)] sm:h-24 sm:w-36">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            unoptimized
            sizes="144px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-300 to-slate-400" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
            {name}
          </h3>
          {starRating > 0 && <StarRating rating={starRating} />}
        </div>
        {(city || address) && (
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{city || address}</p>
        )}
        {description && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)] hidden sm:block">
            {description}
          </p>
        )}
      </div>

      {/* CTA */}
      <div className="shrink-0">
        <span className="block rounded-[var(--radius-md)] border border-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-white whitespace-nowrap">
          Check Availability
        </span>
      </div>
    </a>
  )
}
