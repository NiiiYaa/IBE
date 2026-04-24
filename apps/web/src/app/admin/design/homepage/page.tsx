'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import type { OrgDesignDefaultsConfig, PropertyDesignAdminResponse, HotelDesignConfig, SellModel } from '@ibe/shared'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useGlobalConfig } from '@/hooks/use-global-config'
import { useProperty } from '@/hooks/use-property'
import { useAdminProperty } from '../../property-context'
import { useB2bOrigin } from '@/hooks/use-b2b-origin'
import { useIbeOrigin } from '@/hooks/use-ibe-origin'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { apiClient } from '@/lib/api-client'
import { PropertyImageManager } from '../components/PropertyImageManager'
import {
  ColorRow,
  FormRow,
  SaveBar,
  Section,
  TextInput,
  Toggle,
  selectCls,
} from '../components'
import {
  SourceBadge,
  sourceLabel,
  OverrideColorRow,
  OverrideTextRow,
  OverrideSelectRow,
  OverrideToggleRow,
} from '../override-helpers'
import { HeroThumbnail } from '../HeroThumbnail'
import { compressImage } from '@/lib/compress-image'

const FONT_OPTIONS = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
  'Raleway', 'Nunito', 'Playfair Display', 'Inter',
]

const COLOR_FIELDS: Array<{ key: keyof OrgDesignDefaultsConfig; label: string; hint?: string }> = [
  { key: 'colorPrimary',      label: 'Primary',        hint: 'Buttons, links, highlights' },
  { key: 'colorPrimaryHover', label: 'Primary hover',  hint: 'Button hover state' },
  { key: 'colorPrimaryLight', label: 'Primary light',  hint: 'Tinted backgrounds' },
  { key: 'colorAccent',       label: 'Accent',         hint: 'Secondary highlights' },
  { key: 'colorBackground',   label: 'Page background' },
  { key: 'colorSurface',      label: 'Card surface' },
  { key: 'colorText',         label: 'Body text' },
  { key: 'colorTextMuted',    label: 'Muted text' },
  { key: 'colorBorder',       label: 'Borders' },
  { key: 'colorSuccess',      label: 'Success',        hint: 'Free cancellation, confirms' },
  { key: 'colorError',        label: 'Error',          hint: 'Non-refundable, errors' },
]

const SYSTEM_DEFAULTS: Record<string, string | number> = {
  colorPrimary: '#0f509e', colorPrimaryHover: '#0a3a7a', colorPrimaryLight: '#e8f0fb',
  colorAccent: '#1399cd', colorBackground: '#f2f3ef', colorSurface: '#ffffff',
  colorText: '#211c18', colorTextMuted: '#717171', colorBorder: '#e0e0e0',
  colorSuccess: '#308c67', colorError: '#de1f27',
  fontFamily: 'Roboto', borderRadius: 8,
  heroStyle: 'fullpage', heroImageMode: 'fixed', heroCarouselInterval: 5,
}

type HomepageDraft = Partial<OrgDesignDefaultsConfig> & {
  heroImageUrl?: string | null
  excludedPropertyImageIds?: number[]
  chainFeaturedImageIds?: number[]
}

export default function HomepageDesignPage() {
  const { propertyId } = useAdminProperty()
  if (propertyId === null) return <GlobalHomepageEditor />
  return <PropertyHomepageEditor propertyId={propertyId ?? 0} />
}

// ── Global editor ─────────────────────────────────────────────────────────────

