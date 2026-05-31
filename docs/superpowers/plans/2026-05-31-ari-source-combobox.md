# ARI Source Combobox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-step ARI source selection (separate VendorFlow dropdown + unknown-PMS text input) with one unified searchable combobox showing all three tiers — "HG Connected", "To Be Added", and "To Be Checked" — in both the admin invitation form and the hotel self-registration page.

**Architecture:** Move `ARI_SYSTEMS` data + new shared types into `@ibe/shared`; build an `AriSourceCombobox` component per app (admin web + onboarding wizard) using that shared data; add an `unknownPmsStatus` column to `OnboardingInvitation`; update the self-registration backend to handle unknown-PMS hotels routing directly to `/pending`.

**Tech Stack:** TypeScript, React, Next.js 14, Prisma, Fastify, Vitest, pnpm workspaces

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `packages/shared/src/types/ari-source.ts` | CREATE | `AriSystem`, `AriSourceOption`, `AriSelection`, `ARI_SYSTEMS`, `CATEGORY_LABELS`, `getAriSourceList()` |
| `packages/shared/src/__tests__/ari-source.test.ts` | CREATE | Unit tests for `getAriSourceList()` |
| `packages/shared/src/index.ts` | MODIFY | Export `./types/ari-source.js` |
| `apps/web/src/lib/ari-systems.ts` | MODIFY | Re-export from `@ibe/shared` |
| `apps/api/prisma/schema.prisma` | MODIFY | Add `unknownPmsStatus String?` to `OnboardingInvitation` |
| `apps/api/src/routes/onboarding-admin.route.ts` | MODIFY | `createInvitationSchema` + handler + Prisma selects |
| `apps/web/package.json` | MODIFY | Add `@ibe/onboarding-flows: workspace:*` |
| `apps/web/src/lib/api-client.ts` | MODIFY | Add `unknownPmsStatus` to `createOnboardingInvitation` type |
| `apps/web/src/components/onboarding/AriSourceCombobox.tsx` | CREATE | Unified three-tier combobox (admin app) |
| `apps/web/src/app/admin/hotel-onboarding/page.tsx` | MODIFY | Replace `PMS_OPTIONS` + 2-step UI with `AriSourceCombobox` |
| `apps/onboarding/package.json` | MODIFY | Add `@ibe/shared`, `@ibe/onboarding-flows` workspace deps |
| `apps/onboarding-api/src/services/session.service.ts` | MODIFY | `initSelfRegistration` handles unknown PMS, returns redirect |
| `apps/onboarding-api/src/routes/session.route.ts` | MODIFY | `/register` accepts `unknownPmsName`/`unknownPmsStatus` |
| `apps/onboarding-api/src/services/__tests__/session.service.test.ts` | MODIFY | Add test for unknown-PMS self-registration |
| `apps/onboarding/src/components/AriSourceCombobox.tsx` | CREATE | Unified combobox (onboarding wizard app) |
| `apps/onboarding/src/lib/api.ts` | MODIFY | Update `register` type + response shape |
| `apps/onboarding/src/app/page.tsx` | MODIFY | Replace hardcoded select with `AriSourceCombobox` |

---

## Task 1: Add ARI source types and data to `@ibe/shared`

**Files:**
- Create: `packages/shared/src/types/ari-source.ts`
- Create: `packages/shared/src/__tests__/ari-source.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/src/types/ari-source.ts`**

