'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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
    id: 'channels', label: 'Channels', rate: null, pct: null,
    description: 'Distribution channels for your IBE — choose which booking flows to activate for your guests and partners.',
    children: [
      leaf('b2c', 'B2C', 0.5, 0.5, 'Direct-to-consumer booking channel. Guests search availability and book directly from your website.'),
      leaf('b2b', 'B2B', 0.5, 0.5, 'Business-to-business channel for travel agents and corporate accounts, with dedicated login and booking flows.'),
    ],
  },
  leaf('dashboard', 'Dashboard & Reports', 0.5, 0.5, 'Analytics dashboard with booking statistics, revenue reports, occupancy rates, and performance insights.'),
  leaf('bookings', 'Bookings', 0.5, 0.5, 'Full reservation management — view, search, modify, cancel, and export all bookings from one place.'),
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
  leaf('groups', 'Groups', 0.5, 0.5, 'Dedicated group booking flow with RFQ forms, custom pricing, CSV exports, and inquiry management for large reservations.'),
  {
    id: 'ai', label: 'AI', subLabel: 'AI Assistant', rate: null, pct: null,
    description: 'Artificial intelligence features — conversational booking assistant, WhatsApp integration, and MCP server connections to AI platforms.',
    children: [
      leaf('ai_whatsapp', 'AI WhatsApp', 0.5, 0.5, 'AI-powered conversational booking assistant via WhatsApp — guests can search, ask questions, and complete bookings in chat.'),
      leaf('mcps', 'MCPs', 0.5, 0.5, 'Model Context Protocol servers to connect your IBE with AI platforms like ChatGPT, enabling natural language booking.'),
    ],
  },
  leaf('guests', 'Guests Management', 0.5, 0.5, 'Centralized guest profiles with booking history, preferences, and contact details for personalizing every stay.'),
  leaf('domain', 'Domain', 0.5, 0.5, 'Custom domain setup for your booking engine (e.g. book.yourhotel.com) with SSL certificate and DNS management.'),
  leaf('payment_gateway', 'Payment Gateway', 0.5, 0.5, 'Secure payment processing via Stripe and other providers — supporting cards, 3D Secure, and local payment methods.'),
  {
    id: 'communication', label: 'Communication', rate: null, pct: null,
    description: 'Automated guest communication across email, WhatsApp, and SMS throughout the entire booking lifecycle.',
    children: [
      leaf('emails', 'Emails', 0.5, 0.5, 'Automated transactional emails — booking confirmations, pre-arrival reminders, post-stay follow-ups, and cancellation notices.'),
      leaf('whatsapp_comm', 'WhatsApp', 0.5, 0.5, 'Automated WhatsApp messages for booking confirmations, check-in reminders, and real-time guest communication.'),
      leaf('sms', 'SMS', 0.5, 0.5, 'SMS notifications for booking confirmations and important guest updates, as an alternative or complement to email.'),
    ],
  },
  leaf('maps', 'Maps', 0.5, 0.5, 'Interactive maps showing your property location, nearby attractions, and points of interest to help guests plan their stay.'),
  leaf('weather', 'Weather', 0.5, 0.5, 'Live weather widget displaying the forecast for your property\'s destination, helping guests pack and plan activities.'),
  leaf('reputation', 'Reputation', 0.5, 0.5, 'Guest review collection and display — gather post-stay feedback and showcase ratings to build trust and drive direct bookings.'),
]

function getLeafIds(features: Feature[]): string[] {
  return features.flatMap(f => (f.children ? getLeafIds(f.children) : [f.id]))
}

function sumRate(features: Feature[]): number {
  return features.reduce((s, f) => s + (f.rate !== null ? f.rate : sumRate(f.children ?? [])), 0)
}

function sumPct(features: Feature[]): number {
  return features.reduce((s, f) => s + (f.pct !== null ? f.pct : sumPct(f.children ?? [])), 0)
}

function selectedRate(feature: Feature, sel: Set<string>): number {
  if (feature.rate !== null) return sel.has(feature.id) ? feature.rate : 0
  return (feature.children ?? []).reduce((s, c) => s + selectedRate(c, sel), 0)
}

