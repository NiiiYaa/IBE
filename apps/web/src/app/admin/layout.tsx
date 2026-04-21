import type { Metadata } from 'next'
import AdminLayoutClient from './_layout-client'

export const metadata: Metadata = {
  title: 'HG IBE Admin',
  icons: { icon: '/hg-favicon.png' },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>
}
