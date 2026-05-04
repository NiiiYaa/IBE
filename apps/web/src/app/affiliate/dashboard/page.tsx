'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { apiClient } from '@/lib/api-client'
import { useAffiliateProfile, profileCompletionScore, isProfileOperational } from '@/hooks/use-affiliate-profile'

const PERIOD_OPTIONS = [
  { label: 'Today', value: 1 },
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
]

function fmt(n: number, currency?: string) {
  if (currency) return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  return n.toLocaleString()
}

function shortDate(d: string) {
  const [, m, day] = d.split('-')
  return `${parseInt(m ?? '1')}/${parseInt(day ?? '1')}`
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-[var(--color-text)]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="mb-4 text-sm font-semibold text-[var(--color-text)]">{title}</p>
      {children}
    </div>
  )
}

const STATUS_STYLE: Record<string, string> = {
  Confirmed: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700',
  Pending:   'bg-yellow-100 text-yellow-700',
}
const STATUS_DOT: Record<string, string> = {
  Confirmed: 'bg-green-500',
  Cancelled: 'bg-red-400',
  Pending:   'bg-amber-400',
}

export default function AffiliateDashboardPage() {
  const [days, setDays] = useState(30)
  const [copied, setCopied] = useState<number | null>(null)

  const { data: me } = useQuery({ queryKey: ['affiliate-me'], queryFn: () => apiClient.affiliateMe() })
  const { data: allBookings = [], isPending: bookingsLoading } = useQuery({ queryKey: ['affiliate-bookings'], queryFn: () => apiClient.affiliateBookings() })
  const { data: links = [], isPending: linksLoading } = useQuery({ queryKey: ['affiliate-links'], queryFn: () => apiClient.affiliateLinks() })
  const { data: profile } = useAffiliateProfile()
  const { score, missing } = profileCompletionScore(profile)
  const operational = isProfileOperational(profile)

  // Filter bookings to selected period
  const cutoff = useMemo(() => {
    const d = new Date()
    if (days === 1) { d.setHours(0, 0, 0, 0); return d }
    d.setDate(d.getDate() - days)
    return d
  }, [days])

  const bookings = useMemo(
    () => allBookings.filter(b => new Date(b.createdAt) >= cutoff),
    [allBookings, cutoff],
  )

  // KPIs
  const totalBookings = bookings.length
  const totalRevenue  = bookings.reduce((s, b) => s + b.totalAmount, 0)
  const totalComm     = bookings.reduce((s, b) => s + b.commissionAmount, 0)
  const currency      = bookings[0]?.currency ?? 'EUR'
  const adr           = totalBookings > 0
    ? bookings.reduce((s, b) => {
        const nights = Math.max(1, Math.round((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86_400_000))
        return s + b.totalAmount / nights
      }, 0) / totalBookings
    : null

  // Status breakdown
  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const b of bookings) map[b.status] = (map[b.status] ?? 0) + 1
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [bookings])

  // Per-day series
  const byDay = useMemo(() => {
    const map: Record<string, { date: string; bookings: number; commission: number }> = {}
    const start = new Date(cutoff)
    const today = new Date()
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      map[key] = { date: key, bookings: 0, commission: 0 }
    }
    for (const b of bookings) {
      const key = b.createdAt.slice(0, 10)
      if (map[key]) {
        map[key]!.bookings += 1
        map[key]!.commission += b.commissionAmount
      }
    }
    return Object.values(map)
  }, [bookings, cutoff])

  // Per-hotel breakdown
  const byHotel = useMemo(() => {
    const map: Record<string, { name: string; bookings: number; revenue: number; commission: number }> = {}
    for (const b of bookings) {
      const key = String(b.propertyId)
      if (!map[key]) map[key] = { name: b.propertyName, bookings: 0, revenue: 0, commission: 0 }
      map[key]!.bookings  += 1
      map[key]!.revenue   += b.totalAmount
      map[key]!.commission += b.commissionAmount
    }
    return Object.values(map).sort((a, b) => b.commission - a.commission)
  }, [bookings])

  const activeLinks = links.filter(l => l.status === 'active')

  function copyUrl(id: number, url: string) {
    void navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const periodLabel = days === 1 ? 'today' : `last ${days} days`

  return (
    <div className="space-y-8">
      {/* Header + period picker */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Welcome back{me?.name ? `, ${me.name}` : ''}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">Affiliate performance overview</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-1">
          {PERIOD_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setDays(o.value)}
              className={[
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                days === o.value
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              ].join(' ')}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Onboarding completion banner */}
      {!operational && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                Complete your profile to start promoting hotels
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                {missing.length > 0
                  ? `Still needed: ${missing.join(', ')}`
                  : 'Almost there — accept the terms to unlock hotel joining.'}
              </p>
              {/* Progress bar */}
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full bg-amber-200">
                  <div className="h-1.5 rounded-full bg-amber-500 transition-all" style={{ width: `${score}%` }} />
                </div>
                <span className="text-xs font-medium text-amber-700">{score}%</span>
              </div>
            </div>
            <Link
              href="/affiliate/onboarding"
              className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-600"
            >
              {score === 0 ? 'Get started' : 'Continue'}
            </Link>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Bookings"
          value={bookingsLoading ? '—' : fmt(totalBookings)}
          sub={periodLabel}
        />
        <KpiCard
          label="Revenue"
          value={bookingsLoading ? '—' : fmt(totalRevenue, currency)}
          sub={periodLabel}
        />
        <KpiCard
          label="Commission"
          value={bookingsLoading ? '—' : fmt(totalComm, currency)}
          sub={periodLabel}
        />
        <KpiCard
          label="Avg daily rate"
          value={bookingsLoading ? '—' : (adr != null ? fmt(adr, currency) : '—')}
          sub={`${activeLinks.length} active link${activeLinks.length !== 1 ? 's' : ''}`}
        />
      </div>

      {/* Status pills */}
      {!bookingsLoading && statusCounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {statusCounts.map(([status, count]) => (
            <span key={status} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text)]">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? 'bg-[var(--color-text-muted)]'}`} />
              {status} · {fmt(count)}
            </span>
          ))}
        </div>
      )}

      {/* Charts */}
      {!bookingsLoading && byDay.length > 1 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Bookings per day">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byDay} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip labelFormatter={v => shortDate(String(v))} />
                <Bar dataKey="bookings" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`Commission per day (${currency})`}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={byDay} margin={{ top: 0, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  labelFormatter={v => shortDate(String(v))}
                  formatter={(v: unknown) => [fmt(Number(v), currency), 'Commission']}
                />
                <Line type="monotone" dataKey="commission" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* Per-hotel breakdown */}
      {!bookingsLoading && byHotel.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Performance by Hotel</h2>
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                  {['Hotel', 'Bookings', 'Revenue', 'Commission'].map(h => (
                    <th key={h} className={`px-4 py-3 font-medium text-[var(--color-text-muted)] ${h === 'Hotel' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                {byHotel.map(h => (
                  <tr key={h.name}>
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">{h.name}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{fmt(h.bookings)}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{fmt(h.revenue, currency)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--color-success)]">{fmt(h.commission, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* My links */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">My Affiliate Links</h2>
          <Link href="/affiliate/links" className="text-xs text-[var(--color-primary)] hover:underline">View all</Link>
        </div>
        {linksLoading ? (
          <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--color-border)]" />)}</div>
        ) : activeLinks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">No active links yet.</p>
            <Link href="/affiliate/hotels" className="mt-2 inline-block text-sm font-medium text-[var(--color-primary)] hover:underline">Browse the marketplace →</Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                  {['Hotel', 'Code', 'Commission', 'Link'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                {activeLinks.map(link => (
                  <tr key={link.id}>
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">{link.propertyName ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">{link.code}</td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{link.commissionRate != null ? `${link.commissionRate}%` : '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => copyUrl(link.id, link.url)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                      >
                        {copied === link.id ? (
                          <><svg className="h-3.5 w-3.5 text-[var(--color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied!</>
                        ) : (
                          <><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy link</>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent bookings */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Recent Bookings</h2>
          <Link href="/affiliate/bookings" className="text-xs text-[var(--color-primary)] hover:underline">View all</Link>
        </div>
        {bookingsLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--color-border)]" />)}</div>
        ) : allBookings.slice(0, 5).length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">No bookings yet. Share your links to start earning.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                  {['Ref', 'Hotel', 'Guest', 'Status', 'Dates', 'Commission'].map(h => (
                    <th key={h} className={`px-4 py-3 font-medium text-[var(--color-text-muted)] ${h === 'Commission' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                {allBookings.slice(0, 5).map(b => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">{b.bookingRef}</td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{b.propertyName}</td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{b.guestName}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status] ?? 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[b.status] ?? 'bg-[var(--color-text-muted)]'}`} />
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                      {new Date(b.checkIn).toLocaleDateString()} – {new Date(b.checkOut).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-[var(--color-success)]">{b.currency} {b.commissionAmount.toFixed(2)}</span>
                      <span className="ml-1 text-xs text-[var(--color-text-muted)]">({b.commissionRate}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
