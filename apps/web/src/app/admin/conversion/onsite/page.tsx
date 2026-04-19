'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import { apiClient } from '@/lib/api-client'
import type {
  OnsiteConversionSettings,
  OnsiteConversionOverrides,
  OnsitePage,
  PropertyOnsiteConversionAdminResponse,
  PromoCode,
} from '@ibe/shared'

// ── UI primitives ──────────────────────────────────────────────────────────────

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>
      </div>
      <div className="space-y-4 px-5 py-4">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={['relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
      <span className={['pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
        checked ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function NumberInput({ value, onChange, min, max, suffix }: { value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="number" value={value} min={min} max={max}
        onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) onChange(v) }}
        className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-right focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
      />
      {suffix && <span className="text-xs text-[var(--color-text-muted)]">{suffix}</span>}
    </div>
  )
}

function SettingRow({ label, hint, inherited, children }: { label: string; hint?: string; inherited?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-[var(--color-text)]">{label}</p>
          {inherited && (
            <span className="rounded bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              inherited
            </span>
          )}
        </div>
        {hint && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const PAGE_OPTIONS: { value: OnsitePage; label: string }[] = [
  { value: 'chain', label: 'Chain-page' },
  { value: 'hotel', label: 'Hotel-page' },
  { value: 'room', label: 'Room-page' },
]

function PagesSelector({
  value,
  onChange,
  inherited,
  onReset,
}: {
  value: OnsitePage[]
  onChange: (pages: OnsitePage[]) => void
  inherited?: boolean
  onReset?: () => void
}) {
  function toggle(page: OnsitePage) {
    const next = value.includes(page) ? value.filter(p => p !== page) : [...value, page]
    onChange(next)
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <p className="text-sm text-[var(--color-text)]">Show on pages</p>
        {inherited && (
          <span className="rounded bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">inherited</span>
        )}
        {onReset && !inherited && (
          <button onClick={onReset} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {PAGE_OPTIONS.map(opt => (
          <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={value.includes(opt.value)}
              onChange={() => toggle(opt.value)}
              className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  )
}

function SaveBar({ isDirty, isSaving, onSave }: { isDirty: boolean; isSaving: boolean; onSave: () => void }) {
  if (!isDirty && !isSaving) return null
  return (
    <div className="fixed bottom-6 z-50 flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-xl" style={{ right: 'max(24px, calc((100vw - 988px) / 2 + 24px))' }}>
      <p className="text-sm text-[var(--color-text-muted)]">Unsaved changes</p>
      <button
        onClick={onSave}
        disabled={isSaving}
        className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {isSaving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

function mergeEffective(
  ov: OnsiteConversionOverrides,
  org: OnsiteConversionSettings,
): OnsiteConversionSettings {
  return {
    presenceEnabled: ov.presenceEnabled ?? org.presenceEnabled,
    presenceMinViewers: ov.presenceMinViewers ?? org.presenceMinViewers,
    presenceMessage: ov.presenceMessage ?? org.presenceMessage,
    presencePages: ov.presencePages ?? org.presencePages,
    bookingsEnabled: ov.bookingsEnabled ?? org.bookingsEnabled,
    bookingsWindowHours: ov.bookingsWindowHours ?? org.bookingsWindowHours,
    bookingsMinCount: ov.bookingsMinCount ?? org.bookingsMinCount,
    bookingsMessage: ov.bookingsMessage ?? org.bookingsMessage,
    bookingsPages: ov.bookingsPages ?? org.bookingsPages,
    popupEnabled: ov.popupEnabled ?? org.popupEnabled,
    popupDelaySeconds: ov.popupDelaySeconds ?? org.popupDelaySeconds,
    popupMessage: ov.popupMessage ?? org.popupMessage,
    popupPromoCode: ov.popupPromoCode ?? org.popupPromoCode,
    popupPages: ov.popupPages ?? org.popupPages,
  }
}

// ── Global editor ──────────────────────────────────────────────────────────────

function GlobalEditor({ promoCodes }: { promoCodes: PromoCode[] }) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['onsite-conversion-global'],
    queryFn: () => apiClient.getOnsiteConversionGlobal(),
    staleTime: 30_000,
  })

  const mutation = useMutation({
    mutationFn: (draft: OnsiteConversionSettings) => apiClient.updateOnsiteConversionGlobal(draft),
    onSuccess: (updated) => {
      qc.setQueryData(['onsite-conversion-global'], updated)
      setDraft(updated)
    },
  })

  const [draft, setDraft] = useState<OnsiteConversionSettings | null>(null)

  useEffect(() => {
    if (data && !draft) setDraft(data)
  }, [data, draft])

  if (isLoading || !data || !draft) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-36 animate-pulse rounded-xl bg-[var(--color-border)]" />)}</div>
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(data)

  return (
    <div className="space-y-5">
      <SettingsForm
        settings={draft}
        onUpdate={patch => setDraft(prev => ({ ...prev!, ...patch }))}
        promoCodes={promoCodes}
      />
      <SaveBar isDirty={isDirty} isSaving={mutation.isPending} onSave={() => mutation.mutate(draft)} />
    </div>
  )
}

// ── Property editor ────────────────────────────────────────────────────────────

function PropertyEditor({ propertyId, promoCodes }: { propertyId: number; promoCodes: PromoCode[] }) {
  const qc = useQueryClient()
  const qKey = ['onsite-conversion-property', propertyId]

  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => apiClient.getOnsiteConversionProperty(propertyId),
    staleTime: 30_000,
  })

  const mutation = useMutation({
    mutationFn: (ov: OnsiteConversionOverrides) => apiClient.updateOnsiteConversionProperty(propertyId, ov),
    onSuccess: (updated) => {
      qc.setQueryData(qKey, updated)
      setDraftOverrides(updated.overrides)
    },
  })

  const [draftOverrides, setDraftOverrides] = useState<OnsiteConversionOverrides | null>(null)

  useEffect(() => {
    if (data && !draftOverrides) setDraftOverrides(data.overrides)
  }, [data, draftOverrides])

  if (isLoading || !data || !draftOverrides) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-36 animate-pulse rounded-xl bg-[var(--color-border)]" />)}</div>
  }

  const draftData: PropertyOnsiteConversionAdminResponse = {
    ...data,
    overrides: draftOverrides,
    effective: mergeEffective(draftOverrides, data.orgDefaults),
  }

  const isDirty = JSON.stringify(draftOverrides) !== JSON.stringify(data.overrides)

  function update(patch: Partial<OnsiteConversionOverrides>) {
    setDraftOverrides(prev => ({ ...prev!, ...patch }))
  }
  function reset(keys: (keyof OnsiteConversionOverrides)[]) {
    setDraftOverrides(prev => ({ ...prev!, ...Object.fromEntries(keys.map(k => [k, null])) }))
  }

  return (
    <div className="space-y-5">
      <PropertySettingsForm data={draftData} onUpdate={update} onReset={reset} promoCodes={promoCodes} />
      <SaveBar isDirty={isDirty} isSaving={mutation.isPending} onSave={() => mutation.mutate(draftOverrides)} />
    </div>
  )
}

// ── Shared settings form (global) ─────────────────────────────────────────────

function SettingsForm({
  settings,
  onUpdate,
  promoCodes,
}: {
  settings: OnsiteConversionSettings
  onUpdate: (patch: Partial<OnsiteConversionSettings>) => void
  promoCodes: PromoCode[]
}) {
  return (
    <div className="space-y-5">
      <SectionCard title="Live Viewers" description="Shows how many people are currently viewing the property.">
        <SettingRow label="Enable" hint="Show live viewer count to guests.">
          <Toggle checked={settings.presenceEnabled} onChange={v => onUpdate({ presenceEnabled: v })} />
        </SettingRow>
        <SettingRow label="Minimum viewers to show" hint="Only display when at least this many guests are active.">
          <NumberInput value={settings.presenceMinViewers} min={2} max={99} onChange={v => onUpdate({ presenceMinViewers: v })} />
        </SettingRow>
        <div className="space-y-1.5">
          <p className="text-sm text-[var(--color-text)]">Message</p>
          <p className="text-xs text-[var(--color-text-muted)]">Use <code className="rounded bg-[var(--color-background)] px-1">[xx]</code> for the viewer count.</p>
          <input type="text" value={settings.presenceMessage}
            onChange={e => onUpdate({ presenceMessage: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
          />
        </div>
        <PagesSelector value={settings.presencePages} onChange={pages => onUpdate({ presencePages: pages })} />
      </SectionCard>

      <SectionCard title="Recent Bookings" description="Shows how many times the property was recently booked.">
        <SettingRow label="Enable">
          <Toggle checked={settings.bookingsEnabled} onChange={v => onUpdate({ bookingsEnabled: v })} />
        </SettingRow>
        <SettingRow label="Time window" hint="Count bookings within this period.">
          <NumberInput value={settings.bookingsWindowHours} min={1} max={168} suffix="hours" onChange={v => onUpdate({ bookingsWindowHours: v })} />
        </SettingRow>
        <SettingRow label="Minimum bookings to show">
          <NumberInput value={settings.bookingsMinCount} min={1} max={99} onChange={v => onUpdate({ bookingsMinCount: v })} />
        </SettingRow>
        <div className="space-y-1.5">
          <p className="text-sm text-[var(--color-text)]">Message</p>
          <p className="text-xs text-[var(--color-text-muted)]">Use <code className="rounded bg-[var(--color-background)] px-1">[xx]</code> for count, <code className="rounded bg-[var(--color-background)] px-1">[hh]</code> for hours window.</p>
          <input type="text" value={settings.bookingsMessage}
            onChange={e => onUpdate({ bookingsMessage: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
          />
        </div>
        <PagesSelector value={settings.bookingsPages} onChange={pages => onUpdate({ bookingsPages: pages })} />
      </SectionCard>

      <SectionCard title="Timed Promo Popup" description="Shown after the guest has been on the page for a set time.">
        <SettingRow label="Enable">
          <Toggle checked={settings.popupEnabled} onChange={v => onUpdate({ popupEnabled: v })} />
        </SettingRow>
        <SettingRow label="Show after">
          <NumberInput value={settings.popupDelaySeconds} min={5} max={300} suffix="seconds" onChange={v => onUpdate({ popupDelaySeconds: v })} />
        </SettingRow>
        <div className="space-y-1.5">
          <p className="text-sm text-[var(--color-text)]">Message</p>
          <p className="text-xs text-[var(--color-text-muted)]">Use <code className="rounded bg-[var(--color-background)] px-1">[xx]</code> for the promo code discount %.</p>
          <textarea rows={2} value={settings.popupMessage ?? ''}
            placeholder="e.g. Book now, and get [xx]% off"
            onChange={e => onUpdate({ popupMessage: e.target.value || null })}
            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
          />
        </div>
        <PromoCodeSelect value={settings.popupPromoCode} onChange={v => onUpdate({ popupPromoCode: v })} promoCodes={promoCodes} />
        <PagesSelector value={settings.popupPages} onChange={pages => onUpdate({ popupPages: pages })} />
      </SectionCard>
    </div>
  )
}

// ── Property settings form (with inherit) ─────────────────────────────────────

function PropertySettingsForm({
  data,
  onUpdate,
  onReset,
  promoCodes,
}: {
  data: PropertyOnsiteConversionAdminResponse
  onUpdate: (patch: Partial<OnsiteConversionOverrides>) => void
  onReset: (keys: (keyof OnsiteConversionOverrides)[]) => void
  promoCodes: PromoCode[]
}) {
  const { overrides: ov, orgDefaults: org, effective: eff } = data

  return (
    <div className="space-y-5">
      <SectionCard title="Live Viewers" description="Shows how many people are currently viewing the property.">
        <SettingRow label="Enable" inherited={ov.presenceEnabled === null}>
          <div className="flex items-center gap-3">
            {ov.presenceEnabled !== null && (
              <button onClick={() => onReset(['presenceEnabled'])} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>
            )}
            <Toggle checked={eff.presenceEnabled} onChange={v => onUpdate({ presenceEnabled: v })} />
          </div>
        </SettingRow>
        <SettingRow label="Minimum viewers" inherited={ov.presenceMinViewers === null}>
          <div className="flex items-center gap-3">
            {ov.presenceMinViewers !== null && (
              <button onClick={() => onReset(['presenceMinViewers'])} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>
            )}
            <NumberInput value={eff.presenceMinViewers} min={2} max={99} onChange={v => onUpdate({ presenceMinViewers: v })} />
          </div>
        </SettingRow>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm text-[var(--color-text)]">Message</p>
            {ov.presenceMessage !== null && (
              <button onClick={() => onReset(['presenceMessage'])} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>
            )}
            {ov.presenceMessage === null && (
              <span className="rounded bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">inherited</span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">Use <code className="rounded bg-[var(--color-background)] px-1">[xx]</code> for the viewer count.</p>
          <input type="text" value={eff.presenceMessage}
            onChange={e => onUpdate({ presenceMessage: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
          />
        </div>
        <PagesSelector
          value={eff.presencePages}
          onChange={pages => onUpdate({ presencePages: pages })}
          {...(ov.presencePages === null ? { inherited: true } : { onReset: () => onReset(['presencePages']) })}
        />
      </SectionCard>

      <SectionCard title="Recent Bookings" description="Shows how many times the property was recently booked.">
        <SettingRow label="Enable" inherited={ov.bookingsEnabled === null}>
          <div className="flex items-center gap-3">
            {ov.bookingsEnabled !== null && <button onClick={() => onReset(['bookingsEnabled'])} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>}
            <Toggle checked={eff.bookingsEnabled} onChange={v => onUpdate({ bookingsEnabled: v })} />
          </div>
        </SettingRow>
        <SettingRow label="Time window" inherited={ov.bookingsWindowHours === null}>
          <div className="flex items-center gap-3">
            {ov.bookingsWindowHours !== null && <button onClick={() => onReset(['bookingsWindowHours'])} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>}
            <NumberInput value={eff.bookingsWindowHours} min={1} max={168} suffix="hours" onChange={v => onUpdate({ bookingsWindowHours: v })} />
          </div>
        </SettingRow>
        <SettingRow label="Minimum bookings" inherited={ov.bookingsMinCount === null}>
          <div className="flex items-center gap-3">
            {ov.bookingsMinCount !== null && <button onClick={() => onReset(['bookingsMinCount'])} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>}
            <NumberInput value={eff.bookingsMinCount} min={1} max={99} onChange={v => onUpdate({ bookingsMinCount: v })} />
          </div>
        </SettingRow>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm text-[var(--color-text)]">Message</p>
            {ov.bookingsMessage !== null && (
              <button onClick={() => onReset(['bookingsMessage'])} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>
            )}
            {ov.bookingsMessage === null && (
              <span className="rounded bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">inherited</span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">Use <code className="rounded bg-[var(--color-background)] px-1">[xx]</code> for count, <code className="rounded bg-[var(--color-background)] px-1">[hh]</code> for hours window.</p>
          <input type="text" value={eff.bookingsMessage}
            onChange={e => onUpdate({ bookingsMessage: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
          />
        </div>
        <PagesSelector
          value={eff.bookingsPages}
          onChange={pages => onUpdate({ bookingsPages: pages })}
          {...(ov.bookingsPages === null ? { inherited: true } : { onReset: () => onReset(['bookingsPages']) })}
        />
      </SectionCard>

      <SectionCard title="Timed Promo Popup" description="Shown after the guest has been on the page for a set time.">
        <SettingRow label="Enable" inherited={ov.popupEnabled === null}>
          <div className="flex items-center gap-3">
            {ov.popupEnabled !== null && <button onClick={() => onReset(['popupEnabled'])} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>}
            <Toggle checked={eff.popupEnabled} onChange={v => onUpdate({ popupEnabled: v })} />
          </div>
        </SettingRow>
        <SettingRow label="Show after" inherited={ov.popupDelaySeconds === null}>
          <div className="flex items-center gap-3">
            {ov.popupDelaySeconds !== null && <button onClick={() => onReset(['popupDelaySeconds'])} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>}
            <NumberInput value={eff.popupDelaySeconds} min={5} max={300} suffix="seconds" onChange={v => onUpdate({ popupDelaySeconds: v })} />
          </div>
        </SettingRow>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm text-[var(--color-text)]">Message</p>
            {ov.popupMessage !== null && (
              <button onClick={() => onReset(['popupMessage'])} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>
            )}
            {ov.popupMessage === null && (
              <span className="rounded bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">inherited</span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">Use <code className="rounded bg-[var(--color-background)] px-1">[xx]</code> for the promo code discount %.</p>
          <textarea rows={2} value={eff.popupMessage ?? ''}
            placeholder="e.g. Book now, and get [xx]% off"
            onChange={e => onUpdate({ popupMessage: e.target.value || null })}
            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm text-[var(--color-text)]">Promo code</p>
            {ov.popupPromoCode !== null && (
              <button onClick={() => onReset(['popupPromoCode'])} className="text-xs text-[var(--color-text-muted)] underline">Reset</button>
            )}
            {ov.popupPromoCode === null && (
              <span className="rounded bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">inherited</span>
            )}
          </div>
          <PromoCodeSelect value={eff.popupPromoCode} onChange={v => onUpdate({ popupPromoCode: v })} promoCodes={promoCodes} />
        </div>
        <PagesSelector
          value={eff.popupPages}
          onChange={pages => onUpdate({ popupPages: pages })}
          {...(ov.popupPages === null ? { inherited: true } : { onReset: () => onReset(['popupPages']) })}
        />
      </SectionCard>
    </div>
  )
}

// ── Promo code dropdown ────────────────────────────────────────────────────────

function PromoCodeSelect({ value, onChange, promoCodes }: { value: string | null; onChange: (v: string | null) => void; promoCodes: PromoCode[] }) {
  const active = promoCodes.filter(p => p.isActive)
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-[var(--color-text)]">
        Promo code <span className="text-xs text-[var(--color-text-muted)]">(optional — auto-fills on the booking form)</span>
      </p>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
      >
        <option value="">— None —</option>
        {active.map(p => (
          <option key={p.id} value={p.code}>
            {p.code}{p.discountValue ? ` — ${p.discountValue}% off` : ''}
          </option>
        ))}
        {active.length === 0 && <option disabled>No active promo codes</option>}
      </select>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OnsiteConversionPage() {
  const { isAuthenticated } = useAdminAuth()
  const { propertyId } = useAdminProperty()

  const { data: promoCodes = [] } = useQuery({
    queryKey: ['promo-codes', propertyId],
    queryFn: () => apiClient.listPromoCodes(propertyId),
    enabled: isAuthenticated,
    staleTime: 60_000,
  })

  if (propertyId === undefined) return null

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Onsite Conversion</h1>
      <p className="mb-1 text-sm text-[var(--color-text-muted)]">
        Real-time signals and prompts that encourage guests to complete their booking.
      </p>
      {propertyId !== null && (
        <p className="mb-6 text-xs text-[var(--color-text-muted)]">
          Settings marked <span className="font-medium">inherited</span> use the global defaults. Change a value to override for this property, or reset to inherit again.
        </p>
      )}
      {!propertyId && <div className="mb-6" />}

      {propertyId === null
        ? <GlobalEditor promoCodes={promoCodes} />
        : <PropertyEditor propertyId={propertyId} promoCodes={promoCodes} />
      }
    </div>
  )
}
