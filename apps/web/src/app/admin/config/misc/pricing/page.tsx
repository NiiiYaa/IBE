'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../../property-context'
import { SaveBar } from '../../../design/components'
import type {
  SystemPricingConfigResponse,
  OrgPricingConfigResponse,
  PropertyPricingConfigResponse,
  DayRateAdminEntry,
} from '@ibe/shared'

// ── Shared primitives ─────────────────────────────────────────────────────────

const inputCls = 'w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={['relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="mb-5 text-base font-semibold text-[var(--color-text)]">{title}</h2>
      {children}
    </div>
  )
}

function PctField({ label, value, onChange, inherited }: { label: string; value: number | null; onChange: (v: number | null) => void; inherited?: number }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--color-text)]">{label}</span>
      <div className="flex items-center gap-2">
        {inherited !== undefined && value === null && (
          <span className="text-xs text-[var(--color-text-muted)]">({inherited}% inherited)</span>
        )}
        <div className="relative">
          <input
            type="number" min={0} max={100} step={1}
            value={value ?? ''}
            placeholder={inherited !== undefined ? String(inherited) : ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className={inputCls}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)]">%</span>
        </div>
      </div>
    </div>
  )
}

// ── Export helper ─────────────────────────────────────────────────────────────

function exportToExcel(rates: DayRateAdminEntry[], propertyId: number) {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const rows = rates.map(r => ({
    'Date': r.date,
    'Day of Week': DAYS[new Date(r.date + 'T00:00:00Z').getUTCDay()],
    'Min Sell Price': r.price,
    'Currency': r.currency,
    'Available': r.available ? 'Y' : 'N',
    'Calendar Color': r.calendarColor,
    'Anomaly Type': r.anomalyType ?? '',
    'Rolling Avg': r.rollingAvg ?? '',
    '% vs Avg': r.rollingAvg && r.rollingAvg > 0
      ? `${((r.price / r.rollingAvg - 1) * 100).toFixed(1)}%`
      : '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Rates')
  const d = new Date()
  const date = `${String(d.getDate()).padStart(2, '0')}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}-${d.getFullYear()}`
  XLSX.writeFile(wb, `Pricing ${propertyId}_${date}.xlsx`)
}

// ── System level ──────────────────────────────────────────────────────────────

function SystemPricingSection() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['pricing-config-system'],
    queryFn: () => apiClient.getSystemPricingConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<SystemPricingConfigResponse>) => apiClient.updateSystemPricingConfig(u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pricing-config-system'] }) },
  })

  const [form, setForm] = useState<SystemPricingConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const dirty = JSON.stringify(form) !== JSON.stringify(data)
  const set = (k: keyof SystemPricingConfigResponse) => (v: unknown) => setForm(f => f ? { ...f, [k]: v } : f)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between py-2">
        <span className="text-sm font-medium text-[var(--color-text)]">Enabled</span>
        <Toggle checked={form.enabled} onChange={set('enabled')} />
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Open to all organisations</span>
        <Toggle checked={form.openToAll} onChange={set('openToAll')} />
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Refresh interval (hours)</span>
        <input type="number" min={1} max={168} value={form.refreshIntervalHours}
          onChange={e => set('refreshIntervalHours')(Number(e.target.value))} className={inputCls} />
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Search adults</span>
        <select value={form.searchAdults} onChange={e => set('searchAdults')(Number(e.target.value) as 1 | 2)} className={inputCls}>
          <option value={1}>1 Adult</option>
          <option value={2}>2 Adults</option>
        </select>
      </div>
      <div className="border-t border-[var(--color-border)] pt-3 mt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Calendar thresholds</p>
        <PctField label="High Price %" value={form.highPricePct} onChange={v => set('highPricePct')(v ?? 15)} />
        <PctField label="Low Price %" value={form.lowPricePct} onChange={v => set('lowPricePct')(v ?? 15)} />
      </div>
      <div className="border-t border-[var(--color-border)] pt-3 mt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Anomaly thresholds</p>
        <PctField label="High Anomaly %" value={form.highAnomalyPct} onChange={v => set('highAnomalyPct')(v ?? 30)} />
        <PctField label="Low Anomaly %" value={form.lowAnomalyPct} onChange={v => set('lowAnomalyPct')(v ?? 30)} />
        <PctField label="Day Difference %" value={form.dayDifferencePct} onChange={v => set('dayDifferencePct')(v ?? 35)} />
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-[var(--color-text)]">Day Difference window (days)</span>
          <input type="number" min={1} max={90} value={form.dayDifferenceWindow}
            onChange={e => set('dayDifferenceWindow')(Number(e.target.value))} className={inputCls} />
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-[var(--color-text)]">Max offers for analysis</span>
          <input
            type="number" min={1} max={100}
            value={form.maxOffersForAnalysis}
            onChange={e => set('maxOffersForAnalysis')(Number(e.target.value))}
            className={inputCls}
          />
        </div>
      </div>
      <SaveBar isDirty={dirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate(form)} />
    </div>
  )
}

