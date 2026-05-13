'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useAdminProperty } from '../../property-context'
import { CalendarDropdown } from '@/components/search/CalendarDropdown'
import { GuestsDropdown } from '@/components/search/GuestsDropdown'
import type { GuestRoom } from '@/components/search/GuestsDropdown'
import type { ExternalIBEConfigRow, ExternalIBEAnalyzeResponse, ExternalIBEConfigUpdate, ExternalIBETestResponse, ExternalIBETestResultItem, ExternalIBETestStreamEvent } from '@ibe/shared'

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
          Static (kept as-is in every generated link): {unmapped.join(', ')}
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
  actions,
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
  actions?: React.ReactNode
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
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={!urls.trim() || analyzeMutation.isPending}
          onClick={() => analyzeMutation.mutate()}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {analyzeMutation.isPending ? 'Analyzing…' : singleUrl ? 'Extract ID' : 'Analyze'}
        </button>
        {actions}
      </div>
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

function defaultTestDates() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const now = new Date()
  return {
    checkIn:  fmt(new Date(now.getTime() + 30 * 86400000)),
    checkOut: fmt(new Date(now.getTime() + 32 * 86400000)),
  }
}

function fmtDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function HttpBadge({ status, ok }: { status: number | null; ok: boolean }) {
  if (status === null) return <span className="text-xs text-[var(--color-text-muted)]">—</span>
  return (
    <span className={`text-xs font-mono font-medium ${ok ? 'text-success' : 'text-error'}`}>
      {status}
    </span>
  )
}

function StatusBadge({ item }: { item: ExternalIBETestResultItem }) {
  if (item.error) return <span className="text-xs font-medium text-error">error</span>
  if (item.bookingUrl?.includes('{')) return <span className="text-xs font-medium text-orange-500">unresolved</span>
  if (item.fallback) return <span className="text-xs font-medium text-amber-600">fallback</span>
  if (item.httpOk) return <span className="text-xs font-medium text-success">ok</span>
  return <span className="text-xs font-medium text-amber-600">no-probe</span>
}

function ResultRow({ item }: { item: ExternalIBETestResultItem }) {
  const shortUrl = (url: string | null) => {
    if (!url) return null
    try {
      const u = new URL(url)
      return u.hostname + u.pathname.slice(0, 40) + (u.pathname.length > 40 ? '…' : '')
    } catch {
      return url.slice(0, 50)
    }
  }

  return (
    <tr className="border-t border-[var(--color-border)] align-top">
      <td className="py-2 pr-3 whitespace-nowrap text-xs font-medium text-[var(--color-text)]">{item.label}</td>
      <td className="py-2 pr-3 max-w-[140px] truncate">
        {item.searchUrl ? (
          <a href={item.searchUrl} target="_blank" rel="noopener noreferrer"
            className="font-mono text-xs text-[var(--color-text-muted)] hover:underline truncate block"
            title={item.searchUrl}>
            {shortUrl(item.searchUrl)}
          </a>
        ) : <span className="text-xs text-[var(--color-text-muted)]">—</span>}
      </td>
      <td className="py-2 pr-3 max-w-[180px]">
        {item.bookingUrl ? (
          <a href={item.bookingUrl} target="_blank" rel="noopener noreferrer"
            className="font-mono text-xs text-[var(--color-primary)] hover:underline break-all"
            title={item.bookingUrl}>
            {shortUrl(item.bookingUrl)}
          </a>
        ) : (
          <span className="font-mono text-xs text-error">{item.error ?? 'null'}</span>
        )}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap"><HttpBadge status={item.httpStatus} ok={item.httpOk} /></td>
      <td className="py-2 pr-3 whitespace-nowrap"><StatusBadge item={item} /></td>
      <td className="py-2 text-right whitespace-nowrap text-xs text-[var(--color-text-muted)]">{fmtDuration(item.durationMs)}</td>
    </tr>
  )
}

