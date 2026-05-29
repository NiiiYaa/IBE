# ARI Source White Label — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to mark an ARI source as a white label of another from the `/admin/hotel-onboarding/ari-sources` UI, persist it in the DB, and have the onboarding wizard transparently use the master's flow at runtime.

**Architecture:** New `AriSourceWhiteLabel` Prisma model stores sparse WL mappings. Two super-admin API routes (GET/PUT) serve and update them. A new `resolveVendorFlow(pmsId)` helper in `onboarding-api` checks the DB before resolving the flow, replacing all direct `getVendorFlow` calls. The frontend loads WL data alongside the ARI sources list and adds an inline combobox editor in a new WL column.

**Tech Stack:** Prisma 5, Fastify, Zod, React (inline styles), Vitest

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `apps/api/prisma/schema.prisma` | Add `AriSourceWhiteLabel` model |
| Modify | `apps/api/src/routes/onboarding-admin.route.ts` | Add GET + PUT white-label routes |
| Modify | `apps/web/src/lib/api-client.ts` | Add `listAriWhiteLabels` + `setAriWhiteLabel` |
| Modify | `apps/web/src/app/admin/hotel-onboarding/ari-sources/page.tsx` | WL column + inline editor |
| Create | `apps/onboarding-api/src/services/flow-resolver.service.ts` | `resolveVendorFlow` with DB WL lookup |
| Create | `apps/onboarding-api/src/services/__tests__/flow-resolver.service.test.ts` | Tests for WL resolution |
| Modify | `apps/onboarding-api/src/services/session.service.ts` | Replace `getVendorFlow` calls |
| Modify | `apps/onboarding-api/src/services/step-executor.service.ts` | Replace `getVendorFlow` call |
| Modify | `apps/onboarding-api/src/routes/wizard.route.ts` | Replace `getVendorFlow` calls |
| Modify | `apps/onboarding-api/src/services/__tests__/session.service.test.ts` | Add mock for `resolveVendorFlow` |

---

## Task 1: DB Model + Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add model to schema**

Append at the end of `apps/api/prisma/schema.prisma`:

```prisma
model AriSourceWhiteLabel {
  pmsId             Int      @id
  whiteLabelOfPmsId Int
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api && pnpm db:migrate
```

When prompted for a migration name, enter: `ari_source_white_label`

Expected: Migration created and applied, Prisma client regenerated.

- [ ] **Step 3: Verify client has the new model**

```bash
grep -r "ariSourceWhiteLabel" apps/api/node_modules/.prisma/client/index.d.ts | head -3
```

Expected: lines mentioning `ariSourceWhiteLabel`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): add AriSourceWhiteLabel model"
```

---

## Task 2: API Routes (GET + PUT)

**Files:**
- Modify: `apps/api/src/routes/onboarding-admin.route.ts`

- [ ] **Step 1: Add Zod schema near top of file**

After the existing `createInvitationSchema` declaration (around line 26), add:

```ts
const setWhiteLabelSchema = z.object({
  whiteLabelOfPmsId: z.number().int().positive().nullable(),
})
```

- [ ] **Step 2: Add GET route**

After the existing `app.get('/admin/hotel-onboarding/ari-sources/list', ...)` handler (around line 84), add:

```ts
// GET /admin/hotel-onboarding/ari-sources/white-labels — all WL mappings
app.get('/admin/hotel-onboarding/ari-sources/white-labels', async (_request, reply) => {
  const mappings = await prisma.ariSourceWhiteLabel.findMany()
  const result: Record<string, number> = {}
  for (const m of mappings) result[String(m.pmsId)] = m.whiteLabelOfPmsId
  return reply.send(result)
})
```

- [ ] **Step 3: Add PUT route**

Directly after the GET route:

```ts
// PUT /admin/hotel-onboarding/ari-sources/white-labels/:pmsId — set or clear WL
app.put('/admin/hotel-onboarding/ari-sources/white-labels/:pmsId', async (request, reply) => {
  const me = request.admin
  if (me.role !== 'super') return reply.forbidden('Super admin required')
  const pmsId = parseInt((request.params as { pmsId: string }).pmsId)
  if (isNaN(pmsId)) return reply.badRequest('Invalid pmsId')
  const body = setWhiteLabelSchema.parse(request.body)
  if (body.whiteLabelOfPmsId === null) {
    await prisma.ariSourceWhiteLabel.deleteMany({ where: { pmsId } })
  } else {
    await prisma.ariSourceWhiteLabel.upsert({
      where:  { pmsId },
      update: { whiteLabelOfPmsId: body.whiteLabelOfPmsId },
      create: { pmsId, whiteLabelOfPmsId: body.whiteLabelOfPmsId },
    })
  }
  return reply.code(204).send()
})
```

- [ ] **Step 4: Restart ibe-api and smoke-test**

```bash
curl -s http://localhost:3001/api/v1/admin/hotel-onboarding/ari-sources/white-labels \
  -H "Cookie: <your-session-cookie>"
