import type { Metadata } from 'next'
import type { HotelDesignConfig, NavItem, PropertyDetail, PropertyListResponse, SellModel } from '@ibe/shared'
import { headers } from 'next/headers'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { buildCssVars } from '@/lib/theme'
import { B2BAuthGate } from '@/components/b2b/B2BAuthGate'
import { AiModeProvider } from '@/context/ai-mode'
import { TranslationsProvider } from '@/context/translations'
import { VisitorTracker } from '@/components/VisitorTracker'

const DEFAULT_PROPERTY_ID = Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID'])
const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'
const fetchCache = process.env.NODE_ENV === 'development'
  ? ({ cache: 'no-store' } as const)
  : ({ next: { revalidate: 60 } } as const)

type TenantResolution =
  | { type: 'property'; propertyId: number; orgId: number }
  | { type: 'org'; orgId: number }

async function resolveTenantHost(host: string): Promise<TenantResolution | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/resolve?host=${encodeURIComponent(host)}`, fetchCache)
    return res.ok ? (res.json() as Promise<TenantResolution>) : null
  } catch { return null }
}

async function resolveChain(hyperGuestOrgId: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/org-resolve/${encodeURIComponent(hyperGuestOrgId)}`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const d = await res.json() as { id: number }
    return d.id ?? null
  } catch { return null }
}

async function fetchConfig(propertyId: number): Promise<HotelDesignConfig | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/property/${propertyId}`, fetchCache)
    return res.ok ? (res.json() as Promise<HotelDesignConfig>) : null
  } catch { return null }
}

async function fetchOrgConfig(orgId: number): Promise<HotelDesignConfig | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/org/${orgId}`, fetchCache)
    return res.ok ? (res.json() as Promise<HotelDesignConfig>) : null
  } catch { return null }
}

async function fetchProperty(propertyId: number): Promise<PropertyDetail | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/properties/${propertyId}`, { next: { revalidate: 3600 } })
    return res.ok ? (res.json() as Promise<PropertyDetail>) : null
  } catch { return null }
}

async function fetchNavItems(propertyId: number): Promise<NavItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/nav-items?propertyId=${propertyId}`, fetchCache)
    return res.ok ? (res.json() as Promise<NavItem[]>) : []
  } catch { return [] }
}

async function resolveDefaultPropertyId(orgId: number): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/properties?orgId=${orgId}`, fetchCache)
    if (!res.ok) return null
    const list = await res.json() as PropertyListResponse
    const defaultProp = list.properties.find(p => p.isDefault) ?? list.properties[0]
    return defaultProp?.propertyId ?? null
  } catch { return null }
}

async function fetchPropertyList(propertyId: number): Promise<PropertyListResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/properties?propertyId=${propertyId}`, fetchCache)
    return res.ok ? (res.json() as Promise<PropertyListResponse>) : null
  } catch { return null }
}

async function fetchEnabledModels(propertyId: number): Promise<SellModel[]> {
  const list = await fetchPropertyList(propertyId)
  return list?.enabledModels ?? ['b2c', 'b2b']
}

