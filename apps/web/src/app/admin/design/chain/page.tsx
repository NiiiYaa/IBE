'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, SellModel } from '@ibe/shared'
import { useGlobalConfig } from '@/hooks/use-global-config'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useB2bOrigin } from '@/hooks/use-b2b-origin'
import { apiClient } from '@/lib/api-client'
import { ColorRow, Section, FormRow, TextInput, SaveBar, selectCls } from '../components'
import { compressImage } from '@/lib/compress-image'
import { HeroThumbnail } from '../HeroThumbnail'
import { PropertyImageManager } from '../components/PropertyImageManager'

const viewLinkCls = 'flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
const viewLinkDisabledCls = 'flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-muted)] opacity-40 cursor-not-allowed'
const externalIcon = (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

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

const SYSTEM_DEFAULTS: Record<string, string> = {
  colorPrimary: '#0f509e', colorPrimaryHover: '#0a3a7a', colorPrimaryLight: '#e8f0fb',
  colorAccent: '#1399cd', colorBackground: '#f2f3ef', colorSurface: '#ffffff',
  colorText: '#211c18', colorTextMuted: '#717171', colorBorder: '#e0e0e0',
  colorSuccess: '#308c67', colorError: '#de1f27',
}

function Spinner() {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
    </div>
  )
}

