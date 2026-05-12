# Amadeus Discover Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Amadeus Discover as a second activities provider alongside Ticketmaster, with full System→Org→Property inheritance, admin config UI, guest strip rendering (merged/separate), and AI tool extension.

**Architecture:** Parallel provider pattern — Amadeus runs independently from Ticketmaster. A new combined public endpoint `/activities-and-events` fetches from both in parallel and returns them together. The guest `EventsStrip` renders based on the admin-configured `stripMode` (`merged` or `separate`). Credentials are encrypted in DB and resolved via a strict inheritance chain with enforcement flags.

**Tech Stack:** Fastify (API), Prisma + PostgreSQL (DB), Next.js 14 / React Query (Web), Redis (OAuth token cache via `cacheGet`/`cacheSet`), Vitest (tests)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/shared/src/types/amadeus-config.ts` | Create | Shared types for request/response |
| `packages/shared/src/index.ts` | Modify | Export new types |
| `apps/api/prisma/schema.prisma` | Modify | Add 3 new models + relations |
| `apps/api/src/services/amadeus-config.service.ts` | Create | CRUD, resolution, OAuth token |
| `apps/api/src/services/__tests__/amadeus-config.service.test.ts` | Create | Unit tests for inheritance resolution |
| `apps/api/src/routes/amadeus-config.route.ts` | Create | Admin CRUD routes |
| `apps/api/src/routes/amadeus-public.route.ts` | Create | Public `/amadeus/activities` + `/activities-and-events` |
| `apps/api/src/app.ts` | Modify | Register both new route files |
| `apps/web/src/lib/api-client.ts` | Modify | Add Amadeus config API methods |
| `apps/web/src/app/admin/config/events/amadeus-card.tsx` | Create | Amadeus admin config card component |
| `apps/web/src/app/admin/config/events/page.tsx` | Modify | Add Amadeus card, update title/description |
| `apps/web/src/components/weather/EventsStrip.tsx` | Modify | Combined endpoint, merged/separate, activity cards |
| `apps/api/src/ai/tools/events.ts` | Modify | Extend to merge Amadeus activities |

---

## Task 1: Shared types

**Files:**
- Create: `packages/shared/src/types/amadeus-config.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the shared types file**

```typescript
// packages/shared/src/types/amadeus-config.ts

export interface AmadeusConfigResponse {
  credentialsSet: boolean
  clientIdMasked: string | null      // first 8 chars + "…" — clientSecret never returned
  credentialsLocked: boolean          // parent level enforces its own credentials
  enabled: boolean
  enforceChildCreds: boolean          // this level locks credentials for levels below
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
  tokenUrl: string                    // system level only; empty string at org/property level
  activitiesUrl: string               // system level only; empty string at org/property level
  radiusKm: number
  maxActivities: number
  stripLabel: string
  stripMode: 'merged' | 'separate'
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}

export interface AmadeusConfigUpdate {
  clientId?: string
  clientSecret?: string
  enabled?: boolean
  enforceChildCreds?: boolean
  systemServiceDisabled?: boolean
  tokenUrl?: string                   // system level only
  activitiesUrl?: string              // system level only
  radiusKm?: number
  maxActivities?: number
  stripLabel?: string
  stripMode?: 'merged' | 'separate'
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
  // property-level nullable overrides (null = reset to inherited)
  radiusKmOverride?: number | null
  maxActivitiesOverride?: number | null
  stripLabelOverride?: string | null
  stripModeOverride?: string | null
}

export interface AmadeusActivity {
  id: string
  name: string
  description: string | null
  category: string | null
  thumb: string | null
  price: number | null
  currency: string | null
  duration: string | null
  bookable: boolean
  bookingUrl: string | null
}

export interface AmadeusPublicResponse {
  enabled: boolean
  radiusKm?: number
  activities?: AmadeusActivity[]
  stripLabel?: string
  stripMode?: 'merged' | 'separate'
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
}

export interface ActivitiesAndEventsResponse {
  ticketmaster: {
    enabled: boolean
    events?: Array<{
      name: string
      date: string | null
      time: string | null
      category: string | null
      genre: string | null
      venue: string | null
      city: string | null
      ticketUrl: string | null
      thumb: string | null
    }>
    stripDefaultFolded?: boolean
    stripAutoFoldSecs?: number
  }
  amadeus: AmadeusPublicResponse
}
```

- [ ] **Step 2: Export from shared package index**

In `packages/shared/src/index.ts`, add after the existing events-config export:

```typescript
export * from './types/amadeus-config.js'
```

- [ ] **Step 3: Build shared package to verify types compile**

```bash
cd packages/shared && npm run build
```
Expected: exits 0 with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/amadeus-config.ts packages/shared/src/index.ts
git commit -m "feat: add Amadeus Discover shared types"
```

---

## Task 2: DB Schema + Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add `orgAmadeusConfig` relation to the Organization model**

In `schema.prisma`, find the `model Organization {` block. After the existing `orgEventsConfig OrgEventsConfig?` line, add:

```prisma
  orgAmadeusConfig            OrgAmadeusConfig?
```

- [ ] **Step 2: Add `propertyAmadeusConfig` relation to the Property model**

In `schema.prisma`, find `model Property {`. After the existing `propertyDataProviderConfig PropertyDataProviderConfig?` line, add:

```prisma
  propertyAmadeusConfig       PropertyAmadeusConfig?
```

- [ ] **Step 3: Add the three new models**

At the end of `schema.prisma`, after the `model CrossSellConfig` block (around line 1239), add:

```prisma
// ── Amadeus Discover ─────────────────────────────────────────────────────────

model SystemAmadeusConfig {
  id                  Int      @id @default(autoincrement())
  clientId            String?  // AES-256-CBC encrypted
  clientSecret        String?  // AES-256-CBC encrypted
  enabled             Boolean  @default(false)
  enforceSystemCreds  Boolean  @default(false)
  tokenUrl            String   @default("")
  activitiesUrl       String   @default("")
  radiusKm            Int      @default(10)
  maxActivities       Int      @default(10)
  stripLabel          String   @default("Activities & Tours")
  stripMode           String   @default("separate")
  stripDefaultFolded  Boolean  @default(false)
  stripAutoFoldSecs   Int      @default(15)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model OrgAmadeusConfig {
  id                    Int          @id @default(autoincrement())
  organizationId        Int          @unique
  organization          Organization @relation(fields: [organizationId], references: [id])
  clientId              String?      // AES-256-CBC encrypted; null = use system
  clientSecret          String?      // AES-256-CBC encrypted
  enabled               Boolean      @default(false)
  enforceOrgCreds       Boolean      @default(false)
  systemServiceDisabled Boolean      @default(false)
  radiusKm              Int          @default(10)
  maxActivities         Int          @default(10)
  stripLabel            String       @default("Activities & Tours")
  stripMode             String       @default("separate")
  stripDefaultFolded    Boolean      @default(false)
  stripAutoFoldSecs     Int          @default(15)
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
}

model PropertyAmadeusConfig {
  id                    Int      @id @default(autoincrement())
  propertyId            Int      @unique
  property              Property @relation(fields: [propertyId], references: [propertyId])
  clientId              String?  // AES-256-CBC encrypted; null = use org/system
  clientSecret          String?  // AES-256-CBC encrypted
  enabled               Boolean  @default(false)
  systemServiceDisabled Boolean  @default(false)
  radiusKm              Int?
  maxActivities         Int?
  stripLabel            String?
  stripMode             String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

- [ ] **Step 4: Run migration**

```bash
cd apps/api && npx prisma migrate dev --name add_amadeus_config
```
Expected: migration file created, DB updated, `prisma generate` runs automatically.

- [ ] **Step 5: Verify Prisma client regenerated**

```bash
cd apps/api && npx prisma generate
```
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add Amadeus Discover DB schema (3 new models)"
```

---

## Task 3: Amadeus Service — CRUD + Resolution

**Files:**
- Create: `apps/api/src/services/amadeus-config.service.ts`

- [ ] **Step 1: Write the failing test for system CRUD**

Create `apps/api/src/services/__tests__/amadeus-config.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemAmadeusConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    orgAmadeusConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyAmadeusConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    property: { findUnique: vi.fn() },
  },
}))

