import type { Metadata } from 'next'
import AdminLayoutClient from './_layout-client'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/system-meta`, { next: { revalidate: 60 } })
    if (res.ok) {
      const cfg = await res.json() as { displayName: string | null; tabTitle: string | null; faviconUrl: string | null }
      return {
        title: cfg.tabTitle || cfg.displayName || 'HG IBE Admin',
        icons: cfg.faviconUrl ? { icon: cfg.faviconUrl } : { icon: '/hg-favicon.png' },
      }
    }
  } catch {}
  return { title: 'HG IBE Admin', icons: { icon: '/hg-favicon.png' } }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>
}
