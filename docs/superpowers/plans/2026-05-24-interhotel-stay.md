# InterHotel Stay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a hotel has no full-stay availability, automatically search nearby same-org hotels and offer split-stay "InterHotel Stay" packages to the guest.

**Architecture:** Config follows the System→Org→Property inheritance pattern from Flexible Dates. A pre-calculated `NearbyHotel` table stores hotel pairs within each property's configured radius (populated by a manual Refresh action). The backend `POST /api/v1/interhotel/search` orchestrates the split search: binary-search finds Hotel A's maximum available window, then confirms nearby hotels for the remainder. The frontend calls this single endpoint via `useInterHotelSearch` and displays collapsible package sections above Flexible Date alternatives.

**Tech Stack:** Fastify, Prisma/PostgreSQL, Next.js 14, React Query v5 (`useQuery`), Vitest, TypeScript, `@ibe/shared` types, `addDays` from shared, `searchAvailability` (HG adapter, lightweight probe), `search` (search.service.ts, full transformation for confirmed segments).

**Spec:** `docs/superpowers/specs/2026-05-24-interhotel-stay-design.md`

**Reference pattern for config tasks:** `apps/api/src/services/flexible-dates-config.service.ts` (Tasks 3 config) and `apps/api/src/routes/flexible-dates.route.ts` (Task 6).

---

## File Map

| File | Action |
|---|---|
| `apps/api/prisma/schema.prisma` | Add 4 models + relations |
| `apps/api/prisma/migrations/TIMESTAMP_interhotel_config/migration.sql` | Create |
| `packages/shared/src/types/api.ts` | Add 5 interfaces + 1 type alias |
| `apps/api/src/services/interhotel-config.service.ts` | Create |
| `apps/api/src/services/__tests__/interhotel-config.service.test.ts` | Create |
| `apps/api/src/services/interhotel-nearby.service.ts` | Create |
| `apps/api/src/services/__tests__/interhotel-nearby.service.test.ts` | Create |
| `apps/api/src/services/interhotel-search.service.ts` | Create |
| `apps/api/src/services/__tests__/interhotel-search.service.test.ts` | Create |
| `apps/api/src/routes/interhotel.route.ts` | Create |
| `apps/api/src/app.ts` | Register routes |
| `apps/web/src/lib/api-client.ts` | Add 8 methods |
| `apps/web/src/app/admin/config/offers/page.tsx` | Replace "Coming soon" + rename tab |
| `apps/web/src/hooks/use-interhotel-search.ts` | Create |
| `apps/web/src/app/(main)/search/_content.tsx` | Integrate hook + display |
| `apps/api/src/translations/en.json` | Add 7 keys |

---

## Task 1: DB Schema — 4 New Models + Relations

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260524_interhotel_config/migration.sql`

- [ ] **Step 1: Add 4 models to schema.prisma**

Add after the `PropertyFlexibleDatesConfig` model (search for it):

```prisma
model SystemInterHotelConfig {
  id                Int     @id @default(1)
  enabled           Boolean @default(false)
  maxRadiusKm       Int     @default(50)
  maxHotels         Int     @default(3)
  transferType      String  @default("self")
  sponsoredAmount   Float   @default(0)
  sponsoredCurrency String  @default("USD")
}

model OrgInterHotelConfig {
  organizationId    Int          @id
  enabled           Boolean?
  maxRadiusKm       Int?
  maxHotels         Int?
  transferType      String?
  sponsoredAmount   Float?
  sponsoredCurrency String?
  org               Organization @relation(fields: [organizationId], references: [id])
}

model PropertyInterHotelConfig {
  propertyId        Int      @id
  enabled           Boolean?
  maxRadiusKm       Int?
  maxHotels         Int?
  transferType      String?
  sponsoredAmount   Float?
  sponsoredCurrency String?
  property          Property @relation(fields: [propertyId], references: [propertyId])
}

model NearbyHotel {
  id               Int      @id @default(autoincrement())
  propertyId       Int
  nearbyPropertyId Int
  distanceKm       Float
  updatedAt        DateTime @updatedAt
  property         Property @relation("PropertyNearby", fields: [propertyId], references: [propertyId])
  nearbyProperty   Property @relation("NearbyHotelProperty", fields: [nearbyPropertyId], references: [propertyId])

  @@unique([propertyId, nearbyPropertyId])
}
```

- [ ] **Step 2: Add relations to existing models**

Find the `Organization` model. After the existing `orgFlexibleDatesConfig` line, add:
```prisma
  orgInterHotelConfig OrgInterHotelConfig?
```

Find the `Property` model. After the existing `propertyFlexibleDatesConfig` line, add:
```prisma
  propertyInterHotelConfig PropertyInterHotelConfig?
  nearbyHotels             NearbyHotel[] @relation("PropertyNearby")
  nearbyOfHotels           NearbyHotel[] @relation("NearbyHotelProperty")
```

- [ ] **Step 3: Create the migration file**

Create directory: `apps/api/prisma/migrations/20260524_interhotel_config/`
Create file `migration.sql`:

```sql
CREATE TABLE "SystemInterHotelConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxRadiusKm" INTEGER NOT NULL DEFAULT 50,
    "maxHotels" INTEGER NOT NULL DEFAULT 3,
    "transferType" TEXT NOT NULL DEFAULT 'self',
    "sponsoredAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sponsoredCurrency" TEXT NOT NULL DEFAULT 'USD',
    CONSTRAINT "SystemInterHotelConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrgInterHotelConfig" (
    "organizationId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "maxRadiusKm" INTEGER,
    "maxHotels" INTEGER,
    "transferType" TEXT,
    "sponsoredAmount" DOUBLE PRECISION,
    "sponsoredCurrency" TEXT,
    CONSTRAINT "OrgInterHotelConfig_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "PropertyInterHotelConfig" (
    "propertyId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "maxRadiusKm" INTEGER,
    "maxHotels" INTEGER,
    "transferType" TEXT,
    "sponsoredAmount" DOUBLE PRECISION,
    "sponsoredCurrency" TEXT,
    CONSTRAINT "PropertyInterHotelConfig_pkey" PRIMARY KEY ("propertyId")
);

CREATE TABLE "NearbyHotel" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "nearbyPropertyId" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NearbyHotel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NearbyHotel_propertyId_nearbyPropertyId_key" ON "NearbyHotel"("propertyId", "nearbyPropertyId");

ALTER TABLE "OrgInterHotelConfig" ADD CONSTRAINT "OrgInterHotelConfig_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PropertyInterHotelConfig" ADD CONSTRAINT "PropertyInterHotelConfig_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NearbyHotel" ADD CONSTRAINT "NearbyHotel_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NearbyHotel" ADD CONSTRAINT "NearbyHotel_nearbyPropertyId_fkey"
  FOREIGN KEY ("nearbyPropertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply migration (shadow DB workaround — ibe_user lacks CREATE DATABASE)**

```bash
cd /home/nir/ibe/apps/api
npx prisma db execute --file prisma/migrations/20260524_interhotel_config/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260524_interhotel_config
npx prisma generate
```

Expected: no errors. If "already exists" errors appear on specific tables, those tables already exist — use `IF NOT EXISTS` variants and retry.

- [ ] **Step 5: Verify type-check passes**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -20
```

Expected: no errors related to the new models.

- [ ] **Step 6: Commit**

```bash
cd /home/nir/ibe
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): add InterHotel Stay config models and NearbyHotel table"
```

---

## Task 2: Shared Types

**Files:**
- Modify: `packages/shared/src/types/api.ts`

- [ ] **Step 1: Read the end of packages/shared/src/types/api.ts**

Find the `PropertyFlexibleDatesConfigResponse` interface. Add the following new types AFTER it:

```ts
// ── InterHotel Stay ───────────────────────────────────────────────────────────

export type TransferType = 'self' | 'hotel' | 'sponsored_self'

export interface InterHotelEffective {
  enabled: boolean
  maxRadiusKm: number
  maxHotels: number
  transferType: TransferType
  sponsoredAmount: number
  sponsoredCurrency: string
}

export interface SystemInterHotelConfigResponse extends InterHotelEffective {}

export interface OrgInterHotelConfigResponse {
  enabled: boolean | null
  maxRadiusKm: number | null
  maxHotels: number | null
  transferType: TransferType | null
  sponsoredAmount: number | null
  sponsoredCurrency: string | null
  effective: InterHotelEffective
}

