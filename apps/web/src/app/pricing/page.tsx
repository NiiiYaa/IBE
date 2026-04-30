import type { Metadata } from 'next'
import { PricingCalculator } from './PricingCalculator'

export const metadata: Metadata = {
  title: 'Pricing — HyperGuest IBE',
  description: 'Build your custom IBE package. Pay only for the features you use. First month free.',
  icons: { icon: '/hg-favicon.png' },
}

export default function PricingPage() {
  return <PricingCalculator />
}