```ts
export interface AriSystem {
  name: string
  category: 'PMS' | 'CM' | 'CRS'
}

export type AriSourceOption =
  | { kind: 'hg_has';      pmsId: number; name: string }
  | { kind: 'to_be_added'; name: string; category: 'PMS' | 'CM' | 'CRS' }

export type AriSelection =
  | { kind: 'hg_has';       pmsId: number; name: string }
  | { kind: 'to_be_added';  name: string }
  | { kind: 'to_be_checked'; name: string }

export const CATEGORY_LABELS: Record<AriSystem['category'], string> = {
  PMS: 'Property Management Systems (PMS)',
  CM:  'Channel Managers (CM)',
  CRS: 'Central Reservation Systems (CRS)',
}

/**
 * Returns the full merged list: VendorFlows first (HG has), then ARI_SYSTEMS (to be added).
 * Pass the result of listVendorFlows() from @ibe/onboarding-flows.
 * The "to be checked" tier is not a stored list — it is created at runtime from free-text input.
 */
export function getAriSourceList(
  vendorFlows: ReadonlyArray<{ pmsId: number; pmsName: string }>,
): AriSourceOption[] {
  const hg: AriSourceOption[] = [...vendorFlows]
    .sort((a, b) => a.pmsName.localeCompare(b.pmsName))
    .map(f => ({ kind: 'hg_has' as const, pmsId: f.pmsId, name: f.pmsName }))
  const toAdd: AriSourceOption[] = ARI_SYSTEMS.map(s => ({ kind: 'to_be_added' as const, name: s.name, category: s.category }))
  return [...hg, ...toAdd]
}

// ── Data ─────────────────────────────────────────────────────────────────────
// ARI sources HyperGuest does NOT yet have a connection for.
// Systems already in HG are covered by VendorFlows in @ibe/onboarding-flows.
export const ARI_SYSTEMS: AriSystem[] = [
  // ── Property Management Systems ────────────────────────────────────────────
  { name: 'Oracle OPERA 5 (Legacy On-Premises)',        category: 'PMS' },
  { name: 'Oracle Hospitality Suite8',                  category: 'PMS' },
  { name: 'Infor HMS',                                  category: 'PMS' },
  { name: 'Amadeus Cloud PMS',                          category: 'PMS' },
  { name: 'Agilysys Stay',                              category: 'PMS' },
  { name: 'Agilysys Visual One',                        category: 'PMS' },
  { name: 'Agilysys LMS',                               category: 'PMS' },
  { name: 'Sabre Hospitality Property Hub',             category: 'PMS' },
  { name: 'Sihot (Gubse AG)',                           category: 'PMS' },
  { name: 'Maestro PMS',                                category: 'PMS' },
  { name: 'Springer-Miller SMS|Host',                   category: 'PMS' },
  { name: 'IQware PMS',                                 category: 'PMS' },
  { name: 'Jonas Chorum (ChorumPM)',                    category: 'PMS' },
  { name: 'Stayntouch',                                 category: 'PMS' },
  { name: 'Clock PMS+',                                 category: 'PMS' },
  { name: 'HotelTime',                                  category: 'PMS' },
  { name: 'Jurny',                                      category: 'PMS' },
  { name: 'Base7booking',                               category: 'PMS' },
  { name: 'ThinkReservations',                          category: 'PMS' },
  { name: 'ResNexus',                                   category: 'PMS' },
  { name: 'innRoad',                                    category: 'PMS' },
  { name: 'RezStream',                                  category: 'PMS' },
  { name: 'SkyTouch PMS',                               category: 'PMS' },
  { name: 'HotelKey',                                   category: 'PMS' },
  { name: 'AutoClerk (BWH)',                            category: 'PMS' },
  { name: 'Hotello',                                    category: 'PMS' },
  // ── Channel Managers ───────────────────────────────────────────────────────
  { name: 'Rentals United',                             category: 'CM' },
  { name: 'MyAllocator (Cloudbeds CM)',                 category: 'CM' },
  { name: 'Seekda',                                     category: 'CM' },
  { name: 'Lodgify',                                    category: 'CM' },
  { name: 'Smoobu',                                     category: 'CM' },
  { name: 'Beds24',                                     category: 'CM' },
  { name: 'iGMS',                                       category: 'CM' },
  { name: 'Hostaway',                                   category: 'CM' },
  { name: 'Guesty',                                     category: 'CM' },
  { name: 'BookingSync (Smily)',                        category: 'CM' },
  { name: 'Kigo',                                       category: 'CM' },
  { name: 'CiiRUS',                                     category: 'CM' },
  { name: 'Track (formerly Barefoot)',                  category: 'CM' },
  { name: 'Hostfully',                                  category: 'CM' },
  { name: 'Tokeet',                                     category: 'CM' },
  { name: 'Avantio',                                    category: 'CM' },
  { name: 'Octorate',                                   category: 'CM' },
  { name: 'Hotel Res Bot',                              category: 'CM' },
  { name: 'Cultuzz (CultSwitch)',                       category: 'CM' },
  { name: 'Siteminder (for CM only use)',               category: 'CM' },
  { name: 'Hoteliga',                                   category: 'CM' },
  { name: 'BookingExperts',                             category: 'CM' },
  { name: 'Amenitiz',                                   category: 'CM' },
  { name: 'NewBook',                                    category: 'CM' },
  { name: 'Little Hotelier',                            category: 'CM' },
  { name: 'Cloudbeds (direct)',                         category: 'CM' },
  { name: 'ResRequest',                                 category: 'CM' },
  { name: 'Sirvoy',                                     category: 'CM' },
  { name: 'RoomKeyPMS',                                 category: 'CM' },
  { name: 'Lodgical Solution',                          category: 'CM' },
  { name: 'WebRezPro',                                  category: 'CM' },
  { name: 'Frontdesk Anywhere',                         category: 'CM' },
  { name: 'Hotelogix',                                  category: 'CM' },
  { name: 'Protel (by Planet)',                         category: 'CM' },
  { name: 'Fidelio Suite8',                             category: 'CM' },
  { name: 'Preno',                                      category: 'CM' },
  { name: 'Brilliant Hotel Software',                   category: 'CM' },
  { name: 'Guestline',                                  category: 'CM' },
  { name: 'Quovis',                                     category: 'CM' },
  { name: 'Fastbooking (DIRS21)',                       category: 'CM' },
  { name: 'DIRS21',                                     category: 'CM' },
  { name: 'Reservit',                                   category: 'CM' },
  // ── Central Reservation Systems ────────────────────────────────────────────
  { name: 'Amadeus iHotelier',                          category: 'CRS' },
  { name: 'Cendyn CRS (Pegasus / NextGuest / RezTrip)', category: 'CRS' },
  { name: 'Infor CRS',                                  category: 'CRS' },
  { name: 'Springer-Miller CRS',                        category: 'CRS' },
  { name: 'Maestro Multi-Property CRS',                 category: 'CRS' },
  { name: 'IQware CRS',                                 category: 'CRS' },
  { name: 'Agilysys rGuest Book Engine & CRS',          category: 'CRS' },
  { name: 'Guestcentric CRS',                           category: 'CRS' },
  { name: 'Roiback CRS',                                category: 'CRS' },
  { name: 'Mirai CRS',                                  category: 'CRS' },
  { name: 'RezNexus CRS',                               category: 'CRS' },
  { name: 'innRoad CRS',                                category: 'CRS' },
  { name: 'Bookassist CRS',                             category: 'CRS' },
  { name: 'Neobooking CRS',                             category: 'CRS' },
  { name: 'Seekom CRS',                                 category: 'CRS' },
  { name: 'ResRequest CRS',                             category: 'CRS' },
  { name: 'Hotelogix CRS',                              category: 'CRS' },
  { name: 'Avvio (Allo CRS)',                           category: 'CRS' },
  { name: 'IBC Hotels CRS',                             category: 'CRS' },
  { name: 'InnLink CRS',                                category: 'CRS' },
]
```