```

Expected: `{}` (empty object — no WL mappings yet).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/onboarding-admin.route.ts
git commit -m "feat(api): add GET+PUT routes for ARI source white-label mappings"
```

---

## Task 3: apiClient Additions

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add two methods after `listAriSources`**

Find `async listAriSources()` (around line 2620). After its closing `},`, add:

```ts
  async listAriWhiteLabels(): Promise<Record<number, number>> {
    return apiRequest('/api/v1/admin/hotel-onboarding/ari-sources/white-labels')
  },

  async setAriWhiteLabel(pmsId: number, masterPmsId: number | null): Promise<void> {
    return apiRequest(`/api/v1/admin/hotel-onboarding/ari-sources/white-labels/${pmsId}`, {
      method: 'PUT',
      body: JSON.stringify({ whiteLabelOfPmsId: masterPmsId }),
    })
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @ibe/web tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat(client): add listAriWhiteLabels and setAriWhiteLabel api methods"
```

---

## Task 4: flow-resolver Service + Tests

**Files:**
- Create: `apps/onboarding-api/src/services/flow-resolver.service.ts`
- Create: `apps/onboarding-api/src/services/__tests__/flow-resolver.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/flow-resolver.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client.js', () => ({
  prisma: {
    ariSourceWhiteLabel: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../../db/client.js';
import { resolveVendorFlow } from '../flow-resolver.service.js';

beforeEach(() => vi.clearAllMocks());

describe('resolveVendorFlow', () => {
  it('returns the flow for pmsId directly when no WL mapping exists', async () => {
    vi.mocked(prisma.ariSourceWhiteLabel.findUnique).mockResolvedValue(null);
    const flow = await resolveVendorFlow(12); // SiteMinder has a real flow
    expect(flow).toBeDefined();
    expect(flow?.pmsId).toBe(12);
  });

  it('returns the master flow when a WL mapping exists', async () => {
    vi.mocked(prisma.ariSourceWhiteLabel.findUnique).mockResolvedValue({
      pmsId: 85,
      whiteLabelOfPmsId: 30, // STAAH
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const flow = await resolveVendorFlow(85);
    expect(flow).toBeDefined();
    expect(flow?.pmsId).toBe(30);
  });

  it('returns undefined when pmsId has no flow and no WL mapping', async () => {
    vi.mocked(prisma.ariSourceWhiteLabel.findUnique).mockResolvedValue(null);
    const flow = await resolveVendorFlow(99999);
    expect(flow).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter onboarding-api test -- --run src/services/__tests__/flow-resolver.service.test.ts
```

Expected: FAIL — `resolveVendorFlow` not found.

- [ ] **Step 3: Create the service**

Create `apps/onboarding-api/src/services/flow-resolver.service.ts`:

```ts
import { prisma } from '../db/client.js';
import { getVendorFlow } from '@ibe/onboarding-flows';
import type { VendorFlow } from '@ibe/onboarding-flows';

export async function resolveVendorFlow(pmsId: number): Promise<VendorFlow | undefined> {
  const wl = await prisma.ariSourceWhiteLabel.findUnique({ where: { pmsId } });
  return getVendorFlow(wl?.whiteLabelOfPmsId ?? pmsId);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter onboarding-api test -- --run src/services/__tests__/flow-resolver.service.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/onboarding-api/src/services/flow-resolver.service.ts \
        apps/onboarding-api/src/services/__tests__/flow-resolver.service.test.ts
git commit -m "feat(onboarding-api): add resolveVendorFlow with DB white-label lookup"
```

