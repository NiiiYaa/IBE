'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MarketingFeature, MarketingSettings, SellModel } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { Section, SaveBar } from '../../design/components'

const FEATURES: { key: MarketingFeature; label: string; description: string }[] = [
  {
    key: 'promoCodes',
    label: 'Promo Codes',
    description: 'Allow guests or agents to apply promotional discount codes during checkout.',
  },
  {
    key: 'priceComparison',
    label: 'Price Comparison',
    description: 'Show OTA price comparison widget on the room search page.',
  },
  {
    key: 'affiliates',
    label: 'Affiliates',
    description: 'Apply affiliate discounts and track referrals via affiliate codes.',
  },
  {
    key: 'campaigns',
    label: 'Campaigns',
    description: 'Run date-based discount campaigns visible in the booking flow.',
  },
  {
    key: 'onsiteConversion',
    label: 'Onsite Conversion',
    description: 'Display social-proof popups (presence counts, recent bookings, offers).',
  },
]

const MODELS: { value: SellModel; label: string }[] = [
  { value: 'b2c', label: 'B2C' },
  { value: 'b2b', label: 'B2B' },
]

export default function MarketingModulesPage() {
  const qc = useQueryClient()
  const qKey = ['admin-marketing-settings']

  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => apiClient.getOrgMarketingSettings(),
  })

  const [settings, setSettings] = useState<MarketingSettings>({
    promoCodes: ['b2c', 'b2b'],
    priceComparison: ['b2c', 'b2b'],
    affiliates: ['b2c', 'b2b'],
    campaigns: ['b2c', 'b2b'],
    onsiteConversion: ['b2c', 'b2b'],
  })
  const [isDirty, setIsDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setSettings(data)
    setIsDirty(false)
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: () => apiClient.updateOrgMarketingSettings(settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey })
      setIsDirty(false)
      setSaveError(null)
    },
    onError: (err: unknown) => {
      setSaveError(err instanceof Error ? err.message : String(err))
    },
  })

  function toggle(feature: MarketingFeature, model: SellModel) {
    setSettings(prev => {
      const current = prev[feature]
      const next = current.includes(model) ? current.filter(m => m !== model) : [...current, model]
      return { ...prev, [feature]: next }
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
        <h1 className="text-xl font-bold text-[var(--color-text)]">Channels</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Control which marketing features are active per sales channel. Disabled features are hidden from guests and agents on that channel.
        </p>
      </div>

      <Section title="Feature Access">
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          Check the channels for which each feature should be enabled. Unchecking a channel disables the feature entirely for that audience.
        </p>

        {/* Header row */}
        <div className="grid gap-x-2 mb-2 px-4" style={{ gridTemplateColumns: '1fr repeat(2, 80px)' }}>
          <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Feature</span>
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

        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          Property-level overrides can be set per-property to deviate from these defaults. Inheritance: Chain → Property.
        </p>
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
