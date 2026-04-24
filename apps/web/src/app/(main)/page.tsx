import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { HotelDesignConfig, PropertyDetail, PropertyListResponse } from '@ibe/shared'
import { buildCssVars } from '@/lib/theme'
import { HeroCarousel } from '@/components/home/HeroCarousel'
import { QuiltHero } from '@/components/home/QuiltHero'
import { PropertyGridClient } from '@/components/home/PropertyGridClient'
import { OnsiteConversionHomepage } from '@/components/onsite/OnsiteConversionHomepage'
import { PixelInjector } from '@/components/tracking/PixelInjector'

const ChatWidget = dynamic(
  () => import('@/components/chat/ChatWidget').then(m => ({ default: m.ChatWidget })),
  { ssr: false },
)

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

async function fetchAIEnabled(propertyId: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/v1/ai/enabled?propertyId=${propertyId}`, { next: { revalidate: 60 } })
    if (!res.ok) return false
    const data = await res.json() as { enabled: boolean }
    return data.enabled
  } catch { return false }
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
    let chainConfig: HotelDesignConfig | null = null
    let propertyName: string | null = null
    let faviconUrl: string | null = null

    if (tenantHost) {
      const tenant = await resolveTenant(tenantHost)
      if (tenant?.type === 'org') {
        const [orgConfig, pid] = await Promise.all([
          fetchOrgConfig(tenant.orgId),
          resolveDefaultPropertyId(tenant.orgId),
        ])
        chainConfig = orgConfig
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

    if (!hotelConfig && !chainConfig && searchParams.chain) {
      const chainParam = searchParams.chain
      let orgId: number | null = null
      try {
        const r = await fetch(`${API_URL}/api/v1/config/org-resolve/${encodeURIComponent(chainParam)}`, { next: { revalidate: 3600 } })
        if (r.ok) { const d = await r.json() as { id: number }; orgId = d.id ?? null }
      } catch { /* ignore */ }
      if (orgId) {
        const [orgConfig, pid] = await Promise.all([
          fetchOrgConfig(orgId),
          resolveDefaultPropertyId(orgId),
        ])
        chainConfig = orgConfig
        faviconUrl = orgConfig?.faviconUrl ?? null
        if (pid) {
          ;[hotelConfig, { name: propertyName } = { name: null }] = await Promise.all([
            fetchConfig(pid),
            fetchProperty(pid).then(p => ({ name: p?.name ?? null })),
          ])
        }
      }
    }

    if (!hotelConfig && !chainConfig && searchParams.hotelId) {
      const pid = Number(searchParams.hotelId) || 0
      if (pid) {
        ;[hotelConfig, { name: propertyName } = { name: null }] = await Promise.all([
          fetchConfig(pid),
          fetchProperty(pid).then(p => ({ name: p?.name ?? null })),
        ])
      }
    }

    const title = chainConfig
      ? (chainConfig.tabTitle || chainConfig.displayName || 'Hotel Booking')
      : (hotelConfig?.tabTitle || hotelConfig?.displayName || propertyName || 'Hotel Booking')
    const favicon = chainConfig?.faviconUrl || hotelConfig?.faviconUrl || faviconUrl
    return {
      title,
      description: 'Book your stay directly',
      ...(favicon ? { icons: [{ rel: 'icon', url: favicon }] } : {}),
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
    // property is set below together with multiProperties to avoid a serial waterfall
  } else {
    propertyId = tenant.propertyId
    ;[config, property, propertyList] = await Promise.all([
      fetchConfig(propertyId),
      fetchProperty(propertyId),
      fetchPropertyList(propertyId),
    ])
  }

  const aiEnabled = propertyId ? await fetchAIEnabled(propertyId) : false

  // For org tenants: fetch only the first INITIAL_BATCH property details server-side.
  // Remaining properties are loaded client-side on demand via PropertyGridClient.
  const INITIAL_BATCH = 4
  const isMulti = tenant.type === 'org' && (propertyList?.properties.length ?? 0) > 1

  // Ensure the default property is always in the initial batch
  const allOrgProperties = propertyList?.properties ?? []
  const defaultIdx = allOrgProperties.findIndex(p => p.propertyId === propertyId)
  const orderedProperties = defaultIdx > 0
    ? [allOrgProperties[defaultIdx]!, ...allOrgProperties.filter((_, i) => i !== defaultIdx)]
    : allOrgProperties
  const initialBatch = orderedProperties.slice(0, INITIAL_BATCH)
  const remainingEntries = orderedProperties.slice(INITIAL_BATCH).map(p => ({
    propertyId: p.propertyId,
    name: p.name ?? `Property ${p.propertyId}`,
  }))

  const multiProperties = (tenant.type === 'org' && orderedProperties.length > 0)
    ? await Promise.all(
        initialBatch.map(async r => {
          const [detail, hotelConfig] = await Promise.all([
            fetchProperty(r.propertyId),
            fetchConfig(r.propertyId),
          ])
          if (r.propertyId === propertyId) property = detail
          const sortedImages = (detail?.images ?? []).sort((a, b) => a.priority - b.priority)
          const imageUrl = hotelConfig?.heroImageUrl || sortedImages[0]?.url || null
          const firstDesc = detail?.descriptions.find(d => d.locale === 'en') ?? detail?.descriptions[0]
          return {
            id: r.propertyId,
            name: detail?.name ?? `Property ${r.propertyId}`,
            starRating: detail?.starRating ?? 0,
            imageUrl,
            city: detail?.location.city ?? '',
            address: detail?.location.address ?? '',
            description: firstDesc?.text ?? '',
            facilities: detail?.facilities ?? [],
            isDefault: r.isDefault,
          }
        })
      )
    : null

  // Fetch name + city for remaining properties (beyond initial batch) so the search bar
  // shows real hotel names and cities for all properties immediately.
  // Uses the same cached endpoint (revalidate: 3600) — warm loads are instant.
  const remainingMetaMap = new Map(
    await Promise.all(
      orderedProperties.slice(INITIAL_BATCH).map(async p => {
        const detail = await fetchProperty(p.propertyId)
        return [p.propertyId, {
          name: detail?.name ?? p.name ?? null,
          city: detail?.location?.city ?? null,
        }] as const
      })
    )
  )

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

  const defaultPropertyId = multiProperties?.find(p => p.isDefault)?.id ?? propertyId
  const cssVars = config ? buildCssVars(config) : ''
  const PageStyle = cssVars ? <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} /> : null

  const propertyListLayout = config?.propertyListLayout ?? 'grid'

  const PropertyGrid = multiProperties && multiProperties.length > 1 ? (
    <div className="bg-[var(--color-background)] px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-6 text-2xl font-bold text-[var(--color-text)]">Our Properties</h2>
        <PropertyGridClient
          initial={multiProperties}
          remaining={remainingEntries}
          layout={propertyListLayout}
        />
      </div>
    </div>
  ) : null

  // All properties as lightweight options for the search bar — available immediately.
  // Name and city come from the full-detail fetch (multiProperties) when available,
  // falling back to the lightweight PropertyRecord for the rest.
  const loadedDetailMap = new Map(multiProperties?.map(p => [p.id, p]) ?? [])
  const allPropertyOptions = tenant.type === 'org'
    ? orderedProperties.map(p => {
        const loaded = loadedDetailMap.get(p.propertyId)
        const remaining = remainingMetaMap.get(p.propertyId)
        const name = loaded?.name ?? remaining?.name ?? p.name ?? `Property ${p.propertyId}`
        const city = loaded?.city || remaining?.city || undefined
        return {
          id: p.propertyId,
          name,
          ...(city ? { city } : {}),
          isDefault: p.isDefault,
        }
      })
    : null

  const multiCities = allPropertyOptions
    ? new Set(allPropertyOptions.map(p => p.city).filter(Boolean)).size
    : 0

  const searchBarProps = {
    propertyId: defaultPropertyId,
    infantMaxAge: config?.infantMaxAge ?? 2,
    childMaxAge: config?.childMaxAge ?? 16,
    aiEnabled,
    ...(tenant.type === 'org' ? { orgId: tenant.orgId } : {}),
    ...(allPropertyOptions ? {
      properties: allPropertyOptions,
      showCitySelector: multiCities > 1,
    } : {}),
  }

  const onsitePage = isMulti ? 'chain' as const : 'hotel' as const

  const chatWidgetProps = {
    ...(defaultPropertyId ? { propertyId: defaultPropertyId } : {}),
    ...(tenant.type === 'org' ? { orgId: tenant.orgId } : {}),
    whatsappPrefilledMessage: isMulti
      ? `Hello, I'd like to find out about ${displayName}'s properties.`
      : `Hello, I'd like to find out about ${displayName}.`,
  }

  // Shared mobile rectangle hero — always shown on mobile regardless of heroStyle
  const MobileRectangleHero = (
    <div className="relative h-52 w-full overflow-hidden sm:hidden">
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
  )

  if (heroStyle === 'quilt') {
    return (
      <div className="flex-1 bg-[var(--color-background)]">
        {PageStyle}

        {/* Mobile: rectangle hero */}
        {MobileRectangleHero}

        {/* Desktop: quilt mosaic */}
        <div className="hidden sm:block mx-auto max-w-6xl px-4 pt-6">
          <QuiltHero
            images={carouselImages}
            carousel={heroImageMode === 'carousel'}
            intervalSeconds={heroCarouselInterval}
            displayName={displayName}
          />
        </div>

        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="mb-4 text-center">
            <h1 className="text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
              {displayName}
            </h1>
            {tagline && (
              <p className="mt-2 text-lg text-[var(--color-text-muted)]">{tagline}</p>
            )}
          </div>
          <SearchBar {...searchBarProps} />
        </div>
        {PropertyGrid}
        <OnsiteConversionHomepage propertyId={propertyId} page={onsitePage} />
        <PixelInjector propertyId={propertyId} page="home" />
        <ChatWidget {...chatWidgetProps} />
      </div>
    )
  }

  if (heroStyle === 'rectangle') {
    return (
      <div className="flex-1 bg-[var(--color-background)]">
        {PageStyle}
        {/* Mobile: fixed height; desktop: 50vh */}
        <div className="relative h-52 sm:h-[50vh] w-full overflow-hidden">
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

        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="mb-4 text-center">
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
        <ChatWidget {...chatWidgetProps} />
      </div>
    )
  }

  // fullpage style
  return (
    <>
      {PageStyle}

      {/* Mobile: rectangle hero + title + search */}
      <div className="sm:hidden flex-1 bg-[var(--color-background)]">
        {MobileRectangleHero}
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="mb-4 text-center">
            <h1 className="text-3xl font-bold text-[var(--color-text)]">{displayName}</h1>
            {tagline && (
              <p className="mt-2 text-lg text-[var(--color-text-muted)]">{tagline}</p>
            )}
          </div>
          <SearchBar {...searchBarProps} />
        </div>
      </div>

      {/* Desktop: fullpage hero with centered title + search */}
      <div className="hidden sm:flex relative min-h-screen flex-col">
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

        <div className="relative flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full text-center">
            <h1 className="text-5xl font-bold text-white drop-shadow-lg lg:text-6xl">
              {displayName}
            </h1>
            {tagline && (
              <p className="mt-2 text-xl text-white/80 drop-shadow">{tagline}</p>
            )}
          </div>
          <div className="mt-4 w-full">
            <SearchBar {...searchBarProps} />
          </div>
        </div>
      </div>

      {PropertyGrid}
      <OnsiteConversionHomepage propertyId={propertyId} page={onsitePage} />
      <PixelInjector propertyId={propertyId} page="home" />
      <ChatWidget {...chatWidgetProps} />
    </>
  )
}
