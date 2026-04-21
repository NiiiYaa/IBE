'use client'

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '@/lib/api-client'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ManualPage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const { data: info, isLoading } = useQuery({
    queryKey: ['manual-info'],
    queryFn: () => apiClient.getManualInfo(),
  })

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFile) return
    setUploading(true)
    setMsg(null)
    try {
      await apiClient.uploadManual(selectedFile)
      setMsg({ ok: true, text: 'Manual updated successfully.' })
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await queryClient.invalidateQueries({ queryKey: ['manual-info'] })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiClientError ? err.message : 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Admin User Manual</h1>

      {/* Current file */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Current manual</h2>
        {isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
        ) : info?.exists ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-[var(--color-text)]">HG-IBE-Admin-User-Manual.pdf</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {formatSize(info.size)}
                {info.updatedAt && (
                  <> · Last updated {new Date(info.updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</>
                )}
              </p>
            </div>
            <a
              href="/HG-IBE-Admin-User-Manual.pdf"
              download
              className="flex-shrink-0 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)]"
            >
              Download
            </a>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">No manual file found.</p>
        )}
      </section>

      {/* Upload new */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Upload updated manual</h2>
        <form onSubmit={handleUpload} className="space-y-4">
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-border)] px-6 py-8 transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-background)]"
            onClick={() => fileRef.current?.click()}
          >
            <svg className="mb-2 h-8 w-8 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            {selectedFile ? (
              <p className="text-sm font-medium text-[var(--color-text)]">{selectedFile.name}</p>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">Click to select a PDF file</p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {msg && (
            <p className={`text-sm ${msg.ok ? 'text-green-600' : 'text-[var(--color-error)]'}`}>
              {msg.text}
            </p>
          )}

          <button
            type="submit"
            disabled={!selectedFile || uploading}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Upload & replace manual'}
          </button>
        </form>
      </section>
    </div>
  )
}
