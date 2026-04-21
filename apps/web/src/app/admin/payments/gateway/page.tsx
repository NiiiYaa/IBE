'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, PropertyDesignAdminResponse } from '@ibe/shared'
import { useGlobalConfig } from '@/hooks/use-global-config'
import { useAdminProperty } from '../../property-context'
import { apiClient } from '@/lib/api-client'
import { SaveBar, Section } from '../../design/components'

export default function PaymentGatewayPage() {
  const { propertyId } = useAdminProperty()
  if (propertyId === null) return <GlobalPaymentEditor />
  return <PropertyPaymentEditor propertyId={propertyId ?? 0} />
}

// ── Global editor ─────────────────────────────────────────────────────────────

function GlobalPaymentEditor() {
  const { isLoading, draft, set, save, isPending, isDirty } = useGlobalConfig()

  if (isLoading) return <Spinner />

  const isStripe = draft.onlinePaymentEnabled ?? true

  function selectStripe() {
    set('onlinePaymentEnabled', true)
    set('payAtHotelEnabled', false)
  }

  function selectAtHotel() {
    set('onlinePaymentEnabled', false)
    set('payAtHotelEnabled', true)
    set('payAtHotelCardGuaranteeRequired', false)
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Payment Gateway</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Chain defaults — apply to all hotels unless overridden at the hotel level.
        </p>
      </div>

      <Section title="Select gateway">
        <div className="space-y-3">
          <GatewayOption
            label="Stripe"
            description="Guests pay online in full at the time of booking via credit card."
            badge="Prepaid"
            selected={isStripe}
            onSelect={selectStripe}
          />
          <GatewayOption
            label="Pay at Hotel"
            description="No payment is collected at booking. Payment will be collected at the hotel."
            selected={!isStripe}
            onSelect={selectAtHotel}
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

  if (!propertyId || isLoading) return <Spinner />

  // Effective value: draft override → org default → system default (true = Stripe)
  const effectiveOnline = draft.onlinePaymentEnabled ?? orgDefaults.onlinePaymentEnabled ?? true
  const isOverridden = draft.onlinePaymentEnabled !== null && draft.onlinePaymentEnabled !== undefined
  const chainGateway = (orgDefaults.onlinePaymentEnabled ?? true) ? 'Stripe' : 'Pay at Hotel'

  function selectStripe() {
    setDraft(d => ({ ...d, onlinePaymentEnabled: true, payAtHotelEnabled: false, payAtHotelCardGuaranteeRequired: false }))
    setIsDirty(true)
  }

  function selectAtHotel() {
    setDraft(d => ({ ...d, onlinePaymentEnabled: false, payAtHotelEnabled: true, payAtHotelCardGuaranteeRequired: false }))
    setIsDirty(true)
  }

  function resetToChain() {
    setDraft(d => ({ ...d, onlinePaymentEnabled: null, payAtHotelEnabled: null, payAtHotelCardGuaranteeRequired: null }))
    setIsDirty(true)
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-xl font-semibold text-[var(--color-text)]">Payment Gateway</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        Hotel override — inherit from chain or set a custom gateway for this hotel.
      </p>

      <Section title="Select gateway">
        <div className="space-y-3">
          <GatewayOption
            label="Stripe"
            description="Guests pay online in full at the time of booking via credit card."
            badge="Prepaid"
            selected={effectiveOnline === true}
            onSelect={selectStripe}
          />
          <GatewayOption
            label="Pay at Hotel"
            description="No payment is collected at booking. Payment will be collected at the hotel."
            selected={effectiveOnline === false}
            onSelect={selectAtHotel}
          />
        </div>

        {isOverridden ? (
          <button
            onClick={resetToChain}
            className="mt-3 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            Reset to chain default ({chainGateway})
          </button>
        ) : (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Inheriting chain default: <span className="font-medium">{chainGateway}</span>
          </p>
        )}
      </Section>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────

function GatewayOption({ label, description, badge, selected, onSelect }: {
  label: string
  description: string
  badge?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full flex items-center gap-4 rounded-xl border px-5 py-4 text-left transition-colors',
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50',
      ].join(' ')}
    >
      <div className={[
        'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center',
        selected ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]',
      ].join(' ')}>
        {selected && <div className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
          {badge && (
            <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>
      </div>
    </button>
  )
}

function Spinner() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--color-border)]" />)}
    </div>
  )
}