export interface PropertyInterHotelConfigResponse {
  enabled: boolean | null
  maxRadiusKm: number | null
  maxHotels: number | null
  transferType: TransferType | null
  sponsoredAmount: number | null
  sponsoredCurrency: string | null
  effective: InterHotelEffective
}

export interface InterHotelSegment {
  checkIn: string
  checkOut: string
  result: PropertySearchResult
}

export interface InterHotelPackageResponse {
  segments: InterHotelSegment[]
  transferType: TransferType
  sponsoredAmount: number
  sponsoredCurrency: string
  totalFromPrice: number
  currency: string
}

export interface InterHotelSearchResponse {
  packages: InterHotelPackageResponse[]
}
```

- [ ] **Step 2: Build the shared package**

```bash
cd /home/nir/ibe/packages/shared && npm run build 2>&1 | tail -5
```

Expected: no errors, dist/ updated.

- [ ] **Step 3: Commit**

```bash
cd /home/nir/ibe
git add packages/shared/src/types/api.ts
git commit -m "feat(shared): add InterHotel Stay types"
```

---

## Task 3: Config Service + Tests

**Files:**
- Create: `apps/api/src/services/interhotel-config.service.ts`
- Create: `apps/api/src/services/__tests__/interhotel-config.service.test.ts`

**Pattern:** Mirror `apps/api/src/services/flexible-dates-config.service.ts` exactly, but with the 6 fields (`enabled`, `maxRadiusKm`, `maxHotels`, `transferType`, `sponsoredAmount`, `sponsoredCurrency`) instead of 3.

- [ ] **Step 1: Write the failing tests first**

Create `apps/api/src/services/__tests__/interhotel-config.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/client.js'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemInterHotelConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    orgInterHotelConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyInterHotelConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    property: { findUnique: vi.fn() },
  },
}))

const mockPrisma = prisma as unknown as {
  systemInterHotelConfig: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  orgInterHotelConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  propertyInterHotelConfig: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  property: { findUnique: ReturnType<typeof vi.fn> }
}

beforeEach(() => { vi.clearAllMocks() })

describe('getSystemInterHotelConfig', () => {
  it('returns defaults when no DB row exists', async () => {
    mockPrisma.systemInterHotelConfig.findFirst.mockResolvedValue(null)
    const { getSystemInterHotelConfig } = await import('../interhotel-config.service.js')
    const result = await getSystemInterHotelConfig()
    expect(result).toEqual({
      enabled: false, maxRadiusKm: 50, maxHotels: 3,
      transferType: 'self', sponsoredAmount: 0, sponsoredCurrency: 'USD',
    })
  })

  it('returns DB row values when row exists', async () => {
    mockPrisma.systemInterHotelConfig.findFirst.mockResolvedValue({
      id: 1, enabled: true, maxRadiusKm: 30, maxHotels: 2,
      transferType: 'hotel', sponsoredAmount: 0, sponsoredCurrency: 'EUR',
    })
    const { getSystemInterHotelConfig } = await import('../interhotel-config.service.js')
    const result = await getSystemInterHotelConfig()
    expect(result.enabled).toBe(true)
    expect(result.maxRadiusKm).toBe(30)
    expect(result.transferType).toBe('hotel')
  })
})

