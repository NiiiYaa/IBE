'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Image from 'next/image'

interface Feature {
  id: string
  label: string
  subLabel?: string
  rate: number | null  // $/room/month, null = bundle
  pct: number | null   // % of fulfilled booking, null = bundle
  children?: Feature[]
}

function leaf(id: string, label: string, rate: number, pct: number): Feature {
  return { id, label, rate, pct }
}

const FEATURES: Feature[] = [
  { id: 'base', label: 'Base', rate: 0.5, pct: 0.5 },
  {
    id: 'channels', label: 'Channels', rate: null, pct: null,
    children: [
      leaf('b2c', 'B2C', 0.5, 0.5),
      leaf('b2b', 'B2B', 0.5, 0.5),
    ],
  },
  leaf('dashboard', 'Dashboard & Reports', 0.5, 0.5),
  leaf('bookings', 'Bookings', 0.5, 0.5),
  {
    id: 'marketing', label: 'Marketing', rate: null, pct: null,
    children: [
      leaf('promo_codes', 'Promo Codes', 0.5, 0.5),
      leaf('price_comparison', 'Price Comparison', 0.5, 0.5),
      leaf('onsite_conversion', 'Onsite Conversion', 0.5, 0.5),
      leaf('affiliates', 'Affiliates', 0.5, 0.5),
      leaf('campaigns', 'Campaigns', 0.5, 0.5),
      leaf('tracking_analytics', 'Tracking & Analytics', 0.5, 0.5),
    ],
  },
  {
    id: 'cross_sell', label: 'Cross Sell', rate: null, pct: null,
    children: [
      leaf('internal', 'Internal', 0.5, 0.5),
      leaf('external', 'External (Ticketmaster)', 0.5, 0.5),
    ],
  },
  leaf('groups', 'Groups', 0.5, 0.5),
  {
    id: 'ai', label: 'AI', subLabel: 'AI Assistant', rate: null, pct: null,
    children: [
      leaf('ai_whatsapp', 'AI WhatsApp', 0.5, 0.5),
      leaf('mcps', 'MCPs', 0.5, 0.5),
    ],
  },
  leaf('guests', 'Guests Management', 0.5, 0.5),
  leaf('domain', 'Domain', 0.5, 0.5),
  leaf('payment_gateway', 'Payment Gateway', 0.5, 0.5),
  {
    id: 'communication', label: 'Communication', rate: null, pct: null,
    children: [
      leaf('emails', 'Emails', 0.5, 0.5),
      leaf('whatsapp_comm', 'WhatsApp', 0.5, 0.5),
      leaf('sms', 'SMS', 0.5, 0.5),
    ],
  },
  leaf('maps', 'Maps', 0.5, 0.5),
  leaf('weather', 'Weather', 0.5, 0.5),
  leaf('reputation', 'Reputation', 0.5, 0.5),
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

export function PricingCalculator() {
  const [type, setType] = useState<'single' | 'chain'>('single')
  const [chainSize, setChainSize] = useState('2-10')
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
                  : 'bg-gray-900 border-gray-900 text-white hover:bg-gray-700',
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

      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-10">
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

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
          {/* Config panel */}
          <div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Configuration</p>

              {/* Property type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Property type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['single', 'chain'] as const).map(t => (
                    <button key={t} onClick={() => setType(t)}
                      className={['py-1.5 text-sm rounded-lg border font-medium transition-colors', type === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'].join(' ')}
                    >
                      {t === 'single' ? 'Single' : 'Chain'}
                    </button>
                  ))}
                </div>
              </div>

              {type === 'chain' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Chain size</label>
                    <select value={chainSize} onChange={e => setChainSize(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900">
                      {['2-10', '10-30', '30-100', '100-200', '201+'].map(s => (
                        <option key={s} value={s}>{s} properties</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
                    <MultiSelect options={HOTEL_CATEGORIES} value={categories} onChange={setCategories} placeholder="Select categories…" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Class</label>
                    <MultiSelect options={HOTEL_CLASSES} value={classes} onChange={setClasses} placeholder="Select classes…" />
                  </div>
                </>
              )}

              {/* Rooms */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  {type === 'chain' ? 'Avg. rooms / property' : 'Number of rooms'}
                </label>
                <input type="number" min={1} value={rooms}
                  onChange={e => setRooms(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>

              {/* Engagement */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Commitment</label>
                <div className="space-y-1.5">
                  {([
                    ['monthly', 'Monthly', null] as const,
                    ['1-year', '1 Year', '10% off'] as const,
                    ['3-years', '3 Years', '20% off'] as const,
                    ['5-years', '5 Years', '30% off'] as const,
                  ]).map(([val, label, badge]) => (
                    <button key={val} onClick={() => setEngagement(val)}
                      className={['w-full flex items-center justify-between py-2 px-3 rounded-lg border text-sm transition-colors', engagement === val ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'].join(' ')}>
                      {label}
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
                      className={['py-1.5 text-sm rounded-lg border font-medium transition-colors', currency === c ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'].join(' ')}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Pricing model</label>
                <div className="space-y-1.5">
                  {([
                    ['fix', 'Fixed', null],
                    ['percent', '% of Fulfilled Bookings', null],
                    ['hybrid', 'Hybrid', 'Fixed + % of fulfilled bookings'],
                  ] as const).map(([val, label, note]) => (
                    <button key={val} onClick={() => setModel(val)}
                      className={['w-full text-left py-2 px-3 rounded-lg border text-sm transition-colors', model === val ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'].join(' ')}>
                      {label}
                      {note && (
                        <span className={['block text-xs mt-0.5', model === val ? 'text-white/60' : 'text-gray-400'].join(' ')}>
                          {note}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Features + summary */}
          <div className="space-y-4">
            {/* Feature table */}
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

            {/* Price summary */}
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
                          : 'Select features above to calculate'}
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
                          : 'Select features above to calculate'}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button className="bg-gray-900 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-gray-700 transition-colors">
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
          </div>
        </div>
      </div>

      <footer className="mt-auto border-t border-gray-100 bg-white px-6 py-8 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} HyperGuest. All rights reserved.
      </footer>
    </div>
  )
}
