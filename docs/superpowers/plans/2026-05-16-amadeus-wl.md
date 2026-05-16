# Amadeus WL (Activities Booking) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Amadeus Discover White Label as an additional activity-booking entry point plus a nearest-airports display: admin config with System→Chain→Hotel inheritance, a bundled OpenFlights airport dataset (refreshable by admin), nearest-airports lookup for both the WL URL and a guest-facing airport chip row, and a guest-facing "Explore Activities" CTA on the search and cross-sell pages.

**Architecture:** Three Prisma models (`SystemWLConfig` / `OrgWLConfig` / `PropertyWLConfig`) mirror the existing Amadeus config inheritance pattern. `SystemWLConfig` stores an optional DB-refreshable airport dataset (JSON field) alongside radius/count config; the bundled `iata-cities.json` file is the fallback. `findNearestAirports(lat, lng, maxKm, maxCount, dataset?)` in `iata-lookup.ts` does haversine sorting and returns up to N airports with name + distance. Two public endpoints: `GET /api/v1/wl/config?propertyId=X` (resolved UUID + first iataCode for the WL URL) and `GET /api/v1/airports/nearest?propertyId=X` (full sorted airport list for the guest chip row). A `POST /admin/wl/config/system/refresh-airports` endpoint re-downloads OpenFlights and stores it in DB.

**Tech Stack:** Prisma (PostgreSQL), Fastify, Next.js 14 (client components), TanStack Query, `@ibe/shared` types, Tailwind CSS via CSS variables.

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260516000000_add_wl_config.sql`

- [ ] **Step 1: Add relations to `Organization` and `Property` models**

In `schema.prisma`, add to the `Organization` model block (after `orgAmadeusConfig`):
```prisma
  orgWLConfig                 OrgWLConfig?
```

Add to the `Property` model block (after `propertyAmadeusConfig`):
```prisma
  propertyWLConfig            PropertyWLConfig?
```

- [ ] **Step 2: Add the three new models at the end of `schema.prisma`**

```prisma
// ── Amadeus White Label ───────────────────────────────────────────────────────

model SystemWLConfig {
  id                       Int       @id @default(autoincrement())
  channelUuid              String?   // AES-256-CBC encrypted
  enabled                  Boolean   @default(false)
  enforceChildCreds        Boolean   @default(false)
  airportDataset           Json?     // AirportEntry[] refreshed from OpenFlights
  airportDatasetUpdatedAt  DateTime?
  airportRadiusKm          Int       @default(100)
  airportMaxCount          Int       @default(3)
  createdAt                DateTime  @default(now())
  updatedAt                DateTime  @updatedAt
}

model OrgWLConfig {
  id                    Int          @id @default(autoincrement())
  organizationId        Int          @unique
  organization          Organization @relation(fields: [organizationId], references: [id])
  channelUuid           String?      // AES-256-CBC encrypted; null = inherit from system
  enabled               Boolean      @default(false)
  enforceChildCreds     Boolean      @default(false)
  systemServiceDisabled Boolean      @default(false)
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
}

