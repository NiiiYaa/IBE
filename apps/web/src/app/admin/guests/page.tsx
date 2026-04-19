'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export default function AdminGuestsPage() {
  const [search, setSearch] = useState('')
  const [filterBlocked, setFilterBlocked] = useState<'all' | 'blocked' | 'active'>('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25

  const { data, isLoading } = useQuery({
    queryKey: ['admin-guests', search, filterBlocked, page],
    queryFn: () => {
      const params: Parameters<typeof apiClient.listAdminGuests>[0] = { page, pageSize: PAGE_SIZE }
      if (search) params.search = search
      if (filterBlocked === 'blocked') params.isBlocked = true
      if (filterBlocked === 'active') params.isBlocked = false
      return apiClient.listAdminGuests(params)
    },
    staleTime: 30_000,
  })

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Guests</h1>
        {data && <p className="text-sm text-[var(--color-text-muted)]">{data.total} total</p>}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search name or email…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] w-64"
        />
        <select
          value={filterBlocked}
          onChange={e => { setFilterBlocked(e.target.value as typeof filterBlocked); setPage(1) }}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
        >
          <option value="all">All guests</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
              {['ID', 'Name', 'Email', 'Phone', 'Nationality', 'Status', 'Joined', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {isLoading ? (
              <tr><td colSpan={8} className="py-10 text-center text-[var(--color-text-muted)]">Loading…</td></tr>
            ) : !data?.guests.length ? (
              <tr><td colSpan={8} className="py-10 text-center text-[var(--color-text-muted)]">No guests found.</td></tr>
            ) : data.guests.map(g => (
              <tr key={g.id} className="hover:bg-[var(--color-background)] transition-colors">
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{g.id}</td>
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">{g.firstName} {g.lastName}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{g.email}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{g.phone ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{g.nationality ?? '—'}</td>
                <td className="px-4 py-3">
                  {g.isBlocked ? (
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Blocked</span>
                  ) : (
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{new Date(g.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/guests/${g.id}`} className="text-xs text-[var(--color-primary)] hover:underline">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1 disabled:opacity-40 hover:bg-[var(--color-background)] transition-colors"
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="rounded-md border border-[var(--color-border)] px-3 py-1 disabled:opacity-40 hover:bg-[var(--color-background)] transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
