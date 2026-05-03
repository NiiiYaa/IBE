'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useAiMode } from '@/context/ai-mode'
import { useT } from '@/context/translations'
import { IncentiveWidget } from '@/components/incentive/IncentiveWidget'
import { HeroCarousel } from '@/components/home/HeroCarousel'
import { QuiltHero } from '@/components/home/QuiltHero'
import { PropertyGridClient, type PropertyData } from '@/components/home/PropertyGridClient'
import { OnsiteConversionHomepage } from '@/components/onsite/OnsiteConversionHomepage'
import { PixelInjector } from '@/components/tracking/PixelInjector'
import { ChatWidget } from '@/components/chat/ChatWidget'
import type { IncentiveSlots } from '@ibe/shared'
import type { PropertyOption } from '@/components/search/SearchBar'

const SearchBar = dynamic(
  () => import('@/components/search/SearchBar').then(m => ({ default: m.SearchBar })),
  {
    ssr: false,
    loading: () => <div className="mx-auto h-[60px] max-w-3xl animate-pulse rounded-full bg-white/30 backdrop-blur-sm" />,
  },
)

interface HomeSearchBarProps {
  propertyId: number
  infantMaxAge: number
  childMaxAge: number
  aiEnabled: boolean
  orgId?: number
  properties?: PropertyOption[]
  showCitySelector?: boolean
}

interface HomeChatWidgetProps {
  propertyId?: number
  orgId?: number
  whatsappPrefilledMessage: string
}

export interface HomePageClientProps {
  cssVars: string
  aiLayoutDefault: boolean
  heroStyle: 'quilt' | 'rectangle' | 'fullpage'
  heroImageMode: 'fixed' | 'carousel'
  heroCarouselInterval: number
  displayName: string
  chainName?: string | null
  tagline?: string | null
  heroImageUrl: string | null
  carouselImages: string[]
  propertyId: number
  onsitePage: 'chain' | 'hotel'
  isMulti: boolean
  propertyListLayout: 'grid' | 'list'
  multiProperties: (PropertyData & { isDefault: boolean })[] | null
  remainingEntries: { propertyId: number; name: string }[]
  searchBarProps: HomeSearchBarProps
  chatWidgetProps: HomeChatWidgetProps
  incentive?: IncentiveSlots | null
}

