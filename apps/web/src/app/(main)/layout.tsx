import type { Metadata } from 'next'
import type { HotelDesignConfig, NavItem, PropertyDetail, PropertyListResponse } from '@ibe/shared'
import { headers } from 'next/headers'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { buildCssVars } from '@/lib/theme'

const DEFAULT_PROPERTY_ID = Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID'])
const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

type TenantResolution =
  | { type: 'property'; propertyId: number; orgId: number }
  | { type: 'org'; orgId: number }

async function resolveTenantHost(host: string): Promise<TenantResolution | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/resolve?host=${encodeURIComponent(host)}`, { next: { revalidate: 60 } })
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

async function fetchNavItems(propertyId: number): Promise<NavItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/nav-items?propertyId=${propertyId}`, { next: { revalidate: 60 } })
    return res.ok ? (res.json() as Promise<NavItem[]>) : []
  } catch { return [] }
}

async function resolveDefaultPropertyId(orgId: number): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/properties?orgId=${orgId}`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    const list = await res.json() as PropertyListResponse
    const defaultProp = list.properties.find(p => p.isDefault) ?? list.properties[0]
    return defaultProp?.propertyId ?? null
  } catch { return null }
}

async function fetchPropertyList(propertyId: number): Promise<PropertyListResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/properties?propertyId=${propertyId}`, { next: { revalidate: 60 } })
    return res.ok ? (res.json() as Promise<PropertyListResponse>) : null
  } catch { return null }
}

async function resolveTenantConfig(): Promise<{
  config: HotelDesignConfig | null
  hotelConfig: HotelDesignConfig | null
  property: PropertyDetail | null
  navItems: NavItem[]
  isChain: boolean
}> {
  const reqHeaders = headers()
  const tenantHost  = reqHeaders.get('x-tenant-host')
  const tenantHotel = reqHeaders.get('x-tenant-hotel')
  const tenantChain = reqHeaders.get('x-tenant-chain')

  if (tenantHost) {
    const tenant = await resolveTenantHost(tenantHost)
    if (tenant?.type === 'property') {
      const [config, property, navItems] = await Promise.all([
        fetchConfig(tenant.propertyId),
        fetchProperty(tenant.propertyId),
        fetchNavItems(tenant.propertyId),
      ])
      return { config, hotelConfig: config, property, navItems, isChain: false }
    }
    if (tenant?.type === 'org') {
      const [orgConfig, pid] = await Promise.all([
        fetchOrgConfig(tenant.orgId),
        resolveDefaultPropertyId(tenant.orgId),
      ])
      const [hotelConfig, property] = await Promise.all([
        pid ? fetchConfig(pid) : Promise.resolve(null),
        pid ? fetchProperty(pid) : Promise.resolve(null),
      ])
      return { config: orgConfig, hotelConfig, property, navItems: [], isChain: true }
    }
  }

  if (tenantHotel) {
    const pid = Number(tenantHotel)
    if (pid > 0) {
      const [config, property, navItems] = await Promise.all([
        fetchConfig(pid),
        fetchProperty(pid),
        fetchNavItems(pid),
      ])
      return { config, hotelConfig: config, property, navItems, isChain: false }
    }
  }

  if (tenantChain) {
    const orgId = await resolveChain(tenantChain)
    if (orgId) {
      const [orgConfig, pid] = await Promise.all([
        fetchOrgConfig(orgId),
        resolveDefaultPropertyId(orgId),
      ])
      const [hotelConfig, property] = await Promise.all([
        pid ? fetchConfig(pid) : Promise.resolve(null),
        pid ? fetchProperty(pid) : Promise.resolve(null),
      ])
      return { config: orgConfig, hotelConfig, property, navItems: [], isChain: true }
    }
  }

  if (DEFAULT_PROPERTY_ID) {
    const [config, property, navItems, propertyList] = await Promise.all([
      fetchConfig(DEFAULT_PROPERTY_ID),
      fetchProperty(DEFAULT_PROPERTY_ID),
      fetchNavItems(DEFAULT_PROPERTY_ID),
      fetchPropertyList(DEFAULT_PROPERTY_ID),
    ])
    if (propertyList?.orgId && (propertyList.mode === 'multi' || propertyList.properties.length > 1)) {
      const orgConfig = await fetchOrgConfig(propertyList.orgId)
      return { config: orgConfig, hotelConfig: config, property, navItems: [], isChain: true }
    }
    return { config, hotelConfig: config, property, navItems, isChain: false }
  }

  return { config: null, hotelConfig: null, property: null, navItems: [], isChain: false }
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { config, hotelConfig, property, isChain } = await resolveTenantConfig()
    const title = isChain
      ? (config?.tabTitle || config?.displayName || 'Hotel Booking')
      : (hotelConfig?.tabTitle || hotelConfig?.displayName || property?.name || 'Hotel Booking')
    const favicon = isChain ? (config?.faviconUrl ?? null) : (hotelConfig?.faviconUrl || config?.faviconUrl)
    return {
      title,
      description: 'Book your stay directly',
      icons: favicon ? [{ rel: 'icon', url: favicon }] : null,
    }
  } catch {
    return { title: 'Hotel Booking' }
  }
}

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const { config, navItems, property } = await resolveTenantConfig()

  const headerItems = navItems.filter(n => n.section === 'header')
  const footerItems = navItems.filter(n => n.section === 'footer')
  const displayName = config?.displayName || property?.name || null
  const logoUrl = config?.logoUrl || property?.logo || null
  const cssVars = config ? buildCssVars(config) : ''
  const fontUrl = config?.fontUrl ?? null

  return (
    <>
      {cssVars && <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} />}
      {fontUrl && <link rel="stylesheet" href={fontUrl} />}
      <Header
        logoUrl={logoUrl}
        displayName={displayName}
        navItems={headerItems}
        enabledLocales={config?.enabledLocales ?? []}
        enabledCurrencies={config?.enabledCurrencies ?? []}
        defaultLocale={config?.defaultLocale ?? 'en'}
        defaultCurrency={config?.defaultCurrency ?? 'USD'}
      />
      <div className="flex flex-1 flex-col">
        {children}
      </div>
      <Footer navItems={footerItems} displayName={displayName} />
    </>
  )
}
