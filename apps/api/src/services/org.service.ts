import { prisma } from '../db/client.js'
import { invalidateCredentialsCache } from './credentials.service.js'

export type PropertyMode = 'single' | 'multi'

export type SellModel = 'b2c' | 'b2b'
export const ALL_SELL_MODELS: SellModel[] = ['b2c', 'b2b']
const DEFAULT_ENABLED_MODELS: SellModel[] = ['b2c', 'b2b']

function parseModels(raw: string | null | undefined): SellModel[] {
  try {
    const parsed = JSON.parse(raw ?? '[]')
    if (Array.isArray(parsed)) return parsed as SellModel[]
  } catch { /* fall through */ }
  return DEFAULT_ENABLED_MODELS
}

export interface OrgSettingsData {
  propertyMode: PropertyMode
  showCitySelector: boolean
  showDemoProperty: boolean
  rateProvider: string
  hyperGuestBearerToken: string | null
  hyperGuestStaticDomain: string | null
  hyperGuestSearchDomain: string | null
  hyperGuestBookingDomain: string | null
  webDomain: string | null
  tlsCert: string | null
  tlsKey: string | null
  enabledModels: SellModel[]
}

export async function getOrgSettings(organizationId: number): Promise<OrgSettingsData> {
  const row = await prisma.orgSettings.findUnique({ where: { organizationId } })
  return {
    propertyMode: (row?.propertyMode ?? 'single') as PropertyMode,
    showCitySelector: row?.showCitySelector ?? false,
    showDemoProperty: row?.showDemoProperty ?? false,
    rateProvider: row?.rateProvider ?? 'frankfurter',
    hyperGuestBearerToken: row?.hyperGuestBearerToken ?? null,
    hyperGuestStaticDomain: row?.hyperGuestStaticDomain ?? null,
    hyperGuestSearchDomain: row?.hyperGuestSearchDomain ?? null,
    hyperGuestBookingDomain: row?.hyperGuestBookingDomain ?? null,
    webDomain: row?.webDomain ?? null,
    tlsCert: row?.tlsCert ?? null,
    tlsKey: row?.tlsKey ?? null,
    enabledModels: parseModels(row?.enabledModels),
  }
}

export async function updateOrgSettings(organizationId: number, data: Partial<OrgSettingsData>): Promise<OrgSettingsData> {
  const { enabledModels, ...rest } = data
  const dbData: Record<string, unknown> = { ...rest }
  if (enabledModels !== undefined) dbData['enabledModels'] = JSON.stringify(enabledModels)

  const row = await prisma.orgSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...dbData },
    update: dbData,
  })
  invalidateCredentialsCache(organizationId)
  return {
    propertyMode: (row.propertyMode ?? 'single') as PropertyMode,
    showCitySelector: row.showCitySelector ?? false,
    showDemoProperty: row.showDemoProperty ?? false,
    rateProvider: row.rateProvider ?? 'frankfurter',
    hyperGuestBearerToken: row.hyperGuestBearerToken,
    hyperGuestStaticDomain: row.hyperGuestStaticDomain,
    hyperGuestSearchDomain: row.hyperGuestSearchDomain,
    hyperGuestBookingDomain: row.hyperGuestBookingDomain,
    webDomain: row.webDomain,
    tlsCert: row.tlsCert,
    tlsKey: row.tlsKey,
    enabledModels: parseModels(row.enabledModels),
  }
}

export async function setPropertyMode(organizationId: number, mode: PropertyMode): Promise<void> {
  await prisma.orgSettings.upsert({
    where: { organizationId },
    create: { organizationId, propertyMode: mode },
    update: { propertyMode: mode },
  })
}

export async function setShowCitySelector(organizationId: number, value: boolean): Promise<void> {
  await prisma.orgSettings.upsert({
    where: { organizationId },
    create: { organizationId, showCitySelector: value },
    update: { showCitySelector: value },
  })
}

export async function setShowDemoProperty(organizationId: number, value: boolean): Promise<void> {
  await prisma.orgSettings.upsert({
    where: { organizationId },
    create: { organizationId, showDemoProperty: value },
    update: { showDemoProperty: value },
  })
}

export async function setRateProvider(organizationId: number, provider: string): Promise<void> {
  await prisma.orgSettings.upsert({
    where: { organizationId },
    create: { organizationId, rateProvider: provider },
    update: { rateProvider: provider },
  })
}