// ── Org level ─────────────────────────────────────────────────────────────────

function OrgPricingSection({ orgId }: { orgId: number }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['pricing-config-org', orgId],
    queryFn: () => apiClient.getOrgPricingConfig(orgId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<OrgPricingConfigResponse>) => apiClient.updateOrgPricingConfig(orgId, u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pricing-config-org', orgId] }) },
  })

  const [form, setForm] = useState<OrgPricingConfigResponse | null>(null)
  useEffect(() => { if (data) setForm(data) }, [data])

  if (!data || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const eff = data.effective
  const dirty = JSON.stringify(form) !== JSON.stringify(data)
  const set = (k: keyof OrgPricingConfigResponse) => (v: unknown) => setForm(f => f ? { ...f, [k]: v } : f)

  return (
    <div className="space-y-2">
      {form.systemServiceDisabled && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
          Pricing service is disabled for this organisation by a super admin.
        </div>
      )}
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Opt out of system pricing</span>
        <Toggle checked={form.systemServiceDisabled} onChange={set('systemServiceDisabled')} />
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Enabled override</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">{form.enabled === null ? '(inheriting)' : ''}</span>
          <Toggle checked={form.enabled ?? eff.enabled} onChange={v => set('enabled')(v)} />
          {form.enabled !== null && (
            <button onClick={() => set('enabled')(null)} className="text-xs text-[var(--color-primary)] underline">Reset</button>
          )}
        </div>
      </div>
      <PctField label="High Price %" value={form.highPricePct} onChange={set('highPricePct')} inherited={eff.highPricePct} />
      <PctField label="Low Price %" value={form.lowPricePct} onChange={set('lowPricePct')} inherited={eff.lowPricePct} />
      <PctField label="High Anomaly %" value={form.highAnomalyPct} onChange={set('highAnomalyPct')} inherited={eff.highAnomalyPct} />
      <PctField label="Low Anomaly %" value={form.lowAnomalyPct} onChange={set('lowAnomalyPct')} inherited={eff.lowAnomalyPct} />
      <PctField label="Day Difference %" value={form.dayDifferencePct} onChange={set('dayDifferencePct')} inherited={eff.dayDifferencePct} />
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Max offers for analysis</span>
        <div className="flex items-center gap-2">
          {form.maxOffersForAnalysis === null && (
            <span className="text-xs text-[var(--color-text-muted)]">({eff.maxOffersForAnalysis} inherited)</span>
          )}
          <input
            type="number" min={1} max={100}
            value={form.maxOffersForAnalysis ?? ''}
            placeholder={String(eff.maxOffersForAnalysis)}
            onChange={e => set('maxOffersForAnalysis')(e.target.value === '' ? null : Number(e.target.value))}
            className={inputCls}
          />
          {form.maxOffersForAnalysis !== null && (
            <button onClick={() => set('maxOffersForAnalysis')(null)} className="text-xs text-[var(--color-primary)] underline">Reset</button>
          )}
        </div>
      </div>
      <SaveBar isDirty={dirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate(form)} />
    </div>
  )
}

// ── Property level ────────────────────────────────────────────────────────────