vi.mock('../../utils/cache.js', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../ai-config.service.js', () => ({
  encryptApiKey: vi.fn((k: string) => `enc:${k}`),
  decryptApiKey: vi.fn((k: string) => k.replace('enc:', '')),
  maskApiKey: vi.fn((k: string) => k.slice(0, 4) + '****'),
}))

import { prisma } from '../../db/client.js'
import {
  getResolvedAmadeusConfig,
} from '../amadeus-config.service.js'

const mp = prisma as any
beforeEach(() => { vi.clearAllMocks() })

describe('getResolvedAmadeusConfig — system disabled', () => {
  it('returns null when system has enabled=false', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.orgAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: false, enforceSystemCreds: false,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    expect(await getResolvedAmadeusConfig(42)).toBeNull()
  })
})

describe('getResolvedAmadeusConfig — org disabled', () => {
  it('returns null when org has enabled=false', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.orgAmadeusConfig.findUnique.mockResolvedValue({
      enabled: false, systemServiceDisabled: false, enforceOrgCreds: false,
      clientId: null, clientSecret: null,
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: true, enforceSystemCreds: false,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    expect(await getResolvedAmadeusConfig(42)).toBeNull()
  })
})

describe('getResolvedAmadeusConfig — credential resolution', () => {
  it('uses system creds when org has none', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.orgAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false, enforceOrgCreds: false,
      clientId: null, clientSecret: null,
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: true, enforceSystemCreds: false,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    const result = await getResolvedAmadeusConfig(42)
    expect(result?.clientId).toBe('sys-id')
    expect(result?.clientSecret).toBe('sys-secret')
  })

  it('uses org creds when org has own credentials', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.orgAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false, enforceOrgCreds: false,
      clientId: 'enc:org-id', clientSecret: 'enc:org-secret',
      radiusKm: 20, maxActivities: 5, stripLabel: 'Our Tours',
      stripMode: 'merged', stripDefaultFolded: true, stripAutoFoldSecs: 30,
    })
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: true, enforceSystemCreds: false,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    const result = await getResolvedAmadeusConfig(42)
    expect(result?.clientId).toBe('org-id')
    expect(result?.clientSecret).toBe('org-secret')
  })

  it('enforceSystemCreds forces system creds even when org has own', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.orgAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false, enforceOrgCreds: false,
      clientId: 'enc:org-id', clientSecret: 'enc:org-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: true, enforceSystemCreds: true,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    const result = await getResolvedAmadeusConfig(42)
    expect(result?.clientId).toBe('sys-id')
  })

  it('property overrides radiusKm when set', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false,
      clientId: null, clientSecret: null,
      radiusKm: 5, maxActivities: null, stripLabel: null, stripMode: null,
    })
    mp.orgAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false, enforceOrgCreds: false,
      clientId: 'enc:org-id', clientSecret: 'enc:org-secret',
      radiusKm: 20, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: true, enforceSystemCreds: false,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    const result = await getResolvedAmadeusConfig(42)
    expect(result?.radiusKm).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/__tests__/amadeus-config.service.test.ts
```
Expected: FAIL — `amadeus-config.service.js` not found.

- [ ] **Step 3: Create the service**

Create `apps/api/src/services/amadeus-config.service.ts`:

```typescript
import crypto from 'node:crypto'
import { prisma } from '../db/client.js'
import { encryptApiKey, maskApiKey, decryptApiKey } from './ai-config.service.js'
import { cacheGet, cacheSet } from '../utils/cache.js'
import type { AmadeusConfigResponse, AmadeusConfigUpdate } from '@ibe/shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskClientId(encrypted: string | null): string | null {
  if (!encrypted) return null
  const plain = decryptApiKey(encrypted)
  return plain.length <= 8 ? plain + '…' : plain.slice(0, 8) + '…'
}

// ── System level ──────────────────────────────────────────────────────────────

export async function getSystemAmadeusConfig(): Promise<AmadeusConfigResponse> {
  const row = await prisma.systemAmadeusConfig.findFirst()
  return {
    credentialsSet: !!(row?.clientId && row?.clientSecret),
    clientIdMasked: maskClientId(row?.clientId ?? null),
    credentialsLocked: false,
    enabled: row?.enabled ?? false,
    enforceChildCreds: row?.enforceSystemCreds ?? false,
    systemServiceDisabled: false,
    hasOwnConfig: !!row,
    tokenUrl: row?.tokenUrl ?? '',
    activitiesUrl: row?.activitiesUrl ?? '',
    radiusKm: row?.radiusKm ?? 10,
    maxActivities: row?.maxActivities ?? 10,
    stripLabel: row?.stripLabel ?? 'Activities & Tours',
    stripMode: (row?.stripMode ?? 'separate') as 'merged' | 'separate',
    stripDefaultFolded: row?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: row?.stripAutoFoldSecs ?? 15,
  }
}

export async function upsertSystemAmadeusConfig(data: AmadeusConfigUpdate): Promise<AmadeusConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.clientId) update.clientId = encryptApiKey(data.clientId)
  if (data.clientSecret) update.clientSecret = encryptApiKey(data.clientSecret)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.enforceChildCreds !== undefined) update.enforceSystemCreds = data.enforceChildCreds
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxActivities !== undefined) update.maxActivities = data.maxActivities
  if (data.stripLabel !== undefined) update.stripLabel = data.stripLabel
  if (data.stripMode !== undefined) update.stripMode = data.stripMode
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs
  if (data.tokenUrl !== undefined) update.tokenUrl = data.tokenUrl
  if (data.activitiesUrl !== undefined) update.activitiesUrl = data.activitiesUrl

  const existing = await prisma.systemAmadeusConfig.findFirst()
  if (existing) {
    await prisma.systemAmadeusConfig.update({ where: { id: existing.id }, data: update })
  } else {
    await prisma.systemAmadeusConfig.create({ data: { ...update } as Parameters<typeof prisma.systemAmadeusConfig.create>[0]['data'] })
  }
  return getSystemAmadeusConfig()
}

// ── Org level ─────────────────────────────────────────────────────────────────

export async function getOrgAmadeusConfig(orgId: number): Promise<AmadeusConfigResponse> {
  const [row, sysRow] = await Promise.all([
    prisma.orgAmadeusConfig.findUnique({ where: { organizationId: orgId } }),
    prisma.systemAmadeusConfig.findFirst(),
  ])
  return {
    credentialsSet: !!(row?.clientId && row?.clientSecret),
    clientIdMasked: maskClientId(row?.clientId ?? null),
    credentialsLocked: sysRow?.enforceSystemCreds ?? false,
    enabled: row?.enabled ?? false,
    enforceChildCreds: row?.enforceOrgCreds ?? false,
    systemServiceDisabled: row?.systemServiceDisabled ?? false,
    hasOwnConfig: !!row,
    tokenUrl: '',
    activitiesUrl: '',
    radiusKm: row?.radiusKm ?? sysRow?.radiusKm ?? 10,
    maxActivities: row?.maxActivities ?? sysRow?.maxActivities ?? 10,
    stripLabel: row?.stripLabel ?? sysRow?.stripLabel ?? 'Activities & Tours',
    stripMode: ((row?.stripMode ?? sysRow?.stripMode ?? 'separate')) as 'merged' | 'separate',
    stripDefaultFolded: row?.stripDefaultFolded ?? sysRow?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: row?.stripAutoFoldSecs ?? sysRow?.stripAutoFoldSecs ?? 15,
  }
}

