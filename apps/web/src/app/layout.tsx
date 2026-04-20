import type { Metadata } from 'next'
import type { HotelDesignConfig } from '@ibe/shared'
import './globals.css'
import { Providers } from './providers'
import { buildCssVars } from '@/lib/theme'

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

// Fallback metadata — overridden per-page by (main)/page.tsx generateMetadata
export async function generateMetadata(): Promise<Metadata> {
  const config = await fetchConfig(DEFAULT_PROPERTY_ID)
  const title = config?.tabTitle || config?.displayName || 'Hotel Booking'
  return {
    title,
    description: 'Book your stay directly',
    icons: config?.faviconUrl ? [{ rel: 'icon', url: config.faviconUrl }] : undefined,
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await fetchConfig(DEFAULT_PROPERTY_ID)
  const cssVars = config ? buildCssVars(config) : ''
  const fontUrl = config?.fontUrl ?? null

  return (
    <html lang={config?.defaultLocale ?? 'en'} dir={config?.textDirection ?? 'ltr'}>
      <head>
        {fontUrl && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={fontUrl} />
          </>
        )}
        {cssVars && (
          <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} />
        )}
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