- [ ] **Step 2: Write failing tests in `packages/shared/src/__tests__/ari-source.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { getAriSourceList, ARI_SYSTEMS } from '../types/ari-source.js'

const mockFlows = [
  { pmsId: 12, pmsName: 'SiteMinder' },
  { pmsId: 4,  pmsName: 'Mews' },
]

describe('getAriSourceList', () => {
  it('returns hg_has items first, to_be_added items second', () => {
    const list = getAriSourceList(mockFlows)
    const firstKind = list[0].kind
    const lastKind = list[list.length - 1].kind
    expect(firstKind).toBe('hg_has')
    expect(lastKind).toBe('to_be_added')
  })

  it('hg_has items are sorted alphabetically', () => {
    const list = getAriSourceList(mockFlows)
    const hg = list.filter(o => o.kind === 'hg_has')
    expect(hg[0].name).toBe('Mews')
    expect(hg[1].name).toBe('SiteMinder')
  })

  it('returns one hg_has entry per vendor flow', () => {
    const list = getAriSourceList(mockFlows)
    const hg = list.filter(o => o.kind === 'hg_has')
    expect(hg).toHaveLength(mockFlows.length)
  })

  it('returns all ARI_SYSTEMS as to_be_added', () => {
    const list = getAriSourceList(mockFlows)
    const toAdd = list.filter(o => o.kind === 'to_be_added')
    expect(toAdd).toHaveLength(ARI_SYSTEMS.length)
  })

  it('empty vendor flows returns only to_be_added items', () => {
    const list = getAriSourceList([])
    expect(list.every(o => o.kind === 'to_be_added')).toBe(true)
  })

  it('hg_has items carry the pmsId', () => {
    const list = getAriSourceList(mockFlows)
    const mews = list.find(o => o.kind === 'hg_has' && o.name === 'Mews')
    expect(mews).toBeDefined()
    if (mews?.kind === 'hg_has') expect(mews.pmsId).toBe(4)
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/shared test -- --run
```

Expected: FAIL — `Cannot find module '../types/ari-source.js'`

- [ ] **Step 4: Export from `packages/shared/src/index.ts`**

Add this line at the end of `packages/shared/src/index.ts`:
```ts
export * from './types/ari-source.js'
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/shared test -- --run
```

Expected: all 6 tests PASS

- [ ] **Step 6: Build shared package**

```bash
cd /home/nir/ibe && pnpm --filter @ibe/shared build
```

Expected: no TypeScript errors, `dist/` updated

- [ ] **Step 7: Commit**

```bash
cd /home/nir/ibe
git add packages/shared/src/types/ari-source.ts packages/shared/src/__tests__/ari-source.test.ts packages/shared/src/index.ts packages/shared/dist
git commit -m "feat(shared): add AriSourceOption types and getAriSourceList"
```

---

## Task 2: Re-export `ari-systems` from `apps/web`

**Files:**
- Modify: `apps/web/src/lib/ari-systems.ts`

- [ ] **Step 1: Replace `apps/web/src/lib/ari-systems.ts` with a re-export**

Replace the entire file content with:
```ts
// Re-exported from @ibe/shared — edit the source there
export { ARI_SYSTEMS, CATEGORY_LABELS } from '@ibe/shared'
export type { AriSystem } from '@ibe/shared'
```

- [ ] **Step 2: Type-check web app**

```bash
cd /home/nir/ibe && pnpm --filter web type-check 2>&1 | head -30
```

Expected: no new errors related to `ari-systems`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/ari-systems.ts
git commit -m "refactor(web): re-export ari-systems from @ibe/shared"
```

---

## Task 3: DB migration — add `unknownPmsStatus`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add field to `OnboardingInvitation` in `apps/api/prisma/schema.prisma`**

Find the line:
```prisma
  unknownPmsName      String?            // hotel typed a CM name not in registry → triggers pending_ari_source
```

Add immediately after it:
```prisma
  unknownPmsStatus    String?            // 'to_be_added' | 'to_be_checked' — classification of unknownPmsName
```

- [ ] **Step 2: Run migration**

```bash
cd /home/nir/ibe/apps/api && npx prisma migrate dev --name add_unknown_pms_status
```

Expected: migration file created and applied, no errors

- [ ] **Step 3: Regenerate Prisma client in both apps**

```bash
cd /home/nir/ibe/apps/api && npx prisma generate
cd /home/nir/ibe/apps/onboarding-api && npx prisma generate
```

- [ ] **Step 4: Commit**

```bash
cd /home/nir/ibe
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add unknownPmsStatus to OnboardingInvitation"
```

---

## Task 4: Update API route for `unknownPmsStatus`

**Files:**
- Modify: `apps/api/src/routes/onboarding-admin.route.ts`

- [ ] **Step 1: Update `createInvitationSchema`**

Find:
```ts
  unknownPmsName:  z.string().optional(),
```

Replace with:
```ts
  unknownPmsName:   z.string().optional(),
  unknownPmsStatus: z.enum(['to_be_added', 'to_be_checked']).optional(),
```

- [ ] **Step 2: Save `unknownPmsStatus` in the creation handler**

Find the block that spreads `unknownPmsName` into the invitation creation data (around line 88):
```ts
      ...(body.unknownPmsName !== undefined && { unknownPmsName: body.unknownPmsName }),
```

Add after it:
```ts
      ...(body.unknownPmsStatus !== undefined && { unknownPmsStatus: body.unknownPmsStatus }),