function PropertyPricingSection({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const { data: config } = useQuery({
    queryKey: ['pricing-config-property', propertyId],
    queryFn: () => apiClient.getPropertyPricingConfig(propertyId),
  })
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['pricing-status', propertyId],
    queryFn: () => apiClient.getPricingStatus(propertyId),
    refetchInterval: 8_000,
  })
  const { data: ratesData } = useQuery({
    queryKey: ['pricing-admin-data', propertyId],
    queryFn: () => apiClient.getAdminPricingData(propertyId),
    enabled: (status?.dayCount ?? 0) > 0,
  })
  const saveMutation = useMutation({
    mutationFn: (u: Partial<PropertyPricingConfigResponse>) => apiClient.updatePropertyPricingConfig(propertyId, u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pricing-config-property', propertyId] }) },
  })
  const refreshMutation = useMutation({
    mutationFn: () => apiClient.triggerPricingRefresh(propertyId),
    onSuccess: () => { void refetchStatus() },
  })

  const [form, setForm] = useState<PropertyPricingConfigResponse | null>(null)
  useEffect(() => { if (config) setForm(config) }, [config])

  if (!config || !form) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  const eff = config.effective
  const dirty = JSON.stringify(form) !== JSON.stringify(config)
  const set = (k: keyof PropertyPricingConfigResponse) => (v: unknown) => setForm(f => f ? { ...f, [k]: v } : f)

  return (
    <div className="space-y-2">
      {form.orgServiceDisabled && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
          Pricing is disabled for this hotel by the chain admin.
        </div>
      )}
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Opt out</span>
        <Toggle checked={form.orgServiceDisabled} onChange={set('orgServiceDisabled')} />
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Enabled override</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">{form.enabled === null ? '(inheriting)' : ''}</span>
          <Toggle checked={form.enabled ?? eff.enabled} onChange={v => set('enabled')(v)} />
          {form.enabled !== null && (
            <button onClick={() => set('enabled')(null)} className="text-xs text-[var(--color-primary)] underline">Reset</button>
          )}
        </div>
      </div>
      <PctField label="High Price %" value={form.highPricePct} onChange={set('highPricePct')} inherited={eff.highPricePct} />
      <PctField label="Low Price %" value={form.lowPricePct} onChange={set('lowPricePct')} inherited={eff.lowPricePct} />
      <PctField label="High Anomaly %" value={form.highAnomalyPct} onChange={set('highAnomalyPct')} inherited={eff.highAnomalyPct} />
      <PctField label="Low Anomaly %" value={form.lowAnomalyPct} onChange={set('lowAnomalyPct')} inherited={eff.lowAnomalyPct} />
      <PctField label="Day Difference %" value={form.dayDifferencePct} onChange={set('dayDifferencePct')} inherited={eff.dayDifferencePct} />
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--color-text)]">Max offers for analysis</span>
        <div className="flex items-center gap-2">
          {form.maxOffersForAnalysis === null && (
            <span className="text-xs text-[var(--color-text-muted)]">({eff.maxOffersForAnalysis} inherited)</span>
          )}
          <input
            type="number" min={1} max={100}
            value={form.maxOffersForAnalysis ?? ''}
            placeholder={String(eff.maxOffersForAnalysis)}
            onChange={e => set('maxOffersForAnalysis')(e.target.value === '' ? null : Number(e.target.value))}
            className={inputCls}
          />
          {form.maxOffersForAnalysis !== null && (
            <button onClick={() => set('maxOffersForAnalysis')(null)} className="text-xs text-[var(--color-primary)] underline">Reset</button>
          )}
        </div>
      </div>
      <SaveBar isDirty={dirty} isSaving={saveMutation.isPending} onSave={() => saveMutation.mutate(form)} />

      <div className="mt-4 border-t border-[var(--color-border)] pt-4 flex items-center justify-between">
        <div className="text-xs text-[var(--color-text-muted)]">
          {status?.status === 'running' && 'Collecting…'}
          {status?.status === 'queued' && 'Queued…'}
          {status?.status === 'idle' && status.lastCollectedAt
            ? `Last collected: ${new Date(status.lastCollectedAt).toLocaleString()}`
            : status?.status === 'idle' ? 'Never collected' : ''}
          {status && status.dayCount > 0 && ` · ${status.dayCount} days`}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || status?.status === 'running' || status?.status === 'queued'}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40 transition-colors"
          >
            {refreshMutation.isPending ? 'Triggering…' : 'Refresh Now'}
          </button>
          <button
            onClick={() => ratesData && exportToExcel(ratesData, propertyId)}
            disabled={!ratesData || ratesData.length === 0}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Export Excel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PricingConfigPage() {
  const { admin } = useAdminAuth()
  const { propertyId, orgId } = useAdminProperty()
  const isSuper = admin?.role === 'super'
  const isSystem = propertyId == null && orgId == null && isSuper

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Calendar Rates</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Configure price calendar and anomaly detection thresholds.</p>
      </div>

      {isSystem && isSuper && (
        <SectionCard title="System Defaults">
          <SystemPricingSection />
        </SectionCard>
      )}

      {!isSystem && orgId != null && propertyId == null && (
        <SectionCard title="Chain Override">
          <OrgPricingSection orgId={orgId} />
        </SectionCard>
      )}

      {propertyId != null && (
        <SectionCard title="Hotel Settings">
          <PropertyPricingSection propertyId={propertyId} />
        </SectionCard>
      )}
    </div>
  )
}
