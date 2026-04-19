/**
 * Booking page — server component.
 * Client content loaded with ssr: false to prevent hydration errors.
 */
import dynamic from 'next/dynamic'
import type { HotelDesignConfig } from '@ibe/shared'
import { buildCssVars } from '@/lib/theme'
import { Header } from '@/components/layout/Header'

const DEFAULT_PROPERTY_ID = Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID'] || 0)
const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

async function fetchConfig(propertyId: number): Promise<HotelDesignConfig | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/property/${propertyId}`, { next: { revalidate: 60 } })
    return res.ok ? (res.json() as Promise<HotelDesignConfig>) : null
  } catch { return null }
}

const BookingContent = dynamic(
  () => import('./_content').then(m => ({ default: m.BookingContent })),
  {
    ssr: false,
    loading: () => (
      <>
        <Header />
        <main className="mx-auto max-w-4xl px-4 py-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--color-border)]" />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-xl bg-[var(--color-border)]" />
          </div>
        </main>
      </>
    ),
  },
)

export default async function BookingPage({
  searchParams,
}: {
  searchParams: { hotelId?: string }
}) {
  const propertyId = searchParams.hotelId ? Number(searchParams.hotelId) || DEFAULT_PROPERTY_ID : DEFAULT_PROPERTY_ID
  const config = await fetchConfig(propertyId)
  const cssVars = config ? buildCssVars(config) : ''

  return (
    <>
      {cssVars && <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} />}
      <BookingContent />
    </>
  )
}
