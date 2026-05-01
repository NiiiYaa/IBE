'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'

interface Feature {
  id: string
  label: string
  subLabel?: string
  description: string
  rate: number | null  // $/room/month, null = bundle
  pct: number | null   // % of fulfilled booking, null = bundle
  children?: Feature[]
}

function leaf(id: string, label: string, rate: number, pct: number, description: string): Feature {
  return { id, label, rate, pct, description }
}

const FEATURES: Feature[] = [
  { id: 'base', label: 'Base', rate: 0.5, pct: 0.5, description: 'The core booking engine — property listings, availability calendar, room display, and the complete reservation flow.' },
  {
    id: 'ai', label: 'AI', rate: null, pct: null,
    description: 'Artificial intelligence features — conversational booking assistant, WhatsApp integration, and MCP server connections to AI platforms.',
    children: [
      leaf('ai_assistant', 'AI Assistant', 0.5, 0.5, 'Conversational AI booking assistant embedded in your IBE — guests can search availability, ask questions, and book in natural language.'),
      leaf('ai_whatsapp', 'AI WhatsApp', 0.5, 0.5, 'AI-powered conversational booking assistant via WhatsApp — guests can search, ask questions, and complete bookings in chat.'),
      leaf('mcps', 'MCPs', 0.5, 0.5, 'Model Context Protocol servers to connect your IBE with AI platforms like ChatGPT, enabling natural language booking.'),
    ],
  },
  {
    id: 'channels', label: 'Sales Channels', rate: null, pct: null,
    description: 'Distribution channels for your IBE — choose which booking flows to activate for your guests and partners.',
    children: [
      leaf('b2c', 'B2C', 0.5, 0.5, 'Direct-to-consumer booking channel. Guests search availability and book directly from your website.'),
      leaf('b2b', 'B2B', 0.5, 0.5, 'Business-to-business channel for travel agents and corporate accounts, with dedicated login and booking flows. Full-Featured Agent Portal.'),
    ],
  },
  leaf('groups', 'Groups', 0.5, 0.5, 'Dedicated group booking flow with RFQ forms, custom pricing, CSV exports, and inquiry management for large reservations.'),
  leaf('mobile_optimized', 'Mobile-optimized', 0.5, 0.5, 'Fully responsive booking experience optimized for mobile devices — guests can search, browse, and complete reservations seamlessly on any screen size.'),
  leaf('dashboard', 'Dashboard & Reports', 0.5, 0.5, 'Analytics dashboard with booking statistics, revenue reports, occupancy rates, and performance insights.'),
  {
    id: 'marketing', label: 'Marketing', rate: null, pct: null,
    description: 'A suite of tools to attract more direct bookings — from promotions and price comparison to retargeting and analytics.',
    children: [
      leaf('promo_codes', 'Promo Codes', 0.5, 0.5, 'Create and manage discount codes for promotions, loyalty programs, and special offers.'),
      leaf('price_comparison', 'Price Comparison', 0.5, 0.5, 'Show guests a live comparison of your direct rate vs. OTA prices (e.g. Booking.com) to highlight the direct booking advantage.'),
      leaf('onsite_conversion', 'Onsite Conversion', 0.5, 0.5, 'Smart pop-ups, banners, and widgets that appear at the right moment to convert website visitors into direct bookers.'),
      leaf('affiliates', 'Affiliates', 0.5, 0.5, 'Referral and affiliate program — track partner-driven traffic and automatically reward affiliates for bookings they generate.'),
      leaf('campaigns', 'Campaigns', 0.5, 0.5, 'Create targeted campaigns to re-engage past guests and attract new ones via email and other channels.'),
      leaf('tracking_analytics', 'Tracking & Analytics', 0.5, 0.5, 'Pixel-based tracking integrations for Google Analytics, Meta Pixel, and other ad platforms to measure campaign ROI.'),
      leaf('influencers', 'Influencers (Social)', 0.5, 0.5, 'Influencer and social media referral tracking — attribute bookings to social campaigns and reward content creators for driven reservations.'),
    ],
  },
  {
    id: 'cross_sell', label: 'Cross Sell', rate: null, pct: null,
    description: 'Increase revenue per booking by offering guests relevant add-ons, upgrades, and third-party experiences.',
    children: [
      leaf('internal', 'Internal', 0.5, 0.5, 'Upsell your own hotel\'s add-ons, room upgrades, and packages to guests during checkout.'),
      leaf('external', 'External (Ticketmaster)', 0.5, 0.5, 'Cross-sell third-party experiences, events, and activities via Ticketmaster integration, creating additional revenue streams.'),
    ],
  },
  leaf('guests', 'Guests Management', 0.5, 0.5, 'Centralized guest profiles with booking history, preferences, and contact details for personalizing every stay.'),
  leaf('guest_agent_area', 'Guest / Agent Area', 0.5, 0.5, 'Dedicated self-service portal for guests and travel agents — view bookings, manage reservations, and access account details.'),
  leaf('domain', 'Domain', 0.5, 0.5, 'Custom domain setup for your booking engine (e.g. book.yourhotel.com) with SSL certificate and DNS management.'),
  leaf('payment_gateway', 'Payment Gateway', 0.5, 0.5, 'Secure payment processing via Stripe and other providers — supporting cards, 3D Secure, and local payment methods.'),
  {
    id: 'communication', label: 'Communication', rate: null, pct: null,
    description: 'Automated guest communication across email, WhatsApp, and SMS throughout the entire booking lifecycle.',
    children: [
      leaf('emails', 'Emails', 0.5, 0.5, 'Automated transactional emails — booking confirmations, pre-arrival reminders, post-stay follow-ups, and cancellation notices.'),
      leaf('whatsapp_comm', 'WhatsApp', 0.5, 0.5, 'Automated WhatsApp messages for booking confirmations, check-in reminders, and real-time guest communication.'),
      leaf('sms', 'SMS', 0.5, 0.5, 'SMS notifications for booking confirmations and important guest updates, as an alternative or complement to email.'),
      leaf('guest_agent_notifications', 'Guest / Agent Notifications', 0.5, 0.5, 'Automated notifications sent to guests and travel agents — booking updates, reminders, and real-time status changes across all channels.'),
    ],
  },
  leaf('maps', 'Maps', 0.5, 0.5, 'Interactive maps showing your property location, nearby attractions, and points of interest to help guests plan their stay.'),
  leaf('weather', 'Weather', 0.5, 0.5, 'Live weather widget displaying the forecast for your property\'s destination, helping guests pack and plan activities.'),
  leaf('reputation', 'Reputation', 0.5, 0.5, 'Guest review collection and display — gather post-stay feedback and showcase ratings to build trust and drive direct bookings.'),
  leaf('multi_currency', 'Multi-currency', 0.5, 0.5, 'Let guests browse and pay in their preferred currency — with live exchange rates and automatic conversion across the booking flow.'),
  {
    id: 'multi_language', label: 'Multi-language', rate: null, pct: null,
    description: 'Serve guests in their native language — full UI translation across the entire booking journey.',
    children: [
      leaf('rtl_ltr', 'RTL ↔ LTR', 0.5, 0.5, 'Automatic right-to-left and left-to-right layout switching for languages such as Arabic, Hebrew, and Persian.'),
    ],
  },
  {
    id: 'design', label: 'Design and Customization', rate: null, pct: null,
    description: 'Full visual control over every page and component of your IBE — match your brand across the entire guest experience.',
    children: [
      leaf('design_journey', 'Booking Journey / Flow', 0.5, 0.5, 'Customize the step-by-step booking flow — layout, colors, messaging, and UX decisions at each stage of the reservation process.'),
      leaf('design_branding', 'Branding', 0.5, 0.5, 'Apply your logo, brand colors, fonts, and imagery consistently across the entire IBE.'),
      leaf('design_chain', 'Chain Page', 0.5, 0.5, 'Design and configure the chain-level landing page that showcases all properties in your portfolio.'),
      leaf('design_hotel', 'Hotel Page', 0.5, 0.5, 'Customize the individual hotel detail page — hero images, descriptions, amenities layout, and room display.'),
      leaf('design_search', 'Search / Offers Page', 0.5, 0.5, 'Control the look and feel of search results and availability listings, including filters, sorting, and offer cards.'),
      leaf('design_footer_header', 'Footer and Header', 0.5, 0.5, 'Customize the site-wide header and footer — navigation links, contact info, social icons, and brand elements.'),
    ],
  },
  leaf('bookings', 'Bookings', 0.5, 0.5, 'Full reservation management — view, search, modify, cancel, and export all bookings from one place.'),
]

