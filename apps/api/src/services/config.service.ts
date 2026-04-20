import type { HotelDesignConfig, UpdateDesignConfigRequest, OrgDesignDefaultsConfig } from '@ibe/shared'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'

const GOOGLE_FONTS_BASE = 'https://fonts.googleapis.com/css2'

const SAFE_GOOGLE_FONTS = new Set([
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
  'Raleway', 'Nunito', 'Playfair Display', 'Cormorant Garamond',
  'Inter', 'Source Sans 3', 'Josefin Sans', 'Libre Baskerville',
])

function buildFontUrl(fontFamily: string): string {
  const family = SAFE_GOOGLE_FONTS.has(fontFamily) ? fontFamily : 'Roboto'
  const encoded = encodeURIComponent(family)
  return `${GOOGLE_FONTS_BASE}?family=${encoded}:wght@300;400;500;600;700&display=swap`
}

const SYSTEM_DEFAULTS = {
  colorPrimary: '#0f509e',
  colorPrimaryHover: '#0a3a7a',
  colorPrimaryLight: '#e8f0fb',
  colorAccent: '#1399cd',
  colorBackground: '#f2f3ef',
  colorSurface: '#ffffff',
  colorText: '#211c18',
  colorTextMuted: '#717171',
  colorBorder: '#e0e0e0',
  colorSuccess: '#308c67',
  colorError: '#de1f27',
  fontFamily: 'Roboto',
  borderRadius: 8,
  defaultCurrency: 'EUR',
  defaultLocale: 'en',
  textDirection: 'ltr' as const,
  enabledLocales: ['en'],
  enabledCurrencies: ['EUR'],
}

