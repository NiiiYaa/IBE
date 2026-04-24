'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, PropertyDesignAdminResponse, HotelDesignConfig, SellModel } from '@ibe/shared'
import { addDays, todayIso } from '@ibe/shared'
import { useGlobalConfig } from '@/hooks/use-global-config'
import { useProperty } from '@/hooks/use-property'
import { useAdminProperty } from '../../property-context'
import { useB2bOrigin } from '@/hooks/use-b2b-origin'
import { useIbeOrigin } from '@/hooks/use-ibe-origin'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { apiClient } from '@/lib/api-client'
import { AgeTag, FormRow, SaveBar, Section, Toggle, TextInput } from '../components'
import { OverrideToggleRow, OverrideNumberRow, SourceBadge, sourceLabel } from '../override-helpers'
import { RoomImageManager } from '../components/RoomImageManager'
import { PropertyImageManager } from '../components/PropertyImageManager'

const viewLinkCls = 'flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
const viewLinkDisabledCls = 'flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] opacity-40 cursor-not-allowed'
const externalIcon = (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

function previewSearchUrl(propertyId: number): string {
  const checkIn = addDays(todayIso(), 60)
  const checkOut = addDays(checkIn, 2)
  return `/search?hotelId=${propertyId}&checkIn=${checkIn}&checkOut=${checkOut}&rooms[0][adults]=2`
}

export default function SearchDesignPage() {
  const { propertyId } = useAdminProperty()
  if (propertyId === null) return <GlobalSearchEditor />
  return <PropertySearchEditor propertyId={propertyId ?? 0} />
}

// ── Global editor (no property selected) ─────────────────────────────────────

function GlobalSearchEditor() {
  const { isLoading, draft, set, save, isPending, isDirty } = useGlobalConfig()
  const { admin } = useAdminAuth()
  const { orgId: ctxOrgId } = useAdminProperty()
  const isSuper = admin?.role === 'super'
  const resolvedOrgId = isSuper ? (ctxOrgId ?? undefined) : (admin?.organizationId ?? undefined)
  const orgQKey = isSuper ? ['admin-org', resolvedOrgId ?? null] : ['admin-org']

  const { data: propertiesData } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: () => apiClient.listProperties(),
    staleTime: Infinity,
  })
  const realSearchProperties = (propertiesData?.properties ?? []).filter(p => !p.isDemo)
  const firstPropertyId = realSearchProperties[0]?.propertyId

  const { data: orgSettings } = useQuery({
    queryKey: orgQKey,
    queryFn: () => apiClient.getOrgSettings(resolvedOrgId),
    staleTime: Infinity,
    enabled: resolvedOrgId !== undefined,
  })

  const searchSingleSubdomain = realSearchProperties.length === 1 ? realSearchProperties[0]!.subdomain : null
  const b2bOrigin = useB2bOrigin(searchSingleSubdomain ?? orgSettings?.orgSlug)
  const subdomainOrigin = useIbeOrigin(searchSingleSubdomain ?? orgSettings?.orgSlug)
  const b2cOrigin = orgSettings?.webDomain?.replace(/\/$/, '') || subdomainOrigin

  if (isLoading) return <Spinner />

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Search Results</h1>
          {firstPropertyId && (orgSettings?.enabledModels ?? ['b2c'] as SellModel[]).map(model => {
            const path = previewSearchUrl(firstPropertyId)
            const href = model === 'b2b'
              ? (b2bOrigin ? `${b2bOrigin}${path}` : null)
              : (b2cOrigin ? `${b2cOrigin}${path}` : null)
            if (!href) return <span key={model} className={viewLinkDisabledCls} title="Not available on this host">{externalIcon} View {model.toUpperCase()}</span>
            return (
              <a key={model} href={href} target="_blank" rel="noopener noreferrer"
                className={viewLinkCls} title={`Open ${model.toUpperCase()} search page`}>
                {externalIcon} View {model.toUpperCase()}
              </a>
            )
          })}
        </div>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Chain defaults — apply to all hotels unless overridden at the hotel level.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        <Section title="Banner Image">
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Image style</p>
            <div className="flex gap-3">
              {([
                { value: null,       label: 'No banner',    desc: 'Search results page has no hero image' },
                { value: 'fixed',    label: 'Fixed image',  desc: 'One selected photo at the top' },
                { value: 'carousel', label: 'Carousel',     desc: 'Cycles through all property photos' },
              ] as const).map(opt => (
                <button key={String(opt.value)} type="button"
                  onClick={() => {
                    set('searchResultsImageMode', opt.value ?? null)
                    if (!opt.value) set('searchResultsImageUrl', null)
                  }}
                  className={['flex-1 rounded-xl border-2 p-3 text-left transition-all',
                    (opt.value === null ? !draft.searchResultsImageMode : draft.searchResultsImageMode === opt.value)
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-primary-light)]',
                  ].join(' ')}
                >
                  <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
          {draft.searchResultsImageMode === 'carousel' && (
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Slide interval
                <span className="ml-1.5 font-normal normal-case text-[var(--color-text-muted)]/60">seconds between images</span>
              </label>
              <div className="flex items-center gap-3">
                <input type="range" min={2} max={15} step={1}
                  value={draft.searchResultsCarouselInterval ?? 5}
                  onChange={e => set('searchResultsCarouselInterval', Number(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <span className="w-12 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
                  {draft.searchResultsCarouselInterval ?? 5}s
                </span>
              </div>
            </div>
          )}
          {draft.searchResultsImageMode === 'fixed' && (
            <FormRow label="Banner image URL" hint="Direct link to the image">
              <TextInput value={draft.searchResultsImageUrl ?? ''} onChange={v => set('searchResultsImageUrl', v || null)} placeholder="https://..." />
            </FormRow>
          )}
        </Section>

        <Section title="Search Panel Position">
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Choose which side the dates/guests search panel appears on the results page.
          </p>
          <div className="flex gap-3">
            {([
              { value: 'left',  label: 'Left',  desc: 'Search panel on the left, rooms on the right' },
              { value: 'right', label: 'Right', desc: 'Rooms on the left, search panel on the right' },
            ] as const).map(opt => (
              <button key={opt.value} type="button"
                onClick={() => set('searchSidebarPosition', opt.value)}
                className={['flex-1 rounded-xl border-2 p-3 text-left transition-all',
                  (draft.searchSidebarPosition ?? 'left') === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}
              >
                <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Room List Layout">
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Choose how available rooms are displayed on the search results page.
          </p>
          <div className="flex gap-3">
            {([
              { value: 'rows', label: 'Rows', desc: 'Horizontal rows with photo on the left and rates below' },
              { value: 'cards', label: 'Cards', desc: 'Photo cards in a 3-column grid with rates expanding below' },
            ] as const).map(opt => (
              <button key={opt.value} type="button"
                onClick={() => set('roomSearchLayout', opt.value)}
                className={['flex-1 rounded-xl border-2 p-3 text-left transition-all',
                  (draft.roomSearchLayout ?? 'rows') === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}
              >
                <div className="mb-2.5 h-14 w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-1.5">
                  {opt.value === 'rows' ? (
                    <div className="space-y-1 h-full">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="flex items-center gap-1 rounded bg-[var(--color-surface)] border border-[var(--color-border)] px-1" style={{ height: '28%' }}>
                          <div className="h-full w-8 rounded bg-[var(--color-border)]" />
                          <div className="flex-1 space-y-0.5">
                            <div className="h-1 w-3/4 rounded bg-[var(--color-border)]" />
                            <div className="h-1 w-1/2 rounded bg-[var(--color-border)]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1 h-full">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="flex flex-col overflow-hidden rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
                          <div className="h-2/5 bg-[var(--color-border)]" />
                          <div className="flex-1 p-0.5 space-y-0.5">
                            <div className="h-1 w-full rounded bg-[var(--color-border)]" />
                            <div className="h-1 w-2/3 rounded bg-[var(--color-border)]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Fold/Unfold Offers">
          <Toggle
            label="Show all offers expanded by default"
            hint="When enabled, room rate options unfold automatically on the search results page."
            checked={draft.roomRatesDefaultExpanded ?? false}
            onChange={v => set('roomRatesDefaultExpanded', v)}
          />
        </Section>

        <Section title="Guest Age Groups">
          <p className="text-xs text-[var(--color-text-muted)]">
            Define the age boundaries used to categorise guests in the search form.
            Adults are any guest aged {(draft.childMaxAge ?? 16) + 1} and above.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label="Infant max age" hint={`Ages 0–${draft.infantMaxAge ?? 2} shown as Infants`}>
              <input type="number" min={0} max={4}
                value={draft.infantMaxAge ?? 2}
                onChange={e => set('infantMaxAge', Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
              />
            </FormRow>
            <FormRow label="Child max age" hint={`Ages ${(draft.infantMaxAge ?? 2) + 1}–${draft.childMaxAge ?? 16} shown as Children`}>
              <input type="number" min={5} max={17}
                value={draft.childMaxAge ?? 16}
                onChange={e => set('childMaxAge', Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
              />
            </FormRow>
          </div>
          <div className="mt-1 flex gap-4 text-xs">
            <AgeTag label="Infants" range={`0–${draft.infantMaxAge ?? 2}`} color="blue" />
            <AgeTag label="Children" range={`${(draft.infantMaxAge ?? 2) + 1}–${draft.childMaxAge ?? 16}`} color="amber" />
            <AgeTag label="Adults" range={`${(draft.childMaxAge ?? 16) + 1}+`} color="green" />
          </div>
        </Section>
      </div>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={save} />
    </div>
  )
}

// ── Property editor (specific property selected) ──────────────────────────────

type SearchDraft = Partial<OrgDesignDefaultsConfig> & {
  searchResultsExcludedImageIds?: number[]
  excludedRoomImageIds?: number[]
  roomPrimaryImageIds?: Record<number, number>
}

function PropertySearchEditor({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<SearchDraft>({})
  const [isDirty, setIsDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const { admin } = useAdminAuth()
  const isSuper = admin?.role === 'super'

  const { data: property } = useProperty(propertyId)

  const { data: superProperties } = useQuery({
    queryKey: ['admin-super-properties'],
    queryFn: () => apiClient.listProperties(),
    staleTime: Infinity,
    enabled: isSuper,
  })

  const currentProp = isSuper
    ? (superProperties?.properties ?? []).find(p => p.propertyId === propertyId)
    : null
  const propertySubdomain = isSuper ? (currentProp?.subdomain ?? null) : null
  const superPropOrgId = isSuper ? (currentProp?.orgId ?? undefined) : undefined

  const { data: propertiesDataForSearch } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: () => apiClient.listProperties(),
    staleTime: Infinity,
    enabled: !isSuper,
  })

  const orgQKey = isSuper ? ['admin-org', superPropOrgId ?? null] : ['admin-org']
  const { data: orgSettings } = useQuery({
    queryKey: orgQKey,
    queryFn: () => apiClient.getOrgSettings(superPropOrgId),
    staleTime: Infinity,
    enabled: isSuper ? superPropOrgId !== undefined : true,
  })

  const propSearchReal = (propertiesDataForSearch?.properties ?? []).filter(p => !p.isDemo)
  const propSearchSingleSubdomain = propSearchReal.length === 1 ? propSearchReal[0]!.subdomain : null
  const b2bOrigin = useB2bOrigin(propertySubdomain ?? propSearchSingleSubdomain ?? orgSettings?.orgSlug)
  const subdomainOrigin = useIbeOrigin(propertySubdomain ?? propSearchSingleSubdomain ?? orgSettings?.orgSlug)
  const b2cOrigin = orgSettings?.webDomain?.replace(/\/$/, '') || subdomainOrigin

  const { data: designData, isLoading: designLoading } = useQuery<PropertyDesignAdminResponse>({
    queryKey: ['property-design-admin', propertyId],
    queryFn: () => apiClient.getPropertyDesignAdmin(propertyId),
    staleTime: Infinity,
  })

  const { data: config, isLoading: configLoading } = useQuery<HotelDesignConfig>({
    queryKey: ['admin-config', propertyId],
    queryFn: () => apiClient.getHotelConfigAdmin(propertyId),
    staleTime: Infinity,
    enabled: propertyId > 0,
  })

  useEffect(() => {
    if (designData && config && !initialized) {
      setDraft({
        ...designData.overrides,
        searchResultsExcludedImageIds: config.searchResultsExcludedImageIds ?? [],
        excludedRoomImageIds: config.excludedRoomImageIds ?? [],
        roomPrimaryImageIds: config.roomPrimaryImageIds ?? {},
      })
      setInitialized(true)
      setIsDirty(false)
    }
  }, [designData, config, initialized])

  useEffect(() => { setInitialized(false); setIsDirty(false) }, [propertyId])

  const orgDefaults = designData?.orgDefaults ?? ({} as OrgDesignDefaultsConfig)

  const { mutate, isPending } = useMutation({
    mutationFn: (d: SearchDraft) => apiClient.updateHotelConfig(propertyId, d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['property-design-admin', propertyId] })
      void qc.invalidateQueries({ queryKey: ['admin-config', propertyId] })
      setIsDirty(false)
    },
  })

  const set = useCallback(<K extends keyof SearchDraft>(key: K, value: SearchDraft[K]) => {
    setDraft(d => ({ ...d, [key]: value }))
    setIsDirty(true)
  }, [])

  const reset = useCallback((key: keyof OrgDesignDefaultsConfig) => {
    setDraft(d => ({ ...d, [key]: null }))
    setIsDirty(true)
  }, [])

  if (!propertyId || designLoading || configLoading) return <Spinner />

  const setB = set as (key: keyof SearchDraft, val: boolean) => void
  const setN = set as (key: keyof OrgDesignDefaultsConfig, val: number) => void
  const resetO = reset as (key: keyof OrgDesignDefaultsConfig) => void

  // Banner section: searchResultsImageMode is inheritable from chain
  const rawBannerMode = draft.searchResultsImageMode as string | null | undefined
  const isOverridingBanner = rawBannerMode != null
  const inheritedBannerMode = orgDefaults.searchResultsImageMode
  const effectiveBannerMode = isOverridingBanner ? rawBannerMode : inheritedBannerMode
  const bannerSource = isOverridingBanner ? 'hotel' : sourceLabel('searchResultsImageMode', orgDefaults)

  // Carousel interval
  const rawInterval = draft.searchResultsCarouselInterval as number | null | undefined
  const isOverridingInterval = rawInterval != null
  const inheritedInterval = orgDefaults.searchResultsCarouselInterval ?? 5
  const effectiveInterval = isOverridingInterval ? rawInterval : inheritedInterval
  const intervalSource = isOverridingInterval ? 'hotel' : sourceLabel('searchResultsCarouselInterval', orgDefaults)

  // Age group effective values for display
  const effectiveInfantMax = (draft.infantMaxAge ?? orgDefaults.infantMaxAge ?? 2)
  const effectiveChildMax = (draft.childMaxAge ?? orgDefaults.childMaxAge ?? 16)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Search Results</h1>
          {(orgSettings?.enabledModels ?? ['b2c'] as SellModel[]).map(model => {
            const path = previewSearchUrl(propertyId)
            const href = model === 'b2b'
              ? (b2bOrigin ? `${b2bOrigin}${path}` : null)
              : (b2cOrigin ? `${b2cOrigin}${path}` : null)
            if (!href) return <span key={model} className={viewLinkDisabledCls} title="Not available on this host">{externalIcon} View {model.toUpperCase()}</span>
            return (
              <a key={model} href={href} target="_blank" rel="noopener noreferrer"
                className={viewLinkCls} title={`Open ${model.toUpperCase()} search page`}>
                {externalIcon} View {model.toUpperCase()}
              </a>
            )
          })}
        </div>
      </div>

      <div className="space-y-6">
        {property && property.images.length > 0 && (
          <Section title="Banner Image">
            <div className="mb-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Image style</p>
              <div className="flex gap-3">
                {([
                  { value: null,       label: 'No banner',    desc: 'No banner on the search results page' },
                  { value: 'fixed',    label: 'Fixed image',  desc: 'One selected photo at the top' },
                  { value: 'carousel', label: 'Carousel',     desc: 'Cycles through all property photos' },
                ] as const).map(opt => (
                  <button key={String(opt.value)} type="button"
                    onClick={() => {
                      set('searchResultsImageMode', opt.value)
                      if (!opt.value) { set('searchResultsImageUrl', null); set('searchResultsExcludedImageIds', []) }
                    }}
                    className={['flex-1 rounded-xl border-2 p-3 text-left transition-all',
                      (opt.value === null ? effectiveBannerMode == null : effectiveBannerMode === opt.value)
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                        : 'border-[var(--color-border)] hover:border-[var(--color-primary-light)]',
                    ].join(' ')}
                  >
                    <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <SourceBadge source={bannerSource} />
                {isOverridingBanner && (
                  <button type="button" onClick={() => { reset('searchResultsImageMode'); reset('searchResultsCarouselInterval') }}
                    className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
                    ↩ Reset
                  </button>
                )}
              </div>
            </div>

            {effectiveBannerMode === 'carousel' && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Slide interval <span className="font-normal normal-case opacity-60">seconds between images</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <SourceBadge source={intervalSource} />
                    {isOverridingInterval && (
                      <button type="button" onClick={() => reset('searchResultsCarouselInterval')}
                        className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
                        ↩ Reset
                      </button>
                    )}
                    {!isOverridingInterval && (
                      <button type="button" onClick={() => set('searchResultsCarouselInterval', effectiveInterval)}
                        className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                        Override
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="range" min={2} max={15} step={1}
                    value={effectiveInterval}
                    onChange={e => set('searchResultsCarouselInterval', Number(e.target.value))}
                    disabled={!isOverridingInterval}
                    className={`flex-1 accent-[var(--color-primary)] ${!isOverridingInterval ? 'opacity-50' : ''}`}
                  />
                  <span className="w-12 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
                    {effectiveInterval}s
                  </span>
                </div>
              </div>
            )}

            {effectiveBannerMode != null && (
              <div>
                <p className="mb-2 text-xs text-[var(--color-text-muted)]">
                  {effectiveBannerMode === 'carousel'
                    ? (<><strong>★</strong> sets the lead image &nbsp;·&nbsp; <strong>🚫</strong> hides it from the carousel.</>)
                    : (<><strong>★</strong> selects the banner image.</>)}
                  {' '}Hover to see controls.
                </p>
                <PropertyImageManager
                  images={property.images}
                  heroImageUrl={draft.searchResultsImageUrl ?? ''}
                  excludedIds={draft.searchResultsExcludedImageIds ?? []}
                  onHeroChange={url => set('searchResultsImageUrl', url)}
                  onExcludedChange={ids => set('searchResultsExcludedImageIds', ids)}
                />
              </div>
            )}
          </Section>
        )}

        <Section title="Search Panel Position">
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Choose which side the dates/guests search panel appears on the results page.
          </p>
          <div className="flex gap-3">
            {([
              { value: 'left',  label: 'Left',  desc: 'Search panel on the left, rooms on the right' },
              { value: 'right', label: 'Right', desc: 'Rooms on the left, search panel on the right' },
            ] as const).map(opt => (
              <button key={opt.value} type="button"
                onClick={() => set('searchSidebarPosition', opt.value)}
                className={['flex-1 rounded-xl border-2 p-3 text-left transition-all',
                  (draft.searchSidebarPosition ?? orgDefaults.searchSidebarPosition ?? 'left') === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}
              >
                <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <SourceBadge source={draft.searchSidebarPosition != null ? 'hotel' : sourceLabel('searchSidebarPosition' as keyof OrgDesignDefaultsConfig, orgDefaults)} />
            {draft.searchSidebarPosition != null && (
              <button type="button" onClick={() => reset('searchSidebarPosition' as keyof OrgDesignDefaultsConfig)}
                className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
                ↩ Reset
              </button>
            )}
          </div>
        </Section>

        <Section title="Room List Layout">
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Choose how available rooms are displayed on the search results page.
          </p>
          <div className="flex gap-3">
            {([
              { value: 'rows', label: 'Rows', desc: 'Horizontal rows with photo on the left and rates below' },
              { value: 'cards', label: 'Cards', desc: 'Photo cards in a 3-column grid with rates expanding below' },
            ] as const).map(opt => (
              <button key={opt.value} type="button"
                onClick={() => set('roomSearchLayout', opt.value)}
                className={['flex-1 rounded-xl border-2 p-3 text-left transition-all',
                  (draft.roomSearchLayout ?? orgDefaults.roomSearchLayout ?? 'rows') === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}
              >
                <div className="mb-2.5 h-14 w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-1.5">
                  {opt.value === 'rows' ? (
                    <div className="space-y-1 h-full">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="flex items-center gap-1 rounded bg-[var(--color-surface)] border border-[var(--color-border)] px-1" style={{ height: '28%' }}>
                          <div className="h-full w-8 rounded bg-[var(--color-border)]" />
                          <div className="flex-1 space-y-0.5">
                            <div className="h-1 w-3/4 rounded bg-[var(--color-border)]" />
                            <div className="h-1 w-1/2 rounded bg-[var(--color-border)]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1 h-full">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="flex flex-col overflow-hidden rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
                          <div className="h-2/5 bg-[var(--color-border)]" />
                          <div className="flex-1 p-0.5 space-y-0.5">
                            <div className="h-1 w-full rounded bg-[var(--color-border)]" />
                            <div className="h-1 w-2/3 rounded bg-[var(--color-border)]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <SourceBadge source={draft.roomSearchLayout != null ? 'hotel' : sourceLabel('roomSearchLayout' as keyof OrgDesignDefaultsConfig, orgDefaults)} />
            {draft.roomSearchLayout != null && (
              <button type="button" onClick={() => reset('roomSearchLayout' as keyof OrgDesignDefaultsConfig)}
                className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
                ↩ Reset
              </button>
            )}
          </div>
        </Section>

        <Section title="Fold/Unfold Offers">
          <OverrideToggleRow
            label="Show all offers expanded by default"
            description="When enabled, room rate options unfold automatically on the search results page."
            fieldKey="roomRatesDefaultExpanded"
            draft={draft} orgDefaults={orgDefaults} systemDefault={false}
            onSet={setB as (key: keyof OrgDesignDefaultsConfig, val: boolean) => void}
            onReset={resetO}
          />
        </Section>

        {property && property.rooms.some(r => r.images.length > 0) && (
          <Section title="Room Images">
            <p className="mb-4 text-xs text-[var(--color-text-muted)]">
              <strong>★</strong> sets the primary image (shown first in carousel) &nbsp;·&nbsp;
              <strong>🚫</strong> hides the image from the carousel.
              Hover over an image to see the controls.
            </p>
            <div className="space-y-6">
              {property.rooms.filter(r => r.images.length > 0).map(room => (
                <div key={room.roomId}>
                  <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">{room.name}</p>
                  <RoomImageManager
                    roomId={room.roomId}
                    images={room.images}
                    excludedIds={draft.excludedRoomImageIds ?? []}
                    primaryImageIds={draft.roomPrimaryImageIds ?? {}}
                    onExcludedChange={ids => set('excludedRoomImageIds', ids)}
                    onPrimaryChange={ids => set('roomPrimaryImageIds', ids)}
                  />
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Guest Age Groups">
          <p className="mb-4 text-xs text-[var(--color-text-muted)]">
            Define the age boundaries used to categorise guests in the search form.
            Adults are any guest aged {effectiveChildMax + 1} and above.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <OverrideNumberRow label="Infant max age" hint={`Ages 0–${effectiveInfantMax} shown as Infants`}
              fieldKey="infantMaxAge" min={0} max={4} systemDefault={2}
              draft={draft} orgDefaults={orgDefaults} onSet={setN} onReset={resetO} />
            <OverrideNumberRow label="Child max age" hint={`Ages ${effectiveInfantMax + 1}–${effectiveChildMax} shown as Children`}
              fieldKey="childMaxAge" min={5} max={17} systemDefault={16}
              draft={draft} orgDefaults={orgDefaults} onSet={setN} onReset={resetO} />
          </div>
          <div className="mt-3 flex gap-4 text-xs">
            <AgeTag label="Infants" range={`0–${effectiveInfantMax}`} color="blue" />
            <AgeTag label="Children" range={`${effectiveInfantMax + 1}–${effectiveChildMax}`} color="amber" />
            <AgeTag label="Adults" range={`${effectiveChildMax + 1}+`} color="green" />
          </div>
        </Section>
      </div>
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
    </div>
  )
}
