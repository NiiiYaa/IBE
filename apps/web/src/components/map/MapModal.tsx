'use client'

import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { HeaderMapData } from '@/components/layout/Header'
import type { PoiCategory, NearestAirport } from '@ibe/shared'
import { POI_COLORS, POI_ICON_PATHS, poiIconSvg } from '@/lib/poi-icons'

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

function makeSisterHotelIcon(primary = '#4f46e5') {
  // Smaller, slightly transparent variant for sister chain hotels
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 30" width="22" height="30">
    <path d="M11 0C4.925 0 0 4.925 0 11c0 7.7 11 19 11 19S22 18.7 22 11C22 4.925 17.075 0 11 0z" fill="${primary}" stroke="white" stroke-width="1.5" opacity="0.65"/>
    <circle cx="11" cy="11" r="4" fill="white" opacity="0.9"/>
  </svg>`
  return L.divIcon({
    className: '',
    html: svg,
    iconSize: [22, 30],
    iconAnchor: [11, 30],
    popupAnchor: [0, -32],
  })
}

function makeAirportIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
    <circle cx="12" cy="12" r="11" fill="white" stroke="#0f509e" stroke-width="1.5"/>
    <path d="M13.5 5.5c-.55 0-1 .45-1 1v3.25L7 12.5v1.5l5.5-1.5V16l-1.5 1v1l2.5-.75L16 18v-1l-1.5-1v-3.5L20 14v-1.5l-5.5-2.75V6.5c0-.55-.45-1-1-1z" fill="#0f509e"/>
  </svg>`
  return L.divIcon({ className: '', html: svg, iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -14] })
}

