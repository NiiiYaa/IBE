'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import type { ExternalIBEConfigRow, ExternalIBEAnalyzeResponse } from '@ibe/shared'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
      ].join(' ')}
    >
      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function MappingTable({ mapping, unmapped, highlightConcept }: {
  mapping: ExternalIBEAnalyzeResponse['mapping']
  unmapped: string[]
  highlightConcept?: string
}) {
  return (
    <div className="mt-3 space-y-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[var(--color-text-muted)]">
            <th className="pb-1 pr-4 font-medium">Concept</th>
            <th className="pb-1 pr-4 font-medium">Detected param</th>
            <th className="pb-1 font-medium">Example value</th>
          </tr>
        </thead>
        <tbody>
          {mapping.map(m => (
            <tr
              key={m.concept}
              className={[
                'border-t border-[var(--color-border)]',
                highlightConcept === m.concept ? 'bg-[var(--color-primary-light)]' : '',
              ].join(' ')}
            >
              <td className="py-1.5 pr-4 font-mono text-xs text-[var(--color-primary)]">{`{${m.concept}}`}</td>
              <td className="py-1.5 pr-4 font-mono text-xs text-[var(--color-text)]">{m.detectedParam}</td>
              <td className="py-1.5 font-mono text-xs text-[var(--color-text-muted)]">{m.exampleValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {unmapped.length > 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Not mapped (will be ignored): {unmapped.join(', ')}
        </p>
      )}
    </div>
  )
}

function AnalysisSection({
  label,
  type,
  singleUrl,
  orgId,
  propertyId,
  result,
  onResult,
  urls: controlledUrls,
  onUrlsChange,
  highlightConcept,
}: {
  label: string
  type: 'search' | 'booking'
  singleUrl?: boolean
  orgId?: number
  propertyId?: number
  result: ExternalIBEAnalyzeResponse | null
  onResult: (r: ExternalIBEAnalyzeResponse) => void
  urls?: string
  onUrlsChange?: (v: string) => void
  highlightConcept?: string
}) {
  const [internalUrls, setInternalUrls] = useState('')
  const urls = controlledUrls ?? internalUrls
  const setUrls = onUrlsChange ?? setInternalUrls
  const [error, setError] = useState<string | null>(null)

  const analyzeMutation = useMutation({
    mutationFn: () => apiClient.analyzeExternalIBEUrls({
      urls: urls.split('\n').map(u => u.trim()).filter(Boolean),
      type,
      ...(orgId !== undefined ? { orgId } : {}),
      ...(propertyId !== undefined ? { propertyId } : {}),
    }),
    onSuccess: r => { onResult(r); setError(null) },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Analysis failed'),
  })

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-[var(--color-text)]">{label}</label>
      <textarea
        value={urls}
        onChange={e => setUrls(e.target.value)}
        placeholder={singleUrl ? 'Paste one sample URL from this hotel' : 'Paste one or more sample URLs (one per line)'}
        rows={singleUrl ? 2 : 4}
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
      />
      <button
        type="button"
        disabled={!urls.trim() || analyzeMutation.isPending}
        onClick={() => analyzeMutation.mutate()}
        className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {analyzeMutation.isPending ? 'Analyzing…' : singleUrl ? 'Extract ID' : 'Analyze'}
      </button>
      {error && <p className="text-sm text-error">{error}</p>}
      {result && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">Generated template</p>
          <p className="font-mono text-sm text-[var(--color-text)] break-all">{result.template}</p>
          <MappingTable mapping={result.mapping} unmapped={result.unmapped} {...(highlightConcept !== undefined ? { highlightConcept } : {})} />
        </div>
      )}
    </div>
  )
}

function ChannelToggles({
  mcp, affiliate, widget, disabled,
  onChange,
}: {
  mcp: boolean; affiliate: boolean; widget: boolean
  disabled: boolean
  onChange: (key: 'mcpEnabled' | 'affiliateEnabled' | 'widgetEnabled', v: boolean) => void
}) {
  return (
    <div className="space-y-3">
      {([
        ['mcpEnabled', 'MCP', mcp],
        ['affiliateEnabled', 'Affiliate', affiliate],
        ['widgetEnabled', 'Widget', widget],
      ] as const).map(([key, lbl, val]) => (
        <div key={key} className="flex items-center justify-between">
          <span className={`text-sm ${disabled ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`}>{lbl}</span>
          <Toggle checked={val} onChange={v => !disabled && onChange(key, v)} />
        </div>
      ))}
      {disabled && (
        <p className="text-xs text-[var(--color-text-muted)]">Save at least one template to enable channel toggles.</p>
      )}
    </div>
  )
}

function FullTemplateUI({
  existing,
  scope,
  onSaved,
  onDeleted,
}: {
  existing: ExternalIBEConfigRow | null
  scope: { orgId?: number; propertyId?: number }
  onSaved: () => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const [searchResult, setSearchResult] = useState<ExternalIBEAnalyzeResponse | null>(null)
  const [bookingResult, setBookingResult] = useState<ExternalIBEAnalyzeResponse | null>(null)
  const [searchUrls, setSearchUrls] = useState('')
  const [bookingUrls, setBookingUrls] = useState('')
  const [mcpEnabled, setMcpEnabled] = useState(existing?.mcpEnabled ?? false)
  const [affiliateEnabled, setAffiliateEnabled] = useState(existing?.affiliateEnabled ?? false)
  const [widgetEnabled, setWidgetEnabled] = useState(existing?.widgetEnabled ?? false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const hasTemplates = !!(existing?.searchTemplate || existing?.bookingTemplate || searchResult || bookingResult)

  const saveMutation = useMutation({
    mutationFn: () => apiClient.upsertExternalIBEConfig({
      ...(searchResult ? { searchTemplate: searchResult.template, searchSampleUrls: searchUrls.split('\n').map(u => u.trim()).filter(Boolean) } : {}),
      ...(bookingResult ? { bookingTemplate: bookingResult.template, bookingSampleUrls: bookingUrls.split('\n').map(u => u.trim()).filter(Boolean) } : {}),
      mcpEnabled,
      affiliateEnabled,
      widgetEnabled,
    }, scope),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); onSaved() },
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteExternalIBEConfig(scope),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); onDeleted() },
  })

  return (
    <div className="space-y-6">
      {existing && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-1">
          <p className="text-xs font-medium text-[var(--color-text-muted)]">Current search template</p>
          <p className="font-mono text-sm text-[var(--color-text)] break-all">{existing.searchTemplate ?? '—'}</p>
          <p className="text-xs font-medium text-[var(--color-text-muted)] mt-2">Current booking template</p>
          <p className="font-mono text-sm text-[var(--color-text)] break-all">{existing.bookingTemplate ?? '—'}</p>
        </div>
      )}

      <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Search page URL</h3>
        <AnalysisSection
          label="Paste one or more sample search page URLs (one per line)"
          type="search"
          {...(scope.orgId !== undefined ? { orgId: scope.orgId } : {})}
          {...(scope.propertyId !== undefined ? { propertyId: scope.propertyId } : {})}
          result={searchResult}
          onResult={setSearchResult}
          urls={searchUrls}
          onUrlsChange={setSearchUrls}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Booking page URL</h3>
        <AnalysisSection
          label="Paste one or more sample booking page URLs (one per line)"
          type="booking"
          {...(scope.orgId !== undefined ? { orgId: scope.orgId } : {})}
          {...(scope.propertyId !== undefined ? { propertyId: scope.propertyId } : {})}
          result={bookingResult}
          onResult={setBookingResult}
          urls={bookingUrls}
          onUrlsChange={setBookingUrls}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Channel toggles</h3>
        <ChannelToggles
          mcp={mcpEnabled}
          affiliate={affiliateEnabled}
          widget={widgetEnabled}
          disabled={!hasTemplates}
          onChange={(k, v) => {
            if (k === 'mcpEnabled') setMcpEnabled(v)
            else if (k === 'affiliateEnabled') setAffiliateEnabled(v)
            else setWidgetEnabled(v)
          }}
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {existing && !deleteConfirm && (
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            className="rounded-lg border border-error/30 px-4 py-2 text-sm font-medium text-error hover:bg-error/5 transition-colors"
          >
            Delete config
          </button>
        )}
        {deleteConfirm && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-muted)]">Are you sure?</span>
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              className="rounded-lg bg-error px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button type="button" onClick={() => setDeleteConfirm(false)} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SimplifiedHotelUI({
  chainConfig,
  hotelExisting,
  propertyId,
  orgId,
  onSaved,
  onDeleted,
}: {
  chainConfig: ExternalIBEConfigRow
  hotelExisting: ExternalIBEConfigRow | null
  propertyId: number
  orgId: number
  onSaved: () => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const [idResult, setIdResult] = useState<ExternalIBEAnalyzeResponse | null>(null)
  const [mcpEnabled, setMcpEnabled] = useState(hotelExisting?.mcpEnabled ?? chainConfig.mcpEnabled)
  const [affiliateEnabled, setAffiliateEnabled] = useState(hotelExisting?.affiliateEnabled ?? chainConfig.affiliateEnabled)
  const [widgetEnabled, setWidgetEnabled] = useState(hotelExisting?.widgetEnabled ?? chainConfig.widgetEnabled)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searchResult, setSearchResult] = useState<ExternalIBEAnalyzeResponse | null>(null)
  const [bookingResult, setBookingResult] = useState<ExternalIBEAnalyzeResponse | null>(null)
  const [advSearchUrls, setAdvSearchUrls] = useState('')
  const [advBookingUrls, setAdvBookingUrls] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const detectedId = idResult?.mapping.find(m => m.concept === 'externalHotelId')?.exampleValue

  const saveMutation = useMutation({
    mutationFn: () => {
      const data: Record<string, unknown> = { mcpEnabled, affiliateEnabled, widgetEnabled }
      if (detectedId) data['externalHotelId'] = detectedId
      if (searchResult) { data['searchTemplate'] = searchResult.template; data['searchSampleUrls'] = advSearchUrls.split('\n').map(u => u.trim()).filter(Boolean) }
      if (bookingResult) { data['bookingTemplate'] = bookingResult.template; data['bookingSampleUrls'] = advBookingUrls.split('\n').map(u => u.trim()).filter(Boolean) }
      return apiClient.upsertExternalIBEConfig(data, { propertyId })
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); onSaved() },
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteExternalIBEConfig({ propertyId }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); onDeleted() },
  })

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <p className="text-xs font-medium text-[var(--color-text-muted)]">Templates inherited from chain configuration</p>
        <div className="space-y-1">
          <p className="text-xs text-[var(--color-text-muted)]">Search</p>
          <p className="font-mono text-sm text-[var(--color-text)] break-all">{chainConfig.searchTemplate ?? '—'}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-[var(--color-text-muted)]">Booking</p>
          <p className="font-mono text-sm text-[var(--color-text)] break-all">{chainConfig.bookingTemplate ?? '—'}</p>
        </div>
      </div>

      <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Your external hotel ID</h3>
        {hotelExisting?.externalHotelId && !detectedId && (
          <p className="text-sm text-[var(--color-text)]">
            Current ID: <span className="font-mono font-medium">{hotelExisting.externalHotelId}</span>
          </p>
        )}
        <AnalysisSection
          label="Paste one sample URL from your external booking page to extract this hotel's ID"
          type="booking"
          singleUrl
          propertyId={propertyId}
          orgId={orgId}
          result={idResult}
          onResult={setIdResult}
          highlightConcept="externalHotelId"
        />
        {detectedId && (
          <p className="text-sm text-[var(--color-text)]">
            Your external hotel ID: <span className="font-mono font-medium text-[var(--color-primary)]">{detectedId}</span>
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Channel toggles</h3>
        <ChannelToggles
          mcp={mcpEnabled}
          affiliate={affiliateEnabled}
          widget={widgetEnabled}
          disabled={false}
          onChange={(k, v) => {
            if (k === 'mcpEnabled') setMcpEnabled(v)
            else if (k === 'affiliateEnabled') setAffiliateEnabled(v)
            else setWidgetEnabled(v)
          }}
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {hotelExisting && !deleteConfirm && (
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            className="rounded-lg border border-error/30 px-4 py-2 text-sm font-medium text-error hover:bg-error/5 transition-colors"
          >
            Delete override
          </button>
        )}
        {deleteConfirm && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-muted)]">Revert to chain config?</span>
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              className="rounded-lg bg-error px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Yes, revert'}
            </button>
            <button type="button" onClick={() => setDeleteConfirm(false)} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              Cancel
            </button>
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] flex items-center gap-1"
        >
          <svg className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Advanced: override templates
        </button>
        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Search page URL override</h3>
              <AnalysisSection
                label="Paste sample search page URLs"
                type="search"
                propertyId={propertyId}
                result={searchResult}
                onResult={setSearchResult}
                urls={advSearchUrls}
                onUrlsChange={setAdvSearchUrls}
              />
            </section>
            <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Booking page URL override</h3>
              <AnalysisSection
                label="Paste sample booking page URLs"
                type="booking"
                propertyId={propertyId}
                result={bookingResult}
                onResult={setBookingResult}
                urls={advBookingUrls}
                onUrlsChange={setAdvBookingUrls}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ExternalIBEPage() {
  const { admin } = useAdminAuth()
  const { propertyId: contextPropertyId, orgId: contextOrgId } = useAdminProperty()
  const qc = useQueryClient()
  const [savedBanner, setSavedBanner] = useState(false)

  const isHotelLevel = contextPropertyId !== null
  const isSuper = admin?.role === 'super'

  const propertyScope = isHotelLevel ? { propertyId: contextPropertyId! } : undefined
  const orgScope = isSuper
    ? (contextOrgId !== null ? { orgId: contextOrgId! } : undefined)
    : (admin?.organizationId ? { orgId: admin.organizationId } : undefined)

  const hotelQuery = useQuery({
    queryKey: ['external-ibe', 'hotel', contextPropertyId],
    queryFn: () => apiClient.getExternalIBEConfig(propertyScope!),
    enabled: isHotelLevel,
  })

  const orgQuery = useQuery({
    queryKey: ['external-ibe', 'org', orgScope?.orgId ?? contextOrgId],
    queryFn: () => apiClient.getExternalIBEConfig(orgScope!),
    enabled: !!orgScope,
  })

  if (!admin) return null

  const isLoading = (isHotelLevel ? hotelQuery.isLoading : false) || orgQuery.isLoading

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--color-border)]" />
          ))}
        </div>
      </main>
    )
  }

  const chainConfig = orgQuery.data ?? null
  const hotelConfig = hotelQuery.data ?? null

  const hotelHasOwnTemplates = !!(hotelConfig?.searchTemplate || hotelConfig?.bookingTemplate)
  const showSimplified = isHotelLevel && chainConfig !== null && !hotelHasOwnTemplates
  const scope = isHotelLevel ? propertyScope! : orgScope!

  if (!scope) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm text-[var(--color-text-muted)]">Select a property or organisation to configure.</p>
      </main>
    )
  }

  function handleSaved() {
    setSavedBanner(true)
    setTimeout(() => setSavedBanner(false), 3000)
  }

  function handleDeleted() {
    void qc.invalidateQueries({ queryKey: ['external-ibe'] })
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">External IBE</h1>
        {savedBanner && (
          <span className="text-sm text-success font-medium">Saved</span>
        )}
      </div>

      {isHotelLevel && !chainConfig && (
        <p className="text-sm text-[var(--color-text-muted)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          No chain configuration found. Configure templates directly for this property.
        </p>
      )}

      {isHotelLevel && chainConfig && hotelConfig && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">Hotel-level override active</p>
        </div>
      )}

      {isHotelLevel && chainConfig && !hotelConfig && (
        <p className="text-sm text-[var(--color-text-muted)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          Using chain configuration
        </p>
      )}

      {showSimplified ? (
        <SimplifiedHotelUI
          chainConfig={chainConfig!}
          hotelExisting={hotelConfig}
          propertyId={contextPropertyId!}
          orgId={orgScope?.orgId ?? admin.organizationId ?? 0}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : (
        <FullTemplateUI
          existing={isHotelLevel ? hotelConfig : chainConfig}
          scope={scope}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </main>
  )
}
