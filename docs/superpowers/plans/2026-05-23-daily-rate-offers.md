# Daily Rate Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist all collected HyperGuest rate offers per day (bounded by `maxOffersForAnalysis`) alongside the existing min-price calendar data, and surface Room / Board / Cancellation details on anomaly dashboard rows.

**Architecture:** Three new migrations add `DailyRateOffer`, four nullable columns to `DailyRate`, and `maxOffersForAnalysis` to all three pricing config models. The collection service is refactored to extract and store offers per 29-day window while keeping the existing `DailyRate` upsert path unchanged. The anomaly dashboard reads the denormalised cheapest-offer columns directly from `DailyRate` — no joins needed.

**Tech Stack:** PostgreSQL / Prisma, Fastify, Next.js 14, Vitest, TypeScript, `@ibe/shared` for shared types.

---

## File Map

| File | Change |
|------|--------|
| `apps/api/prisma/schema.prisma` | Add `DailyRateOffer` model; extend `DailyRate`, `SystemPricingConfig`, `OrgPricingConfig`, `PropertyPricingConfig` |
| `apps/api/prisma/schema.dev.prisma` | Same additions (SQLite dev schema) |
| `apps/api/prisma/migrations/20260523000000_add_daily_rate_offer_table/migration.sql` | Create |
| `apps/api/prisma/migrations/20260523000001_add_daily_rate_cheapest_offer_fields/migration.sql` | Create |
| `apps/api/prisma/migrations/20260523000002_add_pricing_max_offers/migration.sql` | Create |
| `packages/shared/src/types/api.ts` | Extend `DayRateAdminEntry`, `SystemPricingConfigResponse`, `OrgPricingConfigResponse`, `PropertyPricingConfigResponse` |
| `apps/api/src/services/pricing-config.service.ts` | Thread `maxOffersForAnalysis` through defaults + resolution helpers |
| `apps/api/src/services/pricing-collect.service.ts` | Add offer extraction, `deriveCancellationLabel`, `upsertDailyRateOffers` |
| `apps/api/src/routes/pricing.route.ts` | Select and return new `DailyRate` offer columns |
| `apps/web/src/app/admin/config/misc/pricing/page.tsx` | Add `maxOffersForAnalysis` input on System / Org / Property sections |
| `apps/web/src/app/admin/dashboard/page.tsx` | Add Room / Board / Cancellation columns to `AnomalyTable` |
| `apps/api/src/services/__tests__/pricing-config.service.test.ts` | Tests for `maxOffersForAnalysis` inheritance |
| `apps/api/src/services/__tests__/pricing-collect.service.test.ts` | Tests for `deriveCancellationLabel` and offer upsert |

---

## Task 1: Create migration files + update Prisma schemas

**Files:**
- Create: `apps/api/prisma/migrations/20260523000000_add_daily_rate_offer_table/migration.sql`
- Create: `apps/api/prisma/migrations/20260523000001_add_daily_rate_cheapest_offer_fields/migration.sql`
- Create: `apps/api/prisma/migrations/20260523000002_add_pricing_max_offers/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/schema.dev.prisma`

- [ ] **Step 1: Create migration for DailyRateOffer table**

Create file `apps/api/prisma/migrations/20260523000000_add_daily_rate_offer_table/migration.sql`:

