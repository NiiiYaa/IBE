import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports-extended.dat'
const res = await fetch(url)
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const text = await res.text()

interface AirportEntry { code: string; name: string; lat: number; lng: number }
const entries: AirportEntry[] = []
const seen = new Set<string>()

for (const line of text.split('\n')) {
  const parts = line.split(',').map(p => p.replace(/^"|"$/g, '').trim())
  // fields: id,name,city,country,iata,icao,lat,lng,alt,tz_offset,dst,tz_name,type,source
  const name = parts[1] ?? ''
  const iata = parts[4] ?? ''
  const lat = parseFloat(parts[6] ?? '')
  const lng = parseFloat(parts[7] ?? '')
  const type = parts[12] ?? ''
  if (type !== 'airport') continue
  if (!iata || iata === '\\N' || iata.length !== 3 || isNaN(lat) || isNaN(lng)) continue
  if (name === 'All Airports') continue
  if (!/^[A-Z]{3}$/.test(iata)) continue
  if (seen.has(iata)) continue
  seen.add(iata)
  entries.push({ code: iata, name, lat, lng })
}

const outDir = resolve(__dirname, '../src/data')
mkdirSync(outDir, { recursive: true })
const out = resolve(outDir, 'iata-cities.json')
writeFileSync(out, JSON.stringify(entries))
console.log(`Generated ${entries.length} entries → ${out}`)
