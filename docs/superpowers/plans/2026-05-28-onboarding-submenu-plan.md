# Onboarding Sub-Menu Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ARI Sources and IBEs sub-pages under Onboarding, each with live invitation/approval stats and a filter, plus rename "Hotel Onboarding" → "Invitations" in nav and page header.

**Architecture:** A new `GET /admin/hotel-onboarding/stats` endpoint aggregates invitation counts by pmsId and ibePattern in JS (single `findMany` + loop). Two new Next.js pages display static config rows enriched with live stats from the endpoint. Navigation and ob_agent redirect updated.

**Tech Stack:** TypeScript, Fastify, Next.js 14, Prisma

---

## Task 1: Stats API endpoint + apiClient method

**Files:**
- Modify: `apps/api/src/routes/onboarding-admin.route.ts`
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add the stats endpoint**

In `apps/api/src/routes/onboarding-admin.route.ts`, add after the existing `GET /admin/hotel-onboarding/invitations` route (after the closing `})` on line ~44):

```typescript
  app.get('/admin/hotel-onboarding/stats', async (request, reply) => {
    const me = request.admin
    if (!me.organizationId && me.role !== 'super') return reply.badRequest('No organization context')
    const orgFilter = me.role === 'super' ? {} : { organizationId: me.organizationId }

    const invitations = await prisma.onboardingInvitation.findMany({
      where: orgFilter,
      select: {
        pmsId: true,
        ibePattern: true,
        session: { select: { status: true } },
      },
    })

    const ariStats: Record<number, { total: number; approved: number }> = {}
    const ibeStats: Record<string, { total: number; approved: number }> = {}

    for (const inv of invitations) {
      if (inv.pmsId !== null) {
        if (!ariStats[inv.pmsId]) ariStats[inv.pmsId] = { total: 0, approved: 0 }
        ariStats[inv.pmsId]!.total++
        if (inv.session?.status === 'approved') ariStats[inv.pmsId]!.approved++
      }
      if (inv.ibePattern) {
        if (!ibeStats[inv.ibePattern]) ibeStats[inv.ibePattern] = { total: 0, approved: 0 }
        ibeStats[inv.ibePattern]!.total++
        if (inv.session?.status === 'approved') ibeStats[inv.ibePattern]!.approved++
      }
    }

    return reply.send({ ariStats, ibeStats })
  })
```

- [ ] **Step 2: Add `getOnboardingStats` to apiClient**

In `apps/web/src/lib/api-client.ts`, in the Self-Onboarding section, add after `listOnboardingInvitations`:

```typescript
  async getOnboardingStats(): Promise<{
    ariStats: Record<number, { total: number; approved: number }>
    ibeStats: Record<string, { total: number; approved: number }>
  }> {
    return apiRequest('/api/v1/admin/hotel-onboarding/stats')
  },
```

- [ ] **Step 3: Type-check both apps**

```bash
pnpm --filter @ibe/api exec tsc --noEmit
pnpm --filter @ibe/web type-check
```
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/onboarding-admin.route.ts \
        apps/web/src/lib/api-client.ts
git commit -m "feat(api): onboarding stats endpoint — invitation counts by pmsId and ibePattern"
```

---

## Task 2: Navigation + rename

**Files:**
- Modify: `apps/web/src/app/admin/_layout-client.tsx`
- Modify: `apps/web/src/app/admin/hotel-onboarding/page.tsx`

- [ ] **Step 1: Update Onboarding section in `_layout-client.tsx`**

Find the Onboarding section (currently lines ~142-147):
```typescript
  {
    title: 'Onboarding',
    minRole: 'admin',
    items: [
      { href: '/admin/hotel-onboarding', label: 'Hotel Onboarding', minRole: 'admin' },
    ],
  },
```

Replace with:
```typescript
  {
    title: 'Onboarding',
    minRole: 'admin',
    items: [
      { href: '/admin/hotel-onboarding', label: 'Invitations', minRole: 'admin' },
      { href: '/admin/hotel-onboarding/ari-sources', label: 'ARI Sources', minRole: 'admin' },
      { href: '/admin/hotel-onboarding/ibes', label: 'IBEs', minRole: 'admin' },
    ],
  },