model PropertyWLConfig {
  id          Int      @id @default(autoincrement())
  propertyId  Int      @unique
  property    Property @relation(fields: [propertyId], references: [propertyId])
  channelUuid String?  // AES-256-CBC encrypted; null = inherit from org/system
  enabled     Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

- [ ] **Step 3: Create the migration SQL file**

Create `apps/api/prisma/migrations/20260516000000_add_wl_config.sql`:
```sql
CREATE TABLE "SystemWLConfig" (
  "id"                      SERIAL PRIMARY KEY,
  "channelUuid"             TEXT,
  "enabled"                 BOOLEAN NOT NULL DEFAULT false,
  "enforceChildCreds"       BOOLEAN NOT NULL DEFAULT false,
  "airportDataset"          JSONB,
  "airportDatasetUpdatedAt" TIMESTAMP(3),
  "airportRadiusKm"         INTEGER NOT NULL DEFAULT 100,
  "airportMaxCount"         INTEGER NOT NULL DEFAULT 3,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OrgWLConfig" (
  "id"                    SERIAL PRIMARY KEY,
  "organizationId"        INTEGER NOT NULL UNIQUE,
  "channelUuid"           TEXT,
  "enabled"               BOOLEAN NOT NULL DEFAULT false,
  "enforceChildCreds"     BOOLEAN NOT NULL DEFAULT false,
  "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PropertyWLConfig" (
  "id"          SERIAL PRIMARY KEY,
  "propertyId"  INTEGER NOT NULL UNIQUE,
  "channelUuid" TEXT,
  "enabled"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE
);
```

- [ ] **Step 4: Apply migration and regenerate client**

```bash
cd /home/nir/ibe
PGPASSWORD=ibe_pass psql -U ibe_user -d ibe_db -h localhost -f apps/api/prisma/migrations/20260516000000_add_wl_config.sql
pnpm --filter @ibe/api exec prisma generate
```

Expected: `✔ Generated Prisma Client` — no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260516000000_add_wl_config.sql
git commit -m "feat: add SystemWLConfig / OrgWLConfig / PropertyWLConfig Prisma models"
```

---

### Task 2: Shared types

**Files:**
- Create: `packages/shared/src/types/wl-config.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/src/types/wl-config.ts`**

```ts
export interface NearestAirport {
  code: string        // "LHR"
  name: string        // "London Heathrow Airport"
  distanceKm: number  // 12
}

export interface WLConfigResponse {
  channelUuidSet: boolean
  channelUuidMasked: string | null
  enabled: boolean
  enforceChildCreds: boolean
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
  airportRadiusKm: number            // system only; 0 for org/property
  airportMaxCount: number            // system only; 0 for org/property
  airportDatasetUpdatedAt: string | null  // system only
}

export interface WLConfigUpdate {
  channelUuid?: string
  enabled?: boolean
  enforceChildCreds?: boolean
  systemServiceDisabled?: boolean
  airportRadiusKm?: number
  airportMaxCount?: number
}

export interface ResolvedWLConfig {
  channelUuid: string | null
  enabled: boolean
  iataCode: string | null   // nearest airport code for WL URL
}

export interface NearestAirportsResponse {
  airports: NearestAirport[]
}
```

- [ ] **Step 2: Export from `packages/shared/src/index.ts`**

Add after the `amadeus-config` export line:
```ts
export * from './types/wl-config.js'
```

- [ ] **Step 3: Rebuild shared package**

```bash
cd /home/nir/ibe
pnpm --filter @ibe/shared build
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/wl-config.ts packages/shared/src/index.ts
git commit -m "feat: add WLConfig shared types (NearestAirport, WLConfigResponse, etc.)"
```

---

### Task 3: IATA dataset generator + iata-lookup utility

**Files:**
- Create: `apps/api/scripts/generate-iata-dataset.mts`
- Create: `apps/api/src/data/iata-cities.json` (generated)
- Create: `apps/api/src/utils/iata-lookup.ts`

- [ ] **Step 1: Create the dataset generator script**

Create `apps/api/scripts/generate-iata-dataset.mts`:
```ts
import { writeFileSync } from 'fs'
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
  if (seen.has(iata)) continue
  seen.add(iata)
  entries.push({ code: iata, name, lat, lng })
}

const out = resolve(__dirname, '../src/data/iata-cities.json')
writeFileSync(out, JSON.stringify(entries))
console.log(`Generated ${entries.length} entries → ${out}`)
```

- [ ] **Step 2: Run the generator**

```bash
cd /home/nir/ibe/apps/api
mkdir -p src/data
npx tsx scripts/generate-iata-dataset.mts
```

Expected: `Generated XXXX entries → .../src/data/iata-cities.json` (typically 6,000–7,000).

- [ ] **Step 3: Create `apps/api/src/utils/iata-lookup.ts`**

```ts
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { NearestAirport } from '@ibe/shared'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface AirportEntry { code: string; name: string; lat: number; lng: number }

function getBundledDataset(): AirportEntry[] {
  return JSON.parse(
    readFileSync(resolve(__dirname, '../data/iata-cities.json'), 'utf8')
  ) as AirportEntry[]
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
    const d = haversineKm(lat, lng, a.lat, a.lng)
    if (d <= maxKm) {
      results.push({ code: a.code, name: a.name, distanceKm: Math.round(d) })
    }
  }

  results.sort((a, b) => a.distanceKm - b.distanceKm)
  return results.slice(0, maxCount)
}
```

- [ ] **Step 4: Verify the lookup works**

```bash
cd /home/nir/ibe/apps/api
npx tsx -e "
import { findNearestAirports } from './src/utils/iata-lookup.js'
console.log('London 150km:', findNearestAirports(51.5074, -0.1278, 150, 3))
console.log('Paris 100km:', findNearestAirports(48.8566, 2.3522, 100, 3))
"
```

Expected: arrays with LHR/LGW/LCY for London, CDG/ORY for Paris, each with name and distanceKm.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/data/iata-cities.json apps/api/src/utils/iata-lookup.ts apps/api/scripts/generate-iata-dataset.mts
git commit -m "feat: IATA airport lookup utility (airports-extended.dat, findNearestAirports)"
```

---

### Task 4: WL config service

**Files:**
- Create: `apps/api/src/services/wl-config.service.ts`

- [ ] **Step 1: Create `apps/api/src/services/wl-config.service.ts`**

