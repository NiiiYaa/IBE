import { prisma } from '../db/client.js'
import { resolveAdminLogin } from './auth.service.js'
import type { AdminPayload, AccountChoice } from './auth.service.js'

export interface B2BPayload {
  adminId: number
  organizationId: number
  role: string
  sellerOrgId: number
  b2b: true
}

export type B2BLoginResult =
  | { type: 'ok'; payload: B2BPayload; mustChangePassword: boolean }
  | { type: 'choices'; accounts: AccountChoice[] }
  | { type: 'invalid_credentials' }
  | { type: 'no_access' }

/**
 * Resolves the seller org for a given subdomain slug.
 * Slug is the subdomain with -b2b suffix already stripped (e.g. "grandhotel").
 * Looks up Property.subdomain first, then Organization.slug.
 */
export async function resolveSellerOrg(slug: string): Promise<number | null> {
  const property = await prisma.property.findFirst({
    where: { subdomain: slug, deletedAt: null },
    select: { organizationId: true },
  })
  if (property) return property.organizationId

  const org = await prisma.organization.findFirst({
    where: { slug, isActive: true, deletedAt: null },
    select: { id: true },
  })
  return org?.id ?? null
}

/**
 * Checks whether buyerOrgId has B2B access to sellerOrgId.
 */
export async function hasBuyerAccess(buyerOrgId: number, sellerOrgId: number): Promise<boolean> {
  const access = await prisma.orgB2BAccess.findUnique({
    where: { buyerOrgId_sellerOrgId: { buyerOrgId, sellerOrgId } },
  })
  return access !== null
}

/**
 * Full B2B login flow:
 * 1. Validate credentials via existing resolveAdminLogin
 * 2. If multiple accounts → return choices for org selection
 * 3. Verify buyer org has access to the seller org
 */
export async function resolveB2BLogin(
  email: string,
  password: string,
  sellerOrgId: number,
  adminId?: number,
): Promise<B2BLoginResult> {
  const result = await resolveAdminLogin(email, password, adminId)

  if (!result.direct && result.choices.length === 0) {
    return { type: 'invalid_credentials' }
  }

  if (result.choices.length > 0) {
    return { type: 'choices', accounts: result.choices }
  }

  const admin = result.direct!
  const buyerOrgId = admin.organizationId

  const mustChangePassword = !!admin.mustChangePassword

  // Super admins bypass B2B access checks
  if (admin.role === 'super' || buyerOrgId === null) {
    return {
      type: 'ok',
      payload: {
        adminId: admin.adminId,
        organizationId: buyerOrgId ?? 0,
        role: admin.role,
        sellerOrgId,
        b2b: true,
      },
      mustChangePassword,
    }
  }

  // Seller org can always book its own properties
  if (buyerOrgId === sellerOrgId) {
    return {
      type: 'ok',
      payload: { adminId: admin.adminId, organizationId: buyerOrgId, role: admin.role, sellerOrgId, b2b: true },
      mustChangePassword,
    }
  }

  const allowed = await hasBuyerAccess(buyerOrgId, sellerOrgId)
  if (!allowed) return { type: 'no_access' }

  return {
    type: 'ok',
    payload: { adminId: admin.adminId, organizationId: buyerOrgId, role: admin.role, sellerOrgId, b2b: true },
    mustChangePassword,
  }
}

export async function getB2BAdminById(id: number) {
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
      organization: { select: { name: true, isActive: true, deletedAt: true } },
    },
  })
  if (!user || !user.isActive) return null
  if (user.organization && (!user.organization.isActive || user.organization.deletedAt)) return null

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    organizationName: user.organization?.name ?? null,
    mustChangePassword: user.mustChangePassword,
  }
}
