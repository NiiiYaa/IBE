'use client'

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '@/lib/api-client'

type GenerateEvent =
  | { type: 'section:start'; title: string }
  | { type: 'section:done'; title: string }
  | { type: 'error'; title: string; message: string }
  | { type: 'complete' }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ManualPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [sections, setSections] = useState<{ title: string; done: boolean; error?: string }[]>([])
  const [forceRegenerate, setForceRegenerate] = useState(false)

  const { data: pdfInfo, isLoading: pdfLoading } = useQuery({
    queryKey: ['manual-info'],
    queryFn: () => apiClient.getManualInfo(),
  })

  const { data: aiInfo, isLoading: aiLoading } = useQuery({
    queryKey: ['manual-ai-info'],
    queryFn: () => apiClient.getManualAiInfo(),
    refetchInterval: (query) => query.state.data?.generating ? 3000 : false,
  })

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFile) return
    setUploading(true)
    setUploadMsg(null)
    try {
      await apiClient.uploadManual(selectedFile)
      setUploadMsg({ ok: true, text: 'Manual updated successfully.' })
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await qc.invalidateQueries({ queryKey: ['manual-info'] })
    } catch (err) {
      setUploadMsg({ ok: false, text: err instanceof ApiClientError ? err.message : 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    setGenerateError(null)
    setSections([])
    abortRef.current = new AbortController()

    try {
      const url = forceRegenerate
        ? '/api/v1/admin/super/manual/generate?force=true'
        : '/api/v1/admin/super/manual/generate'
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        signal: abortRef.current.signal,
      })
      if (!res.ok || !res.body) {
        throw new Error(`Server error ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as GenerateEvent
            if (event.type === 'section:start') {
              setSections(prev => [...prev, { title: event.title, done: false }])
            }
            if (event.type === 'section:done') {
              setSections(prev => prev.map(s => s.title === event.title ? { ...s, done: true } : s))
            }
            if (event.type === 'error') {
              setSections(prev => prev.map(s => s.title === event.title ? { ...s, done: true, error: event.message } : s))
            }
            if (event.type === 'complete') {
              await qc.invalidateQueries({ queryKey: ['manual-ai-info'] })
            }
          } catch { /* ignore parse errors */ }
        }
      }
      reader.cancel().catch(() => {})
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        // Refresh to check if generation is still running in background
        await qc.invalidateQueries({ queryKey: ['manual-ai-info'] })
        const info = qc.getQueryData<{ generating: boolean }>(['manual-ai-info'])
        if (!info?.generating) {
          setGenerateError(err instanceof Error ? err.message : 'Generation failed')
        }
        // If still generating, refetchInterval will keep polling — no error shown
      }
    } finally {
      setGenerating(false)
    }
  }

  const generatedAt = aiInfo?.generatedAt
    ? new Date(aiInfo.generatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : null

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Admin User Manual</h1>

      {/* AI Generation */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">AI-generated manual</h2>
            {!aiLoading && generatedAt && (
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Last generated {generatedAt} · {aiInfo?.sectionCount} sections</p>
            )}
          </div>
          {!aiLoading && aiInfo?.exists && (
            <a
              href="/api/v1/admin/manual"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)]"
            >
              View Manual
            </a>
          )}
        </div>

        <div className="space-y-2">
          <button
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {generating ? 'Generating…' : 'Generate with AI'}
          </button>
          {!aiLoading && aiInfo?.exists && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={forceRegenerate}
                onChange={e => setForceRegenerate(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-[var(--color-text-muted)]">Regenerate all sections from scratch</span>
            </label>
          )}
        </div>

        {/* Progress */}
        {sections.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {sections.map(s => (
              <li key={s.title} className="flex items-center gap-2">
                {s.error
                  ? <span className="text-[var(--color-error)]">✗</span>
                  : s.done
                    ? <span className="text-green-600">✓</span>
                    : <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full text-[var(--color-primary)]" />
                }
                <span className={s.error ? 'text-[var(--color-error)]' : s.done ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}>
                  {s.title}{s.error ? ` — ${s.error}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        {aiInfo?.generating && !generating && (
          <p className="text-xs text-[var(--color-text-muted)]">
            Generation running in background — {aiInfo.sectionCount} section{aiInfo.sectionCount !== 1 ? 's' : ''} saved so far…
          </p>
        )}

        {generateError && !aiInfo?.generating && (
          <div className="space-y-1">
            <p className="text-sm text-[var(--color-error)]">{generateError}</p>
            {aiInfo?.exists && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {aiInfo.sectionCount} section{aiInfo.sectionCount !== 1 ? 's' : ''} saved — you can view the partial manual or retry to complete it.
              </p>
            )}
          </div>
        )}

        {/* Downloads — shown only after manual exists */}
        {!aiLoading && aiInfo?.exists && (
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--color-border)]">
            {[
              { label: 'Full manual — HTML', href: '/api/v1/admin/manual?download=true' },
              { label: 'Full manual — PDF', href: '/api/v1/admin/manual?format=pdf' },
              { label: 'Hotel version — HTML', href: '/api/v1/admin/manual?download=true&audience=hotel' },
              { label: 'Hotel version — PDF', href: '/api/v1/admin/manual?format=pdf&audience=hotel' },
            ].map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-center text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)]"
              >
                {label}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* PDF Upload (legacy) */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Upload PDF manual (override)</h2>
        {!pdfLoading && pdfInfo?.exists && (
          <div className="flex items-center justify-between gap-4 text-sm">
            <div>
              <p className="text-[var(--color-text)]">HG-IBE-Admin-User-Manual.pdf</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {formatSize(pdfInfo.size)}
                {pdfInfo.updatedAt && <> · {new Date(pdfInfo.updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</>}
              </p>
            </div>
            <a href="/HG-IBE-Admin-User-Manual.pdf" download className="flex-shrink-0 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)]">
              Download
            </a>
          </div>
        )}
        <form onSubmit={e => void handleUpload(e)} className="space-y-3">
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-border)] px-6 py-6 transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-background)]"
            onClick={() => fileRef.current?.click()}
          >
            {selectedFile
              ? <p className="text-sm font-medium text-[var(--color-text)]">{selectedFile.name}</p>
              : <p className="text-sm text-[var(--color-text-muted)]">Click to select a PDF file</p>
            }
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} />
          </div>
          {uploadMsg && (
            <p className={`text-sm ${uploadMsg.ok ? 'text-green-600' : 'text-[var(--color-error)]'}`}>{uploadMsg.text}</p>
          )}
          <button type="submit" disabled={!selectedFile || uploading} className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
            {uploading ? 'Uploading…' : 'Upload & replace manual'}
          </button>
        </form>
      </section>
    </div>
  )
}
