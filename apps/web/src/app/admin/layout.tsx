import type { Metadata } from 'next'
import AdminLayoutClient from './_layout-client'

export const metadata: Metadata = {
  title: 'IBE Admin',
  icons: { icon: '/ibe-admin-favicon.png' },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>
}
