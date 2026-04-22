'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SellModel } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { Section, SaveBar } from '../../design/components'

const MODELS: { value: SellModel; label: string; description: string }[] = [
  {
    value: 'b2c',
    label: 'B2C — Direct consumer',
    description: 'Public website: any visitor can search and book. Disable to fully close the IBE to the public.',
  },
  {
    value: 'b2b',
    label: 'B2B — Travel agents / partners',
    description: 'Agent portals at the -b2b subdomain. Agents log in with credentials. Disable to block all B2B portal logins.',
  },
]

export default function ModelsPage() {
  const qc = useQueryClient()
  const qKey = ['admin-org']

  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => apiClient.getOrgSettings(),
  })

  const [enabled, setEnabled] = useState<SellModel[]>(['b2c', 'b2b'])
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!data) return
    setEnabled(data.enabledModels ?? ['b2c', 'b2b'])
    setIsDirty(false)
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: () => apiClient.updateOrgSettings({ enabledModels: enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey })
      setIsDirty(false)
    },
  })

  function toggle(model: SellModel) {
    setEnabled(prev =>
      prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]
    )
    setIsDirty(true)
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--color-text-muted)]">
        Loading…
      </div>
    )
  }

  const noneEnabled = enabled.length === 0

  return (
    <form
      onSubmit={e => { e.preventDefault(); mutate() }}
      className="mx-auto max-w-2xl space-y-6 p-6"
    >
      <div className="mb-2">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Channels</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Control which booking channels are active for this organization.
        </p>
      </div>

      <Section title="Active Channels">
        <p className="text-xs text-[var(--color-text-muted)]">
          Select every channel through which guests or agents can search and book. Unchecked channels are actively blocked at the API level.
        </p>

        <div className="mt-4 space-y-3">
          {MODELS.map(m => {
            const isChecked = enabled.includes(m.value)
            return (
              <label
                key={m.value}
                className={[
                  'flex cursor-pointer items-start gap-4 rounded-xl border-2 px-4 py-4 transition-colors',
                  isChecked
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/40',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(m.value)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-text)]">{m.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{m.description}</p>
                </div>
                <span
                  className={[
                    'ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    isChecked
                      ? 'bg-green-100 text-green-700'
                      : 'bg-[var(--color-background)] text-[var(--color-text-muted)]',
                  ].join(' ')}
                >
                  {isChecked ? 'Active' : 'Disabled'}
                </span>
              </label>
            )
          })}
        </div>

        {noneEnabled && (
          <p className="mt-3 rounded-lg border border-[var(--color-error)]/40 bg-red-50 px-4 py-2.5 text-xs font-medium text-[var(--color-error)]">
            Warning: no channels are active — the IBE will be completely inaccessible to all users.
          </p>
        )}

        <div className="mt-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-xs text-[var(--color-text-muted)] space-y-1">
          <p className="font-semibold text-[var(--color-text)]">Coming soon</p>
          <p>
            <span className="font-medium">Closed-group</span> — invite-only access via token or email allowlist. Designed for corporate clients and exclusive programs.
          </p>
        </div>
      </Section>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate()} />
    </form>
  )
}
