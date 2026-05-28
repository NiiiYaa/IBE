# Self-Onboarding Phase 2-A Part 2: cm_settings, Steps 9–12, Candidate Search

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the SiteMinder wizard: Data Review room-code entry, cm_settings rate-plan mapping UI, blank-flow HG BO API steps (create_rooms / create_rateplans / create_policies / create_taxes), and candidate search with DuckDuckGo + screenshots.

**Prerequisite:** All 8 tasks in Part 1 (`2026-05-28-onboarding-phase2a-part1-plan.md`) must be complete.

**Architecture:** Wizard state API gains `dataFlow` + `harvestedRooms` fields. DataReviewStep gains room-code section. New `CmSettingsStep` renders rate-plan rows from `harvestedData.discoveredRatePlanTypes`. Step executor handles four new blank-flow step IDs. Candidate search scrapes DuckDuckGo and takes Playwright screenshots.

**Tech Stack:** Next.js 14, Fastify 4, Playwright, Vitest, Zod, TypeScript ESM

---

## Task 9: Wizard state API — expose dataFlow + harvestedRooms

**Files:**
- Modify: `apps/onboarding-api/src/routes/wizard.route.ts`
- Modify: `apps/onboarding/src/lib/api.ts`

The `DataReviewStep` and `CmSettingsStep` need to know (a) whether the flow is blank (to show room-code inputs) and (b) which rooms were harvested. Both come from the server.

- [ ] **Step 1: Update GET /wizard/state**

In `apps/onboarding-api/src/routes/wizard.route.ts`, update the `GET /wizard/state` handler return value:

```typescript
app.get('/wizard/state', async (request, reply) => {
  const sessionId = getSessionIdFromCookie(request);
  if (!sessionId) return reply.unauthorized('No session');

  const session = await getSession(sessionId);
  if (!session) return reply.notFound('Session not found');

  const flow = getVendorFlow(session.invitation.pmsId ?? 0);
  const harvestedData = session.harvestedData as Record<string, unknown> | null;

  return {
    sessionId: session.id,
    pmsId: session.invitation.pmsId,
    pmsName: session.invitation.pmsName,
    dataFlow: flow?.dataFlow ?? null,
    currentStep: session.currentStep,
    totalSteps: flow?.steps.length ?? 0,
    steps: session.stepsJson,
    enrichedData: session.enrichedData,
    harvestedRooms: (harvestedData?.rooms as Array<{ name: string; description: string }> | null) ?? null,
    harvestedRatePlanTypes: (harvestedData?.discoveredRatePlanTypes as unknown[] | null) ?? null,
    harvestedTaxes: (harvestedData?.taxesAndFees as unknown[] | null) ?? null,
    hgPropertyCode: session.hgPropertyCode,
    status: session.status,
  };
});
```

- [ ] **Step 2: Update WizardState type in api.ts**

In `apps/onboarding/src/lib/api.ts`, update the `WizardState` interface:

```typescript
export interface WizardState {
  sessionId: number;
  pmsId: number | null;
  pmsName: string | null;
  dataFlow: 'hg_pulls' | 'blank' | 'reverse_pull' | null;
  currentStep: number;
  totalSteps: number;
  steps: Array<{ id: string; kind: string; title: string; description: string; status: string }>;
  enrichedData: Record<string, unknown> | null;
  harvestedRooms: Array<{ name: string; description: string }> | null;
  harvestedRatePlanTypes: Array<{
    boardCode: string; boardCodeRawName: string;
    hasRefundable: boolean; hasNonRefundable: boolean;
    refundableExampleName: string | null;
    refundableCancellationPolicy: unknown | null;
  }> | null;
  harvestedTaxes: Array<{ name: string; amount: string | null; notes: string | null; source: string }> | null;
  hgPropertyCode: string | null;
  status: string;
}
```

- [ ] **Step 3: Type check both apps**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm type-check 2>&1
cd /home/nir/ibe/apps/onboarding && pnpm type-check 2>&1
```
Expected: no errors.

- [ ] **Step 4: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/src/routes/wizard.route.ts \
        apps/onboarding/src/lib/api.ts
git commit -m "feat(onboarding): expose dataFlow + harvestedRooms in wizard state API"
```

---

## Task 10: DataReview — room codes + extend harvest + add room manually

**Files:**
- Modify: `apps/onboarding-api/src/routes/wizard.route.ts` (add 2 new routes)
- Modify: `apps/onboarding/src/components/steps/DataReviewStep.tsx`
- Modify: `apps/onboarding/src/lib/api.ts` (add 2 methods)

### Part A — Backend routes

- [ ] **Step 1: Add extend-harvest and add-room-manually routes**

In `apps/onboarding-api/src/routes/wizard.route.ts`, add to `wizardRoutes`:

```typescript
// POST /wizard/extend-harvest — runs extended search (90d/3-night, up to 5A) via SSE
app.get('/wizard/extend-harvest', async (request, reply) => {
  const sessionId = getSessionIdFromCookie(request);
  if (!sessionId) return reply.unauthorized('No session');
  const session = await getSession(sessionId);
  if (!session) return reply.notFound();
  if (!session.invitation.ibeUrl) return reply.badRequest('No IBE URL');

  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  const sseEvent = (data: Record<string, unknown>) =>
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    sseEvent({ type: 'progress', message: 'Running extended search (90 days, 3 nights, up to 5 adults)...' });
    // Extended harvest re-runs harvestFromUrl with extended context
    // The harvester merges new rooms with existing harvestedData
    const existing = (session.harvestedData as Record<string, unknown>) ?? {};
    const { harvestFromUrl } = await import('../services/ibe-harvester.service.js');
    const newData = await harvestFromUrl(
      session.invitation.ibeUrl,
      (msg: string) => sseEvent({ type: 'progress', message: msg }),
    );
    // Merge rooms: deduplicate by name
    const existingRooms = (existing['rooms'] as Array<{ name: string }>) ?? [];
    const newRooms = newData.rooms.filter(r => !existingRooms.some(e => e.name === r.name));
    const merged = { ...existing, ...newData, rooms: [...existingRooms, ...newRooms] };
    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: { harvestedData: merged as any },
    });
    sseEvent({ type: 'complete', newRoomCount: newRooms.length });
  } catch (err: unknown) {
    sseEvent({ type: 'error', message: err instanceof Error ? err.message : 'Extended harvest failed' });
  }
  reply.raw.end();
});

// POST /wizard/add-room-manually — hotel adds a room the harvester missed
app.post<{ Body: { name: string; maxAdults: number; maxOccupancy: number; bedConfiguration: string } }>(
  '/wizard/add-room-manually',
  async (request, reply) => {
    const sessionId = getSessionIdFromCookie(request);
    if (!sessionId) return reply.unauthorized('No session');
    const session = await getSession(sessionId);
    if (!session) return reply.notFound();

    const { name, maxAdults, maxOccupancy, bedConfiguration } = request.body;
    if (!name?.trim()) return reply.badRequest('name required');

    const existing = (session.harvestedData as Record<string, unknown>) ?? {};
    const rooms = ((existing['rooms'] as unknown[]) ?? []) as Array<Record<string, unknown>>;
    const newRoom = {
      name: name.trim(), description: '', images: [],
      bedConfiguration: bedConfiguration ?? null,
      amenities: [], supportedOccupancies: [{ adults: maxAdults, children: 0 }],
      maxAdults, maxOccupancy,
    };
    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: { harvestedData: { ...existing, rooms: [...rooms, newRoom] } as any },
    });
    return reply.send({ ok: true });
  }
);
```

