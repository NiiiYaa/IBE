import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { HotelDesignConfig, PropertyDetail, PropertyListResponse } from '@ibe/shared'
import { buildCssVars } from '@/lib/theme'
import { HeroCarousel } from '@/components/home/HeroCarousel'
import { QuiltHero } from '@/components/home/QuiltHero'
import { PropertyCard } from '@/components/home/PropertyCard'
import { OnsiteConversionHomepage } from '@/components/onsite/OnsiteConversionHomepage'
import { PixelInjector } from '@/components/tracking/PixelInjector'

const DEFAULT_PROPERTY_ID = Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID'] || 0)
const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

type TenantResolution =
  | { type: 'property'; propertyId: number; orgId: number }
  | { type: 'org'; orgId: number }

async function resolveTenant(host: string): Promise<TenantResolution | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/resolve?host=${encodeURIComponent(host)}`, {
      next: { revalidate: 60 },
    })
    return res.ok ? (res.json() as Promise<TenantResolution>) : null
  } catch { return null }
}

async function fetchConfig(propertyId: number): Promise<HotelDesignConfig | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/property/${propertyId}`, { next: { revalidate: 60 } })
    return res.ok ? (res.json() as Promise<HotelDesignConfig>) : null
  } catch { return null }
}

async function fetchOrgConfig(orgId: number): Promise<HotelDesignConfig | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/org/${orgId}`, { next: { revalidate: 60 } })
    return res.ok ? (res.json() as Promise<HotelDesignConfig>) : null
  } catch { return null }
}

async function fetchProperty(propertyId: number): Promise<PropertyDetail | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/properties/${propertyId}`, { next: { revalidate: 3600 } })
    return res.ok ? (res.json() as Promise<PropertyDetail>) : null
  } catch { return null }
}

async function fetchPropertyList(propertyId: number): Promise<PropertyListResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/properties?propertyId=${propertyId}`, { next: { revalidate: 60 } })
    return res.ok ? (res.json() as Promise<PropertyListResponse>) : null
  } catch { return null }
}

async function fetchOrgPropertyList(orgId: number): Promise<PropertyListResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/properties?orgId=${orgId}`, { next: { revalidate: 60 } })
    return res.ok ? (res.json() as Promise<PropertyListResponse>) : null
  } catch { return null }
}

const SearchBar = dynamic(
  () => import('@/components/search/SearchBar').then(m => ({ default: m.SearchBar })),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto h-[60px] max-w-3xl animate-pulse rounded-full bg-white/30 backdrop-blur-sm" />
    ),
  },
)

