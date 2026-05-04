import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'

export const DEMO_HG_ID = 125346

export interface PropertyOrgInfo {
  orgId: number
  orgName: string
  hyperGuestOrgId: string | null
  isPrimary: boolean
}

export interface PropertyRecord {
  id: number
  propertyId: number
  isDefault: boolean
  isActive: boolean
  lastSyncedAt: string | null
  createdAt: string
  name?: string | null
  isDemo?: boolean
  isPrimary?: boolean
  hyperGuestBearerToken?: string | null
  hyperGuestStaticDomain?: string | null
  hyperGuestSearchDomain?: string | null
  hyperGuestBookingDomain?: string | null
}

export function makeDemoRecord(): PropertyRecord {
  return { id: 0, propertyId: DEMO_HG_ID, isDefault: false, isActive: true, lastSyncedAt: null, createdAt: new Date().toISOString(), isDemo: true }
}

export interface PropertyRecordWithOrg extends PropertyRecord {
  orgId: number
  orgName: string
  hyperGuestOrgId: string | null
  allOrgs: PropertyOrgInfo[]
}

export interface PropertyUserRecord {
  id: number
  name: string
  email: string
  assigned: boolean
}

export async function getOrgIdForProperty(propertyId: number): Promise<number | undefined> {
  const row = await prisma.property.findFirst({
    where: { propertyId, deletedAt: null },
    select: { organizationId: true },
  })
  return row?.organizationId ?? undefined
}