function selectedPct(feature: Feature, sel: Set<string>): number {
  if (feature.pct !== null) return sel.has(feature.id) ? feature.pct : 0
  return (feature.children ?? []).reduce((s, c) => s + selectedPct(c, sel), 0)
}

const ALL_LEAF_IDS = getLeafIds(FEATURES)
const TOTAL_RATE = sumRate(FEATURES)

type Engagement = 'monthly' | '1-year' | '3-years' | '5-years'
const DISCOUNTS: Record<Engagement, number> = {
  'monthly': 0,
  '1-year': 0.1,
  '3-years': 0.2,
  '5-years': 0.3,
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

function IndeterminateCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      onClick={e => e.stopPropagation()}
      className={['h-4 w-4 shrink-0 rounded border-gray-300 accent-gray-900', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'].join(' ')}
    />
  )
}

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
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-left text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 flex justify-between items-center gap-2"
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
                className="h-3.5 w-3.5 rounded border-gray-300 accent-gray-900"
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
      onClick={e => e.stopPropagation()}
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
  const [sel, setSel] = useState<Set<string>>(new Set(['base']))
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(FEATURES.filter(f => f.rate === null).map(f => f.id)),
  )

  const sym = CURRENCY_SYMBOLS[currency]
  const discount = DISCOUNTS[engagement]

  const allChecked = ALL_LEAF_IDS.every(id => sel.has(id))
  const someChecked = ALL_LEAF_IDS.some(id => sel.has(id))

  const toggleLeaf = useCallback((id: string) => {
    if (id === 'base') return
    setSel(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleBundle = useCallback((feature: Feature, currentSel: Set<string>) => {
    const leaves = getLeafIds([feature]).filter(id => id !== 'base')
    const allSel = leaves.every(id => currentSel.has(id))
    setSel(prev => {
      const next = new Set(prev)
      if (allSel) leaves.forEach(id => next.delete(id))
      else leaves.forEach(id => next.add(id))
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (allChecked) setSel(new Set(['base']))
    else setSel(new Set(ALL_LEAF_IDS))
  }, [allChecked])

  const totalSelectedRate = useMemo(
    () => FEATURES.reduce((s, f) => s + selectedRate(f, sel), 0),
    [sel],
  )

  const totalSelectedPct = useMemo(
    () => FEATURES.reduce((s, f) => s + selectedPct(f, sel), 0),
    [sel],
  )

  const monthlyTotal = totalSelectedRate * rooms * (1 - discount)
  const fmt = (n: number) => `${sym}${n.toFixed(2)}`
  const fmtPct = (n: number) => `${n.toFixed(2)}%`

  const renderFeature = (feature: Feature, depth = 0): React.ReactNode => {
    const isBundle = feature.rate === null
    const leaves = getLeafIds([feature])
    const allLeafSel = leaves.every(id => sel.has(id))
    const someLeafSel = leaves.some(id => sel.has(id))
    const isChecked = isBundle ? allLeafSel : sel.has(feature.id)
    const isIndeterminate = isBundle && someLeafSel && !allLeafSel
    const rate = selectedRate(feature, sel)
    const isLocked = feature.id === 'base'
    const isCollapsed = isBundle && collapsed.has(feature.id)

    const handleRowClick = () => {
      if (isBundle) {
        setCollapsed(prev => {
          const next = new Set(prev)
          next.has(feature.id) ? next.delete(feature.id) : next.add(feature.id)
          return next
        })
      } else if (!isLocked) {
        toggleLeaf(feature.id)
      }
    }

    const handleCheckboxChange = () => {
      if (isLocked) return
      if (isBundle) toggleBundle(feature, sel)
      else toggleLeaf(feature.id)
    }

    return (
      <div key={feature.id}>
        <div
          onClick={handleRowClick}
          className={[
            'flex items-center gap-3 py-2.5 px-4 border-b border-gray-100 select-none transition-colors',
            isLocked ? 'cursor-default hover:bg-transparent' : 'cursor-pointer hover:bg-gray-50',
            depth > 0 ? 'pl-10 bg-gray-50/60 hover:bg-gray-100/40' : '',
          ].join(' ')}
        >
          <IndeterminateCheckbox
            checked={isChecked}
            indeterminate={isIndeterminate}
            disabled={isLocked}
            onChange={handleCheckboxChange}
          />
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className={['text-sm truncate', isBundle ? 'font-semibold text-gray-900' : 'text-gray-700'].join(' ')}>
              {feature.label}
            </span>
            {isLocked && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">required</span>
            )}
            {feature.subLabel && (
              <span className="text-xs text-gray-400 shrink-0">({feature.subLabel})</span>
            )}
            {isBundle && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">bundle</span>
            )}
            <InfoTooltip text={feature.description} />
          </div>
          <div className="shrink-0 flex items-center gap-3">
            {(model === 'fix' || model === 'hybrid') && (
              <span className={['text-xs font-medium w-20 text-right', (isChecked || isIndeterminate || (!isBundle && sel.has(feature.id))) ? 'text-gray-700' : 'text-gray-300'].join(' ')}>
                {isBundle
                  ? `${fmt((isChecked || isIndeterminate) ? rate : sumRate(feature.children ?? []))}/room`
                  : `${fmt(feature.rate!)}/room`}
              </span>
            )}
            {(model === 'percent' || model === 'hybrid') && (
              <span className={['text-xs font-medium w-16 text-right', (isChecked || isIndeterminate || (!isBundle && sel.has(feature.id))) ? 'text-blue-600' : 'text-gray-300'].join(' ')}>
                {isBundle
                  ? fmtPct((isChecked || isIndeterminate) ? selectedPct(feature, sel) : sumPct(feature.children ?? []))
                  : fmtPct(feature.pct!)}
              </span>
            )}
            {isBundle ? (
              <span className={[
                'w-16 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors shrink-0',
                isCollapsed
                  ? 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                  : 'bg-blue-500 border-blue-500 text-white hover:bg-blue-600',
              ].join(' ')}>
                <svg
                  className={['h-3 w-3 transition-transform duration-200', isCollapsed ? '' : 'rotate-180'].join(' ')}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
                {isCollapsed ? 'Show' : 'Hide'}
              </span>
            ) : (
              <div className="w-16 shrink-0" />
            )}
          </div>
        </div>
        {isBundle && !isCollapsed && feature.children?.map(c => renderFeature(c, depth + 1))}
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
                <span className="ml-2 font-semibold text-gray-900">{type === 'independent' ? '1' : hotelCount}</span>
              </label>
              <input
                type="range"
                min={type === 'independent' ? 1 : 2}
                max={200}
                value={type === 'independent' ? 1 : hotelCount}
                disabled={type === 'independent'}
                onChange={e => setHotelCount(parseInt(e.target.value))}
                className={['w-full accent-gray-900', type === 'independent' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'].join(' ')}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>{type === 'independent' ? '1' : '2'}</span>
                <span>200</span>
              </div>
              {type === 'chain' && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overTwoHundred}
                    onChange={e => setOverTwoHundred(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-gray-900"
                  />
                  <span className="text-xs text-gray-600">200+ hotels</span>
                </label>
              )}
            </div>

            {/* Rooms — directly below hotel count */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                {type === 'chain' ? 'Avg. room count / hotel' : 'Room count'}
              </label>
              <input type="number" min={1} value={rooms}
                onChange={e => setRooms(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900" />
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
                    className={['text-left py-2 px-2.5 rounded-lg border text-xs font-medium transition-colors leading-tight', model === val ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'].join(' ')}>
                    {label}
                    {note && (
                      <span className={['block text-xs mt-0.5 font-normal', model === val ? 'text-white/60' : 'text-gray-400'].join(' ')}>
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
              <div className="bg-gray-900 rounded-2xl border border-gray-900 p-6 shadow-sm text-center space-y-3">
                <p className="text-white font-semibold text-lg">200+ hotels? Let&apos;s talk.</p>
                <p className="text-gray-400 text-sm">For large chains we offer custom pricing, dedicated onboarding, and enterprise SLAs.</p>
                <a
                  href="mailto:sales@hyperguest.com"
                  className="inline-block mt-1 bg-white text-gray-900 text-sm font-semibold px-8 py-2.5 rounded-xl hover:bg-gray-100 transition-colors"
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
                        <div className="text-3xl sm:text-4xl font-bold text-gray-900 leading-none">
                          {fmt(monthlyTotal)}
                          <span className="text-base font-normal text-gray-400 ml-1">/month</span>
                        </div>
                        {discount > 0 && (
                          <div className="text-sm text-gray-500 mt-1">
                            {fmt(monthlyTotal * 12)}/year
                            <span className="ml-2 text-emerald-600 font-semibold">Save {Math.round(discount * 100)}%</span>
                          </div>
                        )}
                        <div className="text-xs text-gray-400 mt-1">
                          {totalSelectedRate > 0
                            ? `${fmt(totalSelectedRate)}/room × ${rooms} rooms${discount > 0 ? ` × ${Math.round((1 - discount) * 100)}%` : ''}`
                            : 'Select features below to calculate'}
                        </div>
                      </div>
                    )}
                    {(model === 'percent' || model === 'hybrid') && (
                      <div className={model === 'hybrid' ? 'pt-3 border-t border-gray-100' : ''}>
                        <div className="text-3xl sm:text-4xl font-bold text-blue-600 leading-none">
                          {fmtPct(totalSelectedPct)}
                          <span className="text-base font-normal text-gray-400 ml-1">/ fulfilled booking</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {totalSelectedPct > 0
                            ? `${fmtPct(totalSelectedPct)} of each fulfilled booking`
                            : 'Select features below to calculate'}
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
                <p className="mt-4 text-xs text-gray-400 border-t border-gray-100 pt-3">
                  Prices per property. First month is free on all plans.
                  {discount > 0
                    ? ` ${Math.round(discount * 100)}% discount applied for ${engagement} commitment.`
                    : ' Save up to 30% with annual commitments.'}
                </p>
              </div>
            )}

            {/* Feature table — below summary */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Table header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="w-4 shrink-0" />
                <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Feature</span>
                <div className="shrink-0 flex items-center gap-3">
                  {(model === 'fix' || model === 'hybrid') && (
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 w-20 text-right whitespace-nowrap">{sym}/room/mo</span>
                  )}
                  {(model === 'percent' || model === 'hybrid') && (
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-500 w-16 text-right whitespace-nowrap">% / booking</span>
                  )}
                  <div className="w-16 shrink-0" />
                </div>
              </div>

              {/* All bundle row */}
              <div
                onClick={toggleAll}
                className="flex items-center gap-3 py-3 px-4 border-b border-gray-200 cursor-pointer select-none hover:bg-blue-50/40 transition-colors"
              >
                <IndeterminateCheckbox
                  checked={allChecked}
                  indeterminate={someChecked && !allChecked}
                  onChange={toggleAll}
                />
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-gray-900">All (inclusive bundle)</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">bundle</span>
                  <InfoTooltip text="Select all available features at once — the complete IBE package." />
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  {(model === 'fix' || model === 'hybrid') && (
                    <span className={['text-sm font-semibold w-20 text-right', someChecked ? 'text-gray-900' : 'text-gray-300'].join(' ')}>
                      {fmt(someChecked ? totalSelectedRate : TOTAL_RATE)}/room
                    </span>
                  )}
                  {(model === 'percent' || model === 'hybrid') && (
                    <span className={['text-sm font-semibold w-16 text-right', someChecked ? 'text-blue-600' : 'text-gray-300'].join(' ')}>
                      {fmtPct(someChecked ? totalSelectedPct : sumPct(FEATURES))}
                    </span>
                  )}
                  <div className="w-16 shrink-0" />
                </div>
              </div>

              {/* Feature rows */}
              {FEATURES.map(f => renderFeature(f))}
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
