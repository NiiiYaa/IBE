import { prisma } from '../db/client.js'
import type {
  SystemPricingConfigResponse,
  OrgPricingConfigResponse,
  PropertyPricingConfigResponse,
} from '@ibe/shared'

const SYSTEM_DEFAULTS: SystemPricingConfigResponse = {
  enabled: false,
  openToAll: true,
  refreshIntervalHours: 24,
  highPricePct: 15,
  lowPricePct: 15,
  highAnomalyPct: 30,
  lowAnomalyPct: 30,
  dayDifferencePct: 35,
  dayDifferenceWindow: 7,
  searchAdults: 1,
  maxOffersForAnalysis: 10,
}

export async function getSystemPricingConfig(): Promise<SystemPricingConfigResponse> {
  const row = await prisma.systemPricingConfig.findFirst()
  return row ? {
    enabled: row.enabled,
    openToAll: row.openToAll,
    refreshIntervalHours: row.refreshIntervalHours,
    highPricePct: row.highPricePct,
    lowPricePct: row.lowPricePct,
    highAnomalyPct: row.highAnomalyPct,
    lowAnomalyPct: row.lowAnomalyPct,
    dayDifferencePct: row.dayDifferencePct,
    dayDifferenceWindow: row.dayDifferenceWindow,
    searchAdults: (row.searchAdults as 1 | 2),
    maxOffersForAnalysis: row.maxOffersForAnalysis,
  } : SYSTEM_DEFAULTS
}

export async function upsertSystemPricingConfig(data: Partial<SystemPricingConfigResponse>): Promise<SystemPricingConfigResponse> {
  const existing = await prisma.systemPricingConfig.findFirst()
  const row = existing
    ? await prisma.systemPricingConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemPricingConfig.create({ data: { ...SYSTEM_DEFAULTS, ...data } })
  return {
    enabled: row.enabled, openToAll: row.openToAll, refreshIntervalHours: row.refreshIntervalHours,
    highPricePct: row.highPricePct, lowPricePct: row.lowPricePct,
    highAnomalyPct: row.highAnomalyPct, lowAnomalyPct: row.lowAnomalyPct,
    dayDifferencePct: row.dayDifferencePct, dayDifferenceWindow: row.dayDifferenceWindow,
    searchAdults: (row.searchAdults as 1 | 2),
    maxOffersForAnalysis: row.maxOffersForAnalysis,
  }
}

export async function getOrgPricingConfig(orgId: number): Promise<OrgPricingConfigResponse> {
  const [system, org] = await Promise.all([
    getSystemPricingConfig(),
    prisma.orgPricingConfig.findUnique({ where: { organizationId: orgId } }),
  ])
  const effective = resolveOrgEffective(system, org)
  return {
    enabled: org?.enabled ?? null,
    systemServiceDisabled: org?.systemServiceDisabled ?? false,
    highPricePct: org?.highPricePct ?? null,
    lowPricePct: org?.lowPricePct ?? null,
    highAnomalyPct: org?.highAnomalyPct ?? null,
    lowAnomalyPct: org?.lowAnomalyPct ?? null,
    dayDifferencePct: org?.dayDifferencePct ?? null,
    dayDifferenceWindow: org?.dayDifferenceWindow ?? null,
    searchAdults: (org?.searchAdults as 1 | 2 | null) ?? null,
    maxOffersForAnalysis: org?.maxOffersForAnalysis ?? null,
    effective,
  }
}

export async function upsertOrgPricingConfig(orgId: number, data: Partial<OrgPricingConfigResponse>): Promise<OrgPricingConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.orgPricingConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...fields },
    update: fields,
  })
  return getOrgPricingConfig(orgId)
}

export async function getPropertyPricingConfig(propertyId: number): Promise<PropertyPricingConfigResponse> {
  const prop = await prisma.propertyPricingConfig.findUnique({
    where: { propertyId },
    include: { property: { select: { organizationId: true } } },
  })
  const orgId = prop?.property?.organizationId

  const [system, org] = await Promise.all([
    getSystemPricingConfig(),
    orgId ? prisma.orgPricingConfig.findUnique({ where: { organizationId: orgId } }) : Promise.resolve(null),
  ])

  const orgEffective = resolveOrgEffective(system, org)
  const effective = resolvePropertyEffective(orgEffective, prop)
  return {
    enabled: prop?.enabled ?? null,
    orgServiceDisabled: prop?.orgServiceDisabled ?? false,
    highPricePct: prop?.highPricePct ?? null,
    lowPricePct: prop?.lowPricePct ?? null,
    highAnomalyPct: prop?.highAnomalyPct ?? null,
    lowAnomalyPct: prop?.lowAnomalyPct ?? null,
    dayDifferencePct: prop?.dayDifferencePct ?? null,
    dayDifferenceWindow: prop?.dayDifferenceWindow ?? null,
    searchAdults: (prop?.searchAdults as 1 | 2 | null) ?? null,
    maxOffersForAnalysis: prop?.maxOffersForAnalysis ?? null,
    effective,
  }
}