function GlobalHomepageEditor() {
  const qc = useQueryClient()
  const { isLoading, draft, set, save, isPending, isDirty } = useGlobalConfig()
  const { admin } = useAdminAuth()
  const { orgId: ctxOrgId } = useAdminProperty()
  const isSuper = admin?.role === 'super'
  const resolvedOrgId = isSuper ? (ctxOrgId ?? undefined) : (admin?.organizationId ?? undefined)
  const orgQKey = isSuper ? ['admin-org', resolvedOrgId ?? null] : ['admin-org']

  const { data: propertiesData } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: () => apiClient.listProperties(),
    staleTime: 30_000,
  })

  const { data: orgSettings } = useQuery({
    queryKey: orgQKey,
    queryFn: () => apiClient.getOrgSettings(resolvedOrgId),
    staleTime: Infinity,
    enabled: resolvedOrgId !== undefined,
  })

  const realProperties = (propertiesData?.properties ?? []).filter(p => !p.isDemo)
  const isMultiProperty = realProperties.length > 1
  const singlePropertySubdomain = realProperties.length === 1 ? realProperties[0]!.subdomain : null
  const b2bOrigin = useB2bOrigin(singlePropertySubdomain ?? orgSettings?.orgSlug)
  const subdomainOrigin = useIbeOrigin(singlePropertySubdomain ?? orgSettings?.orgSlug)
  const _singlePropId = realProperties.length === 1 ? realProperties[0]!.propertyId : null
  const _devSubdomain = singlePropertySubdomain ?? orgSettings?.orgSlug
  const devB2cUrl = _devSubdomain ? `https://${_devSubdomain}.hyperguest.net` : null
  const b2cOrigin = orgSettings?.webDomain?.replace(/\/$/, '') || subdomainOrigin
  const showCitySelector = propertiesData?.showCitySelector ?? false

  const citySelectorMutation = useMutation({
    mutationFn: (enabled: boolean) => apiClient.setShowCitySelector(enabled),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-properties'] }),
  })

  useEffect(() => {
    const vars: Array<[string, string | null | undefined]> = [
      ['--color-primary',       draft.colorPrimary],
      ['--color-primary-hover', draft.colorPrimaryHover],
      ['--color-primary-light', draft.colorPrimaryLight],
      ['--color-accent',        draft.colorAccent],
      ['--color-background',    draft.colorBackground],
      ['--color-surface',       draft.colorSurface],
      ['--color-text',          draft.colorText],
      ['--color-text-muted',    draft.colorTextMuted],
      ['--color-border',        draft.colorBorder],
      ['--color-success',       draft.colorSuccess],
      ['--color-error',         draft.colorError],
      ['--radius-md',           draft.borderRadius != null ? `${draft.borderRadius}px` : undefined],
      ['--font-sans',           draft.fontFamily ? `'${draft.fontFamily}', system-ui, sans-serif` : undefined],
    ]
    vars.forEach(([prop, val]) => {
      if (prop && val) document.documentElement.style.setProperty(prop, val)
    })
  }, [draft])

  if (isLoading) return <Spinner />

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Homepage</h1>
          {(orgSettings?.enabledModels ?? ['b2c'] as SellModel[]).map(model => {
            const href = model === 'b2b'
              ? (b2bOrigin ? `${b2bOrigin}/` : null)
              : (b2cOrigin ? `${b2cOrigin}/` : devB2cUrl)
            if (!href) return <span key={model} className={viewLinkDisabledCls} title="Not available on this host">{externalIcon} View {model.toUpperCase()}</span>
            return (
              <a key={model} href={href} target="_blank" rel="noopener noreferrer"
                className={viewLinkCls} title={`Open ${model.toUpperCase()} homepage`}>
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
        <Section title="Homepage Layout">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {([
              { value: 'fullpage',  label: 'Full-page hero',  desc: 'Image fills the entire screen, search bar overlaid at the bottom' },
              { value: 'rectangle', label: 'Rectangle hero',  desc: 'Image in a top banner, hotel name and search bar below' },
              { value: 'quilt',     label: 'Quilt',           desc: 'Mosaic of up to 5 photos side by side, hotel name and search bar below' },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => set('heroStyle', opt.value)}
                className={['rounded-xl border-2 p-4 text-left transition-all',
                  (draft.heroStyle ?? null) === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary-light)]',
                ].join(' ')}
              >
                <div className="mb-3 h-16 w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
                  <HeroThumbnail style={opt.value} />
                </div>
                <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
              </button>
            ))}
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Image style</p>
            <div className="flex gap-3">
              {([
                { value: 'fixed',    label: 'Fixed image', desc: 'One photo, no movement' },
                { value: 'carousel', label: 'Carousel',    desc: 'Cycles through all hotel photos automatically' },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => set('heroImageMode', opt.value)}
                  className={['flex-1 rounded-xl border-2 p-3 text-left transition-all',
                    (draft.heroImageMode ?? null) === opt.value
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

          {draft.heroImageMode === 'carousel' && (
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Slide interval
                <span className="ml-1.5 font-normal normal-case text-[var(--color-text-muted)]/60">seconds between images</span>
              </label>
              <div className="flex items-center gap-3">
                <input type="range" min={2} max={15} step={1}
                  value={draft.heroCarouselInterval ?? 5}
                  onChange={e => set('heroCarouselInterval', Number(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <span className="w-12 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
                  {draft.heroCarouselInterval ?? 5}s
                </span>
              </div>
            </div>
          )}

          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
            <Toggle
              label="AI Layout default"
              hint="When enabled, the homepage opens in AI mode by default — hero and visuals are hidden; only the AI chat box is shown."
              checked={draft.aiLayoutDefault ?? false}
              onChange={v => set('aiLayoutDefault', v)}
            />
          </div>
        </Section>

        <Section title="Branding">
          <FormRow label="Display name" hint="Overrides the property name from HyperGuest">
            <TextInput value={draft.displayName ?? ''} onChange={v => set('displayName', v || null)} placeholder="e.g. Grand Palace Hotel" />
          </FormRow>
          <FormRow label="Tagline" hint="Short brand message shown on the homepage">
            <TextInput value={draft.tagline ?? ''} onChange={v => set('tagline', v || null)} placeholder="Your perfect stay" />
          </FormRow>
          <FormRow label="Browser tab title" hint="Defaults to the property name if not set">
            <TextInput value={draft.tabTitle ?? ''} onChange={v => set('tabTitle', v || null)} placeholder="Book Direct — My Hotel" />
          </FormRow>
          <FormRow label="Logo" hint="Direct link or upload an image file">
            <div className="flex items-center gap-3">
              <label className="cursor-pointer rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                Upload file
                <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="sr-only"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    e.target.value = ''
                    set('logoUrl', await compressImage(file, 800))
                  }} />
              </label>
              <span className="text-xs text-[var(--color-text-muted)]">or</span>
              <TextInput value={draft.logoUrl ?? ''} onChange={v => set('logoUrl', v || null)} placeholder="https://..." />
            </div>
            {draft.logoUrl && (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.logoUrl} alt="Logo preview" className="h-10 max-w-[160px] rounded object-contain" />
                <button onClick={() => set('logoUrl', null)} className="text-xs text-[var(--color-text-muted)] underline-offset-2 hover:underline">Remove</button>
              </div>
            )}
          </FormRow>
          <FormRow label="Favicon URL" hint="16×16 or 32×32 — direct link or base64 data URL">
            <div className="flex items-center gap-3">
              <label className="cursor-pointer rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                Upload file
                <input type="file" accept="image/png,image/x-icon,image/svg+xml,image/jpeg,image/webp" className="sr-only"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    e.target.value = ''
                    set('faviconUrl', await compressImage(file, 256))
                  }} />
              </label>
              <span className="text-xs text-[var(--color-text-muted)]">or</span>
              <TextInput value={draft.faviconUrl ?? ''} onChange={v => set('faviconUrl', v || null)} placeholder="https://..." />
            </div>
            {draft.faviconUrl && (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.faviconUrl} alt="Favicon preview" className="h-8 w-8 rounded object-contain border border-[var(--color-border)] bg-[var(--color-background)] p-0.5" />
                <button onClick={() => set('faviconUrl', null)} className="text-xs text-[var(--color-text-muted)] underline-offset-2 hover:underline">Remove</button>
              </div>
            )}
          </FormRow>
        </Section>

        <Section title="Typography & Shape">
          <FormRow label="Font family">
            <select value={draft.fontFamily ?? 'Roboto'} onChange={e => set('fontFamily', e.target.value)} className={selectCls} style={{ fontFamily: draft.fontFamily ?? 'Roboto' }}>
              {FONT_OPTIONS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>
          </FormRow>
          <FormRow label="Border radius" hint={`${draft.borderRadius ?? 8}px`}>
            <input type="range" min={0} max={24} step={2} value={draft.borderRadius ?? 8}
              onChange={e => set('borderRadius', Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]" />
            <div className="mt-2 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <span>Square</span><div className="flex-1 h-px bg-[var(--color-border)]" /><span>Rounded</span>
            </div>
          </FormRow>
        </Section>

        <Section title="Colours">
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map(({ key, label, hint }) => (
              <ColorRow key={key} label={label} hint={hint}
                value={(draft[key as keyof typeof draft] as string | null) ?? '#000000'}
                onChange={v => set(key as keyof typeof draft, v)} />
            ))}
          </div>
        </Section>

        <Section title="Live preview">
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
            <div className="bg-[var(--color-primary)] p-4">
              <p className="text-sm font-semibold text-white">{draft.displayName || 'Hotel Name'}</p>
              <p className="text-xs text-white/70">{draft.tagline || 'Your tagline here'}</p>
            </div>
            <div className="space-y-3 bg-[var(--color-background)] p-4">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
                <p className="text-sm font-semibold text-[var(--color-text)]">Standard Room</p>
                <p className="text-xs text-[var(--color-text-muted)]">2 nights · 2 adults</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">Free cancellation</span>
                  <button className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white" style={{ borderRadius: `${draft.borderRadius ?? 8}px` }}>€300</button>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {isMultiProperty && (
          <Section title="Search Bar Options">
            <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Show city selector</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  Groups properties by city. Guests pick a city first, then a hotel within it.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={showCitySelector}
                onClick={() => citySelectorMutation.mutate(!showCitySelector)}
                className={[
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                  showCitySelector ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
                ].join(' ')}
              >
                <span className={[
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
                  showCitySelector ? 'translate-x-5' : 'translate-x-0',
                ].join(' ')} />
              </button>
            </div>
          </Section>
        )}
      </div>

      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={save} />
    </div>
  )
}

