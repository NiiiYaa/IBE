import { prisma } from '../db/client.js'
import type { AdminPayload } from './auth.service.js'
import type { ClusterRole } from '@ibe/shared'

export async function resolveAccessiblePropertyIds(admin: AdminPayload & { clusterScope?: boolean }): Promise<number[] | 'all'> {
  if (admin.role === 'super') return 'all'
  if (!admin.clusterScope) return 'all'

  const rows = await prisma.clusterHotel.findMany({
    where: { cluster: { status: 'active', users: { some: { adminUserId: admin.adminId } } } },
    select: { propertyId: true },
  })
  return rows.map(r => r.propertyId)
}

export async function assertPropertyAccess(admin: AdminPayload & { clusterScope?: boolean }, propertyId: number): Promise<void> {
  if (admin.role === 'super') return
  if (!admin.clusterScope) return

  const hit = await prisma.clusterHotel.findFirst({
    where: {
      propertyId,
      cluster: { status: 'active', users: { some: { adminUserId: admin.adminId } } },
    },
    select: { id: true },
  })
  if (!hit) {
    throw Object.assign(new Error('No access to this property'), { statusCode: 403 })
  }
}

const ROLE_ORDER: ClusterRole[] = ['admin', 'user', 'observer']

export async function resolveEffectiveRole(adminUserId: number, propertyId: number): Promise<ClusterRole | null> {
  const rows = await prisma.clusterUser.findMany({
    where: { cluster: { status: 'active', hotels: { some: { propertyId } } }, adminUserId },
    select: { role: true },
  })
  if (rows.length === 0) return null
  const roles = rows.map(r => r.role as ClusterRole)
  return roles.sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))[0]!
}