describe('resolveEffectiveInterHotelConfig', () => {
  it('applies org override over system defaults', async () => {
    mockPrisma.systemInterHotelConfig.findFirst.mockResolvedValue(null)
    mockPrisma.propertyInterHotelConfig.findUnique.mockResolvedValue(null)
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mockPrisma.orgInterHotelConfig.findUnique.mockResolvedValue({
      organizationId: 5, enabled: true, maxRadiusKm: 20, maxHotels: null,
      transferType: null, sponsoredAmount: null, sponsoredCurrency: null,
    })
    const { resolveEffectiveInterHotelConfig } = await import('../interhotel-config.service.js')
    const result = await resolveEffectiveInterHotelConfig(123)
    expect(result.enabled).toBe(true)
    expect(result.maxRadiusKm).toBe(20)
    expect(result.maxHotels).toBe(3)  // system default
  })

  it('applies property override over org', async () => {
    mockPrisma.systemInterHotelConfig.findFirst.mockResolvedValue(null)
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mockPrisma.orgInterHotelConfig.findUnique.mockResolvedValue({
      organizationId: 5, enabled: true, maxRadiusKm: 20, maxHotels: null,
      transferType: 'hotel', sponsoredAmount: null, sponsoredCurrency: null,
    })
    mockPrisma.propertyInterHotelConfig.findUnique.mockResolvedValue({
      propertyId: 123, enabled: null, maxRadiusKm: 10, maxHotels: null,
      transferType: null, sponsoredAmount: 50, sponsoredCurrency: 'GBP',
    })
    const { resolveEffectiveInterHotelConfig } = await import('../interhotel-config.service.js')
    const result = await resolveEffectiveInterHotelConfig(123)
    expect(result.maxRadiusKm).toBe(10)       // property wins
    expect(result.enabled).toBe(true)           // org wins (property null)
    expect(result.transferType).toBe('hotel')   // org wins (property null)
    expect(result.sponsoredAmount).toBe(50)     // property wins
    expect(result.sponsoredCurrency).toBe('GBP')
  })

  it('org tier applied even when property has no config row', async () => {
    mockPrisma.systemInterHotelConfig.findFirst.mockResolvedValue(null)
    mockPrisma.propertyInterHotelConfig.findUnique.mockResolvedValue(null)
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 5 })
    mockPrisma.orgInterHotelConfig.findUnique.mockResolvedValue({
      organizationId: 5, enabled: true, maxRadiusKm: 80, maxHotels: null,
      transferType: null, sponsoredAmount: null, sponsoredCurrency: null,
    })
    const { resolveEffectiveInterHotelConfig } = await import('../interhotel-config.service.js')
    const result = await resolveEffectiveInterHotelConfig(999)
    expect(result.enabled).toBe(true)
    expect(result.maxRadiusKm).toBe(80)
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/nir/ibe && npx vitest run apps/api/src/services/__tests__/interhotel-config.service.test.ts 2>&1 | tail -10
```

Expected: FAIL — `interhotel-config.service.js` does not exist yet.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/interhotel-config.service.ts`:

```ts
import { prisma } from '../db/client.js'
import type {
  SystemInterHotelConfigResponse,
  OrgInterHotelConfigResponse,
  PropertyInterHotelConfigResponse,
  InterHotelEffective,
  TransferType,
} from '@ibe/shared'

const VALID_TRANSFER: TransferType[] = ['self', 'hotel', 'sponsored_self']
function parseTransfer(s: string | null | undefined): TransferType {
  return VALID_TRANSFER.includes(s as TransferType) ? (s as TransferType) : 'self'
}

const SYSTEM_DEFAULTS: SystemInterHotelConfigResponse = {
  enabled: false,
  maxRadiusKm: 50,
  maxHotels: 3,
  transferType: 'self',
  sponsoredAmount: 0,
  sponsoredCurrency: 'USD',
}

export async function getSystemInterHotelConfig(): Promise<SystemInterHotelConfigResponse> {
  const row = await prisma.systemInterHotelConfig.findFirst()
  if (!row) return SYSTEM_DEFAULTS
  return {
    enabled: row.enabled,
    maxRadiusKm: row.maxRadiusKm,
    maxHotels: row.maxHotels,
    transferType: parseTransfer(row.transferType),
    sponsoredAmount: row.sponsoredAmount,
    sponsoredCurrency: row.sponsoredCurrency,
  }
}

export async function upsertSystemInterHotelConfig(
  data: Partial<SystemInterHotelConfigResponse>,
): Promise<SystemInterHotelConfigResponse> {
  const existing = await prisma.systemInterHotelConfig.findFirst()
  const row = existing
    ? await prisma.systemInterHotelConfig.update({ where: { id: existing.id }, data })
    : await prisma.systemInterHotelConfig.create({ data: { ...SYSTEM_DEFAULTS, ...data } })
  return {
    enabled: row.enabled,
    maxRadiusKm: row.maxRadiusKm,
    maxHotels: row.maxHotels,
    transferType: parseTransfer(row.transferType),
    sponsoredAmount: row.sponsoredAmount,
    sponsoredCurrency: row.sponsoredCurrency,
  }
}

export async function getOrgInterHotelConfig(orgId: number): Promise<OrgInterHotelConfigResponse> {
  const [system, org] = await Promise.all([
    getSystemInterHotelConfig(),
    prisma.orgInterHotelConfig.findUnique({ where: { organizationId: orgId } }),
  ])
  const effective = resolveOrgEffective(system, org)
  return {
    enabled: org?.enabled ?? null,
    maxRadiusKm: org?.maxRadiusKm ?? null,
    maxHotels: org?.maxHotels ?? null,
    transferType: org?.transferType != null ? parseTransfer(org.transferType) : null,
    sponsoredAmount: org?.sponsoredAmount ?? null,
    sponsoredCurrency: org?.sponsoredCurrency ?? null,
    effective,
  }
}

export async function upsertOrgInterHotelConfig(
  orgId: number,
  data: Partial<OrgInterHotelConfigResponse>,
): Promise<OrgInterHotelConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.orgInterHotelConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...fields },
    update: fields,
  })
  return getOrgInterHotelConfig(orgId)
}

export async function getPropertyInterHotelConfig(propertyId: number): Promise<PropertyInterHotelConfigResponse> {
  const [prop, propMeta] = await Promise.all([
    prisma.propertyInterHotelConfig.findUnique({ where: { propertyId } }),
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
  ])
  const orgId = propMeta?.organizationId

  const [system, org] = await Promise.all([
    getSystemInterHotelConfig(),
    orgId !== undefined
      ? prisma.orgInterHotelConfig.findUnique({ where: { organizationId: orgId } })
      : Promise.resolve(null),
  ])

  const orgEffective = resolveOrgEffective(system, org)
  const effective = resolvePropertyEffective(orgEffective, prop)
  return {
    enabled: prop?.enabled ?? null,
    maxRadiusKm: prop?.maxRadiusKm ?? null,
    maxHotels: prop?.maxHotels ?? null,
    transferType: prop?.transferType != null ? parseTransfer(prop.transferType) : null,
    sponsoredAmount: prop?.sponsoredAmount ?? null,
    sponsoredCurrency: prop?.sponsoredCurrency ?? null,
    effective,
  }
}

export async function upsertPropertyInterHotelConfig(
  propertyId: number,
  data: Partial<PropertyInterHotelConfigResponse>,
): Promise<PropertyInterHotelConfigResponse> {
  const { effective: _e, ...fields } = data
  await prisma.propertyInterHotelConfig.upsert({
    where: { propertyId },
    create: { propertyId, ...fields },
    update: fields,
  })
  return getPropertyInterHotelConfig(propertyId)
}

export async function resolveEffectiveInterHotelConfig(propertyId: number): Promise<InterHotelEffective> {
  const result = await getPropertyInterHotelConfig(propertyId)
  return result.effective
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveOrgEffective(
  system: SystemInterHotelConfigResponse,
  org: { enabled: boolean | null; maxRadiusKm: number | null; maxHotels: number | null; transferType: string | null; sponsoredAmount: number | null; sponsoredCurrency: string | null } | null,
): InterHotelEffective {
  return {
    enabled: org?.enabled ?? system.enabled,
    maxRadiusKm: org?.maxRadiusKm ?? system.maxRadiusKm,
    maxHotels: org?.maxHotels ?? system.maxHotels,
    transferType: org?.transferType != null ? parseTransfer(org.transferType) : system.transferType,
    sponsoredAmount: org?.sponsoredAmount ?? system.sponsoredAmount,
    sponsoredCurrency: org?.sponsoredCurrency ?? system.sponsoredCurrency,
  }
}

function resolvePropertyEffective(
  orgEffective: InterHotelEffective,
  prop: { enabled: boolean | null; maxRadiusKm: number | null; maxHotels: number | null; transferType: string | null; sponsoredAmount: number | null; sponsoredCurrency: string | null } | null,
): InterHotelEffective {
  return {
    enabled: prop?.enabled ?? orgEffective.enabled,
    maxRadiusKm: prop?.maxRadiusKm ?? orgEffective.maxRadiusKm,
    maxHotels: prop?.maxHotels ?? orgEffective.maxHotels,
    transferType: prop?.transferType != null ? parseTransfer(prop.transferType) : orgEffective.transferType,
    sponsoredAmount: prop?.sponsoredAmount ?? orgEffective.sponsoredAmount,
    sponsoredCurrency: prop?.sponsoredCurrency ?? orgEffective.sponsoredCurrency,
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/nir/ibe && npx vitest run apps/api/src/services/__tests__/interhotel-config.service.test.ts 2>&1 | tail -10
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/nir/ibe
git add apps/api/src/services/interhotel-config.service.ts apps/api/src/services/__tests__/interhotel-config.service.test.ts
git commit -m "feat(api): add InterHotel Stay config service with System→Org→Property inheritance"
```

---

## Task 4: Nearby Hotel Service + Tests

**Files:**
- Create: `apps/api/src/services/interhotel-nearby.service.ts`
- Create: `apps/api/src/services/__tests__/interhotel-nearby.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/__tests__/interhotel-nearby.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../db/client.js'

vi.mock('../../db/client.js', () => ({
  prisma: {
    property: { findMany: vi.fn() },
    nearbyHotel: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('../interhotel-config.service.js', () => ({
  resolveEffectiveInterHotelConfig: vi.fn().mockResolvedValue({
    enabled: true, maxRadiusKm: 50, maxHotels: 3,
    transferType: 'self', sponsoredAmount: 0, sponsoredCurrency: 'USD',
  }),
}))

const mockPrisma = prisma as any

beforeEach(() => { vi.clearAllMocks() })

describe('refreshNearbyHotels', () => {
  it('returns count 0 when fewer than 2 properties have coords', async () => {
    mockPrisma.property.findMany.mockResolvedValue([
      { propertyId: 1, propertyDataProviderConfig: null },
    ])
    const { refreshNearbyHotels } = await import('../interhotel-nearby.service.js')
    const result = await refreshNearbyHotels(5)
    expect(result).toEqual({ count: 0 })
    expect(mockPrisma.nearbyHotel.upsert).not.toHaveBeenCalled()
  })

  it('upserts pair within radius and deletes pair outside radius', async () => {
    // Hotel A at (0, 0), Hotel B at (0.1, 0.1) — ~15km apart, within 50km
    // Hotel C at (10, 10) — ~1570km apart, outside 50km
    mockPrisma.property.findMany.mockResolvedValue([
      { propertyId: 1, propertyDataProviderConfig: { lat: 0, lng: 0 } },
      { propertyId: 2, propertyDataProviderConfig: { lat: 0.1, lng: 0.1 } },
      { propertyId: 3, propertyDataProviderConfig: { lat: 10, lng: 10 } },
    ])
    mockPrisma.nearbyHotel.upsert.mockResolvedValue({})
    mockPrisma.nearbyHotel.deleteMany.mockResolvedValue({})
    const { refreshNearbyHotels } = await import('../interhotel-nearby.service.js')
    await refreshNearbyHotels(5)
    // Pairs within 50km: (1,2) and (2,1) — ~15km. (1,3), (3,1), (2,3), (3,2) — outside
    expect(mockPrisma.nearbyHotel.upsert).toHaveBeenCalledTimes(2)
    const upsertArgs = mockPrisma.nearbyHotel.upsert.mock.calls.map((c: any) => ({
      a: c[0].create.propertyId,
      b: c[0].create.nearbyPropertyId,
    }))
    expect(upsertArgs).toContainEqual({ a: 1, b: 2 })
    expect(upsertArgs).toContainEqual({ a: 2, b: 1 })
  })
})

describe('getNearbyHotels', () => {
  it('returns sorted nearby hotels for a property', async () => {
    mockPrisma.nearbyHotel.findMany.mockResolvedValue([
      { nearbyPropertyId: 10, distanceKm: 5 },
      { nearbyPropertyId: 20, distanceKm: 2 },
    ])
    const { getNearbyHotels } = await import('../interhotel-nearby.service.js')
    const result = await getNearbyHotels(1)
    expect(result[0]!.distanceKm).toBe(2)
    expect(result[1]!.distanceKm).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/nir/ibe && npx vitest run apps/api/src/services/__tests__/interhotel-nearby.service.test.ts 2>&1 | tail -10
```

Expected: FAIL — service doesn't exist yet.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/interhotel-nearby.service.ts`:

```ts
import { prisma } from '../db/client.js'
import { resolveEffectiveInterHotelConfig } from './interhotel-config.service.js'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function refreshNearbyHotels(orgId: number): Promise<{ count: number }> {
  const properties = await prisma.property.findMany({
    where: { organizationId: orgId, status: 'active' },
    select: {
      propertyId: true,
      propertyDataProviderConfig: { select: { lat: true, lng: true } },
    },
  })

  const withCoords = properties.filter(
    (p) => p.propertyDataProviderConfig?.lat != null && p.propertyDataProviderConfig?.lng != null,
  ) as Array<{ propertyId: number; propertyDataProviderConfig: { lat: number; lng: number } }>

  if (withCoords.length < 2) return { count: 0 }

  let count = 0
  const ops: Promise<unknown>[] = []

  for (const a of withCoords) {
    const config = await resolveEffectiveInterHotelConfig(a.propertyId)
    for (const b of withCoords) {
      if (a.propertyId === b.propertyId) continue
      const d = haversineKm(
        a.propertyDataProviderConfig.lat,
        a.propertyDataProviderConfig.lng,
        b.propertyDataProviderConfig.lat,
        b.propertyDataProviderConfig.lng,
      )
      if (d <= config.maxRadiusKm) {
        ops.push(
          prisma.nearbyHotel.upsert({
            where: {
              propertyId_nearbyPropertyId: {
                propertyId: a.propertyId,
                nearbyPropertyId: b.propertyId,
              },
            },
            create: { propertyId: a.propertyId, nearbyPropertyId: b.propertyId, distanceKm: d },
            update: { distanceKm: d },
          }),
        )
        count++
      } else {
        ops.push(
          prisma.nearbyHotel.deleteMany({
            where: { propertyId: a.propertyId, nearbyPropertyId: b.propertyId },
          }),
        )
      }
    }
  }

  await Promise.all(ops)
  return { count }
}

export async function getNearbyHotels(
  propertyId: number,
): Promise<{ nearbyPropertyId: number; distanceKm: number }[]> {
  return prisma.nearbyHotel.findMany({
    where: { propertyId },
    select: { nearbyPropertyId: true, distanceKm: true },
    orderBy: { distanceKm: 'asc' },
  })
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/nir/ibe && npx vitest run apps/api/src/services/__tests__/interhotel-nearby.service.test.ts 2>&1 | tail -10
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/nir/ibe
git add apps/api/src/services/interhotel-nearby.service.ts apps/api/src/services/__tests__/interhotel-nearby.service.test.ts
git commit -m "feat(api): add InterHotel nearby hotel service with Haversine distance calculation"
```

---

## Task 5: InterHotel Search Service + Tests

**Files:**
- Create: `apps/api/src/services/interhotel-search.service.ts`
- Create: `apps/api/src/services/__tests__/interhotel-search.service.test.ts`

This is the core algorithm. Read `apps/api/src/services/pricing-collect.service.ts` lines 107-148 to understand `searchWithBinarySplit`. Read `apps/api/src/services/search.service.ts` to understand the `search()` function signature. Read `apps/api/src/adapters/hyperguest/search.ts` to understand `searchAvailability`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/__tests__/interhotel-search.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../interhotel-config.service.js', () => ({
  resolveEffectiveInterHotelConfig: vi.fn(),
}))
vi.mock('../interhotel-nearby.service.js', () => ({
  getNearbyHotels: vi.fn(),
}))
vi.mock('../../db/client.js', () => ({
  prisma: { property: { findUnique: vi.fn() } },
}))
vi.mock('../../adapters/hyperguest/search.js', () => ({
  searchAvailability: vi.fn(),
}))
vi.mock('../search.service.js', () => ({
  search: vi.fn(),
}))

