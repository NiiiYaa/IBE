import { prisma } from '../db/client.js'
import type { SellModel } from './org.service.js'

export type MarketingFeature = 'promoCodes' | 'priceComparison' | 'affiliates' | 'campaigns' | 'onsiteConversion'

const ALL_MODELS: SellModel[] = ['b2c', 'b2b']
const DEFAULT_MODELS = JSON.stringify(ALL_MODELS)

export interface MarketingSettings {
  promoCodes: SellModel[]
  priceComparison: SellModel[]
  affiliates: SellModel[]
  campaigns: SellModel[]
  onsiteConversion: SellModel[]
}

export interface PropertyMarketingSettingsResponse {
  orgDefaults: MarketingSettings
  overrides: Partial<Record<MarketingFeature, SellModel[] | null>>
  effective: MarketingSettings
}

function parseModels(raw: string | null | undefined): SellModel[] {
  if (raw === null || raw === undefined) return ALL_MODELS
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as SellModel[]
  } catch { /* fall through */ }
  return ALL_MODELS
}

function rowToSettings(row: {
  promoCodesModels: string
  priceComparisonModels: string
  affiliatesModels: string
  campaignsModels: string
  onsiteConversionModels: string
} | null): MarketingSettings {
  return {
    promoCodes: parseModels(row?.promoCodesModels ?? DEFAULT_MODELS),
    priceComparison: parseModels(row?.priceComparisonModels ?? DEFAULT_MODELS),
    affiliates: parseModels(row?.affiliatesModels ?? DEFAULT_MODELS),
    campaigns: parseModels(row?.campaignsModels ?? DEFAULT_MODELS),
    onsiteConversion: parseModels(row?.onsiteConversionModels ?? DEFAULT_MODELS),
  }
}

export async function getOrgMarketingSettings(organizationId: number): Promise<MarketingSettings> {
  const row = await prisma.orgMarketingSettings.findUnique({ where: { organizationId } })
  return rowToSettings(row)
}

export async function updateOrgMarketingSettings(
  organizationId: number,
  data: Partial<MarketingSettings>,
): Promise<MarketingSettings> {
  const dbData: Record<string, string> = {}
  if (data.promoCodes !== undefined) dbData['promoCodesModels'] = JSON.stringify(data.promoCodes)
  if (data.priceComparison !== undefined) dbData['priceComparisonModels'] = JSON.stringify(data.priceComparison)
  if (data.affiliates !== undefined) dbData['affiliatesModels'] = JSON.stringify(data.affiliates)
  if (data.campaigns !== undefined) dbData['campaignsModels'] = JSON.stringify(data.campaigns)
  if (data.onsiteConversion !== undefined) dbData['onsiteConversionModels'] = JSON.stringify(data.onsiteConversion)

  const row = await prisma.orgMarketingSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...dbData },
    update: dbData,
  })
  return rowToSettings(row)
}

export async function getPropertyMarketingSettings(propertyId: number): Promise<PropertyMarketingSettingsResponse> {
  const property = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })

  const orgId = property?.organizationId
  const [orgRow, propRow] = await Promise.all([
    orgId ? prisma.orgMarketingSettings.findUnique({ where: { organizationId: orgId } }) : Promise.resolve(null),
    prisma.propertyMarketingSettings.findUnique({ where: { propertyId } }),
  ])

  const orgDefaults = rowToSettings(orgRow)

  const overrides: Partial<Record<MarketingFeature, SellModel[] | null>> = {}
  if (propRow !== null) {
    overrides.promoCodes = propRow.promoCodesModels !== null ? parseModels(propRow.promoCodesModels) : null
    overrides.priceComparison = propRow.priceComparisonModels !== null ? parseModels(propRow.priceComparisonModels) : null
    overrides.affiliates = propRow.affiliatesModels !== null ? parseModels(propRow.affiliatesModels) : null
    overrides.campaigns = propRow.campaignsModels !== null ? parseModels(propRow.campaignsModels) : null
    overrides.onsiteConversion = propRow.onsiteConversionModels !== null ? parseModels(propRow.onsiteConversionModels) : null
  }

  const effective: MarketingSettings = {
    promoCodes: overrides.promoCodes ?? orgDefaults.promoCodes,
    priceComparison: overrides.priceComparison ?? orgDefaults.priceComparison,
    affiliates: overrides.affiliates ?? orgDefaults.affiliates,
    campaigns: overrides.campaigns ?? orgDefaults.campaigns,
    onsiteConversion: overrides.onsiteConversion ?? orgDefaults.onsiteConversion,
  }

  return { orgDefaults, overrides, effective }
}

export async function updatePropertyMarketingSettings(
  propertyId: number,
  data: Partial<Record<MarketingFeature, SellModel[] | null>>,
): Promise<PropertyMarketingSettingsResponse> {
  const dbData: Record<string, string | null> = {}
  if ('promoCodes' in data) dbData['promoCodesModels'] = data.promoCodes !== null && data.promoCodes !== undefined ? JSON.stringify(data.promoCodes) : null
  if ('priceComparison' in data) dbData['priceComparisonModels'] = data.priceComparison !== null && data.priceComparison !== undefined ? JSON.stringify(data.priceComparison) : null
  if ('affiliates' in data) dbData['affiliatesModels'] = data.affiliates !== null && data.affiliates !== undefined ? JSON.stringify(data.affiliates) : null
  if ('campaigns' in data) dbData['campaignsModels'] = data.campaigns !== null && data.campaigns !== undefined ? JSON.stringify(data.campaigns) : null
  if ('onsiteConversion' in data) dbData['onsiteConversionModels'] = data.onsiteConversion !== null && data.onsiteConversion !== undefined ? JSON.stringify(data.onsiteConversion) : null

  await prisma.propertyMarketingSettings.upsert({
    where: { propertyId },
    create: { propertyId, ...dbData },
    update: dbData,
  })

  return getPropertyMarketingSettings(propertyId)
}

export async function isMarketingFeatureEnabled(
  feature: MarketingFeature,
  model: SellModel,
  propertyId: number,
): Promise<boolean> {
  const { effective } = await getPropertyMarketingSettings(propertyId)
  return effective[feature].includes(model)
}