```

- [ ] **Step 3: Add `unknownPmsStatus` to every Prisma `select` that includes `unknownPmsName`**

Search the file for `unknownPmsName: true` and add `unknownPmsStatus: true` on the next line for each occurrence.

Run: `grep -n "unknownPmsName: true" apps/api/src/routes/onboarding-admin.route.ts`

Add `unknownPmsStatus: true` after each match.

- [ ] **Step 4: Type-check**

```bash
cd /home/nir/ibe/apps/api && npx tsc --noEmit 2>&1 | grep -v "error TS2345\|error TS2339\|error TS2322\|onboarding-invitation" | head -20
```

Expected: no new errors from our changes (pre-existing errors are OK)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/onboarding-admin.route.ts
git commit -m "feat(api): accept and persist unknownPmsStatus on invitations"
```

---

## Task 5: Update admin API client type

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add `unknownPmsStatus` to `createOnboardingInvitation`**

Find the `createOnboardingInvitation` signature (around line 2588):
```ts
  async createOnboardingInvitation(data: { pmsId?: number; unknownPmsName?: string; hotelName?: string; ...
```

Add `unknownPmsStatus?: 'to_be_added' | 'to_be_checked';` to the data object type.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat(web): add unknownPmsStatus to createOnboardingInvitation type"
```

---

## Task 6: Add `@ibe/onboarding-flows` dep to web app and build `AriSourceCombobox`

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/onboarding/AriSourceCombobox.tsx`

- [ ] **Step 1: Add `@ibe/onboarding-flows` to `apps/web/package.json` dependencies**

Open `apps/web/package.json` and add to `"dependencies"`:
```json
"@ibe/onboarding-flows": "workspace:*"
```

- [ ] **Step 2: Install**

```bash
cd /home/nir/ibe && pnpm install
```

- [ ] **Step 3: Create `apps/web/src/components/onboarding/AriSourceCombobox.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { getAriSourceList, CATEGORY_LABELS, type AriSelection, type AriSourceOption } from '@ibe/shared';
import { listVendorFlows } from '@ibe/onboarding-flows';

const ALL_OPTIONS: AriSourceOption[] = getAriSourceList(listVendorFlows());

const inputStyle: React.CSSProperties = {
  padding: '0.6rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  boxSizing: 'border-box',
  fontSize: '0.875rem',
  width: '100%',
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: '0.3rem 0.75rem',
  fontSize: '0.7rem',
  fontWeight: 700,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  background: '#f9fafb',
  borderTop: '1px solid #f3f4f6',
  position: 'sticky',
  top: 0,
};

interface Props {
  value: AriSelection | null;
  onChange: (value: AriSelection | null) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

export function AriSourceCombobox({ value, onChange, placeholder = 'Search CM / PMS / CRS…', style }: Props) {
  const [inputText, setInputText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputText(value?.name ?? ''); }, [value]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const q = inputText.toLowerCase();
  const filtered = q
    ? ALL_OPTIONS.filter(o => o.name.toLowerCase().includes(q))
    : ALL_OPTIONS;

  const hgItems = filtered.filter(o => o.kind === 'hg_has');
  const toAddItems = filtered.filter(o => o.kind === 'to_be_added');
  const hasAnyMatch = filtered.length > 0;
  const showAddOption = q.length >= 2 && !hasAnyMatch;

  function select(opt: AriSourceOption) {
    if (opt.kind === 'hg_has') {
      onChange({ kind: 'hg_has', pmsId: opt.pmsId, name: opt.name });
    } else {
      onChange({ kind: 'to_be_added', name: opt.name });
    }
    setInputText(opt.name);
    setOpen(false);
  }

  function selectCustom() {
    const name = inputText.trim();
    if (!name) return;
    onChange({ kind: 'to_be_checked', name });
    setOpen(false);
  }

  function clear() {
    setInputText('');
    onChange(null);
    setOpen(true);
  }

  const badge = value
    ? value.kind === 'hg_has'
      ? { label: '✓ HG Connected', color: '#15803d', bg: '#dcfce7', border: '#86efac' }
      : value.kind === 'to_be_added'
        ? { label: '+ To Be Added', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' }
        : { label: '? To Be Checked', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' }
    : null;

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={inputText}
          autoComplete="off"
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={e => {
            setInputText(e.target.value);
            onChange(null);
            setOpen(true);
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && showAddOption) { e.preventDefault(); selectCustom(); }
          }}
          style={inputStyle}
        />
        {inputText && (
          <button type="button" onClick={clear}
            style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', lineHeight: 1, padding: '0.2rem' }}>
            ×
          </button>
        )}
      </div>

      {badge && (
        <div style={{ marginTop: '0.3rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: '999px', background: badge.bg, border: `1px solid ${badge.border}`, fontSize: '0.75rem', fontWeight: 600, color: badge.color }}>
          {badge.label}
        </div>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
          marginTop: '2px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          maxHeight: '280px', overflowY: 'auto',
        }}>
          {hgItems.length > 0 && (
            <div>
              <div style={sectionHeaderStyle}>✓ HG Connected</div>
              {hgItems.map(o => (
                <div key={o.pmsId ?? o.name} onMouseDown={() => select(o)}
                  style={{ padding: '0.45rem 0.75rem 0.45rem 1.25rem', cursor: 'pointer', fontSize: '0.875rem', color: '#1e293b' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {o.name}
                </div>
              ))}
            </div>
          )}

          {toAddItems.length > 0 && (
            <div>
              <div style={{ ...sectionHeaderStyle, borderTop: hgItems.length > 0 ? '1px solid #e5e7eb' : undefined }}>
                + To Be Added
              </div>
              {toAddItems.map(o => (
                <div key={o.name} onMouseDown={() => select(o)}
                  style={{ padding: '0.45rem 0.75rem 0.45rem 1.25rem', cursor: 'pointer', fontSize: '0.875rem', color: '#1e293b' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {o.name}
                </div>
              ))}
            </div>
          )}

          {showAddOption && (
            <div>
              <div style={{ ...sectionHeaderStyle, borderTop: '1px solid #e5e7eb' }}>? To Be Checked</div>
              <div onMouseDown={selectCustom}
                style={{ padding: '0.45rem 0.75rem 0.45rem 1.25rem', cursor: 'pointer', fontSize: '0.875rem', color: '#92400e', fontStyle: 'italic' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fef9c3')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                Add &quot;{inputText.trim()}&quot; — flag for HG team
              </div>
            </div>
          )}

          {!hasAnyMatch && !showAddOption && (
            <div style={{ padding: '0.75rem', color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center' }}>
              Keep typing to add as unknown…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
cd /home/nir/ibe/apps/web && npx tsc --noEmit 2>&1 | grep "AriSourceCombobox\|ari-source" | head -10
```