```ts
import { prisma } from '../db/client.js'
import { encryptApiKey, maskApiKey, decryptApiKey } from './ai-config.service.js'
import { findNearestAirports, type AirportEntry } from '../utils/iata-lookup.js'
import type { WLConfigResponse, WLConfigUpdate, ResolvedWLConfig, NearestAirportsResponse } from '@ibe/shared'

function systemRowToResponse(row: {
  channelUuid: string | null
  enabled: boolean
  enforceChildCreds: boolean
  airportRadiusKm: number
  airportMaxCount: number
  airportDatasetUpdatedAt: Date | null
} | null): WLConfigResponse {
  return {
    channelUuidSet: !!row?.channelUuid,
    channelUuidMasked: row?.channelUuid ? maskApiKey(row.channelUuid) : null,
    enabled: row?.enabled ?? false,
    enforceChildCreds: row?.enforceChildCreds ?? false,
    systemServiceDisabled: false,
    hasOwnConfig: !!row,
    airportRadiusKm: row?.airportRadiusKm ?? 100,
    airportMaxCount: row?.airportMaxCount ?? 3,
    airportDatasetUpdatedAt: row?.airportDatasetUpdatedAt?.toISOString() ?? null,
  }
}

function orgRowToResponse(row: {
  channelUuid: string | null
  enabled: boolean
  enforceChildCreds: boolean
  systemServiceDisabled: boolean
} | null, hasOwnConfig = false): WLConfigResponse {
  return {
    channelUuidSet: !!row?.channelUuid,
    channelUuidMasked: row?.channelUuid ? maskApiKey(row.channelUuid) : null,
    enabled: row?.enabled ?? false,
    enforceChildCreds: row?.enforceChildCreds ?? false,
    systemServiceDisabled: row?.systemServiceDisabled ?? false,
    hasOwnConfig,
    airportRadiusKm: 0,
    airportMaxCount: 0,
    airportDatasetUpdatedAt: null,
  }
}

function propRowToResponse(row: {
  channelUuid: string | null
  enabled: boolean
} | null, hasOwnConfig = false): WLConfigResponse {
  return {
    channelUuidSet: !!row?.channelUuid,
    channelUuidMasked: row?.channelUuid ? maskApiKey(row.channelUuid) : null,
    enabled: row?.enabled ?? false,
    enforceChildCreds: false,
    systemServiceDisabled: false,
    hasOwnConfig,
    airportRadiusKm: 0,
    airportMaxCount: 0,
    airportDatasetUpdatedAt: null,
  }
}

export async function getSystemWLConfig(): Promise<WLConfigResponse> {
  const row = await prisma.systemWLConfig.findFirst()
  return systemRowToResponse(row)
}

export async function upsertSystemWLConfig(data: WLConfigUpdate): Promise<WLConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.channelUuid !== undefined && data.channelUuid !== '') update.channelUuid = encryptApiKey(data.channelUuid)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.enforceChildCreds !== undefined) update.enforceChildCreds = data.enforceChildCreds
  if (data.airportRadiusKm !== undefined) update.airportRadiusKm = data.airportRadiusKm
  if (data.airportMaxCount !== undefined) update.airportMaxCount = data.airportMaxCount

  const existing = await prisma.systemWLConfig.findFirst()
  const row = existing
    ? await prisma.systemWLConfig.update({ where: { id: existing.id }, data: update })
    : await prisma.systemWLConfig.create({ data: { enabled: false, enforceChildCreds: false, ...update } })
  return systemRowToResponse(row)
}

export async function refreshAirportDataset(): Promise<{ count: number; updatedAt: string }> {
  const url = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports-extended.dat'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch airports: ${res.status}`)
  const text = await res.text()

  const entries: AirportEntry[] = []
  const seen = new Set<string>()

  for (const line of text.split('\n')) {
    const parts = line.split(',').map((p: string) => p.replace(/^"|"$/g, '').trim())
    const name = parts[1] ?? ''
    const iata = parts[4] ?? ''
    const lat = parseFloat(parts[6] ?? '')
    const lng = parseFloat(parts[7] ?? '')
    const type = parts[12] ?? ''
    if (type !== 'airport') continue
    if (!iata || iata === '\\N' || iata.length !== 3 || isNaN(lat) || isNaN(lng)) continue
    if (seen.has(iata)) continue
    seen.add(iata)
    entries.push({ code: iata, name, lat, lng })
  }

  const now = new Date()
  const existing = await prisma.systemWLConfig.findFirst()
  if (existing) {
    await prisma.systemWLConfig.update({
      where: { id: existing.id },
      data: { airportDataset: entries as unknown as never, airportDatasetUpdatedAt: now },
    })
  } else {
    await prisma.systemWLConfig.create({
      data: { airportDataset: entries as unknown as never, airportDatasetUpdatedAt: now },
    })
  }

  return { count: entries.length, updatedAt: now.toISOString() }
}

export async function getOrgWLConfig(orgId: number): Promise<WLConfigResponse> {
  const row = await prisma.orgWLConfig.findUnique({ where: { organizationId: orgId } })
  return orgRowToResponse(row, !!row)
}

export async function upsertOrgWLConfig(orgId: number, data: WLConfigUpdate): Promise<WLConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.channelUuid !== undefined && data.channelUuid !== '') update.channelUuid = encryptApiKey(data.channelUuid)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.enforceChildCreds !== undefined) update.enforceChildCreds = data.enforceChildCreds
  if (data.systemServiceDisabled !== undefined) update.systemServiceDisabled = data.systemServiceDisabled

  const row = await prisma.orgWLConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  return orgRowToResponse(row, true)
}

