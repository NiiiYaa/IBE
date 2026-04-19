import type { OrgNavItem, CreateOrgNavItemRequest, UpdateOrgNavItemRequest } from '@ibe/shared'
import { prisma } from '../db/client.js'

function toOrgNavItem(row: {
  id: string; organizationId: number; section: string; label: string; type: string
  url: string | null; content: string | null; order: number
}): OrgNavItem {
  return {
    id: row.id,
    organizationId: row.organizationId,
    section: row.section as OrgNavItem['section'],
    label: row.label,
    type: row.type as OrgNavItem['type'],
    url: row.url,
    content: row.content,
    order: row.order,
  }
}

export async function listOrgNavItems(organizationId: number, section?: string): Promise<OrgNavItem[]> {
  const rows = await prisma.orgNavItem.findMany({
    where: { organizationId, deletedAt: null, ...(section ? { section } : {}) },
    orderBy: { order: 'asc' },
  })
  return rows.map(toOrgNavItem)
}

export async function createOrgNavItem(organizationId: number, data: CreateOrgNavItemRequest): Promise<OrgNavItem> {
  const maxOrder = await prisma.orgNavItem.aggregate({
    where: { organizationId, section: data.section },
    _max: { order: true },
  })
  const order = data.order ?? (maxOrder._max.order ?? -1) + 1

  const row = await prisma.orgNavItem.create({
    data: {
      organizationId,
      section: data.section,
      label: data.label,
      type: data.type,
      url: data.url ?? null,
      content: data.content ?? null,
      order,
    },
  })
  return toOrgNavItem(row)
}

export async function updateOrgNavItem(id: string, data: UpdateOrgNavItemRequest): Promise<OrgNavItem> {
  const row = await prisma.orgNavItem.update({
    where: { id },
    data: {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.url !== undefined && { url: data.url }),
      ...(data.content !== undefined && { content: data.content }),
      ...(data.order !== undefined && { order: data.order }),
    },
  })
  return toOrgNavItem(row)
}

export async function deleteOrgNavItem(id: string): Promise<void> {
  await prisma.orgNavItem.update({ where: { id }, data: { deletedAt: new Date() } })
}