Expected: no errors on the new file

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/components/onboarding/AriSourceCombobox.tsx
git commit -m "feat(web): add unified AriSourceCombobox component"
```

---

## Task 7: Refactor admin hotel-onboarding page

**Files:**
- Modify: `apps/web/src/app/admin/hotel-onboarding/page.tsx`

The page currently has:
- `const PMS_OPTIONS = [...]` — hardcoded list of VendorFlows
- `ariInput` state (string) — typed text in the ARI field  
- `ariOpen` state (boolean) — whether the old dropdown is open
- `unknownPmsName` state (string) — name from `AriSystemCombobox` (step 2)
- Two inline custom dropdowns (one in the create form, one in the HG queue form)
- An `AriSystemCombobox` shown conditionally when "Not on the list" is selected
- `computeAriState()` that reads the above three states

All of this is replaced by:
- `ariSelection` state (`AriSelection | null`)
- A single `<AriSourceCombobox>` in each form

- [ ] **Step 1: Update imports at the top of the page**

Find:
```ts
import { AriSystemCombobox } from '@/components/onboarding/AriSystemCombobox';
```

Replace with:
```ts
import { AriSourceCombobox } from '@/components/onboarding/AriSourceCombobox';
import type { AriSelection } from '@ibe/shared';
```

- [ ] **Step 2: Remove `PMS_OPTIONS` constant**

Delete the entire `const PMS_OPTIONS = [...]` block (lines 9–100 approx). This is the hardcoded array with all batch entries.

- [ ] **Step 3: Replace state declarations**

Find these three state declarations (they will be near the top of the component function, around lines 265–275):
```ts
  const [unknownPmsName, setUnknownPmsName] = useState('');
```
and
```ts
  const [createForm, setCreateForm] = useState({ pmsId: 0, contactEmail: '' });
```
and any `ariInput`/`ariOpen` state lines.

Replace all three with:
```ts
  const [ariSelection, setAriSelection] = useState<AriSelection | null>(null);
  const [contactEmail, setContactEmail] = useState('');
```

Note: `createForm.contactEmail` was the only other field in `createForm`. Replace all uses of `createForm.contactEmail` with `contactEmail` and `setCreateForm(p => ({ ...p, contactEmail: e.target.value }))` with `setContactEmail(e.target.value)`.

- [ ] **Step 4: Rewrite `computeAriState()`**

Find and replace the entire `computeAriState` function:

```ts
  function computeAriState() {
    if (!ariSelection) return { isRegistered: false, isUnknown: false, cmName: '', unknownPmsStatus: undefined as 'to_be_added' | 'to_be_checked' | undefined }
    if (ariSelection.kind === 'hg_has') {
      return { isRegistered: true, isUnknown: false, cmName: ariSelection.name, pmsId: ariSelection.pmsId, unknownPmsStatus: undefined as 'to_be_added' | 'to_be_checked' | undefined }
    }
    return {
      isRegistered: false,
      isUnknown: true,
      cmName: ariSelection.name,
      pmsId: undefined as number | undefined,
      unknownPmsStatus: (ariSelection.kind === 'to_be_added' ? 'to_be_added' : 'to_be_checked') as 'to_be_added' | 'to_be_checked',
    }
  }
```

- [ ] **Step 5: Update `handleCreate` to pass `unknownPmsStatus`**

Find the `apiClient.createOnboardingInvitation` call inside `handleCreate`. The current spread is:
```ts
        ...(isRegistered ? { pmsId: createForm.pmsId } : { unknownPmsName: cmName || '(unknown)' }),
```

Replace with:
```ts
        ...(isRegistered
          ? { pmsId: ariSelection!.pmsId as number }
          : { unknownPmsName: cmName || '(unknown)', unknownPmsStatus }),
```

Also update the reset at the end of a successful create — replace:
```ts
      setCreateForm({ pmsId: 0, contactEmail: '' });
      setAriInput('');
      setUnknownPmsName('');
```
with:
```ts
      setAriSelection(null);
      setContactEmail('');
```

- [ ] **Step 6: Update `handleAddToHgQueue` similarly**

Find the `createOnboardingInvitation` call inside `handleAddToHgQueue`:
```ts
        ...(isRegistered ? { pmsId: createForm.pmsId } : { unknownPmsName: cmName || '(unknown)' }),
```

Replace with:
```ts
        ...(isRegistered
          ? { pmsId: ariSelection!.pmsId as number }
          : { unknownPmsName: cmName || '(unknown)', unknownPmsStatus }),
