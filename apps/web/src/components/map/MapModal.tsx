'use client'

import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { HeaderMapData } from '@/components/layout/Header'
import type { PoiCategory } from '@ibe/shared'

// ── Hotel pin icon ────────────────────────────────────────────────────────────

function makeHotelIcon(primary = '#4f46e5') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 38" width="28" height="38">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 9.9 14 24 14 24S28 23.9 28 14C28 6.268 21.732 0 14 0z" fill="${primary}" stroke="white" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="5" fill="white"/>
  </svg>`
  return L.divIcon({
    className: '',
    html: svg,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
    popupAnchor: [0, -40],
  })
}

function makePoiIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
    <circle cx="8" cy="8" r="7" fill="${color}" stroke="white" stroke-width="1.5" opacity="0.9"/>
  </svg>`
  return L.divIcon({ className: '', html: svg, iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10] })
}

// ── POI types ─────────────────────────────────────────────────────────────────

const POI_COLORS: Record<PoiCategory, string> = {
  restaurants: '#f97316',
  attractions: '#3b82f6',
  transport: '#8b5cf6',
  shopping: '#ec4899',
  wellness: '#10b981',
  nightlife: '#f59e0b',
}

const POI_LABELS: Record<PoiCategory, string> = {
  restaurants: 'Restaurants',
  attractions: 'Attractions',
  transport: 'Transport',
  shopping: 'Shopping',
  wellness: 'Wellness',
  nightlife: 'Nightlife',
}

const OVERPASS_FILTERS: Record<PoiCategory, string> = {
  restaurants: `node["amenity"~"restaurant|cafe|bar|fast_food|pub"]`,
  attractions: `node["tourism"~"attraction|museum|gallery|viewpoint|artwork"]`,
  transport: `(node["public_transport"="station"];node["railway"="station"];node["amenity"="bus_station"])`,
  shopping: `node["shop"]["name"]`,
  wellness: `node["leisure"~"spa|fitness_centre|swimming_pool"]`,
  nightlife: `node["amenity"~"bar|nightclub|pub"]`,
}

// ── Data types ────────────────────────────────────────────────────────────────

interface PublicMapsConfig {
  provider: string
  poiRadius: number
  poiCategories: PoiCategory[]
}

interface ChainProperty {
  id: number
  name: string
  lat: number
  lng: number
  address: string
  city: string
  starRating: number
}

interface PoiNode {
  id: number
  lat: number
  lon: number
  tags: { name?: string; amenity?: string; tourism?: string; shop?: string; [k: string]: string | undefined }
  category: PoiCategory
}

// ── Overpass query ────────────────────────────────────────────────────────────

async function fetchPoi(lat: number, lng: number, radius: number, categories: PoiCategory[]): Promise<PoiNode[]> {
  if (categories.length === 0) return []
  const parts = categories.flatMap(cat => {
    const filter = OVERPASS_FILTERS[cat]
    const withAround = filter.startsWith('(')
      ? filter.slice(1, -1).split(';').map(p => p.trim()).filter(Boolean).map(p => `${p}(around:${radius},${lat},${lng});`).join('\n')
      : `${filter}(around:${radius},${lat},${lng});`
    return { cat, query: withAround }
  })

  const body = `[out:json][timeout:15];\n(\n${parts.map(p => p.query).join('\n')}\n);\nout body 60;`
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    if (!res.ok) return []
    const data = await res.json() as { elements: Array<{ id: number; lat: number; lon: number; tags: Record<string, string> }> }

    return data.elements.map(el => {
      let category: PoiCategory = 'attractions'
      if (el.tags.amenity && ['restaurant', 'cafe', 'fast_food'].includes(el.tags.amenity)) category = 'restaurants'
      else if (el.tags.amenity && ['bar', 'pub'].includes(el.tags.amenity)) category = categories.includes('nightlife') ? 'nightlife' : 'restaurants'
      else if (el.tags.tourism) category = 'attractions'
      else if (el.tags.public_transport || el.tags.railway || (el.tags.amenity === 'bus_station')) category = 'transport'
      else if (el.tags.shop) category = 'shopping'
      else if (el.tags.leisure) category = 'wellness'
      return { id: el.id, lat: el.lat, lon: el.lon, tags: el.tags, category }
    }).filter(n => categories.includes(n.category))
  } catch {
    return []
  }
}

// ── Fit-bounds helper (chain mode) ────────────────────────────────────────────

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || positions.length === 0) return
    fitted.current = true
    if (positions.length === 1) {
      map.setView(positions[0]!, 14)
    } else {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] })
    }
  }, [map, positions])
  return null
}