export async function upsertOrgAmadeusConfig(orgId: number, data: AmadeusConfigUpdate): Promise<AmadeusConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.clientId) update.clientId = encryptApiKey(data.clientId)
  if (data.clientSecret) update.clientSecret = encryptApiKey(data.clientSecret)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.enforceChildCreds !== undefined) update.enforceOrgCreds = data.enforceChildCreds
  if (data.systemServiceDisabled !== undefined) update.systemServiceDisabled = data.systemServiceDisabled
  if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if (data.maxActivities !== undefined) update.maxActivities = data.maxActivities
  if (data.stripLabel !== undefined) update.stripLabel = data.stripLabel
  if (data.stripMode !== undefined) update.stripMode = data.stripMode
  if (data.stripDefaultFolded !== undefined) update.stripDefaultFolded = data.stripDefaultFolded
  if (data.stripAutoFoldSecs !== undefined) update.stripAutoFoldSecs = data.stripAutoFoldSecs

  await prisma.orgAmadeusConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...update },
    update,
  })
  return getOrgAmadeusConfig(orgId)
}

// ── Property level ────────────────────────────────────────────────────────────

export async function getPropertyAmadeusConfig(propertyId: number): Promise<AmadeusConfigResponse> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId
  const [row, orgRow, sysRow] = await Promise.all([
    prisma.propertyAmadeusConfig.findUnique({ where: { propertyId } }),
    orgId ? prisma.orgAmadeusConfig.findUnique({ where: { organizationId: orgId } }) : null,
    prisma.systemAmadeusConfig.findFirst(),
  ])
  const credLocked = (sysRow?.enforceSystemCreds ?? false) || (orgRow?.enforceOrgCreds ?? false)
  return {
    credentialsSet: !!(row?.clientId && row?.clientSecret),
    clientIdMasked: maskClientId(row?.clientId ?? null),
    credentialsLocked: credLocked,
    enabled: row?.enabled ?? false,
    enforceChildCreds: false,
    systemServiceDisabled: row?.systemServiceDisabled ?? false,
    hasOwnConfig: !!row,
    tokenUrl: '',
    activitiesUrl: '',
    radiusKm: row?.radiusKm ?? orgRow?.radiusKm ?? sysRow?.radiusKm ?? 10,
    maxActivities: row?.maxActivities ?? orgRow?.maxActivities ?? sysRow?.maxActivities ?? 10,
    stripLabel: row?.stripLabel ?? orgRow?.stripLabel ?? sysRow?.stripLabel ?? 'Activities & Tours',
    stripMode: ((row?.stripMode ?? orgRow?.stripMode ?? sysRow?.stripMode ?? 'separate')) as 'merged' | 'separate',
    stripDefaultFolded: orgRow?.stripDefaultFolded ?? sysRow?.stripDefaultFolded ?? false,
    stripAutoFoldSecs: orgRow?.stripAutoFoldSecs ?? sysRow?.stripAutoFoldSecs ?? 15,
  }
}

export async function upsertPropertyAmadeusConfig(propertyId: number, data: AmadeusConfigUpdate): Promise<AmadeusConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.clientId) update.clientId = encryptApiKey(data.clientId)
  if (data.clientSecret) update.clientSecret = encryptApiKey(data.clientSecret)
  if (data.enabled !== undefined) update.enabled = data.enabled
  if (data.systemServiceDisabled !== undefined) update.systemServiceDisabled = data.systemServiceDisabled
  // nullable overrides: null resets to inherited
  if ('radiusKmOverride' in data) update.radiusKm = data.radiusKmOverride ?? null
  else if (data.radiusKm !== undefined) update.radiusKm = data.radiusKm
  if ('maxActivitiesOverride' in data) update.maxActivities = data.maxActivitiesOverride ?? null
  else if (data.maxActivities !== undefined) update.maxActivities = data.maxActivities
  if ('stripLabelOverride' in data) update.stripLabel = data.stripLabelOverride ?? null
  else if (data.stripLabel !== undefined) update.stripLabel = data.stripLabel
  if ('stripModeOverride' in data) update.stripMode = data.stripModeOverride ?? null
  else if (data.stripMode !== undefined) update.stripMode = data.stripMode

  await prisma.propertyAmadeusConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...update },
    update,
  })
  return getPropertyAmadeusConfig(propertyId)
}

// ── Resolution (used by public routes + AI tool) ──────────────────────────────

export interface ResolvedAmadeusConfig {
  clientId: string
  clientSecret: string
  tokenUrl: string
  activitiesUrl: string
  radiusKm: number
  maxActivities: number
  stripLabel: string
  stripMode: 'merged' | 'separate'
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}

export async function getResolvedAmadeusConfig(
  propertyId: number,
  fallbackOrgId?: number,
): Promise<ResolvedAmadeusConfig | null> {
  const prop = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
  const orgId = prop?.organizationId ?? fallbackOrgId

  const [propRow, orgRow, sysRow] = await Promise.all([
    prisma.propertyAmadeusConfig.findUnique({ where: { propertyId } }),
    orgId ? prisma.orgAmadeusConfig.findUnique({ where: { organizationId: orgId } }) : null,
    prisma.systemAmadeusConfig.findFirst(),
  ])

  // Enable/disable cascade — most restrictive wins
  if (!sysRow?.enabled) return null
  if (orgRow && !orgRow.enabled) return null
  if (orgRow?.systemServiceDisabled) return null
  if (propRow && !propRow.enabled) return null
  if (propRow?.systemServiceDisabled) return null

  // Credential resolution
  let encClientId: string | null
  let encClientSecret: string | null
  if (sysRow.enforceSystemCreds) {
    encClientId = sysRow.clientId ?? null
    encClientSecret = sysRow.clientSecret ?? null
  } else if (orgRow?.enforceOrgCreds) {
    encClientId = orgRow.clientId ?? null
    encClientSecret = orgRow.clientSecret ?? null
  } else {
    const credSource = [propRow, orgRow, sysRow].find(r => r?.clientId)
    encClientId = credSource?.clientId ?? null
    encClientSecret = credSource?.clientSecret ?? null
  }

  if (!encClientId || !encClientSecret) return null

  return {
    clientId: decryptApiKey(encClientId),
    clientSecret: decryptApiKey(encClientSecret),
    tokenUrl: sysRow.tokenUrl,
    activitiesUrl: sysRow.activitiesUrl,
    radiusKm: propRow?.radiusKm ?? orgRow?.radiusKm ?? sysRow.radiusKm,
    maxActivities: propRow?.maxActivities ?? orgRow?.maxActivities ?? sysRow.maxActivities,
    stripLabel: propRow?.stripLabel ?? orgRow?.stripLabel ?? sysRow.stripLabel,
    stripMode: ((propRow?.stripMode ?? orgRow?.stripMode ?? sysRow.stripMode)) as 'merged' | 'separate',
    stripDefaultFolded: orgRow?.stripDefaultFolded ?? sysRow.stripDefaultFolded,
    stripAutoFoldSecs: orgRow?.stripAutoFoldSecs ?? sysRow.stripAutoFoldSecs,
  }
}

// ── OAuth token (client-credentials flow, Redis-cached) ───────────────────────