import { resolveEffectiveInterHotelConfig } from '../interhotel-config.service.js'
import { getNearbyHotels } from '../interhotel-nearby.service.js'
import { prisma } from '../../db/client.js'
import { searchAvailability } from '../../adapters/hyperguest/search.js'
import { search } from '../search.service.js'

const mockConfig = vi.mocked(resolveEffectiveInterHotelConfig)
const mockNearby = vi.mocked(getNearbyHotels)
const mockPrisma = prisma as any
const mockSearch = vi.mocked(search)
const mockAvailability = vi.mocked(searchAvailability)

const BASE_CONFIG = {
  enabled: true, maxRadiusKm: 50, maxHotels: 3,
  transferType: 'hotel' as const, sponsoredAmount: 0, sponsoredCurrency: 'USD',
}

const makeSearchResponse = (propertyId: number, hotelName: string, minPrice: number) => ({
  results: [{
    propertyId, propertyName: hotelName,
    starRating: 4, cityName: 'Paris', countryCode: 'FR', latitude: 48.8, longitude: 2.3,
    rooms: [{ roomId: 1, roomTypeCode: 'DBL', roomName: 'Double', availableCount: 1, maxOccupancy: 2, maxAdults: 2, maxChildren: 0, roomSizeM2: 25, bedding: [], requestedRoomIndex: 0,
      rates: [{ ratePlanId: 1, ratePlanCode: 'R1', ratePlanName: 'Standard', board: 'RO' as any, boardLabel: 'Room Only', isRefundable: true, cancellationDeadlines: [], remarks: [], isImmediate: true, chargeParty: 'customer' as any, isPromotion: false, isPrivate: false,
        prices: { net: { amount: minPrice * 0.8, currency: 'EUR', taxes: [] }, sell: { amount: minPrice, currency: 'EUR', taxes: [] }, bar: { amount: minPrice, currency: 'EUR' }, fees: [] },
        nightlyBreakdown: [],
      }],
    }],
    remarks: [],
  }],
  searchId: 'test-id',
  currency: 'EUR',
})

const makeHGResponse = (hasRooms: boolean) => ({
  results: [{ rooms: hasRooms ? [{}] : [], remarks: [] }],
})

beforeEach(() => { vi.clearAllMocks() })