---

## Task 5: Replace getVendorFlow Call Sites

**Files:**
- Modify: `apps/onboarding-api/src/services/session.service.ts`
- Modify: `apps/onboarding-api/src/services/step-executor.service.ts`
- Modify: `apps/onboarding-api/src/routes/wizard.route.ts`
- Modify: `apps/onboarding-api/src/services/__tests__/session.service.test.ts`

- [ ] **Step 1: Update session.service.ts imports**

In `apps/onboarding-api/src/services/session.service.ts`, replace:

```ts
import { getVendorFlow } from '@ibe/onboarding-flows';
```

with:

```ts
import { resolveVendorFlow } from './flow-resolver.service.js';
```

- [ ] **Step 2: Replace getVendorFlow calls in session.service.ts**

There are two call sites. Replace both:

```ts
// Line ~29 — in initSession:
const flow = getVendorFlow(invitation.pmsId ?? 0);
if (!flow) throw new OnboardingError(`No flow for pmsId ${invitation.pmsId}`, 'unknown_pms');
```
→
```ts
const flow = await resolveVendorFlow(invitation.pmsId ?? 0);
if (!flow) throw new OnboardingError(`No flow for pmsId ${invitation.pmsId}`, 'unknown_pms');
```

```ts
// Line ~106 — in the second function (createTestSession or similar):
const flow = getVendorFlow(input.pmsId);
if (!flow) throw new OnboardingError(`No flow for pmsId ${input.pmsId}`, 'unknown_pms');
```
→
```ts
const flow = await resolveVendorFlow(input.pmsId);
if (!flow) throw new OnboardingError(`No flow for pmsId ${input.pmsId}`, 'unknown_pms');
```

- [ ] **Step 3: Update session.service.test.ts to mock resolveVendorFlow**

In `apps/onboarding-api/src/services/__tests__/session.service.test.ts`, add this mock at the top (alongside the existing `vi.mock` for `db/client.js`):

```ts
vi.mock('../flow-resolver.service.js', () => ({
  resolveVendorFlow: vi.fn(),
}));
```

Then add the import and a `beforeEach` setup so existing tests keep working — find the `describe('initSession', ...)` block and add inside `beforeEach`:

```ts
import { resolveVendorFlow } from '../flow-resolver.service.js';
import { getVendorFlow } from '@ibe/onboarding-flows';

// inside beforeEach, after vi.clearAllMocks():
vi.mocked(resolveVendorFlow).mockResolvedValue(getVendorFlow(12)); // default: SiteMinder
```

- [ ] **Step 4: Run session.service tests**

```bash
pnpm --filter onboarding-api test -- --run src/services/__tests__/session.service.test.ts
```

Expected: all pass.

- [ ] **Step 5: Update step-executor.service.ts**

In `apps/onboarding-api/src/services/step-executor.service.ts`, replace:

```ts
import { getVendorFlow, type OnboardingContext } from '@ibe/onboarding-flows';
```
→
```ts
import { type OnboardingContext } from '@ibe/onboarding-flows';
import { resolveVendorFlow } from './flow-resolver.service.js';
```

Replace the call site (line ~26):

```ts
const flow = getVendorFlow(invitation.pmsId ?? 0);
```
→
```ts
const flow = await resolveVendorFlow(invitation.pmsId ?? 0);
```

Ensure the containing function is `async` (it should already be).

- [ ] **Step 6: Update wizard.route.ts**

In `apps/onboarding-api/src/routes/wizard.route.ts`, replace:

```ts
import { getVendorFlow } from '@ibe/onboarding-flows';
```
→
```ts
import { resolveVendorFlow } from '../services/flow-resolver.service.js';
```

