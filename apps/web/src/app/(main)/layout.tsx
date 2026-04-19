import type { HotelDesignConfig, NavItem, PropertyDetail } from '@ibe/shared'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

const DEFAULT_PROPERTY_ID = Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID'])
const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

async function fetchConfig(propertyId: number): Promise<HotelDesignConfig | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/property/${propertyId}`, {
      next: { revalidate: 60 },
    })
    return res.ok ? (res.json() as Promise<HotelDesignConfig>) : null
  } catch {
    return null
  }
}

async function fetchProperty(propertyId: number): Promise<PropertyDetail | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/properties/${propertyId}`, {
      next: { revalidate: 3600 },
    })
    return res.ok ? (res.json() as Promise<PropertyDetail>) : null
  } catch {
    return null
  }
}

async function fetchNavItems(propertyId: number): Promise<NavItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/nav-items?propertyId=${propertyId}`, {
      next: { revalidate: 60 },
    })
    return res.ok ? (res.json() as Promise<NavItem[]>) : []
  } catch {
    return []
  }
}

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const [config, property, navItems] = await Promise.all([
    fetchConfig(DEFAULT_PROPERTY_ID),
    fetchProperty(DEFAULT_PROPERTY_ID),
    fetchNavItems(DEFAULT_PROPERTY_ID),
  ])

  const headerItems = navItems.filter(n => n.section === 'header')
  const footerItems = navItems.filter(n => n.section === 'footer')
  const displayName = config?.displayName || property?.name || null
  const logoUrl = config?.logoUrl || property?.logo || null

  return (
    <>
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
