import type { Metadata } from 'next'
import type { PropertyDetail, HotelDesignConfig } from '@ibe/shared'
import { notFound } from 'next/navigation'
import { buildCssVars } from '@/lib/theme'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

async function fetchProperty(id: number): Promise<PropertyDetail | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/properties/${id}`, { next: { revalidate: 3600 } })
    return res.ok ? (res.json() as Promise<PropertyDetail>) : null
  } catch { return null }
}

async function fetchConfig(id: number): Promise<HotelDesignConfig | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/property/${id}`, { next: { revalidate: 3600 } })
    return res.ok ? (res.json() as Promise<HotelDesignConfig>) : null
  } catch { return null }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const id = Number(params.id)
  const [property, config] = await Promise.all([fetchProperty(id), fetchConfig(id)])
  const name = config?.displayName || property?.name || 'Hotel'
  return {
    title: name,
    description: property?.descriptions.find(d => d.locale === 'en')?.text?.slice(0, 160) ?? `Book your stay at ${name}`,
  }
}

const FACILITY_ICONS: Record<string, string> = {
  wifi: '📶', internet: '📶', pool: '🏊', 'swimming-pool': '🏊',
  parking: '🅿️', restaurant: '🍽️', bar: '🍸', gym: '💪', fitness: '💪',
  spa: '💆', 'air-conditioning': '❄️', 'air-condition': '❄️',
  'pet-friendly': '🐾', pets: '🐾', breakfast: '🥐', 'room-service': '🛎️',
  concierge: '🛎️', laundry: '👔', elevator: '🛗', 'business-centre': '💼',
  'conference-room': '💼', beach: '🏖️', garden: '🌿', terrace: '🌿',
}

function facilityIcon(slug: string): string {
  const key = slug.toLowerCase()
  for (const [k, v] of Object.entries(FACILITY_ICONS)) {
    if (key.includes(k)) return v
  }
  return '✓'
}

export default async function HotelPage({ params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!id) notFound()

  const [property, config] = await Promise.all([fetchProperty(id), fetchConfig(id)])
  if (!property) notFound()

  const cssVars = config ? buildCssVars(config) : ''
  const displayName = config?.displayName || property.name
  const desc = property.descriptions.find(d => d.locale === 'en')?.text ?? property.descriptions[0]?.text ?? ''

  const popularFacilities = property.facilities.filter(f => f.popular)
  const otherFacilities = property.facilities.filter(f => !f.popular)
  const facilities = [...popularFacilities, ...otherFacilities].slice(0, 16)

  const { latitude, longitude } = property.location.coordinates
  const mapsUrl = latitude && longitude
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.location.address}, ${property.location.city}`)}`

  const bookUrl = `/?hotelId=${id}`
  const stars = Math.round(property.starRating)

  return (
    <>
      {cssVars && <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} />}

      <div className="min-h-screen bg-white text-gray-900">

        {/* Image strip */}
        {property.images.length > 0 && (
          <div className="flex gap-1 overflow-x-auto" style={{ scrollSnapType: 'x mandatory' }}>
            {property.images.slice(0, 8).map((img, i) => (
              <img
                key={img.id}
                src={img.url}
                alt={img.description || displayName}
                className="h-56 w-auto shrink-0 object-cover sm:h-72"
                style={{ scrollSnapAlign: 'start', aspectRatio: i === 0 ? '4/3' : '3/2' }}
              />
            ))}
          </div>
        )}

        <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">

          {/* Header */}
          <div>
            {stars > 0 && (
              <div className="mb-1 flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className={i < stars ? 'text-amber-400' : 'text-gray-200'}>★</span>
                ))}
              </div>
            )}
            <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <span>📍</span>
              <span>{property.location.address}, {property.location.city}, {property.location.countryCode}</span>
            </a>
          </div>

          {/* Book CTA */}
          <a
            href={bookUrl}
            className="flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary, #2563eb)' }}
          >
            Book now
            <span>→</span>
          </a>

          {/* Description */}
          {desc && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">About this stay</h2>
              <p className="text-sm leading-relaxed text-gray-700">{desc}</p>
            </div>
          )}

          {/* Facilities */}
          {facilities.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Facilities</h2>
              <div className="flex flex-wrap gap-2">
                {facilities.map(f => (
                  <span
                    key={f.id}
                    className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
                  >
                    <span>{facilityIcon(f.nameSlug)}</span>
                    <span>{f.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Contact */}
          {(property.contact.phone || property.contact.email || property.contact.website) && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">Contact</h2>
              <div className="space-y-1 text-sm text-gray-600">
                {property.contact.phone && (
                  <a href={`tel:${property.contact.phone}`} className="flex items-center gap-2 hover:text-gray-900">
                    <span>📞</span><span>{property.contact.phone}</span>
                  </a>
                )}
                {property.contact.email && (
                  <a href={`mailto:${property.contact.email}`} className="flex items-center gap-2 hover:text-gray-900">
                    <span>✉️</span><span>{property.contact.email}</span>
                  </a>
                )}
                {property.contact.website && (
                  <a href={property.contact.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-gray-900">
                    <span>🌐</span><span>{property.contact.website}</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Map link */}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span>🗺️</span>
            <span>View on map</span>
          </a>

        </div>
      </div>
    </>
  )
}
