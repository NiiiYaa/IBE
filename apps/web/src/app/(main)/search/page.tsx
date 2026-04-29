/**
 * Search page — server component.
 * Loads the client content with ssr: false so nothing is pre-rendered on the
 * server. This is the only reliable fix for useSearchParams() hydration errors
 * in Next.js App Router when the page component itself is 'use client'.
 */
import dynamic from 'next/dynamic'
import type { HotelDesignConfig } from '@ibe/shared'
import { buildCssVars } from '@/lib/theme'
import { PixelInjector } from '@/components/tracking/PixelInjector'

const DEFAULT_PROPERTY_ID = Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID'] || 0)
const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

async function fetchConfig(propertyId: number): Promise<HotelDesignConfig | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/property/${propertyId}`, { next: { revalidate: 60 } })
    return res.ok ? (res.json() as Promise<HotelDesignConfig>) : null
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

async function fetchOrgId(propertyId: number): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/properties?propertyId=${propertyId}`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    const data = await res.json() as { orgId?: number }
    return data.orgId ?? null
  } catch { return null }
}

const SearchContent = dynamic(
  () => import('./_content').then(m => ({ default: m.SearchContent })),
  {
    ssr: false,
    loading: () => (
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex gap-6 items-start">
          <aside className="hidden w-72 shrink-0 lg:block">
            <div className="h-96 animate-pulse rounded-xl bg-[var(--color-border)]" />
          </aside>
          <div className="min-w-0 flex-1 space-y-4">
            <div className="h-52 animate-pulse rounded-xl bg-[var(--color-border)]" />
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-[var(--color-border)]" />
            ))}
          </div>
        </div>
      </main>
    ),
  },
)

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { hotelId?: string }
}) {
  const propertyId = searchParams.hotelId ? Number(searchParams.hotelId) || DEFAULT_PROPERTY_ID : DEFAULT_PROPERTY_ID
  const [config, aiEnabled, orgId] = await Promise.all([
    fetchConfig(propertyId),
    fetchAIEnabled(propertyId),
    fetchOrgId(propertyId),
  ])
  const cssVars = config ? buildCssVars(config) : ''

  return (
    <>
      {cssVars && <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} />}
      <SearchContent aiEnabled={aiEnabled} searchAiLayoutDefault={config?.searchAiLayoutDefault ?? false} orgId={orgId} />
      <PixelInjector propertyId={propertyId} page="search" />
    </>
  )
}