function makePoiIcon(color: string, iconPath: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">
    <circle cx="10" cy="10" r="9" fill="${color}" stroke="white" stroke-width="1.2"/>
    ${iconPath}
  </svg>`
  return L.divIcon({ className: '', html: svg, iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12] })
}

// ── POI types ─────────────────────────────────────────────────────────────────

const POI_LABELS: Record<PoiCategory, string> = {
  restaurants: 'Restaurants',
  cafes:       'Cafes',
  attractions: 'Attractions',
  museums:     'Museums',
  transport:   'Transport',
  metro:       'Metro',
  shopping:    'Shopping',
  wellness:    'Wellness',
  nightlife:   'Nightlife',
  airports:    'Airports',
  beaches:     'Beaches',
  parks:       'Parks',
  banks:       'Banks & ATMs',
  medical:     'Medical',
  sports:      'Sports',
}


const OVERPASS_FILTERS: Record<PoiCategory, string> = {
  restaurants: `node["amenity"~"restaurant|fast_food|food_court"]`,
  cafes:       `node["amenity"~"cafe|coffee_shop|bakery|ice_cream"]`,
  attractions: `node["tourism"~"attraction|viewpoint|artwork|zoo|theme_park"]`,
  museums:     `node["tourism"~"museum|gallery"]`,
  transport:   `(node["amenity"~"bus_station|ferry_terminal|taxi"];node["railway"~"station|halt"]["station"!="subway"])`,
  metro:       `(node["railway"="subway_entrance"];node["station"="subway"];node["railway"="tram_stop"])`,
  shopping:    `node["shop"]["name"]`,
  wellness:    `node["leisure"~"spa|fitness_centre|swimming_pool"]`,
  nightlife:   `node["amenity"~"bar|nightclub|pub"]`,
  airports:    ``,
  beaches:     `node["natural"="beach"]`,
  parks:       `node["leisure"~"park|garden|nature_reserve|common"]`,
  banks:       `(node["amenity"="bank"];node["amenity"="atm"])`,
  medical:     `node["amenity"~"pharmacy|hospital|clinic|doctors|dentist"]`,
  sports:      `node["leisure"~"stadium|sports_centre|sports_hall|pitch|track"]`,
}

// ── Data types ────────────────────────────────────────────────────────────────

interface PublicMapsConfig {
  provider: string
  poiRadius: number
  poiCategories: PoiCategory[]
  tileUrl: string
  attribution: string
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
      const a = el.tags.amenity
      const t = el.tags.tourism
      const l = el.tags.leisure
      if (a && ['restaurant', 'fast_food', 'food_court'].includes(a)) category = 'restaurants'
      else if (a && ['cafe', 'coffee_shop', 'bakery', 'ice_cream'].includes(a)) category = 'cafes'
      else if (a && ['bar', 'pub'].includes(a)) category = categories.includes('nightlife') ? 'nightlife' : 'restaurants'
      else if (a && 'nightclub' === a) category = 'nightlife'
      else if (a && ['pharmacy', 'hospital', 'clinic', 'doctors', 'dentist'].includes(a)) category = 'medical'
      else if (a && ['bank', 'atm'].includes(a)) category = 'banks'
      else if (a && ['bus_station', 'ferry_terminal', 'taxi'].includes(a)) category = 'transport'
      else if (el.tags.railway === 'subway_entrance' || el.tags.station === 'subway' || el.tags.railway === 'tram_stop') category = 'metro'
      else if (el.tags.railway || el.tags.public_transport) category = 'transport'
      else if (t && ['museum', 'gallery'].includes(t)) category = 'museums'
      else if (t) category = 'attractions'
      else if (el.tags.natural === 'beach') category = 'beaches'
      else if (l && ['park', 'garden', 'nature_reserve', 'common'].includes(l)) category = 'parks'
      else if (l && ['stadium', 'sports_centre', 'sports_hall', 'pitch', 'track'].includes(l)) category = 'sports'
      else if (l && ['spa', 'fitness_centre', 'swimming_pool'].includes(l)) category = 'wellness'
      else if (el.tags.shop) category = 'shopping'
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
  const [airports, setAirports] = useState<NearestAirport[]>([])
  const [loading, setLoading] = useState(true)

  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4f46e5'
  const hotelIcon = makeHotelIcon(primaryColor)
  const sisterIcon = makeSisterHotelIcon(primaryColor)

  useEffect(() => {
    async function load() {
      try {
        if (data.mode === 'hotel') {
          const fetches: [Promise<Response>, Promise<Response | null>] = [
            fetch(`/api/v1/maps/config?propertyId=${data.propertyId}`),
            data.orgId ? fetch(`/api/v1/maps/chain?orgId=${data.orgId}`) : Promise.resolve(null),
          ]
          const [cfgRes, chainRes] = await Promise.all(fetches)
          const cfg: PublicMapsConfig = cfgRes.ok ? await cfgRes.json() : { provider: 'osm', poiRadius: 1000, poiCategories: ['restaurants', 'attractions', 'transport', 'shopping'] }
          setMapsConfig(cfg)
          const showAirports = (cfg.poiCategories as PoiCategory[]).includes('airports')
          const nonAirportCats = (cfg.poiCategories as PoiCategory[]).filter(c => c !== 'airports')
          const [poiData, sisterProps, airportRes] = await Promise.all([
            fetchPoi(data.lat, data.lng, cfg.poiRadius, nonAirportCats),
            chainRes?.ok ? chainRes.json() as Promise<ChainProperty[]> : Promise.resolve([]),
            showAirports ? fetch(`/api/v1/airports/nearest?propertyId=${data.propertyId}&forMap=true`).catch(() => null) : Promise.resolve(null),
          ])
          setPoi(poiData)
          setChainProps((sisterProps as ChainProperty[]).filter(p => p.id !== data.propertyId))
          const airportData = airportRes?.ok ? await airportRes.json() as { airports: NearestAirport[] } : null
          setAirports(airportData?.airports ?? [])
        } else {
          const [propsRes, cfgRes] = await Promise.all([
            fetch(`/api/v1/maps/chain?orgId=${data.orgId}`),
            fetch(`/api/v1/maps/config?orgId=${data.orgId}`).catch(() => null),
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
            <svg className="h-4 w-4 shrink-0 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
              {data.mode === 'hotel' && data.address && (
                <p className="text-xs text-[var(--color-text-muted)]">{data.address}</p>
              )}
            </div>
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
              zoom={data.mode === 'hotel' ? 14 : 5}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                url={mapsConfig?.tileUrl ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
                attribution={mapsConfig?.attribution ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
              />

              {/* Hotel mode: primary marker + POI + optional sister hotels */}
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
                  {chainProps.map(p => (
                    <Marker key={p.id} position={[p.lat, p.lng]} icon={sisterIcon}>
                      <Popup>
                        <div className="min-w-[160px]">
                          <p className="font-semibold">{p.name}</p>
                          {p.starRating > 0 && <div className="mt-0.5"><Stars n={p.starRating} /></div>}
                          <p className="mt-0.5 text-xs text-gray-500">{[p.city, p.address].filter(Boolean).join(' · ')}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  {poi.map(p => (
                    <Marker key={p.id} position={[p.lat, p.lon]} icon={makePoiIcon(POI_COLORS[p.category], POI_ICON_PATHS[p.category])}>
                      <Popup>
                        <div>
                          <p className="font-medium">{p.tags.name ?? p.category}</p>
                          <p className="text-xs capitalize text-gray-500">{POI_LABELS[p.category]}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  {airports.map(a => (
                    <Marker key={a.code} position={[a.lat, a.lng]} icon={makeAirportIcon()}>
                      <Popup>
                        <div>
                          <p className="font-medium">{a.code} — {a.name}</p>
                          <p className="text-xs text-gray-500">{a.distanceKm} km away</p>
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

        {/* Legend (hotel mode only) */}
        {data.mode === 'hotel' && (presentCategories.length > 0 || airports.length > 0) && (
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] px-5 py-2.5">
            {[...(airports.length > 0 ? ['airports' as PoiCategory] : []), ...presentCategories].map(cat => (
              <div key={cat} className="flex items-center gap-1.5">
                <span
                  className="inline-flex shrink-0 items-center justify-center rounded-full"
                  style={{ width: 16, height: 16, background: POI_COLORS[cat] }}
                  dangerouslySetInnerHTML={{ __html: poiIconSvg(cat, 16) }}
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