async function resolveDefaultPropertyId(orgId: number): Promise<number | null> {
  const list = await fetchOrgPropertyList(orgId)
  const defaultProp = list?.properties.find(p => p.isDefault) ?? list?.properties[0]
  return defaultProp?.propertyId ?? null
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { hotelId?: string; chain?: string }
}): Promise<Metadata> {
  try {
    const tenantHost = headers().get('x-tenant-host')
    let hotelConfig: HotelDesignConfig | null = null
    let propertyName: string | null = null
    let faviconUrl: string | null = null

    if (tenantHost) {
      const tenant = await resolveTenant(tenantHost)
      if (tenant?.type === 'org') {
        const pid = await resolveDefaultPropertyId(tenant.orgId)
        const orgConfig = await fetchOrgConfig(tenant.orgId)
        faviconUrl = orgConfig?.faviconUrl ?? null
        if (pid) {
          ;[hotelConfig, { name: propertyName } = { name: null }] = await Promise.all([
            fetchConfig(pid),
            fetchProperty(pid).then(p => ({ name: p?.name ?? null })),
          ])
        }
      } else if (tenant?.type === 'property') {
        ;[hotelConfig, { name: propertyName } = { name: null }] = await Promise.all([
          fetchConfig(tenant.propertyId),
          fetchProperty(tenant.propertyId).then(p => ({ name: p?.name ?? null })),
        ])
      }
    }

    if (!hotelConfig && searchParams.chain) {
      const chainParam = searchParams.chain
      let orgId: number | null = null
      try {
        const r = await fetch(`${API_URL}/api/v1/config/org-resolve/${encodeURIComponent(chainParam)}`, { next: { revalidate: 3600 } })
        if (r.ok) { const d = await r.json() as { id: number }; orgId = d.id ?? null }
      } catch { /* ignore */ }
      if (orgId) {
        const orgConfig = await fetchOrgConfig(orgId)
        faviconUrl = orgConfig?.faviconUrl ?? null
        const pid = await resolveDefaultPropertyId(orgId)
        if (pid) {
          ;[hotelConfig, { name: propertyName } = { name: null }] = await Promise.all([
            fetchConfig(pid),
            fetchProperty(pid).then(p => ({ name: p?.name ?? null })),
          ])
        }
      }
    }

    if (!hotelConfig && searchParams.hotelId) {
      const pid = Number(searchParams.hotelId) || 0
      if (pid) {
        ;[hotelConfig, { name: propertyName } = { name: null }] = await Promise.all([
          fetchConfig(pid),
          fetchProperty(pid).then(p => ({ name: p?.name ?? null })),
        ])
      }
    }

    const title = hotelConfig?.tabTitle || hotelConfig?.displayName || propertyName || 'Hotel Booking'
    const favicon = hotelConfig?.faviconUrl || faviconUrl
    return {
      title,
      description: 'Book your stay directly',
      icons: favicon ? [{ rel: 'icon', url: favicon }] : undefined,
    }
  } catch {
    return { title: 'Hotel Booking' }
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { hotelId?: string; chain?: string }
}) {
  // Resolve tenant from subdomain/custom domain (set by middleware)
  const tenantHost = headers().get('x-tenant-host')
  let tenant: TenantResolution | null = tenantHost ? await resolveTenant(tenantHost) : null

  // Fall back to query params (local dev / legacy)
  // ?chain= accepts the HyperGuest Org ID (string); resolve to internal DB org id
  if (!tenant && searchParams.chain) {
    const chainParam = searchParams.chain
    let orgId: number | null = null
    try {
      const r = await fetch(`${API_URL}/api/v1/config/org-resolve/${encodeURIComponent(chainParam)}`, { next: { revalidate: 3600 } })
      if (r.ok) { const d = await r.json() as { id: number }; orgId = d.id ?? null }
    } catch { /* ignore */ }
    if (orgId) tenant = { type: 'org', orgId }
  }
  if (!tenant && searchParams.hotelId) {
    const pid = Number(searchParams.hotelId) || 0
    if (pid) tenant = { type: 'property', propertyId: pid, orgId: 0 }
  }
  if (!tenant && DEFAULT_PROPERTY_ID) {
    tenant = { type: 'property', propertyId: DEFAULT_PROPERTY_ID, orgId: 0 }
  }

  // No tenant resolved — platform root, redirect to admin
  if (!tenant) redirect('/admin')

  let config: HotelDesignConfig | null
  let property: PropertyDetail | null = null
  let propertyList: PropertyListResponse | null
  let propertyId: number

  if (tenant.type === 'org') {
    ;[config, propertyList] = await Promise.all([
      fetchOrgConfig(tenant.orgId),
      fetchOrgPropertyList(tenant.orgId),
    ])
    const defaultProp = propertyList?.properties.find(p => p.isDefault) ?? propertyList?.properties[0]
    propertyId = defaultProp?.propertyId ?? 0
    // Always fetch the default property's data so hero images and name are available
    if (propertyId) {
      property = await fetchProperty(propertyId)
    }
  } else {
    propertyId = tenant.propertyId
    ;[config, property, propertyList] = await Promise.all([
      fetchConfig(propertyId),
      fetchProperty(propertyId),
      fetchPropertyList(propertyId),
    ])
  }

  const heroStyle = config?.heroStyle ?? 'fullpage'
  const heroImageMode = config?.heroImageMode ?? 'fixed'
  const heroCarouselInterval = config?.heroCarouselInterval ?? 5
  const displayName = config?.displayName || property?.name || 'Welcome'
  const tagline = config?.tagline
  const logoUrl = config?.logoUrl || property?.logo || null

  const excludedPropertyIds = new Set(config?.excludedPropertyImageIds ?? [])
  const propertyImages = (property?.images ?? [])
    .filter(img => !excludedPropertyIds.has(img.id))
    .sort((a, b) => a.priority - b.priority)
    .map(img => img.url)

  const heroImageUrl = (tenant.type === 'org' ? config?.chainHeroImageUrl : null)
    || config?.heroImageUrl
    || propertyImages[0]
    || null
  const carouselImages = heroImageUrl
    ? [heroImageUrl, ...propertyImages.filter(u => u !== heroImageUrl)]
    : propertyImages

  // PropertyGrid only renders on the chain/org landing page in multi-property mode
  const isMulti = tenant.type === 'org' && propertyList?.mode === 'multi' && (propertyList?.properties.length ?? 0) > 1
  const multiProperties = isMulti
    ? await Promise.all(
        propertyList!.properties.map(async r => {
          const [detail, hotelConfig] = await Promise.all([
            fetchProperty(r.propertyId),
            fetchConfig(r.propertyId),
          ])
          const sortedImages = (detail?.images ?? []).sort((a, b) => a.priority - b.priority)
          const excludedIds = new Set(hotelConfig?.excludedPropertyImageIds ?? [])
          // Use admin-starred hero image first, then first non-excluded image, then first image
          const imageUrl = hotelConfig?.heroImageUrl
            || sortedImages.find(img => !excludedIds.has(img.id))?.url
            || sortedImages[0]?.url
            || null
          const firstDesc = detail?.descriptions.find(d => d.locale === 'en') ?? detail?.descriptions[0]
          return {
            id: r.propertyId,
            name: detail?.name ?? `Property ${r.propertyId}`,
            starRating: detail?.starRating ?? 0,
            imageUrl,
            city: detail?.location.city ?? '',
            address: detail?.location.address ?? '',
            description: firstDesc?.text ?? '',
            isDefault: r.isDefault,
          }
        })
      )
    : null

  const defaultPropertyId = multiProperties?.find(p => p.isDefault)?.id ?? propertyId
  const cssVars = config ? buildCssVars(config) : ''
  const PageStyle = cssVars ? <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} /> : null

  const PropertyGrid = multiProperties && multiProperties.length > 1 ? (
    <div className="bg-[var(--color-background)] px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-6 text-2xl font-bold text-[var(--color-text)]">Our Properties</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {multiProperties.map(p => (
            <PropertyCard
              key={p.id}
              id={p.id}
              name={p.name}
              starRating={p.starRating}
              imageUrl={p.imageUrl}
              city={p.city}
              address={p.address}
              description={p.description}
            />
          ))}
        </div>
      </div>
    </div>
  ) : null

  const searchBarProps = {
    propertyId: defaultPropertyId,
    infantMaxAge: config?.infantMaxAge ?? 2,
    childMaxAge: config?.childMaxAge ?? 16,
    ...(multiProperties ? {
      properties: multiProperties,
      showCitySelector: propertyList?.showCitySelector ?? false,
    } : {}),
  }

  const onsitePage = isMulti ? 'chain' as const : 'hotel' as const

  if (heroStyle === 'quilt') {
    return (
      <div className="flex-1 bg-[var(--color-background)]">
        {PageStyle}
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <QuiltHero
            images={carouselImages}
            carousel={heroImageMode === 'carousel'}
            intervalSeconds={heroCarouselInterval}
            displayName={displayName}
          />
        </div>

        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
              {displayName}
            </h1>
            {tagline && (
              <p className="mt-3 text-lg text-[var(--color-text-muted)]">{tagline}</p>
            )}
          </div>
          <SearchBar {...searchBarProps} />
        </div>
        {PropertyGrid}
        <OnsiteConversionHomepage propertyId={propertyId} page={onsitePage} />
        <PixelInjector propertyId={propertyId} page="home" />
      </div>
    )
  }

  if (heroStyle === 'rectangle') {
    return (
      <div className="flex-1 bg-[var(--color-background)]">
        {PageStyle}
        <div className="relative h-[50vh] w-full overflow-hidden">
          {heroImageMode === 'carousel' ? (
            <HeroCarousel images={carouselImages} alt={displayName} variant="rectangle" intervalSeconds={heroCarouselInterval} />
          ) : heroImageUrl ? (
            <Image
              src={heroImageUrl}
              alt={displayName}
              fill
              priority
              unoptimized
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-700 to-slate-500" />
          )}
        </div>

        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
              {displayName}
            </h1>
            {tagline && (
              <p className="mt-3 text-lg text-[var(--color-text-muted)]">{tagline}</p>
            )}
          </div>
          <SearchBar {...searchBarProps} />
        </div>
        {PropertyGrid}
        <OnsiteConversionHomepage propertyId={propertyId} page={onsitePage} />
        <PixelInjector propertyId={propertyId} page="home" />
      </div>
    )
  }

  return (
    <>
      {PageStyle}
      <div className="relative flex min-h-screen flex-col">
        <div className="absolute inset-0">
          {heroImageMode === 'carousel' ? (
            <HeroCarousel images={carouselImages} alt={displayName} variant="fullpage" intervalSeconds={heroCarouselInterval} />
          ) : heroImageUrl ? (
            <Image
              src={heroImageUrl}
              alt={displayName}
              fill
              priority
              unoptimized
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-800 to-slate-600" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/65" />
        </div>

        <div className="relative flex flex-1 flex-col px-4">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h1 className="text-4xl font-bold text-white drop-shadow-lg sm:text-5xl lg:text-6xl">
              {displayName}
            </h1>
            {tagline && (
              <p className="mt-4 text-lg text-white/80 drop-shadow sm:text-xl">{tagline}</p>
            )}
          </div>
          <div className="mb-14 w-full">
            <SearchBar {...searchBarProps} />
          </div>
        </div>
      </div>
      {PropertyGrid}
      <OnsiteConversionHomepage propertyId={propertyId} page={onsitePage} />
      <PixelInjector propertyId={propertyId} page="home" />
    </>
  )
}