export function HomePageClient({
  cssVars,
  aiLayoutDefault,
  heroStyle,
  heroImageMode,
  heroCarouselInterval,
  displayName,
  chainName,
  tagline,
  heroImageUrl,
  carouselImages,
  propertyId,
  onsitePage,
  isMulti: _isMulti,
  propertyListLayout,
  multiProperties,
  remainingEntries,
  searchBarProps,
  chatWidgetProps,
  incentive,
}: HomePageClientProps) {
  const { aiLayout, setAiLayout } = useAiMode()
  const tProps = useT('properties')
  const chainLabel = chainName
    ? (/^the\b/i.test(chainName) ? `Part of ${chainName} Collection` : `Part of The ${chainName} Collection`)
    : null

  useEffect(() => {
    setAiLayout(aiLayoutDefault)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const PageStyle = cssVars
    ? <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} />
    : null

  const incentiveSlot = onsitePage === 'chain' ? incentive?.chainPage : incentive?.hotelPage
  // Rendered on light backgrounds (quilt, rectangle, mobile fullpage)
  const IncentiveBlockLight = incentiveSlot && !aiLayout ? (
    <div className="mt-4 w-full">
      <IncentiveWidget incentive={incentiveSlot} variant="light" />
    </div>
  ) : null
  // Rendered on dark overlay (fullpage desktop hero only)
  const IncentiveBlockDark = incentiveSlot && !aiLayout ? (
    <div className="mt-4 w-full">
      <IncentiveWidget incentive={incentiveSlot} variant="dark" />
    </div>
  ) : null

  const PropertyGrid = multiProperties && multiProperties.length > 1 ? (
    <div className="bg-[var(--color-background)] px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-6 text-2xl font-bold text-[var(--color-text)]">{tProps('ourHotels')}</h2>
        <PropertyGridClient
          initial={multiProperties}
          remaining={remainingEntries}
          layout={propertyListLayout}
        />
      </div>
    </div>
  ) : null

  const MobileRectangleHero = (
    <div className="relative h-52 w-full overflow-hidden sm:hidden">
      {heroImageMode === 'carousel' ? (
        <HeroCarousel images={carouselImages} alt={displayName} variant="rectangle" intervalSeconds={heroCarouselInterval} />
      ) : heroImageUrl ? (
        <Image src={heroImageUrl} alt={displayName} fill priority unoptimized sizes="100vw" className="object-cover" />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-slate-700 to-slate-500" />
      )}
    </div>
  )

  if (heroStyle === 'quilt') {
    return (
      <div className="sm:flex-1 bg-[var(--color-background)]">
        {PageStyle}
        {!aiLayout && MobileRectangleHero}
        {!aiLayout && (
          <div className="hidden sm:block mx-auto max-w-6xl px-4 pt-6">
            <QuiltHero
              images={carouselImages}
              carousel={heroImageMode === 'carousel'}
              intervalSeconds={heroCarouselInterval}
              displayName={displayName}
            />
          </div>
        )}
        <div className={`mx-auto max-w-5xl px-4 ${aiLayout ? 'py-12' : 'py-4 sm:py-6'}`}>
          {!aiLayout && (
            <div className="mb-3 sm:mb-4 text-center">
              <h1 className="text-2xl font-bold text-[var(--color-text)] sm:text-4xl">{displayName}</h1>
              {chainLabel && <p className="mt-1 text-xs sm:text-sm font-medium tracking-wide text-[var(--color-text-muted)]">{chainLabel}</p>}
              {tagline && <p className="mt-1 sm:mt-2 text-base sm:text-lg text-[var(--color-text-muted)]">{tagline}</p>}
            </div>
          )}
          <SearchBar {...searchBarProps} />
          {IncentiveBlockLight}
        </div>
        {!aiLayout && PropertyGrid}
        {!aiLayout && <OnsiteConversionHomepage propertyId={propertyId} page={onsitePage} />}
        {!aiLayout && <PixelInjector propertyId={propertyId} page="home" />}
        <ChatWidget {...chatWidgetProps} />
      </div>
    )
  }

  if (heroStyle === 'rectangle') {
    return (
      <div className="sm:flex-1 bg-[var(--color-background)]">
        {PageStyle}
        {!aiLayout && (
          <div className="relative h-44 sm:h-[50vh] w-full overflow-hidden">
            {heroImageMode === 'carousel' ? (
              <HeroCarousel images={carouselImages} alt={displayName} variant="rectangle" intervalSeconds={heroCarouselInterval} />
            ) : heroImageUrl ? (
              <Image src={heroImageUrl} alt={displayName} fill priority unoptimized sizes="100vw" className="object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-slate-700 to-slate-500" />
            )}
          </div>
        )}
        <div className={`mx-auto max-w-5xl px-4 ${aiLayout ? 'py-12' : 'py-4 sm:py-6'}`}>
          {!aiLayout && (
            <div className="mb-3 sm:mb-4 text-center">
              <h1 className="text-2xl font-bold text-[var(--color-text)] sm:text-4xl">{displayName}</h1>
              {chainLabel && <p className="mt-1 text-xs sm:text-sm font-medium tracking-wide text-[var(--color-text-muted)]">{chainLabel}</p>}
              {tagline && <p className="mt-1 sm:mt-3 text-base sm:text-lg text-[var(--color-text-muted)]">{tagline}</p>}
            </div>
          )}
          <SearchBar {...searchBarProps} />
          {IncentiveBlockLight}
        </div>
        {!aiLayout && PropertyGrid}
        {!aiLayout && <OnsiteConversionHomepage propertyId={propertyId} page={onsitePage} />}
        {!aiLayout && <PixelInjector propertyId={propertyId} page="home" />}
        <ChatWidget {...chatWidgetProps} />
      </div>
    )
  }

  // fullpage style
  return (
    <>
      {PageStyle}

      {/* Mobile: rectangle hero + title + search */}
      <div className="sm:hidden bg-[var(--color-background)]">
        {!aiLayout && MobileRectangleHero}
        <div className={`mx-auto max-w-5xl px-4 ${aiLayout ? 'py-8' : 'py-4'}`}>
          {!aiLayout && (
            <div className="mb-3 text-center">
              <h1 className="text-2xl font-bold text-[var(--color-text)]">{displayName}</h1>
              {chainLabel && <p className="mt-1 text-xs font-medium tracking-wide text-[var(--color-text-muted)]">{chainLabel}</p>}
              {tagline && <p className="mt-1 text-base text-[var(--color-text-muted)]">{tagline}</p>}
            </div>
          )}
          <SearchBar {...searchBarProps} />
          {IncentiveBlockLight}
        </div>
      </div>

      {/* Desktop: fullpage hero with centered title + search */}
      <div className={`hidden sm:flex relative flex-col ${!aiLayout ? 'min-h-screen' : ''}`}>
        {!aiLayout && (
          <div className="absolute inset-0">
            {heroImageMode === 'carousel' ? (
              <HeroCarousel images={carouselImages} alt={displayName} variant="fullpage" intervalSeconds={heroCarouselInterval} />
            ) : heroImageUrl ? (
              <Image src={heroImageUrl} alt={displayName} fill priority unoptimized sizes="100vw" className="object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-slate-800 to-slate-600" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/65" />
          </div>
        )}
        <div className={`relative flex flex-1 flex-col items-center px-4 ${!aiLayout ? 'justify-center' : 'py-12'}`}>
          {!aiLayout && (
            <div className="w-full text-center">
              <h1 className="text-5xl font-bold text-white drop-shadow-lg lg:text-6xl">{displayName}</h1>
              {chainLabel && <p className="mt-1.5 text-sm font-medium tracking-wide text-white/70 drop-shadow">{chainLabel}</p>}
              {tagline && <p className="mt-2 text-xl text-white/80 drop-shadow">{tagline}</p>}
            </div>
          )}
          <div className={`w-full ${!aiLayout ? 'mt-4' : ''}`}>
            <SearchBar {...searchBarProps} />
          </div>
          {IncentiveBlockDark}
        </div>
      </div>

      {!aiLayout && PropertyGrid}
      {!aiLayout && <OnsiteConversionHomepage propertyId={propertyId} page={onsitePage} />}
      {!aiLayout && <PixelInjector propertyId={propertyId} page="home" />}
      <ChatWidget {...chatWidgetProps} />
    </>
  )
}