Add missing import at top of wizard.route.ts (prisma):
```typescript
import { prisma } from '../db/client.js';
```

- [ ] **Step 2: Add API methods to api.ts**

In `apps/onboarding/src/lib/api.ts`, add to the `api` export object:

```typescript
  extendHarvest: () => `${BASE}/wizard/extend-harvest`,  // returns SSE URL, not a fetch
  addRoomManually: (data: { name: string; maxAdults: number; maxOccupancy: number; bedConfiguration: string }) =>
    request<{ ok: boolean }>('POST', '/wizard/add-room-manually', data),
  submitCmSettings: (cmSettings: CmSettingsPayload) =>
    request<{ ok: boolean }>('POST', '/wizard/submit-cm-settings', { cmSettings }),
```

Add the `CmSettingsPayload` type to `api.ts`:

```typescript
export interface RatePlanRow {
  boardCode: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  boardCodeRawName: string;
  isRefundable: boolean;
  pmsRateplanCode: string;
  priceType: 'gross' | 'net';
  commissionPercent: number;
  charge: 'agent' | 'customer';
  cancellationPolicy: unknown | null;
}

export interface CmSettingsPayload {
  currency: string;
  pricingModel: 'per_room' | 'per_occupancy' | 'per_person';
  ratePlans: RatePlanRow[];
  taxRelations: Record<string, string>;
}
```

### Part B — DataReviewStep frontend

- [ ] **Step 3: Update DataReviewStep.tsx**

Replace the full content of `apps/onboarding/src/components/steps/DataReviewStep.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { WizardState } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  state: WizardState;
  onComplete: () => void;
}

const EDITABLE_FIELDS = [
  { key: 'hotelName', label: 'Hotel Name', type: 'text', required: true },
  { key: 'city', label: 'City', type: 'text', required: true },
  { key: 'countryCode', label: 'Country Code (2-letter)', type: 'text', required: true },
  { key: 'contactEmail', label: 'Contact Email', type: 'email', required: false },
  { key: 'starRating', label: 'Star Rating (1-5)', type: 'number', required: false },
  { key: 'roomCount', label: 'Number of Rooms', type: 'number', required: false },
];

export function DataReviewStep({ step, state, onComplete }: Props) {
  const enriched = state.enrichedData ?? {};
  const isBlank = state.dataFlow === 'blank';
  const rooms = state.harvestedRooms ?? [];

  const [fields, setFields] = useState<Record<string, string>>(
    Object.fromEntries(EDITABLE_FIELDS.map(f => [f.key, String(enriched[f.key] ?? '')]))
  );
  const [roomCodes, setRoomCodes] = useState<Record<string, string>>(
    Object.fromEntries(rooms.map(r => [r.name, String((enriched['roomCodes'] as Record<string, string> | undefined)?.[r.name] ?? '')]))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [extendStatus, setExtendStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: '', maxAdults: 2, maxOccupancy: 2, bedConfiguration: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fields['hotelName']?.trim()) { setError('Hotel name is required'); return; }
    if (!fields['city']?.trim()) { setError('City is required'); return; }
    if (!fields['countryCode']?.trim() || fields['countryCode'].length !== 2) { setError('Country code must be 2 letters'); return; }
    if (isBlank) {
      for (const room of rooms) {
        if (!roomCodes[room.name]?.trim()) { setError(`Enter CM code for room: ${room.name}`); return; }
      }
    }
    setError(null);
    setLoading(true);
    try {
      await api.confirmReview({ ...enriched, ...fields, ...(isBlank ? { roomCodes } : {}) });
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  function handleExtendHarvest() {
    setExtendStatus('running');
    const BASE = process.env['NEXT_PUBLIC_ONBOARDING_API_URL'] ?? 'http://localhost:3003';
    const es = new EventSource(`${BASE}/wizard/extend-harvest`, { withCredentials: true });
    es.onmessage = (e) => {
      const evt = JSON.parse(e.data as string);
      if (evt.type === 'complete') { setExtendStatus('done'); es.close(); onComplete(); }
      if (evt.type === 'error') { setExtendStatus('idle'); es.close(); }
    };
    es.onerror = () => { setExtendStatus('idle'); es.close(); };
  }

  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault();
    await api.addRoomManually(newRoom);
    setShowAddRoom(false);
    onComplete(); // reload state with new room
  }

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>{step.description}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {EDITABLE_FIELDS.map(f => (
          <div key={f.key}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>{f.label}</label>
            <input type={f.type} value={fields[f.key] ?? ''} onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
              style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
        ))}

        {isBlank && rooms.length > 0 && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Room type codes (must match your SiteMinder codes exactly)</p>
            {rooms.map(room => (
              <div key={room.name} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <span style={{ flex: 1, fontSize: '0.9rem' }}>{room.name}</span>
                <input type="text" placeholder="SM room code" value={roomCodes[room.name] ?? ''}
                  onChange={e => setRoomCodes(p => ({ ...p, [room.name]: e.target.value }))}
                  style={{ width: '160px', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
              </div>
            ))}
          </div>
        )}

        {/* Completeness check */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '1rem' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Found {rooms.length} room type{rooms.length !== 1 ? 's' : ''}. Does this look complete?</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {extendStatus === 'idle' && (
              <button type="button" onClick={handleExtendHarvest}
                style={{ padding: '0.4rem 0.9rem', border: '1px solid #d97706', borderRadius: '5px', background: 'transparent', color: '#92400e', cursor: 'pointer', fontSize: '0.85rem' }}>
                Run extended search
              </button>
            )}
            {extendStatus === 'running' && <span style={{ color: '#92400e', fontSize: '0.85rem' }}>Searching…</span>}
            {extendStatus === 'done' && <span style={{ color: '#065f46', fontSize: '0.85rem' }}>✓ Extended search complete</span>}
            <button type="button" onClick={() => setShowAddRoom(v => !v)}
              style={{ padding: '0.4rem 0.9rem', border: '1px solid #d1d5db', borderRadius: '5px', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }}>
              + Add a room manually
            </button>
          </div>
        </div>

        {showAddRoom && (
          <form onSubmit={handleAddRoom} style={{ background: '#f3f4f6', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontWeight: 600, margin: 0 }}>Add a room we didn't find</p>
            <input type="text" placeholder="Room name" required value={newRoom.name}
              onChange={e => setNewRoom(p => ({ ...p, name: e.target.value }))}
              style={{ padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input type="number" placeholder="Max adults" min={1} max={10} value={newRoom.maxAdults}
                onChange={e => setNewRoom(p => ({ ...p, maxAdults: parseInt(e.target.value) }))}
                style={{ flex: 1, padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
              <input type="number" placeholder="Max occupancy" min={1} max={10} value={newRoom.maxOccupancy}
                onChange={e => setNewRoom(p => ({ ...p, maxOccupancy: parseInt(e.target.value) }))}
                style={{ flex: 1, padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
              <input type="text" placeholder="Bed config (e.g. 1 King)" value={newRoom.bedConfiguration}
                onChange={e => setNewRoom(p => ({ ...p, bedConfiguration: e.target.value }))}
                style={{ flex: 2, padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
            </div>
            <button type="submit" style={{ padding: '0.6rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Add Room</button>
          </form>
        )}

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Confirm & Continue'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Update wizard page — pass state to DataReviewStep**

In `apps/onboarding/src/app/wizard/page.tsx`, update the `data_review` case:

```typescript
case 'data_review':
  return <DataReviewStep step={currentStepDef} state={state} onComplete={loadState} />;