export async function getAmadeusToken(tokenUrl: string, clientId: string, clientSecret: string): Promise<string> {
  if (!tokenUrl) throw new Error('Amadeus token URL not configured. Set it in Admin → Events & Activities → Amadeus Discover.')
  const keyHash = crypto.createHash('sha256').update(tokenUrl + clientId + clientSecret).digest('hex').slice(0, 16)
  const cacheKey = `amadeus:token:${keyHash}`
  const cached = await cacheGet<string>(cacheKey)
  if (cached) return cached

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!res.ok) throw new Error(`Amadeus auth failed: ${res.status}`)
  const data = await res.json() as { access_token: string; expires_in: number }
  await cacheSet(cacheKey, data.access_token, Math.max(data.expires_in - 60, 60))
  return data.access_token
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd apps/api && npx vitest run src/services/__tests__/amadeus-config.service.test.ts
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/amadeus-config.service.ts apps/api/src/services/__tests__/amadeus-config.service.test.ts
git commit -m "feat: add Amadeus Discover config service with inheritance resolution"
```

---

## Task 4: Admin Config Routes

**Files:**
- Create: `apps/api/src/routes/amadeus-config.route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// apps/api/src/routes/amadeus-config.route.ts
import type { FastifyInstance } from 'fastify'
import {
  getSystemAmadeusConfig,
  upsertSystemAmadeusConfig,
  getOrgAmadeusConfig,
  upsertOrgAmadeusConfig,
  getPropertyAmadeusConfig,
  upsertPropertyAmadeusConfig,
  getAmadeusToken,
  getResolvedAmadeusConfig,
} from '../services/amadeus-config.service.js'
import type { AmadeusConfigUpdate } from '@ibe/shared'

