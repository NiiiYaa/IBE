'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgOffersSettings, UpdateOffersSettingsRequest, CancellationPolicyFilter, ChargePartyFilter, PaymentMethodFilter } from '@ibe/shared'
import { BoardType, BOARD_TYPE_LABELS } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
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

// ── Entry point ───────────────────────────────────────────────────────────────

export default function OffersPage() {
  const { propertyId } = useAdminProperty()
  if (propertyId === undefined) return null
  return propertyId === null
    ? <GlobalOffersEditor />
    : <PropertyOffersEditor propertyId={propertyId} />
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
  inheritedLabel?: string
}) {
  const isAllowed = (v: T) => value === null || value.includes(v)

  function toggle(v: T) {
    if (value === null) {
      // Currently "all allowed" — switching to explicit list excluding this item
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

// ── Global (org-level) editor ─────────────────────────────────────────────────

function GlobalOffersEditor() {
  const qc = useQueryClient()
  const qKey = ['org-offers-settings']

  const { data, isLoading } = useQuery<OrgOffersSettings>({
    queryKey: qKey,
    queryFn: () => apiClient.getOrgOffersSettings(),
  })

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
    setBookingMode(data.bookingMode ?? 'single')
    setMultiRoomLimitBy(data.multiRoomLimitBy ?? 'hotel')
    setIsDirty(false)
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: UpdateOffersSettingsRequest) => apiClient.updateOrgOffersSettings(d),
    onSuccess: updated => {
      qc.setQueryData(qKey, updated)
    },
  })

  function doSave() {
    mutate({
      minNights,
      maxNights,
      minRooms,
      maxRooms,
      allowedCancellationPolicies: cancellation,
      allowedBoardTypes: boards,
      allowedChargeParties: chargeParties,
      allowedPaymentMethods: paymentMethods,
      minOfferValue,
      minOfferCurrency,
      bookingMode,
      multiRoomLimitBy,
    })
  }

  function markDirty() { setIsDirty(true) }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--color-text-muted)]">
        Loading…
      </div>
    )
  }

  return (
    <form onSubmit={e => { e.preventDefault(); doSave() }} className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Offers</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Global defaults inherited by all properties. Leave a field blank to use the system default.
        </p>
      </div>

      <Section title="Search Constraints">
        <p className="text-xs text-[var(--color-text-muted)]">
          Guests will see a validation message if they exceed these limits. Leave blank to use defaults (nights 1–30, rooms 1–6).
        </p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Min nights"
            value={minNights}
            placeholder={String(SYSTEM_DEFAULTS.minNights)}
            min={1}
            onChange={v => { setMinNights(v); markDirty() }}
          />
          <NumberField
            label="Max nights"
            value={maxNights}
            placeholder={String(SYSTEM_DEFAULTS.maxNights)}
            min={1}
            onChange={v => { setMaxNights(v); markDirty() }}
          />
          <NumberField
            label="Min rooms"
            value={minRooms}
            placeholder={String(SYSTEM_DEFAULTS.minRooms)}
            min={1}
            onChange={v => { setMinRooms(v); markDirty() }}
          />
          <NumberField
            label="Max rooms"
            value={maxRooms}
            placeholder={String(SYSTEM_DEFAULTS.maxRooms)}
            min={1}
            onChange={v => { setMaxRooms(v); markDirty() }}
          />
        </div>
      </Section>

      <Section title="Allow Multi-Room Booking Flow">
        <p className="text-xs text-[var(--color-text-muted)]">
          Single-room: selecting an offer goes straight to checkout. Multi-room: guests add offers to a cart and book all rooms at once. Properties can override this.
        </p>
        <div className="flex gap-4 pt-1">
          {([
            { value: 'single', label: 'Single-room booking', hint: 'Select → checkout immediately' },
            { value: 'multi',  label: 'Multi-room booking',  hint: 'Select → add to cart → book all' },
          ] as const).map(opt => (
            <label key={opt.value}
              className={[
                'flex flex-1 cursor-pointer flex-col gap-1 rounded-xl border-2 px-4 py-3 transition-colors',
                bookingMode === opt.value
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="bookingMode"
                  value={opt.value}
                  checked={bookingMode === opt.value}
                  onChange={() => { setBookingMode(opt.value); markDirty() }}
                  className="accent-[var(--color-primary)]"
                />
                <span className="text-sm font-medium text-[var(--color-text)]">{opt.label}</span>
              </div>
              <p className="ml-5 text-xs text-[var(--color-text-muted)]">{opt.hint}</p>
            </label>
          ))}
        </div>
        {bookingMode === 'multi' && (
          <MultiRoomLimitSelector value={multiRoomLimitBy} onChange={v => { setMultiRoomLimitBy(v); markDirty() }} />
        )}
      </Section>

      <Section title="Rate Filters">
        <p className="text-xs text-[var(--color-text-muted)]">
          Allowlists — only checked options will be shown to guests. Check all or leave all checked to show everything.
        </p>
        <CheckboxGroup
          label="Cancellation Policy"
          options={CANCELLATION_OPTIONS}
          value={cancellation}
          onChange={v => { setCancellation(v); markDirty() }}
        />
        <CheckboxGroup
          label="Board Types"
          options={BOARD_OPTIONS}
          value={boards as string[] | null}
          onChange={v => { setBoards(v); markDirty() }}
        />
        <CheckboxGroup
          label="Charge Party"
          options={CHARGE_PARTY_OPTIONS}
          value={chargeParties}
          onChange={v => { setChargeParties(v); markDirty() }}
        />
        <CheckboxGroup
          label="Payment Method"
          options={PAYMENT_METHOD_OPTIONS}
          value={paymentMethods}
          onChange={v => { setPaymentMethods(v); markDirty() }}
        />
      </Section>

      <Section title="Minimum Offer Value">
        <p className="text-xs text-[var(--color-text-muted)]">
          Offers with a total price below this threshold will be hidden from guests. Leave blank to show all.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Minimum value"
            hint="(leave blank for no minimum)"
            value={minOfferValue}
            placeholder="e.g. 50"
            min={0}
            onChange={v => { setMinOfferValue(v); markDirty() }}
          />
          <FormRow label="Currency">
            <select
              value={minOfferCurrency ?? ''}
              onChange={e => { setMinOfferCurrency(e.target.value || null); markDirty() }}
              className={inputCls}
            >
              <option value="">{SYSTEM_DEFAULTS.minOfferCurrency} (default)</option>
              {COMMON_CURRENCIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormRow>
        </div>
      </Section>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={doSave} />
    </form>
  )
}

// ── Property-level editor ─────────────────────────────────────────────────────


function PropertyOffersEditor({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const qKey = ['property-offers-admin', propertyId]

  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => apiClient.getPropertyOffersAdmin(propertyId),
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

  // Effective fallback values (org default ?? system default)
  const fallback = {
    minNights: orgDefaults?.minNights ?? SYSTEM_DEFAULTS.minNights,
    maxNights: orgDefaults?.maxNights ?? SYSTEM_DEFAULTS.maxNights,
    minRooms: orgDefaults?.minRooms ?? SYSTEM_DEFAULTS.minRooms,
    maxRooms: orgDefaults?.maxRooms ?? SYSTEM_DEFAULTS.maxRooms,
    minOfferCurrency: orgDefaults?.minOfferCurrency ?? SYSTEM_DEFAULTS.minOfferCurrency,
  }

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
    if (!overrides) return
    setMinNights(overrides.minNights)
    setMaxNights(overrides.maxNights)
    setMinRooms(overrides.minRooms)
    setMaxRooms(overrides.maxRooms)
    setCancellation(overrides.allowedCancellationPolicies)
    setBoards(overrides.allowedBoardTypes)
    setChargeParties(overrides.allowedChargeParties)
    setPaymentMethods(overrides.allowedPaymentMethods)
    setMinOfferValue(overrides.minOfferValue)
    setMinOfferCurrency(overrides.minOfferCurrency)
    setBookingMode(overrides.bookingMode ?? orgDefaults?.bookingMode ?? 'single')
    setMultiRoomLimitBy(overrides.multiRoomLimitBy ?? orgDefaults?.multiRoomLimitBy ?? 'hotel')
    setIsDirty(false)
  }, [overrides, orgDefaults])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: UpdateOffersSettingsRequest) => apiClient.updatePropertyOffersSettings(propertyId, d),
    onSuccess: updated => {
      qc.setQueryData(qKey, updated)
    },
  })

  function doSave() {
    mutate({
      minNights,
      maxNights,
      minRooms,
      maxRooms,
      allowedCancellationPolicies: cancellation,
      allowedBoardTypes: boards,
      allowedChargeParties: chargeParties,
      allowedPaymentMethods: paymentMethods,
      minOfferValue,
      minOfferCurrency,
      bookingMode,
      multiRoomLimitBy,
    })
  }

  function markDirty() { setIsDirty(true) }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--color-text-muted)]">
        Loading…
      </div>
    )
  }

  function inheritHint(globalVal: number | null, systemVal: number) {
    const eff = globalVal ?? systemVal
    return `Inheriting: ${eff} (from ${globalVal != null ? 'global' : 'system default'})`
  }

  return (
    <form onSubmit={e => { e.preventDefault(); doSave() }} className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Offers</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Property-specific overrides. Leave blank to inherit from global defaults.
        </p>
      </div>

      <Section title="Search Constraints">
        <p className="text-xs text-[var(--color-text-muted)]">
          Guests see a validation message if they exceed these limits.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Min nights"
            value={minNights}
            placeholder={inheritHint(orgDefaults?.minNights ?? null, SYSTEM_DEFAULTS.minNights)}
            min={1}
            onChange={v => { setMinNights(v); markDirty() }}
          />
          <NumberField
            label="Max nights"
            value={maxNights}
            placeholder={inheritHint(orgDefaults?.maxNights ?? null, SYSTEM_DEFAULTS.maxNights)}
            min={1}
            onChange={v => { setMaxNights(v); markDirty() }}
          />
          <NumberField
            label="Min rooms"
            value={minRooms}
            placeholder={inheritHint(orgDefaults?.minRooms ?? null, SYSTEM_DEFAULTS.minRooms)}
            min={1}
            onChange={v => { setMinRooms(v); markDirty() }}
          />
          <NumberField
            label="Max rooms"
            value={maxRooms}
            placeholder={inheritHint(orgDefaults?.maxRooms ?? null, SYSTEM_DEFAULTS.maxRooms)}
            min={1}
            onChange={v => { setMaxRooms(v); markDirty() }}
          />
        </div>
      </Section>

      <Section title="Allow Multi-Room Booking Flow">
        <p className="text-xs text-[var(--color-text-muted)]">
          Single-room: selecting an offer goes straight to checkout. Multi-room: guests add offers to a cart and book all rooms at once.
          {orgDefaults?.bookingMode != null && ` Global default: ${orgDefaults.bookingMode}.`}
        </p>
        <div className="flex gap-4 pt-1">
          {([
            { value: 'single', label: 'Single-room booking', hint: 'Select → checkout immediately' },
            { value: 'multi',  label: 'Multi-room booking',  hint: 'Select → add to cart → book all' },
          ] as const).map(opt => (
            <label key={opt.value}
              className={[
                'flex flex-1 cursor-pointer flex-col gap-1 rounded-xl border-2 px-4 py-3 transition-colors',
                bookingMode === opt.value
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="bookingMode"
                  value={opt.value}
                  checked={bookingMode === opt.value}
                  onChange={() => { setBookingMode(opt.value); markDirty() }}
                  className="accent-[var(--color-primary)]"
                />
                <span className="text-sm font-medium text-[var(--color-text)]">{opt.label}</span>
              </div>
              <p className="ml-5 text-xs text-[var(--color-text-muted)]">{opt.hint}</p>
            </label>
          ))}
        </div>
        {bookingMode === 'multi' && (
          <MultiRoomLimitSelector value={multiRoomLimitBy} onChange={v => { setMultiRoomLimitBy(v); markDirty() }} />
        )}
      </Section>

      <Section title="Rate Filters">
        <p className="text-xs text-[var(--color-text-muted)]">
          Allowlists — only checked options shown to guests. Leave all checked to inherit global settings.
        </p>
        <CheckboxGroup
          label="Cancellation Policy"
          options={CANCELLATION_OPTIONS}
          value={cancellation}
          onChange={v => { setCancellation(v); markDirty() }}
          inheritedLabel={
            orgDefaults?.allowedCancellationPolicies
              ? `Global: ${orgDefaults.allowedCancellationPolicies.join(', ')}`
              : 'Global: all allowed'
          }
        />
        <CheckboxGroup
          label="Board Types"
          options={BOARD_OPTIONS}
          value={boards as string[] | null}
          onChange={v => { setBoards(v); markDirty() }}
          inheritedLabel={
            orgDefaults?.allowedBoardTypes
              ? `Global: ${orgDefaults.allowedBoardTypes.join(', ')}`
              : 'Global: all allowed'
          }
        />
        <CheckboxGroup
          label="Charge Party"
          options={CHARGE_PARTY_OPTIONS}
          value={chargeParties}
          onChange={v => { setChargeParties(v); markDirty() }}
          inheritedLabel={
            orgDefaults?.allowedChargeParties
              ? `Global: ${orgDefaults.allowedChargeParties.join(', ')}`
              : 'Global: all allowed'
          }
        />
        <CheckboxGroup
          label="Payment Method"
          options={PAYMENT_METHOD_OPTIONS}
          value={paymentMethods}
          onChange={v => { setPaymentMethods(v); markDirty() }}
          inheritedLabel={
            orgDefaults?.allowedPaymentMethods
              ? `Global: ${orgDefaults.allowedPaymentMethods.join(', ')}`
              : 'Global: all allowed'
          }
        />
      </Section>

      <Section title="Minimum Offer Value">
        <p className="text-xs text-[var(--color-text-muted)]">
          Offers below this price threshold are hidden.
          {orgDefaults?.minOfferValue != null
            ? ` Global: ${orgDefaults.minOfferValue} ${orgDefaults.minOfferCurrency ?? fallback.minOfferCurrency}`
            : ' Global: no minimum set.'}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Minimum value"
            hint="(blank = inherit global)"
            value={minOfferValue}
            placeholder={orgDefaults?.minOfferValue != null ? String(orgDefaults.minOfferValue) : 'no minimum'}
            min={0}
            onChange={v => { setMinOfferValue(v); markDirty() }}
          />
          <FormRow label="Currency">
            <select
              value={minOfferCurrency ?? ''}
              onChange={e => { setMinOfferCurrency(e.target.value || null); markDirty() }}
              className={inputCls}
            >
              <option value="">{fallback.minOfferCurrency} (default)</option>
              {[...new Set([hotelDefaultCurrency, ...hotelCurrencies, ...COMMON_CURRENCIES])]
                .map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormRow>
        </div>
      </Section>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={doSave} />
    </form>
  )
}
