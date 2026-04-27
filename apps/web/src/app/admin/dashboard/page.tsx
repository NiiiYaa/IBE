'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../property-context'
import type { DashboardStats, OrgRecord } from '@ibe/shared'

const AI_CHANNEL_LABELS: Record<string, string> = {
  aiSearchBar: 'AI Search Bar',
  whatsapp: 'WhatsApp',
  mcp: 'MCP',
  b2c: 'B2C',
  b2b: 'B2B',
  direct: 'Legacy',
}

const CHANNEL_COLORS: Record<string, string> = {
  aiSearchBar: '#6366f1',
  whatsapp: '#22c55e',
  mcp: '#f59e0b',
  b2c: '#3b82f6',
  b2b: '#ec4899',
  direct: '#94a3b8',
}

const PERIOD_OPTIONS = [
  { label: 'Today', value: 1 },
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
]

function fmt(n: number, currency?: string) {
  if (currency) return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency as string, maximumFractionDigits: 0 }).format(n)
  return n.toLocaleString()
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-[var(--color-text)]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-[var(--color-text)]">{children}</h2>
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="mb-4 text-sm font-semibold text-[var(--color-text)]">{title}</p>
      {children}
    </div>
  )
}

function shortDate(d: string) {
  const parts = d.split('-')
  return `${parseInt(parts[1] ?? '1')}/${parseInt(parts[2] ?? '1')}`
}

const SECTIONS = [
  { id: 'kpis',      label: 'KPI Cards' },
  { id: 'status',    label: 'Booking Status' },
  { id: 'visitors',  label: 'Visitor Analytics' },
  { id: 'charts',    label: 'Bookings & Revenue' },
  { id: 'ai',        label: 'AI Search Analytics' },
  { id: 'marketing', label: 'Marketing' },
] as const

type SectionId = typeof SECTIONS[number]['id']
const ALL_SECTIONS = new Set<SectionId>(SECTIONS.map(s => s.id))
function lsKey(adminId?: number) {
  return `ibe_dashboard_sections_${adminId ?? 'anon'}`
}

function loadSections(adminId?: number): Set<SectionId> {
  try {
    const raw = localStorage.getItem(lsKey(adminId))
    if (raw) {
      const parsed: SectionId[] = JSON.parse(raw)
      const valid = parsed.filter(id => ALL_SECTIONS.has(id))
      if (valid.length > 0) return new Set(valid)
    }
  } catch { /* ignore */ }
  return new Set(ALL_SECTIONS)
}

