import { prisma } from '../db/client.js'

function formatPixel(px: {
  id: number
  propertyId: number | null
  name: string
  code: string
  pages: string
  isActive: boolean
  createdAt: Date
}) {
  return {
    id: px.id,
    propertyId: px.propertyId,
    name: px.name,
    code: px.code,
    pages: JSON.parse(px.pages) as string[],
    isActive: px.isActive,
    createdAt: px.createdAt.toISOString(),
  }
}

export async function listPixels(organizationId: number, propertyId?: number | null) {
  const pixels = await prisma.trackingPixel.findMany({
    where: {
      organizationId,
      propertyId: propertyId !== undefined ? propertyId : null,
    },
    orderBy: { createdAt: 'asc' },
  })
  return pixels.map(formatPixel)
}

export async function getPixel(id: number, organizationId: number) {
  const px = await prisma.trackingPixel.findFirst({ where: { id, organizationId } })
  if (!px) return null
  return formatPixel(px)
}

export async function createPixel(
  organizationId: number,
  data: { name: string; code: string; pages: string[]; isActive?: boolean },
  propertyId?: number | null,
) {
  const px = await prisma.trackingPixel.create({
    data: {
      organizationId,
      propertyId: propertyId ?? null,
      name: data.name,
      code: data.code,
      pages: JSON.stringify(data.pages),
      isActive: data.isActive ?? true,
    },
  })
  return formatPixel(px)
}

export async function updatePixel(
  id: number,
  organizationId: number,
  data: { name?: string; code?: string; pages?: string[]; isActive?: boolean },
) {
  const px = await prisma.trackingPixel.updateMany({
    where: { id, organizationId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.code !== undefined && { code: data.code }),
      ...(data.pages !== undefined && { pages: JSON.stringify(data.pages) }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })
  if (px.count === 0) return null
  return getPixel(id, organizationId)
}

export async function deletePixel(id: number, organizationId: number) {
  await prisma.trackingPixel.deleteMany({ where: { id, organizationId } })
}

export async function getActivePixelsForPage(organizationId: number, propertyId: number, page: string) {
  const pixels = await prisma.trackingPixel.findMany({
    where: {
      organizationId,
      isActive: true,
      OR: [{ propertyId: null }, { propertyId }],
    },
    select: { id: true, code: true, pages: true },
  })
  return pixels
    .filter(px => {
      const pages = JSON.parse(px.pages) as string[]
      return pages.includes('all') || pages.includes(page)
    })
    .map(px => ({ id: px.id, code: px.code }))
}