export async function getPropertyWLConfig(propertyId: number): Promise<WLConfigResponse> {
  const row = await prisma.propertyWLConfig.findUnique({ where: { propertyId } })
  return propRowToResponse(row, !!row)
}

export async function upsertPropertyWLConfig(propertyId: number, data: WLConfigUpdate): Promise<WLConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.channelUuid !== undefined && data.channelUuid !== '') update.channelUuid = encryptApiKey(data.channelUuid)
  if (data.enabled !== undefined) update.enabled = data.enabled

  const row = await prisma.propertyWLConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...update },
    update,
  })
  return propRowToResponse(row, true)
}

async function getPropertyLatLng(propertyId: number): Promise<{ lat: number; lng: number } | null> {
  const prop = await prisma.property.findUnique({
    where: { propertyId },
    select: { latitude: true, longitude: true },
  })
  if (!prop?.latitude || !prop?.longitude) return null
  return { lat: prop.latitude, lng: prop.longitude }
}

async function getSystemDataset(): Promise<{ dataset: AirportEntry[] | undefined; radiusKm: number; maxCount: number }> {
  const sysRow = await prisma.systemWLConfig.findFirst({
    select: { airportDataset: true, airportRadiusKm: true, airportMaxCount: true },
  })
  const dataset = sysRow?.airportDataset ? (sysRow.airportDataset as unknown as AirportEntry[]) : undefined
  return {
    dataset,
    radiusKm: sysRow?.airportRadiusKm ?? 100,
    maxCount: sysRow?.airportMaxCount ?? 3,
  }
}

export async function getResolvedWLConfig(propertyId: number, fallbackOrgId?: number): Promise<ResolvedWLConfig> {
  const prop = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true, latitude: true, longitude: true },
  })
  const orgId = prop?.organizationId ?? fallbackOrgId

  const [sysRow, orgRow, propRow] = await Promise.all([
    prisma.systemWLConfig.findFirst(),
    orgId ? prisma.orgWLConfig.findUnique({ where: { organizationId: orgId } }) : null,
    prisma.propertyWLConfig.findUnique({ where: { propertyId } }),
  ])

  let channelUuid: string | null = null
  let enabled = false

  if (sysRow?.enforceChildCreds) {
    channelUuid = sysRow.channelUuid ? decryptApiKey(sysRow.channelUuid) : null
    enabled = sysRow.enabled
  } else if (!orgRow?.channelUuid && orgRow?.systemServiceDisabled) {
    return { channelUuid: null, enabled: false, iataCode: null }
  } else if (orgRow?.enforceChildCreds) {
    const uuid = orgRow.channelUuid ?? sysRow?.channelUuid ?? null
    channelUuid = uuid ? decryptApiKey(uuid) : null
    enabled = orgRow.enabled
  } else if (propRow?.channelUuid) {
    channelUuid = decryptApiKey(propRow.channelUuid)
    enabled = propRow.enabled
  } else {
    const uuid = orgRow?.channelUuid ?? sysRow?.channelUuid ?? null
    channelUuid = uuid ? decryptApiKey(uuid) : null
    enabled = orgRow?.enabled ?? sysRow?.enabled ?? false
  }

  let iataCode: string | null = null
  if (channelUuid && enabled && prop?.latitude && prop?.longitude) {
    const { dataset, radiusKm, maxCount } = await getSystemDataset()
    const nearest = findNearestAirports(prop.latitude, prop.longitude, radiusKm, maxCount, dataset)
    iataCode = nearest[0]?.code ?? null
  }

  return { channelUuid, enabled, iataCode }
}