function SectionPicker({ visible, onChange }: { visible: Set<SectionId>; onChange: (v: Set<SectionId>) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function toggle(id: SectionId) {
    const next = new Set(visible)
    if (next.has(id)) { if (next.size > 1) next.delete(id) }
    else next.add(id)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Show/hide sections"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors text-lg leading-none"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-52 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2 shadow-xl">
          <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Sections</p>
          {SECTIONS.map(s => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--color-background)] transition-colors">
              <input
                type="checkbox"
                checked={visible.has(s.id)}
                onChange={() => toggle(s.id)}
                className="accent-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-text)]">{s.label}</span>
            </label>
          ))}
          <div className="mx-3 mt-1.5 border-t border-[var(--color-border)] pt-1.5">
            <button
              onClick={() => onChange(new Set(ALL_SECTIONS))}
              className="w-full rounded-md px-2 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-background)] transition-colors text-left"
            >
              Show all
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { admin } = useAdminAuth()
  const { orgId: contextOrgId, propertyId: contextPropertyId } = useAdminProperty()
  const isSuper = admin?.role === 'super'
  const qc = useQueryClient()

  // Super sees data scoped to selected org/property; regular admin scoped by their org (API enforces)
  const orgId = isSuper ? (contextOrgId ?? undefined) : undefined
  const propertyId = contextPropertyId ?? undefined

  const [days, setDays] = useState(1)
  const [visibleSections, setVisibleSections] = useState<Set<SectionId>>(new Set(ALL_SECTIONS))
  // Load from localStorage after mount (avoid SSR mismatch)
  useEffect(() => { setVisibleSections(loadSections(admin?.id)) }, [admin?.id])

  function updateSections(next: Set<SectionId>) {
    setVisibleSections(next)
    localStorage.setItem(lsKey(admin?.id), JSON.stringify([...next]))
  }

  const { data, isLoading, isError } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', orgId, propertyId, days],
    queryFn: () => apiClient.getDashboardStats(orgId, days, propertyId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })

  if (isError) return (
    <div className="flex h-64 items-center justify-center">
      <p className="text-sm text-[var(--color-text-muted)]">Failed to load dashboard.</p>
    </div>
  )

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    )
  }

  const { currency } = data
  const hasSearchData = data.searchesTotal > 0

  const propDetail = qc.getQueryData<{ name?: string | null }>(['property', propertyId])
  const allOrgs = qc.getQueryData<OrgRecord[]>(['super-orgs']) ?? []

  const scopeLabel = propertyId
    ? (() => {
        const name = propDetail?.name
        return name ? `${name} (#${propertyId})` : `Hotel #${propertyId}`
      })()
    : orgId
      ? (() => {
          const o = allOrgs.find(o => o.id === orgId)
          const hgId = o?.hyperGuestOrgId
          return o?.name
            ? `${o.name}${hgId ? ` (#${hgId})` : ''}`
            : `Org #${orgId}`
        })()
      : isSuper
        ? 'All properties'
        : 'Your properties'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmtRev = (v: any) => [fmt(Number(v), currency), 'Revenue']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmtCount = (label: any) => shortDate(String(label))

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Dashboard</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Performance overview · {scopeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
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
          <SectionPicker visible={visibleSections} onChange={updateSections} />
        </div>
      </div>

      {/* KPI cards */}
      {visibleSections.has('kpis') && <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Bookings today"
          value={fmt(data.bookingsToday)}
          sub={`${fmt(data.bookingsTotal)} in ${days}d`}
        />
        <KpiCard
          label="Revenue today"
          value={fmt(data.revenueToday, currency)}
          sub={`${fmt(data.revenueTotal, currency)} in ${days}d`}
        />
        <KpiCard
          label="ADR"
          value={data.adr != null ? fmt(data.adr, currency) : '—'}
          sub={`Avg daily rate · ${days}d`}
        />
        <KpiCard
          label="Visitors"
          value={fmt(data.visitorsTotal)}
          sub={`Last ${days} days`}
        />
        <KpiCard
          label="AI searches"
          value={fmt(data.searchesTotal)}
          sub={`Last ${days} days`}
        />
        <KpiCard
          label="AI conversion"
          value={
            hasSearchData
              ? `${Math.round((data.searchesByChannel.reduce((s, c) => s + c.bookings, 0) / data.searchesTotal) * 1000) / 10}%`
              : '—'
          }
          sub="Searches → bookings"
        />
      </div>}

      {/* Booking status pills */}
      {visibleSections.has('status') && data.bookingsByStatus.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.bookingsByStatus.map(s => (
            <span key={s.status} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text)]">
              <span className={[
                'h-1.5 w-1.5 rounded-full',
                s.status === 'Confirmed' ? 'bg-green-500' :
                s.status === 'Cancelled' ? 'bg-red-400' : 'bg-amber-400',
              ].join(' ')} />
              {s.status} · {fmt(s.count)}
            </span>
          ))}
        </div>
      )}

      {/* Visitors by page + device */}
      {visibleSections.has('visitors') && (data.visitorsByPage.length > 0 || data.visitorsByDevice.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Pages — takes 2/3 width */}
          {data.visitorsByPage.length > 0 && (
            <div className="lg:col-span-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <p className="mb-3 text-sm font-semibold text-[var(--color-text)]">Visitors by page</p>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {data.visitorsByPage.map(p => {
                  const pct = data.visitorsTotal > 0 ? Math.round((p.visitors / data.visitorsTotal) * 100) : 0
                  return (
                    <div key={p.page}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="font-medium text-[var(--color-text)] capitalize">{p.page.replace(/-/g, ' ')}</span>
                        <span className="text-[var(--color-text-muted)]">{fmt(p.visitors)} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[var(--color-border)]">
                        <div className="h-1.5 rounded-full bg-[var(--color-primary)] opacity-70" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Device breakdown — takes 1/3 width */}
          {data.visitorsByDevice.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <p className="mb-3 text-sm font-semibold text-[var(--color-text)]">Visitors by device</p>
              <div className="space-y-3">
                {data.visitorsByDevice.map(d => {
                  const pct = data.visitorsTotal > 0 ? Math.round((d.visitors / data.visitorsTotal) * 100) : 0
                  const icon = d.device === 'mobile' ? '📱' : d.device === 'tablet' ? '📲' : '🖥️'
                  return (
                    <div key={d.device}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="font-medium text-[var(--color-text)] capitalize">{icon} {d.device}</span>
                        <span className="text-[var(--color-text-muted)]">{fmt(d.visitors)} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[var(--color-border)]">
                        <div className="h-1.5 rounded-full bg-[var(--color-primary)] opacity-70" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bookings + Revenue charts */}
      {visibleSections.has('charts') && <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Bookings per day">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.byDay} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip labelFormatter={fmtCount} />
              <Bar dataKey="bookings" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={`Revenue per day (${currency})`}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.byDay} margin={{ top: 0, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={fmtRev} labelFormatter={fmtCount} />
              <Line type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>}

      {/* AI Search section */}
      {visibleSections.has('ai') && <div>
        <SectionTitle>AI Search Analytics</SectionTitle>
        {!hasSearchData ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            No AI search sessions in the selected period. Sessions will appear here once guests use the AI search bar, WhatsApp, or MCP.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {/* Searches per day by channel */}
            <ChartCard title="AI searches per day">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.byDay} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip labelFormatter={fmtCount} />
                  <Bar dataKey="searches" fill="#6366f1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Channel breakdown */}
            <ChartCard title="Searches by channel">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={data.searchesByChannel.map(c => ({ ...c, name: AI_CHANNEL_LABELS[c.channel] ?? c.channel }))}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 60, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                  <Tooltip />
                  <Bar dataKey="searches" radius={[0, 3, 3, 0]}>
                    {data.searchesByChannel.map((c, i) => (
                      <rect key={i} fill={CHANNEL_COLORS[c.channel] ?? '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}
      </div>}

      {/* Conversion by channel + Nationalities */}
      {visibleSections.has('ai') && hasSearchData && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Conversion table */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <p className="mb-3 text-sm font-semibold text-[var(--color-text)]">Conversion by channel</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {['Channel', 'Searches', 'Bookings', 'Rate'].map(h => (
                    <th key={h} className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.searchesByChannel.map(c => (
                  <tr key={c.channel}>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLORS[c.channel] ?? '#94a3b8' }} />
                        {AI_CHANNEL_LABELS[c.channel] ?? c.channel}
                      </span>
                    </td>
                    <td className="py-2 text-[var(--color-text-muted)]">{fmt(c.searches)}</td>
                    <td className="py-2 text-[var(--color-text-muted)]">{fmt(c.bookings)}</td>
                    <td className="py-2 font-semibold text-[var(--color-text)]">{c.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top nationalities */}
          {data.topNationalities.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <p className="mb-3 text-sm font-semibold text-[var(--color-text)]">Top nationalities (AI searches)</p>
              <div className="space-y-2">
                {data.topNationalities.map((n, i) => {
                  const pct = Math.round((n.count / data.searchesTotal) * 100)
                  return (
                    <div key={n.nationality}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="font-medium text-[var(--color-text)]">{n.nationality}</span>
                        <span className="text-[var(--color-text-muted)]">{fmt(n.count)} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[var(--color-border)]">
                        <div
                          className="h-1.5 rounded-full bg-[var(--color-primary)] opacity-80"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Marketing ────────────────────────────────────────────────────── */}
      {visibleSections.has('marketing') && (data.affiliateBookings > 0 || data.campaignBookings > 0 || data.promoBookings > 0) && (
        <div className="space-y-4">
          <SectionTitle>Marketing</SectionTitle>

          <div className="grid gap-4 lg:grid-cols-3">

            {/* Affiliates */}
            {data.affiliateBookings > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="mb-1 text-sm font-semibold text-[var(--color-text)]">Affiliates</p>
                <p className="mb-3 text-xs text-[var(--color-text-muted)]">
                  {fmt(data.affiliateBookings)} bookings · {fmt(data.affiliateRevenue, currency)} revenue · {fmt(data.affiliateCommission, currency)} commission
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {['Affiliate', 'Bookings', 'Revenue', 'Commission'].map(h => (
                        <th key={h} className="pb-1.5 text-left font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {data.topAffiliates.map(a => (
                      <tr key={a.name}>
                        <td className="py-1.5 font-medium text-[var(--color-text)]">{a.name}</td>
                        <td className="py-1.5 text-[var(--color-text-muted)]">{fmt(a.bookings)}</td>
                        <td className="py-1.5 text-[var(--color-text-muted)]">{fmt(a.revenue, currency)}</td>
                        <td className="py-1.5 text-[var(--color-text-muted)]">{fmt(a.commission, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Campaigns */}
            {data.campaignBookings > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="mb-1 text-sm font-semibold text-[var(--color-text)]">Campaigns</p>
                <p className="mb-3 text-xs text-[var(--color-text-muted)]">
                  {fmt(data.campaignBookings)} bookings · {fmt(data.campaignRevenue, currency)} revenue · {fmt(data.campaignCommission, currency)} commission
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {['Campaign', 'Bookings', 'Revenue', 'Commission'].map(h => (
                        <th key={h} className="pb-1.5 text-left font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {data.topCampaigns.map(c => (
                      <tr key={c.code}>
                        <td className="py-1.5 font-medium text-[var(--color-text)]">{c.code}</td>
                        <td className="py-1.5 text-[var(--color-text-muted)]">{fmt(c.bookings)}</td>
                        <td className="py-1.5 text-[var(--color-text-muted)]">{fmt(c.revenue, currency)}</td>
                        <td className="py-1.5 text-[var(--color-text-muted)]">{fmt(c.commission, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Promo codes */}
            {data.promoBookings > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="mb-1 text-sm font-semibold text-[var(--color-text)]">Promo Codes</p>
                <p className="mb-3 text-xs text-[var(--color-text-muted)]">
                  {fmt(data.promoBookings)} bookings · {fmt(data.promoDiscountTotal, currency)} total discount given
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {['Code', 'Uses', 'Discount given'].map(h => (
                        <th key={h} className="pb-1.5 text-left font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {data.topPromoCodes.map(p => (
                      <tr key={p.code}>
                        <td className="py-1.5 font-mono font-medium text-[var(--color-text)]">{p.code}</td>
                        <td className="py-1.5 text-[var(--color-text-muted)]">{fmt(p.uses)}</td>
                        <td className="py-1.5 text-[var(--color-text-muted)]">{fmt(p.discountTotal, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