// ── Stars helper ──────────────────────────────────────────────────────────────

function Stars({ n }: { n: number }) {
  return <span className="text-amber-400">{'★'.repeat(Math.round(n))}</span>
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function MapModal({ data, onClose }: { data: HeaderMapData; onClose: () => void }) {
  const [mapsConfig, setMapsConfig] = useState<PublicMapsConfig | null>(null)
  const [chainProps, setChainProps] = useState<ChainProperty[]>([])
  const [poi, setPoi] = useState<PoiNode[]>([])
  const [loading, setLoading] = useState(true)

  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4f46e5'
  const hotelIcon = makeHotelIcon(primaryColor)

  useEffect(() => {
    async function load() {
      try {
        if (data.mode === 'hotel') {
          const cfgRes = await fetch(`/api/v1/maps/config?propertyId=${data.propertyId}`)
          const cfg: PublicMapsConfig = cfgRes.ok ? await cfgRes.json() : { provider: 'osm', poiRadius: 1000, poiCategories: ['restaurants', 'attractions', 'transport', 'shopping'] }
          setMapsConfig(cfg)
          const poiData = await fetchPoi(data.lat, data.lng, cfg.poiRadius, cfg.poiCategories as PoiCategory[])
          setPoi(poiData)
        } else {
          const [propsRes, cfgRes] = await Promise.all([
            fetch(`/api/v1/maps/chain?orgId=${data.orgId}`),
            fetch(`/api/v1/maps/config?propertyId=0`).catch(() => null),
          ])
          const props: ChainProperty[] = propsRes.ok ? await propsRes.json() : []
          setChainProps(props)
          const cfg: PublicMapsConfig = (cfgRes?.ok ? await cfgRes.json() : null) ?? { provider: 'osm', poiRadius: 1000, poiCategories: [] }
          setMapsConfig(cfg)
        }
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [data])

  const title = data.mode === 'hotel' ? data.name : 'Our Hotels'
  const activeCategories = (mapsConfig?.poiCategories ?? []) as PoiCategory[]
  const presentCategories = activeCategories.filter(cat => poi.some(p => p.category === cat))

  const defaultCenter: [number, number] = data.mode === 'hotel'
    ? [data.lat, data.lng]
    : chainProps.length > 0 ? [chainProps[0]!.lat, chainProps[0]!.lng] : [20, 0]

  const chainPositions: [number, number][] = chainProps.map(p => [p.lat, p.lng])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Map */}
        <div className="relative flex-1 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-background)]">
              <p className="text-sm text-[var(--color-text-muted)]">Loading map…</p>
            </div>
          )}
          {!loading && (
            <MapContainer
              center={defaultCenter}
              zoom={data.mode === 'hotel' ? 15 : 5}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />

              {/* Hotel mode: single marker + POI */}
              {data.mode === 'hotel' && (
                <>
                  <Marker position={[data.lat, data.lng]} icon={hotelIcon}>
                    <Popup>
                      <div className="min-w-[160px]">
                        <p className="font-semibold">{data.name}</p>
                        {data.address && <p className="mt-0.5 text-xs text-gray-500">{data.address}</p>}
                      </div>
                    </Popup>
                  </Marker>
                  {poi.map(p => (
                    <Marker key={p.id} position={[p.lat, p.lon]} icon={makePoiIcon(POI_COLORS[p.category])}>
                      <Popup>
                        <div>
                          <p className="font-medium">{p.tags.name ?? p.category}</p>
                          <p className="text-xs capitalize text-gray-500">{POI_LABELS[p.category]}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </>
              )}

              {/* Chain mode: all hotel markers */}
              {data.mode === 'chain' && (
                <>
                  <FitBounds positions={chainPositions} />
                  {chainProps.map(p => (
                    <Marker key={p.id} position={[p.lat, p.lng]} icon={hotelIcon}>
                      <Popup>
                        <div className="min-w-[160px]">
                          <p className="font-semibold">{p.name}</p>
                          {p.starRating > 0 && <div className="mt-0.5"><Stars n={p.starRating} /></div>}
                          <p className="mt-0.5 text-xs text-gray-500">{[p.city, p.address].filter(Boolean).join(' · ')}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </>
              )}
            </MapContainer>
          )}
        </div>

        {/* Legend (hotel mode only, when POI present) */}
        {data.mode === 'hotel' && presentCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] px-5 py-2.5">
            {presentCategories.map(cat => (
              <div key={cat} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: POI_COLORS[cat] }}
                />
                <span className="text-xs text-[var(--color-text-muted)]">{POI_LABELS[cat]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
