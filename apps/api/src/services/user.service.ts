import { prisma } from '../db/client.js'
import { hashPassword } from './auth.service.js'
import { sendEmail } from './email.service.js'
import { getCommSettings } from './communication.service.js'
import { sendWhatsAppMessage } from './whatsapp.service.js'
import { sendMessage as sendWebjsMessage, clientKey } from './whatsapp-manager.service.js'

export interface UserRecord {
  id: number
  email: string
  name: string
  phone?: string | null
  role: string
  isActive: boolean
  deletedAt?: Date | null
  createdAt: Date
  orgId?: number
  orgName?: string
  orgHyperGuestOrgId?: string | null
  propertyIds?: number[]
}

export async function listUsers(organizationId: number, onlyDeleted = false): Promise<UserRecord[]> {
  const users = await prisma.adminUser.findMany({
    where: { organizationId, deletedAt: onlyDeleted ? { not: null } : null },
    select: {
      id: true, email: true, name: true, phone: true, role: true, isActive: true, deletedAt: true, createdAt: true,
      adminUserProperties: { select: { propertyId: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return users.map(u => ({
    id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, isActive: u.isActive, deletedAt: u.deletedAt, createdAt: u.createdAt,
    propertyIds: u.adminUserProperties.map(p => p.propertyId),
  }))
}

export async function listAllUsers(onlyDeleted = false): Promise<UserRecord[]> {
  const users = await prisma.adminUser.findMany({
    where: { deletedAt: onlyDeleted ? { not: null } : null },
    select: {
      id: true, email: true, name: true, phone: true, role: true, isActive: true, deletedAt: true, createdAt: true,
      organizationId: true,
      organization: { select: { id: true, name: true, hyperGuestOrgId: true } },
      adminUserProperties: { select: { propertyId: true } },
    },
    orderBy: [{ organizationId: 'asc' }, { createdAt: 'asc' }],
  })
  return users.map(u => ({
    id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, isActive: u.isActive, deletedAt: u.deletedAt, createdAt: u.createdAt,
    ...(u.organization ? { orgId: u.organization.id, orgName: u.organization.name } : {}),
    orgHyperGuestOrgId: u.organization?.hyperGuestOrgId ?? null,
    propertyIds: u.adminUserProperties.map(p => p.propertyId),
  }))
}

export interface OrgServiceRecord {
  id: number
  name: string
  slug: string
  hyperGuestOrgId: string | null
  orgType: string
  isActive: boolean
  deletedAt: Date | null
  userCount: number
  createdAt: Date
}

const ORG_SELECT = {
  id: true, name: true, slug: true, hyperGuestOrgId: true, orgType: true,
  isActive: true, deletedAt: true, createdAt: true,
  _count: { select: { adminUsers: true } },
} as const

function mapOrg(o: { id: number; name: string; slug: string; hyperGuestOrgId: string | null; orgType: string; isActive: boolean; deletedAt: Date | null; createdAt: Date; _count: { adminUsers: number } }): OrgServiceRecord {
  return {
    id: o.id, name: o.name, slug: o.slug,
    hyperGuestOrgId: o.hyperGuestOrgId,
    orgType: o.orgType,
    isActive: o.isActive, deletedAt: o.deletedAt,
    userCount: o._count.adminUsers,
    createdAt: o.createdAt,
  }
}

export async function listOrgs(onlyDeleted = false): Promise<OrgServiceRecord[]> {
  const orgs = await prisma.organization.findMany({
    where: onlyDeleted ? { deletedAt: { not: null } } : { deletedAt: null },
    select: ORG_SELECT,
    orderBy: { createdAt: 'asc' },
  })
  return orgs.map(mapOrg)
}

export async function reviveOrg(id: number): Promise<void> {
  await prisma.organization.update({ where: { id }, data: { isActive: true, deletedAt: null } })
}

export async function updateOrg(
  id: number,
  data: { name?: string | undefined; hyperGuestOrgId?: string | null | undefined; orgType?: string | undefined },
): Promise<OrgServiceRecord> {
  if (data.hyperGuestOrgId) {
    const existing = await prisma.organization.findUnique({ where: { hyperGuestOrgId: data.hyperGuestOrgId } })
    if (existing && existing.id !== id) throw new Error('This HyperGuest Org ID is already in use')
  }
  const org = await prisma.organization.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.hyperGuestOrgId !== undefined && { hyperGuestOrgId: data.hyperGuestOrgId || null }),
      ...(data.orgType !== undefined && { orgType: data.orgType }),
    },
    select: ORG_SELECT,
  })
  return mapOrg(org)
}

export async function setOrgActive(id: number, isActive: boolean): Promise<void> {
  await prisma.organization.update({ where: { id }, data: { isActive } })
}

export async function softDeleteOrg(id: number): Promise<void> {
  await prisma.organization.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } })
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function createOrg(data: { name: string; hyperGuestOrgId?: string | null | undefined; orgType?: string | undefined }): Promise<OrgServiceRecord> {
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

  const orgType = data.orgType ?? 'seller'
  const org = await prisma.organization.create({
    data: { name, slug, hyperGuestOrgId: data.hyperGuestOrgId || null, orgType },
    select: { id: true, name: true, slug: true, hyperGuestOrgId: true, orgType: true, createdAt: true },
  })
  return { ...org, isActive: true, deletedAt: null, userCount: 0 }
}

export async function setOrgHyperGuestId(orgId: number, hyperGuestOrgId: string | null): Promise<void> {
  const existing = hyperGuestOrgId
    ? await prisma.organization.findUnique({ where: { hyperGuestOrgId } })
    : null
  if (existing && existing.id !== orgId) throw new Error('This HyperGuest Org ID is already in use')
  await prisma.organization.update({ where: { id: orgId }, data: { hyperGuestOrgId } })
}

