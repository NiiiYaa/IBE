import { prisma } from '../db/client.js'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'
import { encryptApiKey, maskApiKey, decryptApiKey } from './ai-config.service.js'
import type { MapProvider, PoiCategory, MapsConfigResponse, MapsConfigUpdate } from '@ibe/shared'

const DEFAULT_CATEGORIES = ['restaurants', 'attractions', 'transport', 'shopping']

function rowToResponse(row: {
  provider: string
  apiKey: string | null
  poiRadius: number
  poiCategories: string
  enabled: boolean
  systemServiceDisabled?: boolean
} | null, hasOwnConfig = false): MapsConfigResponse {
  return {
    provider: (row?.provider ?? 'osm') as MapProvider,
    apiKeySet: !!row?.apiKey,
    apiKeyMasked: row?.apiKey ? maskApiKey(row.apiKey) : null,
    poiRadius: row?.poiRadius ?? 1000,
    poiCategories: JSON.parse(row?.poiCategories ?? JSON.stringify(DEFAULT_CATEGORIES)) as PoiCategory[],
    enabled: row?.enabled ?? false,
    systemServiceDisabled: row?.systemServiceDisabled ?? false,
    hasOwnConfig,
  }
}

export interface PublicMapsConfig {
  provider: MapProvider
  poiRadius: number
  poiCategories: PoiCategory[]
  enabled: boolean
  tileUrl: string
  attribution: string
}

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function buildTileInfo(provider: MapProvider, encryptedKey: string | null | undefined): { url: string; attribution: string } {
  switch (provider) {
    case 'mapbox': {
      if (!encryptedKey) return { url: OSM_TILE_URL, attribution: OSM_ATTRIBUTION }
      const key = decryptApiKey(encryptedKey)
      return {
        url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=${key}`,
        attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>',
      }
    }
    case 'google':
      return {
        url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
        attribution: '&copy; <a href="https://maps.google.com">Google Maps</a>',
      }
    case 'here': {
      if (!encryptedKey) return { url: OSM_TILE_URL, attribution: OSM_ATTRIBUTION }
      const key = decryptApiKey(encryptedKey)
      return {
        url: `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/jpeg?apiKey=${key}`,
        attribution: '&copy; <a href="https://www.here.com">HERE</a>',
      }
    }
    default:
      return { url: OSM_TILE_URL, attribution: OSM_ATTRIBUTION }
  }
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

export async function getPublicMapsConfigByOrg(orgId: number): Promise<PublicMapsConfig> {
  const [orgRow, sysRow] = await Promise.all([
    prisma.orgMapsConfig.findUnique({ where: { organizationId: orgId } }),
    prisma.systemMapsConfig.findFirst(),
  ])
  const hasOwnKey = !!orgRow?.apiKey
  if (!hasOwnKey && orgRow?.systemServiceDisabled) {
    return { provider: 'osm' as MapProvider, poiRadius: 1000, poiCategories: DEFAULT_CATEGORIES as PoiCategory[], enabled: false, tileUrl: OSM_TILE_URL, attribution: OSM_ATTRIBUTION }
  }
  const resolved = hasOwnKey ? orgRow : (sysRow ?? orgRow)
  const base = rowToResponse(resolved ? { ...resolved, enabled: false } : null)
  const tileInfo = buildTileInfo(base.provider, resolved?.apiKey)
  return { provider: base.provider, poiRadius: base.poiRadius, poiCategories: base.poiCategories, enabled: base.enabled, tileUrl: tileInfo.url, attribution: tileInfo.attribution }
}

export async function getPublicMapsConfig(propertyId: number): Promise<PublicMapsConfig> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const [orgRow, sysRow] = await Promise.all([
    prop ? prisma.orgMapsConfig.findUnique({ where: { organizationId: prop.organizationId } }) : null,
    prisma.systemMapsConfig.findFirst(),
  ])
  // If org has own API key, use org config regardless of disable flag
  const hasOwnKey = !!orgRow?.apiKey
  if (!hasOwnKey && orgRow?.systemServiceDisabled) {
    return { provider: 'osm' as MapProvider, poiRadius: 1000, poiCategories: DEFAULT_CATEGORIES as PoiCategory[], enabled: false, tileUrl: OSM_TILE_URL, attribution: OSM_ATTRIBUTION }
  }
  // Cascade: org (own key) → system → hardcoded defaults
  const resolved = hasOwnKey ? orgRow : (sysRow ?? orgRow)
  const base = rowToResponse(resolved ? { ...resolved, enabled: false } : null)
  const tileInfo = buildTileInfo(base.provider, resolved?.apiKey)
  return { provider: base.provider, poiRadius: base.poiRadius, poiCategories: base.poiCategories, enabled: base.enabled, tileUrl: tileInfo.url, attribution: tileInfo.attribution }
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

export async function getSystemMapsConfig(): Promise<MapsConfigResponse> {
  const row = await prisma.systemMapsConfig.findFirst()
  return rowToResponse(row ? { ...row, enabled: false } : null)
}

export async function upsertSystemMapsConfig(data: MapsConfigUpdate): Promise<MapsConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.provider !== undefined) update.provider = data.provider
  if (data.apiKey !== undefined && data.apiKey !== '') update.apiKey = encryptApiKey(data.apiKey)
  if (data.poiRadius !== undefined) update.poiRadius = data.poiRadius
  if (data.poiCategories !== undefined) update.poiCategories = JSON.stringify(data.poiCategories)

  const existing = await prisma.systemMapsConfig.findFirst()
  const row = existing
    ? await prisma.systemMapsConfig.update({ where: { id: existing.id }, data: update })
    : await prisma.systemMapsConfig.create({ data: { provider: 'osm', poiRadius: 1000, poiCategories: JSON.stringify(DEFAULT_CATEGORIES), ...update } })
  return rowToResponse({ ...row, enabled: false })
}

export async function getMapsConfig(orgId: number): Promise<MapsConfigResponse> {
  const row = await prisma.orgMapsConfig.findUnique({ where: { organizationId: orgId } })
  return rowToResponse(row, !!row)
}

export async function testSystemMapsConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const row = await prisma.systemMapsConfig.findFirst()
    if (!row) return { ok: true } // no config = defaults to OSM which always works
    if (row.provider === 'osm') return { ok: true }
    if (row.provider === 'google' || row.provider === 'here') return { ok: true, error: 'Manual validation required for this provider' }
    if (row.provider === 'mapbox') {
      if (!row.apiKey) return { ok: false, error: 'No Mapbox API key configured' }
      const key = decryptApiKey(row.apiKey)
      const res = await fetch(`https://api.mapbox.com/tokens/v2?access_token=${key}`)
      if (res.ok) return { ok: true }
      return { ok: false, error: `Mapbox returned ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function testMapsConnection(orgId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const prop = await prisma.property.findFirst({ where: { organizationId: orgId }, select: { propertyId: true } })
    const propertyId = prop?.propertyId ?? 0
    const config = await getPublicMapsConfig(propertyId)
    const provider = config.provider

    if (provider === 'osm') return { ok: true }
    if (provider === 'google' || provider === 'here') return { ok: true, error: 'Manual validation required for this provider' }

    // mapbox — validate token via API
    if (provider === 'mapbox') {
      const [orgRow, sysRow] = await Promise.all([
        prop ? prisma.orgMapsConfig.findUnique({ where: { organizationId: orgId } }) : null,
        prisma.systemMapsConfig.findFirst(),
      ])
      const resolved = orgRow?.apiKey ? orgRow : (sysRow ?? orgRow)
      if (!resolved?.apiKey) return { ok: false, error: 'No Mapbox API key configured' }
      const key = decryptApiKey(resolved.apiKey)
      const res = await fetch(`https://api.mapbox.com/tokens/v2?access_token=${key}`)
      if (res.ok) return { ok: true }
      return { ok: false, error: `Mapbox returned ${res.status}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function upsertMapsConfig(orgId: number, data: MapsConfigUpdate): Promise<MapsConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.provider !== undefined) update.provider = data.provider
  if (data.apiKey !== undefined && data.apiKey !== '') update.apiKey = encryptApiKey(data.apiKey)
  if (data.poiRadius !== undefined) update.poiRadius = data.poiRadius
  if (data.poiCategories !== undefined) update.poiCategories = JSON.stringify(data.poiCategories)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.systemServiceDisabled !== undefined) update.systemServiceDisabled = data.systemServiceDisabled

  const row = await prisma.orgMapsConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  return rowToResponse(row)
}