```

Also replace the reset block to use `setAriSelection(null)` and `setContactEmail('')`.

- [ ] **Step 7: Replace the two ARI control blocks in JSX**

**In the create form** (around line 1224), find the `<div ref={ariRef}>` block containing the `<input>` + `<ul>` custom dropdown + the conditional `AriSystemCombobox` section, and replace the entire ARI section with:

```tsx
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>ARI Source (CM / PMS / CRS) *</label>
                    <AriSourceCombobox value={ariSelection} onChange={setAriSelection} style={{ width: '100%' }} />
                  </div>
```

**In the HG queue form** (around line 808), find the similar `<div ref={ariRef}>` block containing the `ariInput` text input + the conditional `AriSystemCombobox` section, and replace with:

```tsx
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>ARI Source (CM / PMS / CRS) *</label>
                  <AriSourceCombobox value={ariSelection} onChange={setAriSelection} style={{ width: '100%' }} />
                </div>
```

Also delete the `ariRef` ref declaration and any click-outside effects that referenced `ariRef`.

- [ ] **Step 8: Update submit button enable conditions**

Find all places that check `createForm.pmsId > 0` or `ariInput` for enabling the submit button, and replace with checks on `ariSelection`:

```ts
const { isRegistered, isUnknown, cmName } = computeAriState()
const ok = contactEmail.trim().includes('@') && (isRegistered || (isUnknown && cmName))
```

- [ ] **Step 9: Update email input bindings**

Replace all `createForm.contactEmail` with `contactEmail` and all `setCreateForm(p => ({ ...p, contactEmail: e.target.value }))` with `setContactEmail(e.target.value)`.

- [ ] **Step 10: Type-check**

```bash
cd /home/nir/ibe/apps/web && npx tsc --noEmit 2>&1 | grep "hotel-onboarding/page\|AriSource" | head -20
```

Expected: no errors from the refactored page

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/app/admin/hotel-onboarding/page.tsx
git commit -m "feat(admin): replace 2-step ARI selection with unified AriSourceCombobox"
```

---

## Task 8: Backend — self-registration with unknown ARI

**Files:**
- Modify: `apps/onboarding-api/src/services/session.service.ts`
- Modify: `apps/onboarding-api/src/routes/session.route.ts`
- Modify: `apps/onboarding-api/src/services/__tests__/session.service.test.ts`

- [ ] **Step 1: Write a failing test for unknown-PMS self-registration**

In `apps/onboarding-api/src/services/__tests__/session.service.test.ts`, add a new `describe` block after the existing ones:

```ts
describe('initSelfRegistration with unknown PMS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.onboardingInvitation.create.mockResolvedValue({ id: 99 } as any)
  })

  it('returns redirect=pending when unknownPmsName is provided', async () => {
    const result = await initSelfRegistration({
      hotelName: 'Test Hotel',
      unknownPmsName: 'FakeCM',
      unknownPmsStatus: 'to_be_checked',
      contactEmail: 'test@hotel.com',
    })
    expect(result.redirect).toBe('pending')
    expect(result.sessionId).toBeUndefined()
  })

  it('creates invitation with hgStatus=needs_setup for unknown PMS', async () => {
    await initSelfRegistration({
      hotelName: 'Test Hotel',
      unknownPmsName: 'FakeCM',
      unknownPmsStatus: 'to_be_added',
      contactEmail: 'test@hotel.com',
    })
    expect(mockPrisma.onboardingInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unknownPmsName: 'FakeCM',
          unknownPmsStatus: 'to_be_added',
          hgStatus: 'needs_setup',
          source: 'self_registration',
        }),
      })
    )
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/nir/ibe && pnpm --filter onboarding-api test -- --run 2>&1 | grep -A3 "initSelfRegistration with unknown"
```

Expected: FAIL — function signature doesn't accept `unknownPmsName`

- [ ] **Step 3: Update `initSelfRegistration` in `apps/onboarding-api/src/services/session.service.ts`**

Replace the current `initSelfRegistration` function:

```ts
export async function initSelfRegistration(input: {
  hotelName: string;
  pmsId?: number;
  unknownPmsName?: string;
  unknownPmsStatus?: 'to_be_added' | 'to_be_checked';
  contactEmail: string;
  websiteUrl?: string;
}): Promise<{ redirect: 'wizard' | 'pending'; sessionId?: number }> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  if (input.unknownPmsName) {
    await prisma.onboardingInvitation.create({
      data: {
        source: 'self_registration',
        unknownPmsName: input.unknownPmsName,
        unknownPmsStatus: input.unknownPmsStatus ?? 'to_be_checked',
        hotelName: input.hotelName,
        contactEmail: input.contactEmail,
        hgStatus: 'needs_setup',
        ...(input.websiteUrl !== undefined ? { ibeUrl: input.websiteUrl } : {}),
        expiresAt,
        usedAt: new Date(),
      },
    });
    return { redirect: 'pending' };
  }

  const flow = await resolveVendorFlow(input.pmsId ?? 0);
  if (!flow) throw new OnboardingError(`No flow for pmsId ${input.pmsId}`, 'unknown_pms');

  const initialSteps = flow.steps.map((s) => ({ ...s, status: 'pending' }));

  const invitation = await prisma.onboardingInvitation.create({
    data: {
      source: 'self_registration',
      pmsId: input.pmsId,
      pmsName: flow.pmsName,
      hotelName: input.hotelName,
      contactEmail: input.contactEmail,
      ...(input.websiteUrl !== undefined ? { ibeUrl: input.websiteUrl } : {}),
      expiresAt,
      usedAt: new Date(),
    },
  });

  const session = await prisma.onboardingSession.create({
    data: {
      invitationId: invitation.id,
      stepsJson: initialSteps,
      currentStep: 0,
    },
  });

  return { redirect: 'wizard', sessionId: session.id };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd /home/nir/ibe && pnpm --filter onboarding-api test -- --run 2>&1 | grep -E "PASS|FAIL|initSelfRegistration"
```

