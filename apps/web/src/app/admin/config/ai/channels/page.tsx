'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AIChannel, AIChannelSettings, SellModel } from '@ibe/shared'
import { AI_CHANNELS, AI_CHANNEL_LABELS, AI_CHANNEL_DESCRIPTIONS } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { Section, SaveBar } from '../../../design/components'

const FEATURES: { key: AIChannel; label: string; description: string }[] = AI_CHANNELS.map(key => ({
  key,
  label: AI_CHANNEL_LABELS[key],
  description: AI_CHANNEL_DESCRIPTIONS[key],
}))

const MODELS: { value: SellModel; label: string }[] = [
  { value: 'b2c', label: 'B2C' },
  { value: 'b2b', label: 'B2B' },
]

const DEFAULT_SETTINGS: AIChannelSettings = {
  aiSearchBar: ['b2c', 'b2b'],
  whatsapp: [],
  mcp: [],
}

export default function AIChannelsPage() {
  const qc = useQueryClient()
  const qKey = ['admin-ai-channels']

  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => apiClient.getOrgAIChannels(),
  })

  const [settings, setSettings] = useState<AIChannelSettings>(DEFAULT_SETTINGS)
  const [isDirty, setIsDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setSettings(data)
    setIsDirty(false)
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: () => apiClient.updateOrgAIChannels(settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey })
      setIsDirty(false)
      setSaveError(null)
    },
    onError: (err: unknown) => {
      setSaveError(err instanceof Error ? err.message : String(err))
    },
  })

  function toggle(channel: AIChannel, model: SellModel) {
    setSettings(prev => {
      const current = prev[channel]
      const next = current.includes(model) ? current.filter(m => m !== model) : [...current, model]
      return { ...prev, [channel]: next }
    })
    setIsDirty(true)
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--color-text-muted)]">
        Loading…
      </div>
    )
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); mutate() }}
      className="mx-auto max-w-3xl space-y-6 p-6"
    >
      <div className="mb-2">
        <h1 className="text-xl font-bold text-[var(--color-text)]">AI Channels</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Control which AI channels are active per sales model. Disabled channels are unavailable for that audience.
        </p>
      </div>

      <Section title="Channel Access">
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          Check the sales models for which each AI channel should be enabled. Unchecking a model disables that channel for that audience.
        </p>

        {/* Header row */}
        <div className="grid gap-x-2 mb-2 px-4" style={{ gridTemplateColumns: '1fr repeat(2, 80px)' }}>
          <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Channel</span>
          {MODELS.map(m => (
            <span key={m.value} className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide text-center">
              {m.label}
            </span>
          ))}
        </div>

        <div className="space-y-2">
          {FEATURES.map(f => {
            const enabledModels = settings[f.key]
            const allEnabled = MODELS.every(m => enabledModels.includes(m.value))
            const noneEnabled = MODELS.every(m => !enabledModels.includes(m.value))

            return (
              <div
                key={f.key}
                className={[
                  'grid gap-x-2 items-center rounded-xl border-2 px-4 py-3 transition-colors',
                  noneEnabled
                    ? 'border-[var(--color-error)]/30 bg-red-50/60'
                    : allEnabled
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                      : 'border-[var(--color-border)]',
                ].join(' ')}
                style={{ gridTemplateColumns: '1fr repeat(2, 80px)' }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-text)]">{f.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{f.description}</p>
                </div>
                {MODELS.map(m => {
                  const checked = enabledModels.includes(m.value)
                  return (
                    <label key={m.value} className="flex flex-col items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(f.key, m.value)}
                        className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                      />
                      <span className={[
                        'text-[10px] font-semibold',
                        checked ? 'text-green-700' : 'text-[var(--color-text-muted)]',
                      ].join(' ')}>
                        {checked ? 'On' : 'Off'}
                      </span>
                    </label>
                  )
                })}
              </div>
            )
          })}
        </div>
      </Section>

      {saveError && (
        <p className="rounded-lg border border-[var(--color-error)]/40 bg-red-50 px-4 py-2.5 text-xs font-medium text-[var(--color-error)]">
          Save failed: {saveError}
        </p>
      )}

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate()} />
    </form>
  )
}
