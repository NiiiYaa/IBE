import { prisma } from '../db/client.js'
import type {
  FlexibleDatesEffective,
  SystemFlexibleDatesConfigResponse,
  OrgFlexibleDatesConfigResponse,
  PropertyFlexibleDatesConfigResponse,
} from '@ibe/shared'

const SYSTEM_DEFAULTS: FlexibleDatesEffective = {
  enabled: false,
  daysBefore: 1,
  daysAfter: 1,
}

export async function getSystemFlexibleDatesConfig(): Promise<SystemFlexibleDatesConfigResponse> {
  const row = await prisma.systemFlexibleDatesConfig.findFirst()
  return row ? { enabled: row.enabled, daysBefore: row.daysBefore, daysAfter: row.daysAfter } : SYSTEM_DEFAULTS
}

export async function upsertSystemFlexibleDatesConfig(
  data: Partial<FlexibleDatesEffective>,
): Promise<SystemFlexibleDatesConfigResponse> {
  const existing = await prisma.systemFlexibleDatesConfig.findFirst()
  const row = existing
    ? await prisma.systemFlexibleDatesConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemFlexibleDatesConfig.create({ data: { ...SYSTEM_DEFAULTS, ...data } })
  return { enabled: row.enabled, daysBefore: row.daysBefore, daysAfter: row.daysAfter }
}

export async function getOrgFlexibleDatesConfig(orgId: number): Promise<OrgFlexibleDatesConfigResponse> {
  const [system, org] = await Promise.all([
    getSystemFlexibleDatesConfig(),
    prisma.orgFlexibleDatesConfig.findUnique({ where: { organizationId: orgId } }),
  ])
  const effective = resolveOrgEffective(system, org)
  return {
    enabled: org?.enabled ?? null,
    daysBefore: org?.daysBefore ?? null,
    daysAfter: org?.daysAfter ?? null,
    effective,
  }
}

export async function upsertOrgFlexibleDatesConfig(
  orgId: number,
  data: Partial<OrgFlexibleDatesConfigResponse>,
): Promise<OrgFlexibleDatesConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.orgFlexibleDatesConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...fields },
    update: fields,
  })
  return getOrgFlexibleDatesConfig(orgId)
}

export async function getPropertyFlexibleDatesConfig(propertyId: number): Promise<PropertyFlexibleDatesConfigResponse> {
  const prop = await prisma.propertyFlexibleDatesConfig.findUnique({
    where: { propertyId },
    include: { property: { select: { organizationId: true } } },
  })
  const orgId = prop?.property?.organizationId

  const [system, org] = await Promise.all([
    getSystemFlexibleDatesConfig(),
    orgId ? prisma.orgFlexibleDatesConfig.findUnique({ where: { organizationId: orgId } }) : Promise.resolve(null),
  ])

  const orgEffective = resolveOrgEffective(system, org)
  const effective = resolvePropertyEffective(orgEffective, prop)
  return {
    enabled: prop?.enabled ?? null,
    daysBefore: prop?.daysBefore ?? null,
    daysAfter: prop?.daysAfter ?? null,
    effective,
  }
}

export async function upsertPropertyFlexibleDatesConfig(
  propertyId: number,
  data: Partial<PropertyFlexibleDatesConfigResponse>,
): Promise<PropertyFlexibleDatesConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.propertyFlexibleDatesConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...fields },
    update: fields,
  })
  return getPropertyFlexibleDatesConfig(propertyId)
}

export async function resolveEffectiveFlexibleDatesConfig(propertyId: number): Promise<FlexibleDatesEffective> {
  const result = await getPropertyFlexibleDatesConfig(propertyId)
  return result.effective
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveOrgEffective(
  system: FlexibleDatesEffective,
  org: { enabled: boolean | null; daysBefore: number | null; daysAfter: number | null } | null,
): FlexibleDatesEffective {
  return {
    enabled: org?.enabled ?? system.enabled,
    daysBefore: org?.daysBefore ?? system.daysBefore,
    daysAfter: org?.daysAfter ?? system.daysAfter,
  }
}

function resolvePropertyEffective(
  orgEffective: FlexibleDatesEffective,
  prop: { enabled: boolean | null; daysBefore: number | null; daysAfter: number | null } | null,
): FlexibleDatesEffective {
  return {
    enabled: prop?.enabled ?? orgEffective.enabled,
    daysBefore: prop?.daysBefore ?? orgEffective.daysBefore,
    daysAfter: prop?.daysAfter ?? orgEffective.daysAfter,
  }
}