```

And add the import:
```typescript
import { DataReviewStep } from '@/components/steps/DataReviewStep';
```
(replace the existing import if already present)

- [ ] **Step 5: Type check**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm type-check 2>&1
cd /home/nir/ibe/apps/onboarding && pnpm type-check 2>&1
```
Expected: no errors.

- [ ] **Step 6: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/src/routes/wizard.route.ts \
        apps/onboarding/src/components/steps/DataReviewStep.tsx \
        apps/onboarding/src/app/wizard/page.tsx \
        apps/onboarding/src/lib/api.ts
git commit -m "feat(onboarding): DataReview room codes + extend harvest + add room manually"
```

---

## Task 11: cm_settings backend

**Files:**
- Modify: `apps/onboarding-api/src/routes/wizard.route.ts`

- [ ] **Step 1: Add POST /wizard/submit-cm-settings**

In `apps/onboarding-api/src/routes/wizard.route.ts`, add:

```typescript
app.post<{ Body: { cmSettings: {
  currency: string;
  pricingModel: 'per_room' | 'per_occupancy' | 'per_person';
  ratePlans: Array<{
    boardCode: string; boardCodeRawName: string; isRefundable: boolean;
    pmsRateplanCode: string; priceType: 'gross' | 'net';
    commissionPercent: number; charge: 'agent' | 'customer';
    cancellationPolicy: unknown | null;
  }>;
  taxRelations: Record<string, string>;
} } }>(
  '/wizard/submit-cm-settings',
  async (request, reply) => {
    const sessionId = getSessionIdFromCookie(request);
    if (!sessionId) return reply.unauthorized('No session');
    const session = await getSession(sessionId);
    if (!session) return reply.notFound();
    const flow = getVendorFlow(session.invitation.pmsId ?? 0);
    if (!flow) return reply.badRequest('Unknown vendor');

    const { cmSettings } = request.body;
    if (!cmSettings.currency?.trim()) return reply.badRequest('currency required');
    if (cmSettings.ratePlans.length === 0) return reply.badRequest('at least one rate plan required');

    const needsCodes = !flow.ratePlanCodesProvidedByStaff && !flow.useDefaultCodes;
    if (needsCodes) {
      const missing = cmSettings.ratePlans.find(rp => !rp.pmsRateplanCode?.trim());
      if (missing) return reply.badRequest(`CM code required for rate plan: ${missing.boardCodeRawName}`);
    }

    const existing = (session.enrichedData as Record<string, unknown>) ?? {};
    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: { enrichedData: { ...existing, cmSettings } as any },
    });
    await advanceStep(sessionId, session.currentStep, {
      stepId: flow.steps[session.currentStep]?.id ?? '',
      success: true,
    });
    return reply.send({ ok: true });
  }
);
```

- [ ] **Step 2: Type check**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm type-check 2>&1
```
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/src/routes/wizard.route.ts
git commit -m "feat(onboarding): POST /wizard/submit-cm-settings route"
```

---

## Task 12: CmSettingsStep frontend

**Files:**
- Create: `apps/onboarding/src/components/steps/CmSettingsStep.tsx`
- Modify: `apps/onboarding/src/app/wizard/page.tsx`

- [ ] **Step 1: Create CmSettingsStep.tsx**

Create `apps/onboarding/src/components/steps/CmSettingsStep.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { api, type WizardState, type RatePlanRow } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  state: WizardState;
  onComplete: () => void;
}