export async function getHotelDesignConfig(propertyId: number): Promise<HotelDesignConfig> {
  const [config, property] = await Promise.all([
    prisma.hotelConfig.findUnique({ where: { propertyId } }),
    prisma.property.findUnique({ where: { propertyId } }),
  ])

  const orgDefaults = property
    ? await prisma.orgDesignDefaults.findUnique({ where: { organizationId: property.organizationId } })
    : null

  const d = SYSTEM_DEFAULTS
  const o = orgDefaults
  const c = config

  // Merge: property override → org default → system default
  const colorPrimary      = c?.colorPrimary      ?? o?.colorPrimary      ?? d.colorPrimary
  const colorPrimaryHover = c?.colorPrimaryHover ?? o?.colorPrimaryHover ?? d.colorPrimaryHover
  const colorPrimaryLight = c?.colorPrimaryLight ?? o?.colorPrimaryLight ?? d.colorPrimaryLight
  const colorAccent       = c?.colorAccent       ?? o?.colorAccent       ?? d.colorAccent
  const colorBackground   = c?.colorBackground   ?? o?.colorBackground   ?? d.colorBackground
  const colorSurface      = c?.colorSurface      ?? o?.colorSurface      ?? d.colorSurface
  const colorText         = c?.colorText         ?? o?.colorText         ?? d.colorText
  const colorTextMuted    = c?.colorTextMuted    ?? o?.colorTextMuted    ?? d.colorTextMuted
  const colorBorder       = c?.colorBorder       ?? o?.colorBorder       ?? d.colorBorder
  const colorSuccess      = c?.colorSuccess      ?? o?.colorSuccess      ?? d.colorSuccess
  const colorError        = c?.colorError        ?? o?.colorError        ?? d.colorError
  const fontFamily        = c?.fontFamily        ?? o?.fontFamily        ?? d.fontFamily
  const borderRadius      = c?.borderRadius      ?? o?.borderRadius      ?? d.borderRadius
  const logoUrl           = c?.logoUrl           ?? o?.logoUrl           ?? null
  const faviconUrl        = c?.faviconUrl        ?? o?.faviconUrl        ?? null
  const displayName       = c?.displayName       ?? o?.displayName       ?? null
  const tagline           = c?.tagline           ?? o?.tagline           ?? null
  const tabTitle          = c?.tabTitle          ?? o?.tabTitle          ?? null
  const defaultCurrency   = c?.defaultCurrency   ?? o?.defaultCurrency   ?? d.defaultCurrency
  const defaultLocale     = c?.defaultLocale     ?? o?.defaultLocale     ?? d.defaultLocale
  const textDirection     = (c?.textDirection    ?? o?.textDirection     ?? d.textDirection) as 'ltr' | 'rtl'
  const enabledLocales    = safeParseJson<string[]>(c?.enabledLocales ?? o?.enabledLocales ?? null, d.enabledLocales)
  const enabledCurrencies = safeParseJson<string[]>(c?.enabledCurrencies ?? o?.enabledCurrencies ?? null, d.enabledCurrencies)

  if (!config) {
    logger.debug({ propertyId }, '[Config] No property config found, using org/system defaults')
  }

  return {
    propertyId,
    colorPrimary, colorPrimaryHover, colorPrimaryLight, colorAccent,
    colorBackground, colorSurface, colorText, colorTextMuted, colorBorder, colorSuccess, colorError,
    fontFamily,
    fontUrl: buildFontUrl(fontFamily),
    borderRadius,
    logoUrl, faviconUrl, displayName, tagline, tabTitle,
    defaultCurrency, defaultLocale, textDirection, enabledLocales, enabledCurrencies,
    onlinePaymentEnabled: config?.onlinePaymentEnabled ?? o?.onlinePaymentEnabled ?? true,
    payAtHotelEnabled: config?.payAtHotelEnabled ?? o?.payAtHotelEnabled ?? true,
    payAtHotelCardGuaranteeRequired: config?.payAtHotelCardGuaranteeRequired ?? o?.payAtHotelCardGuaranteeRequired ?? false,
    infantMaxAge: config?.infantMaxAge ?? o?.infantMaxAge ?? 2,
    childMaxAge: config?.childMaxAge ?? o?.childMaxAge ?? 16,
    roomRatesDefaultExpanded: config?.roomRatesDefaultExpanded ?? o?.roomRatesDefaultExpanded ?? false,
    heroStyle: (config?.heroStyle ?? o?.heroStyle ?? 'fullpage') as 'fullpage' | 'rectangle' | 'quilt',
    heroImageMode: (config?.heroImageMode ?? o?.heroImageMode ?? 'fixed') as 'fixed' | 'carousel',
    heroCarouselInterval: config?.heroCarouselInterval ?? o?.heroCarouselInterval ?? 5,
    heroImageUrl: config?.heroImageUrl ?? null,
    searchResultsImageUrl: config?.searchResultsImageUrl ?? o?.searchResultsImageUrl ?? null,
    searchResultsImageMode: (config?.searchResultsImageMode ?? o?.searchResultsImageMode ?? 'fixed') as 'fixed' | 'carousel',
    searchResultsCarouselInterval: config?.searchResultsCarouselInterval ?? o?.searchResultsCarouselInterval ?? 5,
    searchResultsExcludedImageIds: safeParseJson<number[]>(config?.searchResultsExcludedImageIds ?? null, []),
    excludedPropertyImageIds: safeParseJson<number[]>(config?.excludedPropertyImageIds ?? null, []),
    excludedRoomImageIds: safeParseJson<number[]>(config?.excludedRoomImageIds ?? null, []),
    roomPrimaryImageIds: safeParseJson<Record<number, number>>(config?.roomPrimaryImageIds ?? null, {}),
    tripadvisorHotelKey: config?.tripadvisorHotelKey ?? null,
    priceComparisonEnabled: config?.priceComparisonEnabled ?? true,
    chainHeroImageUrl: orgDefaults?.chainHeroImageUrl ?? null,
  }
}

