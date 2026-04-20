import bcrypt from 'bcryptjs'
import { prisma } from '../db/client.js'

export interface AdminPayload {
  adminId: number
  organizationId: number | null  // null for super admins
  role: string
  propertyIds?: number[]  // populated for 'user' role
}

export async function verifyAdminLogin(
  email: string,
  password: string,
  hyperGuestOrgId?: string,
): Promise<AdminPayload | null> {
  const user = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase() },
    include: { adminUserProperties: { select: { propertyId: true } } },
  })
  if (!user || !user.isActive || !user.passwordHash) return null
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  if (!hyperGuestOrgId) return null

  if (user.role !== 'super' && user.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { isActive: true, deletedAt: true } })
    if (!org || !org.isActive || org.deletedAt) return null
  }

  if (user.role === 'super') {
    if (hyperGuestOrgId !== '1') return null
    return { adminId: user.id, organizationId: null, role: 'super' }
  }

  const org = await prisma.organization.findUnique({ where: { hyperGuestOrgId } })
  if (!org || user.organizationId !== org.id) return null

  const propertyIds = user.role === 'user'
    ? user.adminUserProperties.map(p => p.propertyId)
    : undefined

  return { adminId: user.id, organizationId: org.id, role: user.role, ...(propertyIds !== undefined && { propertyIds }) }
}

export async function signUpAdmin(data: {
  email: string
  password: string
  name: string
  orgName: string
  hyperGuestOrgId?: string
}): Promise<AdminPayload> {
  const email = data.email.toLowerCase()

  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) throw new Error('An account with this email already exists')

  if (data.hyperGuestOrgId) {
    const existingOrg = await prisma.organization.findUnique({ where: { hyperGuestOrgId: data.hyperGuestOrgId } })
    if (existingOrg) throw new Error('An account with this HyperGuest Org ID already exists')
  }

  const slug = data.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now()
  const passwordHash = await bcrypt.hash(data.password, 10)

  const org = await prisma.organization.create({
    data: {
      name: data.orgName,
      slug,
      ...(data.hyperGuestOrgId && { hyperGuestOrgId: data.hyperGuestOrgId }),
    },
  })
  const user = await prisma.adminUser.create({
    data: { organizationId: org.id, email, passwordHash, name: data.name, role: 'admin' },
  })

  return { adminId: user.id, organizationId: org.id, role: user.role }
}

export async function findOrCreateGoogleUser(data: {
  googleId: string
  email: string
  name: string
  createIfNotFound?: boolean
}): Promise<AdminPayload & { isNew: boolean }> {
  const email = data.email.toLowerCase()

  const existing = await prisma.adminUser.findFirst({
    where: { OR: [{ googleId: data.googleId }, { email }] },
  })

  if (existing) {
    if (!existing.googleId) {
      await prisma.adminUser.update({ where: { id: existing.id }, data: { googleId: data.googleId } })
    }
    if (!existing.isActive) throw new Error('Account is inactive')
    return { adminId: existing.id, organizationId: existing.organizationId, role: existing.role, isNew: false }
  }

  if (!data.createIfNotFound) throw new Error('NO_ACCOUNT')

  const slug = email.split('@')[0]!.replace(/[^a-z0-9]+/g, '-') + '-' + Date.now()
  const org = await prisma.organization.create({ data: { name: data.name, slug } })
  const user = await prisma.adminUser.create({
    data: { organizationId: org.id, email, googleId: data.googleId, name: data.name, role: 'admin' },
  })

  return { adminId: user.id, organizationId: org.id, role: user.role, isNew: true }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function getAdminById(id: number) {
  const user = await prisma.adminUser.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      organizationId: true,
      isActive: true,
      adminUserProperties: { select: { propertyId: true } },
    },
  })
  if (!user || !user.isActive) return null

  if (user.role !== 'super' && user.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { isActive: true, deletedAt: true } })
    if (!org || !org.isActive || org.deletedAt) return null
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    isActive: user.isActive,
    propertyIds: user.role === 'user' ? user.adminUserProperties.map(p => p.propertyId) : undefined,
  }
}