Expected: all tests PASS

- [ ] **Step 5: Update `/register` endpoint in `apps/onboarding-api/src/routes/session.route.ts`**

Replace the entire `/register` handler:

```ts
  app.post<{ Body: { hotelName: string; pmsId?: number; unknownPmsName?: string; unknownPmsStatus?: 'to_be_added' | 'to_be_checked'; contactEmail: string; websiteUrl?: string } }>(
    '/register',
    async (request, reply) => {
      const { hotelName, pmsId, unknownPmsName, unknownPmsStatus, contactEmail, websiteUrl } = request.body;
      if (!hotelName || !contactEmail) return reply.badRequest('hotelName and contactEmail are required');
      if (!pmsId && !unknownPmsName) return reply.badRequest('pmsId or unknownPmsName is required');
      try {
        const result = await initSelfRegistration({
          hotelName,
          pmsId,
          unknownPmsName,
          unknownPmsStatus,
          contactEmail,
          ...(websiteUrl !== undefined ? { websiteUrl } : {}),
        });
        if (result.redirect === 'wizard' && result.sessionId) {
          setSessionCookie(reply, result.sessionId);
        }
        return reply.code(201).send({ ok: true, redirect: result.redirect });
      } catch (err: unknown) {
        return reply.badRequest(err instanceof Error ? err.message : 'Registration failed');
      }
    }
  );
```

- [ ] **Step 6: Commit**

```bash
git add apps/onboarding-api/src/services/session.service.ts apps/onboarding-api/src/routes/session.route.ts apps/onboarding-api/src/services/__tests__/session.service.test.ts
git commit -m "feat(onboarding-api): support unknown-PMS self-registration, return redirect"
```

---

## Task 9: Onboarding app — AriSourceCombobox and updated registration page

**Files:**
- Modify: `apps/onboarding/package.json`
- Create: `apps/onboarding/src/components/AriSourceCombobox.tsx`
- Modify: `apps/onboarding/src/lib/api.ts`
- Modify: `apps/onboarding/src/app/page.tsx`

- [ ] **Step 1: Add workspace deps to `apps/onboarding/package.json`**

Add to `"dependencies"`:
```json
"@ibe/shared": "workspace:*",
"@ibe/onboarding-flows": "workspace:*"
```

- [ ] **Step 2: Install**

```bash
cd /home/nir/ibe && pnpm install
```

- [ ] **Step 3: Create `apps/onboarding/src/components/AriSourceCombobox.tsx`**

Same logic as the web app version, but using the wizard's styling (slightly larger font/padding):

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { getAriSourceList, type AriSelection, type AriSourceOption } from '@ibe/shared';
import { listVendorFlows } from '@ibe/onboarding-flows';

const ALL_OPTIONS: AriSourceOption[] = getAriSourceList(listVendorFlows());

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '1rem',
  boxSizing: 'border-box',
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: '0.3rem 0.75rem',
  fontSize: '0.7rem',
  fontWeight: 700,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  background: '#f9fafb',
  borderTop: '1px solid #f3f4f6',
  position: 'sticky',
  top: 0,
};

interface Props {
  value: AriSelection | null;
  onChange: (value: AriSelection | null) => void;
}