export async function amadeusConfigRoutes(fastify: FastifyInstance) {
  // ── System ────────────────────────────────────────────────────────────────
  fastify.get('/admin/amadeus/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemAmadeusConfig())
  })

  fastify.put('/admin/amadeus/config/system', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await upsertSystemAmadeusConfig(request.body as AmadeusConfigUpdate))
  })

  // ── Org ───────────────────────────────────────────────────────────────────
  fastify.get('/admin/amadeus/config', async (request, reply) => {
    const rawOrgId = (request.query as Record<string, string>).orgId
    const orgId = request.admin.role === 'super'
      ? (rawOrgId ? parseInt(rawOrgId, 10) : null)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    return reply.send(await getOrgAmadeusConfig(orgId))
  })

  fastify.put('/admin/amadeus/config', async (request, reply) => {
    const body = request.body as AmadeusConfigUpdate & { orgId?: number }
    const orgId = request.admin.role === 'super'
      ? (body.orgId ?? request.admin.organizationId)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    if (body.systemServiceDisabled !== undefined && request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Only super admins can disable system services' })
    }
    // enforceChildCreds at org level: super can set it on any org; org admin can set it on their own org
    // (chain admin locking hotels to use chain credentials is an intended self-service capability)
    return reply.send(await upsertOrgAmadeusConfig(orgId, body))
  })

  // ── Property ──────────────────────────────────────────────────────────────
  fastify.get('/admin/amadeus/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string>).propertyId, 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
    return reply.send(await getPropertyAmadeusConfig(propertyId))
  })

  fastify.put('/admin/amadeus/config/property/:propertyId', async (request, reply) => {
    const propertyId = parseInt((request.params as Record<string, string>).propertyId, 10)
    if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
    const body = request.body as AmadeusConfigUpdate
    if (body.systemServiceDisabled !== undefined && !['super', 'chain'].includes(request.admin.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' })
    }
    return reply.send(await upsertPropertyAmadeusConfig(propertyId, body))
  })

  // ── Test connection ───────────────────────────────────────────────────────
  fastify.post('/admin/amadeus/test', async (request, reply) => {
    const body = request.body as { orgId?: number; propertyId?: number }
    try {
      let cfg
      if (body.propertyId) {
        cfg = await getResolvedAmadeusConfig(body.propertyId)
      } else {
        const orgId = request.admin.role === 'super'
          ? body.orgId
          : request.admin.organizationId
        if (!orgId) return reply.send({ ok: false, error: 'No context' })
        cfg = await getResolvedAmadeusConfig(0, orgId)
      }
      if (!cfg) return reply.send({ ok: false, error: 'Amadeus not configured or disabled' })
      await getAmadeusToken(cfg.tokenUrl, cfg.clientId, cfg.clientSecret)
      return reply.send({ ok: true })
    } catch (err) {
      return reply.send({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/amadeus-config.route.ts
git commit -m "feat: add Amadeus Discover admin config routes"
```

---

## Task 5: Public Routes

**Files:**
- Create: `apps/api/src/routes/amadeus-public.route.ts`

> **Note on Amadeus API endpoint:** Before implementing `fetchAmadeusActivities`, confirm the exact URL and request parameters (location-based search by lat/lng + radius) from the Amadeus Discover Quick Connect Postman collection or Swagger UI. The function is isolated so only it needs updating. Use `AMADEUS_ACTIVITIES_URL` env var as override.

- [ ] **Step 1: Create the public route file**

```typescript
// apps/api/src/routes/amadeus-public.route.ts
import type { FastifyInstance } from 'fastify'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'
import { getResolvedAmadeusConfig, getAmadeusToken } from '../services/amadeus-config.service.js'
import { getResolvedEventsConfig } from '../services/events-config.service.js'
import { logger } from '../utils/logger.js'
import type { AmadeusActivity, AmadeusPublicResponse, ActivitiesAndEventsResponse } from '@ibe/shared'

interface RawAmadeusProduct {
  id: string
  name: string
  shortDescription?: string
  productType?: string
  pictures?: Array<{ url: string }>
  price?: { amount: number; currencyCode: string }
  duration?: string
  bookingLink?: string
  // bookable flag name TBD from actual API response — adjust field name after confirming docs
  isBookable?: boolean
  booking?: { available: boolean }
}

async function fetchAmadeusActivities(
  activitiesUrl: string,
  token: string,
  lat: number,
  lng: number,
  radiusKm: number,
  max: number,
): Promise<RawAmadeusProduct[]> {
  if (!activitiesUrl) throw new Error('Amadeus activities URL not configured.')
  const url = new URL(activitiesUrl)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('radius', String(radiusKm))
  url.searchParams.set('limit', String(max))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Amadeus activities fetch failed: ${res.status}`)
  const data = await res.json() as { data?: RawAmadeusProduct[] }
  return data.data ?? []
}

function normaliseActivity(raw: RawAmadeusProduct): AmadeusActivity {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.shortDescription ?? null,
    category: raw.productType ?? null,
    thumb: raw.pictures?.[0]?.url ?? null,
    price: raw.price?.amount ?? null,
    currency: raw.price?.currencyCode ?? null,
    duration: raw.duration ?? null,
    bookable: raw.isBookable ?? raw.booking?.available ?? false,
    bookingUrl: raw.bookingLink ?? null,
  }
}

async function getAmadeusActivities(
  propertyId: number,
  fallbackOrgId?: number,
): Promise<AmadeusPublicResponse> {
  const cfg = await getResolvedAmadeusConfig(propertyId, fallbackOrgId)
  if (!cfg) return { enabled: false }

  const property = await fetchPropertyStatic(propertyId).catch(() => null)
  const lat = property?.coordinates?.latitude
  const lng = property?.coordinates?.longitude
  if (!lat || !lng) return { enabled: false }

  try {
    const token = await getAmadeusToken(cfg.tokenUrl, cfg.clientId, cfg.clientSecret)
    const raw = await fetchAmadeusActivities(cfg.activitiesUrl, token, lat, lng, cfg.radiusKm, cfg.maxActivities)
    return {
      enabled: true,
      radiusKm: cfg.radiusKm,
      activities: raw.map(normaliseActivity),
      stripLabel: cfg.stripLabel,
      stripMode: cfg.stripMode,
      stripDefaultFolded: cfg.stripDefaultFolded,
      stripAutoFoldSecs: cfg.stripAutoFoldSecs,
    }
  } catch (err) {
    logger.warn({ propertyId, err }, '[Amadeus] activities fetch failed')
    return { enabled: false }
  }
}

export async function amadeusPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/amadeus/activities', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const fallbackOrgId = qs.orgId ? parseInt(qs.orgId, 10) : undefined
    return reply.send(await getAmadeusActivities(propertyId, fallbackOrgId))
  })

  fastify.get('/activities-and-events', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const fallbackOrgId = qs.orgId ? parseInt(qs.orgId, 10) : undefined

    const today = new Date().toISOString().split('T')[0]!
    const startDate = qs.startDate ?? today
    const endDate = qs.endDate ?? addDays(startDate, 6)

    const [tmResult, amadeusResult] = await Promise.all([
      fetchTicketmaster(propertyId, fallbackOrgId, startDate, endDate),
      getAmadeusActivities(propertyId, fallbackOrgId),
    ])

    const response: ActivitiesAndEventsResponse = {
      ticketmaster: tmResult,
      amadeus: amadeusResult,
    }
    return reply.send(response)
  })
}

// ── Ticketmaster (extracted from events-public.route.ts logic) ────────────────

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]!
}

interface TmEvent {
  name: string
  dates?: { start?: { localDate?: string; localTime?: string } }
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>
  _embedded?: { venues?: Array<{ name?: string; address?: { line1?: string }; city?: { name?: string } }> }
  url?: string
  images?: Array<{ url: string; width: number; height: number }>
}

async function fetchTicketmaster(
  propertyId: number,
  fallbackOrgId: number | undefined,
  startDate: string,
  endDate: string,
): Promise<ActivitiesAndEventsResponse['ticketmaster']> {
  const [propertyResult, cfg] = await Promise.all([
    fetchPropertyStatic(propertyId).catch(() => null),
    getResolvedEventsConfig(propertyId, fallbackOrgId),
  ])

  if (!cfg.enabled || !cfg.apiKey) return { enabled: false }

  const lat = propertyResult?.coordinates?.latitude
  const lng = propertyResult?.coordinates?.longitude
  if (!lat || !lng) return { enabled: false }

  try {
    const url = [
      'https://app.ticketmaster.com/discovery/v2/events.json',
      `?apikey=${cfg.apiKey}`,
      `&latlong=${lat},${lng}`,
      `&radius=${cfg.radiusKm}&unit=km`,
      `&startDateTime=${startDate}T00:00:00Z`,
      `&endDateTime=${endDate}T23:59:59Z`,
      `&size=${cfg.maxEvents}`,
      '&sort=date,asc',
    ].join('')

    const res = await fetch(url)
    if (!res.ok) return { enabled: false }

    const data = await res.json() as { _embedded?: { events?: TmEvent[] } }
    const raw = data._embedded?.events ?? []

    const seen = new Set<string>()
    const events = raw
      .map(e => {
        const venue = e._embedded?.venues?.[0]
        const thumb = e.images
          ?.filter(i => i.width >= 200 && i.width <= 500)
          .sort((a, b) => a.width - b.width)[0]?.url ?? null
        const baseName = e.name.split('|')[0]!.trim()
        return {
          name: baseName,
          date: e.dates?.start?.localDate ?? null,
          time: e.dates?.start?.localTime?.slice(0, 5) ?? null,
          category: e.classifications?.[0]?.segment?.name ?? null,
          genre: e.classifications?.[0]?.genre?.name ?? null,
          venue: venue?.name ?? null,
          city: venue?.city?.name ?? null,
          ticketUrl: e.url ?? null,
          thumb,
        }
      })
      .filter(e => {
        const key = `${e.name.toLowerCase()}|${e.date ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

    return {
      enabled: true,
      events,
      stripDefaultFolded: cfg.stripDefaultFolded,
      stripAutoFoldSecs: cfg.stripAutoFoldSecs,
    }
  } catch {
    return { enabled: false }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/amadeus-public.route.ts
git commit -m "feat: add Amadeus Discover public routes (/amadeus/activities, /activities-and-events)"
```

---

## Task 6: Register Routes

**Files:**
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Add imports**

In `apps/api/src/app.ts`, find the block of events route imports (around line 52-54) and add after them:

```typescript
import { amadeusConfigRoutes } from './routes/amadeus-config.route.js'
import { amadeusPublicRoutes } from './routes/amadeus-public.route.js'
```

- [ ] **Step 2: Register public route**

Find the line `await app.register(eventsPublicRoutes, { prefix: '/api/v1' })` (around line 184) and add after it:

```typescript
  await app.register(amadeusPublicRoutes, { prefix: '/api/v1' })
```

- [ ] **Step 3: Register admin route**

Find the line `await adminApp.register(eventsConfigRoutes, { prefix: '/api/v1' })` (around line 229) and add after it:

```typescript
    await adminApp.register(amadeusConfigRoutes, { prefix: '/api/v1' })
```

- [ ] **Step 4: Build API to verify no TypeScript errors**

```bash
cd apps/api && npm run build
```
Expected: exits 0 with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat: register Amadeus Discover routes"
```

---

## Task 7: AI Tool Extension

**Files:**
- Modify: `apps/api/src/ai/tools/events.ts`

- [ ] **Step 1: Update the tool definition and executor**

Replace the contents of `apps/api/src/ai/tools/events.ts` with:

```typescript
import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { getResolvedEventsConfig } from '../../services/events-config.service.js'
import { getResolvedAmadeusConfig, getAmadeusToken } from '../../services/amadeus-config.service.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'

export const getNearbyEventsTool: ToolDefinition = {
  name: 'get_nearby_events',
  description: 'Get upcoming events and activities near the hotel: concerts, sports, theatre, tours, experiences, things to do. Call when the user asks about events, activities, entertainment, or things to do nearby.',
  parameters: {
    type: 'object',
    properties: {
      propertyId: { type: 'number', description: 'Hotel property ID' },
      startDate: { type: 'string', description: 'Start date YYYY-MM-DD (defaults to today)' },
      endDate: { type: 'string', description: 'End date YYYY-MM-DD (defaults to 30 days from start)' },
    },
    required: ['propertyId'],
  },
}

interface TicketmasterEvent {
  name: string
  dates?: { start?: { localDate?: string; localTime?: string } }
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>
  _embedded?: { venues?: Array<{ name?: string; city?: { name?: string } }> }
  url?: string
}

interface RawAmadeusProduct {
  id: string
  name: string
  shortDescription?: string
  productType?: string
  pictures?: Array<{ url: string }>
  price?: { amount: number; currencyCode: string }
  duration?: string
  bookingLink?: string
  isBookable?: boolean
  booking?: { available: boolean }
}

export async function executeGetNearbyEvents(args: Record<string, unknown>): Promise<unknown> {
  const propertyId = args.propertyId as number

  try {
    const [property, eventsCfg, amadeusCfg] = await Promise.all([
      fetchPropertyStatic(propertyId),
      getResolvedEventsConfig(propertyId),
      getResolvedAmadeusConfig(propertyId),
    ])

    const today = new Date().toISOString().split('T')[0]!
    const startDate = (args.startDate as string | undefined) ?? today
    const endDate = (args.endDate as string | undefined) ?? addDays(startDate, 30)

    const lat = property.coordinates?.latitude
    const lng = property.coordinates?.longitude

    const [events, activities] = await Promise.all([
      fetchTmEvents(eventsCfg, lat, lng, startDate, endDate),
      fetchAmadeusActivities(amadeusCfg, lat, lng),
    ])

    return {
      propertyId,
      hotelName: property.name,
      totalFound: (events?.length ?? 0) + (activities?.length ?? 0),
      ...(events ? { events } : {}),
      ...(activities ? { activities } : {}),
    }
  } catch (err) {
    logger.warn({ propertyId, err }, '[AI Tool] get_nearby_events failed')
    return { error: 'Could not retrieve nearby events.' }
  }
}

async function fetchTmEvents(
  cfg: Awaited<ReturnType<typeof getResolvedEventsConfig>>,
  lat: number | undefined,
  lng: number | undefined,
  startDate: string,
  endDate: string,
): Promise<Array<{ name: string; date: string | null; time: string | null; category: string | null; genre: string | null; venue: string | null; ticketUrl: string | null }> | null> {
  if (!cfg.apiKey || !cfg.enabled || !lat || !lng) return null

  const url = [
    'https://app.ticketmaster.com/discovery/v2/events.json',
    `?apikey=${cfg.apiKey}`,
    `&latlong=${lat},${lng}`,
    `&radius=${cfg.radiusKm}&unit=km`,
    `&startDateTime=${startDate}T00:00:00Z`,
    `&endDateTime=${endDate}T23:59:59Z`,
    `&size=${cfg.maxEvents}`,
    '&sort=date,asc',
  ].join('')

  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 401) return null
    return null
  }

  const data = await res.json() as { _embedded?: { events?: TicketmasterEvent[] } }
  return (data._embedded?.events ?? []).map(e => ({
    name: e.name,
    date: e.dates?.start?.localDate ?? null,
    time: e.dates?.start?.localTime ?? null,
    category: e.classifications?.[0]?.segment?.name ?? null,
    genre: e.classifications?.[0]?.genre?.name ?? null,
    venue: e._embedded?.venues?.[0]?.name ?? null,
    ticketUrl: e.url ?? null,
  }))
}

async function fetchAmadeusActivities(
  cfg: Awaited<ReturnType<typeof getResolvedAmadeusConfig>>,
  lat: number | undefined,
  lng: number | undefined,
): Promise<Array<{ name: string; category: string | null; duration: string | null; price: number | null; currency: string | null; bookable: boolean }> | null> {
  if (!cfg || !lat || !lng) return null

  try {
    const token = await getAmadeusToken(cfg.tokenUrl, cfg.clientId, cfg.clientSecret)
    const url = new URL(cfg.activitiesUrl)
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set('radius', String(cfg.radiusKm))
    url.searchParams.set('limit', String(cfg.maxActivities))

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null

    const data = await res.json() as { data?: RawAmadeusProduct[] }
    return (data.data ?? []).map(r => ({
      name: r.name,
      category: r.productType ?? null,
      duration: r.duration ?? null,
      price: r.price?.amount ?? null,
      currency: r.price?.currencyCode ?? null,
      bookable: r.isBookable ?? r.booking?.available ?? false,
    }))
  } catch {
    return null
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]!
}
```

- [ ] **Step 2: Build API to verify**

```bash
cd apps/api && npm run build
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/ai/tools/events.ts
git commit -m "feat: extend get_nearby_events AI tool to include Amadeus activities"
```

---

## Task 8: API Client Methods

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add the import**

Near the top of `api-client.ts` where other config types are imported, add:

```typescript
import type {
  AmadeusConfigResponse,
  AmadeusConfigUpdate,
  ActivitiesAndEventsResponse,
} from '@ibe/shared'
```

- [ ] **Step 2: Add Amadeus methods**

Find the `// ── Events ──` section in `api-client.ts` (around line 1503) and add after the events block:

```typescript
  // ── Amadeus Discover ──────────────────────────────────────────────────────────
  getSystemAmadeusConfig(): Promise<AmadeusConfigResponse> {
    return apiRequest('/api/v1/admin/amadeus/config/system')
  },

  updateSystemAmadeusConfig(data: AmadeusConfigUpdate): Promise<AmadeusConfigResponse> {
    return apiRequest('/api/v1/admin/amadeus/config/system', { method: 'PUT', body: JSON.stringify(data) })
  },

  getAmadeusConfig(orgId?: number): Promise<AmadeusConfigResponse> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/amadeus/config${qs}`)
  },

  updateAmadeusConfig(data: AmadeusConfigUpdate, orgId?: number): Promise<AmadeusConfigResponse> {
    const body = orgId ? { ...data, orgId } : data
    return apiRequest('/api/v1/admin/amadeus/config', { method: 'PUT', body: JSON.stringify(body) })
  },

  getPropertyAmadeusConfig(propertyId: number): Promise<AmadeusConfigResponse> {
    return apiRequest(`/api/v1/admin/amadeus/config/property/${propertyId}`)
  },

  updatePropertyAmadeusConfig(propertyId: number, data: AmadeusConfigUpdate): Promise<AmadeusConfigResponse> {
    return apiRequest(`/api/v1/admin/amadeus/config/property/${propertyId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  testAmadeusConnection(orgId?: number, propertyId?: number): Promise<{ ok: boolean; error?: string }> {
    return apiRequest('/api/v1/admin/amadeus/test', { method: 'POST', body: JSON.stringify({ orgId, propertyId }) })
  },

  getActivitiesAndEvents(propertyId: number, orgId?: number): Promise<ActivitiesAndEventsResponse> {
    const qs = new URLSearchParams({ propertyId: String(propertyId) })
    if (orgId) qs.set('orgId', String(orgId))
    return apiRequest(`/api/v1/activities-and-events?${qs}`)
  },
```

- [ ] **Step 3: Build web app to verify types**

```bash
cd apps/web && npm run build 2>&1 | head -30
```
Expected: exits 0 (or only pre-existing errors unrelated to Amadeus).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat: add Amadeus Discover API client methods"
```

---

## Task 9: Admin UI — Amadeus Config Card

**Files:**
- Create: `apps/web/src/app/admin/config/events/amadeus-card.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/app/admin/config/events/amadeus-card.tsx
'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { AmadeusConfigResponse, AmadeusConfigUpdate } from '@ibe/shared'

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

function AmadeusConfigForm({
  data,
  onSave,
  saving,
  isSystem,
  isSuper,
  isChainAdmin,
  orgId,
  propertyId,
  onToggleSystemService,
}: {
  data: AmadeusConfigResponse
  onSave: (u: AmadeusConfigUpdate) => void
  saving: boolean
  isSystem?: boolean
  isSuper?: boolean
  isChainAdmin?: boolean
  orgId?: number
  propertyId?: number
  onToggleSystemService?: (disabled: boolean) => void
}) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [tokenUrl, setTokenUrl] = useState(data.tokenUrl)
  const [activitiesUrl, setActivitiesUrl] = useState(data.activitiesUrl)
  const [enabled, setEnabled] = useState(data.enabled)
  const [enforceChildCreds, setEnforceChildCreds] = useState(data.enforceChildCreds)
  const [radiusKm, setRadiusKm] = useState(data.radiusKm)
  const [maxActivities, setMaxActivities] = useState(data.maxActivities)
  const [stripLabel, setStripLabel] = useState(data.stripLabel)
  const [stripMode, setStripMode] = useState<'merged' | 'separate'>(data.stripMode)
  const [stripDefaultFolded, setStripDefaultFolded] = useState(data.stripDefaultFolded)
  const [stripAutoFoldSecs, setStripAutoFoldSecs] = useState(data.stripAutoFoldSecs)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    setEnabled(data.enabled)
    setTokenUrl(data.tokenUrl)
    setActivitiesUrl(data.activitiesUrl)
    setEnforceChildCreds(data.enforceChildCreds)
    setRadiusKm(data.radiusKm)
    setMaxActivities(data.maxActivities)
    setStripLabel(data.stripLabel)
    setStripMode(data.stripMode)
    setStripDefaultFolded(data.stripDefaultFolded)
    setStripAutoFoldSecs(data.stripAutoFoldSecs)
    setTestResult(null)
  }, [data])

  const testMutation = useMutation({
    mutationFn: () => apiClient.testAmadeusConnection(isSuper ? orgId : undefined, isSuper ? propertyId : undefined),
    onSuccess: r => setTestResult(r),
    onError: e => setTestResult({ ok: false, error: String(e) }),
  })

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
  const credsLocked = data.credentialsLocked

  function buildUpdate(): AmadeusConfigUpdate {
    const u: AmadeusConfigUpdate = { enabled, stripLabel, stripMode }
    if (isSystem) { u.tokenUrl = tokenUrl; u.activitiesUrl = activitiesUrl }
    if (!isSystem) u.stripDefaultFolded = stripDefaultFolded
    if (!isSystem) u.stripAutoFoldSecs = stripAutoFoldSecs
    if (clientId) u.clientId = clientId
    if (clientSecret) u.clientSecret = clientSecret
    if (!propertyId) {
      u.radiusKm = radiusKm
      u.maxActivities = maxActivities
    } else {
      u.radiusKmOverride = radiusKm
      u.maxActivitiesOverride = maxActivities
    }
      if (isSuper && !isSystem) u.enforceChildCreds = enforceChildCreds
    return u
  }

  return (
    <div className="space-y-5">
      {/* Credentials locked banner */}
      {credsLocked && (
        <div className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-4 py-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Credentials are locked by the parent level. Your own Client ID / Secret are ignored.
          </p>
        </div>
      )}

      {/* System service status (org level, shown to non-system views) */}
      {!isSystem && onToggleSystemService !== undefined && (
        <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Amadeus service</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {data.systemServiceDisabled
                ? 'Disabled for this organisation by a super admin.'
                : !data.hasOwnConfig
                  ? 'Using inherited Amadeus credentials.'
                  : 'Using own Amadeus credentials.'}
            </p>
          </div>
          {isSuper ? (
            <Toggle checked={!data.systemServiceDisabled} onChange={v => onToggleSystemService(!v)} />
          ) : (
            <span className={['rounded-full px-2.5 py-0.5 text-xs font-semibold',
              data.systemServiceDisabled
                ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
                : 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
            ].join(' ')}>
              {data.systemServiceDisabled ? 'Disabled by admin' : 'Active'}
            </span>
          )}
        </div>
      )}

      {/* API endpoint URLs — system level only */}
      {isSystem && (
        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">API Endpoints</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Token URL</label>
            <input type="text" value={tokenUrl} onChange={e => setTokenUrl(e.target.value)}
              placeholder="https://…/oauth2/token"
              className={inputCls} autoComplete="off" />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">OAuth 2.0 token endpoint from Amadeus Discover Quick Connect docs.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Activities URL</label>
            <input type="text" value={activitiesUrl} onChange={e => setActivitiesUrl(e.target.value)}
              placeholder="https://…/v1/catalog/activities"
              className={inputCls} autoComplete="off" />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Activities search endpoint from Amadeus Discover Quick Connect docs.</p>
          </div>
        </div>
      )}

      {/* Client ID */}
      <div className={credsLocked ? 'opacity-50 pointer-events-none' : ''}>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Client ID</label>
        {data.credentialsSet && (
          <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">
            Current: <span className="font-mono">{data.clientIdMasked}</span> — leave blank to keep.
          </p>
        )}
        <input type="text" value={clientId} onChange={e => setClientId(e.target.value)}
          placeholder={data.credentialsSet ? 'Enter new Client ID to replace…' : 'Amadeus Client ID…'}
          className={inputCls} autoComplete="off" />
      </div>

      {/* Client Secret */}
      <div className={credsLocked ? 'opacity-50 pointer-events-none' : ''}>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Client Secret</label>
        <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
          placeholder={data.credentialsSet ? 'Enter new secret to replace…' : 'Amadeus Client Secret…'}
          className={inputCls} autoComplete="off" />
      </div>

      {/* Enforce credentials for children (super only in this UI; org-level enforcement settable via API) */}
      {!propertyId && isSuper && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <Toggle checked={enforceChildCreds} onChange={setEnforceChildCreds} />
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Lock credentials for levels below</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isSystem
                ? 'All orgs and hotels will use the system credentials.'
                : 'Hotels in this org cannot use their own credentials.'}
            </p>
          </div>
        </div>
      )}

      {/* Enable toggle */}
      <div className="flex items-center gap-3">
        <Toggle checked={enabled} onChange={setEnabled} />
        <span className="text-sm text-[var(--color-text)]">{enabled ? 'Amadeus Discover enabled' : 'Amadeus Discover disabled'}</span>
      </div>

      {/* Search radius */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Search Radius <span className="font-normal normal-case opacity-60">km around the hotel</span>
          {propertyId && <span className="ml-1 font-normal normal-case opacity-60">(overrides inherited value)</span>}
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={50} step={1} value={radiusKm}
            onChange={e => setRadiusKm(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]" />
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
            {radiusKm} km
          </span>
        </div>
        {propertyId && (
          <button type="button" onClick={() => onSave({ radiusKmOverride: null })}
            className="mt-1 text-xs text-[var(--color-primary)] hover:underline">
            Reset to inherited
          </button>
        )}
      </div>

      {/* Max activities */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Max Activities to Return
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={50} step={1} value={maxActivities}
            onChange={e => setMaxActivities(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]" />
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
            {maxActivities}
          </span>
        </div>
      </div>

      {/* Strip label */}
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Strip Label</label>
        <input type="text" value={stripLabel} onChange={e => setStripLabel(e.target.value)}
          placeholder="Activities & Tours" className={inputCls} />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Label shown on the guest activities strip.
        </p>
      </div>

      {/* Strip mode */}
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Strip Display Mode</label>
        <div className="flex gap-3">
          {(['separate', 'merged'] as const).map(mode => (
            <label key={mode} className="flex cursor-pointer items-center gap-2">
              <input type="radio" checked={stripMode === mode} onChange={() => setStripMode(mode)}
                className="accent-[var(--color-primary)]" />
              <span className="text-sm text-[var(--color-text)] capitalize">{mode}</span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {mode === 'separate' ? '(two strips)' : '(one unified strip)'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Strip display behaviour (not at property level) */}
      {!propertyId && (
        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Strip display behaviour</p>
          <div className="flex items-center gap-3">
            <Toggle checked={stripDefaultFolded} onChange={setStripDefaultFolded} />
            <span className="text-sm text-[var(--color-text)]">Start collapsed by default</span>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Auto-collapse after <span className="font-normal normal-case opacity-60">seconds (0 = never)</span>
            </label>
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={120} step={1} value={stripAutoFoldSecs}
                onChange={e => setStripAutoFoldSecs(Number(e.target.value))}
                className="flex-1 accent-[var(--color-primary)]" />
              <span className="w-14 text-center text-sm font-semibold tabular-nums text-[var(--color-text)]">
                {stripAutoFoldSecs === 0 ? 'Never' : `${stripAutoFoldSecs}s`}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="button" disabled={saving} onClick={() => onSave(buildUpdate())}
          className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {!propertyId && (
          <button type="button" disabled={testMutation.isPending} onClick={() => testMutation.mutate()}
            className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40">
            {testMutation.isPending ? 'Testing…' : 'Test Connection'}
          </button>
        )}
        {testResult && (
          <p className={testResult.ok ? 'text-sm text-[var(--color-success)]' : 'text-sm text-[var(--color-error)]'}>
            {testResult.ok ? '✓ Connection successful' : '✗ ' + testResult.error}
          </p>
        )}
      </div>
    </div>
  )
}

// ── System-level card ─────────────────────────────────────────────────────────

function SystemAmadeusSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['amadeus-config-system'],
    queryFn: () => apiClient.getSystemAmadeusConfig(),
  })
  const saveMutation = useMutation({
    mutationFn: (u: AmadeusConfigUpdate) => apiClient.updateSystemAmadeusConfig(u),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['amadeus-config-system'] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <p className="mb-5 text-sm text-[var(--color-text-muted)]">
        System-level Amadeus credentials used as fallback for all organisations that have not configured their own.
      </p>
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load.</p>}
      {data && (
        <AmadeusConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending}
          isSystem isSuper />
      )}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

// ── Org-level card ────────────────────────────────────────────────────────────

export function OrgAmadeusCard({ orgId, isSuper }: { orgId: number; isSuper?: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['amadeus-config', orgId],
    queryFn: () => apiClient.getAmadeusConfig(orgId),
  })
  const saveMutation = useMutation({
    mutationFn: (u: AmadeusConfigUpdate) => apiClient.updateAmadeusConfig(u, orgId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['amadeus-config', orgId] }) },
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load.</p>}
      {data && (
        <AmadeusConfigForm data={data} onSave={u => saveMutation.mutate(u)} saving={saveMutation.isPending}
          isSuper={isSuper} isChainAdmin={isChainAdmin} orgId={orgId}
          onToggleSystemService={disabled => saveMutation.mutate({ systemServiceDisabled: disabled })}
        />
      )}
      {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
      {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
    </div>
  )
}

// ── Default export: renders the right card based on context ───────────────────

export default function AmadeusConfigCard({ isSystemLevel, orgId, isSuper }: {
  isSystemLevel: boolean
  orgId?: number
  isSuper?: boolean
}) {
  if (isSystemLevel) return <SystemAmadeusSection />
  if (!orgId) return null
  return <OrgAmadeusCard orgId={orgId} isSuper={isSuper} />
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/admin/config/events/amadeus-card.tsx
git commit -m "feat: add Amadeus Discover admin config card component"
```

---

## Task 10: Admin UI — Update Events Page

**Files:**
- Modify: `apps/web/src/app/admin/config/events/page.tsx`

- [ ] **Step 1: Add import and update the page**

At the top of `apps/web/src/app/admin/config/events/page.tsx`, add the import after the existing imports:

```typescript
import AmadeusConfigCard from './amadeus-card'
```

- [ ] **Step 2: Update the `EventsConfigPage` return**

Replace the `return (` block inside `EventsConfigPage` (the outer `<div className="space-y-6">`) with:

```tsx
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Events & Activities</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Configure event and activity providers. Ticketmaster surfaces concerts, sports, and shows. Amadeus Discover surfaces tours, experiences, and bookable activities.
        </p>
      </div>

      {/* Ticketmaster */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Ticketmaster</h2>
        {isSystemLevel ? (
          <SystemEventsSection />
        ) : (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
            {isError && <p className="text-sm text-[var(--color-error)]">Failed to load. Please refresh.</p>}
            {data && (
              <EventsConfigForm
                data={data}
                onSave={u => saveMutation.mutate(u)}
                saving={saveMutation.isPending}
                isSuper={isSuper}
                {...(orgId !== undefined ? { orgId } : {})}
                onToggleSystemService={disabled => saveMutation.mutate({ systemServiceDisabled: disabled })}
              />
            )}
            {saveMutation.isError && <p className="mt-3 text-sm text-[var(--color-error)]">Save failed.</p>}
            {saveMutation.isSuccess && <p className="mt-3 text-sm text-[var(--color-success)]">Saved.</p>}
          </div>
        )}
      </div>

      {/* Amadeus Discover */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Amadeus Discover</h2>
        <AmadeusConfigCard
          isSystemLevel={isSystemLevel}
          orgId={orgId}
          isSuper={isSuper}
        />
      </div>
    </div>
  )
```

- [ ] **Step 3: Build web app to verify**

```bash
cd apps/web && npm run build 2>&1 | head -40
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/config/events/page.tsx
git commit -m "feat: update events config page to include Amadeus Discover card"
```

---

## Task 11: Guest UI — EventsStrip Update

**Files:**
- Modify: `apps/web/src/components/weather/EventsStrip.tsx`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/components/weather/EventsStrip.tsx` fully before editing.

- [ ] **Step 2: Replace the fetch and rendering logic**

The key changes are:
1. Switch from `GET /events` to `GET /activities-and-events` (via `apiClient.getActivitiesAndEvents`)
2. Handle `stripMode: 'merged' | 'separate'`
3. Add an activity card alongside the existing event card
4. In merged mode, interleave items sorted by date

Replace the data-fetching query and rendering section. The component should:

```tsx
// At the top, add to imports:
import type { ActivitiesAndEventsResponse, AmadeusActivity } from '@ibe/shared'

// Replace the existing useQuery that calls /events with:
const { data, isLoading } = useQuery<ActivitiesAndEventsResponse>({
  queryKey: ['activities-and-events', propertyId, orgId],
  queryFn: () => apiClient.getActivitiesAndEvents(propertyId, orgId),
  enabled: !!propertyId,
  staleTime: 5 * 60 * 1000,
})

// Neither provider enabled → render nothing
const tmEnabled = data?.ticketmaster?.enabled ?? false
const amEnabled = data?.amadeus?.enabled ?? false
if (!isLoading && !tmEnabled && !amEnabled) return null

const stripMode = data?.amadeus?.stripMode ?? 'separate'
```

For the **activity card** (Amadeus items), add a new `ActivityCard` component inside the file:

```tsx
function ActivityCard({ activity }: { activity: AmadeusActivity }) {
  return (
    <a
      href={activity.bookingUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-[160px] max-w-[200px] flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition hover:border-[var(--color-primary)]"
    >
      {activity.thumb && (
        <img src={activity.thumb} alt={activity.name}
          className="mb-1 h-24 w-full rounded object-cover" />
      )}
      <p className="text-xs font-semibold leading-tight text-[var(--color-text)] line-clamp-2">{activity.name}</p>
      {activity.category && (
        <p className="text-xs text-[var(--color-text-muted)]">{activity.category}</p>
      )}
      {activity.duration && (
        <p className="text-xs text-[var(--color-text-muted)]">{activity.duration}</p>
      )}
      {activity.price != null && (
        <p className="mt-auto text-xs font-semibold text-[var(--color-primary)]">
          {activity.currency ? `${activity.currency} ` : ''}{activity.price}
        </p>
      )}
      <span className={[
        'mt-1 self-start rounded px-2 py-0.5 text-xs font-medium',
        activity.bookable
          ? 'bg-[var(--color-primary)] text-white'
          : 'border border-[var(--color-border)] text-[var(--color-text)]',
      ].join(' ')}>
        {activity.bookable ? 'Book' : 'View'}
      </span>
    </a>
  )
}
```

For **`separate` mode**: render the existing Ticketmaster strip (if `tmEnabled`) followed by a second Amadeus strip (if `amEnabled`), each with its own label and fold settings.

For **`merged` mode**: merge events and activities into one array sorted by date, render in a single strip with `data.amadeus.stripLabel` as the heading.

- [ ] **Step 3: Build and verify**

```bash
cd apps/web && npm run build 2>&1 | head -40
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/weather/EventsStrip.tsx
git commit -m "feat: update EventsStrip to support Amadeus Discover (merged/separate mode, activity cards)"
```

---

## Task 12: End-to-End Smoke Test

- [ ] **Step 1: Start the dev server**

```bash
cd /home/nir/ibe && npm run dev
```

- [ ] **Step 2: Verify the admin events page loads both cards**

Open `http://localhost:3000/admin/config/events`. Confirm:
- Page title reads "Events & Activities"
- Ticketmaster card renders as before
- "Amadeus Discover" section renders below with all fields

- [ ] **Step 3: Verify the combined endpoint returns the expected shape**

```bash
curl -s "http://localhost:3001/api/v1/activities-and-events?propertyId=1" | jq '{tm_enabled: .ticketmaster.enabled, am_enabled: .amadeus.enabled}'
```
Expected: `{ "tm_enabled": false, "am_enabled": false }` (both disabled until configured — no 500 error).

- [ ] **Step 4: Run full test suite**

```bash
cd apps/api && npm test
```
Expected: all tests pass (including new `amadeus-config.service.test.ts`).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Amadeus Discover integration — Phase 1 complete (config, activities strip, AI tool)"
```

---

## Post-Implementation Note

**API endpoint URLs must be set before the feature goes live.** After deploying, navigate to Admin → Events & Activities → Amadeus Discover (system level) and enter the Token URL and Activities URL from the Amadeus Discover Quick Connect Postman collection. No code change or Render env var needed — the URLs are stored in the DB and served from `SystemAmadeusConfig`.