const PRICING_MODELS = ['per_room', 'per_occupancy', 'per_person'] as const;
const BOARD_NAMES: Record<string, string> = { RO: 'Room Only', BB: 'Bed & Breakfast', HB: 'Half Board', FB: 'Full Board', AI: 'All Inclusive' };
const TAX_RELATIONS = ['included', 'add', 'display', 'optional', 'ignore'] as const;

export function CmSettingsStep({ step, state, onComplete }: Props) {
  const ratePlanTypes = state.harvestedRatePlanTypes ?? [];
  const taxes = state.harvestedTaxes ?? [];

  // Build initial rows: one per DiscoveredRatePlanType × R/NR
  function buildInitialRows(): RatePlanRow[] {
    const rows: RatePlanRow[] = [];
    for (const rpt of ratePlanTypes) {
      if (rpt.hasRefundable) {
        rows.push({
          boardCode: rpt.boardCode as RatePlanRow['boardCode'],
          boardCodeRawName: rpt.boardCodeRawName,
          isRefundable: true,
          pmsRateplanCode: '',
          priceType: 'gross',
          commissionPercent: 15,
          charge: 'agent',
          cancellationPolicy: rpt.refundableCancellationPolicy,
        });
      }
      if (rpt.hasNonRefundable) {
        rows.push({
          boardCode: rpt.boardCode as RatePlanRow['boardCode'],
          boardCodeRawName: rpt.boardCodeRawName,
          isRefundable: false,
          pmsRateplanCode: '',
          priceType: 'gross',
          commissionPercent: 15,
          charge: 'agent',
          cancellationPolicy: { type: 'non_refundable' },
        });
      }
    }
    return rows;
  }

  const [currency, setCurrency] = useState('');
  const [pricingModel, setPricingModel] = useState<'per_room' | 'per_occupancy' | 'per_person'>('per_room');
  const [rows, setRows] = useState<RatePlanRow[]>(buildInitialRows);
  const [taxRelations, setTaxRelations] = useState<Record<string, string>>(
    Object.fromEntries(taxes.map(t => [t.name, 'add']))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateRow(idx: number, patch: Partial<RatePlanRow>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function addRow() {
    setRows(prev => [...prev, {
      boardCode: 'RO', boardCodeRawName: 'Room Only', isRefundable: true,
      pmsRateplanCode: '', priceType: 'gross', commissionPercent: 15, charge: 'agent', cancellationPolicy: null,
    }]);
  }

  // Warn if HG minimum (RO+BB × R+NR) is not covered
  const missingMinimum = (() => {
    const has = (bc: string, nr: boolean) => rows.some(r => r.boardCode === bc && r.isRefundable === !nr);
    const missing = [];
    if (!has('RO', false)) missing.push('RO Refundable');
    if (!has('RO', true)) missing.push('RO Non-Refundable');
    if (!has('BB', false)) missing.push('BB Refundable');
    if (!has('BB', true)) missing.push('BB Non-Refundable');
    return missing;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currency.trim()) { setError('Currency is required (e.g. EUR, USD)'); return; }
    setError(null);
    setLoading(true);
    try {
      await api.submitCmSettings({ currency, pricingModel, ratePlans: rows, taxRelations });
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = { padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.85rem' } as const;

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>{step.description}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Block 1: property-level */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Currency</label>
            <input type="text" placeholder="EUR" maxLength={3} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())}
              style={{ ...inputStyle, width: '100px', textTransform: 'uppercase' }} />
          </div>
          <div style={{ flex: 2 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Pricing model</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {PRICING_MODELS.map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input type="radio" name="pricingModel" value={m} checked={pricingModel === m} onChange={() => setPricingModel(m)} />
                  {m.replace('_', ' ')}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Block 2: rate plan table */}
        <div>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Rate plan mapping</p>
          {missingMinimum.length > 0 && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.6rem 0.9rem', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#92400e' }}>
              ⚠ HG requires at least: {missingMinimum.join(', ')}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Board', 'Type', 'CM Code', 'Price type', 'Commission', 'Charge'].map(h => (
                  <th key={h} style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.4rem' }}>
                    <span style={{ fontWeight: 500 }}>{BOARD_NAMES[row.boardCode] ?? row.boardCode}</span>
                    <br />
                    <span style={{ color: '#6b7280', fontSize: '0.78rem' }}>{row.isRefundable ? 'Refundable' : 'Non-Refundable'}</span>
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <select value={row.boardCode} onChange={e => updateRow(idx, { boardCode: e.target.value as RatePlanRow['boardCode'] })} style={inputStyle}>
                      {Object.entries(BOARD_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <input type="text" placeholder="e.g. FLEX-BB" value={row.pmsRateplanCode}
                      onChange={e => updateRow(idx, { pmsRateplanCode: e.target.value })}
                      style={{ ...inputStyle, width: '110px' }} />
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <select value={row.priceType} onChange={e => updateRow(idx, { priceType: e.target.value as 'gross' | 'net' })} style={inputStyle}>
                      <option value="gross">gross</option>
                      <option value="net">net</option>
                    </select>
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <input type="number" min={0} max={100} value={row.commissionPercent}
                      onChange={e => updateRow(idx, { commissionPercent: parseFloat(e.target.value) })}
                      style={{ ...inputStyle, width: '60px' }} /> %
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <select value={row.charge} onChange={e => updateRow(idx, { charge: e.target.value as 'agent' | 'customer' })} style={inputStyle}>
                      <option value="agent">agent</option>
                      <option value="customer">customer</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addRow}
            style={{ marginTop: '0.5rem', padding: '0.4rem 0.8rem', border: '1px solid #d1d5db', borderRadius: '5px', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem' }}>
            + Add rate plan
          </button>
        </div>

        {/* Block 3: tax relations */}
        {taxes.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Tax & fee relations</p>
            {taxes.map(tax => (
              <div key={tax.name} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.4rem' }}>
                <span style={{ flex: 2, fontSize: '0.875rem' }}>
                  {tax.name} {tax.amount ? `(${tax.amount})` : ''}
                  {tax.source === 'lookup' && <span style={{ color: '#d97706', fontSize: '0.75rem' }}> ⚠ estimated</span>}
                </span>
                <select value={taxRelations[tax.name] ?? 'add'}
                  onChange={e => setTaxRelations(p => ({ ...p, [tax.name]: e.target.value }))}
                  style={{ ...inputStyle, width: '120px' }}>
                  {TAX_RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Save & Continue'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Wire into wizard page**

In `apps/onboarding/src/app/wizard/page.tsx`, add the import and case:

```typescript
import { CmSettingsStep } from '@/components/steps/CmSettingsStep';
```

In `renderStep()`, add:
```typescript
case 'cm_settings':
  return <CmSettingsStep step={currentStepDef} state={state} onComplete={loadState} />;
```

- [ ] **Step 3: Type check**
```bash
cd /home/nir/ibe/apps/onboarding && pnpm type-check 2>&1
```
Expected: no errors.

- [ ] **Step 4: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding/src/components/steps/CmSettingsStep.tsx \
        apps/onboarding/src/app/wizard/page.tsx
git commit -m "feat(onboarding): CmSettingsStep — rate plan mapping + tax relations UI"
```

---

## Task 13: Step executor — create_rooms, create_rateplans, create_policies, create_taxes

**Files:**
- Modify: `apps/onboarding-api/src/services/step-executor.service.ts`

- [ ] **Step 1: Add the four blank-flow cases**

In `apps/onboarding-api/src/services/step-executor.service.ts`, add these four `else if` blocks inside the `try` block (after the `trigger_ari_sync` case):

```typescript
} else if (step.id === 'create_rooms') {
  const harvestedData = (session.harvestedData as Record<string, unknown>) ?? {};
  const rooms = (harvestedData['rooms'] as Array<{ name: string; bedConfiguration?: string | null }>) ?? [];
  const roomCodes = ((session.enrichedData as Record<string, unknown>)?.['roomCodes'] as Record<string, string>) ?? {};
  const propertyCode = session.hgPropertyCode;
  if (!propertyCode) throw new Error('No property code — create_hg_property must run first');

  for (const room of rooms) {
    const code = roomCodes[room.name];
    if (!code) throw new Error(`No CM code for room: ${room.name}`);
    sseEvent(reply, { type: 'progress', message: `Creating room: ${room.name}` });
    try {
      await hgBoClient.createRoom(propertyCode, { type: room.name, name: room.name, code });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('409') && !msg.includes('already')) throw err; // 409 = already exists, treat as OK
    }
  }
  await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
  sseEvent(reply, { type: 'complete', stepId: step.id });

} else if (step.id === 'create_rateplans') {
  const propertyCode = session.hgPropertyCode;
  if (!propertyCode) throw new Error('No property code');
  const cmSettings = ((session.enrichedData as Record<string, unknown>)?.['cmSettings'] as {
    ratePlans: Array<{ pmsRateplanCode: string; boardCode: string; priceType: 'gross' | 'net' }>;
  }) ?? { ratePlans: [] };
  const roomCodes = ((session.enrichedData as Record<string, unknown>)?.['roomCodes'] as Record<string, string>) ?? {};
  const allRoomCodes = Object.values(roomCodes);

  for (const rp of cmSettings.ratePlans) {
    const code = flow.ratePlanCodeTransform
      ? flow.ratePlanCodeTransform(rp.pmsRateplanCode, rp.boardCode)
      : rp.pmsRateplanCode;
    if (!code) continue;
    sseEvent(reply, { type: 'progress', message: `Creating rate plan: ${code}` });
    try {
      await hgBoClient.createRatePlan(propertyCode, {
        name: code,
        pmsRateplanCode: code,
        priceType: rp.priceType,
        boardCode: rp.boardCode as 'RO' | 'BB' | 'HB' | 'FB' | 'AI',
      });
      if (allRoomCodes.length > 0) {
        await hgBoClient.linkRoomsToRatePlan(propertyCode, code, allRoomCodes);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('409') && !msg.includes('already')) throw err;
    }
  }
  await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
  sseEvent(reply, { type: 'complete', stepId: step.id });

} else if (step.id === 'create_policies') {
  const propertyCode = session.hgPropertyCode;
  if (!propertyCode) throw new Error('No property code');
  const cmSettings = ((session.enrichedData as Record<string, unknown>)?.['cmSettings'] as {
    ratePlans: Array<{ pmsRateplanCode: string; cancellationPolicy: unknown | null }>;
  }) ?? { ratePlans: [] };

  // Deduplicate policies by JSON fingerprint
  const policyMap = new Map<string, { payload: Record<string, unknown>; ratePlanCodes: string[] }>();
  for (const rp of cmSettings.ratePlans) {
    if (!rp.cancellationPolicy) continue;
    const key = JSON.stringify(rp.cancellationPolicy);
    if (!policyMap.has(key)) {
      policyMap.set(key, { payload: rp.cancellationPolicy as Record<string, unknown>, ratePlanCodes: [] });
    }
    policyMap.get(key)!.ratePlanCodes.push(rp.pmsRateplanCode);
  }

  for (const [, { payload, ratePlanCodes }] of policyMap) {
    sseEvent(reply, { type: 'progress', message: 'Creating cancellation policy...' });
    let policyCode: string;
    try {
      const result = await hgBoClient.createPolicy(propertyCode, payload);
      policyCode = result.policyCode;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('409') && !msg.includes('already')) throw err;
      continue; // already exists
    }
    for (const rpCode of ratePlanCodes) {
      await hgBoClient.linkPolicyToRatePlan(propertyCode, rpCode, policyCode).catch(() => {});
    }
  }
  await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
  sseEvent(reply, { type: 'complete', stepId: step.id });

} else if (step.id === 'create_taxes') {
  const propertyCode = session.hgPropertyCode;
  if (!propertyCode) throw new Error('No property code');
  const harvestedData = (session.harvestedData as Record<string, unknown>) ?? {};
  const taxes = (harvestedData['taxesAndFees'] as Array<{ name: string; amount: string | null }>) ?? [];
  const taxRelations = ((session.enrichedData as Record<string, unknown>)?.['cmSettings'] as { taxRelations: Record<string, string> } | undefined)?.taxRelations ?? {};
  const cmSettings = ((session.enrichedData as Record<string, unknown>)?.['cmSettings'] as { ratePlans: Array<{ pmsRateplanCode: string }> }) ?? { ratePlans: [] };

  for (const tax of taxes) {
    sseEvent(reply, { type: 'progress', message: `Creating tax: ${tax.name}` });
    const relation = (taxRelations[tax.name] ?? 'add') as 'included' | 'add' | 'display' | 'optional' | 'ignore';
    try {
      await hgBoClient.createTaxFee(propertyCode, {
        title: tax.name,
        chargeType: 'percent',
        chargeValue: parseFloat(tax.amount?.replace(/[^0-9.]/g, '') ?? '0') || 0,
        category: 'tax',
        scope: 'per_room',
        frequency: 'per_night',
        defaultRatePlanRelation: relation,
      });
      // Set per-rate-plan tax relation
      for (const rp of cmSettings.ratePlans) {
        await hgBoClient.setRatePlanTaxes(propertyCode, rp.pmsRateplanCode, { [tax.name]: relation }).catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('409') && !msg.includes('already')) throw err;
    }
  }

  // regionAware: flag for admin queue
  if (flow.regionAware) {
    const existing = (session.enrichedData as Record<string, unknown>) ?? {};
    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: { enrichedData: { ...existing, adminActions: ['verify_siteminder_region'] } as any },
    });
  }

  await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
  sseEvent(reply, { type: 'complete', stepId: step.id });
```

- [ ] **Step 2: Type check**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm type-check 2>&1
```
Expected: no errors.

- [ ] **Step 3: Run all tests**
```bash
pnpm vitest run 2>&1 | tail -10
```
Expected: all pass.

- [ ] **Step 4: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/src/services/step-executor.service.ts
git commit -m "feat(onboarding): blank-flow steps — create_rooms, create_rateplans, create_policies, create_taxes"
```

---

## Task 14: Hotel search service + search routes

**Files:**
- Create: `apps/onboarding-api/src/services/hotel-search.service.ts`
- Create: `apps/onboarding-api/src/services/__tests__/hotel-search.service.test.ts`
- Create: `apps/onboarding-api/src/routes/search.route.ts`
- Modify: `apps/onboarding-api/src/app.ts`

### Part A — hotel-search.service.ts

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/hotel-search.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../playwright-browser.service.js', () => ({
  withStealthPage: vi.fn(),
}));
vi.mock('../ibe-resolver.service.js', () => ({
  resolveIbeUrl: vi.fn().mockResolvedValue(null),
}));

import { withStealthPage } from '../playwright-browser.service.js';
import { searchHotels } from '../hotel-search.service.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('searchHotels', () => {
  it('returns candidates filtered of known OTAs', async () => {
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        waitForTimeout: vi.fn(),
        evaluate: vi.fn().mockResolvedValue([
          { url: 'https://grandhotel.com', title: 'Grand Hotel — Official Site' },
          { url: 'https://www.booking.com/hotel/grand', title: 'Grand Hotel on Booking.com' },
          { url: 'https://grandhotelresort.com', title: 'Grand Hotel Resort' },
        ]),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('img')),
        goto: vi.fn(),
      };
      return fn(mockPage as any);
    });

    const result = await searchHotels('Grand Hotel', 'Paris', 'France');
    const urls = result.map(c => c.url);
    expect(urls).not.toContain('https://www.booking.com/hotel/grand');
    expect(urls).toContain('https://grandhotel.com');
  });

  it('returns empty array when no results', async () => {
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        waitForTimeout: vi.fn(),
        evaluate: vi.fn().mockResolvedValue([]),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
        goto: vi.fn(),
      };
      return fn(mockPage as any);
    });
    const result = await searchHotels('Nonexistent Hotel', 'Nowhere', 'XX');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run failing test**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/hotel-search.service.test.ts 2>&1 | tail -8
```
Expected: FAIL.

- [ ] **Step 3: Create hotel-search.service.ts**

Create `apps/onboarding-api/src/services/hotel-search.service.ts`:

```typescript
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { withStealthPage } from './playwright-browser.service.js';
import { detectKnownIBE } from '@ibe/shared';

const OTA_BLOCKLIST = [
  'booking.com', 'expedia.com', 'hotels.com', 'tripadvisor.com', 'agoda.com',
  'airbnb.com', 'google.com/travel', 'kayak.com', 'trivago.com', 'orbitz.com',
  'priceline.com', 'hotelscombined.com',
];

const SCREENSHOTS_DIR = path.join(process.cwd(), 'uploads', 'screenshots');

export interface HotelCandidate {
  url: string;
  title: string;
  detected: boolean;
  screenshotUrl: string | null;
}

function isOta(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return OTA_BLOCKLIST.some(ota => hostname.includes(ota));
  } catch { return false; }
}

async function ensureScreenshotsDir() {
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
}

async function takeScreenshot(url: string): Promise<string | null> {
  try {
    await ensureScreenshotsDir();
    const filename = `${randomUUID()}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    await withStealthPage(url, async (page) => {
      // Dismiss cookie consent
      await page.waitForTimeout(1500);
      for (const btnText of ['Accept all', 'Accept', 'Agree', 'Continue', 'OK']) {
        const btn = await page.$(`button:has-text("${btnText}")`).catch(() => null);
        if (btn) { await btn.click().catch(() => {}); await page.waitForTimeout(500); break; }
      }
      const buffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1280, height: 800 } });
      await fs.writeFile(filepath, buffer);
    }, { navigationTimeout: 15000, idleTimeout: 8000 });

    // Set TTL: store creation time in filename as prefix
    const ttlFile = `${Date.now()}_${filename}`;
    await fs.rename(filepath, path.join(SCREENSHOTS_DIR, ttlFile));
    return `/screenshots/${ttlFile}`;
  } catch {
    return null;
  }
}

export async function searchHotels(hotelName: string, city: string, country: string): Promise<HotelCandidate[]> {
  const query = encodeURIComponent(`"${hotelName}" ${city} book`);
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${query}`;

  const rawResults = await withStealthPage(ddgUrl, async (page) => {
    await page.waitForTimeout(2000);
    return page.evaluate((): Array<{ url: string; title: string }> => {
      return Array.from(document.querySelectorAll('.result__a')).slice(0, 10).map(a => ({
        url: (a as HTMLAnchorElement).href,
        title: (a as HTMLAnchorElement).textContent?.trim() ?? '',
      }));
    });
  }, { navigationTimeout: 20000 });

  const candidates = rawResults.filter(r => !isOta(r.url)).slice(0, 5);

  // Run detection + screenshot in parallel
  return Promise.all(candidates.map(async (c) => {
    const detection = detectKnownIBE(c.url);
    const screenshotUrl = await takeScreenshot(c.url);
    return { url: c.url, title: c.title, detected: detection !== null, screenshotUrl };
  }));
}

export async function cleanExpiredScreenshots() {
  try {
    const TTL_MS = 60 * 60 * 1000; // 1 hour
    await ensureScreenshotsDir();
    const files = await fs.readdir(SCREENSHOTS_DIR);
    for (const file of files) {
      const ts = parseInt(file.split('_')[0] ?? '0');
      if (Date.now() - ts > TTL_MS) {
        await fs.unlink(path.join(SCREENSHOTS_DIR, file)).catch(() => {});
      }
    }
  } catch { /* non-critical */ }
}
```

- [ ] **Step 4: Run tests — expect pass**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run src/services/__tests__/hotel-search.service.test.ts 2>&1 | tail -8
```
Expected: 2 tests PASS.

### Part B — search.route.ts + app.ts

- [ ] **Step 5: Create search.route.ts**

Create `apps/onboarding-api/src/routes/search.route.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { searchHotels } from '../services/hotel-search.service.js';
import { resolveIbeUrl } from '../services/ibe-resolver.service.js';
import { prisma } from '../db/client.js';
import { getSession } from '../services/session.service.js';

function getSessionIdFromCookie(request: any): number | null {
  const raw = request.cookies?.onb_session;
  if (!raw) return null;
  const parsed = parseInt(raw);
  return isNaN(parsed) ? null : parsed;
}

const SCREENSHOTS_DIR = path.join(process.cwd(), 'uploads', 'screenshots');

export async function searchRoutes(app: FastifyInstance) {
  // Serve screenshots
  app.get<{ Params: { file: string } }>('/screenshots/:file', async (request, reply) => {
    const filePath = path.join(SCREENSHOTS_DIR, request.params.file);
    if (!filePath.startsWith(SCREENSHOTS_DIR)) return reply.forbidden();
    if (!fs.existsSync(filePath)) return reply.notFound();
    return reply.sendFile(request.params.file, SCREENSHOTS_DIR);
  });

  // POST /hotel-search — DuckDuckGo search + screenshots (~10-15s)
  app.post<{ Body: { hotelName: string; city: string; country: string } }>(
    '/hotel-search',
    async (request, reply) => {
      const { hotelName, city, country } = request.body;
      if (!hotelName?.trim() || !city?.trim()) return reply.badRequest('hotelName and city required');
      const candidates = await searchHotels(hotelName.trim(), city.trim(), country ?? '');
      return reply.send({ candidates });
    }
  );

  // POST /select-url — resolve IBE from URL, fire async, poll via GET /wizard/state
  app.post<{ Body: { url: string } }>(
    '/select-url',
    async (request, reply) => {
      const sessionId = getSessionIdFromCookie(request);
      if (!sessionId) return reply.unauthorized('No session');
      const session = await getSession(sessionId);
      if (!session) return reply.notFound();

      const { url } = request.body;
      if (!url?.trim()) return reply.badRequest('url required');

      // Fire IBE resolution asynchronously
      setImmediate(async () => {
        try {
          const resolved = await resolveIbeUrl(url.trim());
          if (resolved) {
            await prisma.onboardingInvitation.update({
              where: { id: session.invitation.id },
              data: { ibeUrl: resolved.ibeUrl, ibePattern: resolved.ibeName },
            });
            // Advance candidate_search step
            const { advanceStep } = await import('../services/session.service.js');
            await advanceStep(sessionId, session.currentStep, {
              stepId: 'candidate_search', success: true,
              data: { ibeName: resolved.ibeName, ibeUrl: resolved.ibeUrl },
            });
          } else {
            await prisma.onboardingSession.update({
              where: { id: sessionId },
              data: { status: 'pending_ibe_review' },
            });
          }
        } catch {
          await prisma.onboardingSession.update({
            where: { id: sessionId },
            data: { status: 'pending_ibe_review' },
          }).catch(() => {});
        }
      });

      return reply.send({ ok: true });
    }
  );
}
```

- [ ] **Step 6: Register in app.ts**

In `apps/onboarding-api/src/app.ts`, add:

```typescript
import { searchRoutes } from './routes/search.route.js';
```

And inside `buildApp()` after existing route registrations:
```typescript
await app.register(searchRoutes);
```

- [ ] **Step 7: Type check**
```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm type-check 2>&1
```
Expected: no errors. (If Fastify complains about `sendFile`, install `@fastify/static` or serve the file manually via `fs.createReadStream`.)

If `sendFile` is unavailable, replace the screenshot route with:
```typescript
app.get<{ Params: { file: string } }>('/screenshots/:file', async (request, reply) => {
  const filePath = path.join(SCREENSHOTS_DIR, request.params.file);
  if (!filePath.startsWith(SCREENSHOTS_DIR)) return reply.forbidden();
  if (!fs.existsSync(filePath)) return reply.notFound();
  const stream = fs.createReadStream(filePath);
  return reply.type('image/png').send(stream);
});
```

- [ ] **Step 8: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding-api/src/services/hotel-search.service.ts \
        apps/onboarding-api/src/services/__tests__/hotel-search.service.test.ts \
        apps/onboarding-api/src/routes/search.route.ts \
        apps/onboarding-api/src/app.ts
git commit -m "feat(onboarding): hotel search service + search/select-url routes + screenshot serving"
```

---

## Task 15: CandidateSearchStep frontend + wizard integration

**Files:**
- Create: `apps/onboarding/src/components/steps/CandidateSearchStep.tsx`
- Modify: `apps/onboarding/src/app/wizard/page.tsx`
- Modify: `apps/onboarding/src/lib/api.ts`

- [ ] **Step 1: Add API methods**

In `apps/onboarding/src/lib/api.ts`, add to the `api` object:

```typescript
  hotelSearch: (data: { hotelName: string; city: string; country: string }) =>
    request<{ candidates: Array<{ url: string; title: string; detected: boolean; screenshotUrl: string | null }> }>('POST', '/hotel-search', data),
  selectUrl: (url: string) =>
    request<{ ok: boolean }>('POST', '/select-url', { url }),
```

- [ ] **Step 2: Create CandidateSearchStep.tsx**

Create `apps/onboarding/src/components/steps/CandidateSearchStep.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  hotelName?: string;
  city?: string;
  country?: string;
  onComplete: () => void;
}

interface Candidate {
  url: string;
  title: string;
  detected: boolean;
  screenshotUrl: string | null;
}

type Phase = 'form' | 'searching' | 'results' | 'resolving';

const inputStyle = { width: '100%', padding: '0.7rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' as const };

export function CandidateSearchStep({ step, hotelName: initialName, city: initialCity, country: initialCountry, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('form');
  const [form, setForm] = useState({ hotelName: initialName ?? '', city: initialCity ?? '', country: initialCountry ?? '' });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!form.hotelName.trim() || !form.city.trim()) { setError('Hotel name and city are required'); return; }
    setError(null);
    setPhase('searching');
    try {
      const result = await api.hotelSearch(form);
      setCandidates(result.candidates);
      setPhase('results');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setPhase('form');
    }
  }

  async function handleSelect(url: string) {
    setError(null);
    setPhase('resolving');
    try {
      await api.selectUrl(url);
      // Poll wizard state until step advances or pending_ibe_review
      pollingRef.current = setInterval(async () => {
        try {
          const state = await api.getState();
          if (state.status === 'pending_ibe_review' || state.currentStep > (state.steps.findIndex(s => s.id === 'candidate_search'))) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            onComplete();
          }
        } catch { /* keep polling */ }
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
      setPhase('results');
    }
  }

  if (phase === 'form') {
    return (
      <div>
        <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>We'll find your hotel's booking engine and pull your room and rate information automatically.</p>
        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}>Hotel Name</label>
            <input type="text" required value={form.hotelName} onChange={e => setForm(p => ({ ...p, hotelName: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}>City</label>
            <input type="text" required value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}>Country</label>
            <input type="text" value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} style={inputStyle} />
          </div>
          {error && <p style={{ color: '#dc2626' }}>{error}</p>}
          <button type="submit" style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
            Search →
          </button>
        </form>
      </div>
    );
  }

  if (phase === 'searching') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: '#2563eb', fontSize: '1.1rem' }}>Searching for your hotel's booking engine…</p>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.5rem' }}>This takes about 15 seconds</p>
      </div>
    );
  }

  if (phase === 'resolving') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: '#2563eb', fontSize: '1.1rem' }}>Finding your booking engine…</p>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.5rem' }}>Following booking links to identify your system</p>
      </div>
    );
  }

  // results phase
  return (
    <div>
      <h2 style={{ marginBottom: '1rem' }}>We found these results:</h2>
      {candidates.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No results found. Try pasting your booking URL below.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {candidates.map((c, i) => (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
              {c.screenshotUrl && (
                <img src={`${process.env['NEXT_PUBLIC_ONBOARDING_API_URL'] ?? 'http://localhost:3003'}${c.screenshotUrl}`}
                  alt={c.title} loading="lazy"
                  style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block', background: '#f3f4f6' }} />
              )}
              {!c.screenshotUrl && (
                <div style={{ width: '100%', height: '80px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Preview unavailable</span>
                </div>
              )}
              <div style={{ padding: '0.75rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{new URL(c.url).hostname}</span>
                  {c.detected && <span style={{ background: '#d1fae5', color: '#065f46', padding: '1px 7px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 600 }}>✓ Booking engine detected</span>}
                </div>
                <p style={{ color: '#6b7280', fontSize: '0.82rem', margin: '0 0 0.6rem' }}>{c.title}</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => handleSelect(c.url)}
                    style={{ padding: '0.45rem 0.9rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                    Select this →
                  </button>
                  <a href={c.url} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '0.45rem 0.9rem', border: '1px solid #d1d5db', borderRadius: '5px', color: '#374151', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                    View site ↗
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
        <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Or paste your booking URL directly:</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input type="url" placeholder="https://..." value={manualUrl} onChange={e => setManualUrl(e.target.value)}
            style={{ flex: 1, padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
          <button onClick={() => manualUrl.trim() && handleSelect(manualUrl.trim())} disabled={!manualUrl.trim()}
            style={{ padding: '0.65rem 1rem', background: '#374151', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
            Use this URL →
          </button>
        </div>
      </div>

      <button onClick={() => setPhase('form')} style={{ marginTop: '0.75rem', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}>
        None of these look right? Search again
      </button>
      {error && <p style={{ color: '#dc2626', marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Wire into wizard page**

In `apps/onboarding/src/app/wizard/page.tsx`, add the import and case:

```typescript
import { CandidateSearchStep } from '@/components/steps/CandidateSearchStep';
```

In `renderStep()`:
```typescript
case 'candidate_search':
  return <CandidateSearchStep
    step={currentStepDef}
    hotelName={String(state.enrichedData?.['hotelName'] ?? '')}
    city={String(state.enrichedData?.['city'] ?? '')}
    country={String(state.enrichedData?.['countryCode'] ?? '')}
    onComplete={loadState}
  />;
```

- [ ] **Step 4: Type check**
```bash
cd /home/nir/ibe/apps/onboarding && pnpm type-check 2>&1
```
Expected: no errors.

- [ ] **Step 5: Commit**
```bash
cd /home/nir/ibe
git add apps/onboarding/src/components/steps/CandidateSearchStep.tsx \
        apps/onboarding/src/app/wizard/page.tsx \
        apps/onboarding/src/lib/api.ts
git commit -m "feat(onboarding): candidate search step with DuckDuckGo results and screenshots"
```

---

## Final Verification

```bash
cd /home/nir/ibe/apps/onboarding-api && pnpm vitest run 2>&1 | tail -12
cd /home/nir/ibe/apps/onboarding-api && pnpm type-check 2>&1
cd /home/nir/ibe/apps/onboarding && pnpm type-check 2>&1
cd /home/nir/ibe/packages/onboarding-flows && pnpm vitest run 2>&1 | tail -8
```

All tests pass, no type errors across both apps and the shared package.