function sumRate(features: Feature[]): number {
  return features.reduce((s, f) => s + (f.rate !== null ? f.rate : sumRate(f.children ?? [])), 0)
}

function sumPct(features: Feature[]): number {
  return features.reduce((s, f) => s + (f.pct !== null ? f.pct : sumPct(f.children ?? [])), 0)
}

const TOTAL_PCT = sumPct(FEATURES)

type Engagement = 'monthly' | '1-year' | '3-years' | '5-years'

// ─── Pricing model — all parameters in one place ────────────────────────────
const PRICING_CONFIG = {
  // Per pricing model: fixed base rates (USD) and % of fulfilled bookings.
  // Fixed total per hotel = (basePerHotel + basePerRoom × rooms) × discounts
  // % shown per hotel  = hotelPct × discounts
  // % shown per room   = roomPct  × discounts
  models: {
    fix: {
      basePerHotel: 25,   // USD/hotel/month
      basePerRoom:  1,    // USD/room/month
      hotelPct:     0,
      roomPct:      0,
    },
    percent: {
      basePerHotel: 0,
      basePerRoom:  0,
      hotelPct:     0.02, // 2 % of fulfilled bookings (hotel level)
      roomPct:      0.02, // 2 % of fulfilled bookings (room level)
    },
    hybrid: {
      basePerHotel: 12.5,
      basePerRoom:  0.5,
      hotelPct:     0.01, // 1 %
      roomPct:      0.01, // 1 %
    },
  } as Record<'fix' | 'percent' | 'hybrid', { basePerHotel: number; basePerRoom: number; hotelPct: number; roomPct: number }>,

  // Applied based on avg. room count. "moreThan: N" means rooms > N.
  roomCountTiers: [
    { moreThan: 25,  discount: 0.005 },
    { moreThan: 50,  discount: 0.010 },
    { moreThan: 75,  discount: 0.015 },
    { moreThan: 100, discount: 0.020 },
    { moreThan: 125, discount: 0.025 },
    { moreThan: 150, discount: 0.030 },
    { moreThan: 175, discount: 0.035 },
    { moreThan: 200, discount: 0.040 },
    { moreThan: 225, discount: 0.045 },
    { moreThan: 250, discount: 0.050 },
    { moreThan: 275, discount: 0.055 },
    { moreThan: 300, discount: 0.060 },
    { moreThan: 325, discount: 0.065 },
    { moreThan: 350, discount: 0.070 },
    { moreThan: 375, discount: 0.075 },
    { moreThan: 400, discount: 0.080 },
    { moreThan: 425, discount: 0.085 },
    { moreThan: 450, discount: 0.090 },
    { moreThan: 475, discount: 0.095 },
    { moreThan: 500, discount: 0.100 },
  ],

  // Applied based on hotel count (chain size). "moreThan: N" means count > N.
  hotelCountTiers: [
    { moreThan: 10,  discount: 0.03 },
    { moreThan: 20,  discount: 0.06 },
    { moreThan: 30,  discount: 0.09 },
    { moreThan: 40,  discount: 0.11 },
    { moreThan: 50,  discount: 0.13 },
    { moreThan: 60,  discount: 0.15 },
    { moreThan: 70,  discount: 0.17 },
    { moreThan: 80,  discount: 0.19 },
    { moreThan: 90,  discount: 0.21 },
    { moreThan: 100, discount: 0.23 },
    { moreThan: 110, discount: 0.25 },
    { moreThan: 120, discount: 0.27 },
    { moreThan: 130, discount: 0.28 },
    { moreThan: 140, discount: 0.29 },
    { moreThan: 150, discount: 0.30 },
    { moreThan: 160, discount: 0.31 },
    { moreThan: 170, discount: 0.32 },
    { moreThan: 180, discount: 0.33 },
    { moreThan: 190, discount: 0.34 },
    { moreThan: 200, discount: 0.35 },
  ],
  commitmentDiscounts: {
    'monthly':  0,
    '1-year':   0.10,
    '3-years':  0.20,
    '5-years':  0.30,
  } as Record<Engagement, number>,
}