// ── Property editor ───────────────────────────────────────────────────────────

function PropertyHomepageEditor({ propertyId }: { propertyId: number }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<HomepageDraft>({})
  const [isDirty, setIsDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const { admin } = useAdminAuth()
  const isSuper = admin?.role === 'super'

  const { data: designData, isLoading: designLoading } = useQuery<PropertyDesignAdminResponse>({
    queryKey: ['property-design-admin', propertyId],
    queryFn: () => apiClient.getPropertyDesignAdmin(propertyId),
    staleTime: Infinity,
  })

  const { data: config, isLoading: configLoading } = useQuery<HotelDesignConfig>({
    queryKey: ['admin-config', propertyId],
    queryFn: () => apiClient.getHotelConfigAdmin(propertyId),
    staleTime: Infinity,
  })

  const { data: property } = useProperty(propertyId)

  const { data: propertiesData } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: () => apiClient.listProperties(),
    staleTime: 30_000,
  })
  // Super admin: use the all-properties cache (populated by _layout-client) to find subdomain & orgId
  const { data: superPropertiesData } = useQuery({
    queryKey: ['admin-super-properties'],
    queryFn: () => apiClient.listAllProperties(),
    staleTime: Infinity,
    enabled: isSuper,
  })
  const allPropsForProperty = isSuper
    ? (superPropertiesData?.properties ?? [])
    : (propertiesData?.properties ?? []).filter(p => !p.isDemo)
  const currentProp = allPropsForProperty.find(p => p.propertyId === propertyId)
  const propertySubdomain = currentProp?.subdomain

  const isChainMode = allPropsForProperty.filter(p => !p.isDemo).length > 1

  const superPropOrgId = isSuper ? (currentProp?.orgId ?? undefined) : undefined
  const orgQKey = isSuper ? ['admin-org', superPropOrgId ?? null] : ['admin-org']

  const { data: orgSettings } = useQuery({
    queryKey: orgQKey,
    queryFn: () => apiClient.getOrgSettings(superPropOrgId),
    staleTime: Infinity,
    enabled: !isSuper || superPropOrgId !== undefined,
  })

  const b2bOrigin = useB2bOrigin(propertySubdomain ?? orgSettings?.orgSlug)
  const subdomainOrigin = useIbeOrigin(propertySubdomain)
  const devB2cUrl = propertySubdomain ? `https://${propertySubdomain}.hyperguest.net` : null
  const b2cOrigin = orgSettings?.webDomain?.replace(/\/$/, '') || subdomainOrigin

  useEffect(() => {
    if (designData && config && !initialized) {
      setDraft({
        ...designData.overrides,
        heroImageUrl: config.heroImageUrl,
        excludedPropertyImageIds: config.excludedPropertyImageIds,
        chainFeaturedImageIds: config.chainFeaturedImageIds,
      })
      setInitialized(true)
      setIsDirty(false)
    }
  }, [designData, config, initialized])

  useEffect(() => { setInitialized(false); setIsDirty(false) }, [propertyId])

  const orgDefaults = designData?.orgDefaults ?? ({} as OrgDesignDefaultsConfig)

  useEffect(() => {
    const eff = (key: string): string | undefined =>
      (draft[key as keyof HomepageDraft] as string | null | undefined)
      ?? (orgDefaults[key as keyof OrgDesignDefaultsConfig] as string | null | undefined)
      ?? SYSTEM_DEFAULTS[key] as string | undefined
    const radiusVal = draft.borderRadius ?? orgDefaults.borderRadius ?? SYSTEM_DEFAULTS.borderRadius as number
    const fontVal = draft.fontFamily ?? orgDefaults.fontFamily ?? SYSTEM_DEFAULTS.fontFamily as string
    const vars: Array<[string, string | undefined]> = [
      ['--color-primary',       eff('colorPrimary')],
      ['--color-primary-hover', eff('colorPrimaryHover')],
      ['--color-primary-light', eff('colorPrimaryLight')],
      ['--color-accent',        eff('colorAccent')],
      ['--color-background',    eff('colorBackground')],
      ['--color-surface',       eff('colorSurface')],
      ['--color-text',          eff('colorText')],
      ['--color-text-muted',    eff('colorTextMuted')],
      ['--color-border',        eff('colorBorder')],
      ['--color-success',       eff('colorSuccess')],
      ['--color-error',         eff('colorError')],
      ['--radius-md',           radiusVal != null ? `${radiusVal}px` : undefined],
      ['--font-sans',           fontVal ? `'${fontVal}', system-ui, sans-serif` : undefined],
    ]
    vars.forEach(([prop, val]) => { if (prop && val) document.documentElement.style.setProperty(prop, val) })
  }, [draft, orgDefaults])

  const { mutate, isPending, isError, error } = useMutation({
    mutationFn: (d: HomepageDraft) => apiClient.updateHotelConfig(propertyId, d as Parameters<typeof apiClient.updateHotelConfig>[1]),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['property-design-admin', propertyId] })
      void qc.invalidateQueries({ queryKey: ['admin-config', propertyId] })
      setIsDirty(false)
    },
  })

  const set = useCallback(<K extends keyof HomepageDraft>(key: K, value: HomepageDraft[K]) => {
    setDraft(d => ({ ...d, [key]: value }))
    setIsDirty(true)
  }, [])

  const reset = useCallback((key: keyof OrgDesignDefaultsConfig) => {
    setDraft(d => ({ ...d, [key]: null }))
    setIsDirty(true)
  }, [])

  if (!propertyId || designLoading || configLoading) return <Spinner />

  const setStr = set as (key: keyof OrgDesignDefaultsConfig, val: string | null) => void
  const setStrOnly = set as (key: keyof OrgDesignDefaultsConfig, val: string) => void
  const setB = set as (key: keyof OrgDesignDefaultsConfig, val: boolean) => void
  const resetO = reset as (key: keyof OrgDesignDefaultsConfig) => void

  // ── Hero style override ────────────────────────────────────────────────────
  const heroStyleRaw = draft.heroStyle
  const heroStyleOverriding = heroStyleRaw != null
  const heroStyleInherited = orgDefaults.heroStyle ?? SYSTEM_DEFAULTS.heroStyle as 'fullpage' | 'rectangle' | 'quilt'
  const heroStyleEffective = heroStyleOverriding ? heroStyleRaw : heroStyleInherited
  const heroStyleSource: 'hotel' | 'chain' | 'system' = heroStyleOverriding ? 'hotel' : sourceLabel('heroStyle', orgDefaults)

  // ── Hero image mode override ───────────────────────────────────────────────
  const heroImageModeRaw = draft.heroImageMode
  const heroImageModeOverriding = heroImageModeRaw != null
  const heroImageModeInherited = orgDefaults.heroImageMode ?? SYSTEM_DEFAULTS.heroImageMode as 'fixed' | 'carousel'
  const heroImageModeEffective = heroImageModeOverriding ? heroImageModeRaw : heroImageModeInherited
  const heroImageModeSource: 'hotel' | 'chain' | 'system' = heroImageModeOverriding ? 'hotel' : sourceLabel('heroImageMode', orgDefaults)

  // ── Hero carousel interval override ───────────────────────────────────────
  const heroCarouselRaw = draft.heroCarouselInterval
  const heroCarouselOverriding = heroCarouselRaw != null
  const heroCarouselInherited = orgDefaults.heroCarouselInterval ?? SYSTEM_DEFAULTS.heroCarouselInterval as number
  const heroCarouselEffective = heroCarouselOverriding ? heroCarouselRaw : heroCarouselInherited
  const heroCarouselSource: 'hotel' | 'chain' | 'system' = heroCarouselOverriding ? 'hotel' : sourceLabel('heroCarouselInterval', orgDefaults)

  // ── Logo override ──────────────────────────────────────────────────────────
  const logoRaw = draft.logoUrl as string | null | undefined
  const logoOverriding = logoRaw != null
  const logoInherited = orgDefaults.logoUrl
  const logoSource: 'hotel' | 'chain' | 'system' = logoOverriding ? 'hotel' : sourceLabel('logoUrl', orgDefaults)

  // ── Favicon override ───────────────────────────────────────────────────────
  const faviconRaw = draft.faviconUrl as string | null | undefined
  const faviconOverriding = faviconRaw != null
  const faviconInherited = orgDefaults.faviconUrl
  const faviconSource: 'hotel' | 'chain' | 'system' = faviconOverriding ? 'hotel' : sourceLabel('faviconUrl', orgDefaults)

  // ── Border radius override (slider) ───────────────────────────────────────
  const borderRadiusRaw = draft.borderRadius
  const borderRadiusOverriding = borderRadiusRaw != null
  const borderRadiusInherited = orgDefaults.borderRadius ?? SYSTEM_DEFAULTS.borderRadius as number
  const borderRadiusEffective = borderRadiusOverriding ? borderRadiusRaw : borderRadiusInherited
  const borderRadiusSource: 'hotel' | 'chain' | 'system' = borderRadiusOverriding ? 'hotel' : sourceLabel('borderRadius', orgDefaults)

  const hgImages = property?.images ?? []
  const fontOptions = FONT_OPTIONS.map(f => ({ value: f, label: f }))
  const effectiveDisplayName = (draft.displayName ?? designData?.hgName ?? property?.name ?? '')
  const effectiveTagline = (draft.tagline ?? orgDefaults.tagline ?? '')

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Homepage</h1>
          {(orgSettings?.enabledModels ?? ['b2c'] as SellModel[]).map(model => {
            const href = model === 'b2b'
              ? (b2bOrigin ? `${b2bOrigin}/` : null)
              : (b2cOrigin ? `${b2cOrigin}/` : devB2cUrl)
            if (!href) return <span key={model} className={viewLinkDisabledCls} title="Not available on this host">{externalIcon} View {model.toUpperCase()}</span>
            return (
              <a key={model} href={href} target="_blank" rel="noopener noreferrer"
                className={viewLinkCls} title={`Open ${model.toUpperCase()} hotel page`}>
                {externalIcon} View {model.toUpperCase()}
              </a>
            )
          })}
        </div>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Hotel overrides — inherit from chain or set a custom value for this hotel.
        </p>
      </div>

      <div className="space-y-6">
        <Section title="Homepage Layout">
          {/* Layout style */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Layout style</p>
              <SourceBadge source={heroStyleSource} />
              {heroStyleOverriding ? (
                <button type="button" onClick={() => reset('heroStyle')}
                  className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
                  ↩ Reset
                </button>
              ) : (
                <button type="button" onClick={() => set('heroStyle', heroStyleEffective)}
                  className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                  Override
                </button>
              )}
            </div>
            <div className={`grid grid-cols-2 gap-4 sm:grid-cols-3 ${!heroStyleOverriding ? 'pointer-events-none opacity-60' : ''}`}>
              {([
                { value: 'fullpage',  label: 'Full-page hero',  desc: 'Image fills the entire screen, search bar overlaid at the bottom' },
                { value: 'rectangle', label: 'Rectangle hero',  desc: 'Image in a top banner, hotel name and search bar below' },
                { value: 'quilt',     label: 'Quilt',           desc: 'Mosaic of up to 5 photos side by side, hotel name and search bar below' },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => set('heroStyle', opt.value)}
                  className={['rounded-xl border-2 p-4 text-left transition-all',
                    heroStyleEffective === opt.value
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-primary-light)]',
                  ].join(' ')}
                >
                  <div className="mb-3 h-16 w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
                    <HeroThumbnail style={opt.value} />
                  </div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Image style */}
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Image style</p>
              <SourceBadge source={heroImageModeSource} />
              {heroImageModeOverriding ? (
                <button type="button" onClick={() => reset('heroImageMode')}
                  className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
                  ↩ Reset
                </button>
              ) : (
                <button type="button" onClick={() => set('heroImageMode', heroImageModeEffective)}
                  className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                  Override
                </button>
              )}
            </div>
            <div className={`flex gap-3 ${!heroImageModeOverriding ? 'pointer-events-none opacity-60' : ''}`}>
              {([
                { value: 'fixed',    label: 'Fixed image', desc: 'One photo, no movement' },
                { value: 'carousel', label: 'Carousel',    desc: 'Cycles through all hotel photos automatically' },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => set('heroImageMode', opt.value)}
                  className={['flex-1 rounded-xl border-2 p-3 text-left transition-all',
                    heroImageModeEffective === opt.value
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

          {/* Carousel interval */}
          {heroImageModeEffective === 'carousel' && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Slide interval
                  <span className="ml-1.5 font-normal normal-case text-[var(--color-text-muted)]/60">seconds between images</span>
                </span>
                <SourceBadge source={heroCarouselSource} />
                {heroCarouselOverriding ? (
                  <button type="button" onClick={() => reset('heroCarouselInterval')}
                    className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
                    ↩ Reset
                  </button>
                ) : (
                  <button type="button" onClick={() => set('heroCarouselInterval', heroCarouselEffective)}
                    className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                    Override
                  </button>
                )}
              </div>
              <div className={`flex items-center gap-3 ${!heroCarouselOverriding ? 'pointer-events-none opacity-60' : ''}`}>
                <input type="range" min={2} max={15} step={1}
                  value={heroCarouselEffective}
                  onChange={e => set('heroCarouselInterval', Number(e.target.value))}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <span className="w-12 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
                  {heroCarouselEffective}s
                </span>
              </div>
            </div>
          )}

          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
            <OverrideToggleRow
              label="AI Layout default"
              description="When enabled, the hotel homepage opens in AI mode by default — hero and visuals are hidden; only the AI chat box is shown."
              fieldKey="aiLayoutDefault"
              systemDefault={false}
              draft={draft} orgDefaults={orgDefaults} onSet={setB} onReset={resetO}
            />
          </div>
        </Section>

        <Section title="Branding">
          <OverrideTextRow label="Hotel name" fieldKey="displayName"
            hgFallback={designData?.hgName ?? property?.name ?? null}
            placeholder="e.g. Grand Palace Hotel"
            draft={draft} orgDefaults={orgDefaults} onSet={setStr} onReset={reset} />

          {/* Logo — inline override with HyperGuest fallback and image preview */}
          <FormRow label="Logo">
            {property?.logo && (
              <div className="mb-2 flex items-center gap-2">
                <HgBadge />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={property.logo} alt="HyperGuest logo" className="h-10 max-w-[160px] rounded object-contain" />
              </div>
            )}
            <div className="flex items-center gap-2">
              {logoOverriding ? (
                <div className="flex flex-1 items-center gap-2">
                  <label className="cursor-pointer rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                    Upload file
                    <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="sr-only"
                      onChange={async e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        e.target.value = ''
                        set('logoUrl', await compressImage(file, 800))
                      }} />
                  </label>
                  <span className="text-xs text-[var(--color-text-muted)]">or</span>
                  <TextInput value={logoRaw ?? ''} onChange={v => set('logoUrl', v || null)} placeholder="https://..." />
                </div>
              ) : (
                <div className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm italic text-[var(--color-text-muted)]">
                  {logoInherited ?? <span className="opacity-50">not set</span>}
                </div>
              )}
              <SourceBadge source={logoSource} />
              {logoOverriding ? (
                <button type="button" onClick={() => reset('logoUrl')}
                  className="shrink-0 text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
                  ↩ Reset
                </button>
              ) : (
                <button type="button" onClick={() => set('logoUrl', logoInherited ?? '')}
                  className="shrink-0 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                  Override
                </button>
              )}
            </div>
            {logoOverriding && logoRaw && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoRaw} alt="Logo preview" className="mt-2 h-10 max-w-[160px] rounded object-contain" />
            )}
          </FormRow>

          {/* Favicon — inline override with file upload */}
          <FormRow label="Favicon" hint="16×16 or 32×32 — direct link or base64 data URL">
            <div className="flex items-center gap-2">
              {faviconOverriding ? (
                <div className="flex flex-1 items-center gap-2">
                  <label className="cursor-pointer rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                    Upload file
                    <input type="file" accept="image/png,image/x-icon,image/svg+xml,image/jpeg,image/webp" className="sr-only"
                      onChange={async e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        e.target.value = ''
                        set('faviconUrl', await compressImage(file, 256))
                      }} />
                  </label>
                  <span className="text-xs text-[var(--color-text-muted)]">or</span>
                  <TextInput value={faviconRaw ?? ''} onChange={v => set('faviconUrl', v || null)} placeholder="https://..." />
                </div>
              ) : (
                <div className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm italic text-[var(--color-text-muted)]">
                  {faviconInherited ?? <span className="opacity-50">not set</span>}
                </div>
              )}
              <SourceBadge source={faviconSource} />
              {faviconOverriding ? (
                <button type="button" onClick={() => reset('faviconUrl')}
                  className="shrink-0 text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
                  ↩ Reset
                </button>
              ) : (
                <button type="button" onClick={() => set('faviconUrl', faviconInherited ?? '')}
                  className="shrink-0 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                  Override
                </button>
              )}
            </div>
            {faviconOverriding && faviconRaw && (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={faviconRaw} alt="Favicon preview" className="h-8 w-8 rounded object-contain border border-[var(--color-border)] bg-[var(--color-background)] p-0.5" />
                <button onClick={() => set('faviconUrl', null)} className="text-xs text-[var(--color-text-muted)] underline-offset-2 hover:underline">Remove</button>
              </div>
            )}
          </FormRow>

          {/* Hero image — property-specific, no org inheritance */}
          <FormRow label="Hero image">
            {hgImages.length > 0 && (
              <div className="mb-3">
                <p className="mb-2 text-xs text-[var(--color-text-muted)]">
                  <strong>★</strong> sets the hero image &nbsp;·&nbsp; <strong>🚫</strong> hides it from the carousel
                  {isChainMode && <> &nbsp;·&nbsp; <strong className="text-amber-500">↑</strong> features on chain page</>}. Hover to see controls.
                </p>
                <PropertyImageManager
                  images={hgImages}
                  heroImageUrl={draft.heroImageUrl ?? ''}
                  excludedIds={draft.excludedPropertyImageIds ?? []}
                  onHeroChange={url => set('heroImageUrl', url)}
                  onExcludedChange={ids => set('excludedPropertyImageIds', ids)}
                  showChainFlag={isChainMode}
                  chainFeaturedIds={draft.chainFeaturedImageIds ?? []}
                  onChainFeaturedChange={ids => set('chainFeaturedImageIds', ids)}
                />
              </div>
            )}
            <p className="mb-1 text-xs text-[var(--color-text-muted)]">Or enter a custom URL</p>
            <TextInput value={draft.heroImageUrl ?? ''} onChange={v => set('heroImageUrl', v || null)} placeholder="https://..." />
            {draft.heroImageUrl && (
              <div className="relative mt-2 h-28 w-full overflow-hidden rounded-lg">
                <Image src={draft.heroImageUrl} alt="Hero preview" fill unoptimized sizes="640px" className="object-cover" />
              </div>
            )}
          </FormRow>

          <OverrideTextRow label="Tagline" fieldKey="tagline" placeholder="Your perfect stay"
            draft={draft} orgDefaults={orgDefaults} onSet={setStr} onReset={reset} />

          <OverrideTextRow label="Browser tab title" fieldKey="tabTitle"
            placeholder={effectiveDisplayName || 'Hotel Booking'}
            hint="Shown in the browser tab and search engine results"
            draft={draft} orgDefaults={orgDefaults} onSet={setStr} onReset={reset} />
        </Section>

        <Section title="Typography & Shape">
          <OverrideSelectRow label="Font family" fieldKey="fontFamily"
            options={fontOptions}
            draft={draft} orgDefaults={orgDefaults}
            systemDefault="Roboto"
            onSet={setStrOnly} onReset={reset} />

          {/* Border radius — inline override with slider */}
          <FormRow label="Border radius" hint={`${borderRadiusEffective}px`}>
            <div className="flex items-start gap-3">
              <div className={`flex flex-1 flex-col gap-2 ${!borderRadiusOverriding ? 'pointer-events-none opacity-60' : ''}`}>
                <input type="range" min={0} max={24} step={2}
                  value={borderRadiusEffective}
                  onChange={e => set('borderRadius', Number(e.target.value))}
                  className="w-full accent-[var(--color-primary)]"
                />
                <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                  <span>Square</span><div className="flex-1 h-px bg-[var(--color-border)]" /><span>Rounded</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 pt-1">
                <SourceBadge source={borderRadiusSource} />
                {borderRadiusOverriding ? (
                  <button type="button" onClick={() => reset('borderRadius')}
                    className="text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]">
                    ↩ Reset
                  </button>
                ) : (
                  <button type="button" onClick={() => set('borderRadius', borderRadiusEffective)}
                    className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                    Override
                  </button>
                )}
              </div>
            </div>
          </FormRow>
        </Section>

        <Section title="Colours">
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map(({ key, label, hint }) => (
              <OverrideColorRow key={key} fieldKey={key} label={label} hint={hint}
                draft={draft} orgDefaults={orgDefaults}
                systemDefault={SYSTEM_DEFAULTS[key as string] as string}
                onSet={setStrOnly} onReset={reset} />
            ))}
          </div>
        </Section>

        <Section title="Live preview">
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
            <div className="bg-[var(--color-primary)] p-4">
              <p className="text-sm font-semibold text-white">{effectiveDisplayName || 'Hotel Name'}</p>
              <p className="text-xs text-white/70">{effectiveTagline || 'Your tagline here'}</p>
            </div>
            <div className="space-y-3 bg-[var(--color-background)] p-4">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
                <p className="text-sm font-semibold text-[var(--color-text)]">Standard Room</p>
                <p className="text-xs text-[var(--color-text-muted)]">2 nights · 2 adults</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">Free cancellation</span>
                  <button className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white" style={{ borderRadius: `${borderRadiusEffective}px` }}>€300</button>
                </div>
              </div>
            </div>
          </div>
        </Section>
      </div>

      {isError && (
        <div className="fixed bottom-20 right-6 z-50 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">
          Save failed: {(error as Error)?.message ?? 'Unknown error'}
        </div>
      )}
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={() => mutate(draft)} />
    </div>
  )
}


const viewLinkCls = 'flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
const viewLinkDisabledCls = 'flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] opacity-40 cursor-not-allowed'
const externalIcon = (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

function HgBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
      From HyperGuest
    </span>
  )
}

function Spinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
    </div>
  )
}
