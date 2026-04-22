'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { AdminBookingRow } from '@ibe/shared'

// ── Column definitions ────────────────────────────────────────────────────────

interface ColDef {
  id: string
  label: string
  defaultVisible: boolean
  render: (r: AdminBookingRow) => React.ReactNode
}

const COLUMNS: ColDef[] = [
  { id: 'id',                   label: 'IBE ID',                defaultVisible: true,  render: r => r.id },
  { id: 'hyperGuestBookingId',  label: 'HG ID',                 defaultVisible: true,  render: r => r.hyperGuestBookingId },
  { id: 'status',               label: 'Status',                defaultVisible: true,  render: r => <StatusBadge status={r.status} /> },
  { id: 'organizationId',       label: 'Account ID',            defaultVisible: false, render: r => r.organizationId ?? '—' },
  { id: 'propertyId',           label: 'Hotel ID',              defaultVisible: true,  render: r => r.propertyId },
  { id: 'hotelName',            label: 'Hotel Name',            defaultVisible: true,  render: r => r.hotelName ?? '—' },
  { id: 'hotelAddress',         label: 'Hotel Address',         defaultVisible: false, render: r => r.hotelAddress ?? '—' },
  { id: 'bookingDate',          label: 'Booking Date',          defaultVisible: true,  render: r => fmtDate(r.bookingDate) },
  { id: 'cancellationDeadline', label: 'Cancellation Deadline', defaultVisible: false, render: r => r.cancellationDeadline ? fmtDate(r.cancellationDeadline) : '—' },
  { id: 'checkIn',              label: 'Check-in',              defaultVisible: true,  render: r => r.checkIn },
  { id: 'checkOut',             label: 'Check-out',             defaultVisible: true,  render: r => r.checkOut },
  { id: 'nights',               label: 'Nights',                defaultVisible: true,  render: r => r.nights },
  { id: 'cancellationDate',     label: 'Cancellation Date',     defaultVisible: false, render: r => r.cancellationDate ? fmtDate(r.cancellationDate) : '—' },
  { id: 'guestName',            label: 'Guest Name',            defaultVisible: true,  render: r => <PiiCell value={r.guestName} /> },
  { id: 'guestEmail',           label: 'Guest Email',           defaultVisible: false, render: r => <PiiCell value={r.guestEmail} /> },
  { id: 'currency',             label: 'Currency',              defaultVisible: true,  render: r => r.currency },
  { id: 'originalPrice',        label: 'Original Price',        defaultVisible: false, render: r => r.originalPrice != null ? fmtMoney(r.originalPrice, r.currency) : '—' },
  { id: 'discountedPrice',      label: 'Discounted Price',      defaultVisible: true,  render: r => fmtMoney(r.discountedPrice, r.currency) },
  { id: 'promoCode',            label: 'Promo',                 defaultVisible: false, render: r => r.promoCode ?? '—' },
  { id: 'promoDiscountPct',     label: 'Promo Discount %',      defaultVisible: false, render: r => r.promoDiscountPct != null ? `${r.promoDiscountPct}%` : '—' },
  { id: 'affiliateCode',        label: 'Affiliate',             defaultVisible: false, render: r => r.affiliateName ?? r.affiliateCode ?? '—' },
  { id: 'affiliateDiscountPct', label: 'Affiliate Discount %',  defaultVisible: false, render: r => r.affiliateDiscountPct != null ? `${r.affiliateDiscountPct}%` : '—' },
  { id: 'commissionPct',        label: 'Commission %',          defaultVisible: false, render: r => r.commissionPct != null ? `${r.commissionPct}%` : '—' },
  { id: 'commissionValue',      label: 'Commission Value',      defaultVisible: false, render: r => r.commissionValue != null ? fmtMoney(r.commissionValue, r.currency) : '—' },
  { id: 'paymentMethod',        label: 'Payment Method',        defaultVisible: false, render: r => r.paymentMethod },
  { id: 'roomCount',            label: 'Rooms',                 defaultVisible: false, render: r => r.roomCount },
  { id: 'agencyReference',      label: 'Agency Ref.',           defaultVisible: false, render: r => r.agencyReference ?? '—' },
  { id: 'isTest',               label: 'Test',                  defaultVisible: false, render: r => r.isTest ? <span className="rounded bg-yellow-100 px-1 text-xs text-yellow-700">Test</span> : '—' },
]