export async function createUser(
  organizationId: number | null,
  data: { email: string; name: string; role: string; phone?: string },
): Promise<UserRecord & { temporaryPassword: string }> {
  const email = data.email.toLowerCase().trim()
  const existing = await prisma.adminUser.findFirst({ where: { email, organizationId } })
  if (existing) throw new Error('A user with this email already exists in this organization')

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)

  const user = await prisma.adminUser.create({
    data: { ...(organizationId !== null ? { organizationId } : {}), email, name: data.name.trim(), role: data.role, passwordHash, isActive: true, mustChangePassword: true,
      ...(data.phone?.trim() ? { phone: data.phone.trim() } : {}) },
    select: { id: true, email: true, name: true, phone: true, role: true, isActive: true, createdAt: true },
  })

  return { ...user, temporaryPassword }
}

export async function updateUser(
  organizationId: number | null,
  id: number,
  data: { name?: string; role?: string; isActive?: boolean; phone?: string | null },
): Promise<UserRecord> {
  const user = await prisma.adminUser.findUnique({ where: { id } })
  if (!user || (organizationId !== null && user.organizationId !== organizationId)) throw new Error('User not found')

  return prisma.adminUser.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.phone !== undefined && { phone: data.phone?.trim() || null }),
    },
    select: { id: true, email: true, name: true, phone: true, role: true, isActive: true, createdAt: true },
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
  await prisma.adminUser.update({ where: { id }, data: { passwordHash, mustChangePassword: true } })
  return { temporaryPassword }
}

export async function deleteUser(organizationId: number | null, id: number): Promise<void> {
  const user = await prisma.adminUser.findUnique({ where: { id } })
  if (!user || (organizationId !== null && user.organizationId !== organizationId)) throw new Error('User not found')
  await prisma.adminUser.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } })
}

export async function reviveUser(organizationId: number | null, id: number): Promise<void> {
  const user = await prisma.adminUser.findUnique({ where: { id } })
  if (!user || (organizationId !== null && user.organizationId !== organizationId)) throw new Error('User not found')
  await prisma.adminUser.update({ where: { id }, data: { isActive: true, deletedAt: null } })
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

export interface AdminCredentials {
  name: string
  email: string
  temporaryPassword: string
  loginUrl: string
}

export async function sendAdminCredentials(
  orgId: number | null,
  channel: 'email' | 'whatsapp',
  to: string,
  creds: AdminCredentials,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (channel === 'email') {
      const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:12px">
          <h2 style="margin:0 0 8px;font-size:18px;color:#111">Your admin account is ready</h2>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280">Hi ${creds.name}, here are your login credentials.</p>
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
            <table style="width:100%;font-size:14px;border-collapse:collapse">
              <tr><td style="padding:6px 0;color:#6b7280">Login URL</td><td style="padding:6px 0;text-align:right"><a href="${creds.loginUrl}" style="color:#2563eb">${creds.loginUrl}</a></td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0;text-align:right;color:#111">${creds.email}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Temporary password</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-weight:700;color:#111">${creds.temporaryPassword}</td></tr>
            </table>
          </div>
          <p style="margin:0;font-size:12px;color:#9ca3af">You will be asked to change your password on first login.</p>
        </div>`
      return sendEmail(orgId ?? 0, { to, subject: 'Your admin account credentials', html })
    }

    if (channel === 'whatsapp') {
      if (!orgId) return { ok: false, error: 'No organisation to send WhatsApp from' }
      const settings = await getCommSettings(orgId)
      if (!settings.whatsappEnabled) return { ok: false, error: 'WhatsApp not configured for this organisation' }
      const text = [
        `Hi ${creds.name}, your admin account is ready.`,
        ``,
        `Login: ${creds.loginUrl}`,
        `Email: ${creds.email}`,
        `Temporary password: ${creds.temporaryPassword}`,
        ``,
        `You will be asked to change your password on first login.`,
      ].join('\n')
      if (settings.whatsappProvider === 'meta') {
        if (!settings.whatsappPhoneNumberId || !settings.whatsappAccessToken)
          return { ok: false, error: 'WhatsApp not configured' }
        await sendWhatsAppMessage(settings.whatsappPhoneNumberId, settings.whatsappAccessToken, to, text)
      } else if (settings.whatsappProvider === 'twilio') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const twilio = (await import('twilio' as any)) as any
        const client = new twilio.default(settings.whatsappTwilioAccountSid, settings.whatsappTwilioAuthToken!)
        await client.messages.create({ from: `whatsapp:${settings.whatsappTwilioNumber}`, to: `whatsapp:${to}`, body: text })
      } else if (settings.whatsappProvider === 'wwebjs') {
        await sendWebjsMessage({ orgId }, to, text)
      } else {
        return { ok: false, error: `WhatsApp provider not supported: ${settings.whatsappProvider}` }
      }
      return { ok: true }
    }

    return { ok: false, error: 'Invalid channel' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const special = '!@#$%^&*'
  const all = upper + lower + digits + special

  const required = [
    upper[Math.floor(Math.random() * upper.length)]!,
    lower[Math.floor(Math.random() * lower.length)]!,
    digits[Math.floor(Math.random() * digits.length)]!,
    special[Math.floor(Math.random() * special.length)]!,
  ]
  const fill = Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)]!)
  const combined = [...required, ...fill]
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[combined[i], combined[j]] = [combined[j]!, combined[i]!]
  }
  return combined.join('')
}
