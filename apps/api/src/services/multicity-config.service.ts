import { prisma } from '../db/client.js'
import type { SystemMultiCityConfigResponse, OrgMultiCityConfigResponse, MultiCityEffective } from '@ibe/shared'

const SYSTEM_DEFAULTS: SystemMultiCityConfigResponse = {
  enabled: false,
  maxLegs: 3,
}

export async function getSystemMultiCityConfig(): Promise<SystemMultiCityConfigResponse> {
  const row = await prisma.systemMultiCityConfig.findFirst()
  if (!row) return SYSTEM_DEFAULTS
  return { enabled: row.enabled, maxLegs: row.maxLegs }
}

export async function upsertSystemMultiCityConfig(
  data: Partial<SystemMultiCityConfigResponse>,
): Promise<SystemMultiCityConfigResponse> {
  const existing = await prisma.systemMultiCityConfig.findFirst()
  const row = existing
    ? await prisma.systemMultiCityConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemMultiCityConfig.create({ data: { ...SYSTEM_DEFAULTS, ...data } })
  return { enabled: row.enabled, maxLegs: row.maxLegs }
}

function resolveOrgEffective(
  system: SystemMultiCityConfigResponse,
  org: { enabled: boolean | null; maxLegs: number | null } | null,
): MultiCityEffective {
  return {
    enabled: org?.enabled ?? system.enabled,
    maxLegs: org?.maxLegs ?? system.maxLegs,
  }
}

export async function getOrgMultiCityConfig(orgId: number): Promise<OrgMultiCityConfigResponse> {
  const [system, org] = await Promise.all([
    getSystemMultiCityConfig(),
    prisma.orgMultiCityConfig.findUnique({ where: { organizationId: orgId } }),
  ])
  return {
    enabled: org?.enabled ?? null,
    maxLegs: org?.maxLegs ?? null,
    effective: resolveOrgEffective(system, org ?? null),
  }
}

export async function upsertOrgMultiCityConfig(
  orgId: number,
  data: Partial<OrgMultiCityConfigResponse>,
): Promise<OrgMultiCityConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.orgMultiCityConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...fields },
    update: fields,
  })
  return getOrgMultiCityConfig(orgId)
}

export async function resolveEffectiveMultiCityConfig(orgId: number): Promise<MultiCityEffective> {
  const cfg = await getOrgMultiCityConfig(orgId)
  return cfg.effective
}