export async function upsertPropertyPricingConfig(propertyId: number, data: Partial<PropertyPricingConfigResponse>): Promise<PropertyPricingConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.propertyPricingConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...fields },
    update: fields,
  })
  return getPropertyPricingConfig(propertyId)
}

export async function resolveEffectivePricingConfig(propertyId: number): Promise<SystemPricingConfigResponse> {
  const result = await getPropertyPricingConfig(propertyId)
  return result.effective
}

export async function getEnabledPropertyIds(): Promise<number[]> {
  const system = await getSystemPricingConfig()
  if (!system.enabled) return []

  const properties = await prisma.property.findMany({
    where: { status: 'active' },
    include: {
      propertyPricingConfig: true,
      organization: { include: { orgPricingConfig: true } },
    },
  })

  return properties
    .filter(p => {
      const org = p.organization?.orgPricingConfig
      const prop = p.propertyPricingConfig
      if (org?.systemServiceDisabled) return false
      if (prop?.orgServiceDisabled) return false
      const fallback = system.openToAll ? system.enabled : false
      const effectiveEnabled = prop?.enabled ?? org?.enabled ?? fallback
      if (!effectiveEnabled) return false
      return true
    })
    .map(p => p.propertyId)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveOrgEffective(
  system: SystemPricingConfigResponse,
  org: { enabled: boolean | null; systemServiceDisabled: boolean; highPricePct: number | null; lowPricePct: number | null; highAnomalyPct: number | null; lowAnomalyPct: number | null; dayDifferencePct: number | null; dayDifferenceWindow: number | null; searchAdults: number | null; maxOffersForAnalysis: number | null } | null,
): SystemPricingConfigResponse {
  if (org?.systemServiceDisabled) return { ...system, enabled: false }
  return {
    enabled: org?.enabled ?? system.enabled,
    openToAll: system.openToAll,
    refreshIntervalHours: system.refreshIntervalHours,
    highPricePct: org?.highPricePct ?? system.highPricePct,
    lowPricePct: org?.lowPricePct ?? system.lowPricePct,
    highAnomalyPct: org?.highAnomalyPct ?? system.highAnomalyPct,
    lowAnomalyPct: org?.lowAnomalyPct ?? system.lowAnomalyPct,
    dayDifferencePct: org?.dayDifferencePct ?? system.dayDifferencePct,
    dayDifferenceWindow: org?.dayDifferenceWindow ?? system.dayDifferenceWindow,
    searchAdults: (org?.searchAdults as 1 | 2 | null) ?? system.searchAdults,
    maxOffersForAnalysis: org?.maxOffersForAnalysis ?? system.maxOffersForAnalysis,
  }
}

function resolvePropertyEffective(
  orgEffective: SystemPricingConfigResponse,
  prop: { enabled: boolean | null; orgServiceDisabled: boolean; highPricePct: number | null; lowPricePct: number | null; highAnomalyPct: number | null; lowAnomalyPct: number | null; dayDifferencePct: number | null; dayDifferenceWindow: number | null; searchAdults: number | null; maxOffersForAnalysis: number | null } | null,
): SystemPricingConfigResponse {
  if (prop?.orgServiceDisabled) return { ...orgEffective, enabled: false }
  return {
    enabled: prop?.enabled ?? orgEffective.enabled,
    openToAll: orgEffective.openToAll,
    refreshIntervalHours: orgEffective.refreshIntervalHours,
    highPricePct: prop?.highPricePct ?? orgEffective.highPricePct,
    lowPricePct: prop?.lowPricePct ?? orgEffective.lowPricePct,
    highAnomalyPct: prop?.highAnomalyPct ?? orgEffective.highAnomalyPct,
    lowAnomalyPct: prop?.lowAnomalyPct ?? orgEffective.lowAnomalyPct,
    dayDifferencePct: prop?.dayDifferencePct ?? orgEffective.dayDifferencePct,
    dayDifferenceWindow: prop?.dayDifferenceWindow ?? orgEffective.dayDifferenceWindow,
    searchAdults: (prop?.searchAdults as 1 | 2 | null) ?? orgEffective.searchAdults,
    maxOffersForAnalysis: prop?.maxOffersForAnalysis ?? orgEffective.maxOffersForAnalysis,
  }
}