export async function listProperties(organizationId: number, showDemoProperty = false): Promise<PropertyRecord[]> {
  const rows = await prisma.property.findMany({
    where: { deletedAt: null, propertyOrganizations: { some: { organizationId } } },
    include: { propertyOrganizations: { where: { organizationId }, select: { isPrimary: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const real: PropertyRecord[] = rows.map(r => ({
    id: r.id,
    propertyId: r.propertyId,
    isDefault: r.isDefault,
    isActive: r.isActive,
    isPrimary: r.propertyOrganizations[0]?.isPrimary ?? false,
    lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    name: r.name ?? null,
    subdomain: r.subdomain ?? null,
    hyperGuestBearerToken: r.hyperGuestBearerToken ? '****' + r.hyperGuestBearerToken.slice(-4) : null,
    hyperGuestStaticDomain: r.hyperGuestStaticDomain ?? null,
    hyperGuestSearchDomain: r.hyperGuestSearchDomain ?? null,
    hyperGuestBookingDomain: r.hyperGuestBookingDomain ?? null,
  }))
  if (real.length === 0 || showDemoProperty) {
    const demo: PropertyRecord = {
      id: 0,
      propertyId: DEMO_HG_ID,
      isDefault: real.length === 0,
      isActive: true,
      lastSyncedAt: null,
      createdAt: new Date().toISOString(),
      isDemo: true,
    }
    return real.length === 0 ? [demo] : [...real, demo]
  }
  return real
}

export async function updateLastSyncedAt(propertyId: number): Promise<void> {
  await prisma.property.updateMany({
    where: { propertyId, deletedAt: null },
    data: { lastSyncedAt: new Date() },
  })
}

export async function getPropertyUsers(propertyDbId: number, organizationId: number | null): Promise<PropertyUserRecord[]> {
  const property = await prisma.property.findFirst({
    where: { id: propertyDbId, ...(organizationId !== null ? { organizationId } : {}) },
    select: { organizationId: true },
  })
  if (!property) throw new Error('Property not found')

  const [users, assignments] = await Promise.all([
    prisma.adminUser.findMany({
      where: { organizationId: property.organizationId, role: 'user', isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    prisma.adminUserProperty.findMany({
      where: { propertyId: propertyDbId },
      select: { adminUserId: true },
    }),
  ])

  const assignedIds = new Set(assignments.map(a => a.adminUserId))
  return users.map(u => ({ id: u.id, name: u.name, email: u.email, assigned: assignedIds.has(u.id) }))
}

export async function setPropertyUsers(propertyDbId: number, organizationId: number | null, userIds: number[]): Promise<void> {
  const property = await prisma.property.findFirst({
    where: { id: propertyDbId, ...(organizationId !== null ? { organizationId } : {}) },
    select: { organizationId: true },
  })
  if (!property) throw new Error('Property not found')

  const allRoleUsers = await prisma.adminUser.findMany({
    where: { organizationId: property.organizationId, role: 'user' },
    select: { id: true },
  })
  const toRemove = allRoleUsers.map(u => u.id).filter(id => !userIds.includes(id))

  await prisma.$transaction([
    prisma.adminUserProperty.deleteMany({ where: { propertyId: propertyDbId, adminUserId: { in: toRemove } } }),
    prisma.adminUserProperty.createMany({
      data: userIds.map(userId => ({ adminUserId: userId, propertyId: propertyDbId })),
      skipDuplicates: true,
    }),
  ])
}

export class PropertyConflictError extends Error {
  constructor(
    message: string,
    public readonly conflictingOrgName?: string,
  ) {
    super(message)
    this.name = 'PropertyConflictError'
  }
}

async function fetchPropertyName(propertyId: number): Promise<string | null> {
  try {
    const { fetchPropertyStatic } = await import('../adapters/hyperguest/static.js')
    const data = await fetchPropertyStatic(propertyId)
    return data.name ?? null
  } catch (err) {
    logger.warn({ propertyId, err }, '[Property] Could not fetch property name from HG')
    return null
  }
}

export async function addProperty(organizationId: number, propertyId: number): Promise<PropertyRecord> {
  const conflict = await prisma.property.findUnique({ where: { propertyId }, include: { organization: { select: { name: true } } } })

  if (conflict) {
    if (conflict.organizationId === organizationId) {
      if (!conflict.deletedAt) {
        throw new PropertyConflictError('Property is already registered for this organization')
      }
      const name = conflict.name ?? await fetchPropertyName(propertyId)
      const restored = await prisma.property.update({
        where: { propertyId },
        data: { deletedAt: null, isActive: true, ...(name ? { name } : {}) },
      })
      await prisma.propertyOrganization.upsert({
        where: { propertyId_organizationId: { propertyId: restored.id, organizationId } },
        create: { propertyId: restored.id, organizationId, isPrimary: true },
        update: { isPrimary: true },
      })
      return { id: restored.id, propertyId: restored.propertyId, isDefault: restored.isDefault, isActive: restored.isActive, isPrimary: true, lastSyncedAt: restored.lastSyncedAt?.toISOString() ?? null, createdAt: restored.createdAt.toISOString(), name: restored.name ?? null }
    }
    if (!conflict.deletedAt) {
      throw new PropertyConflictError(`Property is already registered under organization "${conflict.organization.name}"`, conflict.organization.name)
    }
    const name = conflict.name ?? await fetchPropertyName(propertyId)
    const count = await prisma.property.count({ where: { organizationId, deletedAt: null } })
    const reassigned = await prisma.property.update({
      where: { propertyId },
      data: { organizationId, deletedAt: null, isActive: true, isDefault: count === 0, ...(name ? { name } : {}) },
    })
    await prisma.$transaction([
      prisma.propertyOrganization.deleteMany({ where: { propertyId: reassigned.id } }),
      prisma.propertyOrganization.create({ data: { propertyId: reassigned.id, organizationId, isPrimary: true } }),
    ])
    return { id: reassigned.id, propertyId: reassigned.propertyId, isDefault: reassigned.isDefault, isActive: reassigned.isActive, isPrimary: true, lastSyncedAt: reassigned.lastSyncedAt?.toISOString() ?? null, createdAt: reassigned.createdAt.toISOString(), name: reassigned.name ?? null }
  }

  const count = await prisma.property.count({ where: { organizationId, deletedAt: null } })
  const row = await prisma.property.create({
    data: { organizationId, propertyId, isDefault: count === 0 },
  })
  await prisma.propertyOrganization.create({ data: { propertyId: row.id, organizationId, isPrimary: true } })
  const name = await fetchPropertyName(propertyId)
  if (name) {
    await prisma.property.update({ where: { id: row.id }, data: { name } })
  }
  return { id: row.id, propertyId: row.propertyId, isDefault: row.isDefault, isActive: row.isActive, isPrimary: true, lastSyncedAt: null, createdAt: row.createdAt.toISOString(), name: name ?? null }
}

export async function setDefaultProperty(organizationId: number, id: number): Promise<void> {
  await prisma.$transaction([
    prisma.property.updateMany({ where: { organizationId }, data: { isDefault: false } }),
    prisma.property.update({ where: { id, organizationId }, data: { isDefault: true } }),
  ])
}

export async function setPropertyHGCredentials(
  organizationId: number,
  id: number,
  credentials: {
    bearerToken?: string | null
    staticDomain?: string | null
    searchDomain?: string | null
    bookingDomain?: string | null
  },
): Promise<void> {
  await prisma.property.update({
    where: { id, organizationId },
    data: {
      hyperGuestBearerToken: credentials.bearerToken ?? null,
      hyperGuestStaticDomain: credentials.staticDomain ?? null,
      hyperGuestSearchDomain: credentials.searchDomain ?? null,
      hyperGuestBookingDomain: credentials.bookingDomain ?? null,
    },
  })
}

export async function removeProperty(organizationId: number, id: number): Promise<void> {
  const prop = await prisma.property.findFirst({ where: { id, deletedAt: null }, select: { organizationId: true } })
  if (!prop) throw new Error('Property not found')

  if (prop.organizationId === organizationId) {
    // Primary owner removing — soft-delete the property and clear all associations
    await prisma.$transaction([
      prisma.property.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }),
      prisma.propertyOrganization.deleteMany({ where: { propertyId: id } }),
    ])
  } else {
    // Secondary org removing — just drop their association
    await prisma.propertyOrganization.deleteMany({ where: { propertyId: id, organizationId } })
  }
}

export async function setPropertyActive(organizationId: number | null, id: number, active: boolean): Promise<void> {
  await prisma.property.update({
    where: { id, ...(organizationId !== null ? { organizationId } : {}) },
    data: { isActive: active },
  })
}

export async function listAllProperties(): Promise<PropertyRecordWithOrg[]> {
  const rows = await prisma.property.findMany({
    where: { deletedAt: null },
    include: {
      organization: { select: { id: true, name: true, hyperGuestOrgId: true } },
      propertyOrganizations: {
        include: { organization: { select: { id: true, name: true, hyperGuestOrgId: true } } },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: [{ organizationId: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(r => ({
    id: r.id,
    propertyId: r.propertyId,
    isDefault: r.isDefault,
    isActive: r.isActive,
    isPrimary: true,
    lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    name: r.name ?? null,
    subdomain: r.subdomain ?? null,
    orgId: r.organization.id,
    orgName: r.organization.name,
    hyperGuestOrgId: r.organization.hyperGuestOrgId ?? null,
    allOrgs: r.propertyOrganizations.map(po => ({
      orgId: po.organization.id,
      orgName: po.organization.name,
      hyperGuestOrgId: po.organization.hyperGuestOrgId ?? null,
      isPrimary: po.isPrimary,
    })),
  }))
}

// ── Multi-org management (super admin only) ───────────────────────────────────

export async function getPropertyOrgs(propertyDbId: number): Promise<PropertyOrgInfo[]> {
  const rows = await prisma.propertyOrganization.findMany({
    where: { propertyId: propertyDbId },
    include: { organization: { select: { id: true, name: true, hyperGuestOrgId: true } } },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })
  return rows.map(r => ({
    orgId: r.organization.id,
    orgName: r.organization.name,
    hyperGuestOrgId: r.organization.hyperGuestOrgId ?? null,
    isPrimary: r.isPrimary,
  }))
}

export async function addOrgToProperty(propertyDbId: number, orgId: number): Promise<void> {
  const prop = await prisma.property.findFirst({ where: { id: propertyDbId, deletedAt: null } })
  if (!prop) throw new Error('Property not found')
  await prisma.propertyOrganization.upsert({
    where: { propertyId_organizationId: { propertyId: propertyDbId, organizationId: orgId } },
    create: { propertyId: propertyDbId, organizationId: orgId, isPrimary: false },
    update: {},
  })
}

export async function removeOrgFromProperty(propertyDbId: number, orgId: number): Promise<void> {
  const entry = await prisma.propertyOrganization.findUnique({
    where: { propertyId_organizationId: { propertyId: propertyDbId, organizationId: orgId } },
  })
  if (!entry) throw new Error('Association not found')
  if (entry.isPrimary) throw new Error('Cannot remove the primary owner. Transfer ownership first.')
  await prisma.propertyOrganization.delete({
    where: { propertyId_organizationId: { propertyId: propertyDbId, organizationId: orgId } },
  })
}

export async function transferPrimaryOwnership(propertyDbId: number, newOrgId: number): Promise<void> {
  const prop = await prisma.property.findFirst({ where: { id: propertyDbId, deletedAt: null } })
  if (!prop) throw new Error('Property not found')
  const entry = await prisma.propertyOrganization.findUnique({
    where: { propertyId_organizationId: { propertyId: propertyDbId, organizationId: newOrgId } },
  })
  if (!entry) throw new Error('Target org is not associated with this property')

  await prisma.$transaction([
    prisma.propertyOrganization.updateMany({ where: { propertyId: propertyDbId }, data: { isPrimary: false } }),
    prisma.propertyOrganization.update({
      where: { propertyId_organizationId: { propertyId: propertyDbId, organizationId: newOrgId } },
      data: { isPrimary: true },
    }),
    prisma.property.update({ where: { id: propertyDbId }, data: { organizationId: newOrgId } }),
  ])
}
