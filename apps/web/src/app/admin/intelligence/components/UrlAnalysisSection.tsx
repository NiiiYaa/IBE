'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { detectKnownIBE, extractHotelIdFromUrl } from '@ibe/shared'
import type { ExternalIBEAnalyzeResponse } from '@ibe/shared'

const SCENARIOS = [
  { label: '2 adults, 3 nights',                           hint: 'Search page URL for 2 adults, 3-night stay' },
  { label: '1 adult, 5 nights',                            hint: 'Same hotel — 1 adult, 5-night stay' },
  { label: '2 adults, 2 children (ages 6 & 11), 1 night', hint: 'Same hotel — 2 adults + 2 children, 1 night' },
]

function MappingTable({ mapping, unmapped }: {
  mapping: ExternalIBEAnalyzeResponse['mapping']
  unmapped: string[]
}) {
  return (
    <div className="mt-3 space-y-2">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[var(--color-text-muted)]">
            <th className="pb-1 pr-4 font-medium text-xs">Concept</th>
            <th className="pb-1 pr-4 font-medium text-xs">Detected param</th>
            <th className="pb-1 font-medium text-xs">Example value</th>
          </tr>
        </thead>
        <tbody>
          {mapping.map(m => (
            <tr key={m.concept} className="border-t border-[var(--color-border)]">
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

interface UrlAnalysisSectionProps {
  orgId?: number | null
  propertyId: number
  result: ExternalIBEAnalyzeResponse | null
  onResult: (r: ExternalIBEAnalyzeResponse) => void
}

export function UrlAnalysisSection({ orgId, propertyId, result, onResult }: UrlAnalysisSectionProps) {
  const [urls, setUrls] = useState<[string, string, string]>(['', '', ''])
  const [error, setError] = useState<string | null>(null)
  const [knownIBE, setKnownIBE] = useState<ReturnType<typeof detectKnownIBE>>(null)
  const [firstHostname, setFirstHostname] = useState<string | null>(null)

  const firstUrl = urls[0].trim()

  useEffect(() => {
    setKnownIBE(firstUrl ? detectKnownIBE(firstUrl) : null)
    try { setFirstHostname(firstUrl ? new URL(firstUrl).hostname : null) }
    catch { setFirstHostname(null) }
  }, [firstUrl])

  const { data: registryEntry } = useQuery({
    queryKey: ['ibe-registry', firstHostname],
    queryFn: () => apiClient.lookupIBERegistry(firstHostname!),
    enabled: !!firstHostname && !knownIBE,
    staleTime: 5 * 60 * 1000,
  })

  const saveRegistryMutation = useMutation({
    mutationFn: apiClient.saveIBERegistry.bind(apiClient),
  })

  function substituteHotelId(template: string, hotelId: string): string {
    return template.replaceAll('{externalHotelId}', hotelId)
  }

  const allFilled = urls.every(u => u.trim().length > 0)

  const analyzeMutation = useMutation({
    mutationFn: () =>
      apiClient.analyzeExternalIBEUrls({
        urls: urls.map(u => u.trim()).filter(Boolean),
        scenarios: SCENARIOS.map(s => s.label),
        type: 'search',
        ...(orgId != null ? { orgId } : {}),
        propertyId,
      }),
    onSuccess: r => {
      const detectedId = r.mapping.find(m => m.concept === 'externalHotelId')?.exampleValue
      onResult(detectedId ? { ...r, template: substituteHotelId(r.template, detectedId) } : r)
      setError(null)
      if (firstHostname && r.template.includes('{externalHotelId}')) {
        saveRegistryMutation.mutate({ hostname: firstHostname, name: null, searchTemplate: r.template })
      }
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Analysis failed'),
  })

  function applyKnownIBE() {
    if (!knownIBE) return
    onResult({
      template: substituteHotelId(knownIBE.searchTemplate, knownIBE.externalHotelId),
      mapping: [{ concept: 'externalHotelId', detectedParam: 'hotel ID', exampleValue: knownIBE.externalHotelId }],
      unmapped: [],
    })
  }

  function applyRegistryEntry() {
    if (!registryEntry?.searchTemplate || !firstHostname) return
    const hotelId = extractHotelIdFromUrl(firstUrl, registryEntry.searchTemplate)
    if (!hotelId) return
    onResult({
      template: substituteHotelId(registryEntry.searchTemplate, hotelId),
      mapping: [{ concept: 'externalHotelId', detectedParam: 'hotel ID', exampleValue: hotelId }],
      unmapped: [],
    })
  }

  const recognized = knownIBE ?? (registryEntry?.searchTemplate ? registryEntry : null)

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-muted)]">
        Paste a URL from the competitor's booking page for each scenario — different guest counts and stay lengths help the AI identify date and occupancy parameters accurately.
      </p>

      {SCENARIOS.map((scenario, i) => (
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
              setUrls(next)
            }}
            placeholder={scenario.hint}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
      ))}

      {/* Known IBE banner */}
      {knownIBE && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 px-4 py-2.5">
          <span className="text-sm text-[var(--color-text)]">
            Recognized: <strong>{knownIBE.name}</strong>
          </span>
          <button type="button" onClick={applyKnownIBE}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity">
            Apply template
          </button>
          <span className="text-xs text-[var(--color-text-muted)]">Pre-fills the search template</span>
        </div>
      )}

      {/* Registry banner (previously AI-analyzed) */}
      {!knownIBE && registryEntry?.searchTemplate && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
          <span className="text-sm text-[var(--color-text)]">
            Previously analyzed: <strong>{registryEntry.name ?? firstHostname}</strong>
          </span>
          <button type="button" onClick={applyRegistryEntry}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity">
            Apply template
          </button>
          <span className="text-xs text-[var(--color-text-muted)]">Re-uses your previous analysis</span>
        </div>
      )}

      {!recognized && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!allFilled || analyzeMutation.isPending}
            onClick={() => analyzeMutation.mutate()}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-surface)] transition-colors"
          >
            {analyzeMutation.isPending ? 'Analysing…' : 'Analyse URLs'}
          </button>
          {!allFilled && (
            <span className="text-xs text-[var(--color-text-muted)]">Fill all 3 URLs to enable analysis</span>
          )}
        </div>
      )}

      {error && <p className="text-sm text-[var(--color-error,#dc2626)]">{error}</p>}
      {result && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background,#f9fafb)] p-4">
          <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">Generated template</p>
          <p className="font-mono text-sm text-[var(--color-text)] break-all">{result.template}</p>
          <MappingTable mapping={result.mapping} unmapped={result.unmapped} />
        </div>
      )}
    </div>
  )
}
