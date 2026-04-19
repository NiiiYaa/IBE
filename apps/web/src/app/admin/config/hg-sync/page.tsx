'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'

const DEFAULT_PROPERTY_ID = Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID'])

type Status = 'idle' | 'confirming' | 'syncing' | 'done' | 'error'

export default function HgSyncPage() {
  const [status, setStatus] = useState<Status>('idle')
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function runSync() {
    setStatus('syncing')
    setErrorMsg(null)
    try {
      const result = await apiClient.syncProperty(DEFAULT_PROPERTY_ID)
      setSyncedAt(result.syncedAt)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sync failed')
      setStatus('error')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-2 text-xl font-semibold text-[var(--color-text)]">HG Sync</h1>
      <p className="mb-8 text-sm text-[var(--color-text-muted)]">
        Fetches the latest property data (images, rooms, descriptions, facilities) from HyperGuest
        and refreshes the local cache. This does not affect booking availability.
      </p>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        {status === 'idle' && (
          <div className="flex flex-col items-start gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary-light)]">
                <svg className="h-5 w-5 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-[var(--color-text)]">Sync from HyperGuest</p>
                <p className="text-xs text-[var(--color-text-muted)]">Property {DEFAULT_PROPERTY_ID}</p>
              </div>
            </div>
            <button
              onClick={() => setStatus('confirming')}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              Sync now
            </button>
          </div>
        )}

        {status === 'confirming' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <p className="font-medium text-amber-800">Are you sure you want to sync?</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  This will discard the cached data and pull fresh content from HyperGuest. It may take a few seconds.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={runSync}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
              >
                Yes, sync now
              </button>
              <button
                onClick={() => setStatus('idle')}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {status === 'syncing' && (
          <div className="flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            Syncing with HyperGuest…
          </div>
        )}

        {status === 'done' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <p className="font-medium text-green-800">Sync complete</p>
                {syncedAt && (
                  <p className="mt-0.5 text-xs text-green-700">
                    Last synced: {new Date(syncedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setStatus('idle')}
              className="w-fit rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)]"
            >
              Sync again
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-error)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <div>
                <p className="font-medium text-red-800">Sync failed</p>
                {errorMsg && <p className="mt-0.5 text-xs text-red-700">{errorMsg}</p>}
              </div>
            </div>
            <button
              onClick={() => setStatus('idle')}
              className="w-fit rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)]"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