Replace all four call sites (lines ~22, ~52, ~78, ~173) — each looks like:

```ts
const flow = getVendorFlow(session.invitation.pmsId ?? 0);
```
→
```ts
const flow = await resolveVendorFlow(session.invitation.pmsId ?? 0);
```

- [ ] **Step 7: Run full onboarding-api test suite**

```bash
pnpm --filter onboarding-api test -- --run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/onboarding-api/src/services/session.service.ts \
        apps/onboarding-api/src/services/step-executor.service.ts \
        apps/onboarding-api/src/routes/wizard.route.ts \
        apps/onboarding-api/src/services/__tests__/session.service.test.ts
git commit -m "feat(onboarding-api): replace getVendorFlow with resolveVendorFlow at all call sites"
```

---

## Task 6: Frontend — WL Column + Inline Editor

**Files:**
- Modify: `apps/web/src/app/admin/hotel-onboarding/ari-sources/page.tsx`

- [ ] **Step 1: Add WL state and load WL data on mount**

At the top of `AriSourcesPage`, add state variables after the existing `const [modal, setModal]` line:

```ts
const [wlMap, setWlMap]             = useState<Record<number, number>>({});
const [editingWlFor, setEditingWlFor] = useState<number | null>(null);
const [wlInput, setWlInput]         = useState('');
const [wlSaving, setWlSaving]       = useState<Record<number, boolean>>({});
const wlComboRef = useRef<HTMLDivElement>(null);
```

Add `useRef` to the import at the top of the file:

```ts
import { useEffect, useState, useRef, type CSSProperties } from 'react';
```

- [ ] **Step 2: Load WL data in parallel with sources**

Replace the existing `Promise.all` in `useEffect`:

```ts
Promise.all([
  apiClient.listAriSources(),
  apiClient.getOnboardingStats().catch(() => ({ ariStats: {}, ibeStats: {}, ibeSampleUrls: {} })),
  apiClient.listAriWhiteLabels().catch(() => ({})),
]).then(([src, s, wl]) => {
  setSources(src);
  setStats(s.ariStats);
  setWlMap(wl);
}).catch(() => {}).finally(() => setLoading(false));
```

- [ ] **Step 3: Add click-outside handler for WL combobox**

Add a new `useEffect` after the existing one:

```ts
useEffect(() => {
  function handleClick(e: MouseEvent) {
    if (wlComboRef.current && !wlComboRef.current.contains(e.target as Node)) {
      setEditingWlFor(null);
      setWlInput('');
    }
  }
  document.addEventListener('mousedown', handleClick);
  return () => document.removeEventListener('mousedown', handleClick);
}, []);
```

- [ ] **Step 4: Add save and clear helpers**

Add these functions inside the component, after the state declarations:

```ts
async function saveWl(pmsId: number, masterPmsId: number) {
  setWlSaving(p => ({ ...p, [pmsId]: true }));
  try {
    await apiClient.setAriWhiteLabel(pmsId, masterPmsId);
    setWlMap(p => ({ ...p, [pmsId]: masterPmsId }));
  } catch { /* ignore */ }
  finally {
    setWlSaving(p => ({ ...p, [pmsId]: false }));
    setEditingWlFor(null);
    setWlInput('');
  }
}

async function clearWl(pmsId: number) {
  setWlSaving(p => ({ ...p, [pmsId]: true }));
  try {
    await apiClient.setAriWhiteLabel(pmsId, null);
    setWlMap(p => { const next = { ...p }; delete next[pmsId]; return next; });
  } catch { /* ignore */ }
  finally { setWlSaving(p => ({ ...p, [pmsId]: false })); }
}
```

- [ ] **Step 5: Add WL column info entry**

In the `COLUMN_INFO` object, add:

```ts
'WL': {
  title: 'White Label of',
  body: `Marks this ARI source as a white-label variant of another. When set, the onboarding wizard will run the master's flow for hotels using this CM instead of looking for a separate flow.\n\nExample: Isprava is a white-label of STAAH — hotels with Isprava go through the STAAH wizard.\n\nThe invitation still records the hotel's actual CM (e.g. Isprava). Only the flow execution is redirected.`,
},
```