```

- [ ] **Step 2: Fix ob_agent redirect in `_layout-client.tsx`**

Find the ob_agent redirect useEffect (around line 355):
```typescript
    if (isAuthenticated && role === 'ob_agent' && !isAuthPage && pathname !== '/admin/hotel-onboarding' && pathname !== '/admin/force-change-password' && pathname !== '/admin/profile') {
```

Replace with:
```typescript
    if (isAuthenticated && role === 'ob_agent' && !isAuthPage && !pathname.startsWith('/admin/hotel-onboarding') && pathname !== '/admin/force-change-password' && pathname !== '/admin/profile') {
```

- [ ] **Step 3: Rename h1 in `hotel-onboarding/page.tsx`**

Find:
```typescript
      <h1 style={{ marginBottom: '0.25rem' }}>Hotel Onboarding</h1>
```

Replace with:
```typescript
      <h1 style={{ marginBottom: '0.25rem' }}>Invitations</h1>
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @ibe/web type-check
```
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/_layout-client.tsx \
        apps/web/src/app/admin/hotel-onboarding/page.tsx
git commit -m "feat(web): add ARI Sources + IBEs to nav, rename Hotel Onboarding → Invitations"
```

---

## Task 3: ARI Sources page

**Files:**
- Create: `apps/web/src/app/admin/hotel-onboarding/ari-sources/page.tsx`

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/admin/hotel-onboarding/ari-sources/page.tsx`:

```typescript
'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { apiClient } from '@/lib/api-client';

const ARI_SOURCES = [
  { name: 'SiteMinder', pmsId: 12, dataFlow: 'blank', useDefaultCodes: false, regionAware: true, steps: 13 },
  { name: 'TravelClick', pmsId: 25, dataFlow: 'blank', useDefaultCodes: true, regionAware: true, steps: 13 },
] as const;

export default function AriSourcesPage() {
  const [filter, setFilter] = useState('');
  const [stats, setStats] = useState<Record<number, { total: number; approved: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getOnboardingStats()
      .then(s => setStats(s.ariStats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = ARI_SOURCES.filter(s =>
    s.name.toLowerCase().includes(filter.toLowerCase())
  );

  const cell: CSSProperties = { padding: '0.75rem 1rem' };
  const hcell: CSSProperties = { ...cell, textAlign: 'left', fontWeight: 600 };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>ARI Sources</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>Registered channel manager integrations available for self-onboarding.</p>

      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter by name…"
        style={{ width: '100%', maxWidth: '320px', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '1rem', display: 'block' }}
      />

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Name', 'pmsId', 'Data Flow', 'Default Codes', 'Region Aware', 'Steps', 'Invitations', 'Approved'].map(h => (
                <th key={h} style={hcell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.pmsId} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td style={{ ...cell, fontWeight: 600 }}>{s.name}</td>
                <td style={{ ...cell, color: '#6b7280' }}>{s.pmsId}</td>
                <td style={cell}>
                  <span style={{
                    background: '#fef3c7', color: '#92400e',
                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                  }}>
                    {s.dataFlow}
                  </span>
                </td>
                <td style={cell}>{s.useDefaultCodes ? 'Yes' : 'No'}</td>
                <td style={cell}>{s.regionAware ? 'Yes' : 'No'}</td>
                <td style={cell}>{s.steps}</td>
                <td style={cell}>{loading ? '—' : (stats[s.pmsId]?.total ?? 0)}</td>
                <td style={cell}>{loading ? '—' : (stats[s.pmsId]?.approved ?? 0)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...cell, textAlign: 'center', color: '#6b7280' }}>No results</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @ibe/web type-check
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/hotel-onboarding/ari-sources/page.tsx
git commit -m "feat(web): ARI Sources page with stats"
```

---

## Task 4: IBEs page

**Files:**
- Create: `apps/web/src/app/admin/hotel-onboarding/ibes/page.tsx`

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/admin/hotel-onboarding/ibes/page.tsx`:

```typescript
'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { apiClient } from '@/lib/api-client';

const IBES = [
  { name: 'Sentec',            detection: 'Domain',       scraping: 'Full',        harvester: true,  sampleUrl: null as string | null },
  { name: 'SimpleBooking.it',  detection: 'Domain',       scraping: 'Full',        harvester: true,  sampleUrl: null },
  { name: 'direct-book.com',   detection: 'Domain',       scraping: 'Full',        harvester: true,  sampleUrl: null },
  { name: 'BookingExpert',     detection: 'Domain+Params',scraping: 'Search only', harvester: false, sampleUrl: null },
  { name: 'Falkensteiner',     detection: 'Domain',       scraping: 'Search only', harvester: false, sampleUrl: null },
  { name: 'BookSecure',        detection: 'Domain',       scraping: 'Search only', harvester: false, sampleUrl: null },
  { name: 'Sabre SynXis',      detection: 'Params',       scraping: 'Search only', harvester: true,  sampleUrl: null },
  { name: 'WebHotelier',       detection: 'Domain',       scraping: 'Search only', harvester: false, sampleUrl: null },
  { name: 'Hotels of Mykonos', detection: 'Domain',       scraping: 'Search only', harvester: false, sampleUrl: null },
  { name: 'Zenith Hotels (MY)',detection: 'Domain',       scraping: 'Search only', harvester: false, sampleUrl: null },
  { name: 'Lighthouse',        detection: 'Domain',       scraping: 'Search only', harvester: false, sampleUrl: null },
  { name: 'TravelClick',       detection: 'Params',       scraping: 'Search only', harvester: false, sampleUrl: null },
  { name: 'Hotetec',           detection: 'Params',       scraping: 'Search only', harvester: false, sampleUrl: null },
];

export default function IbesPage() {
  const [filter, setFilter] = useState('');
  const [stats, setStats] = useState<Record<string, { total: number; approved: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getOnboardingStats()
      .then(s => setStats(s.ibeStats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = IBES.filter(ibe =>
    ibe.name.toLowerCase().includes(filter.toLowerCase())
  );

  const cell: CSSProperties = { padding: '0.75rem 1rem' };
  const hcell: CSSProperties = { ...cell, textAlign: 'left', fontWeight: 600 };

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>IBEs</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>Known Internet Booking Engine patterns supported for automated hotel data harvesting.</p>

      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter by name…"
        style={{ width: '100%', maxWidth: '320px', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '1rem', display: 'block' }}
      />

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Name', 'Detection', 'Scraping', 'Harvester', 'Invitations', 'Approved', 'View'].map(h => (
                <th key={h} style={hcell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(ibe => (
              <tr key={ibe.name} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td style={{ ...cell, fontWeight: 600 }}>{ibe.name}</td>
                <td style={{ ...cell, color: '#6b7280', fontSize: '0.8rem' }}>{ibe.detection}</td>
                <td style={cell}>
                  {ibe.scraping === 'Full' ? (
                    <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>✓ Full</span>
                  ) : (
                    <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>⚠ Search only</span>
                  )}
                </td>
                <td style={cell}>
                  <span style={{ fontWeight: 700, color: ibe.harvester ? '#16a34a' : '#dc2626' }}>
                    {ibe.harvester ? '✅' : '❌'}
                  </span>
                </td>
                <td style={cell}>{loading ? '—' : (stats[ibe.name]?.total ?? 0)}</td>
                <td style={cell}>{loading ? '—' : (stats[ibe.name]?.approved ?? 0)}</td>
                <td style={cell}>
                  {ibe.sampleUrl ? (
                    <a href={ibe.sampleUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.8rem' }}>
                      View →
                    </a>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...cell, textAlign: 'center', color: '#6b7280' }}>No results</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @ibe/web type-check
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/hotel-onboarding/ibes/page.tsx
git commit -m "feat(web): IBEs page with harvester status and stats"
```
