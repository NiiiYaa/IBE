'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  OrgOffersSettings,
  UpdateOffersSettingsRequest,
  CancellationPolicyFilter,
  ChargePartyFilter,
  PaymentMethodFilter,
  OffersChannel,
  SystemFlexibleDatesConfigResponse,
  OrgFlexibleDatesConfigResponse,
  PropertyFlexibleDatesConfigResponse,
  FlexibleDatesEffective,
  SystemInterHotelConfigResponse,
  OrgInterHotelConfigResponse,
  PropertyInterHotelConfigResponse,
  SystemMultiCityConfigResponse,
  OrgMultiCityConfigResponse,
  TransferType,
} from '@ibe/shared'
import { BoardType, BOARD_TYPE_LABELS } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import { Section, FormRow, SaveBar } from '../../design/components'

// ── Constants ─────────────────────────────────────────────────────────────────

const SYSTEM_DEFAULTS = {
  minNights: 1,
  maxNights: 30,
  minRooms: 1,
  maxRooms: 6,
  minOfferCurrency: 'EUR',
}

const CANCELLATION_OPTIONS: { value: CancellationPolicyFilter; label: string }[] = [
  { value: 'free', label: 'Free Cancellation' },
  { value: 'non_refundable', label: 'Non-refundable' },
]

const BOARD_OPTIONS = Object.values(BoardType).map(v => ({
  value: v,
  label: BOARD_TYPE_LABELS[v],
}))

const CHARGE_PARTY_OPTIONS: { value: ChargePartyFilter; label: string }[] = [
  { value: 'agent', label: 'Agent Pay' },
  { value: 'customer', label: 'Customer Pay' },
]

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethodFilter; label: string }[] = [
  { value: 'online', label: 'Pay Online' },
  { value: 'at_hotel', label: 'Pay at Hotel' },
]

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'CHF', 'JPY', 'CNY', 'AUD', 'CAD', 'KRW', 'EGP', 'THB', 'SGD', 'ILS', 'SAR']

// ── Channel tab switcher ──────────────────────────────────────────────────────

function ChannelTabs({ value, onChange }: { value: OffersChannel; onChange: (c: OffersChannel) => void }) {
  return (
    <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 w-fit">
      {(['b2c', 'b2b'] as OffersChannel[]).map(ch => (
        <button
          key={ch}
          type="button"
          onClick={() => onChange(ch)}
          className={[
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            value === ch
              ? 'bg-[var(--color-primary)] text-white shadow-sm'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          ].join(' ')}
        >
          {ch === 'b2c' ? 'B2C (Guests)' : 'B2B (Partners)'}
        </button>
      ))}
    </div>
  )
}

// ── Page-level tab types ──────────────────────────────────────────────────────

type OffersTab = 'general' | 'flexible-dates' | 'inter-city' | 'multi-city'

const OFFERS_TABS: { value: OffersTab; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'flexible-dates', label: 'Flexible Dates' },
  { value: 'inter-city', label: 'InterHotel Stay' },
  { value: 'multi-city', label: 'Multi-city' },
]