```sql
CREATE TABLE "DailyRateOffer" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "roomId" INTEGER NOT NULL,
    "roomName" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "cancellationLabel" TEXT NOT NULL,
    "sellPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRateOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyRateOffer_propertyId_date_rank_key" ON "DailyRateOffer"("propertyId", "date", "rank");

ALTER TABLE "DailyRateOffer" ADD CONSTRAINT "DailyRateOffer_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 2: Create migration for DailyRate cheapest offer fields**

Create file `apps/api/prisma/migrations/20260523000001_add_daily_rate_cheapest_offer_fields/migration.sql`:

```sql
ALTER TABLE "DailyRate" ADD COLUMN "cheapestRoomId"            INTEGER;
ALTER TABLE "DailyRate" ADD COLUMN "cheapestRoomName"          TEXT;
ALTER TABLE "DailyRate" ADD COLUMN "cheapestBoard"             TEXT;
ALTER TABLE "DailyRate" ADD COLUMN "cheapestCancellationLabel" TEXT;
```

- [ ] **Step 3: Create migration for maxOffersForAnalysis**

Create file `apps/api/prisma/migrations/20260523000002_add_pricing_max_offers/migration.sql`:

```sql
ALTER TABLE "SystemPricingConfig"   ADD COLUMN "maxOffersForAnalysis" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "OrgPricingConfig"      ADD COLUMN "maxOffersForAnalysis" INTEGER;
ALTER TABLE "PropertyPricingConfig" ADD COLUMN "maxOffersForAnalysis" INTEGER;
```

- [ ] **Step 4: Update schema.prisma**

Add `DailyRateOffer` model (after the `DailyRate` model block):

```prisma
model DailyRateOffer {
  id                Int      @id @default(autoincrement())
  propertyId        Int
  property          Property @relation(fields: [propertyId], references: [propertyId], map: "DailyRateOffer_propertyId_fkey")
  date              String
  roomId            Int
  roomName          String
  board             String
  cancellationLabel String
  sellPrice         Float
  currency          String
  rank              Int
  collectedAt       DateTime @default(now())

  @@unique([propertyId, date, rank])
}
```

Extend `DailyRate` model — add 4 nullable columns and the new relation:

```prisma
  cheapestRoomId            Int?
  cheapestRoomName          String?
  cheapestBoard             String?
  cheapestCancellationLabel String?
  dailyRateOffers           DailyRateOffer[]
```

Extend `SystemPricingConfig` model:

```prisma
  maxOffersForAnalysis Int @default(10)
```

Extend `OrgPricingConfig` model:

```prisma
  maxOffersForAnalysis Int?
```

Extend `PropertyPricingConfig` model:

```prisma
  maxOffersForAnalysis Int?
```

Add back-relation on `Property` model (find the `dailyRates DailyRate[]` line and add below it):

```prisma
  dailyRateOffers DailyRateOffer[]
```

- [ ] **Step 5: Apply the same model/field additions to schema.dev.prisma**

In `schema.dev.prisma`, apply the identical model and field additions as step 4. The only difference between the two schema files is the `datasource` block (SQLite vs PostgreSQL) and the `binaryTargets` — model definitions are identical.

- [ ] **Step 6: Regenerate Prisma client**

Run from `apps/api/`:
```bash
npx prisma generate --schema=prisma/schema.prisma
```

Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(pricing): add DailyRateOffer table, cheapest offer fields on DailyRate, maxOffersForAnalysis config param"
```

---

## Task 2: Update shared types in @ibe/shared

**Files:**
- Modify: `packages/shared/src/types/api.ts`

- [ ] **Step 1: Extend DayRateAdminEntry**

Find `DayRateAdminEntry` (line ~328) and add three fields:

```ts
export interface DayRateAdminEntry extends DayPriceEntry {
  anomalyType: 'high' | 'low' | 'diff' | null
  rollingAvg: number | null
  cheapestRoomName: string | null
  cheapestBoard: string | null
  cheapestCancellationLabel: string | null
}
```

- [ ] **Step 2: Extend SystemPricingConfigResponse**

```ts
export interface SystemPricingConfigResponse extends PricingConfigValues {
  enabled: boolean
  openToAll: boolean
  refreshIntervalHours: number
  searchAdults: 1 | 2
  maxOffersForAnalysis: number
}
```

- [ ] **Step 3: Extend OrgPricingConfigResponse**

```ts
export interface OrgPricingConfigResponse {
  enabled: boolean | null
  systemServiceDisabled: boolean
  highPricePct: number | null
  lowPricePct: number | null
  highAnomalyPct: number | null
  lowAnomalyPct: number | null
  dayDifferencePct: number | null
  dayDifferenceWindow: number | null
  maxOffersForAnalysis: number | null
  effective: SystemPricingConfigResponse
}
```