export async function getOrgDesignConfig(orgId: number): Promise<HotelDesignConfig> {
  const o = await prisma.orgDesignDefaults.findUnique({ where: { organizationId: orgId } })
  const d = SYSTEM_DEFAULTS

  const fontFamily = o?.fontFamily ?? d.fontFamily

  return {
    propertyId: 0,
    colorPrimary:      o?.colorPrimary      ?? d.colorPrimary,
    colorPrimaryHover: o?.colorPrimaryHover ?? d.colorPrimaryHover,
    colorPrimaryLight: o?.colorPrimaryLight ?? d.colorPrimaryLight,
    colorAccent:       o?.colorAccent       ?? d.colorAccent,
    colorBackground:   o?.colorBackground   ?? d.colorBackground,
    colorSurface:      o?.colorSurface      ?? d.colorSurface,
    colorText:         o?.colorText         ?? d.colorText,
    colorTextMuted:    o?.colorTextMuted    ?? d.colorTextMuted,
    colorBorder:       o?.colorBorder       ?? d.colorBorder,
    colorSuccess:      o?.colorSuccess      ?? d.colorSuccess,
    colorError:        o?.colorError        ?? d.colorError,
    fontFamily,
    fontUrl: buildFontUrl(fontFamily),
    borderRadius:      o?.borderRadius      ?? d.borderRadius,
    logoUrl:           o?.logoUrl           ?? null,
    faviconUrl:        o?.faviconUrl        ?? null,
    displayName:       o?.displayName       ?? null,
    tagline:           o?.tagline           ?? null,
    tabTitle:          o?.tabTitle          ?? null,
    defaultCurrency:   o?.defaultCurrency   ?? d.defaultCurrency,
    defaultLocale:     o?.defaultLocale     ?? d.defaultLocale,
    textDirection:     (o?.textDirection    ?? d.textDirection) as 'ltr' | 'rtl',
    enabledLocales:    safeParseJson<string[]>(o?.enabledLocales ?? null, d.enabledLocales),
    enabledCurrencies: safeParseJson<string[]>(o?.enabledCurrencies ?? null, d.enabledCurrencies),
    onlinePaymentEnabled: o?.onlinePaymentEnabled ?? true,
    payAtHotelEnabled: o?.payAtHotelEnabled ?? true,
    payAtHotelCardGuaranteeRequired: o?.payAtHotelCardGuaranteeRequired ?? false,
    infantMaxAge:  o?.infantMaxAge  ?? 2,
    childMaxAge:   o?.childMaxAge   ?? 16,
    roomRatesDefaultExpanded: o?.roomRatesDefaultExpanded ?? false,
    heroStyle:             (o?.heroStyle    ?? 'fullpage') as 'fullpage' | 'rectangle' | 'quilt',
    heroImageMode:         (o?.heroImageMode ?? 'fixed')  as 'fixed' | 'carousel',
    heroCarouselInterval:   o?.heroCarouselInterval   ?? 5,
    heroImageUrl:           o?.chainHeroImageUrl       ?? null,
    searchResultsImageUrl:  o?.searchResultsImageUrl   ?? null,
    searchResultsImageMode: (o?.searchResultsImageMode ?? 'fixed') as 'fixed' | 'carousel',
    searchResultsCarouselInterval: o?.searchResultsCarouselInterval ?? 5,
    searchResultsExcludedImageIds: [],
    excludedPropertyImageIds: safeParseJson<number[]>(o?.chainExcludedPropertyImageIds ?? null, []),
    excludedRoomImageIds: [],
    roomPrimaryImageIds: {},
    tripadvisorHotelKey: null,
    priceComparisonEnabled: true,
    chainHeroImageUrl: o?.chainHeroImageUrl ?? null,
  }
}