function ResultsTable({ items }: { items: ExternalIBETestResultItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-[var(--color-text-muted)]">
            <th className="pb-1 pr-3 font-medium">Scenario</th>
            <th className="pb-1 pr-3 font-medium">Search URL</th>
            <th className="pb-1 pr-3 font-medium">Booking URL</th>
            <th className="pb-1 pr-3 font-medium">HTTP</th>
            <th className="pb-1 pr-3 font-medium">Status</th>
            <th className="pb-1 font-medium text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => <ResultRow key={item.label} item={item} />)}
        </tbody>
      </table>
    </div>
  )
}

// ── Combinations mode ─────────────────────────────────────────────────────────

const COMBO_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtComboDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${COMBO_MONTHS[parseInt(m!) - 1]}-${y}`
}

function buildCombinationLabels(): string[] {
  const now = new Date()
  const pad = (d: Date) => d.toISOString().slice(0, 10)
  const combos = [
    { offsetDays: 7,  nights: 2, adults: 2, childrenAges: [] as number[] },
    { offsetDays: 7,  nights: 2, adults: 2, childrenAges: [10] },
    { offsetDays: 15, nights: 3, adults: 1, childrenAges: [] as number[] },
    { offsetDays: 15, nights: 3, adults: 2, childrenAges: [10] },
    { offsetDays: 33, nights: 4, adults: 1, childrenAges: [] as number[] },
    { offsetDays: 33, nights: 4, adults: 2, childrenAges: [] as number[] },
  ]
  return combos.map(c => {
    const ci = pad(new Date(now.getTime() + c.offsetDays * 86400000))
    const guestLabel = c.childrenAges.length > 0 ? `${c.adults}A+${c.childrenAges.length}C` : `${c.adults}A`
    return `${fmtComboDate(ci)} (${c.nights}n) · ${guestLabel}`
  })
}

function SpinnerRow({ label }: { label: string }) {
  return (
    <tr className="border-t border-[var(--color-border)] align-top">
      <td className="py-2 pr-3 whitespace-nowrap text-xs font-medium text-[var(--color-text)]">{label}</td>
      <td colSpan={5} className="py-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          waiting…
        </span>
      </td>
    </tr>
  )
}

function CombinationsMode({ scope }: { scope: { orgId?: number; propertyId?: number } }) {
  const labels = buildCombinationLabels()
  const [rows, setRows] = useState<(ExternalIBETestResultItem | null)[]>(Array(6).fill(null))
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runCombinations() {
    setRows(Array(6).fill(null))
    setDone(false)
    setError(null)
    setRunning(true)
    setStarted(true)

    try {
      const stream = await apiClient.testExternalIBECombinations(scope)
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let idx = 0

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: ExternalIBETestStreamEvent
          try {
            event = JSON.parse(line.slice(6)) as ExternalIBETestStreamEvent
          } catch {
            continue
          }
          if (event.type === 'result') {
            const item = event.item
            // Match by label first, fall back to insertion order
            const byLabel = labels.findIndex(l => l === item.label)
            const rowIdx = byLabel >= 0 ? byLabel : idx
            setRows(prev => {
              const next = [...prev]
              next[rowIdx] = item
              return next
            })
            idx++
          } else if (event.type === 'done') {
            setDone(true)
          } else if (event.type === 'error') {
            setError(event.message)
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stream failed')
    } finally {
      setRunning(false)
    }
  }

  const completedCount = rows.filter(r => r !== null).length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-xs text-[var(--color-text-muted)] flex-1">
          Runs 6 scenarios with full scraping — may take 1–2 minutes. Results stream in as each completes.
        </p>
        <button
          type="button"
          disabled={running}
          onClick={() => { void runCombinations() }}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          {running ? `Running… (${completedCount}/6)` : 'Run all'}
        </button>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {done && !error && (
        <p className="text-xs text-success font-medium">All 6 scenarios complete.</p>
      )}

      {started && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="pb-1 pr-3 font-medium">Scenario</th>
                <th className="pb-1 pr-3 font-medium">Search URL</th>
                <th className="pb-1 pr-3 font-medium">Booking URL</th>
                <th className="pb-1 pr-3 font-medium">HTTP</th>
                <th className="pb-1 pr-3 font-medium">Status</th>
                <th className="pb-1 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, i) =>
                item !== null
                  ? <ResultRow key={labels[i]} item={item} />
                  : <SpinnerRow key={labels[i]} label={labels[i]!} />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Custom mode ───────────────────────────────────────────────────────────────

function CustomMode({
  scope,
  hasScraping,
}: {
  scope: { orgId?: number; propertyId?: number }
  hasScraping: boolean
}) {
  const defaults = defaultTestDates()
  const [checkIn,    setCheckIn]    = useState(defaults.checkIn)
  const [checkOut,   setCheckOut]   = useState(defaults.checkOut)
  const [rooms,      setRooms]      = useState<GuestRoom[]>([{ adults: 2, children: 0, infants: 0 }])
  const [openPanel,  setOpenPanel]  = useState<'dates' | 'guests' | null>(null)
  const [results,    setResults]    = useState<ExternalIBETestResponse | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openPanel) return
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpenPanel(null)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [openPanel])

  const r = rooms[0]!
  const adults       = r.adults
  const childrenAges = [...Array(r.children).fill(10), ...Array(r.infants).fill(1)]

  const testMutation = useMutation({
    mutationFn: () => apiClient.testExternalIBEConfig({ checkIn, checkOut, adults, childrenAges }, scope),
    onSuccess: (data) => { setResults(data); setOpenPanel(null) },
  })

  const datesLabel = checkIn && checkOut
    ? `${checkIn}  →  ${checkOut}`
    : 'Select dates'

  const guestParts = [`${adults} adult${adults !== 1 ? 's' : ''}`]
  if (r.children > 0) guestParts.push(`${r.children} child${r.children !== 1 ? 'ren' : ''}`)
  if (r.infants  > 0) guestParts.push(`${r.infants} infant${r.infants !== 1 ? 's' : ''}`)
  const guestsLabel = guestParts.join(' · ')

  const btnBase = 'flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors'

  return (
    <div className="space-y-4">
      {hasScraping && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Full 2-stage scraping required — may take 15–30 s.
        </p>
      )}

      <div ref={containerRef} className="flex flex-wrap items-center gap-2">
        {/* Date selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenPanel(p => p === 'dates' ? null : 'dates')}
            className={btnBase}
          >
            <svg className="h-4 w-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {datesLabel}
          </button>
          {openPanel === 'dates' && (
            <div className="absolute top-full left-0 z-50 mt-1">
              <CalendarDropdown
                checkIn={checkIn}
                checkOut={checkOut}
                initialField="checkin"
                onDatesChange={(ci, co) => { setCheckIn(ci); setCheckOut(co) }}
                onClose={() => setOpenPanel(null)}
                labelStart="Check-in"
                labelEnd="Check-out"
                labelDuration="Nights"
              />
            </div>
          )}
        </div>

        {/* Guests selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenPanel(p => p === 'guests' ? null : 'guests')}
            className={btnBase}
          >
            <svg className="h-4 w-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {guestsLabel}
          </button>
          {openPanel === 'guests' && (
            <div className="absolute top-full left-0 z-50 mt-1">
              <GuestsDropdown rooms={rooms} onChange={setRooms} maxRooms={1} />
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={testMutation.isPending || !checkIn || !checkOut}
          onClick={() => testMutation.mutate()}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {testMutation.isPending ? 'Running…' : 'Run test'}
        </button>
      </div>

      {testMutation.isError && (
        <p className="text-sm text-error">
          {testMutation.error instanceof Error ? testMutation.error.message : 'Test failed'}
        </p>
      )}

      {results && <ResultsTable items={results.results} />}
    </div>
  )
}

// ── TestSection ───────────────────────────────────────────────────────────────

function TestSection({
  scope,
  hasScraping,
}: {
  scope: { orgId?: number; propertyId?: number }
  hasScraping: boolean
}) {
  const [activeTab, setActiveTab] = useState<'custom' | 'combinations'>('combinations')

  const tabClass = (tab: 'custom' | 'combinations') =>
    [
      'px-3 py-1.5 text-sm font-medium border-b-2 transition-colors',
      activeTab === tab
        ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
        : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
    ].join(' ')

  return (
    <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Test</h3>
        <div className="flex gap-0">
          <button type="button" className={tabClass('combinations')} onClick={() => setActiveTab('combinations')}>Combinations</button>
          <button type="button" className={tabClass('custom')} onClick={() => setActiveTab('custom')}>Custom</button>
        </div>
      </div>

      {activeTab === 'custom' && <CustomMode scope={scope} hasScraping={hasScraping} />}
      {activeTab === 'combinations' && <CombinationsMode scope={scope} />}
    </section>
  )
}

const SEARCH_SCENARIOS = [
  { label: '2 adults, 3 nights',                 hint: 'e.g. adults=2 and a 3-night stay' },
  { label: '1 adult, 5 nights',                  hint: 'e.g. adults=1 and a 5-night stay' },
  { label: '2 adults, 2 children (ages 6 & 11)', hint: 'e.g. adults=2, children=2, ages 6 and 11' },
]

function SearchAnalysisSection({
  orgId,
  propertyId,
  urls,
  onUrlsChange,
  result,
  onResult,
  actions,
}: {
  orgId?: number
  propertyId?: number
  urls: [string, string, string]
  onUrlsChange: (v: [string, string, string]) => void
  result: ExternalIBEAnalyzeResponse | null
  onResult: (r: ExternalIBEAnalyzeResponse) => void
  actions?: React.ReactNode
}) {
  const [error, setError] = useState<string | null>(null)
  const allFilled = urls.every(u => u.trim().length > 0)

  const analyzeMutation = useMutation({
    mutationFn: () => apiClient.analyzeExternalIBEUrls({
      urls: urls.map(u => u.trim()),
      scenarios: SEARCH_SCENARIOS.map(s => s.label),
      type: 'search',
      ...(orgId !== undefined ? { orgId } : {}),
      ...(propertyId !== undefined ? { propertyId } : {}),
    }),
    onSuccess: r => { onResult(r); setError(null) },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Analysis failed'),
  })

  return (
    <div className="space-y-4">
      {SEARCH_SCENARIOS.map((scenario, i) => (
        <div key={i} className="space-y-1">
          <label className="block text-xs font-medium text-[var(--color-text-muted)]">
            {scenario.label}
          </label>
          <input
            type="text"
            value={urls[i]}
            onChange={e => {
              const next = [...urls] as [string, string, string]
              next[i] = e.target.value
              onUrlsChange(next)
            }}
            placeholder={scenario.hint}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
      ))}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={!allFilled || analyzeMutation.isPending}
          onClick={() => analyzeMutation.mutate()}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {analyzeMutation.isPending ? 'Analyzing…' : 'Analyze'}
        </button>
        {actions}
      </div>
      {!allFilled && (
        <p className="text-xs text-[var(--color-text-muted)]">Fill all 3 URLs to enable analysis</p>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      {result && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">Generated template</p>
          <p className="font-mono text-sm text-[var(--color-text)] break-all">{result.template}</p>
          <MappingTable mapping={result.mapping} unmapped={result.unmapped} />
        </div>
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
  const [searchUrls, setSearchUrls] = useState<[string, string, string]>(['', '', ''])
  const [bookingUrls, setBookingUrls] = useState('')
  const [mcpEnabled, setMcpEnabled] = useState(existing?.mcpEnabled ?? false)
  const [affiliateEnabled, setAffiliateEnabled] = useState(existing?.affiliateEnabled ?? false)
  const [widgetEnabled, setWidgetEnabled] = useState(existing?.widgetEnabled ?? false)
  const [deleteSearchConfirm, setDeleteSearchConfirm] = useState(false)
  const [deleteBookingConfirm, setDeleteBookingConfirm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const hasTemplates = !!(existing?.searchTemplate || existing?.bookingTemplate)

  const saveSearchMutation = useMutation({
    mutationFn: () => {
      const detectedId = searchResult!.mapping.find(m => m.concept === 'externalHotelId')?.exampleValue
      return apiClient.upsertExternalIBEConfig({
        searchTemplate: searchResult!.template,
        searchSampleUrls: searchUrls.filter(u => u.trim()),
        ...(detectedId ? { externalHotelId: detectedId } : {}),
      }, scope)
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); onSaved() },
  })

  const saveBookingMutation = useMutation({
    mutationFn: () => {
      const detectedId = bookingResult!.mapping.find(m => m.concept === 'externalHotelId')?.exampleValue
      return apiClient.upsertExternalIBEConfig({
        bookingTemplate: bookingResult!.template,
        bookingSampleUrls: bookingUrls.split('\n').map(u => u.trim()).filter(Boolean),
        ...(detectedId ? { externalHotelId: detectedId } : {}),
      }, scope)
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); onSaved() },
  })

  const clearSearchMutation = useMutation({
    mutationFn: () => apiClient.upsertExternalIBEConfig({ searchTemplate: null, searchSampleUrls: [] }, scope),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); setDeleteSearchConfirm(false); onSaved() },
  })

  const clearBookingMutation = useMutation({
    mutationFn: () => apiClient.upsertExternalIBEConfig({ bookingTemplate: null, bookingSampleUrls: [] }, scope),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); setDeleteBookingConfirm(false); onSaved() },
  })

  const saveTogglesMutation = useMutation({
    mutationFn: () => apiClient.upsertExternalIBEConfig({ mcpEnabled, affiliateEnabled, widgetEnabled }, scope),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); onSaved() },
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteExternalIBEConfig(scope),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); onDeleted() },
  })

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Search page URL</h3>
        {existing && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-1">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">Current search template</p>
            {existing.searchTemplate
              ? <p className="font-mono text-sm text-[var(--color-text)] break-all">{existing.searchTemplate}</p>
              : <p className="text-sm text-[var(--color-text-muted)] italic">Not configured</p>}
          </div>
        )}
        <SearchAnalysisSection
          {...(scope.orgId !== undefined ? { orgId: scope.orgId } : {})}
          {...(scope.propertyId !== undefined ? { propertyId: scope.propertyId } : {})}
          urls={searchUrls}
          onUrlsChange={setSearchUrls}
          result={searchResult}
          onResult={setSearchResult}
          actions={<>
            <button
              type="button"
              disabled={!searchResult || saveSearchMutation.isPending}
              onClick={() => saveSearchMutation.mutate()}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {saveSearchMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            {existing?.searchTemplate && !deleteSearchConfirm && (
              <button
                type="button"
                onClick={() => setDeleteSearchConfirm(true)}
                className="rounded-lg border border-error/30 px-4 py-2 text-sm font-medium text-error hover:bg-error/5 transition-colors"
              >
                Clear
              </button>
            )}
            {deleteSearchConfirm && (
              <>
                <span className="text-sm text-[var(--color-text-muted)]">Clear search template?</span>
                <button
                  type="button"
                  disabled={clearSearchMutation.isPending}
                  onClick={() => clearSearchMutation.mutate()}
                  className="rounded-lg bg-error px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {clearSearchMutation.isPending ? '…' : 'Yes'}
                </button>
                <button type="button" onClick={() => setDeleteSearchConfirm(false)} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Cancel</button>
              </>
            )}
          </>}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Booking page URL</h3>
        {existing && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-1">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">Current booking template</p>
            {existing.bookingTemplate
              ? <p className="font-mono text-sm text-[var(--color-text)] break-all">{existing.bookingTemplate}</p>
              : <p className="text-sm text-[var(--color-text-muted)] italic">Not configured</p>}
          </div>
        )}
        <AnalysisSection
          label="Paste one or more sample booking page URLs (one per line)"
          type="booking"
          {...(scope.orgId !== undefined ? { orgId: scope.orgId } : {})}
          {...(scope.propertyId !== undefined ? { propertyId: scope.propertyId } : {})}
          result={bookingResult}
          onResult={setBookingResult}
          urls={bookingUrls}
          onUrlsChange={setBookingUrls}
          actions={<>
            <button
              type="button"
              disabled={!bookingResult || saveBookingMutation.isPending}
              onClick={() => saveBookingMutation.mutate()}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {saveBookingMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            {existing?.bookingTemplate && !deleteBookingConfirm && (
              <button
                type="button"
                onClick={() => setDeleteBookingConfirm(true)}
                className="rounded-lg border border-error/30 px-4 py-2 text-sm font-medium text-error hover:bg-error/5 transition-colors"
              >
                Clear
              </button>
            )}
            {deleteBookingConfirm && (
              <>
                <span className="text-sm text-[var(--color-text-muted)]">Clear booking template?</span>
                <button
                  type="button"
                  disabled={clearBookingMutation.isPending}
                  onClick={() => clearBookingMutation.mutate()}
                  className="rounded-lg bg-error px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {clearBookingMutation.isPending ? '…' : 'Yes'}
                </button>
                <button type="button" onClick={() => setDeleteBookingConfirm(false)} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Cancel</button>
              </>
            )}
          </>}
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={saveTogglesMutation.isPending}
            onClick={() => saveTogglesMutation.mutate()}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {saveTogglesMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      {existing && (
        <div className="flex items-center gap-3">
          {!deleteConfirm && (
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
      )}

      {hasTemplates && scope.propertyId !== undefined && (
        <TestSection
          scope={scope}
          hasScraping={!!(existing?.bookingTemplate?.includes('{solutionId}') && existing?.searchTemplate)}
        />
      )}
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
  const [advSearchUrls, setAdvSearchUrls] = useState<[string, string, string]>(['', '', ''])
  const [advBookingUrls, setAdvBookingUrls] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const detectedId = idResult?.mapping.find(m => m.concept === 'externalHotelId')?.exampleValue

  const saveMutation = useMutation({
    mutationFn: () => {
      const data: ExternalIBEConfigUpdate = { mcpEnabled, affiliateEnabled, widgetEnabled }
      if (detectedId) data.externalHotelId = detectedId
      if (searchResult) {
        data.searchTemplate = searchResult.template
        data.searchSampleUrls = advSearchUrls.filter(u => u.trim())
      }
      if (bookingResult) {
        data.bookingTemplate = bookingResult.template
        data.bookingSampleUrls = advBookingUrls.split('\n').map(u => u.trim()).filter(Boolean)
      }
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
              {(hotelExisting?.searchTemplate ?? chainConfig.searchTemplate) && (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-1">
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    Current search template{!hotelExisting?.searchTemplate ? ' (inherited from chain)' : ''}
                  </p>
                  <p className="font-mono text-sm text-[var(--color-text)] break-all">{hotelExisting?.searchTemplate ?? chainConfig.searchTemplate}</p>
                </div>
              )}
              <SearchAnalysisSection
                propertyId={propertyId}
                urls={advSearchUrls}
                onUrlsChange={setAdvSearchUrls}
                result={searchResult}
                onResult={setSearchResult}
              />
            </section>
            <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Booking page URL override</h3>
              {(hotelExisting?.bookingTemplate ?? chainConfig.bookingTemplate) && (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-1">
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    Current booking template{!hotelExisting?.bookingTemplate ? ' (inherited from chain)' : ''}
                  </p>
                  <p className="font-mono text-sm text-[var(--color-text)] break-all">{hotelExisting?.bookingTemplate ?? chainConfig.bookingTemplate}</p>
                </div>
              )}
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

      <TestSection
        scope={{ propertyId }}
        hasScraping={!!((hotelExisting?.bookingTemplate ?? chainConfig.bookingTemplate)?.includes('{solutionId}') && (hotelExisting?.searchTemplate ?? chainConfig.searchTemplate))}
      />
    </div>
  )
}

export default function ExternalIBEPage() {
  const { admin } = useAdminAuth()
  const { propertyId: contextPropertyId, orgId: contextOrgId } = useAdminProperty()
  const qc = useQueryClient()
  const [savedBanner, setSavedBanner] = useState(false)
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    setSavedBanner(true)
    bannerTimerRef.current = setTimeout(() => setSavedBanner(false), 3000)
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

      {isHotelLevel && chainConfig && hotelHasOwnTemplates && (
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
          key={contextPropertyId!}
          chainConfig={chainConfig!}
          hotelExisting={hotelConfig}
          propertyId={contextPropertyId!}
          orgId={orgScope?.orgId ?? admin.organizationId ?? chainConfig!.organizationId ?? 0}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : (
        <FullTemplateUI
          key={('propertyId' in scope ? scope.propertyId : null) ?? ('orgId' in scope ? scope.orgId : null) ?? 'chain'}
          existing={isHotelLevel ? hotelConfig : chainConfig}
          scope={scope}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </main>
  )
}