function OffersTabBar({ value, onChange }: { value: OffersTab; onChange: (t: OffersTab) => void }) {
  return (
    <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 w-fit">
      {OFFERS_TABS.map(tab => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={[
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            value === tab.value
              ? 'bg-[var(--color-primary)] text-white shadow-sm'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Entry point ───────────────────────────────────────────────────────────────

export default function OffersPage() {
  const { admin } = useAdminAuth()
  const { propertyId, orgId: contextOrgId } = useAdminProperty()
  const [channel, setChannel] = useState<OffersChannel>('b2c')
  const searchParams = useSearchParams()
  const router = useRouter()

  const rawTab = searchParams.get('tab')
  const activeTab: OffersTab =
    rawTab === 'flexible-dates' || rawTab === 'inter-city' || rawTab === 'multi-city'
      ? rawTab
      : 'general'

  function setTab(tab: OffersTab) {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'general') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    router.replace(`?${params.toString()}`)
  }

  if (propertyId === undefined) return null

  const isSuper = admin?.role === 'super'
  const isSystemLevel = isSuper && contextOrgId === null

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Offers</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          {isSystemLevel
            ? 'System-wide defaults inherited by all chains.'
            : propertyId === null
              ? 'Chain defaults inherited by all properties. Leave a field blank to use the system default.'
              : 'Property overrides. Leave blank to inherit from chain defaults.'}
        </p>
      </div>

      <OffersTabBar value={activeTab} onChange={setTab} />

      {activeTab === 'general' && (
        <div className="flex gap-2">
          {(['b2c', 'b2b'] as OffersChannel[]).map(ch => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannel(ch)}
              className={[
                'w-full rounded-lg border px-4 py-3 text-sm font-medium text-left transition-colors',
                channel === ch
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              ].join(' ')}
            >
              {ch === 'b2c' ? 'B2C (Guests)' : 'B2B (Partners)'}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'general' && (
        isSystemLevel ? (
          <SystemOffersEditor key={channel} channel={channel} />
        ) : propertyId === null ? (
          <GlobalOffersEditor key={channel} channel={channel} />
        ) : (
          <PropertyOffersEditor key={channel} propertyId={propertyId} channel={channel} />
        )
      )}

      {activeTab === 'flexible-dates' && (
        <FlexibleDatesTab
          isSuper={isSuper}
          isSystemLevel={isSystemLevel}
          orgId={contextOrgId}
          propertyId={propertyId}
        />
      )}

      {activeTab === 'inter-city' && (
        <InterHotelStayTab
          isSuper={isSuper}
          isSystemLevel={isSystemLevel}
          orgId={contextOrgId}
          propertyId={propertyId}
        />
      )}

      {activeTab === 'multi-city' && (
        <MultiCityStayTab
          isSuper={isSuper}
          isSystemLevel={isSystemLevel}
          orgId={contextOrgId}
        />
      )}
    </div>
  )
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

function NumberField({
  label,
  hint,
  value,
  placeholder,
  min,
  max,
  onChange,
}: {
  label: string
  hint?: string
  value: number | null
  placeholder?: string
  min?: number
  max?: number
  onChange: (v: number | null) => void
}) {
  return (
    <FormRow label={label} {...(hint ? { hint } : {})}>
      <input
        type="number"
        value={value ?? ''}
        placeholder={placeholder}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={inputCls}
      />
    </FormRow>
  )
}

function CheckboxGroup<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  inheritedLabel,
}: {
  label: string
  hint?: string
  options: { value: T; label: string }[]
  value: T[] | null
  onChange: (v: T[] | null) => void
  inheritedLabel?: string | undefined
}) {
  const isAllowed = (v: T) => value === null || value.includes(v)

  function toggle(v: T) {
    if (value === null) {
      onChange(options.map(o => o.value).filter(o => o !== v))
    } else if (value.includes(v)) {
      const next = value.filter(o => o !== v)
      onChange(next.length === options.length ? null : next)
    } else {
      const next = [...value, v]
      onChange(next.length === options.length ? null : next)
    }
  }

  return (
    <FormRow label={label} {...(hint ? { hint } : {})}>
      <div className="flex flex-wrap gap-3">
        {options.map(opt => (
          <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAllowed(opt.value)}
              onChange={() => toggle(opt.value)}
              className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
            />
            {opt.label}
          </label>
        ))}
      </div>
      {value !== null && value.length === 0 && (
        <p className="mt-1.5 text-xs text-[var(--color-error)]">
          Warning: no options selected — all offers will be hidden.
        </p>
      )}
      {inheritedLabel && value === null && (
        <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{inheritedLabel}</p>
      )}
    </FormRow>
  )
}

function MultiRoomLimitSelector({
  value, onChange,
}: {
  value: 'search' | 'hotel'
  onChange: (v: 'search' | 'hotel') => void
}) {
  return (
    <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Room limit source</p>
      <div className="flex gap-4">
        {([
          { value: 'hotel', label: 'Hotel max rooms', hint: 'Limit set in hotel settings (e.g. up to 5)' },
          { value: 'search', label: 'Search criteria', hint: 'Match rooms requested in search (e.g. searched for 3)' },
        ] as const).map(opt => (
          <label key={opt.value}
            className={[
              'flex flex-1 cursor-pointer flex-col gap-1 rounded-lg border-2 px-3 py-2.5 transition-colors',
              value === opt.value
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="multiRoomLimitBy"
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                className="accent-[var(--color-primary)]"
              />
              <span className="text-sm font-medium text-[var(--color-text)]">{opt.label}</span>
            </div>
            <p className="ml-5 text-xs text-[var(--color-text-muted)]">{opt.hint}</p>
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Shared form fields ────────────────────────────────────────────────────────

function useOffersForm(data: OrgOffersSettings | undefined, fallback?: OrgOffersSettings) {
  const [minNights, setMinNights] = useState<number | null>(null)
  const [maxNights, setMaxNights] = useState<number | null>(null)
  const [minRooms, setMinRooms] = useState<number | null>(null)
  const [maxRooms, setMaxRooms] = useState<number | null>(null)
  const [cancellation, setCancellation] = useState<CancellationPolicyFilter[] | null>(null)
  const [boards, setBoards] = useState<string[] | null>(null)
  const [chargeParties, setChargeParties] = useState<ChargePartyFilter[] | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodFilter[] | null>(null)
  const [minOfferValue, setMinOfferValue] = useState<number | null>(null)
  const [minOfferCurrency, setMinOfferCurrency] = useState<string | null>(null)
  const [bookingMode, setBookingMode] = useState<'single' | 'multi'>('single')
  const [multiRoomLimitBy, setMultiRoomLimitBy] = useState<'search' | 'hotel'>('hotel')
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!data) return
    setMinNights(data.minNights)
    setMaxNights(data.maxNights)
    setMinRooms(data.minRooms)
    setMaxRooms(data.maxRooms)
    setCancellation(data.allowedCancellationPolicies)
    setBoards(data.allowedBoardTypes)
    setChargeParties(data.allowedChargeParties)
    setPaymentMethods(data.allowedPaymentMethods)
    setMinOfferValue(data.minOfferValue)
    setMinOfferCurrency(data.minOfferCurrency)
    setBookingMode(data.bookingMode ?? fallback?.bookingMode ?? 'single')
    setMultiRoomLimitBy(data.multiRoomLimitBy ?? fallback?.multiRoomLimitBy ?? 'hotel')
    setIsDirty(false)
  }, [data, fallback?.bookingMode, fallback?.multiRoomLimitBy])

  const markDirty = () => setIsDirty(true)
  const payload = (): UpdateOffersSettingsRequest => ({
    minNights, maxNights, minRooms, maxRooms,
    allowedCancellationPolicies: cancellation,
    allowedBoardTypes: boards,
    allowedChargeParties: chargeParties,
    allowedPaymentMethods: paymentMethods,
    minOfferValue, minOfferCurrency, bookingMode, multiRoomLimitBy,
  })

  return {
    minNights, setMinNights, maxNights, setMaxNights,
    minRooms, setMinRooms, maxRooms, setMaxRooms,
    cancellation, setCancellation,
    boards, setBoards,
    chargeParties, setChargeParties,
    paymentMethods, setPaymentMethods,
    minOfferValue, setMinOfferValue,
    minOfferCurrency, setMinOfferCurrency,
    bookingMode, setBookingMode,
    multiRoomLimitBy, setMultiRoomLimitBy,
    isDirty, markDirty, payload,
  }
}

function OffersFormFields({
  form,
  currencies,
  defaultCurrency,
  upperHints,
}: {
  form: ReturnType<typeof useOffersForm>
  currencies: string[]
  defaultCurrency: string
  upperHints?: {
    minNights: string; maxNights: string; minRooms: string; maxRooms: string
    cancellation: string | undefined; boards: string | undefined
    chargeParties: string | undefined; paymentMethods: string | undefined
    bookingMode: string | undefined; minOfferValue: string | undefined
  }
}) {
  const md = form.markDirty
  return (
    <>
      <Section title="Search Constraints">
        <p className="text-xs text-[var(--color-text-muted)]">
          Guests will see a validation message if they exceed these limits.
          {!upperHints && ' Leave blank to use system defaults (nights 1–30, rooms 1–6).'}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Min nights" value={form.minNights} placeholder={upperHints?.minNights ?? String(SYSTEM_DEFAULTS.minNights)} min={1} onChange={v => { form.setMinNights(v); md() }} />
          <NumberField label="Max nights" value={form.maxNights} placeholder={upperHints?.maxNights ?? String(SYSTEM_DEFAULTS.maxNights)} min={1} onChange={v => { form.setMaxNights(v); md() }} />
          <NumberField label="Min rooms" value={form.minRooms} placeholder={upperHints?.minRooms ?? String(SYSTEM_DEFAULTS.minRooms)} min={1} onChange={v => { form.setMinRooms(v); md() }} />
          <NumberField label="Max rooms" value={form.maxRooms} placeholder={upperHints?.maxRooms ?? String(SYSTEM_DEFAULTS.maxRooms)} min={1} onChange={v => { form.setMaxRooms(v); md() }} />
        </div>
      </Section>

      <Section title="Allow Multi-Room Booking Flow">
        <p className="text-xs text-[var(--color-text-muted)]">
          Single-room: selecting an offer goes straight to checkout. Multi-room: guests add offers to a cart.
          {upperHints?.bookingMode && ` Inheriting: ${upperHints.bookingMode}.`}
        </p>
        <div className="flex gap-4 pt-1">
          {([
            { value: 'single', label: 'Single-room booking', hint: 'Select → checkout immediately' },
            { value: 'multi',  label: 'Multi-room booking',  hint: 'Select → add to cart → book all' },
          ] as const).map(opt => (
            <label key={opt.value}
              className={[
                'flex flex-1 cursor-pointer flex-col gap-1 rounded-xl border-2 px-4 py-3 transition-colors',
                form.bookingMode === opt.value
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <input type="radio" name="bookingMode" value={opt.value} checked={form.bookingMode === opt.value}
                  onChange={() => { form.setBookingMode(opt.value); md() }} className="accent-[var(--color-primary)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">{opt.label}</span>
              </div>
              <p className="ml-5 text-xs text-[var(--color-text-muted)]">{opt.hint}</p>
            </label>
          ))}
        </div>
        {form.bookingMode === 'multi' && (
          <MultiRoomLimitSelector value={form.multiRoomLimitBy} onChange={v => { form.setMultiRoomLimitBy(v); md() }} />
        )}
      </Section>

      <Section title="Rate Filters">
        <p className="text-xs text-[var(--color-text-muted)]">
          Allowlists — only checked options will be shown. Check all to allow everything.
        </p>
        <CheckboxGroup label="Cancellation Policy" options={CANCELLATION_OPTIONS} value={form.cancellation}
          onChange={v => { form.setCancellation(v); md() }}
          inheritedLabel={upperHints?.cancellation} />
        <CheckboxGroup label="Board Types" options={BOARD_OPTIONS} value={form.boards as string[] | null}
          onChange={v => { form.setBoards(v); md() }}
          inheritedLabel={upperHints?.boards} />
        <CheckboxGroup label="Charge Party" options={CHARGE_PARTY_OPTIONS} value={form.chargeParties}
          onChange={v => { form.setChargeParties(v); md() }}
          inheritedLabel={upperHints?.chargeParties} />
        <CheckboxGroup label="Payment Method" options={PAYMENT_METHOD_OPTIONS} value={form.paymentMethods}
          onChange={v => { form.setPaymentMethods(v); md() }}
          inheritedLabel={upperHints?.paymentMethods} />
      </Section>

      <Section title="Minimum Offer Value">
        <p className="text-xs text-[var(--color-text-muted)]">
          Offers with a total price below this threshold will be hidden.
          {upperHints?.minOfferValue && ` Inheriting: ${upperHints.minOfferValue}.`}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Minimum value" hint="(leave blank to inherit)" value={form.minOfferValue}
            placeholder={upperHints?.minOfferValue ?? 'no minimum'} min={0}
            onChange={v => { form.setMinOfferValue(v); md() }} />
          <FormRow label="Currency">
            <select value={form.minOfferCurrency ?? ''} onChange={e => { form.setMinOfferCurrency(e.target.value || null); md() }} className={inputCls}>
              <option value="">{defaultCurrency} (default)</option>
              {[...new Set([...currencies, ...COMMON_CURRENCIES])].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormRow>
        </div>
      </Section>
    </>
  )
}

// ── System-level editor (super admin only) ────────────────────────────────────

function SystemOffersEditor({ channel }: { channel: OffersChannel }) {
  const qc = useQueryClient()
  const qKey = ['system-offers-settings', channel]

  const { data, isLoading } = useQuery<OrgOffersSettings>({
    queryKey: qKey,
    queryFn: () => apiClient.getSystemOffersSettings(channel),
  })

  const form = useOffersForm(data)

  const { mutate, isPending } = useMutation({
    mutationFn: (d: UpdateOffersSettingsRequest) => apiClient.updateSystemOffersSettings(channel, d),
    onSuccess: updated => { qc.setQueryData(qKey, updated) },
  })

  if (isLoading) return <Spinner />

  return (
    <form onSubmit={e => { e.preventDefault(); mutate(form.payload()) }} className="space-y-6">
      <OffersFormFields form={form} currencies={COMMON_CURRENCIES} defaultCurrency={SYSTEM_DEFAULTS.minOfferCurrency} />
      <SaveBar isDirty={form.isDirty} isSaving={isPending} onSave={() => mutate(form.payload())} />
    </form>
  )
}

// ── Global (org-level) editor ─────────────────────────────────────────────────

function GlobalOffersEditor({ channel }: { channel: OffersChannel }) {
  const qc = useQueryClient()
  const qKey = ['org-offers-settings', channel]

  const { data, isLoading } = useQuery<OrgOffersSettings>({
    queryKey: qKey,
    queryFn: () => apiClient.getOrgOffersSettings(channel),
  })

  const form = useOffersForm(data)

  const { mutate, isPending } = useMutation({
    mutationFn: (d: UpdateOffersSettingsRequest) => apiClient.updateOrgOffersSettings(channel, d),
    onSuccess: updated => { qc.setQueryData(qKey, updated) },
  })

  if (isLoading) return <Spinner />

  return (
    <form onSubmit={e => { e.preventDefault(); mutate(form.payload()) }} className="space-y-6">
      <OffersFormFields form={form} currencies={COMMON_CURRENCIES} defaultCurrency={SYSTEM_DEFAULTS.minOfferCurrency} />
      <SaveBar isDirty={form.isDirty} isSaving={isPending} onSave={() => mutate(form.payload())} />
    </form>
  )
}

// ── Property-level editor ─────────────────────────────────────────────────────

function PropertyOffersEditor({ propertyId, channel }: { propertyId: number; channel: OffersChannel }) {
  const qc = useQueryClient()
  const qKey = ['property-offers-admin', propertyId, channel]

  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => apiClient.getPropertyOffersAdmin(propertyId, channel),
    enabled: propertyId > 0,
  })

  const { data: hotelConfig } = useQuery({
    queryKey: ['hotel-config-admin', propertyId],
    queryFn: () => apiClient.getHotelConfigAdmin(propertyId),
    enabled: propertyId > 0,
  })
  const hotelCurrencies: string[] = hotelConfig?.enabledCurrencies?.length
    ? hotelConfig.enabledCurrencies
    : COMMON_CURRENCIES
  const hotelDefaultCurrency = hotelConfig?.defaultCurrency ?? hotelCurrencies[0] ?? 'EUR'

  const overrides = data?.overrides
  const orgDefaults = data?.orgDefaults
  const systemDefaults = data?.systemDefaults

  // Effective fallback: org ?? system ?? hardcoded
  function effectiveHint(
    orgVal: string | number | null | undefined,
    sysVal: string | number | null | undefined,
    hardcoded: string | number,
    label?: string,
  ): string {
    if (orgVal != null) return `${label ?? 'Chain'}: ${orgVal}`
    if (sysVal != null) return `System: ${sysVal}`
    return `System default: ${hardcoded}`
  }

  const form = useOffersForm(overrides, orgDefaults ?? undefined)

  const { mutate, isPending } = useMutation({
    mutationFn: (d: UpdateOffersSettingsRequest) => apiClient.updatePropertyOffersSettings(propertyId, channel, d),
    onSuccess: updated => { qc.setQueryData(qKey, updated) },
  })

  if (isLoading) return <Spinner />

  const upperHints = {
    minNights: effectiveHint(orgDefaults?.minNights, systemDefaults?.minNights, SYSTEM_DEFAULTS.minNights),
    maxNights: effectiveHint(orgDefaults?.maxNights, systemDefaults?.maxNights, SYSTEM_DEFAULTS.maxNights),
    minRooms: effectiveHint(orgDefaults?.minRooms, systemDefaults?.minRooms, SYSTEM_DEFAULTS.minRooms),
    maxRooms: effectiveHint(orgDefaults?.maxRooms, systemDefaults?.maxRooms, SYSTEM_DEFAULTS.maxRooms),
    cancellation: (() => {
      const v = orgDefaults?.allowedCancellationPolicies ?? systemDefaults?.allowedCancellationPolicies
      return v ? `Inheriting: ${v.join(', ')}` : 'Inheriting: all allowed'
    })(),
    boards: (() => {
      const v = orgDefaults?.allowedBoardTypes ?? systemDefaults?.allowedBoardTypes
      return v ? `Inheriting: ${v.join(', ')}` : 'Inheriting: all allowed'
    })(),
    chargeParties: (() => {
      const v = orgDefaults?.allowedChargeParties ?? systemDefaults?.allowedChargeParties
      return v ? `Inheriting: ${v.join(', ')}` : 'Inheriting: all allowed'
    })(),
    paymentMethods: (() => {
      const v = orgDefaults?.allowedPaymentMethods ?? systemDefaults?.allowedPaymentMethods
      return v ? `Inheriting: ${v.join(', ')}` : 'Inheriting: all allowed'
    })(),
    bookingMode: (() => {
      const v = orgDefaults?.bookingMode ?? systemDefaults?.bookingMode
      return v ?? undefined
    })(),
    minOfferValue: (() => {
      const v = orgDefaults?.minOfferValue ?? systemDefaults?.minOfferValue
      const cur = orgDefaults?.minOfferCurrency ?? systemDefaults?.minOfferCurrency ?? hotelDefaultCurrency
      return v != null ? `${v} ${cur}` : undefined
    })(),
  }

  return (
    <form onSubmit={e => { e.preventDefault(); mutate(form.payload()) }} className="space-y-6">
      <OffersFormFields
        form={form}
        currencies={[...new Set([hotelDefaultCurrency, ...hotelCurrencies, ...COMMON_CURRENCIES])]}
        defaultCurrency={hotelDefaultCurrency}
        upperHints={upperHints}
      />
      <SaveBar isDirty={form.isDirty} isSaving={isPending} onSave={() => mutate(form.payload())} />
    </form>
  )
}

function Spinner() {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-[var(--color-text-muted)]">
      Loading…
    </div>
  )
}

// ── Coming Soon card ──────────────────────────────────────────────────────────

function ComingSoonCard({ tab }: { tab: 'multi-city' }) {
  const label = tab === 'multi-city' ? 'Multi-city' : tab
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-12 text-center">
      <p className="text-base font-semibold text-[var(--color-text)]">{label} — Coming soon</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        This feature is planned for a future release.
      </p>
    </div>
  )
}

// ── Flexible Dates — shared toggle with nullable/inherited support ─────────────

const fdInputCls =
  'w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'

function FdToggle({
  label,
  checked,
  inherited,
  onChange,
  onReset,
}: {
  label: string
  checked: boolean | null
  inherited?: boolean
  onChange: (v: boolean) => void
  onReset?: () => void
}) {
  const effective = checked ?? inherited ?? false
  const isInheriting = checked === null && inherited !== undefined
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--color-text)]">{label}</span>
      <div className="flex items-center gap-2">
        {isInheriting && (
          <span className="text-xs text-[var(--color-text-muted)]">(inherited)</span>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={effective}
          onClick={() => onChange(!effective)}
          className={[
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            effective ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
            isInheriting ? 'opacity-60' : '',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
              effective ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
        {onReset && checked !== null && (
          <button type="button" onClick={onReset} className="text-xs text-[var(--color-primary)] underline">
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

function FdNumberField({
  label,
  value,
  inherited,
  onChange,
  onReset,
}: {
  label: string
  value: number | null
  inherited?: number
  onChange: (v: number | null) => void
  onReset?: () => void
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--color-text)]">{label}</span>
      <div className="flex items-center gap-2">
        {value === null && inherited !== undefined && (
          <span className="text-xs text-[var(--color-text-muted)]">({inherited} inherited)</span>
        )}
        <input
          type="number"
          min={0}
          max={3}
          value={value ?? ''}
          placeholder={inherited !== undefined ? String(inherited) : ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={fdInputCls}
        />
        {onReset && value !== null && (
          <button type="button" onClick={onReset} className="text-xs text-[var(--color-primary)] underline">
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

// ── Flexible Dates — System defaults section ──────────────────────────────────

function SystemFlexibleDatesSection() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['flexible-dates-system'],
    queryFn: () => apiClient.getSystemFlexibleDatesConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<FlexibleDatesEffective>) => apiClient.updateSystemFlexibleDatesConfig(u),
    onSuccess: updated => { qc.setQueryData(['flexible-dates-system'], updated) },
  })

  const [form, setForm] = useState<SystemFlexibleDatesConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const dirty = JSON.stringify(form) !== JSON.stringify(data)
  const set = (k: keyof SystemFlexibleDatesConfigResponse) => (v: unknown) =>
    setForm(f => f ? { ...f, [k]: v } : f)

  return (
    <div className="space-y-1">
      <FdToggle
        label="Enabled"
        checked={form.enabled}
        onChange={v => set('enabled')(v)}
      />
      <FdNumberField
        label="Days before"
        value={form.daysBefore}
        onChange={v => set('daysBefore')(v ?? 0)}
      />
      <FdNumberField
        label="Days after"
        value={form.daysAfter}
        onChange={v => set('daysAfter')(v ?? 0)}
      />
      <SaveBar isDirty={dirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate(form)} />
    </div>
  )
}

// ── Flexible Dates — Chain override section ───────────────────────────────────

function OrgFlexibleDatesSection({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['flexible-dates-org', orgId],
    queryFn: () => apiClient.getOrgFlexibleDatesConfig(orgId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<OrgFlexibleDatesConfigResponse>) => apiClient.updateOrgFlexibleDatesConfig(orgId, u),
    onSuccess: updated => { qc.setQueryData(['flexible-dates-org', orgId], updated) },
  })

  const [form, setForm] = useState<OrgFlexibleDatesConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const eff = data.effective
  const dirty = JSON.stringify(form) !== JSON.stringify(data)
  const set = <K extends keyof OrgFlexibleDatesConfigResponse>(k: K) =>
    (v: OrgFlexibleDatesConfigResponse[K]) =>
      setForm(f => f ? { ...f, [k]: v } : f)

  return (
    <div className="space-y-1">
      <FdToggle
        label="Enabled"
        checked={form.enabled}
        inherited={eff.enabled}
        onChange={v => set('enabled')(v)}
        onReset={() => set('enabled')(null)}
      />
      <FdNumberField
        label="Days before"
        value={form.daysBefore}
        inherited={eff.daysBefore}
        onChange={v => set('daysBefore')(v)}
        onReset={() => set('daysBefore')(null)}
      />
      <FdNumberField
        label="Days after"
        value={form.daysAfter}
        inherited={eff.daysAfter}
        onChange={v => set('daysAfter')(v)}
        onReset={() => set('daysAfter')(null)}
      />
      <SaveBar isDirty={dirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate(form)} />
    </div>
  )
}

// ── Flexible Dates — Property settings section ────────────────────────────────

function PropertyFlexibleDatesSection({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['flexible-dates-property', propertyId],
    queryFn: () => apiClient.getPropertyFlexibleDatesConfig(propertyId),
    enabled: propertyId > 0,
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<PropertyFlexibleDatesConfigResponse>) =>
      apiClient.updatePropertyFlexibleDatesConfig(propertyId, u),
    onSuccess: updated => { qc.setQueryData(['flexible-dates-property', propertyId], updated) },
  })

  const [form, setForm] = useState<PropertyFlexibleDatesConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const eff = data.effective
  const dirty = JSON.stringify(form) !== JSON.stringify(data)
  const set = <K extends keyof PropertyFlexibleDatesConfigResponse>(k: K) =>
    (v: PropertyFlexibleDatesConfigResponse[K]) =>
      setForm(f => f ? { ...f, [k]: v } : f)

  return (
    <div className="space-y-1">
      <FdToggle
        label="Enabled"
        checked={form.enabled}
        inherited={eff.enabled}
        onChange={v => set('enabled')(v)}
        onReset={() => set('enabled')(null)}
      />
      <FdNumberField
        label="Days before"
        value={form.daysBefore}
        inherited={eff.daysBefore}
        onChange={v => set('daysBefore')(v)}
        onReset={() => set('daysBefore')(null)}
      />
      <FdNumberField
        label="Days after"
        value={form.daysAfter}
        inherited={eff.daysAfter}
        onChange={v => set('daysAfter')(v)}
        onReset={() => set('daysAfter')(null)}
      />
      <SaveBar isDirty={dirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate(form)} />
    </div>
  )
}

// ── Flexible Dates — Tab container ────────────────────────────────────────────

function FlexibleDatesTab({
  isSuper,
  isSystemLevel,
  orgId,
  propertyId,
}: {
  isSuper: boolean
  isSystemLevel: boolean
  orgId: number | null
  propertyId: number | null
}) {
  // Super admin at system level: show all three sections
  // Super admin at org level: show system + chain
  // Super admin at property level: show all three
  // Org admin: show chain section only
  // Property admin: show hotel section only

  const showSystem = isSuper
  const showChain = isSuper || (!isSystemLevel && orgId !== null && propertyId === null)
  const showProperty = propertyId !== null

  // Resolve the orgId to use for chain section:
  // At system level there's no org, so hide chain unless an org is selected
  const chainOrgId = isSystemLevel ? null : orgId

  return (
    <div className="space-y-6">
      {showSystem && (
        <Section title="System Defaults" defaultOpen={isSystemLevel}>
          <p className="text-xs text-[var(--color-text-muted)]">
            System-wide defaults inherited by all chains.
          </p>
          <SystemFlexibleDatesSection />
        </Section>
      )}

      {showChain && chainOrgId !== null && (
        <Section title="Chain Override" defaultOpen={!isSystemLevel && propertyId === null}>
          <p className="text-xs text-[var(--color-text-muted)]">
            Chain overrides inherited by all properties in this chain. Leave null to inherit from system.
          </p>
          <OrgFlexibleDatesSection orgId={chainOrgId} />
        </Section>
      )}

      {showProperty && propertyId !== null && (
        <Section title="Hotel Settings" defaultOpen>
          <p className="text-xs text-[var(--color-text-muted)]">
            Property-specific overrides. Reset any field to inherit from chain defaults.
          </p>
          <PropertyFlexibleDatesSection propertyId={propertyId} />
        </Section>
      )}

      {!showSystem && !showProperty && chainOrgId === null && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-12 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Select a chain or property to configure flexible dates.
          </p>
        </div>
      )}
    </div>
  )
}

// ── InterHotel Stay — shared helpers ─────────────────────────────────────────

const TRANSFER_TYPE_OPTIONS: { value: TransferType; label: string }[] = [
  { value: 'self', label: 'Self Transfer' },
  { value: 'hotel', label: 'Hotel Transfer' },
  { value: 'sponsored_self', label: 'Sponsored Self Transfer' },
]

function IhToggle({
  label,
  checked,
  inherited,
  onChange,
  onReset,
}: {
  label: string
  checked: boolean | null
  inherited?: boolean
  onChange: (v: boolean) => void
  onReset?: () => void
}) {
  const effective = checked ?? inherited ?? false
  const isInheriting = checked === null && inherited !== undefined
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--color-text)]">{label}</span>
      <div className="flex items-center gap-2">
        {isInheriting && (
          <span className="text-xs text-[var(--color-text-muted)]">(inherited)</span>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={effective}
          onClick={() => onChange(!effective)}
          className={[
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            effective ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
            isInheriting ? 'opacity-60' : '',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
              effective ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
        {onReset && checked !== null && (
          <button type="button" onClick={onReset} className="text-xs text-[var(--color-primary)] underline">
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

function IhNumberField({
  label,
  value,
  inherited,
  min,
  max,
  onChange,
  onReset,
}: {
  label: string
  value: number | null
  inherited?: number
  min?: number
  max?: number
  onChange: (v: number | null) => void
  onReset?: () => void
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--color-text)]">{label}</span>
      <div className="flex items-center gap-2">
        {value === null && inherited !== undefined && (
          <span className="text-xs text-[var(--color-text-muted)]">({inherited} inherited)</span>
        )}
        <input
          type="number"
          min={min}
          max={max}
          value={value ?? ''}
          placeholder={inherited !== undefined ? String(inherited) : ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={fdInputCls}
        />
        {onReset && value !== null && (
          <button type="button" onClick={onReset} className="text-xs text-[var(--color-primary)] underline">
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

function IhSelectField({
  label,
  value,
  inherited,
  options,
  onChange,
  onReset,
}: {
  label: string
  value: TransferType | null
  inherited?: TransferType
  options: { value: TransferType; label: string }[]
  onChange: (v: TransferType | null) => void
  onReset?: () => void
}) {
  const isInheriting = value === null && inherited !== undefined
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--color-text)]">{label}</span>
      <div className="flex items-center gap-2">
        {isInheriting && (
          <span className="text-xs text-[var(--color-text-muted)]">({inherited} inherited)</span>
        )}
        <select
          value={value ?? ''}
          onChange={e => {
            const v = e.target.value as TransferType | ''
            onChange(v === '' ? null : v)
          }}
          className={fdInputCls}
        >
          {onReset && <option value="">— inherit —</option>}
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {onReset && value !== null && (
          <button type="button" onClick={onReset} className="text-xs text-[var(--color-primary)] underline">
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

function IhTextField({
  label,
  value,
  inherited,
  placeholder,
  maxLength,
  onChange,
  onReset,
}: {
  label: string
  value: string | null
  inherited?: string
  placeholder?: string
  maxLength?: number
  onChange: (v: string | null) => void
  onReset?: () => void
}) {
  const isInheriting = value === null && inherited !== undefined
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--color-text)]">{label}</span>
      <div className="flex items-center gap-2">
        {isInheriting && (
          <span className="text-xs text-[var(--color-text-muted)]">({inherited} inherited)</span>
        )}
        <input
          type="text"
          value={value ?? ''}
          placeholder={placeholder ?? (inherited ?? '')}
          maxLength={maxLength}
          onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
          className={fdInputCls}
        />
        {onReset && value !== null && (
          <button type="button" onClick={onReset} className="text-xs text-[var(--color-primary)] underline">
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

function RefreshNearbyButton({ orgId }: { orgId: number }) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<string | null>(null)

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshResult(null)
    try {
      const result = await apiClient.refreshInterHotelNearby(orgId)
      setRefreshResult(`${result.count} nearby hotel pairs refreshed`)
    } catch {
      setRefreshResult('Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="py-2">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-50"
      >
        {refreshing ? 'Refreshing…' : 'Refresh Nearby Hotels'}
      </button>
      {refreshResult && (
        <p className="text-xs text-[var(--color-text-muted)] mt-1">{refreshResult}</p>
      )}
    </div>
  )
}

// ── InterHotel Stay — System section ─────────────────────────────────────────

function SystemInterHotelSection() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['interhotel-system'],
    queryFn: () => apiClient.getSystemInterHotelConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<SystemInterHotelConfigResponse>) => apiClient.updateSystemInterHotelConfig(u),
    onSuccess: updated => { qc.setQueryData(['interhotel-system'], updated) },
  })

  const [form, setForm] = useState<SystemInterHotelConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const dirty = JSON.stringify(form) !== JSON.stringify(data)
  const set = <K extends keyof SystemInterHotelConfigResponse>(k: K) =>
    (v: SystemInterHotelConfigResponse[K]) =>
      setForm(f => f ? { ...f, [k]: v } : f)

  const showSponsored = form.transferType === 'sponsored_self'

  return (
    <div className="space-y-1">
      <IhToggle
        label="Enabled"
        checked={form.enabled}
        onChange={v => set('enabled')(v)}
      />
      <IhNumberField
        label="Max Radius (km)"
        value={form.maxRadiusKm}
        min={1}
        max={500}
        onChange={v => set('maxRadiusKm')(v ?? 10)}
      />
      <IhNumberField
        label="Max Hotels"
        value={form.maxHotels}
        min={2}
        max={5}
        onChange={v => set('maxHotels')(v ?? 2)}
      />
      <IhSelectField
        label="Transfer Type"
        value={form.transferType}
        options={TRANSFER_TYPE_OPTIONS}
        onChange={v => set('transferType')(v ?? 'self')}
      />
      {showSponsored && (
        <>
          <IhNumberField
            label="Sponsored Amount"
            value={form.sponsoredAmount}
            min={0}
            onChange={v => set('sponsoredAmount')(v ?? 0)}
          />
          <IhTextField
            label="Sponsored Currency"
            value={form.sponsoredCurrency}
            placeholder="EUR"
            maxLength={3}
            onChange={v => set('sponsoredCurrency')(v ?? 'EUR')}
          />
        </>
      )}
      <RefreshNearbyButton orgId={1} />
      <SaveBar isDirty={dirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate(form)} />
    </div>
  )
}

// ── InterHotel Stay — Chain/Org section ──────────────────────────────────────

function OrgInterHotelSection({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['interhotel-org', orgId],
    queryFn: () => apiClient.getOrgInterHotelConfig(orgId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<OrgInterHotelConfigResponse>) => apiClient.updateOrgInterHotelConfig(orgId, u),
    onSuccess: updated => { qc.setQueryData(['interhotel-org', orgId], updated) },
  })

  const [form, setForm] = useState<OrgInterHotelConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const eff = data.effective
  const dirty = JSON.stringify(form) !== JSON.stringify(data)
  const set = <K extends keyof OrgInterHotelConfigResponse>(k: K) =>
    (v: OrgInterHotelConfigResponse[K]) =>
      setForm(f => f ? { ...f, [k]: v } : f)

  const effectiveTransferType = form.transferType ?? eff.transferType
  const showSponsored = effectiveTransferType === 'sponsored_self'

  return (
    <div className="space-y-1">
      <IhToggle
        label="Enabled"
        checked={form.enabled}
        inherited={eff.enabled}
        onChange={v => set('enabled')(v)}
        onReset={() => set('enabled')(null)}
      />
      <IhNumberField
        label="Max Radius (km)"
        value={form.maxRadiusKm}
        inherited={eff.maxRadiusKm}
        min={1}
        max={500}
        onChange={v => set('maxRadiusKm')(v)}
        onReset={() => set('maxRadiusKm')(null)}
      />
      <IhNumberField
        label="Max Hotels"
        value={form.maxHotels}
        inherited={eff.maxHotels}
        min={2}
        max={5}
        onChange={v => set('maxHotels')(v)}
        onReset={() => set('maxHotels')(null)}
      />
      <IhSelectField
        label="Transfer Type"
        value={form.transferType}
        inherited={eff.transferType}
        options={TRANSFER_TYPE_OPTIONS}
        onChange={v => set('transferType')(v)}
        onReset={() => set('transferType')(null)}
      />
      {showSponsored && (
        <>
          <IhNumberField
            label="Sponsored Amount"
            value={form.sponsoredAmount}
            inherited={eff.sponsoredAmount}
            min={0}
            onChange={v => set('sponsoredAmount')(v)}
            onReset={() => set('sponsoredAmount')(null)}
          />
          <IhTextField
            label="Sponsored Currency"
            value={form.sponsoredCurrency}
            inherited={eff.sponsoredCurrency}
            maxLength={3}
            onChange={v => set('sponsoredCurrency')(v)}
            onReset={() => set('sponsoredCurrency')(null)}
          />
        </>
      )}
      <RefreshNearbyButton orgId={orgId} />
      <SaveBar isDirty={dirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate(form)} />
    </div>
  )
}

// ── InterHotel Stay — Property section ───────────────────────────────────────

function PropertyInterHotelSection({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['interhotel-property', propertyId],
    queryFn: () => apiClient.getPropertyInterHotelConfig(propertyId),
    enabled: propertyId > 0,
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<PropertyInterHotelConfigResponse>) =>
      apiClient.updatePropertyInterHotelConfig(propertyId, u),
    onSuccess: updated => { qc.setQueryData(['interhotel-property', propertyId], updated) },
  })

  const [form, setForm] = useState<PropertyInterHotelConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const eff = data.effective
  const dirty = JSON.stringify(form) !== JSON.stringify(data)
  const set = <K extends keyof PropertyInterHotelConfigResponse>(k: K) =>
    (v: PropertyInterHotelConfigResponse[K]) =>
      setForm(f => f ? { ...f, [k]: v } : f)

  const effectiveTransferType = form.transferType ?? eff.transferType
  const showSponsored = effectiveTransferType === 'sponsored_self'

  return (
    <div className="space-y-1">
      <IhToggle
        label="Enabled"
        checked={form.enabled}
        inherited={eff.enabled}
        onChange={v => set('enabled')(v)}
        onReset={() => set('enabled')(null)}
      />
      <IhNumberField
        label="Max Radius (km)"
        value={form.maxRadiusKm}
        inherited={eff.maxRadiusKm}
        min={1}
        max={500}
        onChange={v => set('maxRadiusKm')(v)}
        onReset={() => set('maxRadiusKm')(null)}
      />
      <IhNumberField
        label="Max Hotels"
        value={form.maxHotels}
        inherited={eff.maxHotels}
        min={2}
        max={5}
        onChange={v => set('maxHotels')(v)}
        onReset={() => set('maxHotels')(null)}
      />
      <IhSelectField
        label="Transfer Type"
        value={form.transferType}
        inherited={eff.transferType}
        options={TRANSFER_TYPE_OPTIONS}
        onChange={v => set('transferType')(v)}
        onReset={() => set('transferType')(null)}
      />
      {showSponsored && (
        <>
          <IhNumberField
            label="Sponsored Amount"
            value={form.sponsoredAmount}
            inherited={eff.sponsoredAmount}
            min={0}
            onChange={v => set('sponsoredAmount')(v)}
            onReset={() => set('sponsoredAmount')(null)}
          />
          <IhTextField
            label="Sponsored Currency"
            value={form.sponsoredCurrency}
            inherited={eff.sponsoredCurrency}
            maxLength={3}
            onChange={v => set('sponsoredCurrency')(v)}
            onReset={() => set('sponsoredCurrency')(null)}
          />
        </>
      )}
      <SaveBar isDirty={dirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate(form)} />
    </div>
  )
}

// ── InterHotel Stay — Tab container ──────────────────────────────────────────

function InterHotelStayTab({
  isSuper,
  isSystemLevel,
  orgId,
  propertyId,
}: {
  isSuper: boolean
  isSystemLevel: boolean
  orgId: number | null
  propertyId: number | null
}) {
  const showSystem = isSuper
  const showChain = isSuper || (!isSystemLevel && orgId !== null && propertyId === null)
  const showProperty = propertyId !== null

  const chainOrgId = isSystemLevel ? null : orgId

  return (
    <div className="space-y-6">
      {showSystem && (
        <Section title="System Defaults" defaultOpen={isSystemLevel}>
          <p className="text-xs text-[var(--color-text-muted)]">
            System-wide defaults inherited by all chains.
          </p>
          <SystemInterHotelSection />
        </Section>
      )}

      {showChain && chainOrgId !== null && (
        <Section title="Chain Override" defaultOpen={!isSystemLevel && propertyId === null}>
          <p className="text-xs text-[var(--color-text-muted)]">
            Chain overrides inherited by all properties in this chain. Leave blank to inherit from system.
          </p>
          <OrgInterHotelSection orgId={chainOrgId} />
        </Section>
      )}

      {showProperty && propertyId !== null && (
        <Section title="Hotel Settings" defaultOpen>
          <p className="text-xs text-[var(--color-text-muted)]">
            Property-specific overrides. Reset any field to inherit from chain defaults.
          </p>
          <PropertyInterHotelSection propertyId={propertyId} />
        </Section>
      )}

      {!showSystem && !showProperty && chainOrgId === null && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-12 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Select a chain or property to configure InterHotel Stay.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Multi-City Stay — System section ─────────────────────────────────────────

function SystemMultiCitySection() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['multicity-system'],
    queryFn: () => apiClient.getSystemMultiCityConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<SystemMultiCityConfigResponse>) => apiClient.updateSystemMultiCityConfig(u),
    onSuccess: updated => { qc.setQueryData(['multicity-system'], updated) },
  })

  const [form, setForm] = useState<SystemMultiCityConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const dirty = JSON.stringify(form) !== JSON.stringify(data)
  const set = <K extends keyof SystemMultiCityConfigResponse>(k: K) =>
    (v: SystemMultiCityConfigResponse[K]) =>
      setForm(f => f ? { ...f, [k]: v } : f)

  return (
    <div className="space-y-1">
      <IhToggle
        label="Enabled"
        checked={form.enabled}
        onChange={v => set('enabled')(v)}
      />
      <IhNumberField
        label="Max city legs"
        value={form.maxLegs}
        min={2}
        max={6}
        onChange={v => set('maxLegs')(v ?? 2)}
      />
      <SaveBar isDirty={dirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate(form)} />
    </div>
  )
}

// ── Multi-City Stay — Chain/Org section ──────────────────────────────────────

function OrgMultiCitySection({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['multicity-org', orgId],
    queryFn: () => apiClient.getOrgMultiCityConfig(orgId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<OrgMultiCityConfigResponse>) => apiClient.updateOrgMultiCityConfig(orgId, u),
    onSuccess: updated => { qc.setQueryData(['multicity-org', orgId], updated) },
  })

  const [form, setForm] = useState<OrgMultiCityConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const eff = form.effective
  const dirty = JSON.stringify(form) !== JSON.stringify(data)

  return (
    <div className="space-y-1">
      <IhToggle
        label="Enabled"
        checked={form.enabled}
        inherited={eff.enabled}
        onChange={v => setForm(f => f ? { ...f, enabled: v } : f)}
        onReset={() => setForm(f => f ? { ...f, enabled: null } : f)}
      />
      <IhNumberField
        label="Max city legs"
        value={form.maxLegs ?? eff.maxLegs}
        min={2}
        max={6}
        onChange={v => setForm(f => f ? { ...f, maxLegs: v } : f)}
      />
      {form.maxLegs !== null && (
        <button type="button" onClick={() => setForm(f => f ? { ...f, maxLegs: null } : f)}
          className="text-xs text-[var(--color-primary)] underline">
          Reset to inherited ({eff.maxLegs})
        </button>
      )}
      <SaveBar isDirty={dirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate(form)} />
    </div>
  )
}

// ── Multi-City Stay — Tab ─────────────────────────────────────────────────────

function MultiCityStayTab({
  isSuper,
  isSystemLevel,
  orgId,
}: {
  isSuper: boolean
  isSystemLevel: boolean
  orgId: number | null
}) {
  const showSystem = isSuper
  const showChain = isSuper || (!isSystemLevel && orgId !== null)
  const chainOrgId = isSystemLevel ? null : orgId

  return (
    <div className="space-y-6">
      {showSystem && (
        <Section title="System Defaults" defaultOpen={isSystemLevel}>
          <p className="text-xs text-[var(--color-text-muted)]">
            System-wide defaults inherited by all chains.
          </p>
          <SystemMultiCitySection />
        </Section>
      )}

      {showChain && chainOrgId !== null && (
        <Section title="Chain Override" defaultOpen={!isSystemLevel}>
          <p className="text-xs text-[var(--color-text-muted)]">
            Chain overrides inherited by all hotels. Leave blank to inherit from system.
          </p>
          <OrgMultiCitySection orgId={chainOrgId} />
        </Section>
      )}

      {!showSystem && chainOrgId === null && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-12 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Select a chain to configure Multi-city Stay.
          </p>
        </div>
      )}
    </div>
  )
}