export async function upsertHotelDesignConfig(
  propertyId: number,
  updates: UpdateDesignConfigRequest,
): Promise<HotelDesignConfig> {
  const data = {
    ...(updates.colorPrimary !== undefined && { colorPrimary: updates.colorPrimary }),
    ...(updates.colorPrimaryHover !== undefined && { colorPrimaryHover: updates.colorPrimaryHover }),
    ...(updates.colorPrimaryLight !== undefined && { colorPrimaryLight: updates.colorPrimaryLight }),
    ...(updates.colorAccent !== undefined && { colorAccent: updates.colorAccent }),
    ...(updates.colorBackground !== undefined && { colorBackground: updates.colorBackground }),
    ...(updates.colorSurface !== undefined && { colorSurface: updates.colorSurface }),
    ...(updates.colorText !== undefined && { colorText: updates.colorText }),
    ...(updates.colorTextMuted !== undefined && { colorTextMuted: updates.colorTextMuted }),
    ...(updates.colorBorder !== undefined && { colorBorder: updates.colorBorder }),
    ...(updates.colorSuccess !== undefined && { colorSuccess: updates.colorSuccess }),
    ...(updates.colorError !== undefined && { colorError: updates.colorError }),
    ...(updates.fontFamily !== undefined && { fontFamily: updates.fontFamily }),
    ...(updates.borderRadius !== undefined && { borderRadius: updates.borderRadius }),
    ...(updates.logoUrl !== undefined && { logoUrl: updates.logoUrl }),
    ...(updates.faviconUrl !== undefined && { faviconUrl: updates.faviconUrl }),
    ...(updates.heroImageUrl !== undefined && { heroImageUrl: updates.heroImageUrl }),
    ...(updates.searchResultsImageUrl !== undefined && { searchResultsImageUrl: updates.searchResultsImageUrl }),
    ...(updates.displayName !== undefined && { displayName: updates.displayName }),
    ...(updates.tagline !== undefined && { tagline: updates.tagline }),
    ...(updates.tabTitle !== undefined && { tabTitle: updates.tabTitle }),
    ...(updates.defaultCurrency !== undefined && { defaultCurrency: updates.defaultCurrency }),
    ...(updates.defaultLocale !== undefined && { defaultLocale: updates.defaultLocale }),
    ...(updates.textDirection !== undefined && { textDirection: updates.textDirection }),
    ...(updates.enabledLocales !== undefined && { enabledLocales: updates.enabledLocales != null ? JSON.stringify(updates.enabledLocales) : null }),
    ...(updates.enabledCurrencies !== undefined && { enabledCurrencies: updates.enabledCurrencies != null ? JSON.stringify(updates.enabledCurrencies) : null }),
    ...(updates.onlinePaymentEnabled !== undefined && { onlinePaymentEnabled: updates.onlinePaymentEnabled }),
    ...(updates.payAtHotelEnabled !== undefined && { payAtHotelEnabled: updates.payAtHotelEnabled }),
    ...(updates.payAtHotelCardGuaranteeRequired !== undefined && { payAtHotelCardGuaranteeRequired: updates.payAtHotelCardGuaranteeRequired }),
    ...(updates.infantMaxAge !== undefined && { infantMaxAge: updates.infantMaxAge }),
    ...(updates.childMaxAge !== undefined && { childMaxAge: updates.childMaxAge }),
    ...(updates.roomRatesDefaultExpanded !== undefined && { roomRatesDefaultExpanded: updates.roomRatesDefaultExpanded }),
    ...(updates.heroStyle !== undefined && { heroStyle: updates.heroStyle }),
    ...(updates.heroImageMode !== undefined && { heroImageMode: updates.heroImageMode }),
    ...(updates.heroCarouselInterval !== undefined && { heroCarouselInterval: updates.heroCarouselInterval }),
    ...(updates.searchResultsImageMode !== undefined && { searchResultsImageMode: updates.searchResultsImageMode }),
    ...(updates.searchResultsCarouselInterval !== undefined && { searchResultsCarouselInterval: updates.searchResultsCarouselInterval }),
    ...(updates.searchResultsExcludedImageIds !== undefined && { searchResultsExcludedImageIds: JSON.stringify(updates.searchResultsExcludedImageIds) }),
    ...(updates.excludedPropertyImageIds !== undefined && { excludedPropertyImageIds: JSON.stringify(updates.excludedPropertyImageIds) }),
    ...(updates.excludedRoomImageIds !== undefined && { excludedRoomImageIds: JSON.stringify(updates.excludedRoomImageIds) }),
    ...(updates.roomPrimaryImageIds !== undefined && { roomPrimaryImageIds: JSON.stringify(updates.roomPrimaryImageIds) }),
    ...(updates.tripadvisorHotelKey !== undefined && { tripadvisorHotelKey: updates.tripadvisorHotelKey }),
    ...(updates.priceComparisonEnabled !== undefined && { priceComparisonEnabled: updates.priceComparisonEnabled }),
  }

  await prisma.hotelConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...data },
    update: data,
  })

  logger.info({ propertyId }, '[Config] Design config updated')
  return getHotelDesignConfig(propertyId)
}

