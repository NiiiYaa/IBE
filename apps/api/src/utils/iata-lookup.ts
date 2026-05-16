import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { NearestAirport } from '@ibe/shared'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface AirportEntry { code: string; name: string; lat: number; lng: number }

let _bundled: AirportEntry[] | undefined
function getBundledDataset(): AirportEntry[] {
  return (_bundled ??= JSON.parse(
    readFileSync(resolve(__dirname, '../data/iata-cities.json'), 'utf8')
  ) as AirportEntry[])
}

const MILITARY_KEYWORDS = [
  'air force base', 'air force station', ' afb', 'air base',
  'naval air', ' nas ', 'rnas ', 'navy base',
  'army airfield', 'army air field', 'army aviation',
  'military', 'joint base', 'air national guard', 'air reserve base',
  'raf ', ' mcas', ' naf ', ' aaf ', 'usaf',
]

function isMilitary(name: string): boolean {
  const n = name.toLowerCase()
  return MILITARY_KEYWORDS.some(k => n.includes(k))
}

function toRad(deg: number) { return deg * Math.PI / 180 }

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function findNearestAirports(
  lat: number,
  lng: number,
  maxKm: number,
  maxCount: number,
  dataset?: AirportEntry[]
): NearestAirport[] {
  const airports = dataset ?? getBundledDataset()
  const results: NearestAirport[] = []

  for (const a of airports) {
    if (isMilitary(a.name)) continue
    const d = haversineKm(lat, lng, a.lat, a.lng)
    if (d <= maxKm) {
      results.push({ code: a.code, name: a.name, distanceKm: Math.round(d), lat: a.lat, lng: a.lng })
    }
  }

  results.sort((a, b) => a.distanceKm - b.distanceKm)
  return results.slice(0, maxCount)
}
