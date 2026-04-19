import type { NavItem, CreateNavItemRequest, UpdateNavItemRequest } from '@ibe/shared'
import { prisma } from '../db/client.js'

function toNavItem(row: {
  id: string; propertyId: number; section: string; label: string; type: string
  url: string | null; content: string | null; order: number
}): NavItem {
  return {
    id: row.id,
    propertyId: row.propertyId,
    section: row.section as NavItem['section'],
    label: row.label,
    type: row.type as NavItem['type'],
    url: row.url,
    content: row.content,
    order: row.order,
  }
}

export async function listNavItems(propertyId: number, section?: string): Promise<NavItem[]> {
  const rows = await prisma.navItem.findMany({
    where: { propertyId, deletedAt: null, ...(section ? { section } : {}) },
    orderBy: { order: 'asc' },
  })
  if (rows.length > 0) return rows.map(toNavItem)

  // Fall back to org-level nav items if the property has none for this section
  const property = await prisma.property.findFirst({
    where: { propertyId, deletedAt: null },
    select: { organizationId: true },
  })
  if (!property) return []

  const orgRows = await prisma.orgNavItem.findMany({
    where: { organizationId: property.organizationId, deletedAt: null, ...(section ? { section } : {}) },
    orderBy: { order: 'asc' },
  })
  return orgRows.map(r => ({
    id: r.id,
    propertyId,
    section: r.section as NavItem['section'],
    label: r.label,
    type: r.type as NavItem['type'],
    url: r.url,
    content: r.content,
    order: r.order,
  }))
}

export async function createNavItem(propertyId: number, data: CreateNavItemRequest): Promise<NavItem> {
  const maxOrder = await prisma.navItem.aggregate({
    where: { propertyId, section: data.section },
    _max: { order: true },
  })
  const order = data.order ?? (maxOrder._max.order ?? -1) + 1

  const row = await prisma.navItem.create({
    data: {
      propertyId,
      section: data.section,
      label: data.label,
      type: data.type,
      url: data.url ?? null,
      content: data.content ?? null,
      order,
    },
  })
  return toNavItem(row)
}

export async function updateNavItem(id: string, data: UpdateNavItemRequest): Promise<NavItem | null> {
  const row = await prisma.navItem.update({
    where: { id },
    data: {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.url !== undefined && { url: data.url }),
      ...(data.content !== undefined && { content: data.content }),
      ...(data.order !== undefined && { order: data.order }),
    },
  })
  return toNavItem(row)
}

export async function deleteNavItem(id: string): Promise<void> {
  await prisma.navItem.update({ where: { id }, data: { deletedAt: new Date() } })
}

export async function getOrgNavItemOverrides(propertyId: number): Promise<Record<string, boolean>> {
  const rows = await prisma.orgNavItemOverride.findMany({ where: { propertyId } })
  return Object.fromEntries(rows.map(r => [r.orgNavItemId, r.isEnabled]))
}

export async function setOrgNavItemOverride(orgNavItemId: string, propertyId: number, isEnabled: boolean): Promise<void> {
  await prisma.orgNavItemOverride.upsert({
    where: { orgNavItemId_propertyId: { orgNavItemId, propertyId } },
    create: { orgNavItemId, propertyId, isEnabled },
    update: { isEnabled },
  })
}
