'use client'

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '@/lib/api-client'

type GenerateEvent =
  | { type: 'section:start'; title: string }
  | { type: 'section:done'; title: string }
  | { type: 'error'; title: string; message: string }
  | { type: 'complete' }

export default function ManualPage() {
  const qc = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ title: string; done: boolean; error?: string }[]>([])
  const [forceRegenerate, setForceRegenerate] = useState(false)
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({})

  const { data: aiInfo, isLoading: aiLoading } = useQuery({
    queryKey: ['manual-ai-info'],
    queryFn: () => apiClient.getManualAiInfo(),
    refetchInterval: (query) => query.state.data?.generating ? 3000 : false,
  })

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    setGenerateError(null)
    setProgress([])
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
      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`)

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
              setProgress(prev => [...prev, { title: event.title, done: false }])
            }
            if (event.type === 'section:done') {
              setProgress(prev => prev.map(s => s.title === event.title ? { ...s, done: true } : s))
            }
            if (event.type === 'error') {
              setProgress(prev => prev.map(s => s.title === event.title ? { ...s, done: true, error: event.message } : s))
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
        await qc.invalidateQueries({ queryKey: ['manual-ai-info'] })
        const info = qc.getQueryData<{ generating: boolean }>(['manual-ai-info'])
        if (!info?.generating) {
          setGenerateError(err instanceof Error ? err.message : 'Generation failed')
        }
      }
    } finally {
      setGenerating(false)
    }
  }

  async function handleRegenerateSection(sectionId: string) {
    setRegenerating(prev => ({ ...prev, [sectionId]: true }))
    try {
      await apiClient.generateManualSection(sectionId)
      await qc.invalidateQueries({ queryKey: ['manual-ai-info'] })
    } catch (err) {
      // Error visible in section list via aiInfo refresh
      console.error(err)
    } finally {
      setRegenerating(prev => ({ ...prev, [sectionId]: false }))
    }
  }

  const generatedAt = aiInfo?.generatedAt
    ? new Date(aiInfo.generatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : null

  const showProgress = progress.length > 0
  const sections = aiInfo?.sections ?? []

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
            {generating ? 'Generating…' : aiInfo?.exists ? 'Regenerate all' : 'Generate with AI'}
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

        {/* Full-run progress */}
        {showProgress && (
          <ul className="space-y-1.5 text-sm">
            {progress.map(s => (
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
                {aiInfo.sectionCount} section{aiInfo.sectionCount !== 1 ? 's' : ''} saved — you can view the partial manual or retry.
              </p>
            )}
          </div>
        )}

        {/* Section list with per-section regenerate */}
        {!aiLoading && sections.length > 0 && !showProgress && (
          <div className="border-t border-[var(--color-border)] pt-3 space-y-1">
            {sections.map(s => {
              const ts = s.updatedAt
                ? new Date(s.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                : null
              return (
                <div key={s.id} className="flex items-center justify-between gap-2 py-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {s.missing
                      ? <span className="text-[var(--color-text-muted)]">○</span>
                      : s.failed
                        ? <span className="text-[var(--color-error)]">✗</span>
                        : <span className="text-green-600">✓</span>
                    }
                    <div className="min-w-0">
                      <span className={`text-xs ${s.failed ? 'text-[var(--color-error)]' : 'text-[var(--color-text)]'}`}>
                        {s.title}
                      </span>
                      {ts && (
                        <span className={`ml-2 text-xs ${s.failed ? 'text-[var(--color-error)] opacity-70' : 'text-[var(--color-text-muted)]'}`}>
                          {s.failed ? 'failed' : 'ok'} · {ts}
                        </span>
                      )}
                      {s.missing && (
                        <span className="ml-2 text-xs text-[var(--color-text-muted)]">not generated</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => void handleRegenerateSection(s.id)}
                    disabled={regenerating[s.id] ?? false}
                    className="flex-shrink-0 rounded px-2 py-0.5 text-xs border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors disabled:opacity-50"
                  >
                    {regenerating[s.id] ? '…' : 'Regenerate'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Downloads */}
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
    </div>
  )
}