- [ ] **Step 6: Add WL to the column headers array**

Find:

```ts
{['HG ID', 'Name', 'Data Flow', 'Flags', 'Steps', 'Knowledge Base Verified', 'Pre-actions', 'Invitations', 'Approved'].map(h => (
```

Replace with:

```ts
{['HG ID', 'Name', 'Data Flow', 'Flags', 'Steps', 'Knowledge Base Verified', 'Pre-actions', 'WL', 'Invitations', 'Approved'].map(h => (
```

- [ ] **Step 7: Add WL cell to each table row**

In the `filtered.map(s => {...})` block, find the `<td>` for Invitations (`stats[s.pmsId]?.total`). Before it, add the WL cell:

```tsx
<td style={{ ...cell, minWidth: '140px' }}>
  {editingWlFor === s.pmsId ? (
    <div ref={wlComboRef} style={{ position: 'relative' }}>
      <input
        autoFocus
        type="text"
        value={wlInput}
        onChange={e => setWlInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { setEditingWlFor(null); setWlInput(''); } }}
        placeholder="Search CM…"
        style={{ width: '130px', padding: '3px 6px', border: '1px solid #2563eb', borderRadius: '4px', fontSize: '0.78rem' }}
      />
      <ul style={{
        position: 'absolute', top: '100%', left: 0, zIndex: 50,
        background: '#fff', border: '1px solid #d1d5db', borderRadius: '5px',
        margin: '2px 0 0', padding: 0, listStyle: 'none',
        maxHeight: '180px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        minWidth: '180px',
      }}>
        {sources
          .filter(o => o.pmsId !== s.pmsId && o.pmsName.toLowerCase().includes(wlInput.toLowerCase()))
          .map(o => (
            <li
              key={o.pmsId}
              onMouseDown={() => saveWl(s.pmsId, o.pmsId)}
              style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.78rem' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {o.pmsName}
            </li>
          ))
        }
        {sources.filter(o => o.pmsId !== s.pmsId && o.pmsName.toLowerCase().includes(wlInput.toLowerCase())).length === 0 && (
          <li style={{ padding: '0.4rem 0.75rem', color: '#9ca3af', fontSize: '0.78rem' }}>No match</li>
        )}
      </ul>
    </div>
  ) : wlMap[s.pmsId] != null ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
      <span
        onClick={() => { setEditingWlFor(s.pmsId); setWlInput(''); }}
        style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        title="Click to change">
        {sources.find(o => o.pmsId === wlMap[s.pmsId])?.pmsName ?? `#${wlMap[s.pmsId]}`}
      </span>
      <button
        onClick={() => clearWl(s.pmsId)}
        disabled={wlSaving[s.pmsId]}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', padding: '0 2px', lineHeight: 1 }}
        title="Clear white-label">
        {wlSaving[s.pmsId] ? '…' : '✕'}
      </button>
    </div>
  ) : (
    <button
      onClick={() => { setEditingWlFor(s.pmsId); setWlInput(''); }}
      disabled={wlSaving[s.pmsId]}
      style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px', fontSize: '0.72rem', color: '#6b7280' }}>
      {wlSaving[s.pmsId] ? '…' : 'Set WL'}
    </button>
  )}
</td>
```

- [ ] **Step 8: Fix empty-row colSpan**

Find `<td colSpan={9}` and change to `<td colSpan={10}`.

- [ ] **Step 9: Verify TypeScript**

```bash
pnpm --filter @ibe/web tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 10: Open the page and test manually**

Visit `http://localhost:3000/admin/hotel-onboarding/ari-sources`.

Verify:
1. "WL" column appears between "Pre-actions" and "Invitations"
2. Clicking "Set WL" on any row opens an inline combobox that filters ARI sources
3. Selecting a master saves it (badge appears) and the row updates without page reload
4. Clicking `✕` on a set WL clears it

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/app/admin/hotel-onboarding/ari-sources/page.tsx
git commit -m "feat(ui): add WL column and inline editor to ARI sources page"
```
