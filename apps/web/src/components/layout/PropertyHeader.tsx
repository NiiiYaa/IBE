import type { PropertyDetail } from '@ibe/shared'
import { HeroCarousel } from '@/components/home/HeroCarousel'

interface PropertyHeaderProps {
  property: PropertyDetail
  heroImageUrl?: string | null
  tagline?: string | null
  displayName?: string | null
  imageMode?: 'fixed' | 'carousel'
  carouselInterval?: number
  carouselImages?: string[]
}

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${i < count ? 'text-[#f59e0b]' : 'text-[var(--color-border)]'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export function PropertyHeader({
  property,
  heroImageUrl,
  tagline,
  displayName,
  imageMode = 'fixed',
  carouselInterval = 5,
  carouselImages = [],
}: PropertyHeaderProps) {
  const hero = heroImageUrl === undefined ? property.images[0]?.url : heroImageUrl
  const name = displayName ?? property.name
  const isCarousel = imageMode === 'carousel'
  const showImage = !!hero || (isCarousel && carouselImages.length > 0)

  return (
    <div className="relative overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-card">
      {/* Hero image */}
      {showImage && (
        <div className="relative h-52 w-full overflow-hidden sm:h-64">
          {isCarousel && carouselImages.length > 0 ? (
            <HeroCarousel
              images={carouselImages}
              alt={name}
              variant="rectangle"
              intervalSeconds={carouselInterval}
              showDots={false}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero ?? undefined}
              alt={name}
              className="h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          {/* Overlay text */}
          <div className="absolute bottom-0 left-0 p-5 text-white" style={{ zIndex: 20 }}>
            <div className="mb-1 flex items-center gap-2">
              <StarRating count={property.starRating} />
              <span className="text-xs text-white/80">{property.location.city}, {property.location.countryCode}</span>
            </div>
            <h1 className="text-xl font-semibold leading-tight sm:text-2xl">{name}</h1>
            {tagline && <p className="mt-0.5 text-sm text-white/80">{tagline}</p>}
          </div>
        </div>
      )}

      {!showImage && (
        <div className="p-5">
          <div className="mb-1 flex items-center gap-2">
            <StarRating count={property.starRating} />
            <span className="text-sm text-muted">{property.location.city}, {property.location.countryCode}</span>
          </div>
          <h1 className="text-xl font-semibold">{name}</h1>
          {tagline && <p className="mt-1 text-sm text-muted">{tagline}</p>}
        </div>
      )}

      {/* Facility chips */}
      <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-[var(--color-border)]">
        {property.facilities.filter(f => f.popular).slice(0, 6).map(f => (
          <span
            key={f.id}
            className="flex items-center gap-1 rounded-full bg-[var(--color-primary-light)] px-2.5 py-1 text-xs font-medium text-primary"
          >
            {f.name}
          </span>
        ))}
      </div>
    </div>
  )
}
