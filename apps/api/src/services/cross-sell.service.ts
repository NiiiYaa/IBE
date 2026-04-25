import { prisma } from '../db/client.js'
import type {
  CrossSellConfig,
  CrossSellConfigUpdate,
  CrossSellProduct,
  CrossSellProductCreate,
  CrossSellProductUpdate,
  CrossSellPaymentMode,
  CrossSellPricingModel,
  CrossSellProductStatus,
} from '@ibe/shared'

function rowToProduct(row: {
  id: number; name: string; description: string; imageUrl: string | null
  price: { toNumber(): number }; tax: { toNumber(): number }
  pricingModel: string; currency: string; status: string; sortOrder: number
}): CrossSellProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    price: row.price.toNumber(),
    tax: row.tax.toNumber(),
    pricingModel: row.pricingModel as CrossSellPricingModel,
    currency: row.currency,
    status: row.status as CrossSellProductStatus,
    sortOrder: row.sortOrder,
  }
}

export async function getCrossSellConfig(orgId: number): Promise<CrossSellConfig> {
  const [cfg, products] = await Promise.all([
    prisma.crossSellConfig.findUnique({ where: { organizationId: orgId } }),
    prisma.crossSellProduct.findMany({
      where: { organizationId: orgId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ])
  return {
    enabled: cfg?.enabled ?? false,
    paymentMode: (cfg?.paymentMode ?? 'informational') as CrossSellPaymentMode,
    showExternalEvents: cfg?.showExternalEvents ?? false,
    products: products.map(rowToProduct),
  }
}

export async function updateCrossSellConfig(orgId: number, update: CrossSellConfigUpdate): Promise<CrossSellConfig> {
  await prisma.crossSellConfig.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      enabled: update.enabled ?? false,
      paymentMode: update.paymentMode ?? 'informational',
      showExternalEvents: update.showExternalEvents ?? false,
    },
    update: {
      ...(update.enabled !== undefined && { enabled: update.enabled }),
      ...(update.paymentMode !== undefined && { paymentMode: update.paymentMode }),
      ...(update.showExternalEvents !== undefined && { showExternalEvents: update.showExternalEvents }),
      updatedAt: new Date(),
    },
  })
  return getCrossSellConfig(orgId)
}

export async function createCrossSellProduct(orgId: number, data: CrossSellProductCreate): Promise<CrossSellProduct> {
  const row = await prisma.crossSellProduct.create({
    data: {
      organizationId: orgId,
      name: data.name,
      description: data.description,
      imageUrl: data.imageUrl ?? null,
      price: data.price,
      tax: data.tax,
      pricingModel: data.pricingModel,
      currency: data.currency,
      status: data.status,
      sortOrder: data.sortOrder ?? 0,
    },
  })
  return rowToProduct(row)
}

export async function updateCrossSellProduct(
  orgId: number, productId: number, data: CrossSellProductUpdate
): Promise<CrossSellProduct | null> {
  const existing = await prisma.crossSellProduct.findFirst({ where: { id: productId, organizationId: orgId } })
  if (!existing) return null
  const row = await prisma.crossSellProduct.update({
    where: { id: productId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.tax !== undefined && { tax: data.tax }),
      ...(data.pricingModel !== undefined && { pricingModel: data.pricingModel }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      updatedAt: new Date(),
    },
  })
  return rowToProduct(row)
}

export async function deleteCrossSellProduct(orgId: number, productId: number): Promise<boolean> {
  const existing = await prisma.crossSellProduct.findFirst({ where: { id: productId, organizationId: orgId } })
  if (!existing) return false
  await prisma.crossSellProduct.delete({ where: { id: productId } })
  return true
}

// Property-level override (chain → hotel inheritance)
export async function getPropertyCrossSellOverride(propertyDbId: number) {
  return prisma.propertyCrossSellConfig.findUnique({ where: { propertyId: propertyDbId } })
}

export async function upsertPropertyCrossSellOverride(
  propertyDbId: number, orgId: number, data: { enabled?: boolean | null; paymentMode?: string | null }
) {
  return prisma.propertyCrossSellConfig.upsert({
    where: { propertyId: propertyDbId },
    create: { propertyId: propertyDbId, organizationId: orgId, ...data },
    update: { ...data, updatedAt: new Date() },
  })
}

// Public: resolved config for a property (property override ?? chain config)
export async function getResolvedCrossSell(propertyId: number): Promise<{
  enabled: boolean; paymentMode: CrossSellPaymentMode; products: CrossSellProduct[]
} | null> {
  const prop = await prisma.property.findUnique({ where: { propertyId } })
  if (!prop) return null
  const orgId = prop.organizationId

  const [chainCfg, propOverride, products] = await Promise.all([
    prisma.crossSellConfig.findUnique({ where: { organizationId: orgId } }),
    prisma.propertyCrossSellConfig.findUnique({ where: { propertyId: prop.id } }),
    prisma.crossSellProduct.findMany({
      where: { organizationId: orgId, status: 'active' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  const enabled = propOverride?.enabled ?? chainCfg?.enabled ?? false
  const paymentMode = (propOverride?.paymentMode ?? chainCfg?.paymentMode ?? 'informational') as CrossSellPaymentMode
  const showExternalEvents = chainCfg?.showExternalEvents ?? false

  return { enabled, paymentMode, showExternalEvents, products: products.map(rowToProduct) }
}