const DEFAULT_VISIBLE = new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.id))

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount)
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  pending:   'bg-yellow-100 text-yellow-700',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${cls}`}>{status}</span>
}

function PiiCell({ value }: { value: string }) {
  const isMasked = value.includes('**')
  if (!isMasked) return <span>{value}</span>
  return (
    <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
      {value}
      <svg className="h-3 w-3 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Masked — admin access required">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </span>
  )
}

// ── Column picker ─────────────────────────────────────────────────────────────

function ColumnPicker({ visible, onChange }: { visible: Set<string>; onChange: (v: Set<string>) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-primary)]"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Visible columns</p>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {COLUMNS.map(col => (
              <label key={col.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-[var(--color-background)]">
                <input
                  type="checkbox"
                  checked={visible.has(col.id)}
                  onChange={e => {
                    const next = new Set(visible)
                    e.target.checked ? next.add(col.id) : next.delete(col.id)
                    onChange(next)
                  }}
                  className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                />
                <span className="text-sm text-[var(--color-text)]">{col.label}</span>
              </label>
            ))}
          </div>
          <button
            onClick={() => onChange(DEFAULT_VISIBLE)}
            className="mt-2 w-full rounded py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          >
            Reset to default
          </button>
        </div>
      )}
    </div>
  )
}

// ── Date pivot filter ─────────────────────────────────────────────────────────

const DATE_PIVOTS = [
  { value: 'bookingDate',          label: 'Booking Date' },
  { value: 'checkIn',              label: 'Check-in' },
  { value: 'checkOut',             label: 'Check-out' },
  { value: 'cancellationDeadline', label: 'Cancellation Deadline' },
  { value: 'cancellationDate',     label: 'Cancellation Date' },
] as const

// ── Filters ───────────────────────────────────────────────────────────────────

interface Filters {
  search: string
  status: string
  datePivot: string
  dateFrom: string
  dateTo: string
  hasAffiliate: string
  hasPromo: string
  isTest: string
}

export const EMPTY_FILTERS: Filters = {
  search: '', status: '', datePivot: 'bookingDate', dateFrom: '', dateTo: '',
  hasAffiliate: '', hasPromo: '', isTest: '',
}

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = (key: keyof Filters, val: string) => onChange({ ...filters, [key]: val })
  return (
    <div className="flex flex-wrap items-end gap-2">
      <input
        type="search"
        placeholder="Search guest name / email / ref…"
        value={filters.search}
        onChange={e => set('search', e.target.value)}
        className="h-9 w-60 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
      />

      <select value={filters.status} onChange={e => set('status', e.target.value)}
        className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none">
        <option value="">All statuses</option>
        <option value="confirmed">Confirmed</option>
        <option value="cancelled">Cancelled</option>
        <option value="pending">Pending</option>
      </select>

      {/* Date filter box */}
      <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1">
        <select
          value={filters.datePivot}
          onChange={e => set('datePivot', e.target.value)}
          className="h-7 border-0 bg-transparent text-xs font-medium text-[var(--color-primary)] focus:outline-none"
        >
          {DATE_PIVOTS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <span className="text-xs text-[var(--color-text-muted)]">from</span>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => set('dateFrom', e.target.value)}
          className="h-7 border-0 bg-transparent text-sm text-[var(--color-text)] focus:outline-none"
        />
        <span className="text-xs text-[var(--color-text-muted)]">to</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => set('dateTo', e.target.value)}
          className="h-7 border-0 bg-transparent text-sm text-[var(--color-text)] focus:outline-none"
        />
        {(filters.dateFrom || filters.dateTo) && (
          <button
            onClick={() => onChange({ ...filters, dateFrom: '', dateTo: '' })}
            className="ml-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
            aria-label="Clear dates"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <select value={filters.hasAffiliate} onChange={e => set('hasAffiliate', e.target.value)}
        className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none">
        <option value="">Affiliate: all</option>
        <option value="true">Has affiliate</option>
        <option value="false">No affiliate</option>
      </select>

      <select value={filters.hasPromo} onChange={e => set('hasPromo', e.target.value)}
        className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none">
        <option value="">Promo: all</option>
        <option value="true">Has promo</option>
        <option value="false">No promo</option>
      </select>

      <select value={filters.isTest} onChange={e => set('isTest', e.target.value)}
        className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none">
        <option value="false">Live</option>
        <option value="true">Test</option>
        <option value="">All</option>
      </select>

      <button
        onClick={() => onChange(EMPTY_FILTERS)}
        className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      >
        Clear
      </button>
    </div>
  )
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(bookings: AdminBookingRow[], visibleCols: Set<string>) {
  const cols = COLUMNS.filter(c => visibleCols.has(c.id))
  const header = cols.map(c => `"${c.label}"`).join(',')
  const rows = bookings.map(row =>
    cols.map(c => {
      const val = c.render(row)
      const str = typeof val === 'string' || typeof val === 'number' ? String(val) : ''
      return `"${str.replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main component ────────────────────────────────────────────────────────────

