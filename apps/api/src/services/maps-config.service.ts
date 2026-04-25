import { prisma } from '../db/client.js'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'
import { encryptApiKey, maskApiKey } from './ai-config.service.js'
import type { MapProvider, PoiCategory, MapsConfigResponse, MapsConfigUpdate } from '@ibe/shared'

const DEFAULT_CATEGORIES = ['restaurants', 'attractions', 'transport', 'shopping']

function rowToResponse(row: {
  provider: string
  apiKey: string | null
  poiRadius: number
  poiCategories: string
  enabled: boolean
} | null): MapsConfigResponse {
  return {
    provider: (row?.provider ?? 'osm') as MapProvider,
    apiKeySet: !!row?.apiKey,
    apiKeyMasked: row?.apiKey ? maskApiKey(row.apiKey) : null,
    poiRadius: row?.poiRadius ?? 1000,
    poiCategories: JSON.parse(row?.poiCategories ?? JSON.stringify(DEFAULT_CATEGORIES)) as PoiCategory[],
    enabled: row?.enabled ?? false,
  }
}

export interface PublicMapsConfig {
  provider: MapProvider
  poiRadius: number
  poiCategories: PoiCategory[]
}

export interface ChainPropertyMarker {
  id: number
  name: string
  lat: number
  lng: number
  address: string
  city: string
  starRating: number
}

export async function getPublicMapsConfig(propertyId: number): Promise<PublicMapsConfig> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const row = prop ? await prisma.orgMapsConfig.findUnique({ where: { organizationId: prop.organizationId } }) : null
  const base = rowToResponse(row)
  return { provider: base.provider, poiRadius: base.poiRadius, poiCategories: base.poiCategories }
}

export async function getChainProperties(orgId: number): Promise<ChainPropertyMarker[]> {
  const props = await prisma.property.findMany({
    where: { organizationId: orgId, isActive: true, deletedAt: null },
    select: { propertyId: true },
  })
  const results = await Promise.allSettled(
    props.map(async p => {
      const data = await fetchPropertyStatic(p.propertyId)
      const lat = data.coordinates?.latitude
      const lng = data.coordinates?.longitude
      if (!lat || !lng) return null
      return {
        id: p.propertyId,
        name: data.name,
        lat,
        lng,
        address: data.location?.address ?? '',
        city: data.location?.city?.name ?? '',
        starRating: data.rating ?? 0,
      } satisfies ChainPropertyMarker
    })
  )
  return results
    .filter((r): r is PromiseFulfilledResult<ChainPropertyMarker | null> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value!)
}

export async function getMapsConfig(orgId: number): Promise<MapsConfigResponse> {
  const row = await prisma.orgMapsConfig.findUnique({ where: { organizationId: orgId } })
  return rowToResponse(row)
}

export async function upsertMapsConfig(orgId: number, data: MapsConfigUpdate): Promise<MapsConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.provider !== undefined) update.provider = data.provider
  if (data.apiKey !== undefined && data.apiKey !== '') update.apiKey = encryptApiKey(data.apiKey)
  if (data.poiRadius !== undefined) update.poiRadius = data.poiRadius
  if (data.poiCategories !== undefined) update.poiCategories = JSON.stringify(data.poiCategories)
  if (data.enabled !== undefined) update.enabled = data.enabled

  const row = await prisma.orgMapsConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  return rowToResponse(row)
}
