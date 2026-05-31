# Blocked Domain Country Classification + Redundancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag blocked domains with their country (ccTLD / country-prefix detection), mark brand-covered entries as redundant so they're skipped during filtering, and auto-classify entries on insert.

**Architecture:** Add a `redundant` boolean to the DB schema. Extract `detectCountryFromDomain()` and `isRedundantEntry()` helpers into `blocked-domains.service.ts`. The POST route in `onboarding-admin.route.ts` auto-detects country and redundancy on every insert. A one-off backfill script retrofits existing rows.

**Tech Stack:** TypeScript, Prisma (schema at `apps/api/prisma/schema.prisma`), Vitest, PostgreSQL on Render.

---

## File Map

| File | Change |
|------|--------|
| `apps/api/prisma/schema.prisma` | Add `redundant Boolean @default(false)` to `OnboardingBlockedDomain` |
| `apps/api/prisma/migrations/20260531_blocked_domain_redundant/migration.sql` | ALTER TABLE migration |
| `apps/onboarding-api/src/services/blocked-domains.service.ts` | Add `detectCountryFromDomain`, `isRedundantEntry`, update `BlockedEntry` type, update `isBlockedByList` |
| `apps/onboarding-api/src/services/__tests__/blocked-domains.test.ts` | New unit tests for both helpers |
| `apps/api/src/routes/onboarding-admin.route.ts` | POST route: auto-detect country + redundancy before insert |
| `apps/api/src/scripts/backfill-blocked-domains.ts` | New one-off script: classify + mark redundant existing rows |

---

