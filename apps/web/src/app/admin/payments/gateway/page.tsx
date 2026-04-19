'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, PropertyDesignAdminResponse } from '@ibe/shared'
import { useGlobalConfig } from '@/hooks/use-global-config'
import { useAdminProperty } from '../../property-context'
import { apiClient } from '@/lib/api-client'
import { SaveBar, Section } from '../../design/components'
import { OverrideToggleRow } from '../../design/override-helpers'

export default function PaymentGatewayPage() {
  const { propertyId } = useAdminProperty()
  if (propertyId === null) return <GlobalPaymentEditor />
  return <PropertyPaymentEditor propertyId={propertyId ?? 0} />
}

// ── Global editor ─────────────────────────────────────────────────────────────

function GlobalPaymentEditor() {
  const { isLoading, draft, set, save, isPending, isDirty } = useGlobalConfig()

  if (isLoading) return <Spinner />

  const onlineEnabled = draft.onlinePaymentEnabled ?? true
  const payAtHotelEnabled = draft.payAtHotelEnabled ?? true
  const guaranteeRequired = draft.payAtHotelCardGuaranteeRequired ?? false

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Payment Gateway</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Chain defaults — apply to all hotels unless overridden at the hotel level.
        </p>
      </div>

      <Section title="Online Payment">
        <ToggleRow
          label="Accept credit card payments"
          description="Guests pay in full at the time of booking via Stripe. Always requires a credit card."
          badge="Prepaid"
          checked={onlineEnabled}
          onChange={v => set('onlinePaymentEnabled', v)}
        />
      </Section>

      <Section title="Pay at Hotel">
        <div className="space-y-3">
          <ToggleRow
            label="Allow pay-at-hotel reservations"
            description="Guests can complete a reservation without paying upfront."
            checked={payAtHotelEnabled}
            onChange={v => {
              set('payAtHotelEnabled', v)
              if (!v) set('payAtHotelCardGuaranteeRequired', false)
            }}
          />
          <ToggleRow
            label="Require credit card to guarantee the reservation"
            description="When enabled, guests must provide a credit card to hold the reservation — the card is not charged at booking."
            checked={guaranteeRequired}
            onChange={v => set('payAtHotelCardGuaranteeRequired', v)}
            disabled={!payAtHotelEnabled}
          />
        </div>
      </Section>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={save} />
    </div>
  )
}

// ── Property editor ───────────────────────────────────────────────────────────

type OverrideDraft = Partial<OrgDesignDefaultsConfig>

function PropertyPaymentEditor({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<OverrideDraft>({})
  const [isDirty, setIsDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const { data: designData, isLoading } = useQuery<PropertyDesignAdminResponse>({
    queryKey: ['property-design-admin', propertyId],
    queryFn: () => apiClient.getPropertyDesignAdmin(propertyId),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (designData && !initialized) {
      setDraft(designData.overrides)
      setInitialized(true)
      setIsDirty(false)
    }
  }, [designData, initialized])

  useEffect(() => { setInitialized(false); setIsDirty(false) }, [propertyId])

  const orgDefaults = designData?.orgDefaults ?? ({} as OrgDesignDefaultsConfig)

  const { mutate, isPending } = useMutation({
    mutationFn: (d: OverrideDraft) => apiClient.updateHotelConfig(propertyId, d as Parameters<typeof apiClient.updateHotelConfig>[1]),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['property-design-admin', propertyId] })
      setIsDirty(false)
    },
  })

  const set = useCallback(<K extends keyof OrgDesignDefaultsConfig>(key: K, value: OrgDesignDefaultsConfig[K]) => {
    setDraft(d => ({ ...d, [key]: value }))
    setIsDirty(true)
  }, [])

  const reset = useCallback((key: keyof OrgDesignDefaultsConfig) => {
    setDraft(d => ({ ...d, [key]: null }))
    setIsDirty(true)
  }, [])

  if (!propertyId || isLoading) return <Spinner />

  const effectivePayAtHotel = (draft.payAtHotelEnabled ?? orgDefaults.payAtHotelEnabled ?? true)
  const setB = set as (key: keyof OrgDesignDefaultsConfig, val: boolean) => void

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-xl font-semibold text-[var(--color-text)]">Payment Gateway</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        Hotel overrides — inherit from chain or set a custom value for this hotel.
      </p>

      <Section title="Online Payment">
        <OverrideToggleRow
          label="Accept credit card payments"
          description="Guests pay in full at the time of booking via Stripe. Always requires a credit card."
          badge="Prepaid"
          fieldKey="onlinePaymentEnabled"
          draft={draft} orgDefaults={orgDefaults} systemDefault={true}
          onSet={setB} onReset={reset}
        />
      </Section>

      <Section title="Pay at Hotel">
        <div className="space-y-3">
          <OverrideToggleRow
            label="Allow pay-at-hotel reservations"
            description="Guests can complete a reservation without paying upfront."
            fieldKey="payAtHotelEnabled"
            draft={draft} orgDefaults={orgDefaults} systemDefault={true}
            onSet={(key, val) => {
              setB(key, val)
              if (!val) reset('payAtHotelCardGuaranteeRequired')
            }}
            onReset={key => {
              reset(key)
              reset('payAtHotelCardGuaranteeRequired')
            }}
          />
          <OverrideToggleRow
            label="Require credit card to guarantee the reservation"
            description="When enabled, guests must provide a credit card to hold the reservation — the card is not charged at booking."
            fieldKey="payAtHotelCardGuaranteeRequired"
            draft={draft} orgDefaults={orgDefaults} systemDefault={false}
            onSet={setB} onReset={reset}
            disabledWhen={!effectivePayAtHotel}
          />
        </div>
      </Section>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
      ].join(' ')}
    >
      <span className={[
        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
        checked ? 'translate-x-5' : 'translate-x-0',
      ].join(' ')} />
    </button>
  )
}

function ToggleRow({ label, description, checked, onChange, disabled, badge }: {
  label: string; description?: string; checked: boolean
  onChange: (v: boolean) => void; disabled?: boolean; badge?: string
}) {
  return (
    <div className={['flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4', disabled ? 'opacity-60' : ''].join(' ')}>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--color-text)]">{label}</p>
          {badge && (
            <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              {badge}
            </span>
          )}
        </div>
        {description && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} {...(disabled !== undefined ? { disabled } : {})} />
    </div>
  )
}

function Spinner() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--color-border)]" />)}
    </div>
  )
}
