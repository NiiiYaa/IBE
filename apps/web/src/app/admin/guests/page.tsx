'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { AdminGuestRow } from '@ibe/shared'

function EditModal({ guest, onClose }: { guest: AdminGuestRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    firstName: guest.firstName,
    lastName: guest.lastName,
    phone: guest.phone ?? '',
    nationality: guest.nationality ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => apiClient.updateAdminGuest(guest.id, {
      firstName: form.firstName.trim() || undefined,
      lastName: form.lastName.trim() || undefined,
      phone: form.phone.trim() || undefined,
      nationality: form.nationality.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-guests'] })
      queryClient.invalidateQueries({ queryKey: ['admin-guest', String(guest.id)] })
      onClose()
    },
    onError: () => setError('Failed to save. Please try again.'),
  })

  const inputCls = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-[var(--color-text)]">Edit guest</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">First name</label>
              <input className={inputCls} value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Last name</label>
              <input className={inputCls} value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Phone</label>
            <input className={inputCls} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Nationality</label>
            <input className={inputCls} value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} placeholder="Optional" />
          </div>
          {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Cancel</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60 transition-colors"
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BlockModal({ guest, onClose }: { guest: AdminGuestRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () => apiClient.setAdminGuestBlocked(guest.id, true, reason.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-guests'] })
      queryClient.invalidateQueries({ queryKey: ['admin-guest', String(guest.id)] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-[var(--color-text)]">Block {guest.firstName} {guest.lastName}?</h2>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">This guest will be unable to make new bookings.</p>
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Reason (optional)</label>
          <input
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-error)]"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. No-show policy violation"
            onKeyDown={e => { if (e.key === 'Enter') mutation.mutate() }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded-md bg-[var(--color-error)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-colors"
          >
            {mutation.isPending ? 'Blocking…' : 'Block guest'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GuestRow({ g }: { g: AdminGuestRow }) {
  const queryClient = useQueryClient()
  const [showEdit, setShowEdit] = useState(false)
  const [showBlock, setShowBlock] = useState(false)

  const unblockMutation = useMutation({
    mutationFn: () => apiClient.setAdminGuestBlocked(g.id, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-guests'] })
      queryClient.invalidateQueries({ queryKey: ['admin-guest', String(g.id)] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteAdminGuest(g.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-guests'] }),
  })

  function handleDelete() {
    if (confirm(`Anonymise and delete ${g.firstName} ${g.lastName}? Booking history will be retained.`)) {
      deleteMutation.mutate()
    }
  }

  return (
    <>
      {showEdit && <EditModal guest={g} onClose={() => setShowEdit(false)} />}
      {showBlock && <BlockModal guest={g} onClose={() => setShowBlock(false)} />}
      <tr className="hover:bg-[var(--color-background)] transition-colors">
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
          <div className="flex items-center gap-2">
            <Link href={`/admin/guests/${g.id}`} className="text-xs text-[var(--color-primary)] hover:underline">View</Link>
            <button onClick={() => setShowEdit(true)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Edit</button>
            {g.isBlocked ? (
              <button
                onClick={() => unblockMutation.mutate()}
                disabled={unblockMutation.isPending}
                className="text-xs text-green-600 hover:text-green-700 disabled:opacity-40 transition-colors"
              >
                Enable
              </button>
            ) : (
              <button
                onClick={() => setShowBlock(true)}
                className="text-xs text-orange-600 hover:text-orange-700 transition-colors"
              >
                Block
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)] disabled:opacity-40 transition-colors"
            >
              Delete
            </button>
          </div>
        </td>
      </tr>
    </>
  )
}

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

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
              {['ID', 'Name', 'Email', 'Phone', 'Nationality', 'Status', 'Joined', 'Actions'].map(h => (
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
              <GuestRow key={g.id} g={g} />
            ))}
          </tbody>
        </table>
      </div>

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
