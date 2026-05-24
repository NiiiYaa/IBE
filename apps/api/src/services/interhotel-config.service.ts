import { prisma } from '../db/client.js'
import type {
  SystemInterHotelConfigResponse,
  OrgInterHotelConfigResponse,
  PropertyInterHotelConfigResponse,
  InterHotelEffective,
  TransferType,
} from '@ibe/shared'

const VALID_TRANSFER: TransferType[] = ['self', 'hotel', 'sponsored_self']
function parseTransfer(s: string | null | undefined): TransferType {
  return VALID_TRANSFER.includes(s as TransferType) ? (s as TransferType) : 'self'
}

const SYSTEM_DEFAULTS: SystemInterHotelConfigResponse = {
  enabled: false,
  maxRadiusKm: 50,
  maxHotels: 3,
  transferType: 'self',
  sponsoredAmount: 0,
  sponsoredCurrency: 'USD',
}

export async function getSystemInterHotelConfig(): Promise<SystemInterHotelConfigResponse> {
  const row = await prisma.systemInterHotelConfig.findFirst()
  if (!row) return SYSTEM_DEFAULTS
  return {
    enabled: row.enabled,
    maxRadiusKm: row.maxRadiusKm,
    maxHotels: row.maxHotels,
    transferType: parseTransfer(row.transferType),
    sponsoredAmount: row.sponsoredAmount,
    sponsoredCurrency: row.sponsoredCurrency,
  }
}

export async function upsertSystemInterHotelConfig(
  data: Partial<SystemInterHotelConfigResponse>,
): Promise<SystemInterHotelConfigResponse> {
  const existing = await prisma.systemInterHotelConfig.findFirst()
  const row = existing
    ? await prisma.systemInterHotelConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemInterHotelConfig.create({ data: { ...SYSTEM_DEFAULTS, ...data } })
  return {
    enabled: row.enabled,
    maxRadiusKm: row.maxRadiusKm,
    maxHotels: row.maxHotels,
    transferType: parseTransfer(row.transferType),
    sponsoredAmount: row.sponsoredAmount,
    sponsoredCurrency: row.sponsoredCurrency,
  }
}

export async function getOrgInterHotelConfig(orgId: number): Promise<OrgInterHotelConfigResponse> {
  const [system, org] = await Promise.all([
    getSystemInterHotelConfig(),
    prisma.orgInterHotelConfig.findUnique({ where: { organizationId: orgId } }),
  ])
  const effective = resolveOrgEffective(system, org)
  return {
    enabled: org?.enabled ?? null,
    maxRadiusKm: org?.maxRadiusKm ?? null,
    maxHotels: org?.maxHotels ?? null,
    transferType: org?.transferType != null ? parseTransfer(org.transferType) : null,
    sponsoredAmount: org?.sponsoredAmount ?? null,
    sponsoredCurrency: org?.sponsoredCurrency ?? null,
    effective,
  }
}

export async function upsertOrgInterHotelConfig(
  orgId: number,
  data: Partial<OrgInterHotelConfigResponse>,
): Promise<OrgInterHotelConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.orgInterHotelConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...fields },
    update: fields,
  })
  return getOrgInterHotelConfig(orgId)
}

export async function getPropertyInterHotelConfig(propertyId: number): Promise<PropertyInterHotelConfigResponse> {
  const [prop, propMeta] = await Promise.all([
    prisma.propertyInterHotelConfig.findUnique({ where: { propertyId } }),
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
  ])
  const orgId = propMeta?.organizationId

  const [system, org] = await Promise.all([
    getSystemInterHotelConfig(),
    orgId !== undefined
      ? prisma.orgInterHotelConfig.findUnique({ where: { organizationId: orgId } })
      : Promise.resolve(null),
  ])

  const orgEffective = resolveOrgEffective(system, org)
  const effective = resolvePropertyEffective(orgEffective, prop)
  return {
    enabled: prop?.enabled ?? null,
    maxRadiusKm: prop?.maxRadiusKm ?? null,
    maxHotels: prop?.maxHotels ?? null,
    transferType: prop?.transferType != null ? parseTransfer(prop.transferType) : null,
    sponsoredAmount: prop?.sponsoredAmount ?? null,
    sponsoredCurrency: prop?.sponsoredCurrency ?? null,
    effective,
  }
}

export async function upsertPropertyInterHotelConfig(
  propertyId: number,
  data: Partial<PropertyInterHotelConfigResponse>,
): Promise<PropertyInterHotelConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.propertyInterHotelConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...fields },
    update: fields,
  })
  return getPropertyInterHotelConfig(propertyId)
}

export async function resolveEffectiveInterHotelConfig(propertyId: number): Promise<InterHotelEffective> {
  const result = await getPropertyInterHotelConfig(propertyId)
  return result.effective
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveOrgEffective(
  system: SystemInterHotelConfigResponse,
  org: { enabled: boolean | null; maxRadiusKm: number | null; maxHotels: number | null; transferType: string | null; sponsoredAmount: number | null; sponsoredCurrency: string | null } | null,
): InterHotelEffective {
  return {
    enabled: org?.enabled ?? system.enabled,
    maxRadiusKm: org?.maxRadiusKm ?? system.maxRadiusKm,
    maxHotels: org?.maxHotels ?? system.maxHotels,
    transferType: org?.transferType != null ? parseTransfer(org.transferType) : system.transferType,
    sponsoredAmount: org?.sponsoredAmount ?? system.sponsoredAmount,
    sponsoredCurrency: org?.sponsoredCurrency ?? system.sponsoredCurrency,
  }
}

function resolvePropertyEffective(
  orgEffective: InterHotelEffective,
  prop: { enabled: boolean | null; maxRadiusKm: number | null; maxHotels: number | null; transferType: string | null; sponsoredAmount: number | null; sponsoredCurrency: string | null } | null,
): InterHotelEffective {
  return {
    enabled: prop?.enabled ?? orgEffective.enabled,
    maxRadiusKm: prop?.maxRadiusKm ?? orgEffective.maxRadiusKm,
    maxHotels: prop?.maxHotels ?? orgEffective.maxHotels,
    transferType: prop?.transferType != null ? parseTransfer(prop.transferType) : orgEffective.transferType,
    sponsoredAmount: prop?.sponsoredAmount ?? orgEffective.sponsoredAmount,
    sponsoredCurrency: prop?.sponsoredCurrency ?? orgEffective.sponsoredCurrency,
  }
}
