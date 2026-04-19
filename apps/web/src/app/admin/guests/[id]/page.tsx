'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="text-sm text-[var(--color-text-muted)] shrink-0 w-36">{label}</span>
      <span className="text-sm text-right text-[var(--color-text)]">{value}</span>
    </div>
  )
}

export default function AdminGuestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [noteText, setNoteText] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [showBlockForm, setShowBlockForm] = useState(false)

  const { data: guest, isLoading } = useQuery({
    queryKey: ['admin-guest', id],
    queryFn: () => apiClient.getAdminGuest(Number(id)),
  })

  const addNoteMutation = useMutation({
    mutationFn: () => apiClient.addAdminGuestNote(Number(id), noteText.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-guest', id] })
      setNoteText('')
    },
  })

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: number) => apiClient.deleteAdminGuestNote(Number(id), noteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-guest', id] }),
  })

  const blockMutation = useMutation({
    mutationFn: ({ isBlocked, reason }: { isBlocked: boolean; reason?: string }) =>
      apiClient.setAdminGuestBlocked(Number(id), isBlocked, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-guest', id] })
      queryClient.invalidateQueries({ queryKey: ['admin-guests'] })
      setShowBlockForm(false)
      setBlockReason('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteAdminGuest(Number(id)),
    onSuccess: () => window.location.href = '/admin/guests',
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    )
  }

  if (!guest) {
    return (
      <div className="p-6 text-center">
        <p className="text-[var(--color-text-muted)]">Guest not found.</p>
        <Link href="/admin/guests" className="mt-2 inline-block text-sm text-[var(--color-primary)] hover:underline">Back to guests</Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/guests" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] flex items-center gap-1">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Guests
        </Link>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          {guest.firstName} {guest.lastName}
        </h1>
        {guest.isBlocked && (
          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Blocked</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Profile */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Profile</h2>
          <Row label="ID" value={guest.id} />
          <Row label="Email" value={guest.email} />
          <Row label="Phone" value={guest.phone} />
          <Row label="Nationality" value={guest.nationality} />
          <Row label="Joined" value={new Date(guest.createdAt).toLocaleDateString()} />
          {guest.isBlocked && <Row label="Block reason" value={guest.blockedReason ?? '—'} />}
        </div>

        {/* Stats */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Stats</h2>
          <Row label="Total bookings" value={guest.stats.bookingCount} />
          <Row label="Total spend" value={guest.stats.totalSpend > 0 ? guest.stats.totalSpend.toFixed(2) : '—'} />
          <Row label="Last stay" value={guest.stats.lastStay ? new Date(guest.stats.lastStay).toLocaleDateString() : '—'} />
        </div>
      </div>

      {/* Notes */}
      <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Notes</h2>

        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note…"
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            onKeyDown={e => { if (e.key === 'Enter' && noteText.trim()) addNoteMutation.mutate() }}
          />
          <button
            onClick={() => noteText.trim() && addNoteMutation.mutate()}
            disabled={addNoteMutation.isPending || !noteText.trim()}
            className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60 transition-colors"
          >
            Add
          </button>
        </div>

        {guest.notes.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No notes yet.</p>
        ) : (
          <div className="space-y-2">
            {guest.notes.map(note => (
              <div key={note.id} className="flex items-start justify-between gap-3 rounded-lg bg-[var(--color-background)] px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--color-text)]">{note.content}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{note.authorName} · {new Date(note.createdAt).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => deleteNoteMutation.mutate(note.id)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors mt-0.5"
                  title="Delete note"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {guest.isBlocked ? (
            <button
              onClick={() => blockMutation.mutate({ isBlocked: false })}
              disabled={blockMutation.isPending}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              Unblock guest
            </button>
          ) : (
            <>
              {!showBlockForm ? (
                <button
                  onClick={() => setShowBlockForm(true)}
                  className="rounded-md border border-[var(--color-error)] px-4 py-2 text-sm font-medium text-[var(--color-error)] hover:bg-red-50 transition-colors"
                >
                  Block guest
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={blockReason}
                    onChange={e => setBlockReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-error)] w-48"
                  />
                  <button
                    onClick={() => blockMutation.mutate({ isBlocked: true, ...(blockReason ? { reason: blockReason } : {}) })}
                    disabled={blockMutation.isPending}
                    className="rounded-md bg-[var(--color-error)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-colors"
                  >
                    Confirm block
                  </button>
                  <button
                    onClick={() => { setShowBlockForm(false); setBlockReason('') }}
                    className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}

          <button
            onClick={() => { if (confirm('Anonymise and delete this guest account? Booking history will be retained.')) deleteMutation.mutate() }}
            disabled={deleteMutation.isPending}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-60 transition-colors"
          >
            Delete account
          </button>
        </div>
      </div>
    </div>
  )
}