export async function getPropertyDesignAdmin(propertyId: number): Promise<{
  overrides: OrgDesignDefaultsConfig
  orgDefaults: OrgDesignDefaultsConfig
}> {
  const [config, property] = await Promise.all([
    prisma.hotelConfig.findUnique({ where: { propertyId } }),
    prisma.property.findUnique({ where: { propertyId } }),
  ])
  const orgRow = property
    ? await prisma.orgDesignDefaults.findUnique({ where: { organizationId: property.organizationId } })
    : null
  return {
    overrides: rowToOrgDefaults(config),
    orgDefaults: rowToOrgDefaults(orgRow),
  }
}

export async function getOrgDesignDefaults(organizationId: number): Promise<OrgDesignDefaultsConfig> {
  const row = await prisma.orgDesignDefaults.findUnique({ where: { organizationId } })
  return rowToOrgDefaults(row)
}

export async function upsertOrgDesignDefaults(
  organizationId: number,
  updates: Partial<OrgDesignDefaultsConfig>,
): Promise<OrgDesignDefaultsConfig> {
  const data: Record<string, unknown> = {}
  const fields: (keyof OrgDesignDefaultsConfig)[] = [
    'colorPrimary', 'colorPrimaryHover', 'colorPrimaryLight', 'colorAccent',
    'colorBackground', 'colorSurface', 'colorText', 'colorTextMuted', 'colorBorder',
    'colorSuccess', 'colorError', 'fontFamily', 'borderRadius',
    'logoUrl', 'faviconUrl', 'displayName', 'tagline', 'tabTitle',
    'defaultCurrency', 'defaultLocale', 'textDirection',
    'heroStyle', 'heroImageMode', 'heroCarouselInterval',
    'searchResultsImageUrl', 'searchResultsImageMode', 'searchResultsCarouselInterval',
    'roomRatesDefaultExpanded', 'infantMaxAge', 'childMaxAge',
    'onlinePaymentEnabled', 'payAtHotelEnabled', 'payAtHotelCardGuaranteeRequired',
    'chainHeroImageUrl',
  ]
  for (const f of fields) {
    if (updates[f] !== undefined) data[f] = updates[f]
  }
  if (updates.enabledLocales !== undefined) data.enabledLocales = JSON.stringify(updates.enabledLocales)
  if (updates.enabledCurrencies !== undefined) data.enabledCurrencies = JSON.stringify(updates.enabledCurrencies)
  if (updates.chainExcludedPropertyImageIds !== undefined) data.chainExcludedPropertyImageIds = JSON.stringify(updates.chainExcludedPropertyImageIds ?? [])

  const row = await prisma.orgDesignDefaults.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  })

  logger.info({ organizationId }, '[Config] Org design defaults updated')
  return rowToOrgDefaults(row)
}