export async function getNearestAirports(propertyId: number): Promise<NearestAirportsResponse> {
  const coords = await getPropertyLatLng(propertyId)
  if (!coords) return { airports: [] }

  const { dataset, radiusKm, maxCount } = await getSystemDataset()
  const airports = findNearestAirports(coords.lat, coords.lng, radiusKm, maxCount, dataset)
  return { airports }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/nir/ibe/apps/api
pnpm exec tsc --noEmit
```

Expected: no errors related to `wl-config.service.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/wl-config.service.ts
git commit -m "feat: WL config service (inheritance resolution, airport refresh, nearest lookup)"
```

---

### Task 5: Routes + app.ts + api-client

**Files:**
- Create: `apps/api/src/routes/wl-config.route.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Create `apps/api/src/routes/wl-config.route.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import {
  getSystemWLConfig, upsertSystemWLConfig, refreshAirportDataset,
  getOrgWLConfig, upsertOrgWLConfig,
  getPropertyWLConfig, upsertPropertyWLConfig,
  getResolvedWLConfig, getNearestAirports,
} from '../services/wl-config.service.js'

export async function wlAdminRoutes(fastify: FastifyInstance) {
  // ── System ────────────────────────────────────────────────────────────────
  fastify.get('/admin/wl/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemWLConfig())
  })

  fastify.put('/admin/wl/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await upsertSystemWLConfig(request.body as Record<string, unknown>))
  })

  fastify.post('/admin/wl/config/system/refresh-airports', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    try {
      const result = await refreshAirportDataset()
      return reply.send(result)
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send({ error: 'Failed to refresh airport dataset' })
    }
  })

  // ── Org ───────────────────────────────────────────────────────────────────
  fastify.get('/admin/wl/config', async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? parseInt(rawOrgId, 10) : null)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await getOrgWLConfig(orgId))
  })

  fastify.put('/admin/wl/config', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const orgId = request.admin.role === 'super'
      ? ((body.orgId as number | undefined) ?? request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    if (body.enforceChildCreds !== undefined && request.admin.role !== 'super')
      return reply.status(403).send({ error: 'Only super admins can set enforceChildCreds' })
    if (body.systemServiceDisabled !== undefined && request.admin.role !== 'super')
      return reply.status(403).send({ error: 'Only super admins can set systemServiceDisabled' })
    return reply.send(await upsertOrgWLConfig(orgId, body))
  })

  // ── Property ──────────────────────────────────────────────────────────────
  fastify.get('/admin/wl/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string>).propertyId, 10)
    return reply.send(await getPropertyWLConfig(propertyId))
  })

  fastify.put('/admin/wl/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string>).propertyId, 10)
    return reply.send(await upsertPropertyWLConfig(propertyId, request.body as Record<string, unknown>))
  })
}

export async function wlPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/wl/config', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const fallbackOrgId = qs.orgId ? parseInt(qs.orgId, 10) : undefined
    return reply.send(await getResolvedWLConfig(propertyId, fallbackOrgId))
  })

  fastify.get('/airports/nearest', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    return reply.send(await getNearestAirports(propertyId))
  })
}
```

- [ ] **Step 2: Register routes in `apps/api/src/app.ts`**

Add the import near the other config route imports:
```ts
import { wlAdminRoutes, wlPublicRoutes } from './routes/wl-config.route.js'
```

Register the public routes (near the `amadeusPublicRoutes` registration):
```ts
  await app.register(wlPublicRoutes, { prefix: '/api/v1' })
```

Register the admin routes (near the `amadeusConfigRoutes` registration):
```ts
    await adminApp.register(wlAdminRoutes, { prefix: '/api/v1' })
```

- [ ] **Step 3: Add api-client methods to `apps/web/src/lib/api-client.ts`**

Add import near the other shared type imports:
```ts
import type { WLConfigResponse, WLConfigUpdate, ResolvedWLConfig, NearestAirportsResponse } from '@ibe/shared'
```

Add after the `testAmadeusConnection` method:
```ts
  // ── Amadeus WL ───────────────────────────────────────────────────────────

  getSystemWLConfig(): Promise<WLConfigResponse> {
    return apiRequest('/api/v1/admin/wl/config/system')
  },

  updateSystemWLConfig(data: WLConfigUpdate): Promise<WLConfigResponse> {
    return apiRequest('/api/v1/admin/wl/config/system', { method: 'PUT', body: JSON.stringify(data) })
  },

  refreshAirportDataset(): Promise<{ count: number; updatedAt: string }> {
    return apiRequest('/api/v1/admin/wl/config/system/refresh-airports', { method: 'POST' })
  },

  getOrgWLConfig(orgId?: number): Promise<WLConfigResponse> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/wl/config${qs}`)
  },

  updateOrgWLConfig(data: WLConfigUpdate, orgId?: number): Promise<WLConfigResponse> {
    const body = orgId ? { ...data, orgId } : data
    return apiRequest('/api/v1/admin/wl/config', { method: 'PUT', body: JSON.stringify(body) })
  },

  getPropertyWLConfig(propertyId: number): Promise<WLConfigResponse> {
    return apiRequest(`/api/v1/admin/wl/config/property/${propertyId}`)
  },

  updatePropertyWLConfig(propertyId: number, data: WLConfigUpdate): Promise<WLConfigResponse> {
    return apiRequest(`/api/v1/admin/wl/config/property/${propertyId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  getResolvedWLConfig(propertyId: number, orgId?: number): Promise<ResolvedWLConfig> {
    const qs = new URLSearchParams({ propertyId: String(propertyId) })
    if (orgId) qs.set('orgId', String(orgId))
    return apiRequest(`/api/v1/wl/config?${qs}`)
  },

  getNearestAirports(propertyId: number): Promise<NearestAirportsResponse> {
    return apiRequest(`/api/v1/airports/nearest?propertyId=${propertyId}`)
  },
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/nir/ibe
pnpm --filter @ibe/api exec tsc --noEmit
pnpm --filter @ibe/web exec tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/wl-config.route.ts apps/api/src/app.ts apps/web/src/lib/api-client.ts
git commit -m "feat: WL config routes (admin + public airports) and api-client methods"
```

---

### Task 6: Admin UI card

**Files:**
- Create: `apps/web/src/app/admin/config/events/amadeus-wl-card.tsx`
- Modify: `apps/web/src/app/admin/config/events/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/admin/config/events/amadeus-wl-card.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { WLConfigResponse, WLConfigUpdate } from '@ibe/shared'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => !disabled && onChange(!checked)}
      className={['relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
      <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
        checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function WLConfigForm({
  data,
  onSave,
  saving,
  isSystem,
  isSuper,
}: {
  data: WLConfigResponse
  onSave: (u: WLConfigUpdate) => void
  saving: boolean
  isSystem?: boolean
  isSuper?: boolean
}) {
  const [channelUuid, setChannelUuid] = useState('')
  const [enabled, setEnabled] = useState(data.enabled)
  const [enforceChildCreds, setEnforceChildCreds] = useState(data.enforceChildCreds)
  const [radiusKm, setRadiusKm] = useState(data.airportRadiusKm || 100)
  const [maxCount, setMaxCount] = useState(data.airportMaxCount || 3)

  useEffect(() => {
    setEnabled(data.enabled)
    setEnforceChildCreds(data.enforceChildCreds)
    if (isSystem) {
      setRadiusKm(data.airportRadiusKm || 100)
      setMaxCount(data.airportMaxCount || 3)
    }
  }, [data, isSystem])

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'

  function buildUpdate(): WLConfigUpdate {
    const u: WLConfigUpdate = { enabled }
    if (channelUuid) u.channelUuid = channelUuid
    if (isSuper) u.enforceChildCreds = enforceChildCreds
    if (isSystem) {
      u.airportRadiusKm = radiusKm
      u.airportMaxCount = maxCount
    }
    return u
  }

  return (
    <div className="space-y-5">
      {!data.hasOwnConfig && !isSystem && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <p className="text-sm text-[var(--color-text-muted)]">Using inherited Channel UUID from parent level.</p>
        </div>
      )}

      {data.channelUuidSet && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Current: <span className="font-mono">{data.channelUuidMasked}</span> — leave blank to keep.
        </p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Channel UUID</label>
        <input
          type="text"
          value={channelUuid}
          onChange={e => setChannelUuid(e.target.value)}
          placeholder={data.channelUuidSet ? 'Enter new UUID to replace…' : 'Paste Channel UUID from Amadeus Discover…'}
          className={inputCls}
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Provided by Amadeus Discover during onboarding. Leave blank to keep existing.
        </p>
      </div>

      {isSuper && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <Toggle checked={enforceChildCreds} onChange={setEnforceChildCreds} />
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Lock UUID for levels below</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isSystem
                ? 'All chains and hotels will use the system UUID.'
                : 'Hotels in this chain cannot use their own UUID.'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Toggle checked={enabled} onChange={setEnabled} />
        <span className="text-sm text-[var(--color-text)]">
          {enabled ? 'Amadeus WL enabled' : 'Amadeus WL disabled'}
        </span>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(buildUpdate())}
          className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function AirportDatasetSection({ data, updatedAt }: { data: WLConfigResponse; updatedAt: string | null }) {
  const qc = useQueryClient()
  const refreshMutation = useMutation({
    mutationFn: () => apiClient.refreshAirportDataset(),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wl-config-system'] }) },
  })

  const [radius, setRadius] = useState(data.airportRadiusKm || 100)
  const [count, setCount] = useState(data.airportMaxCount || 3)

  useEffect(() => {
    setRadius(data.airportRadiusKm || 100)
    setCount(data.airportMaxCount || 3)
  }, [data])

  return (
    <div className="mt-6 border-t border-[var(--color-border)] pt-5 space-y-4">
      <div>
        <p className="text-sm font-medium text-[var(--color-text)] mb-1">Airport Dataset</p>
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          {updatedAt
            ? `Last refreshed: ${new Date(updatedAt).toLocaleString()}`
            : 'Using bundled dataset (never refreshed from OpenFlights).'}
        </p>
        <button
          type="button"
          disabled={refreshMutation.isPending}
          onClick={() => refreshMutation.mutate()}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40"
        >
          {refreshMutation.isPending ? 'Refreshing…' : 'Refresh Dataset'}
        </button>
        {refreshMutation.isSuccess && (
          <p className="mt-2 text-xs text-[var(--color-success)]">
            Dataset refreshed — {(refreshMutation.data as { count: number }).count} airports loaded.
          </p>
        )}
        {refreshMutation.isError && (
          <p className="mt-2 text-xs text-[var(--color-error)]">Refresh failed.</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
          Search radius: <span className="font-normal">{radius} km</span>
        </label>
        <input
          type="range" min={1} max={300} value={radius}
          onChange={e => setRadius(Number(e.target.value))}
          className="w-full accent-[var(--color-primary)]"
        />
        <p className="text-xs text-[var(--color-text-muted)]">Show airports within this distance. Default: 100 km.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
          Max airports shown: <span className="font-normal">{count}</span>
        </label>
        <input
          type="range" min={1} max={5} value={count}
          onChange={e => setCount(Number(e.target.value))}
          className="w-full accent-[var(--color-primary)]"
        />
        <p className="text-xs text-[var(--color-text-muted)]">Maximum airports to display per property. Default: 3.</p>
      </div>
    </div>
  )
}

function SystemWLSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wl-config-system'],
    queryFn: () => apiClient.getSystemWLConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (u: WLConfigUpdate) => apiClient.updateSystemWLConfig(u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wl-config-system'] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <p className="mb-5 text-sm text-[var(--color-text-muted)]">
        System-level Amadeus WL Channel UUID. Used as fallback for all chains without their own.
      </p>
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load.</p>}
      {data && (
        <>
          <WLConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending} isSystem isSuper />
          <AirportDatasetSection data={data} updatedAt={data.airportDatasetUpdatedAt} />
        </>
      )}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

export function OrgWLCard({ orgId, isSuper }: { orgId: number; isSuper?: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wl-config-org', orgId],
    queryFn: () => apiClient.getOrgWLConfig(orgId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: WLConfigUpdate) => apiClient.updateOrgWLConfig(u, orgId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wl-config-org', orgId] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load.</p>}
      {data && (
        <WLConfigForm
          data={data}
          onSave={u => saveMutation.mutate(u)}
          saving={saveMutation.isPending}
          {...(isSuper !== undefined && { isSuper })}
        />
      )}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

export default function AmadeusWLCard({ isSystemLevel, orgId, isSuper }: {
  isSystemLevel: boolean
  orgId?: number
  isSuper?: boolean
}) {
  if (isSystemLevel) return <SystemWLSection />
  if (!orgId) return null
  return <OrgWLCard orgId={orgId} {...(isSuper !== undefined && { isSuper })} />
}
```

- [ ] **Step 2: Add WL card to `apps/web/src/app/admin/config/events/page.tsx`**

Add import:
```ts
import AmadeusWLCard from './amadeus-wl-card'
```

After the closing `</div>` of the "Amadeus Discover" card section (the last card in the file), add:
```tsx
      {/* Amadeus WL */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Amadeus WL (Activities Booking)</h2>
        <AmadeusWLCard
          isSystemLevel={isSystemLevel}
          {...(orgId !== undefined && { orgId })}
          {...(isSuper !== undefined && { isSuper })}
        />
      </div>
```

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:3000/admin/config/events`. A third card "Amadeus WL (Activities Booking)" should appear below "Amadeus Discover". Enter a UUID, enable, save. The dataset section shows last-refresh timestamp and sliders. No console errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/config/events/amadeus-wl-card.tsx apps/web/src/app/admin/config/events/page.tsx
git commit -m "feat: Amadeus WL admin card with airport dataset refresh + radius/count sliders"
```

---

### Task 7: NearestAirports guest component + placements

**Files:**
- Create: `apps/web/src/components/hotel/NearestAirports.tsx`
- Modify: `apps/web/src/app/(main)/search/_content.tsx`
- Modify: `apps/web/src/components/home/PropertyDetailModal.tsx`

- [ ] **Step 1: Create `apps/web/src/components/hotel/NearestAirports.tsx`**

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useT } from '@/context/translations'

interface Props {
  propertyId: number
}

export function NearestAirports({ propertyId }: Props) {
  const t = useT('search')
  const { data } = useQuery({
    queryKey: ['nearest-airports', propertyId],
    queryFn: () => apiClient.getNearestAirports(propertyId),
    enabled: propertyId > 0,
  })

  const airports = data?.airports ?? []
  if (airports.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
      <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
      </svg>
      <span className="font-medium">{t('nearestAirports')}:</span>
      {airports.map((a, i) => (
        <span key={a.code} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[var(--color-border)]">·</span>}
          <span className="font-semibold text-[var(--color-text)]">{a.code}</span>
          <span>{a.name}</span>
          <span className="text-[var(--color-text-muted)]">{a.distanceKm} km</span>
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add NearestAirports to the search page**

In `apps/web/src/app/(main)/search/_content.tsx`, add import near the other component imports:
```ts
import { NearestAirports } from '@/components/hotel/NearestAirports'
```

After the closing `})()}` of the PropertyHeader block (around line 179), before the PriceComparisonBar block, add:
```tsx
      {searchParams.hotelId > 0 && (
        <NearestAirports propertyId={searchParams.hotelId} />
      )}
```

- [ ] **Step 3: Add NearestAirports to the PropertyDetailModal**

In `apps/web/src/components/home/PropertyDetailModal.tsx`, add import:
```ts
import { NearestAirports } from '@/components/hotel/NearestAirports'
```

After the `{(city || address) && (...)}` paragraph block (around line 101), inside the header `<div>`, add:
```tsx
            <NearestAirports propertyId={id} />
```

The full header div becomes:
```tsx
          {/* Header */}
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-lg font-bold text-[var(--color-text)]">{name}</h2>
              {starRating > 0 && <StarRating rating={starRating} />}
            </div>
            {(city || address) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {[city, address].filter(Boolean).join(', ')}
              </p>
            )}
            <div className="mt-1.5">
              <NearestAirports propertyId={id} />
            </div>
          </div>
```

- [ ] **Step 4: Verify in browser**

1. Open the search page for a property with known coordinates (e.g., London hotel). Below the hero image, before the room list, a row like `✈ Nearest airports: LHR London Heathrow Airport 22 km · LGW Gatwick Airport 45 km` should appear.
2. Open the hotel info modal from the property list — same chip row should appear below the hotel name/address.
3. A property with no airports within the configured radius (or no coordinates) shows nothing — no error.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/hotel/NearestAirports.tsx \
  "apps/web/src/app/(main)/search/_content.tsx" \
  apps/web/src/components/home/PropertyDetailModal.tsx
git commit -m "feat: NearestAirports guest component on search page and property modal"
```

---

### Task 8: Translation keys + AmadeusWLButton + WL CTA placements

**Files:**
- Modify: `apps/api/src/translations/en.json`
- Create: `apps/web/src/components/amadeus/AmadeusWLButton.tsx`
- Modify: `apps/web/src/app/(main)/search/_content.tsx`
- Modify: `apps/web/src/app/(main)/booking/cross-sell/[bookingId]/page.tsx`

- [ ] **Step 1: Add translation keys to `en.json`**

In the `"search"` block add:
```json
"exploreActivities": "Explore Activities & Tours →",
"nearestAirports": "Nearest airports"
```

In the `"crossSell"` block add:
```json
"exploreActivities": "Explore Activities & Tours →"
```

Verify JSON is valid:
```bash
node -e "JSON.parse(require('fs').readFileSync('/home/nir/ibe/apps/api/src/translations/en.json','utf8')); console.log('valid')"
```

- [ ] **Step 2: Create `apps/web/src/components/amadeus/AmadeusWLButton.tsx`**

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useLocale } from '@/context/translations'

const WL_BASE = 'https://experiences.amadeus-discover.com'
const WL_LANGS = new Set(['en', 'fr', 'es', 'de', 'it', 'pl'])
const WL_CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'NZD', 'AUD', 'AED', 'CHF', 'CNY', 'CAD'])

interface Props {
  propertyId: number
  orgId?: number
  currency?: string
  label: string
}

export function AmadeusWLButton({ propertyId, orgId, currency, label }: Props) {
  const locale = useLocale()

  const { data } = useQuery({
    queryKey: ['wl-config', propertyId],
    queryFn: () => apiClient.getResolvedWLConfig(propertyId, orgId),
    enabled: propertyId > 0,
  })

  if (!data?.enabled || !data.channelUuid) return null

  const lang = WL_LANGS.has(locale) ? locale : 'en'
  const qs = new URLSearchParams({ lang })
  if (currency && WL_CURRENCIES.has(currency)) qs.set('currency', currency)
  if (data.iataCode) qs.set('iataCode', data.iataCode)

  const url = `${WL_BASE}/${data.channelUuid}?${qs}`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors"
    >
      {label}
    </a>
  )
}
```

- [ ] **Step 3: Add WL button to search page**

In `apps/web/src/app/(main)/search/_content.tsx`, add import:
```ts
import { AmadeusWLButton } from '@/components/amadeus/AmadeusWLButton'
```

After the `<EventsStrip ... />` block (around line 217), add:
```tsx
      {searchParams.hotelId > 0 && (
        <AmadeusWLButton
          propertyId={searchParams.hotelId}
          {...(orgId != null ? { orgId } : {})}
          currency={displayCurrency}
          label={t('exploreActivities')}
        />
      )}
```

- [ ] **Step 4: Add WL button to cross-sell page**

In `apps/web/src/app/(main)/booking/cross-sell/[bookingId]/page.tsx`, add import:
```ts
import { AmadeusWLButton } from '@/components/amadeus/AmadeusWLButton'
```

After the closing `</section>` of the Amadeus activities section (after `amActivities` grid), add:
```tsx
      {/* Amadeus WL CTA */}
      {propertyId > 0 && (
        <div className="mb-8">
          <AmadeusWLButton
            propertyId={propertyId}
            label={t('exploreActivities')}
          />
        </div>
      )}
```

- [ ] **Step 5: Verify in browser**

1. Configure WL in admin: enter a test Channel UUID, enable, save.
2. Open search page — "Explore Activities & Tours →" link appears below the events strip, above the room list.
3. Click it — opens `https://experiences.amadeus-discover.com/{uuid}?lang=en&iataCode=LHR` in new tab.
4. Open cross-sell page — button appears below the Activities & Tours section.
5. When WL is disabled or UUID unset, button is absent on both pages.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/translations/en.json \
  apps/web/src/components/amadeus/AmadeusWLButton.tsx \
  "apps/web/src/app/(main)/search/_content.tsx" \
  "apps/web/src/app/(main)/booking/cross-sell/[bookingId]/page.tsx"
git commit -m "feat: Amadeus WL CTA button on search and cross-sell pages"
```