function getTierDiscount(value: number, tiers: { moreThan: number; discount: number }[]): number {
  let discount = 0
  for (const tier of tiers) {
    if (value > tier.moreThan) discount = tier.discount
    else break
  }
  return discount
}

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£' } as const
type Currency = keyof typeof CURRENCY_SYMBOLS

const HOTEL_CATEGORIES = [
  'City hotels', 'Resort hotels', 'Airport hotels', 'Suburban hotels',
  'Highway hotels', 'Motels', 'Business hotels', 'Boutique hotels',
  'Extended-stay hotels', 'Family hotels', 'Hostels', 'Bed & Breakfasts',
  'Eco hotels', 'Spa & wellness hotels', 'Casino hotels', 'Themed hotels',
  'Capsule hotels', 'Serviced apartments', 'Vacation rentals',
]
const HOTEL_CLASSES = ['Luxury', 'Upscale', 'Midscale', 'Budget']

function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-left text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex justify-between items-center gap-2"
      >
        <span className="truncate min-w-0 flex-1">
          {value.length === 0
            ? <span className="text-gray-400">{placeholder}</span>
            : value.length === 1 ? value[0] : `${value.length} selected`}
        </span>
        <svg className="h-3 w-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-500"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function InfoTooltip({ text }: { text: string }) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  const show = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setCoords({ x: r.left + r.width / 2, y: r.top })
  }

  return (
    <span
      ref={ref}
      className="inline-flex shrink-0 items-center"
      onMouseEnter={show}
      onMouseLeave={() => setCoords(null)}
    >
      <svg className="h-3.5 w-3.5 text-gray-300 hover:text-gray-500 transition-colors cursor-help" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
      {coords && (
        <div
          className="fixed z-50 w-60 bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl pointer-events-none leading-relaxed"
          style={{ left: coords.x, top: coords.y - 10, transform: 'translate(-50%, -100%)' }}
        >
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </span>
  )
}

function GreenCheck() {
  return (
    <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

export function PricingCalculator() {
  const [type, setType] = useState<'independent' | 'chain'>('independent')
  const [hotelCount, setHotelCount] = useState(1)
  const [overTwoHundred, setOverTwoHundred] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [classes, setClasses] = useState<string[]>([])
  const [rooms, setRooms] = useState(50)
  const [engagement, setEngagement] = useState<Engagement>('monthly')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [model, setModel] = useState<'fix' | 'percent' | 'hybrid'>('fix')

  const sym = CURRENCY_SYMBOLS[currency]

  const actualHotelCount = type === 'independent' ? 1 : hotelCount
  const hotelCountDisc   = getTierDiscount(actualHotelCount, PRICING_CONFIG.hotelCountTiers)
  const roomCountDisc    = getTierDiscount(rooms, PRICING_CONFIG.roomCountTiers)
  const commitmentDisc   = PRICING_CONFIG.commitmentDiscounts[engagement]
  const discMult         = (1 - hotelCountDisc) * (1 - roomCountDisc) * (1 - commitmentDisc)

  const mc               = PRICING_CONFIG.models[model]
  const fixedBasePerHotel = (mc.basePerHotel + mc.basePerRoom * rooms) * discMult
  const fixedPerRoom      = fixedBasePerHotel / rooms
  const grandTotal        = fixedBasePerHotel * actualHotelCount

  const pctPerHotel      = mc.hotelPct * discMult
  const pctPerRoom       = mc.roomPct  * discMult

  const hasDiscount      = discMult < 1
  const fullBasePerHotel = mc.basePerHotel + mc.basePerRoom * rooms
  const fullGrandTotal   = fullBasePerHotel * actualHotelCount
  const fullPerRoom      = fullBasePerHotel / rooms
  const fullPctPerHotel  = mc.hotelPct
  const fullPctPerRoom   = mc.roomPct

  const isChain          = actualHotelCount > 1

  const fmt      = (n: number) => `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtRound = (n: number) => `${sym}${Math.round(n).toLocaleString(undefined)}`
  const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`

  const renderFeature = (feature: Feature, depth = 0): React.ReactNode => {
    const isBundle = feature.rate === null

    return (
      <div key={feature.id}>
        <div className={[
          'flex items-center gap-3 py-2.5 px-4 border-b border-gray-100',
          depth > 0 ? 'pl-10 bg-gray-50/50' : '',
        ].join(' ')}>
          <GreenCheck />
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className={['text-sm truncate', isBundle ? 'font-semibold text-gray-900' : depth === 0 ? 'font-semibold text-gray-900' : 'text-gray-700'].join(' ')}>
              {feature.label}
            </span>
            {feature.subLabel && (
              <span className="text-xs text-gray-400 shrink-0">({feature.subLabel})</span>
            )}
            <InfoTooltip text={feature.description} />
          </div>
        </div>
        {isBundle && feature.children?.map(c => renderFeature(c, depth + 1))}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <a href="/hyperguest-landing">
          <Image src="/hg-logo-landing.png" alt="HyperGuest" width={160} height={40} className="h-auto w-auto max-w-[140px]" />
        </a>
        <a href="/admin" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
          Admin Login →
        </a>
      </header>

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-10">
        {/* Hero */}
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-200 mb-5">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            First month free — no credit card required
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            IBE Pricing
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto leading-relaxed">
            We know every customer is different, and we&apos;re here to support each one. Tell us who you are and what you need, and we&apos;ll create a solution that perfectly fits your requirements.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Config panel — left half */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Configuration</p>

            {/* Hotel type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Hotel type</label>
              <div className="grid grid-cols-2 gap-2">
                {(['independent', 'chain'] as const).map(t => (
                  <button key={t} onClick={() => {
                    setType(t)
                    setOverTwoHundred(false)
                    setHotelCount(t === 'independent' ? 1 : 2)
                  }}
                    className={['py-1.5 text-sm rounded-lg border font-medium transition-colors', type === t ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'].join(' ')}
                  >
                    {t === 'independent' ? 'Independent' : 'Chain'}
                  </button>
                ))}
              </div>
            </div>

            {/* Hotel count slider */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Hotel count
                <span className="ml-2 font-semibold text-gray-900">
                  {type === 'independent' ? '1' : overTwoHundred ? '200' : hotelCount}
                </span>
              </label>
              <input
                type="range"
                min={type === 'independent' ? 1 : 2}
                max={200}
                value={type === 'independent' ? 1 : overTwoHundred ? 200 : hotelCount}
                disabled={type === 'independent' || overTwoHundred}
                onChange={e => setHotelCount(parseInt(e.target.value))}
                className={['w-full accent-blue-500', (type === 'independent' || overTwoHundred) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'].join(' ')}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>{type === 'independent' ? '1' : '2'}</span>
                <span>200</span>
              </div>
            </div>

            {/* Room count slider */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                {type === 'chain' ? 'Avg. room count / hotel' : 'Room count'}
                <span className="ml-2 font-semibold text-gray-900">{overTwoHundred ? '500' : rooms}</span>
              </label>
              <input
                type="range"
                min={1}
                max={500}
                value={overTwoHundred ? 500 : rooms}
                disabled={overTwoHundred}
                onChange={e => setRooms(parseInt(e.target.value))}
                className={['w-full accent-blue-500', overTwoHundred ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'].join(' ')}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>1</span>
                <span>500</span>
              </div>
              {type === 'chain' && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overTwoHundred}
                    onChange={e => setOverTwoHundred(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-500"
                  />
                  <span className="text-xs text-gray-600">200+ hotel count / 500+ room count</span>
                </label>
              )}
            </div>

            {/* Category + Class — one row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
                <MultiSelect options={HOTEL_CATEGORIES} value={categories} onChange={setCategories} placeholder="Select…" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Class</label>
                <MultiSelect options={HOTEL_CLASSES} value={classes} onChange={setClasses} placeholder="Select…" />
              </div>
            </div>

            {/* Commitment — 2×2 grid */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Commitment</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['monthly', 'Monthly', null] as const,
                  ['1-year', '1 Year', '10% off'] as const,
                  ['3-years', '3 Years', '20% off'] as const,
                  ['5-years', '5 Years', '30% off'] as const,
                ]).map(([val, label, badge]) => (
                  <button key={val} onClick={() => setEngagement(val)}
                    className={['flex items-center justify-between py-2 px-3 rounded-lg border text-sm transition-colors', engagement === val ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'].join(' ')}>
                    <span>{label}</span>
                    {badge && (
                      <span className={['text-xs px-1.5 py-0.5 rounded font-medium', engagement === val ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'].join(' ')}>
                        {badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Currency */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Currency</label>
              <div className="grid grid-cols-3 gap-2">
                {(['USD', 'EUR', 'GBP'] as const).map(c => (
                  <button key={c} onClick={() => setCurrency(c)}
                    className={['py-1.5 text-sm rounded-lg border font-medium transition-colors', currency === c ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'].join(' ')}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Pricing model — one row */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Pricing model</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['fix', 'Fixed', null],
                  ['percent', '% Bookings', null],
                  ['hybrid', 'Hybrid', 'Fixed + %'],
                ] as const).map(([val, label, note]) => (
                  <button key={val} onClick={() => setModel(val)}
                    className={['text-center py-2 px-2.5 rounded-lg border text-sm font-medium transition-colors leading-tight', model === val ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'].join(' ')}>
                    {label}
                    {note && (
                      <span className={['block text-xs mt-0.5 font-normal text-center', model === val ? 'text-white/60' : 'text-gray-400'].join(' ')}>
                        {note}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right column: summary on top, features below */}
          <div className="space-y-4">
            {/* Price summary — top */}
            {overTwoHundred ? (
              <div className="bg-blue-500 rounded-2xl border border-blue-500 p-6 shadow-sm text-center space-y-3">
                <p className="text-white font-semibold text-lg">200+ hotels? / 500+ rooms? Let&apos;s talk.</p>
                <p className="text-blue-100 text-sm">For large chains we offer custom pricing, dedicated onboarding, and enterprise SLAs.</p>
                <a
                  href="mailto:sales@hyperguest.com"
                  className="inline-block mt-1 bg-white text-blue-600 text-sm font-semibold px-8 py-2.5 rounded-xl hover:bg-blue-50 transition-colors"
                >
                  Contact us
                </a>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 space-y-3">
                    {(model === 'fix' || model === 'hybrid') && (
                      <div>
                        <div className="flex flex-col">
                          {hasDiscount && (
                            <span className="text-sm text-gray-400 line-through mb-0.5">{fmtRound(fullGrandTotal)}/month</span>
                          )}
                          <div className="text-3xl sm:text-4xl font-bold text-gray-900 leading-none">
                            {fmtRound(grandTotal)}
                            <span className="text-base font-normal text-gray-400 ml-1">/month</span>
                          </div>
                        </div>
                        {(commitmentDisc > 0 || hotelCountDisc > 0 || roomCountDisc > 0) && (() => {
                          const volumeDisc = 1 - (1 - hotelCountDisc) * (1 - roomCountDisc)
                          return (
                            <div className="text-sm mt-1 flex flex-wrap gap-2">
                              {commitmentDisc > 0 && (
                                <span className="text-emerald-600 font-semibold">{Math.round(commitmentDisc * 100)}% commitment</span>
                              )}
                              {volumeDisc > 0 && (
                                <span className="text-emerald-600 font-semibold">{(volumeDisc * 100).toFixed(1)}% volume (hotel × rooms)</span>
                              )}
                            </div>
                          )
                        })()}
                        <div className="text-xs text-gray-400 mt-1">
                          {fmt(fixedBasePerHotel)}/hotel × {actualHotelCount} {actualHotelCount === 1 ? 'hotel' : 'hotels'}
                        </div>
                      </div>
                    )}
                    {(model === 'percent' || model === 'hybrid') && (
                      <div className={model === 'hybrid' ? 'pt-3 border-t border-gray-100' : ''}>
                        <div className="flex flex-col">
                          {hasDiscount && (
                            <span className="text-sm text-gray-400 line-through mb-0.5">{fmtPct(fullPctPerHotel)}</span>
                          )}
                          <div className="text-3xl sm:text-4xl font-bold text-blue-600 leading-none">
                            {fmtPct(pctPerHotel)}
                            <span className="text-base font-normal text-gray-400 ml-1">/ fulfilled booking</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button className="bg-blue-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-blue-600 transition-colors">
                      Get started
                    </button>
                    <button className="text-gray-600 text-sm font-medium px-6 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                      Contact sales
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Per hotel / Per room breakdown — hidden for pure % model */}
            {!overTwoHundred && model !== 'percent' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="grid gap-0 border-b border-gray-200 bg-gray-50 px-4 py-2.5"
                  style={{ gridTemplateColumns: `1fr 1fr${model === 'hybrid' ? ' 1fr' : ''}` }}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 text-right">Fixed / mo</span>
                  {model === 'hybrid' && (
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-500 text-right">% / booking</span>
                  )}
                </div>
                {/* Per hotel row */}
                <div className="grid gap-0 px-4 py-3 border-b border-gray-100 items-center"
                  style={{ gridTemplateColumns: `1fr 1fr${model === 'hybrid' ? ' 1fr' : ''}` }}>
                  <span className="text-sm font-medium text-gray-700">{isChain ? 'Avg. per hotel' : 'Per hotel'}</span>
                  <span className="text-sm font-semibold text-gray-900 text-right flex flex-col items-end">
                    {hasDiscount && <span className="text-xs text-gray-400 line-through font-normal">{fmt(fullBasePerHotel)}</span>}
                    {fmt(fixedBasePerHotel)}
                  </span>
                  {model === 'hybrid' && (
                    <span className="text-sm font-semibold text-blue-600 text-right flex flex-col items-end">
                      {hasDiscount && <span className="text-xs text-gray-400 line-through font-normal">{fmtPct(fullPctPerHotel)}</span>}
                      {fmtPct(pctPerHotel)}
                    </span>
                  )}
                </div>
                {/* Per room row */}
                <div className="grid gap-0 px-4 py-3 items-center"
                  style={{ gridTemplateColumns: `1fr 1fr${model === 'hybrid' ? ' 1fr' : ''}` }}>
                  <span className="text-sm font-medium text-gray-700">{isChain ? 'Avg. per room' : 'Per room'}</span>
                  <span className="text-sm font-semibold text-gray-900 text-right flex flex-col items-end">
                    {hasDiscount && <span className="text-xs text-gray-400 line-through font-normal">{fmt(fullPerRoom)}</span>}
                    {fmt(fixedPerRoom)}
                  </span>
                  {model === 'hybrid' && (
                    <span className="text-sm font-semibold text-blue-600 text-right flex flex-col items-end">
                      {hasDiscount && <span className="text-xs text-gray-400 line-through font-normal">{fmtPct(fullPctPerRoom)}</span>}
                      {fmtPct(pctPerRoom)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Feature list — all open, green checks */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="w-4 shrink-0" />
                <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Features</span>
              </div>
              {FEATURES.filter(f => f.id !== 'base').map(f => renderFeature(f))}
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-auto border-t border-gray-100 bg-white px-6 py-8 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} HyperGuest. All rights reserved.
      </footer>
    </div>
  )
}