async function fetchEnabledModelsByOrg(orgId: number): Promise<SellModel[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/properties?orgId=${orgId}`, fetchCache)
    if (!res.ok) return ['b2c', 'b2b']
    const list = await res.json() as PropertyListResponse
    return list.enabledModels ?? ['b2c', 'b2b']
  } catch { return ['b2c', 'b2b'] }
}

async function resolveTenantConfig(): Promise<{
  config: HotelDesignConfig | null
  hotelConfig: HotelDesignConfig | null
  property: PropertyDetail | null
  navItems: NavItem[]
  isChain: boolean
  enabledModels: SellModel[]
  propertyId: number | null
  orgId: number | null
}> {
  const reqHeaders = headers()
  const tenantHost  = reqHeaders.get('x-tenant-host')
  const tenantHotel = reqHeaders.get('x-tenant-hotel')
  const tenantChain = reqHeaders.get('x-tenant-chain')

  if (tenantHost) {
    const tenant = await resolveTenantHost(tenantHost)
    if (tenant?.type === 'property') {
      const [config, property, navItems, propertyList, enabledModels] = await Promise.all([
        fetchConfig(tenant.propertyId),
        fetchProperty(tenant.propertyId),
        fetchNavItems(tenant.propertyId),
        fetchPropertyList(tenant.propertyId),
        fetchEnabledModels(tenant.propertyId),
      ])
      const orgId = (propertyList?.orgId && (propertyList.properties.length ?? 0) > 1) ? propertyList.orgId : null
      return { config, hotelConfig: config, property, navItems, isChain: false, enabledModels, propertyId: tenant.propertyId, orgId }
    }
    if (tenant?.type === 'org') {
      const hotelSpecificId = tenantHotel ? Number(tenantHotel) : null
      const [orgConfig, pid, enabledModels] = await Promise.all([
        fetchOrgConfig(tenant.orgId),
        hotelSpecificId ? Promise.resolve(hotelSpecificId) : resolveDefaultPropertyId(tenant.orgId),
        fetchEnabledModelsByOrg(tenant.orgId),
      ])
      const [hotelConfig, property] = await Promise.all([
        pid ? fetchConfig(pid) : Promise.resolve(null),
        pid ? fetchProperty(pid) : Promise.resolve(null),
      ])
      return { config: orgConfig, hotelConfig, property, navItems: [], isChain: true, enabledModels, propertyId: pid, orgId: tenant.orgId }
    }
  }

  if (tenantHotel) {
    const pid = Number(tenantHotel)
    if (pid > 0) {
      const [config, property, navItems, propertyList, enabledModels] = await Promise.all([
        fetchConfig(pid),
        fetchProperty(pid),
        fetchNavItems(pid),
        fetchPropertyList(pid),
        fetchEnabledModels(pid),
      ])
      const orgId = (propertyList?.orgId && (propertyList.properties.length ?? 0) > 1) ? propertyList.orgId : null
      return { config, hotelConfig: config, property, navItems, isChain: false, enabledModels, propertyId: pid, orgId }
    }
  }

  if (tenantChain) {
    const orgId = await resolveChain(tenantChain)
    if (orgId) {
      const hotelSpecificId = tenantHotel ? Number(tenantHotel) : null
      const [orgConfig, pid, enabledModels] = await Promise.all([
        fetchOrgConfig(orgId),
        hotelSpecificId ? Promise.resolve(hotelSpecificId) : resolveDefaultPropertyId(orgId),
        fetchEnabledModelsByOrg(orgId),
      ])
      const [hotelConfig, property] = await Promise.all([
        pid ? fetchConfig(pid) : Promise.resolve(null),
        pid ? fetchProperty(pid) : Promise.resolve(null),
      ])
      return { config: orgConfig, hotelConfig, property, navItems: [], isChain: true, enabledModels, propertyId: pid, orgId }
    }
  }

  if (DEFAULT_PROPERTY_ID) {
    const [config, property, navItems, propertyList] = await Promise.all([
      fetchConfig(DEFAULT_PROPERTY_ID),
      fetchProperty(DEFAULT_PROPERTY_ID),
      fetchNavItems(DEFAULT_PROPERTY_ID),
      fetchPropertyList(DEFAULT_PROPERTY_ID),
    ])
    const enabledModels = propertyList?.enabledModels ?? ['b2c', 'b2b']
    if (propertyList?.orgId && (propertyList.mode === 'multi' || propertyList.properties.length > 1)) {
      const orgConfig = await fetchOrgConfig(propertyList.orgId)
      return { config: orgConfig, hotelConfig: config, property, navItems: [], isChain: true, enabledModels, propertyId: DEFAULT_PROPERTY_ID, orgId: propertyList.orgId }
    }
    return { config, hotelConfig: config, property, navItems, isChain: false, enabledModels, propertyId: DEFAULT_PROPERTY_ID, orgId: null }
  }

  return { config: null, hotelConfig: null, property: null, navItems: [], isChain: false, enabledModels: ['b2c', 'b2b'], propertyId: null, orgId: null }
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { config, hotelConfig, property, isChain, orgId } = await resolveTenantConfig()
    const title = isChain
      ? (config?.tabTitle || config?.displayName || 'Hotel Booking')
      : (hotelConfig?.tabTitle || hotelConfig?.displayName || property?.name || 'Hotel Booking')
    const rawFavicon = isChain
      ? (config?.faviconUrl || config?.logoUrl || null)
      : (hotelConfig?.faviconUrl || hotelConfig?.logoUrl || config?.faviconUrl || config?.logoUrl || null)
    // data: URIs can't be fetched by external services (Claude.ai, ChatGPT) — serve via API instead
    const faviconUrl = rawFavicon?.startsWith('data:') && orgId
      ? `/api/v1/config/logo/${orgId}`
      : rawFavicon
    return {
      title,
      description: 'Book your stay directly',
      icons: faviconUrl ? [{ rel: 'icon', url: faviconUrl }] : null,
    }
  } catch {
    return { title: 'Hotel Booking' }
  }
}

async function fetchGroupsEnabled(propertyId: number, orgId?: number | null): Promise<boolean> {
  try {
    const qs = orgId ? `?orgId=${orgId}` : ''
    const res = await fetch(`${API_URL}/api/v1/groups/config/${propertyId}${qs}`, fetchCache)
    if (!res.ok) return false
    const d = await res.json() as { enabled: boolean }
    return d.enabled === true
  } catch { return false }
}

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const { config, hotelConfig, navItems, property, isChain, enabledModels, propertyId, orgId } = await resolveTenantConfig()
  const reqHeaders = headers()
  const isB2BMode = reqHeaders.get('x-b2b-mode') === 'true'
  const b2bSellerSlug = reqHeaders.get('x-b2b-seller-slug') ?? ''

  const headerItems = navItems.filter(n => n.section === 'header')
  const footerItems = navItems.filter(n => n.section === 'footer')
  const displayName = config?.displayName || property?.name || null
  const logoUrl = config?.logoUrl || property?.logo || null
  const cssVars = config ? buildCssVars(config) : ''
  const fontUrl = config?.fontUrl ?? null
  // For locale/currency, use hotelConfig in chain mode — it already merges org defaults
  const localeConfig = (isChain && hotelConfig) ? hotelConfig : config
  const activeLocale = localeConfig?.defaultLocale ?? 'en'
  const enabledLocales = localeConfig?.enabledLocales ?? []
  const allLocales = Array.from(new Set([activeLocale, ...enabledLocales, 'en']))
  const translationMaps = Object.fromEntries(
    await Promise.all(allLocales.map(async loc => [loc, await fetchTranslations(loc)]))
  )

  const coords = property?.location?.coordinates
  const hotelPageId = reqHeaders.get('x-tenant-hotel')
  const mapData = isChain && orgId && !hotelPageId
    ? { mode: 'chain' as const, orgId }
    : propertyId && coords
      ? { mode: 'hotel' as const, propertyId, lat: coords.latitude, lng: coords.longitude, name: property?.name ?? displayName ?? '', address: property?.location?.address ?? '', ...(orgId ? { orgId } : {}) }
      : undefined

  const showGroupsButton = propertyId ? await fetchGroupsEnabled(propertyId, orgId) : false

  const shell = (pageContent: React.ReactNode, b2b = false) => (
    <>
      {cssVars && <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} />}
      {fontUrl && <link rel="stylesheet" href={fontUrl} />}
      <VisitorTracker propertyId={propertyId} channel={b2b ? 'b2b' : 'b2c'} />
      <div className="print:hidden">
        <Header
          logoUrl={logoUrl}
          displayName={displayName}
          navItems={headerItems}
          enabledLocales={localeConfig?.enabledLocales ?? []}
          enabledCurrencies={localeConfig?.enabledCurrencies ?? []}
          defaultLocale={localeConfig?.defaultLocale ?? 'en'}
          defaultCurrency={localeConfig?.defaultCurrency ?? 'USD'}
          isB2BMode={isB2BMode}
          {...(mapData ? { mapData } : {})}
          {...(showGroupsButton ? { showGroupsButton } : {})}
          {...(propertyId ? { propertyId } : {})}
        />
      </div>
      <div className="flex flex-1 flex-col">
        {pageContent}
      </div>
      <div className="print:hidden">
        <Footer navItems={footerItems} displayName={displayName} />
      </div>
    </>
  )

  // B2B mode — gate behind agent auth regardless of model settings
  if (isB2BMode) {
    return (
      <TranslationsProvider defaultLocale={activeLocale} maps={translationMaps}>
        <AiModeProvider><B2BAuthGate sellerSlug={b2bSellerSlug}>{shell(children, true)}</B2BAuthGate></AiModeProvider>
      </TranslationsProvider>
    )
  }

  // B2C blocked — show unavailable page instead of the regular content
  if (!enabledModels.includes('b2c')) {
    return (
      <TranslationsProvider defaultLocale={activeLocale} maps={translationMaps}>
        <AiModeProvider>{shell(
          <div className="flex flex-1 items-center justify-center py-24 px-4 text-center">
            <div className="max-w-sm">
              <p className="text-4xl mb-4">🔒</p>
              <h1 className="text-xl font-semibold text-[var(--color-text)] mb-2">
                Online booking unavailable
              </h1>
              <p className="text-sm text-[var(--color-text-muted)]">
                {displayName ?? 'This hotel'} is not currently accepting online reservations. Please contact us directly to make a booking.
              </p>
            </div>
          </div>
        )}</AiModeProvider>
      </TranslationsProvider>
    )
  }

  return (
    <TranslationsProvider defaultLocale={activeLocale} maps={translationMaps}>
      <AiModeProvider>{shell(children)}</AiModeProvider>
    </TranslationsProvider>
  )
}

async function fetchTranslations(locale: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/translations?locale=${encodeURIComponent(locale)}`, { next: { revalidate: 300 } })
    return res.ok ? (res.json() as Promise<Record<string, string>>) : {}
  } catch { return {} }
}