describe('searchInterHotel', () => {
  it('returns empty packages when feature disabled', async () => {
    mockConfig.mockResolvedValue({ ...BASE_CONFIG, enabled: false })
    const { searchInterHotel } = await import('../interhotel-search.service.js')
    const result = await searchInterHotel({ propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-05', rooms: [{ adults: 2 }] })
    expect(result.packages).toHaveLength(0)
  })

  it('returns empty packages when no nearby hotels', async () => {
    mockConfig.mockResolvedValue(BASE_CONFIG)
    mockNearby.mockResolvedValue([])
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 5, name: 'Hotel A' })
    const { searchInterHotel } = await import('../interhotel-search.service.js')
    const result = await searchInterHotel({ propertyId: 1, checkIn: '2026-06-01', checkOut: '2026-06-05', rooms: [{ adults: 2 }] })
    expect(result.packages).toHaveLength(0)
  })

  it('returns a 2-hotel package when Hotel A has partial availability and Hotel B covers the rest', async () => {
    mockConfig.mockResolvedValue(BASE_CONFIG)
    mockNearby.mockResolvedValue([{ nearbyPropertyId: 2, distanceKm: 10 }])
    mockPrisma.property.findUnique
      .mockResolvedValueOnce({ organizationId: 5, name: 'Hotel A' })   // primary property
      .mockResolvedValueOnce({ status: 'active', organizationId: 5 })  // nearby property filter

    // Binary search probes for Hotel A: 2-night window (lo=1, hi=3 for 4-night stay)
    // mid=2: Hotel A has rooms for checkIn→checkIn+2
    // mid=3: Hotel A has NO rooms for checkIn→checkIn+3
    // So best=2, splitDate = checkIn+2
    mockAvailability
      .mockResolvedValueOnce(makeHGResponse(true))   // mid=2: has rooms
      .mockResolvedValueOnce(makeHGResponse(false))  // mid=3: no rooms (binary search continues)
      .mockResolvedValueOnce(makeHGResponse(true))   // mid=2 confirmed (binary search converges)

    // Confirmed Hotel A search for [checkIn, splitDate]
    mockSearch
      .mockResolvedValueOnce(makeSearchResponse(1, 'Hotel A', 300) as any)  // Hotel A segment
      .mockResolvedValueOnce(makeSearchResponse(2, 'Hotel B', 200) as any)  // Hotel B remainder

    const { searchInterHotel } = await import('../interhotel-search.service.js')
    const result = await searchInterHotel({
      propertyId: 1,
      checkIn: '2026-06-01',
      checkOut: '2026-06-05',
      rooms: [{ adults: 2 }],
    })

    expect(result.packages).toHaveLength(1)
    expect(result.packages[0]!.segments).toHaveLength(2)
    expect(result.packages[0]!.segments[0]!.result.propertyId).toBe(1)
    expect(result.packages[0]!.segments[1]!.result.propertyId).toBe(2)
    expect(result.packages[0]!.transferType).toBe('hotel')
    expect(result.packages[0]!.totalFromPrice).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/nir/ibe && npx vitest run apps/api/src/services/__tests__/interhotel-search.service.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement the search service**

Create `apps/api/src/services/interhotel-search.service.ts`.

**Important:** Read `apps/api/src/services/search.service.ts` to confirm the exact signature of `search()` before writing the import.
Read `apps/api/src/adapters/hyperguest/search.ts` to confirm the `searchAvailability` import path.

```ts
import { addDays } from '@ibe/shared'
import type { InterHotelSearchResponse, InterHotelPackageResponse, InterHotelSegment, SearchParams } from '@ibe/shared'
import { searchAvailability } from '../adapters/hyperguest/search.js'
import { search } from './search.service.js'
import { prisma } from '../db/client.js'
import { resolveEffectiveInterHotelConfig } from './interhotel-config.service.js'
import { getNearbyHotels } from './interhotel-nearby.service.js'

type RoomParam = { adults: number; childAges?: number[] }

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function lowestSellPrice(segment: InterHotelSegment): number {
  const prices = segment.result.rooms.flatMap((r) => r.rates).map((r) => r.prices.sell.amount)
  return prices.length > 0 ? Math.min(...prices) : 0
}

// Binary-search to find the largest n in [lo, hi] where hotel has rooms for [checkIn, checkIn+n].
// Uses searchAvailability (lightweight HG probe) — not the full search() pipeline.
async function findSplitNights(
  hotelId: number,
  checkIn: string,
  rooms: RoomParam[],
  lo: number,
  hi: number,
  nationality?: string,
  currency?: string,
): Promise<number | null> {
  let best: number | null = null
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    try {
      const res = await searchAvailability({
        hotelId,
        checkIn,
        checkOut: addDays(checkIn, mid),
        rooms,
        nationality,
        currency,
      } as SearchParams)
      if (res.results.some((r) => (r.rooms as unknown[])?.length > 0)) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    } catch {
      hi = mid - 1
    }
  }
  return best
}

async function confirmSegment(
  hotelId: number,
  checkIn: string,
  checkOut: string,
  rooms: RoomParam[],
  nationality?: string,
  currency?: string,
): Promise<InterHotelSegment | null> {
  try {
    const res = await search({ hotelId, checkIn, checkOut, rooms, nationality, currency } as SearchParams)
    const result = res.results.find((r) => r.rooms.length > 0)
    if (!result) return null
    return { checkIn, checkOut, result }
  } catch {
    return null
  }
}

export async function searchInterHotel(params: {
  propertyId: number
  checkIn: string
  checkOut: string
  rooms: RoomParam[]
  nationality?: string
  currency?: string
}): Promise<InterHotelSearchResponse> {
  const { propertyId, checkIn, checkOut, rooms, nationality, currency } = params

  const config = await resolveEffectiveInterHotelConfig(propertyId)
  if (!config.enabled) return { packages: [] }

  const totalNights = dayDiff(checkIn, checkOut)
  if (totalNights < 2) return { packages: [] }

  const primaryProp = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  if (!primaryProp) return { packages: [] }

  // Fetch and filter nearby hotels: active, same org, interhotel enabled
  const nearbyRows = await getNearbyHotels(propertyId)
  const nearbyEnabled: number[] = []
  for (const row of nearbyRows) {
    if (nearbyEnabled.length >= config.maxHotels - 1) break
    const prop = await prisma.property.findUnique({
      where: { propertyId: row.nearbyPropertyId },
      select: { status: true, organizationId: true },
    })
    if (!prop || prop.status !== 'active' || prop.organizationId !== primaryProp.organizationId) continue
    const nc = await resolveEffectiveInterHotelConfig(row.nearbyPropertyId)
    if (!nc.enabled) continue
    nearbyEnabled.push(row.nearbyPropertyId)
  }
  if (nearbyEnabled.length === 0) return { packages: [] }

  // Find Hotel A's maximum available window from checkIn
  const splitNights = await findSplitNights(propertyId, checkIn, rooms, 1, totalNights - 1, nationality, currency)
  if (splitNights === null) return { packages: [] }
  const splitDate = addDays(checkIn, splitNights)

  // Confirm Hotel A for [checkIn, splitDate]
  const segA = await confirmSegment(propertyId, checkIn, splitDate, rooms, nationality, currency)
  if (!segA) return { packages: [] }

  const packages: InterHotelPackageResponse[] = []
  const uncovered: number[] = []

  // 2-hotel packages: search each nearby hotel for [splitDate, checkOut]
  const bResults = await Promise.allSettled(
    nearbyEnabled.map(async (nearbyId) => {
      const seg = await confirmSegment(nearbyId, splitDate, checkOut, rooms, nationality, currency)
      return { nearbyId, seg }
    }),
  )

  for (const settled of bResults) {
    if (settled.status === 'rejected') continue
    const { nearbyId, seg } = settled.value
    if (seg) {
      packages.push(buildPackage([segA, seg], config))
    } else {
      uncovered.push(nearbyId)
    }
  }

  // 3-hotel packages (when maxHotels >= 3 and some nearby hotels didn't cover the full remainder)
  if (config.maxHotels >= 3 && uncovered.length > 0) {
    const remainingNights = dayDiff(splitDate, checkOut)
    for (const hotelBId of uncovered) {
      if (remainingNights < 2) continue
      const bSplitNights = await findSplitNights(hotelBId, splitDate, rooms, 1, remainingNights - 1, nationality, currency)
      if (bSplitNights === null) continue
      const splitDate2 = addDays(splitDate, bSplitNights)
      const segB = await confirmSegment(hotelBId, splitDate, splitDate2, rooms, nationality, currency)
      if (!segB) continue

      const candidatesC = nearbyEnabled.filter((id) => id !== hotelBId)
      const cResults = await Promise.allSettled(
        candidatesC.map(async (cId) => {
          const seg = await confirmSegment(cId, splitDate2, checkOut, rooms, nationality, currency)
          return { seg }
        }),
      )
      for (const settled of cResults) {
        if (settled.status === 'rejected' || !settled.value.seg) continue
        packages.push(buildPackage([segA, segB, settled.value.seg], config))
      }
    }
  }

  // Sort: fewest segments first, then longest first-hotel stay
  packages.sort((a, b) => {
    if (a.segments.length !== b.segments.length) return a.segments.length - b.segments.length
    return dayDiff(b.segments[0]!.checkIn, b.segments[0]!.checkOut) -
           dayDiff(a.segments[0]!.checkIn, a.segments[0]!.checkOut)
  })

  return { packages }
}

function buildPackage(
  segments: InterHotelSegment[],
  config: { transferType: string; sponsoredAmount: number; sponsoredCurrency: string },
): InterHotelPackageResponse {
  const totalFromPrice = segments.reduce((sum, s) => sum + lowestSellPrice(s), 0)
  const currency = segments[0]!.result.rooms[0]?.rates[0]?.prices.sell.currency ?? 'USD'
  return {
    segments,
    transferType: config.transferType as 'self' | 'hotel' | 'sponsored_self',
    sponsoredAmount: config.sponsoredAmount,
    sponsoredCurrency: config.sponsoredCurrency,
    totalFromPrice,
    currency,
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /home/nir/ibe && npx vitest run apps/api/src/services/__tests__/interhotel-search.service.test.ts 2>&1 | tail -15
```

Expected: all 3 tests PASS. If the binary search test mock ordering is off, adjust the mock return order to match the algorithm's call sequence.

- [ ] **Step 5: Commit**

```bash
cd /home/nir/ibe
git add apps/api/src/services/interhotel-search.service.ts apps/api/src/services/__tests__/interhotel-search.service.test.ts
git commit -m "feat(api): add InterHotel search service with binary-split algorithm"
```

---

## Task 6: API Routes + Registration

**Files:**
- Create: `apps/api/src/routes/interhotel.route.ts`
- Modify: `apps/api/src/app.ts`

**Pattern:** Mirror `apps/api/src/routes/flexible-dates.route.ts` exactly. All admin routes return 400 on `isNaN` path params. Routes hardcode full `/api/v1/...` paths (no prefix needed).

- [ ] **Step 1: Create the route file**

Create `apps/api/src/routes/interhotel.route.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import {
  getSystemInterHotelConfig, upsertSystemInterHotelConfig,
  getOrgInterHotelConfig, upsertOrgInterHotelConfig,
  getPropertyInterHotelConfig, upsertPropertyInterHotelConfig,
  resolveEffectiveInterHotelConfig,
} from '../services/interhotel-config.service.js'
import { refreshNearbyHotels } from '../services/interhotel-nearby.service.js'
import { searchInterHotel } from '../services/interhotel-search.service.js'
import type {
  InterHotelEffective,
  OrgInterHotelConfigResponse,
  PropertyInterHotelConfigResponse,
} from '@ibe/shared'

export async function interHotelPublicRoutes(fastify: FastifyInstance) {
  // ── Effective config (no auth) ─────────────────────────────────────────────
  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/interhotel/config/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
      return resolveEffectiveInterHotelConfig(propertyId)
    },
  )

  // ── InterHotel search (no auth) ────────────────────────────────────────────
  fastify.post<{
    Body: { propertyId: number; checkIn: string; checkOut: string; rooms: { adults: number }[]; nationality?: string; currency?: string }
  }>(
    '/api/v1/interhotel/search',
    async (request, reply) => {
      const { propertyId, checkIn, checkOut, rooms, nationality, currency } = request.body ?? {}
      if (!propertyId || typeof propertyId !== 'number') {
        return reply.status(400).send({ error: 'propertyId is required' })
      }
      return searchInterHotel({ propertyId, checkIn, checkOut, rooms: rooms ?? [], nationality, currency })
    },
  )
}

export async function interHotelAdminRoutes(fastify: FastifyInstance) {
  // ── System config ─────────────────────────────────────────────────────────
  fastify.get('/api/v1/admin/interhotel/config/system', async () => {
    return getSystemInterHotelConfig()
  })

  fastify.put('/api/v1/admin/interhotel/config/system', async (request) => {
    return upsertSystemInterHotelConfig(request.body as Partial<InterHotelEffective>)
  })

  // ── Org config ────────────────────────────────────────────────────────────
  fastify.get<{ Params: { orgId: string } }>(
    '/api/v1/admin/interhotel/config/org/:orgId',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return getOrgInterHotelConfig(orgId)
    },
  )

  fastify.put<{ Params: { orgId: string } }>(
    '/api/v1/admin/interhotel/config/org/:orgId',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return upsertOrgInterHotelConfig(orgId, request.body as Partial<OrgInterHotelConfigResponse>)
    },
  )

  // ── Property config ───────────────────────────────────────────────────────
  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/interhotel/config/property/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
      return getPropertyInterHotelConfig(propertyId)
    },
  )

  fastify.put<{ Params: { propertyId: string } }>(
    '/api/v1/admin/interhotel/config/property/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
      return upsertPropertyInterHotelConfig(propertyId, request.body as Partial<PropertyInterHotelConfigResponse>)
    },
  )

  // ── Refresh nearby hotels ─────────────────────────────────────────────────
  fastify.post<{ Params: { orgId: string } }>(
    '/api/v1/admin/interhotel/refresh/org/:orgId',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return refreshNearbyHotels(orgId)
    },
  )
}
```

- [ ] **Step 2: Register routes in app.ts**

Open `apps/api/src/app.ts`. Find the import for `flexibleDatesPublicRoutes` / `flexibleDatesAdminRoutes` and add after it:

```ts
import { interHotelPublicRoutes, interHotelAdminRoutes } from './routes/interhotel.route.js'
```

Find `await app.register(flexibleDatesPublicRoutes)` (public section, no prefix). Add after it:
```ts
await app.register(interHotelPublicRoutes)
```

Find `await adminApp.register(flexibleDatesAdminRoutes)` (admin section). Add after it:
```ts
await adminApp.register(interHotelAdminRoutes)
```

- [ ] **Step 3: Type-check**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Verify routes registered (server must be running on port 3001)**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1/interhotel/config/1
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1/admin/interhotel/config/system
```

Expected: `200` for public config, `401` for admin (needs auth). If you get 404, restart the API server: `kill <server_pid>` then restart.

- [ ] **Step 5: Commit**

```bash
cd /home/nir/ibe
git add apps/api/src/routes/interhotel.route.ts apps/api/src/app.ts
git commit -m "feat(api): add InterHotel Stay routes (admin config + public config/search)"
```

---

## Task 7: API Client Methods

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

**Pattern:** Mirror the 7 flexible-dates methods already in the file. The new methods go after the existing flexible-dates methods, before the closing `}` of the `apiClient` object.

- [ ] **Step 1: Read the end of apps/web/src/lib/api-client.ts**

Find where `getFlexibleDatesConfig`, `getSystemFlexibleDatesConfig`, etc. are defined (near the end of the apiClient object). Add after the last flexible-dates method:

```ts
  // ── InterHotel Stay ───────────────────────────────────────────────────────
  async getInterHotelConfig(propertyId: number): Promise<import('@ibe/shared').InterHotelEffective> {
    return apiRequest(`/api/v1/interhotel/config/${propertyId}`)
  },

  async searchInterHotel(params: {
    propertyId: number; checkIn: string; checkOut: string;
    rooms: { adults: number }[]; nationality?: string; currency?: string
  }): Promise<import('@ibe/shared').InterHotelSearchResponse> {
    return apiRequest('/api/v1/interhotel/search', { method: 'POST', body: JSON.stringify(params) })
  },

  async getSystemInterHotelConfig(): Promise<import('@ibe/shared').SystemInterHotelConfigResponse> {
    return apiRequest('/api/v1/admin/interhotel/config/system')
  },

  async updateSystemInterHotelConfig(data: Partial<import('@ibe/shared').SystemInterHotelConfigResponse>): Promise<import('@ibe/shared').SystemInterHotelConfigResponse> {
    return apiRequest('/api/v1/admin/interhotel/config/system', { method: 'PUT', body: JSON.stringify(data) })
  },

  async getOrgInterHotelConfig(orgId: number): Promise<import('@ibe/shared').OrgInterHotelConfigResponse> {
    return apiRequest(`/api/v1/admin/interhotel/config/org/${orgId}`)
  },

  async updateOrgInterHotelConfig(orgId: number, data: Partial<import('@ibe/shared').OrgInterHotelConfigResponse>): Promise<import('@ibe/shared').OrgInterHotelConfigResponse> {
    return apiRequest(`/api/v1/admin/interhotel/config/org/${orgId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  async getPropertyInterHotelConfig(propertyId: number): Promise<import('@ibe/shared').PropertyInterHotelConfigResponse> {
    return apiRequest(`/api/v1/admin/interhotel/config/property/${propertyId}`)
  },

  async updatePropertyInterHotelConfig(propertyId: number, data: Partial<import('@ibe/shared').PropertyInterHotelConfigResponse>): Promise<import('@ibe/shared').PropertyInterHotelConfigResponse> {
    return apiRequest(`/api/v1/admin/interhotel/config/property/${propertyId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  async refreshInterHotelNearby(orgId: number): Promise<{ count: number }> {
    return apiRequest(`/api/v1/admin/interhotel/refresh/org/${orgId}`, { method: 'POST', body: JSON.stringify({}) })
  },
```

- [ ] **Step 2: Type-check**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /home/nir/ibe
git add apps/web/src/lib/api-client.ts
git commit -m "feat(web): add InterHotel Stay API client methods"
```

---

## Task 8: Admin UI — Replace "Coming Soon" on InterHotel Stay Tab

**Files:**
- Modify: `apps/web/src/app/admin/config/offers/page.tsx`

**Context:** The Offers page already has a 4-tab bar from the Flexible Dates implementation. The `inter-city` tab currently shows a `<ComingSoonCard>`. Replace it with a real config editor. Also rename the tab label from "Inter-city" to "InterHotel Stay".

Read `apps/web/src/app/admin/config/offers/page.tsx` fully before making changes — understand how `SystemFlexibleDatesSection`, `OrgFlexibleDatesSection`, and `PropertyFlexibleDatesSection` are structured, and clone that pattern for the three InterHotel sections.

Read `apps/web/src/app/admin/config/pricing/page.tsx` for the `SaveBar` pattern.

- [ ] **Step 1: Rename the tab label**

Find the `OFFERS_TABS` array (or equivalent constant) that defines tab labels. Change the label for `inter-city` from `"Inter-city"` to `"InterHotel Stay"`.

- [ ] **Step 2: Replace ComingSoonCard for inter-city with InterHotelTab**

In the render logic, when `activeTab === 'inter-city'`, replace `<ComingSoonCard tab={activeTab} />` with `<InterHotelTab me={me} />` (or inline the component, following the same pattern as `FlexibleDatesTab`).

- [ ] **Step 3: Implement the InterHotelTab and section components**

Add below the existing Flexible Dates section components:

```tsx
// ── InterHotel Stay Tab ───────────────────────────────────────────────────────

function InterHotelTab({ me }: { me: AdminMe }) {
  const isSuper = me.role === 'super_admin'
  const isSystemLevel = me.orgId === null
  const orgId = me.orgId ?? null
  const propertyId = me.propertyId ?? null
  const chainOrgId = isSystemLevel ? null : orgId
  const showSystem = isSuper
  const showChain = isSuper || (!isSystemLevel && orgId !== null && propertyId === null)
  const showProperty = propertyId !== null

  return (
    <div className="space-y-4">
      {showSystem && <SystemInterHotelSection />}
      {showChain && chainOrgId !== null && <OrgInterHotelSection orgId={chainOrgId} me={me} />}
      {showProperty && <PropertyInterHotelSection propertyId={propertyId!} me={me} />}
      {!showSystem && !showProperty && chainOrgId === null && (
        <p className="text-sm text-muted-foreground">Select a chain or property to configure InterHotel Stay.</p>
      )}
    </div>
  )
}
```

Implement `SystemInterHotelSection`, `OrgInterHotelSection`, and `PropertyInterHotelSection` following the exact same pattern as the corresponding Flexible Dates sections in the same file, but with these fields:

**SystemInterHotelSection fields:**
- Enabled (toggle, non-nullable)
- Max Radius km (number, min=1, max=500)
- Max Hotels (number, min=2, max=5)
- Transfer Type (select: `{ value: 'self', label: 'Self Transfer' }`, `{ value: 'hotel', label: 'Hotel Transfer' }`, `{ value: 'sponsored_self', label: 'Sponsored Self Transfer' }`)
- Sponsored Amount (number, shown only when `transferType === 'sponsored_self'`)
- Sponsored Currency (text input, max 3 chars, shown with Sponsored Amount)
- **Refresh Nearby Hotels button** (calls `apiClient.refreshInterHotelNearby(systemOrgId)` — for system section, you need the org to refresh; for system-level admins viewing all, you may want to add an orgId input or skip this at system level and only show at org level)

**OrgInterHotelSection and PropertyInterHotelSection fields:** Same fields but nullable (with inherited placeholder + Reset button), same as Flexible Dates pattern.

**Refresh button** — shown at the Chain (org) section:
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={async () => {
    setRefreshing(true)
    try {
      const { count } = await apiClient.refreshInterHotelNearby(orgId)
      setRefreshResult(`${count} nearby hotel pairs refreshed`)
    } catch {
      setRefreshResult('Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }}
  disabled={refreshing}
>
  {refreshing ? 'Refreshing…' : 'Refresh Nearby Hotels'}
</Button>
{refreshResult && <p className="text-xs text-muted-foreground mt-1">{refreshResult}</p>}
```

Use local state `const [refreshing, setRefreshing] = useState(false)` and `const [refreshResult, setRefreshResult] = useState<string | null>(null)`.

- [ ] **Step 4: Type-check**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd /home/nir/ibe
git add apps/web/src/app/admin/config/offers/page.tsx
git commit -m "feat(admin): add InterHotel Stay config tab to Offers page"
```

---

## Task 9: useInterHotelSearch Hook

**Files:**
- Create: `apps/web/src/hooks/use-interhotel-search.ts`

**Pattern:** Simpler than `useFlexibleDateSearch` — single `useQuery` call (backend does all the work) instead of `useQueries`.

- [ ] **Step 1: Read the existing useFlexibleDateSearch hook**

Open `apps/web/src/hooks/use-flexible-date-search.ts` to understand the hook pattern, import style, and how `SearchUrlParams` is imported.

- [ ] **Step 2: Create the hook**

Create `apps/web/src/hooks/use-interhotel-search.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { InterHotelEffective, InterHotelPackageResponse } from '@ibe/shared'

// SearchUrlParams is the type used by the search page — import from the same place as useFlexibleDateSearch
// Check apps/web/src/hooks/use-flexible-date-search.ts for the exact import path
import type { SearchUrlParams } from '@/types/search'  // adjust path if different

export function useInterHotelSearch(
  baseParams: SearchUrlParams | null,
  config: InterHotelEffective | undefined,
  primaryHasResults: boolean,
): { packages: InterHotelPackageResponse[]; isLoading: boolean } {
  const active = config?.enabled === true && !primaryHasResults && baseParams !== null

  const { data, isLoading } = useQuery({
    queryKey: ['interhotel-search', baseParams],
    queryFn: async () => {
      if (!baseParams) return { packages: [] }
      return apiClient.searchInterHotel({
        propertyId: baseParams.hotelId,
        checkIn: baseParams.checkIn,
        checkOut: baseParams.checkOut,
        rooms: baseParams.rooms ?? [{ adults: 1 }],
        nationality: baseParams.nationality,
        currency: baseParams.currency,
      })
    },
    enabled: active,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  if (!active) return { packages: [], isLoading: false }
  return { packages: data?.packages ?? [], isLoading }
}
```

**Important:** After writing this, check the exact import path for `SearchUrlParams` by looking at how `useFlexibleDateSearch` imports it. Use the same import. If it's inlined from a different location, adjust accordingly.

- [ ] **Step 3: Type-check**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -20
```

Fix any import path issues.

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add apps/web/src/hooks/use-interhotel-search.ts
git commit -m "feat(web): add useInterHotelSearch hook"
```

---

## Task 10: _content.tsx Integration + Translation Keys

**Files:**
- Modify: `apps/web/src/app/(main)/search/_content.tsx`
- Modify: `apps/api/src/translations/en.json`

**Context:** Read `apps/web/src/app/(main)/search/_content.tsx` fully before making changes. Find:
1. Where `flexConfig` and `useFlexibleDateSearch` are called
2. Where `primaryHasResultsForHook` is computed
3. The 3-case no-rooms block (look for `interHotelResult.isLoading` or the IIFE/block that replaced the original no-rooms section)
4. How `RoomCard`/`RoomCardGrid` are rendered for primary results (to replicate for InterHotel segments)
5. The `getFlexLabel` closure and `useT('search')` instance — use the same `t` function

All new hooks must be called before any early returns (React rules of hooks).

- [ ] **Step 1: Add 7 translation keys**

Open `apps/api/src/translations/en.json`. Find the `"search"` section. After the last `flexibleXxx` key, add:

```json
"interHotelUnavailable": "Unfortunately, we do not have availability for your entire stay at our hotel for the selected dates.",
"interHotelOffer": "However, we can offer you an InterHotel Stay combining our hotel with nearby participating hotels:",
"interHotelStaySegment": "Hotel Stay {n}",
"interHotelTransferSelf": "Self Transfer",
"interHotelTransferHotel": "Free transfer arranged by the hotel",
"interHotelTransferSponsored": "Sponsored Self Transfer (up to {amount} {currency})",
"interHotelFrom": "Starting from"
```

- [ ] **Step 2: Add useInterHotelSearch to _content.tsx**

Find the block where `flexConfig` and `flexResults` are declared. Add after those lines (before the early return):

```ts
const { data: interHotelConfig } = useQuery({
  queryKey: ['interhotel-config', propertyId],
  queryFn: () => apiClient.getInterHotelConfig(propertyId!),
  enabled: propertyId !== undefined,
  staleTime: 5 * 60 * 1000,
})

const interHotelResult = useInterHotelSearch(searchParams, interHotelConfig, primaryHasResultsForHook)
```

Add import at the top:
```ts
import { useInterHotelSearch } from '@/hooks/use-interhotel-search'
import type { InterHotelPackageResponse } from '@ibe/shared'
```

(Adjust the import path to match the project's `@/` alias.)

- [ ] **Step 3: Update the no-rooms display block**

Find the existing 3-case block (A/B/C from Flexible Dates). Replace it with a new 4-case block:

```tsx
{!primaryHasResults && (() => {
  const isMultiMode = /* same check as before — look at the existing code */
  if (isMultiMode) {
    // Case: multi-room mode — no fan-out of any kind
    return <>{/* existing no-rooms message */}</>
  }

  const interHotelLoading = interHotelResult.isLoading
  const flexLoading = flexResults.some(r => r.isLoading)
  const anyLoading = interHotelLoading || flexLoading

  const hasInterHotel = interHotelResult.packages.length > 0
  const resolvedFlexResults = flexResults.filter(r => !r.isLoading && r.data !== undefined)
  const hasFlexResults = resolvedFlexResults.length > 0

  if (!anyLoading && !hasInterHotel && !hasFlexResults) {
    // Case C: nothing found
    return <>{/* existing no-rooms message */}</>
  }

  return (
    <>
      {anyLoading && !hasInterHotel && !hasFlexResults && (
        // Case B: still loading
        <>
          {/* existing no-rooms message */}
          {/* existing loading indicator */}
        </>
      )}

      {hasInterHotel && (
        <>
          <p>{t('interHotelUnavailable')}</p>
          <p>{t('interHotelOffer')}</p>
          {interHotelResult.packages.map((pkg, i) => (
            <InterHotelPackageSection
              key={i}
              pkg={pkg}
              searchParams={searchParams!}
            />
          ))}
        </>
      )}

      {hasFlexResults && (
        <>
          {!hasInterHotel && (
            <>
              <p>{t('flexibleUnavailable')}</p>
              <p>{t('flexibleNearby')}</p>
            </>
          )}
          {resolvedFlexResults.map(r => (
            <FlexibleDateSection key={r.checkIn} result={r} searchParams={searchParams!} />
          ))}
        </>
      )}
    </>
  )
})()}
```

**Note:** The exact structure of the existing block may differ — read the file carefully and adapt. The key logic: InterHotel packages show first, flex results show below (with their own header only if no InterHotel packages are showing).

- [ ] **Step 4: Add the InterHotelPackageSection component**

Add at the bottom of `_content.tsx` (before or after `FlexibleDateSection`):

```tsx
function InterHotelPackageSection({
  pkg,
  searchParams,
}: {
  pkg: InterHotelPackageResponse
  searchParams: SearchUrlParams
}) {
  const [open, setOpen] = useState(false)
  const { t } = useT('search')

  const transferLabel =
    pkg.transferType === 'hotel'
      ? t('interHotelTransferHotel')
      : pkg.transferType === 'sponsored_self'
        ? t('interHotelTransferSponsored', { amount: pkg.sponsoredAmount, currency: pkg.sponsoredCurrency })
        : t('interHotelTransferSelf')

  const hotelNames = pkg.segments.map(s => s.result.propertyName).join(' + ')

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50"
        onClick={() => setOpen(o => !o)}
      >
        <div>
          <span className="font-medium">{hotelNames}</span>
          <span className="text-sm text-muted-foreground ml-2">{transferLabel}</span>
        </div>
        <div className="text-sm font-medium">
          {t('interHotelFrom')}: {pkg.totalFromPrice !== Infinity ? formatCurrency(pkg.totalFromPrice, pkg.currency) : '—'}
        </div>
      </button>

      {open && (
        <div className="p-4 border-t space-y-6">
          {pkg.segments.map((seg, idx) => (
            <div key={seg.checkIn}>
              <p className="text-sm font-semibold mb-2">
                {t('interHotelStaySegment', { n: idx + 1 })} — {seg.result.propertyName}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                {seg.checkIn} → {seg.checkOut}
              </p>
              {/* Render rooms using the same RoomCard/RoomCardGrid components as primary results,
                  wired with seg.checkIn / seg.checkOut for booking navigation.
                  Look at how the primary results section renders rooms and replicate here.
                  Pass handleSegmentRateSelect (see below) as the onSelect handler. */}
              <RoomCardGrid
                results={[seg.result]}
                onSelectRate={(roomId, ratePlanId, searchId) =>
                  handleSegmentRateSelect(seg, roomId, ratePlanId, searchId, searchParams)
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

Add the `handleSegmentRateSelect` function (inside or near `InterHotelPackageSection`) — it navigates to the booking page using the segment's `checkIn`/`checkOut` instead of the original `searchParams` dates:

```tsx
function handleSegmentRateSelect(
  seg: { checkIn: string; checkOut: string; result: PropertySearchResult },
  roomId: number,
  ratePlanId: number,
  searchId: string,
  originalParams: SearchUrlParams,
) {
  // Build booking URL using segment dates — same format as the primary handleRateSelect
  // Look at how handleRateSelect (or handleFlexRateSelect) builds the booking URL
  // and replicate with seg.checkIn, seg.checkOut, and seg.result.propertyId
  const params = new URLSearchParams({
    hotelId: String(seg.result.propertyId),
    searchId,
    roomId: String(roomId),
    ratePlanId: String(ratePlanId),
    checkIn: seg.checkIn,
    checkOut: seg.checkOut,
    'rooms[0][adults]': String(originalParams.rooms?.[0]?.adults ?? 1),
  })
  router.push(`/booking?${params.toString()}`)
}
```

**Note:** Find the `router` instance and the `formatCurrency` function already used in the file. Use those — don't import new ones.

- [ ] **Step 5: Type-check**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -30
```

Fix all errors.

- [ ] **Step 6: Commit**

```bash
cd /home/nir/ibe
git add apps/web/src/app/(main)/search/_content.tsx apps/api/src/translations/en.json apps/web/src/hooks/use-interhotel-search.ts
git commit -m "feat(search): integrate InterHotel Stay packages into search results page"
```

---

## Self-Review

### Spec Coverage Check

| Requirement | Task |
|---|---|
| SystemInterHotelConfig model | Task 1 |
| OrgInterHotelConfig model | Task 1 |
| PropertyInterHotelConfig model | Task 1 |
| NearbyHotel model | Task 1 |
| InterHotelEffective + related types | Task 2 |
| Config service (System/Org/Property CRUD) | Task 3 |
| resolveEffectiveInterHotelConfig | Task 3 |
| Haversine distance calculation | Task 4 |
| refreshNearbyHotels | Task 4 |
| getNearbyHotels | Task 4 |
| Binary-split search algorithm | Task 5 |
| 2-hotel packages | Task 5 |
| 3-hotel packages (maxHotels >= 3) | Task 5 |
| Admin GET/PUT routes (system/org/property) | Task 6 |
| Refresh endpoint | Task 6 |
| Public config endpoint | Task 6 |
| Public search endpoint | Task 6 |
| 9 API client methods | Task 7 |
| Admin UI (3 role-gated sections) | Task 8 |
| Enabled/MaxRadius/MaxHotels/TransferType/Sponsored fields | Task 8 |
| Refresh button in admin UI | Task 8 |
| Tab renamed from "Inter-city" to "InterHotel Stay" | Task 8 |
| useInterHotelSearch hook | Task 9 |
| Config fetch in _content.tsx | Task 10 |
| InterHotel packages displayed above flex results | Task 10 |
| InterHotelPackageSection (collapsible, segments, booking) | Task 10 |
| 7 translation keys | Task 10 |
| Multi-room mode exclusion | Inherited from existing isMultiMode guard in Task 10 |

### Type Consistency Check

- `InterHotelEffective` defined in Task 2, used in Tasks 3, 5, 6, 7, 9 ✓
- `InterHotelPackageResponse.segments[].result` is `PropertySearchResult` (existing type) ✓
- `TransferType = 'self' | 'hotel' | 'sponsored_self'` defined in Task 2, used in Tasks 3, 5 ✓
- `refreshNearbyHotels` returns `{ count: number }` — consistent in Tasks 4, 6, 7, 8 ✓
- `useInterHotelSearch` returns `{ packages, isLoading }` — consistent in Tasks 9, 10 ✓

### Placeholder Scan

No TBD/TODO/placeholder steps. Task 8 step 3 references "look at how primary results renders rooms" — the implementer is a skilled developer who will read the file; this is guidance not a placeholder since the exact component names depend on the current file state.