- [ ] **Step 4: Extend PropertyPricingConfigResponse**

```ts
export interface PropertyPricingConfigResponse {
  enabled: boolean | null
  orgServiceDisabled: boolean
  highPricePct: number | null
  lowPricePct: number | null
  highAnomalyPct: number | null
  lowAnomalyPct: number | null
  dayDifferencePct: number | null
  dayDifferenceWindow: number | null
  maxOffersForAnalysis: number | null
  effective: SystemPricingConfigResponse
}
```

- [ ] **Step 5: Build shared package**

```bash
pnpm --filter @ibe/shared build
```

Expected: exits 0 with no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/api.ts
git commit -m "feat(pricing): add maxOffersForAnalysis and cheapest offer fields to shared pricing types"
```

---

## Task 3: Update pricing config service + tests

**Files:**
- Modify: `apps/api/src/services/pricing-config.service.ts`
- Modify: `apps/api/src/services/__tests__/pricing-config.service.test.ts`

- [ ] **Step 1: Write failing tests**

In `pricing-config.service.test.ts`, update the `SYSTEM_ROW` constant to include the new field:

```ts
const SYSTEM_ROW = {
  enabled: true, openToAll: true, refreshIntervalHours: 24, searchAdults: 1,
  highPricePct: 15, lowPricePct: 15, highAnomalyPct: 30,
  lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
  maxOffersForAnalysis: 10,
}
```

Add a new `describe` block at the end of the file:

```ts
describe('maxOffersForAnalysis inheritance', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('defaults to 10 when SystemPricingConfig row has no override', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue(null)
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue(null)
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue(null)
    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)
    expect(result.maxOffersForAnalysis).toBe(10)
  })

  it('uses system value when org and property have no override', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue({ ...SYSTEM_ROW, maxOffersForAnalysis: 5 })
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue({
      property: { organizationId: 1 },
      enabled: null, orgServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: null,
    })
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue({
      enabled: null, systemServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: null,
    })
    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)
    expect(result.maxOffersForAnalysis).toBe(5)
  })

  it('org-level override takes precedence over system', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue({ ...SYSTEM_ROW, maxOffersForAnalysis: 10 })
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue({
      property: { organizationId: 1 },
      enabled: null, orgServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: null,
    })
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue({
      enabled: null, systemServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: 3,
    })
    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)
    expect(result.maxOffersForAnalysis).toBe(3)
  })

  it('property-level override takes precedence over org and system', async () => {
    mockPrisma.systemPricingConfig.findFirst.mockResolvedValue({ ...SYSTEM_ROW, maxOffersForAnalysis: 10 })
    mockPrisma.propertyPricingConfig.findUnique.mockResolvedValue({
      property: { organizationId: 1 },
      enabled: null, orgServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: 2,
    })
    mockPrisma.orgPricingConfig.findUnique.mockResolvedValue({
      enabled: null, systemServiceDisabled: false,
      highPricePct: null, lowPricePct: null, highAnomalyPct: null,
      lowAnomalyPct: null, dayDifferencePct: null, dayDifferenceWindow: null,
      maxOffersForAnalysis: 5,
    })
    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    const result = await resolveEffectivePricingConfig(1)
    expect(result.maxOffersForAnalysis).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
cd apps/api && pnpm test
```

Expected: the four new tests fail with type errors or missing field errors. All pre-existing tests still pass.

- [ ] **Step 3: Update SYSTEM_DEFAULTS**

In `pricing-config.service.ts`, update the `SYSTEM_DEFAULTS` constant:

```ts
const SYSTEM_DEFAULTS: SystemPricingConfigResponse = {
  enabled: false,
  openToAll: true,
  refreshIntervalHours: 24,
  highPricePct: 15,
  lowPricePct: 15,
  highAnomalyPct: 30,
  lowAnomalyPct: 30,
  dayDifferencePct: 35,
  dayDifferenceWindow: 7,
  searchAdults: 1,
  maxOffersForAnalysis: 10,
}
```

- [ ] **Step 4: Update getSystemPricingConfig**

In the `getSystemPricingConfig` return, add:

```ts
maxOffersForAnalysis: row.maxOffersForAnalysis,
```

alongside the other existing fields.

- [ ] **Step 5: Update upsertSystemPricingConfig return**

The spread `{ ...SYSTEM_DEFAULTS, ...data }` in `upsertSystemPricingConfig` already passes the field through. Add `maxOffersForAnalysis` to the explicit return object:

```ts
maxOffersForAnalysis: row.maxOffersForAnalysis,
```

- [ ] **Step 6: Update getOrgPricingConfig**

In the return of `getOrgPricingConfig`, add:

```ts
maxOffersForAnalysis: org?.maxOffersForAnalysis ?? null,
```

- [ ] **Step 7: Update getPropertyPricingConfig**

In the return of `getPropertyPricingConfig`, add:

```ts
maxOffersForAnalysis: prop?.maxOffersForAnalysis ?? null,
```

- [ ] **Step 8: Update resolveOrgEffective helper**

Update the inline parameter type annotation to include `maxOffersForAnalysis: number | null`:

```ts
function resolveOrgEffective(
  system: SystemPricingConfigResponse,
  org: {
    enabled: boolean | null; systemServiceDisabled: boolean
    highPricePct: number | null; lowPricePct: number | null
    highAnomalyPct: number | null; lowAnomalyPct: number | null
    dayDifferencePct: number | null; dayDifferenceWindow: number | null
    maxOffersForAnalysis: number | null
  } | null,
): SystemPricingConfigResponse {
```

Inside the function body, add to the returned object:

```ts
maxOffersForAnalysis: org?.maxOffersForAnalysis ?? system.maxOffersForAnalysis,
```

- [ ] **Step 9: Update resolvePropertyEffective helper**

Same pattern as step 8 — add `maxOffersForAnalysis: number | null` to the `prop` parameter type, and to the returned object:

```ts
maxOffersForAnalysis: prop?.maxOffersForAnalysis ?? orgEffective.maxOffersForAnalysis,
```

- [ ] **Step 10: Run tests — verify all pass**

```bash
cd apps/api && pnpm test
```

Expected: all tests pass including the four new ones.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/services/pricing-config.service.ts \
        apps/api/src/services/__tests__/pricing-config.service.test.ts
git commit -m "feat(pricing): thread maxOffersForAnalysis through config inheritance chain"
```

---

## Task 4: Update collection service + tests

**Files:**
- Modify: `apps/api/src/services/pricing-collect.service.ts`
- Modify: `apps/api/src/services/__tests__/pricing-collect.service.test.ts`

- [ ] **Step 1: Write failing tests for deriveCancellationLabel**

In `pricing-collect.service.test.ts`, add a new `describe` block before the existing `collectHotelPrices` block. Also add `dailyRateOffer` to the Prisma mock at the top:

```ts
vi.mock('../../db/client.js', () => ({
  prisma: {
    property: { findUnique: vi.fn() },
    dailyRate: { upsert: vi.fn() },
    dailyRateOffer: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}))

const mockPrisma = prisma as unknown as {
  property: { findUnique: ReturnType<typeof vi.fn> }
  dailyRate: { upsert: ReturnType<typeof vi.fn> }
  dailyRateOffer: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> }
}
```

Add the new describe block:

```ts
describe('deriveCancellationLabel', () => {
  it('returns Free when policies array is empty', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    expect(deriveCancellationLabel([])).toBe('Free')
  })

  it('returns Free when all policy amounts are 0', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    const policies = [
      { daysBefore: 7, penaltyType: 'currency' as const, amount: 0, timeSetting: { timeFromCheckIn: 0, timeFromCheckInType: 'hours' as const } },
    ]
    expect(deriveCancellationLabel(policies)).toBe('Free')
  })

  it('returns Non-refundable when all policy amounts are > 0', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    const policies = [
      { daysBefore: 0, penaltyType: 'currency' as const, amount: 100, timeSetting: { timeFromCheckIn: 0, timeFromCheckInType: 'hours' as const } },
    ]
    expect(deriveCancellationLabel(policies)).toBe('Non-refundable')
  })

  it('returns Partial when some amounts are 0 and some are > 0', async () => {
    const { deriveCancellationLabel } = await import('../pricing-collect.service.js')
    const policies = [
      { daysBefore: 7, penaltyType: 'currency' as const, amount: 0, timeSetting: { timeFromCheckIn: 0, timeFromCheckInType: 'hours' as const } },
      { daysBefore: 0, penaltyType: 'currency' as const, amount: 100, timeSetting: { timeFromCheckIn: 0, timeFromCheckInType: 'hours' as const } },
    ]
    expect(deriveCancellationLabel(policies)).toBe('Partial')
  })
})

describe('offer collection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mockPrisma.dailyRate.upsert.mockResolvedValue({})
    mockPrisma.dailyRateOffer.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.dailyRateOffer.createMany.mockResolvedValue({ count: 0 })
  })

  it('calls dailyRateOffer.deleteMany and createMany for each window', async () => {
    mockSearch.mockResolvedValue(makeHGResponse(29))
    const { resolveEffectivePricingConfig } = await import('../pricing-config.service.js')
    vi.mocked(resolveEffectivePricingConfig).mockResolvedValue({
      enabled: true, openToAll: true, refreshIntervalHours: 24, searchAdults: 1,
      maxOffersForAnalysis: 10, highPricePct: 15, lowPricePct: 15,
      highAnomalyPct: 30, lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
    })
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)
    expect(mockPrisma.dailyRateOffer.deleteMany).toHaveBeenCalledTimes(13)
    expect(mockPrisma.dailyRateOffer.createMany).toHaveBeenCalledTimes(13)
  })

  it('writes rank-1 offer details into dailyRateOffer.createMany', async () => {
    mockSearch.mockResolvedValue(makeHGResponse(1))
    vi.mocked(resolveEffectivePricingConfig).mockResolvedValue({
      enabled: true, openToAll: true, refreshIntervalHours: 24, searchAdults: 1,
      maxOffersForAnalysis: 10, highPricePct: 15, lowPricePct: 15,
      highAnomalyPct: 30, lowAnomalyPct: 30, dayDifferencePct: 35, dayDifferenceWindow: 7,
    })
    const { collectHotelPrices } = await import('../pricing-collect.service.js')
    await collectHotelPrices(1)
    // Find any createMany call that has a rank:1 entry and verify its offer fields
    const allRows = mockPrisma.dailyRateOffer.createMany.mock.calls
      .flatMap((call: [{ data: Array<{ rank: number; roomName: string; board: string; cancellationLabel: string }> }]) => call[0].data)
    const rank1 = allRows.find((r) => r.rank === 1)
    expect(rank1?.roomName).toBe('Standard')
    expect(rank1?.board).toBe('BB')
    expect(rank1?.cancellationLabel).toBe('Free')
  })
})
```

Note: add these at the top of the test file alongside the existing mocks and imports:

```ts
vi.mock('../pricing-config.service.js', () => ({
  resolveEffectivePricingConfig: vi.fn(),
}))

import { resolveEffectivePricingConfig } from '../pricing-config.service.js'
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
cd apps/api && pnpm test
```

Expected: new tests fail because `deriveCancellationLabel` is not exported and `dailyRateOffer` operations don't exist yet.

- [ ] **Step 3: Implement changes in pricing-collect.service.ts**

Replace the entire file content with:

```ts
import { addDays, todayIso } from '@ibe/shared'
import type { HGSearchResponse, HGCancellationPolicy } from '@ibe/shared'
import { searchAvailability } from '../adapters/hyperguest/search.js'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'
import { resolveEffectivePricingConfig } from './pricing-config.service.js'

const WINDOW_DAYS = 29
const TOTAL_DAYS = 365

interface NightlyPrice {
  date: string
  minSellPrice: number
  currency: string
  available: boolean
  cheapestRoomId: number | null
  cheapestRoomName: string | null
  cheapestBoard: string | null
  cheapestCancellationLabel: string | null
}

interface OfferEntry {
  date: string
  roomId: number
  roomName: string
  board: string
  cancellationLabel: 'Free' | 'Non-refundable' | 'Partial'
  sellPrice: number
  currency: string
}

export function deriveCancellationLabel(policies: HGCancellationPolicy[]): 'Free' | 'Non-refundable' | 'Partial' {
  if (policies.length === 0) return 'Free'
  const hasZero = policies.some(p => p.amount === 0)
  const hasNonZero = policies.some(p => p.amount > 0)
  if (hasZero && hasNonZero) return 'Partial'
  if (hasNonZero) return 'Non-refundable'
  return 'Free'
}

export async function collectHotelPrices(propertyId: number): Promise<void> {
  logger.info({ propertyId }, '[Pricing] collectHotelPrices started')
  const property = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  if (!property) throw new Error(`Property ${propertyId} not found`)

  const { searchAdults, maxOffersForAnalysis } = await resolveEffectivePricingConfig(propertyId)

  const today = todayIso()
  const prices: NightlyPrice[] = []

  let offset = 0
  while (offset < TOTAL_DAYS) {
    const windowSize = Math.min(WINDOW_DAYS, TOTAL_DAYS - offset)
    const checkIn = addDays(today, offset)
    const checkOut = addDays(today, offset + windowSize)

    try {
      const hgResponse = await searchAvailability({
        hotelId: propertyId,
        checkIn,
        checkOut,
        rooms: [{ adults: searchAdults }],
      })
      const { prices: windowPrices, offersByDate } = extractNightlyData(hgResponse, checkIn, windowSize)
      prices.push(...windowPrices)
      await upsertDailyRateOffers(propertyId, offersByDate, maxOffersForAnalysis)
    } catch (err) {
      logger.warn({ err, propertyId, checkIn }, '[Pricing] Batch search failed — marking window unavailable')
      for (let i = 0; i < windowSize; i++) {
        prices.push({
          date: addDays(today, offset + i),
          minSellPrice: 0, currency: 'USD', available: false,
          cheapestRoomId: null, cheapestRoomName: null, cheapestBoard: null, cheapestCancellationLabel: null,
        })
      }
    }

    offset += windowSize
  }

  logger.info({ propertyId, priceCount: prices.length }, '[Pricing] collectHotelPrices upserting')
  await upsertDailyRates(propertyId, prices)
  logger.info({ propertyId }, '[Pricing] collectHotelPrices done')
}

function extractNightlyData(
  hgResponse: HGSearchResponse,
  checkIn: string,
  windowSize: number,
): { prices: NightlyPrice[]; offersByDate: Map<string, OfferEntry[]> } {
  const byDateMin = new Map<string, number>()
  const offersByDate = new Map<string, OfferEntry[]>()
  let currency = 'USD'

  for (const result of hgResponse.results) {
    for (const room of result.rooms) {
      const { roomId, roomName } = room
      for (const rp of room.ratePlans) {
        currency = rp.prices.sell.currency
        const board = rp.board as string
        const cancellationLabel = deriveCancellationLabel(rp.cancellationPolicies)

        for (const night of rp.nightlyBreakdown) {
          const price = night.prices.sell.price
          const existing = byDateMin.get(night.date)
          if (existing === undefined || price < existing) byDateMin.set(night.date, price)

          const offers = offersByDate.get(night.date) ?? []
          offers.push({ date: night.date, roomId, roomName, board, cancellationLabel, sellPrice: price, currency })
          offersByDate.set(night.date, offers)
        }
      }
    }
  }

  const prices: NightlyPrice[] = []
  for (let i = 0; i < windowSize; i++) {
    const date = addDays(checkIn, i)
    const price = byDateMin.get(date)
    const dateOffers = offersByDate.get(date)
    const cheapest = dateOffers ? [...dateOffers].sort((a, b) => a.sellPrice - b.sellPrice)[0] : undefined

    prices.push(
      price !== undefined
        ? {
            date, minSellPrice: price, currency, available: true,
            cheapestRoomId: cheapest?.roomId ?? null,
            cheapestRoomName: cheapest?.roomName ?? null,
            cheapestBoard: cheapest?.board ?? null,
            cheapestCancellationLabel: cheapest?.cancellationLabel ?? null,
          }
        : { date, minSellPrice: 0, currency, available: false, cheapestRoomId: null, cheapestRoomName: null, cheapestBoard: null, cheapestCancellationLabel: null },
    )
  }

  return { prices, offersByDate }
}

async function upsertDailyRateOffers(
  propertyId: number,
  offersByDate: Map<string, OfferEntry[]>,
  maxOffers: number,
): Promise<void> {
  const dates = [...offersByDate.keys()]
  if (dates.length === 0) return

  await prisma.dailyRateOffer.deleteMany({ where: { propertyId, date: { in: dates } } })

  const rows: Array<{
    propertyId: number; date: string; roomId: number; roomName: string
    board: string; cancellationLabel: string; sellPrice: number; currency: string; rank: number
  }> = []

  for (const [date, offers] of offersByDate.entries()) {
    const sorted = [...offers].sort((a, b) => a.sellPrice - b.sellPrice).slice(0, maxOffers)
    sorted.forEach((o, i) => {
      rows.push({
        propertyId, date, roomId: o.roomId, roomName: o.roomName,
        board: o.board, cancellationLabel: o.cancellationLabel,
        sellPrice: o.sellPrice, currency: o.currency, rank: i + 1,
      })
    })
  }

  if (rows.length > 0) await prisma.dailyRateOffer.createMany({ data: rows })
}

async function upsertDailyRates(propertyId: number, prices: NightlyPrice[]): Promise<void> {
  for (const p of prices) {
    await prisma.dailyRate.upsert({
      where: { propertyId_date: { propertyId, date: p.date } },
      create: {
        propertyId, date: p.date, minSellPrice: p.minSellPrice,
        currency: p.currency, available: p.available, collectedAt: new Date(),
        cheapestRoomId: p.cheapestRoomId, cheapestRoomName: p.cheapestRoomName,
        cheapestBoard: p.cheapestBoard, cheapestCancellationLabel: p.cheapestCancellationLabel,
      },
      update: {
        minSellPrice: p.minSellPrice, currency: p.currency,
        available: p.available, collectedAt: new Date(),
        cheapestRoomId: p.cheapestRoomId, cheapestRoomName: p.cheapestRoomName,
        cheapestBoard: p.cheapestBoard, cheapestCancellationLabel: p.cheapestCancellationLabel,
      },
    })
  }
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
cd apps/api && pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/pricing-collect.service.ts \
        apps/api/src/services/__tests__/pricing-collect.service.test.ts
git commit -m "feat(pricing): extract and store DailyRateOffer rows per collection window"
```

---

## Task 5: Update pricing API route

**Files:**
- Modify: `apps/api/src/routes/pricing.route.ts`

- [ ] **Step 1: Select new columns in admin data query**

Find the admin data Prisma query (around line 171). Update the `select` block to include the new fields:

```ts
select: {
  date: true, minSellPrice: true, currency: true, available: true,
  calendarColor: true, anomalyType: true, rollingAvg: true,
  cheapestRoomName: true, cheapestBoard: true, cheapestCancellationLabel: true,
},
```

- [ ] **Step 2: Map new fields in the response**

In the `.map()` call that produces `DayRateAdminEntry[]`, add:

```ts
cheapestRoomName: r.cheapestRoomName ?? null,
cheapestBoard: r.cheapestBoard ?? null,
cheapestCancellationLabel: r.cheapestCancellationLabel ?? null,
```

- [ ] **Step 3: Type-check API**

```bash
cd apps/api && pnpm type-check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/pricing.route.ts
git commit -m "feat(pricing): return cheapest offer fields in admin pricing data endpoint"
```

---

## Task 6: Admin config UI — maxOffersForAnalysis field

**Files:**
- Modify: `apps/web/src/app/admin/config/misc/pricing/page.tsx`

- [ ] **Step 1: Add field to SystemPricingSection**

In `SystemPricingSection`, after the `dayDifferenceWindow` input block (around line 147), add:

```tsx
<div className="flex items-center justify-between py-2">
  <span className="text-sm text-[var(--color-text)]">Max offers for analysis</span>
  <input
    type="number" min={1} max={100}
    value={form.maxOffersForAnalysis}
    onChange={e => set('maxOffersForAnalysis')(Number(e.target.value))}
    className={inputCls}
  />
</div>
```

- [ ] **Step 2: Add field to OrgPricingSection**

In `OrgPricingSection`, after the `dayDifferencePct` `PctField` (around line 201), add:

```tsx
<div className="flex items-center justify-between py-2">
  <span className="text-sm text-[var(--color-text)]">Max offers for analysis</span>
  <div className="flex items-center gap-2">
    {form.maxOffersForAnalysis === null && (
      <span className="text-xs text-[var(--color-text-muted)]">({eff.maxOffersForAnalysis} inherited)</span>
    )}
    <input
      type="number" min={1} max={100}
      value={form.maxOffersForAnalysis ?? ''}
      placeholder={String(eff.maxOffersForAnalysis)}
      onChange={e => set('maxOffersForAnalysis')(e.target.value === '' ? null : Number(e.target.value))}
      className={inputCls}
    />
    {form.maxOffersForAnalysis !== null && (
      <button onClick={() => set('maxOffersForAnalysis')(null)} className="text-xs text-[var(--color-primary)] underline">Reset</button>
    )}
  </div>
</div>
```

- [ ] **Step 3: Add field to PropertyPricingSection**

In `PropertyPricingSection`, after the `dayDifferencePct` `PctField` (around line 268), add the identical block as step 2 (same pattern, `form.maxOffersForAnalysis`, `eff.maxOffersForAnalysis`).

- [ ] **Step 4: Type-check web**

```bash
cd apps/web && pnpm type-check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/config/misc/pricing/page.tsx
git commit -m "feat(pricing): add maxOffersForAnalysis field to System/Org/Property pricing config UI"
```

---

## Task 7: Dashboard — offer details in anomaly table

**Files:**
- Modify: `apps/web/src/app/admin/dashboard/page.tsx`

- [ ] **Step 1: Add three columns to AnomalyTable header**

Find the `<thead>` inside `AnomalyTable` (around line 350). Add three `<th>` cells after the existing `<th className="pb-1">Dev %</th>`:

```tsx
<th className="pb-1 pr-2">Room</th>
<th className="pb-1 pr-2">Board</th>
<th className="pb-1">Cancellation</th>
```

- [ ] **Step 2: Add three cells to each table row**

In the `.map()` row (around line 364), after the `Dev %` `<td>`, add:

```tsx
<td className="py-1 pr-2">{r.cheapestRoomName ?? '—'}</td>
<td className="py-1 pr-2">{r.cheapestBoard ?? '—'}</td>
<td className="py-1">{r.cheapestCancellationLabel ?? '—'}</td>
```

- [ ] **Step 3: Type-check web**

```bash
cd apps/web && pnpm type-check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/dashboard/page.tsx
git commit -m "feat(pricing): show Room/Board/Cancellation offer details in anomaly dashboard table"
```

---

## Task 8: Final checks + push

- [ ] **Step 1: Run full API test suite**

```bash
cd apps/api && pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Type-check API and web**

```bash
cd apps/api && pnpm type-check
cd apps/web && pnpm type-check
```

Expected: 0 errors in both.

- [ ] **Step 3: Build shared and API**

```bash
pnpm --filter @ibe/shared build
pnpm --filter @ibe/api build
```

Expected: both exit 0 with no errors.