export default function ChainPage() {
  const qc = useQueryClient()
  const { isLoading, draft, set, save, isPending, isDirty, saveError } = useGlobalConfig()
  const { admin } = useAdminAuth()
  const orgId = admin?.organizationId

  const { data: propertiesData } = useQuery({
    queryKey: ['admin-properties'],
    queryFn: () => apiClient.listProperties(),
    staleTime: 30_000,
  })

  const { data: orgSettings } = useQuery({
    queryKey: ['admin-org'],
    queryFn: () => apiClient.getOrgSettings(),
    staleTime: Infinity,
    enabled: !!orgId,
  })

  const b2bOrigin = useB2bOrigin(orgSettings?.orgSlug)

  const showCitySelector = propertiesData?.showCitySelector ?? false

  const citySelectorMutation = useMutation({
    mutationFn: (enabled: boolean) => apiClient.setShowCitySelector(enabled),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-properties'] }),
  })

  // Single endpoint fetches all chain-featured images for the whole org
  const propertyImagesQuery = useQuery({
    queryKey: ['admin-chain-property-images'],
    queryFn: () => apiClient.getChainImages(),
    staleTime: 60_000,
    retry: 1,
  })

  const allImages = propertyImagesQuery.data?.properties ?? []
  const flatImages = allImages.flatMap(p => p.images)

  // Live-preview CSS vars
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
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Chain-page</h1>
          {(orgSettings?.enabledModels ?? ['b2c'] as SellModel[]).map(model => {
            const path = orgSettings?.hyperGuestOrgId ? `/?chain=${orgSettings.hyperGuestOrgId}` : '/'
            const href = model === 'b2b' ? (b2bOrigin ? `${b2bOrigin}${path}` : null) : path
            if (!href) {
              return (
                <span key={model} className={viewLinkDisabledCls} title="B2B subdomain not available on this host">
                  {externalIcon} View B2B
                </span>
              )
            }
            return (
              <a key={model} href={href} target="_blank" rel="noopener noreferrer"
                className={viewLinkCls} title={`Open ${model.toUpperCase()} chain page`}>
                {externalIcon}
                View {model.toUpperCase()}
              </a>
            )
          })}
        </div>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Configure the multi-property landing page shown when guests visit your direct booking site.
        </p>
      </div>

      <div className="mt-6 space-y-6">

        {/* ── Homepage Layout ── */}
        <Section title="Homepage Layout">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {([
              { value: 'fullpage',  label: 'Full-page hero',  desc: 'Image fills the entire screen, search bar overlaid at the bottom' },
              { value: 'rectangle', label: 'Rectangle hero',  desc: 'Image in a top banner, search bar below' },
              { value: 'quilt',     label: 'Quilt',           desc: 'Mosaic of up to 5 photos side by side, search bar below' },
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
                { value: 'carousel', label: 'Carousel',    desc: 'Cycles through photos automatically' },
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
        </Section>

        {/* ── Hero Images ── */}
        <Section title="Hero Images">
          <p className="mb-4 text-xs text-[var(--color-text-muted)]">
            Images flagged with ↑ on each hotel page appear here. <strong>★</strong> sets the hero image &nbsp;·&nbsp; <strong>🚫</strong> hides it from the carousel.
          </p>

          {propertyImagesQuery.isLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-[var(--color-border)]" />
          ) : propertyImagesQuery.isError ? (
            <div className="rounded-xl border border-[var(--color-error)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-error)]">
              Failed to load images.{' '}
              <button onClick={() => void propertyImagesQuery.refetch()} className="underline underline-offset-2">
                Retry
              </button>
            </div>
          ) : flatImages.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              No images flagged yet. Go to each hotel&apos;s Homepage design page and tap the ↑ button on images you want here.
            </p>
          ) : (
            <PropertyImageManager
              images={flatImages}
              heroImageUrl={draft.chainHeroImageUrl ?? ''}
              excludedIds={draft.chainExcludedPropertyImageIds ?? []}
              onHeroChange={url => set('chainHeroImageUrl', url || null)}
              onExcludedChange={newIds => set('chainExcludedPropertyImageIds', newIds)}
            />
          )}

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">Or enter a custom URL for the hero image</p>
            <TextInput value={draft.chainHeroImageUrl ?? ''} onChange={v => set('chainHeroImageUrl', v || null)} placeholder="https://..." />
          </div>

          {draft.chainHeroImageUrl && (
            <div className="mt-3">
              <div className="relative h-40 w-full overflow-hidden rounded-xl border border-[var(--color-border)]">
                <Image src={draft.chainHeroImageUrl} alt="Chain hero preview" fill unoptimized sizes="640px" className="object-cover" />
              </div>
              <button onClick={() => set('chainHeroImageUrl', null)} className="mt-1.5 text-xs text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-error)]">
                Remove
              </button>
            </div>
          )}
        </Section>

        {/* ── Branding ── */}
        <Section title="Branding">
          <FormRow label="Display name" hint="Name shown in the hero heading on the chain page">
            <TextInput value={draft.displayName ?? ''} onChange={v => set('displayName', v || null)} placeholder="e.g. Grand Hotels Collection" />
          </FormRow>
          <FormRow label="Tagline" hint="Short brand message below the display name">
            <TextInput value={draft.tagline ?? ''} onChange={v => set('tagline', v || null)} placeholder="Find your perfect stay" />
          </FormRow>
          <FormRow label="Browser tab title" hint="Defaults to the display name if not set">
            <TextInput value={draft.tabTitle ?? ''} onChange={v => set('tabTitle', v || null)} placeholder="Book Direct — My Chain" />
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

        {/* ── Typography & Shape ── */}
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

        {/* ── Colours ── */}
        <Section title="Colours">
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map(({ key, label, hint }) => (
              <ColorRow key={key} label={label} hint={hint}
                value={(draft[key as keyof typeof draft] as string | null) ?? SYSTEM_DEFAULTS[key] ?? '#000000'}
                onChange={v => set(key as keyof typeof draft, v)} />
            ))}
          </div>
        </Section>

        {/* ── Live preview ── */}
        <Section title="Live preview">
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
            <div className="bg-[var(--color-primary)] p-4">
              <p className="text-sm font-semibold text-white">{draft.displayName || 'Chain Name'}</p>
              <p className="text-xs text-white/70">{draft.tagline || 'Your tagline here'}</p>
            </div>
            <div className="space-y-3 bg-[var(--color-background)] p-4">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
                <p className="text-sm font-semibold text-[var(--color-text)]">Grand City Hotel</p>
                <p className="text-xs text-[var(--color-text-muted)]">Paris · ★★★★★</p>
                <div className="mt-3">
                  <button
                    className="w-full rounded border border-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-[var(--color-primary)]"
                    style={{ borderRadius: `${draft.borderRadius ?? 8}px` }}
                  >
                    Check Availability
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Search Bar Options ── */}
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

      </div>

      {saveError && (
        <div className="fixed bottom-24 right-6 z-50 rounded-lg border border-[var(--color-error)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-error)] shadow-xl">
          Save failed: {saveError}
        </div>
      )}
      <SaveBar isDirty={isDirty} isSaving={isPending} onSave={save} />
    </div>
  )
}