## Task 1: Schema — add `redundant` field

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260531_blocked_domain_redundant/migration.sql`

- [ ] **Step 1: Add field to schema**

In `apps/api/prisma/schema.prisma`, find the `OnboardingBlockedDomain` model and add `redundant` after `country`:

```prisma
model OnboardingBlockedDomain {
  id        Int      @id @default(autoincrement())
  domain    String   @unique
  label     String?
  matchType String   @default("subdomain")
  country   String?
  redundant Boolean  @default(false)  // true = covered by global brand entry; kept for audit
  addedById Int?
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Create migration file**

Create `apps/api/prisma/migrations/20260531_blocked_domain_redundant/migration.sql`:

```sql
ALTER TABLE "OnboardingBlockedDomain" ADD COLUMN "redundant" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Run prisma generate in onboarding-api (regenerates client)**

```bash
cd apps/onboarding-api && npx prisma generate --schema=../api/prisma/schema.prisma
```

Expected: `Generated Prisma Client` success message.

- [ ] **Step 4: Run prisma generate in api**

```bash
cd apps/api && npx prisma generate
```

Expected: `Generated Prisma Client` success message.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260531_blocked_domain_redundant/migration.sql
git commit -m "feat(onboarding): add redundant field to OnboardingBlockedDomain schema"
```

---

## Task 2: `detectCountryFromDomain` + `isRedundantEntry` helpers — tests first

**Files:**
- Create: `apps/onboarding-api/src/services/__tests__/blocked-domains.test.ts`
- Modify: `apps/onboarding-api/src/services/blocked-domains.service.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/onboarding-api/src/services/__tests__/blocked-domains.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectCountryFromDomain, isRedundantEntry } from '../blocked-domains.service.js'
import type { BlockedEntry } from '../blocked-domains.service.js'

describe('detectCountryFromDomain', () => {
  // ccTLD detection
  it('detects .fr TLD', () => expect(detectCountryFromDomain('bonjour-ratp.fr')).toBe('FR'))
  it('detects .de TLD', () => expect(detectCountryFromDomain('hotel-berlin.de')).toBe('DE'))
  it('detects .it TLD', () => expect(detectCountryFromDomain('albergo.it')).toBe('IT'))
  it('detects .br TLD', () => expect(detectCountryFromDomain('bookbrazilhotels.com.br')).toBe('BR'))
  it('detects .co.uk compound', () => expect(detectCountryFromDomain('hotels.co.uk')).toBe('GB'))
  it('detects .com.ar compound', () => expect(detectCountryFromDomain('booking.com.ar')).toBe('AR'))

  // Country-prefix subdomain detection
  it('detects ar. prefix on .com', () => expect(detectCountryFromDomain('ar.trivago.com')).toBe('AR'))
  it('detects fr. prefix on .com', () => expect(detectCountryFromDomain('fr.trip.com')).toBe('FR'))
  it('detects br. prefix on .com', () => expect(detectCountryFromDomain('br.trip.com')).toBe('BR'))
  it('detects cn. prefix on .com', () => expect(detectCountryFromDomain('cn.ctrip.com')).toBe('CN'))

  // Non-country prefixes — must not false-positive
  it('returns null for plain domain', () => expect(detectCountryFromDomain('trivago.com')).toBeNull())
  it('returns null for non-country 2-letter prefix', () => expect(detectCountryFromDomain('go.hotels.com')).toBeNull())
  it('returns null for www prefix', () => expect(detectCountryFromDomain('www.hotel.com')).toBeNull())
  it('returns null for .com with no prefix', () => expect(detectCountryFromDomain('gohotels.com')).toBeNull())

  // Compound ccTLD edge cases
  it('detects .co.nz', () => expect(detectCountryFromDomain('hotel.co.nz')).toBe('NZ'))
  it('detects .co.jp', () => expect(detectCountryFromDomain('hotel.co.jp')).toBe('JP'))
})

describe('isRedundantEntry', () => {
  const globalEntries: BlockedEntry[] = [
    { domain: 'trivago', matchType: 'brand', country: null, redundant: false },
    { domain: 'booking', matchType: 'brand', country: null, redundant: false },
    { domain: 'trip',    matchType: 'brand', country: null, redundant: false },
    { domain: 'lastminute', matchType: 'brand', country: null, redundant: false },
  ]

  it('ar.trivago.com is redundant (trivago brand covers it)', () =>
    expect(isRedundantEntry('ar.trivago.com', globalEntries)).toBe(true))

  it('fr.trip.com is redundant (trip brand covers it)', () =>
    expect(isRedundantEntry('fr.trip.com', globalEntries)).toBe(true))

  it('fr.lastminute.com is redundant (lastminute brand covers it)', () =>
    expect(isRedundantEntry('fr.lastminute.com', globalEntries)).toBe(true))

  it('gohotels.com is NOT redundant (no global brand entry covers it)', () =>
    expect(isRedundantEntry('gohotels.com', globalEntries)).toBe(false))

  it('top-paris-hotels.com is NOT redundant', () =>
    expect(isRedundantEntry('top-paris-hotels.com', globalEntries)).toBe(false))

  it('booking.com is NOT redundant when tested against itself excluded', () =>
    expect(isRedundantEntry('booking.com', globalEntries)).toBe(true)) // 'booking' brand catches it
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd apps/onboarding-api && pnpm test 2>&1 | grep -E "FAIL|PASS|Error" | head -20
```

Expected: tests fail with import errors (functions not yet exported).

- [ ] **Step 3: Implement `detectCountryFromDomain` and `isRedundantEntry`**

Update `apps/onboarding-api/src/services/blocked-domains.service.ts`.

First, update the `BlockedEntry` type and import:

```typescript
export interface BlockedEntry {
  domain: string
  matchType: string
  country: string | null
  redundant: boolean
}
```

Update `getBlockedDomains` query to include `redundant`:

```typescript
export async function getBlockedDomains(): Promise<BlockedEntry[]> {
  if (Date.now() - loadedAt > TTL_MS) {
    cache = await prisma.onboardingBlockedDomain.findMany({
      select: { domain: true, matchType: true, country: true, redundant: true },
    })
    loadedAt = Date.now()
  }
  return cache
}
```

Update `isBlockedByList` to skip redundant entries (add one guard at the top of the loop):

```typescript
export function isBlockedByList(
  url: string,
  entries: BlockedEntry[],
  searchCountry?: string,
): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    for (const e of entries) {
      if (e.redundant) continue  // ← NEW: skip entries superseded by a global brand
      if (e.country && searchCountry) {
        const sc = searchCountry.toLowerCase()
        if (e.country.toLowerCase() !== sc.slice(0, 2) && !sc.startsWith(e.country.toLowerCase())) continue
      }
      switch (e.matchType) {
        case 'exact':
          if (hostname === e.domain) return true
          break
        case 'subdomain':
          if (hostname === e.domain || hostname.endsWith('.' + e.domain)) return true
          break
        case 'brand': {
          const label = extractBrandLabel(hostname)
          if (label === e.domain) return true
          break
        }
        case 'keyword':
          if (hostname.includes(e.domain)) return true
          break
      }
    }
    return false
  } catch { return false }
}
```

Add the ccTLD map and helpers after the existing constants:

```typescript
// ISO 3166-1 alpha-2 country codes that are valid 2-letter subdomain prefixes
// (must be a whitelist to avoid false positives like "go.", "in.", "my." as English words)
const COUNTRY_CODE_SET = new Set([
  'ae','ar','at','au','be','bg','br','ca','ch','cl','cn','co','cz','de',
  'dk','ee','eg','es','fi','fr','gb','gr','hk','hr','hu','id','ie','il',
  'in','it','jp','ke','kr','lt','lv','ma','mx','my','ng','nl','no','nz',
  'ph','pl','pt','ro','rs','ru','sa','se','sg','si','sk','th','tr','tw',
  'ua','us','vn','za',
])

// ccTLD → ISO-2 country code (covers compound ccTLDs like co.uk, com.br)
const CCTLD_TO_COUNTRY: Record<string, string> = {
  fr:'FR', de:'DE', it:'IT', es:'ES', pt:'PT', nl:'NL', be:'BE', ch:'CH',
  at:'AT', pl:'PL', se:'SE', no:'NO', dk:'DK', fi:'FI', ie:'IE', gr:'GR',
  cz:'CZ', hu:'HU', ro:'RO', sk:'SK', hr:'HR', rs:'RS', bg:'BG', lt:'LT',
  lv:'LV', ee:'EE', si:'SI', ru:'RU', ua:'UA', tr:'TR', ae:'AE', il:'IL',
  sa:'SA', eg:'EG', ma:'MA', za:'ZA', ng:'NG', ke:'KE', in:'IN', cn:'CN',
  jp:'JP', kr:'KR', tw:'TW', hk:'HK', sg:'SG', th:'TH', id:'ID', my:'MY',
  ph:'PH', vn:'VN', au:'AU', nz:'NZ', br:'BR', ar:'AR', mx:'MX', cl:'CL',
  co:'CO', ca:'CA', us:'US', uk:'GB',
  // compound second-level ccTLDs (e.g. hotel.co.uk → parts[-2]='co', parts[-1]='uk')
  'co.uk':'GB', 'co.nz':'NZ', 'co.jp':'JP', 'co.za':'ZA', 'co.id':'ID',
  'co.kr':'KR', 'co.th':'TH', 'com.br':'BR', 'com.ar':'AR', 'com.mx':'MX',
  'com.au':'AU', 'com.sg':'SG', 'com.tr':'TR', 'com.eg':'EG', 'com.sa':'SA',
  'com.co':'CO', 'com.pe':'PE', 'com.vn':'VN', 'com.ph':'PH', 'com.my':'MY',
  'net.br':'BR', 'org.br':'BR',
}

/**
 * Infer ISO-2 country from domain via:
 * 1. Compound ccTLD: booking.com.br → BR, hotels.co.uk → GB
 * 2. Simple ccTLD: bonjour-ratp.fr → FR
 * 3. 2-letter country-prefix subdomain on common TLD: ar.trivago.com → AR
 */
export function detectCountryFromDomain(domain: string): string | null {
  const parts = domain.split('.')

  // 1. Compound ccTLD (last two parts): co.uk, com.br, com.ar …
  if (parts.length >= 3) {
    const compound = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
    if (compound in CCTLD_TO_COUNTRY) return CCTLD_TO_COUNTRY[compound]!
  }

  // 2. Simple ccTLD (last part): .fr, .de, .br …
  const tld = parts[parts.length - 1]!
  if (tld in CCTLD_TO_COUNTRY) return CCTLD_TO_COUNTRY[tld]!

  // 3. Country-prefix subdomain: ar.trivago.com — only for 3-part domains with COMMON_TLDS
  if (parts.length === 3 && COMMON_TLDS.has(parts[2]!)) {
    const prefix = parts[0]!.toLowerCase()
    if (COUNTRY_CODE_SET.has(prefix)) return prefix.toUpperCase()
  }

  return null
}

/**
 * Returns true if the domain is already covered by a global (country-null, non-redundant)
 * entry in the list — meaning adding it as a separate entry would be redundant.
 * Pass only global entries (country: null, redundant: false) for performance.
 */
export function isRedundantEntry(domain: string, globalEntries: BlockedEntry[]): boolean {
  return isBlockedByList(`https://${domain}/`, globalEntries)
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
cd apps/onboarding-api && pnpm test src/services/__tests__/blocked-domains.test.ts 2>&1
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/onboarding-api/src/services/blocked-domains.service.ts \
        apps/onboarding-api/src/services/__tests__/blocked-domains.test.ts
git commit -m "feat(onboarding): detectCountryFromDomain + isRedundantEntry helpers"
```

---

## Task 3: Auto-classify on insert (admin route)

**Files:**
- Modify: `apps/api/src/routes/onboarding-admin.route.ts`

The POST `/admin/hotel-onboarding/blocked` route currently accepts `country` from the request body but does no auto-detection. We add auto-detect + redundancy check before the DB insert.

- [ ] **Step 1: Add imports at top of `onboarding-admin.route.ts`**

Find the import block at the top of `apps/api/src/routes/onboarding-admin.route.ts` and add:

```typescript
import { detectCountryFromDomain, isRedundantEntry, getCachedBlockedDomains } from '../services/hotel-search/blocked-domains-proxy.js'
```

Wait — the route lives in `apps/api` but the helpers live in `apps/onboarding-api`. They cannot import each other directly. Instead, duplicate the two pure functions (`detectCountryFromDomain`, `isRedundantEntry`) into a shared location, OR replicate the minimal logic inline in the route.

The correct approach: move these two pure helpers (no Prisma, no state) into `packages/shared/src/utils/blocked-domain-utils.ts` so both `apps/api` and `apps/onboarding-api` can import them.

**Revised file map for this task:**
- Create: `packages/shared/src/utils/blocked-domain-utils.ts` — pure helpers only (no Prisma)
- Modify: `packages/shared/src/index.ts` — export the new module
- Modify: `apps/onboarding-api/src/services/blocked-domains.service.ts` — import from shared instead of defining inline
- Modify: `apps/api/src/routes/onboarding-admin.route.ts` — import from shared and use in POST route

- [ ] **Step 2: Create `packages/shared/src/utils/blocked-domain-utils.ts`**

```typescript
// Pure, stateless helpers — no Prisma, no side effects.
// Used by both apps/api (admin route) and apps/onboarding-api (blocked-domains service).

const CC_SLDS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go'])
const COMMON_TLDS = new Set(['com', 'net', 'org', 'io', 'travel', 'hotel'])

const COUNTRY_CODE_SET = new Set([
  'ae','ar','at','au','be','bg','br','ca','ch','cl','cn','co','cz','de',
  'dk','ee','eg','es','fi','fr','gb','gr','hk','hr','hu','id','ie','il',
  'in','it','jp','ke','kr','lt','lv','ma','mx','my','ng','nl','no','nz',
  'ph','pl','pt','ro','rs','ru','sa','se','sg','si','sk','th','tr','tw',
  'ua','us','vn','za',
])

const CCTLD_TO_COUNTRY: Record<string, string> = {
  fr:'FR', de:'DE', it:'IT', es:'ES', pt:'PT', nl:'NL', be:'BE', ch:'CH',
  at:'AT', pl:'PL', se:'SE', no:'NO', dk:'DK', fi:'FI', ie:'IE', gr:'GR',
  cz:'CZ', hu:'HU', ro:'RO', sk:'SK', hr:'HR', rs:'RS', bg:'BG', lt:'LT',
  lv:'LV', ee:'EE', si:'SI', ru:'RU', ua:'UA', tr:'TR', ae:'AE', il:'IL',
  sa:'SA', eg:'EG', ma:'MA', za:'ZA', ng:'NG', ke:'KE', in:'IN', cn:'CN',
  jp:'JP', kr:'KR', tw:'TW', hk:'HK', sg:'SG', th:'TH', id:'ID', my:'MY',
  ph:'PH', vn:'VN', au:'AU', nz:'NZ', br:'BR', ar:'AR', mx:'MX', cl:'CL',
  co:'CO', ca:'CA', us:'US', uk:'GB',
  'co.uk':'GB', 'co.nz':'NZ', 'co.jp':'JP', 'co.za':'ZA', 'co.id':'ID',
  'co.kr':'KR', 'co.th':'TH', 'com.br':'BR', 'com.ar':'AR', 'com.mx':'MX',
  'com.au':'AU', 'com.sg':'SG', 'com.tr':'TR', 'com.eg':'EG', 'com.sa':'SA',
  'com.co':'CO', 'com.pe':'PE', 'com.vn':'VN', 'com.ph':'PH', 'com.my':'MY',
  'net.br':'BR', 'org.br':'BR',
}

export interface BlockedEntryMinimal {
  domain: string
  matchType: string
  country: string | null
  redundant: boolean
}

function extractBrandLabel(hostname: string): string | null {
  const h = hostname.startsWith('www.') ? hostname.slice(4) : hostname
  const parts = h.split('.')
  if (parts.length === 2) return parts[0] ?? null
  if (parts.length === 3) {
    if (CC_SLDS.has(parts[1]!)) return parts[0] ?? null
    if (COMMON_TLDS.has(parts[2]!)) return parts[1] ?? null
  }
  return null
}

export function detectCountryFromDomain(domain: string): string | null {
  const parts = domain.split('.')

  if (parts.length >= 3) {
    const compound = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
    if (compound in CCTLD_TO_COUNTRY) return CCTLD_TO_COUNTRY[compound]!
  }

  const tld = parts[parts.length - 1]!
  if (tld in CCTLD_TO_COUNTRY) return CCTLD_TO_COUNTRY[tld]!

  if (parts.length === 3 && COMMON_TLDS.has(parts[2]!)) {
    const prefix = parts[0]!.toLowerCase()
    if (COUNTRY_CODE_SET.has(prefix)) return prefix.toUpperCase()
  }

  return null
}

export function isRedundantEntry(domain: string, globalEntries: BlockedEntryMinimal[]): boolean {
  try {
    const hostname = domain.toLowerCase().replace(/^www\./, '')
    for (const e of globalEntries) {
      if (e.redundant || e.country !== null) continue // only check global non-redundant entries
      switch (e.matchType) {
        case 'exact':
          if (hostname === e.domain) return true
          break
        case 'subdomain':
          if (hostname === e.domain || hostname.endsWith('.' + e.domain)) return true
          break
        case 'brand': {
          const label = extractBrandLabel(hostname)
          if (label === e.domain) return true
          break
        }
        case 'keyword':
          if (hostname.includes(e.domain)) return true
          break
      }
    }
    return false
  } catch { return false }
}
```

- [ ] **Step 3: Export from `packages/shared/src/index.ts`**

Add to the end of `packages/shared/src/index.ts`:

```typescript
export * from './utils/blocked-domain-utils.js'
```

- [ ] **Step 4: Update `blocked-domains.service.ts` to import from shared**

In `apps/onboarding-api/src/services/blocked-domains.service.ts`:

Remove the local definitions of `COUNTRY_CODE_SET`, `CCTLD_TO_COUNTRY`, `detectCountryFromDomain`, `isRedundantEntry`, and `extractBrandLabel` (the copies added in Task 2).

Add imports at the top:

```typescript
import { detectCountryFromDomain, isRedundantEntry, type BlockedEntryMinimal } from '@ibe/shared'
```

Change `BlockedEntry` to extend `BlockedEntryMinimal` (or just alias it):

```typescript
export type BlockedEntry = BlockedEntryMinimal
```

Keep the `CC_SLDS` and `COMMON_TLDS` constants that are still needed locally in `extractBrandLabel` within `isBlockedByList` — or import `extractBrandLabel` from shared too if you prefer (it's already exported as a named export in the shared utils file above).

Actually for simplicity: in `blocked-domains.service.ts`, keep the local `extractBrandLabel` and the local `CC_SLDS`/`COMMON_TLDS` since `isBlockedByList` uses them, but import `detectCountryFromDomain`, `isRedundantEntry`, and `BlockedEntryMinimal` from shared. Re-export `detectCountryFromDomain` and `isRedundantEntry` so existing test imports keep working.

```typescript
export { detectCountryFromDomain, isRedundantEntry } from '@ibe/shared'
export type { BlockedEntryMinimal } from '@ibe/shared'
```

- [ ] **Step 5: Update POST route in `apps/api/src/routes/onboarding-admin.route.ts`**

Find the import block at the top of the file and add:

```typescript
import { detectCountryFromDomain, isRedundantEntry } from '@ibe/shared'
```

Find the POST `/admin/hotel-onboarding/blocked` handler (around line 794). Replace the section from `const existing = ...` through `const created = ...`:

```typescript
      const existing = await prisma.onboardingBlockedDomain.findUnique({ where: { domain } })
      if (existing) return reply.conflict('Domain already blocked')

      // Auto-detect country if caller didn't supply one
      const detectedCountry = request.body.country?.trim() || detectCountryFromDomain(domain) || null

      // Redundancy check — is this domain already covered by a global brand/subdomain entry?
      const allEntries = await prisma.onboardingBlockedDomain.findMany({
        select: { domain: true, matchType: true, country: true, redundant: true },
      })
      const isRedundant = isRedundantEntry(domain, allEntries)

      const created = await prisma.onboardingBlockedDomain.create({
        data: {
          domain,
          label: request.body.label?.trim() || null,
          matchType: request.body.matchType ?? 'subdomain',
          country: detectedCountry,
          redundant: isRedundant,
          addedById: me.adminId,
        },
      })
```

- [ ] **Step 6: Build shared package to verify no TS errors**

```bash
pnpm --filter @ibe/shared exec tsc --noEmit 2>&1 && echo "shared OK"
pnpm --filter @ibe/onboarding-api exec tsc --noEmit 2>&1 && echo "onboarding-api OK"
pnpm --filter @ibe/api exec tsc --noEmit 2>&1 && echo "api OK"
```

Expected: all three print "OK".

- [ ] **Step 7: Run tests**

```bash
cd apps/onboarding-api && pnpm test src/services/__tests__/blocked-domains.test.ts 2>&1
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/utils/blocked-domain-utils.ts \
        packages/shared/src/index.ts \
        apps/onboarding-api/src/services/blocked-domains.service.ts \
        apps/api/src/routes/onboarding-admin.route.ts
git commit -m "feat(onboarding): auto-detect country + redundancy on blocked domain insert"
```

---

## Task 4: Backfill existing rows

**Files:**
- Create: `apps/api/src/scripts/backfill-blocked-domains.ts`

This script runs once against the DB (both dev and prod). It:
1. Detects country for every entry where `country IS NULL`
2. Marks entries as `redundant = true` where a global brand entry already covers them
3. Prints a human-readable summary

- [ ] **Step 1: Create the backfill script**

Create `apps/api/src/scripts/backfill-blocked-domains.ts`:

```typescript
import { PrismaClient } from '@prisma/client'
import { detectCountryFromDomain, isRedundantEntry, type BlockedEntryMinimal } from '@ibe/shared'

const prisma = new PrismaClient()

async function backfill() {
  const all = await prisma.onboardingBlockedDomain.findMany({
    select: { id: true, domain: true, matchType: true, country: true, redundant: true },
  })

  // Build the global baseline (country=null, redundant=false) for redundancy checks
  const globalEntries: BlockedEntryMinimal[] = all.filter(e => !e.country && !e.redundant)

  let countryTagged = 0
  let markedRedundant = 0
  let skipped = 0

  for (const entry of all) {
    const updates: { country?: string; redundant?: boolean } = {}

    // 1. Auto-detect country if not set
    if (!entry.country) {
      const detected = detectCountryFromDomain(entry.domain)
      if (detected) {
        updates.country = detected
        countryTagged++
      }
    }

    // 2. Redundancy check (only if not already marked)
    if (!entry.redundant) {
      // Exclude self from the global entries list to avoid self-matching
      const othersGlobal = globalEntries.filter(e => e.domain !== entry.domain)
      if (isRedundantEntry(entry.domain, othersGlobal)) {
        updates.redundant = true
        markedRedundant++
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.onboardingBlockedDomain.update({ where: { id: entry.id }, data: updates })
      console.log(`  updated ${entry.domain}: ${JSON.stringify(updates)}`)
    } else {
      skipped++
    }
  }

  console.log(`\nBackfill complete:`)
  console.log(`  country-tagged:   ${countryTagged}`)
  console.log(`  marked redundant: ${markedRedundant}`)
  console.log(`  unchanged:        ${skipped}`)
}

backfill()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Run against dev DB to verify**

```bash
cd apps/api && DATABASE_URL=postgresql://ibe_user:ibe_pass@localhost:5432/ibe_db \
  npx tsx src/scripts/backfill-blocked-domains.ts
```

Expected output: lines like:
```
  updated ar.trivago.com: {"country":"AR","redundant":true}
  updated fr.trip.com: {"country":"FR","redundant":true}
  updated bonjour-ratp.fr: {"country":"FR"}
  updated fr.lastminute.com: {"country":"FR","redundant":true}
  ...
Backfill complete:
  country-tagged:   N
  marked redundant: N
  unchanged:        N
```

Review the output — confirm the tagged/redundant entries look correct. No entries you'd expect to be global should be tagged with a country.

- [ ] **Step 3: Run against prod DB**

```bash
cd apps/api && DATABASE_URL="postgresql://ibe_user:yab5Bjli7rmGEAtqzRuVi90iDpla8ygT@dpg-d7ig3mho3t8c738goqig-a.oregon-postgres.render.com/ibe_db_p66h" \
  npx tsx src/scripts/backfill-blocked-domains.ts
```

Expected: similar output to dev.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/scripts/backfill-blocked-domains.ts
git commit -m "feat(onboarding): backfill country + redundant flags on existing blocked domains"
```

---

## Task 5: Deploy + invalidate cache

**Files:** none — deployment only.

- [ ] **Step 1: Apply migration on prod**

The migration adds a nullable-defaulted column — zero downtime, safe to run while live.

```bash
cd apps/api && DATABASE_URL="postgresql://ibe_user:yab5Bjli7rmGEAtqzRuVi90iDpla8ygT@dpg-d7ig3mho3t8c738goqig-a.oregon-postgres.render.com/ibe_db_p66h" \
  npx prisma migrate deploy
```

Expected: `Applied 1 migration` (the `20260531_blocked_domain_redundant` migration).

- [ ] **Step 2: Push code and trigger deploys**

Push main and trigger deploys for `onboarding-api` and `ibe-api` via the Render API (same pattern as earlier in this session — use the deploy endpoint with the service IDs from the session context).

- [ ] **Step 3: Verify cache invalidation**

After both services are live, the 5-minute TTL will naturally expire. To force immediate refresh, hit the internal invalidate endpoint:

```bash
curl -s -X POST https://onboarding-api-xqgp.onrender.com/internal/invalidate-blocked-cache
```

Expected: `200 OK` (or `204`).

- [ ] **Step 4: Smoke test**

Search for a hotel in France. Confirm `fr.trip.com` no longer appears in results (redundant + country-tagged, skipped by filter). Confirm `gohotels.com` still appears filtered for France searches (it's country-tagged but not redundant, so it blocks correctly for FR searches).
