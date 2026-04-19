import { prisma } from '../db/client.js'
import { hashPassword } from './auth.service.js'

export interface UserRecord {
  id: number
  email: string
  name: string
  role: string
  isActive: boolean
  createdAt: Date
  orgId?: number
  orgName?: string
  orgHyperGuestOrgId?: string | null
  propertyIds?: number[]
}

export async function listUsers(organizationId: number): Promise<UserRecord[]> {
  const users = await prisma.adminUser.findMany({
    where: { organizationId },
    select: {
      id: true, email: true, name: true, role: true, isActive: true, createdAt: true,
      adminUserProperties: { select: { propertyId: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return users.map(u => ({
    id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive, createdAt: u.createdAt,
    propertyIds: u.adminUserProperties.map(p => p.propertyId),
  }))
}

export async function listAllUsers(): Promise<UserRecord[]> {
  const users = await prisma.adminUser.findMany({
    select: {
      id: true, email: true, name: true, role: true, isActive: true, createdAt: true,
      organizationId: true,
      organization: { select: { id: true, name: true, hyperGuestOrgId: true } },
      adminUserProperties: { select: { propertyId: true } },
    },
    orderBy: [{ organizationId: 'asc' }, { createdAt: 'asc' }],
  })
  return users.map(u => ({
    id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive, createdAt: u.createdAt,
    orgId: u.organization?.id,
    orgName: u.organization?.name ?? undefined,
    orgHyperGuestOrgId: u.organization?.hyperGuestOrgId ?? null,
    propertyIds: u.adminUserProperties.map(p => p.propertyId),
  }))
}

export interface OrgServiceRecord {
  id: number
  name: string
  slug: string
  hyperGuestOrgId: string | null
  userCount: number
  createdAt: Date
}

export async function listOrgs(): Promise<OrgServiceRecord[]> {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true, name: true, slug: true, hyperGuestOrgId: true, createdAt: true,
      _count: { select: { adminUsers: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return orgs.map(o => ({
    id: o.id, name: o.name, slug: o.slug,
    hyperGuestOrgId: o.hyperGuestOrgId,
    userCount: o._count.adminUsers,
    createdAt: o.createdAt,
  }))
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function createOrg(data: { name: string; hyperGuestOrgId?: string | null }): Promise<OrgServiceRecord> {
  const name = data.name.trim()
  if (!name) throw new Error('name is required')

  const baseSlug = slugify(name) || 'org'
  let slug = baseSlug
  let suffix = 2
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`
  }

  if (data.hyperGuestOrgId) {
    const existing = await prisma.organization.findUnique({ where: { hyperGuestOrgId: data.hyperGuestOrgId } })
    if (existing) throw new Error('This HyperGuest Org ID is already in use')
  }

  const org = await prisma.organization.create({
    data: { name, slug, hyperGuestOrgId: data.hyperGuestOrgId || null },
    select: { id: true, name: true, slug: true, hyperGuestOrgId: true, createdAt: true },
  })
  return { ...org, userCount: 0 }
}

export async function setOrgHyperGuestId(orgId: number, hyperGuestOrgId: string | null): Promise<void> {
  const existing = hyperGuestOrgId
    ? await prisma.organization.findUnique({ where: { hyperGuestOrgId } })
    : null
  if (existing && existing.id !== orgId) throw new Error('This HyperGuest Org ID is already in use')
  await prisma.organization.update({ where: { id: orgId }, data: { hyperGuestOrgId } })
}

export async function createUser(
  organizationId: number,
  data: { email: string; name: string; role: string },
): Promise<UserRecord & { temporaryPassword: string }> {
  const email = data.email.toLowerCase().trim()
  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) throw new Error('A user with this email already exists')

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)

  const user = await prisma.adminUser.create({
    data: { organizationId, email, name: data.name.trim(), role: data.role, passwordHash, isActive: true },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  })

  return { ...user, temporaryPassword }
}

export async function updateUser(
  organizationId: number | null,
  id: number,
  data: { name?: string; role?: string; isActive?: boolean },
): Promise<UserRecord> {
  const user = await prisma.adminUser.findUnique({ where: { id } })
  if (!user || (organizationId !== null && user.organizationId !== organizationId)) throw new Error('User not found')

  return prisma.adminUser.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  })
}

export async function resetUserPassword(
  organizationId: number | null,
  id: number,
): Promise<{ temporaryPassword: string }> {
  const user = await prisma.adminUser.findUnique({ where: { id } })
  if (!user || (organizationId !== null && user.organizationId !== organizationId)) throw new Error('User not found')

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)
  await prisma.adminUser.update({ where: { id }, data: { passwordHash } })
  return { temporaryPassword }
}

export async function deleteUser(organizationId: number | null, id: number): Promise<void> {
  const user = await prisma.adminUser.findUnique({ where: { id } })
  if (!user || (organizationId !== null && user.organizationId !== organizationId)) throw new Error('User not found')
  await prisma.adminUser.delete({ where: { id } })
}

export async function setUserPropertyIds(
  organizationId: number | null,
  userId: number,
  propertyIds: number[],
): Promise<void> {
  const user = await prisma.adminUser.findUnique({ where: { id: userId } })
  if (!user || (organizationId !== null && user.organizationId !== organizationId)) throw new Error('User not found')

  await prisma.$transaction([
    prisma.adminUserProperty.deleteMany({ where: { adminUserId: userId } }),
    prisma.adminUserProperty.createMany({
      data: propertyIds.map(propertyId => ({ adminUserId: userId, propertyId })),
    }),
  ])
}

function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