function rowToOrgDefaults(row: {
  colorPrimary: string | null; colorPrimaryHover: string | null; colorPrimaryLight: string | null
  colorAccent: string | null; colorBackground: string | null; colorSurface: string | null
  colorText: string | null; colorTextMuted: string | null; colorBorder: string | null
  colorSuccess: string | null; colorError: string | null; fontFamily: string | null
  borderRadius: number | null; logoUrl: string | null; faviconUrl: string | null
  displayName: string | null; tagline: string | null; tabTitle: string | null
  defaultCurrency: string | null; defaultLocale: string | null; textDirection: string | null
  enabledLocales: string | null; enabledCurrencies: string | null
  heroStyle: string | null; heroImageMode: string | null; heroCarouselInterval: number | null
  searchResultsImageUrl: string | null; searchResultsImageMode: string | null; searchResultsCarouselInterval: number | null
  roomRatesDefaultExpanded: boolean | null; infantMaxAge: number | null; childMaxAge: number | null
  onlinePaymentEnabled: boolean | null; payAtHotelEnabled: boolean | null; payAtHotelCardGuaranteeRequired: boolean | null
  chainHeroImageUrl?: string | null
  chainExcludedPropertyImageIds?: string | null
} | null): OrgDesignDefaultsConfig {
  return {
    colorPrimary: row?.colorPrimary ?? null,
    colorPrimaryHover: row?.colorPrimaryHover ?? null,
    colorPrimaryLight: row?.colorPrimaryLight ?? null,
    colorAccent: row?.colorAccent ?? null,
    colorBackground: row?.colorBackground ?? null,
    colorSurface: row?.colorSurface ?? null,
    colorText: row?.colorText ?? null,
    colorTextMuted: row?.colorTextMuted ?? null,
    colorBorder: row?.colorBorder ?? null,
    colorSuccess: row?.colorSuccess ?? null,
    colorError: row?.colorError ?? null,
    fontFamily: row?.fontFamily ?? null,
    borderRadius: row?.borderRadius ?? null,
    logoUrl: row?.logoUrl ?? null,
    faviconUrl: row?.faviconUrl ?? null,
    displayName: row?.displayName ?? null,
    tagline: row?.tagline ?? null,
    tabTitle: row?.tabTitle ?? null,
    defaultCurrency: row?.defaultCurrency ?? null,
    defaultLocale: row?.defaultLocale ?? null,
    textDirection: row?.textDirection ?? null,
    enabledLocales: safeParseJson<string[]>(row?.enabledLocales ?? null, null) ?? null,
    enabledCurrencies: safeParseJson<string[]>(row?.enabledCurrencies ?? null, null) ?? null,
    heroStyle: (row?.heroStyle ?? null) as OrgDesignDefaultsConfig['heroStyle'],
    heroImageMode: (row?.heroImageMode ?? null) as OrgDesignDefaultsConfig['heroImageMode'],
    heroCarouselInterval: row?.heroCarouselInterval ?? null,
    searchResultsImageUrl: row?.searchResultsImageUrl ?? null,
    searchResultsImageMode: (row?.searchResultsImageMode ?? null) as OrgDesignDefaultsConfig['searchResultsImageMode'],
    searchResultsCarouselInterval: row?.searchResultsCarouselInterval ?? null,
    roomRatesDefaultExpanded: row?.roomRatesDefaultExpanded ?? null,
    infantMaxAge: row?.infantMaxAge ?? null,
    childMaxAge: row?.childMaxAge ?? null,
    onlinePaymentEnabled: row?.onlinePaymentEnabled ?? null,
    payAtHotelEnabled: row?.payAtHotelEnabled ?? null,
    payAtHotelCardGuaranteeRequired: row?.payAtHotelCardGuaranteeRequired ?? null,
    chainHeroImageUrl: row?.chainHeroImageUrl ?? null,
    chainExcludedPropertyImageIds: safeParseJson<number[]>(row?.chainExcludedPropertyImageIds ?? null, []),
  }
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
