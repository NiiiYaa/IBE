import type { Metadata } from 'next'
import AffiliateLayoutClient from './affiliate-layout-client'

export const metadata: Metadata = {
  title: 'HG Affiliates',
  icons: { icon: '/affiliate-favicon.png' },
}

export default function AffiliateLayout({ children }: { children: React.ReactNode }) {
  return <AffiliateLayoutClient>{children}</AffiliateLayoutClient>
}