interface BookingsViewProps {
  title: string
  preset?: string
  initialFilters?: Partial<Filters>
}

export function BookingsView({ title, preset, initialFilters }: BookingsViewProps) {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, ...initialFilters })
  const [visibleCols, setVisibleCols] = useState<Set<string>>(DEFAULT_VISIBLE)

  const handleFiltersChange = useCallback((f: Filters) => {
    setFilters(f)
    setPage(1)
  }, [])

  const queryParams = useMemo(() => ({
    page,
    ...(preset ? { preset } : {}),
    ...(!preset && filters.status ? { status: filters.status } : {}),
    ...(!preset && filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
    ...(!preset && filters.dateTo ? { dateTo: filters.dateTo } : {}),
    ...(!preset && filters.datePivot !== 'bookingDate' ? { datePivot: filters.datePivot } : {}),
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.hasAffiliate ? { hasAffiliate: filters.hasAffiliate === 'true' } : {}),
    ...(filters.hasPromo ? { hasPromo: filters.hasPromo === 'true' } : {}),
    ...(filters.isTest ? { isTest: filters.isTest === 'true' } : {}),
  }), [page, preset, filters])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-bookings', queryParams],
    queryFn: () => apiClient.getAdminBookings(queryParams),
    staleTime: 30_000,
  })

  const visibleColumns = useMemo(() => COLUMNS.filter(c => visibleCols.has(c.id)), [visibleCols])
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{title}</h1>
          {data && (
            <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
              {data.total} booking{data.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ColumnPicker visible={visibleCols} onChange={setVisibleCols} />
          {data && data.bookings.length > 0 && (
            <button
              onClick={() => exportCsv(data.bookings, visibleCols)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-primary)]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <FilterBar filters={filters} onChange={handleFiltersChange} />
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load bookings.
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-[var(--color-text-muted)]">
          <svg className="mr-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading…
        </div>
      )}

      {!isLoading && data && data.bookings.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] py-16 text-center text-[var(--color-text-muted)]">
          No bookings found.
        </div>
      )}

      {!isLoading && data && data.bookings.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  {visibleColumns.map(col => (
                    <th key={col.id} className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.bookings.map(row => (
                  <tr key={row.id} className="hover:bg-[var(--color-surface)]">
                    {visibleColumns.map(col => (
                      <td key={col.id} className="whitespace-nowrap px-3 py-2.5 text-[var(--color-text)]">
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-[var(--color-text-muted)]">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-40 hover:border-[var(--color-primary)]">
                  Previous
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-40 hover:border-[var(--color-primary)]">
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