export function AriSourceCombobox({ value, onChange }: Props) {
  const [inputText, setInputText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputText(value?.name ?? ''); }, [value]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const q = inputText.toLowerCase();
  const filtered = q ? ALL_OPTIONS.filter(o => o.name.toLowerCase().includes(q)) : ALL_OPTIONS;
  const hgItems = filtered.filter(o => o.kind === 'hg_has');
  const toAddItems = filtered.filter(o => o.kind === 'to_be_added');
  const showAddOption = q.length >= 2 && filtered.length === 0;

  function select(opt: AriSourceOption) {
    if (opt.kind === 'hg_has') onChange({ kind: 'hg_has', pmsId: opt.pmsId, name: opt.name });
    else onChange({ kind: 'to_be_added', name: opt.name });
    setInputText(opt.name);
    setOpen(false);
  }

  function selectCustom() {
    const name = inputText.trim();
    if (!name) return;
    onChange({ kind: 'to_be_checked', name });
    setOpen(false);
  }

  const badgeMap = {
    hg_has:       { label: '✓ HG Connected',  color: '#15803d', bg: '#dcfce7', border: '#86efac' },
    to_be_added:  { label: '+ To Be Added',   color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
    to_be_checked: { label: '? To Be Checked', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
  };
  const badge = value ? badgeMap[value.kind] : null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={inputText}
          autoComplete="off"
          placeholder="Search your Channel Manager / PMS / CRS…"
          onFocus={() => setOpen(true)}
          onChange={e => { setInputText(e.target.value); onChange(null); setOpen(true); }}
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && showAddOption) { e.preventDefault(); selectCustom(); }
          }}
          style={inputStyle}
        />
        {inputText && (
          <button type="button" onClick={() => { setInputText(''); onChange(null); setOpen(true); }}
            style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.1rem', lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>

      {badge && (
        <div style={{ marginTop: '0.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.7rem', borderRadius: '999px', background: badge.bg, border: `1px solid ${badge.border}`, fontSize: '0.8rem', fontWeight: 600, color: badge.color }}>
          {badge.label}
        </div>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
          marginTop: '2px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          maxHeight: '300px', overflowY: 'auto',
        }}>
          {hgItems.length > 0 && (
            <div>
              <div style={sectionHeaderStyle}>✓ HG Connected</div>
              {hgItems.map(o => (
                <div key={o.kind === 'hg_has' ? o.pmsId : o.name} onMouseDown={() => select(o)}
                  style={{ padding: '0.55rem 0.75rem 0.55rem 1.25rem', cursor: 'pointer', fontSize: '0.95rem', color: '#1e293b' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {o.name}
                </div>
              ))}
            </div>
          )}

          {toAddItems.length > 0 && (
            <div>
              <div style={{ ...sectionHeaderStyle, borderTop: hgItems.length > 0 ? '1px solid #e5e7eb' : undefined }}>
                + To Be Added
              </div>
              {toAddItems.map(o => (
                <div key={o.name} onMouseDown={() => select(o)}
                  style={{ padding: '0.55rem 0.75rem 0.55rem 1.25rem', cursor: 'pointer', fontSize: '0.95rem', color: '#1e293b' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {o.name}
                </div>
              ))}
            </div>
          )}

          {showAddOption && (
            <div>
              <div style={{ ...sectionHeaderStyle, borderTop: '1px solid #e5e7eb' }}>? To Be Checked</div>
              <div onMouseDown={selectCustom}
                style={{ padding: '0.55rem 0.75rem 0.55rem 1.25rem', cursor: 'pointer', fontSize: '0.95rem', color: '#92400e', fontStyle: 'italic' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fef9c3')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                Add &quot;{inputText.trim()}&quot; — we&apos;ll set it up for you
              </div>
            </div>
          )}

          {filtered.length === 0 && !showAddOption && (
            <div style={{ padding: '1rem', color: '#9ca3af', fontSize: '0.9rem', textAlign: 'center' }}>
              Keep typing to add as unknown…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update `apps/onboarding/src/lib/api.ts`**

Replace the `register` entry:
```ts
  register: (data: { hotelName: string; pmsId: number; contactEmail: string; websiteUrl?: string }) =>
    request<{ ok: boolean; sessionId: number }>('POST', '/register', data),
```

With:
```ts
  register: (data: { hotelName: string; pmsId?: number; unknownPmsName?: string; unknownPmsStatus?: 'to_be_added' | 'to_be_checked'; contactEmail: string; websiteUrl?: string }) =>
    request<{ ok: boolean; redirect: 'wizard' | 'pending' }>('POST', '/register', data),
```

- [ ] **Step 5: Rewrite `apps/onboarding/src/app/page.tsx`**

Replace the entire file:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AriSourceCombobox } from '@/components/AriSourceCombobox';
import type { AriSelection } from '@ibe/shared';

export default function RegisterPage() {
  const router = useRouter();
  const [hotelName, setHotelName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [ariSelection, setAriSelection] = useState<AriSelection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ariSelection) { setError('Please select your channel manager or PMS.'); return; }
    setLoading(true);
    setError(null);
    try {
      const body = ariSelection.kind === 'hg_has'
        ? { hotelName, pmsId: ariSelection.pmsId, contactEmail, ...(websiteUrl ? { websiteUrl } : {}) }
        : { hotelName, unknownPmsName: ariSelection.name, unknownPmsStatus: ariSelection.kind as 'to_be_added' | 'to_be_checked', contactEmail, ...(websiteUrl ? { websiteUrl } : {}) };
      const { redirect } = await api.register(body);
      router.push(redirect === 'wizard' ? '/wizard' : '/pending');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Connect Your Property</h1>
        <p style={{ color: '#666', marginBottom: '2rem' }}>Join HyperGuest in a few simple steps.</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Hotel Name</label>
            <input type="text" required value={hotelName} onChange={e => setHotelName(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Channel Manager / PMS / CRS</label>
            <AriSourceCombobox value={ariSelection} onChange={setAriSelection} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Contact Email</label>
            <input type="email" required value={contactEmail} onChange={e => setContactEmail(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Hotel Website <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span></label>
            <input type="url" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
              placeholder="https://" style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          {error && <p style={{ color: '#dc2626' }}>{error}</p>}
          <button type="submit" disabled={loading || !ariSelection}
            style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: (loading || !ariSelection) ? 'not-allowed' : 'pointer', opacity: (loading || !ariSelection) ? 0.7 : 1 }}>
            {loading ? 'Starting...' : 'Get Started →'}
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Type-check onboarding app**

```bash
cd /home/nir/ibe/apps/onboarding && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
cd /home/nir/ibe
git add apps/onboarding/package.json apps/onboarding/src/components/AriSourceCombobox.tsx apps/onboarding/src/lib/api.ts apps/onboarding/src/app/page.tsx
git commit -m "feat(onboarding): unified AriSourceCombobox on self-registration page"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Shared data layer (`@ibe/shared` exports `ARI_SYSTEMS`, `AriSourceOption`, `AriSelection`, `getAriSourceList`) — Task 1
- ✅ `unknownPmsStatus` DB field — Task 3
- ✅ API persists `unknownPmsStatus` — Task 4
- ✅ Admin combobox — Tasks 6, 7
- ✅ Self-registration combobox — Task 9
- ✅ 2-step flow removed — Tasks 7, 9
- ✅ `to_be_checked` created from free-text input — both comboboxes
- ✅ `apps/web/src/lib/ari-systems.ts` re-exports from shared — Task 2

**Type consistency:** `AriSelection` is defined in Task 1 and used consistently in Tasks 6, 7, 9. `getAriSourceList` signature matches usage in both combobox files.

**No placeholders found.**
