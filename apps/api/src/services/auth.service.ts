import bcrypt from 'bcryptjs'
import { prisma } from '../db/client.js'
import { validatePassword } from '@ibe/shared'

export interface AdminPayload {
  adminId: number
  organizationId: number | null  // null for super admins
  role: string
  propertyIds?: number[]  // populated for 'user' role
  mustChangePassword?: boolean
}

export type AccountChoice = {
  adminId: number
  name: string
  organizationName: string
  role: string
}

export async function resolveAdminLogin(
  email: string,
  password: string,
  adminId?: number,
): Promise<{ direct: AdminPayload | null; choices: AccountChoice[] }> {
  const where = adminId
    ? { id: adminId, email: email.toLowerCase(), isActive: true }
    : { email: email.toLowerCase(), isActive: true }

  const users = await prisma.adminUser.findMany({
    where,
    include: {
      adminUserProperties: { select: { propertyId: true } },
      organization: { select: { name: true, isActive: true, deletedAt: true } },
    },
  })

  const matched: Array<{ user: typeof users[0]; payload: AdminPayload }> = []

  for (const user of users) {
    if (!user.passwordHash) continue
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) continue

    if (user.role === 'super') {
      return {
        direct: { adminId: user.id, organizationId: null, role: 'super', mustChangePassword: user.mustChangePassword },
        choices: [],
      }
    }

    if (user.organization && (!user.organization.isActive || user.organization.deletedAt)) continue

    const propertyIds = user.role === 'user' ? user.adminUserProperties.map(p => p.propertyId) : undefined
    matched.push({
      user,
      payload: {
        adminId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        ...(propertyIds !== undefined && { propertyIds }),
      },
    })
  }

  if (matched.length === 0) return { direct: null, choices: [] }
  if (matched.length === 1) return { direct: matched[0]!.payload, choices: [] }

  return {
    direct: null,
    choices: matched.map(m => ({
      adminId: m.user.id,
      name: m.user.name,
      organizationName: m.user.organization?.name ?? 'Unknown',
      role: m.user.role,
    })),
  }
}

export async function signUpAdmin(data: {
  email: string
  password: string
  name: string
  orgName: string
  hyperGuestOrgId?: string
}): Promise<AdminPayload> {
  const email = data.email.toLowerCase()

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
      mustChangePassword: true,
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
    mustChangePassword: user.mustChangePassword,
    propertyIds: user.role === 'user' ? user.adminUserProperties.map(p => p.propertyId) : undefined,
  }
}

export async function updateAdminProfile(
  adminId: number,
  data: { name?: string; email?: string; currentPassword?: string; newPassword?: string },
): Promise<{ id: number; name: string; email: string }> {
  const user = await prisma.adminUser.findUnique({ where: { id: adminId } })
  if (!user) throw new Error('User not found')

  if (data.newPassword) {
    const errors = validatePassword(data.newPassword)
    if (errors.length > 0) throw new Error(errors.join(', '))

    if (!user.mustChangePassword) {
      if (!data.currentPassword) throw new Error('Current password is required')
      if (!user.passwordHash) throw new Error('Account uses social login — cannot set password here')
      const valid = await bcrypt.compare(data.currentPassword, user.passwordHash)
      if (!valid) throw new Error('Current password is incorrect')
    }
  }

  if (data.email) {
    const existing = await prisma.adminUser.findUnique({ where: { email: data.email.toLowerCase() } })
    if (existing && existing.id !== adminId) throw new Error('Email already in use')
  }

  const updated = await prisma.adminUser.update({
    where: { id: adminId },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.email !== undefined && { email: data.email.toLowerCase().trim() }),
      ...(data.newPassword !== undefined && {
        passwordHash: await bcrypt.hash(data.newPassword, 10),
        mustChangePassword: false,
      }),
    },
    select: { id: true, name: true, email: true },
  })

  return updated
}
