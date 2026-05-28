# TravelClick VendorFlow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TravelClick (pmsId=25) as a self-onboarding ARI source, fix SiteMinder pmsId (3→12), and implement `useDefaultCodes` behavior so TravelClick hotels skip manual room/rate-code entry.

**Architecture:** TravelClick VendorFlow mirrors SiteMinder (`blank` data flow, same 13-step wizard) with `useDefaultCodes: true`. The step executor generates `ROOM-01`/`ROOM-02` room codes and `FLEX-{BOARD}`/`NRF-{BOARD}` rate plan codes automatically, persisting them for downstream steps. The wizard state API exposes `useDefaultCodes` so the frontend hides code-entry fields when it is true.

**Tech Stack:** TypeScript, Zod, Fastify (onboarding-api), Next.js 14 (onboarding), vitest

---

## Task 1: Fix SiteMinder pmsId (3→12) + add TravelClick to admin PMS options

**Files:**
- Modify: `packages/onboarding-flows/src/vendors/siteminder.ts`
- Modify: `apps/web/src/app/admin/hotel-onboarding/page.tsx`

- [ ] **Step 1: Fix SiteMinder pmsId in vendor file**

In `packages/onboarding-flows/src/vendors/siteminder.ts`, change line 5:

```typescript
// Before:
const SITEMINDER_PMS_ID = 3;

// After:
const SITEMINDER_PMS_ID = 12;
```

- [ ] **Step 2: Run onboarding-flows tests — must still pass**

```bash
pnpm --filter @ibe/onboarding-flows test
```

Expected: all tests PASS. (Tests reference `siteMinderFlow.pmsId` dynamically, never hardcode `3`.)

- [ ] **Step 3: Build onboarding-flows**

```bash
pnpm --filter @ibe/onboarding-flows build
```

Expected: exits 0, `packages/onboarding-flows/dist/` updated.

- [ ] **Step 4: Update admin page PMS_OPTIONS**

In `apps/web/src/app/admin/hotel-onboarding/page.tsx`, replace line 6:

```typescript
// Before:
const PMS_OPTIONS = [{ id: 3, name: 'SiteMinder' }];

// After:
const PMS_OPTIONS = [
  { id: 12, name: 'SiteMinder' },
  { id: 25, name: 'TravelClick' },
];
```

- [ ] **Step 5: Commit**

```bash
git add packages/onboarding-flows/src/vendors/siteminder.ts \
        packages/onboarding-flows/dist/ \
        apps/web/src/app/admin/hotel-onboarding/page.tsx
git commit -m "fix: correct SiteMinder pmsId to 12, add TravelClick to admin PMS options"
```

---

## Task 2: TravelClick VendorFlow + registry

**Files:**
- Create: `packages/onboarding-flows/src/vendors/travelclick.ts`
- Modify: `packages/onboarding-flows/src/registry.ts`
- Modify: `packages/onboarding-flows/src/__tests__/registry.test.ts`

- [ ] **Step 1: Write failing tests**

In `packages/onboarding-flows/src/__tests__/registry.test.ts`, add a new import at the top and a new `describe` block at the end of the file:

```typescript
// Add to top imports:
import { travelClickFlow } from '../vendors/travelclick.js';

// Add new describe block at the end of the file (outside the existing describe):
describe('TravelClick vendor flow', () => {
  it('returns TravelClick flow for pmsId 25', () => {
    const flow = getVendorFlow(25);
    expect(flow).toBeDefined();
    expect(flow!.pmsName).toBe('TravelClick');
    expect(flow!.dataFlow).toBe('blank');
    expect(flow!.useDefaultCodes).toBe(true);
  });

  it('TravelClick credentials schema requires propertyId', () => {
    const flow = getVendorFlow(25)!;
    expect(flow.credentialsSchema.safeParse({ propertyId: 'TC-12345' }).success).toBe(true);
    expect(flow.credentialsSchema.safeParse({ propertyId: '' }).success).toBe(false);
    expect(flow.credentialsSchema.safeParse({}).success).toBe(false);
  });

  it('TravelClick has a user_action step for channel connection', () => {
    const flow = getVendorFlow(25)!;
    expect(flow.steps.some(s => s.kind === 'user_action')).toBe(true);
  });

  it('validateVendorFlow passes for TravelClick', () => {
    expect(() => validateVendorFlow(travelClickFlow)).not.toThrow();
  });

  it('TravelClick getHGPropertyPayload includes pmsId 25 and hasStaticData false', () => {
    const flow = getVendorFlow(25)!;
    const payload = flow.getHGPropertyPayload({
      sessionId: 1, pmsId: 25, organizationId: 1,
      credentials: { propertyId: 'TC-999' },
      enrichedData: { hotelName: 'Test Hotel', city: 'Rome', countryCode: 'IT' },
      completedSteps: [],
    });
    expect((payload['property'] as any)['pmsId']).toBe(25);
    expect((payload['propertySource'] as any)['hasStaticData']).toBe(false);
    expect((payload['propertySource'] as any)['propertyCode']).toBe('TC-999');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @ibe/onboarding-flows test
```

Expected: FAIL — `Cannot find module '../vendors/travelclick.js'`.

- [ ] **Step 3: Create `travelclick.ts`**

Create `packages/onboarding-flows/src/vendors/travelclick.ts`:

```typescript
import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const TRAVELCLICK_PMS_ID = 25;

function buildTravelClickSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in TravelClick',
    description: 'Log in to your TravelClick dashboard and add HyperGuest as a channel using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const travelClickFlow = createVendorFlow({
  pmsId: TRAVELCLICK_PMS_ID,
  pmsName: 'TravelClick',
  dataFlow: 'blank',
  useDefaultCodes: true,
  requiresStaffChannelSetup: false,
  regionAware: true,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'TravelClick Property ID is required'),
  }),
  steps: buildTravelClickSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) {
      return { valid: false, message: 'TravelClick Property ID is required' };
    }
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: TRAVELCLICK_PMS_ID,
        location: {
          city: {
            name: (enriched['city'] as string) ?? 'Unknown',
            countryCode: (enriched['countryCode'] as string) ?? 'XX',
          },
        },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: {
          propertyId: ctx.credentials['propertyId'],
          pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room',
        },
        propertyCode: ctx.credentials['propertyId'],
        hasStaticData: false,
      },
    };
  },
});
```

- [ ] **Step 4: Register TravelClick in registry**

Replace the full contents of `packages/onboarding-flows/src/registry.ts`:

```typescript
import type { VendorFlow } from './types.js';
import { validateVendorFlow } from './factory.js';
import { siteMinderFlow } from './vendors/siteminder.js';
import { travelClickFlow } from './vendors/travelclick.js';

const registry = new Map<number, VendorFlow>([
  [siteMinderFlow.pmsId, siteMinderFlow],
  [travelClickFlow.pmsId, travelClickFlow],
]);

for (const flow of registry.values()) {
  validateVendorFlow(flow);
}

export function getVendorFlow(pmsId: number): VendorFlow | undefined {
  return registry.get(pmsId);
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
pnpm --filter @ibe/onboarding-flows test
```

Expected: all tests PASS.

- [ ] **Step 6: Build**

```bash
pnpm --filter @ibe/onboarding-flows build
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/onboarding-flows/src/vendors/travelclick.ts \
        packages/onboarding-flows/src/registry.ts \
        packages/onboarding-flows/src/__tests__/registry.test.ts \
        packages/onboarding-flows/dist/
git commit -m "feat(onboarding-flows): TravelClick VendorFlow — pmsId 25, blank flow, useDefaultCodes"
```

---

## Task 3: Expose `useDefaultCodes` in wizard state API + frontend type

**Files:**
- Modify: `apps/onboarding-api/src/routes/wizard.route.ts`
- Modify: `apps/onboarding/src/lib/api.ts`

- [ ] **Step 1: Add `useDefaultCodes` to wizard state response**

In `apps/onboarding-api/src/routes/wizard.route.ts`, in the `GET /wizard/state` handler, add `useDefaultCodes` after the `dataFlow` line (currently line 29). The full return block becomes:

```typescript
    return {
      sessionId: session.id,
      pmsId: session.invitation.pmsId,
      pmsName: session.invitation.pmsName,
      dataFlow: flow?.dataFlow ?? null,
      useDefaultCodes: flow?.useDefaultCodes ?? false,
      currentStep: session.currentStep,
      totalSteps: flow?.steps.length ?? 0,
      steps: session.stepsJson,
      enrichedData: session.enrichedData,
      harvestedRooms: (harvestedData?.['rooms'] as Array<{ name: string; description: string }> | null) ?? null,
      harvestedRatePlanTypes: (harvestedData?.['discoveredRatePlanTypes'] as unknown[] | null) ?? null,
      harvestedTaxes: (harvestedData?.['taxesAndFees'] as unknown[] | null) ?? null,
      hgPropertyCode: session.hgPropertyCode,
      status: session.status,
    };
```

- [ ] **Step 2: Add `useDefaultCodes` to `WizardState` in the onboarding frontend**

In `apps/onboarding/src/lib/api.ts`, add `useDefaultCodes: boolean;` after the `dataFlow` line in the `WizardState` interface:

```typescript
export interface WizardState {
  sessionId: number;
  pmsId: number | null;
  pmsName: string | null;
  dataFlow: 'hg_pulls' | 'blank' | 'reverse_pull' | null;
  useDefaultCodes: boolean;
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

- [ ] **Step 3: Type-check both apps**

```bash
pnpm --filter @ibe/onboarding-api exec tsc --noEmit
pnpm --filter @ibe/onboarding type-check
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/onboarding-api/src/routes/wizard.route.ts \
        apps/onboarding/src/lib/api.ts
git commit -m "feat(onboarding): expose useDefaultCodes in wizard state API"
```

---

## Task 4: Step executor — generate default codes for `create_rooms` + `create_rateplans`

**Files:**
- Modify: `apps/onboarding-api/src/services/step-executor.service.ts`

- [ ] **Step 1: Replace the `create_rooms` branch**

Find and replace the entire `} else if (step.id === 'create_rooms') {` block (ends just before `} else if (step.id === 'create_rateplans') {`):

```typescript
    } else if (step.id === 'create_rooms') {
      const harvestedData = (session.harvestedData as Record<string, unknown>) ?? {};
      const rooms = (harvestedData['rooms'] as Array<{ name: string; bedConfiguration?: string | null }>) ?? [];
      const propertyCode = session.hgPropertyCode;
      if (!propertyCode) throw new Error('No property code — create_hg_property must run first');

      let roomCodes: Record<string, string>;
      if (flow.useDefaultCodes) {
        // Generate ROOM-01, ROOM-02, … and persist for downstream steps (create_rateplans, create_taxes)
        roomCodes = Object.fromEntries(
          rooms.map((r, i) => [r.name, `ROOM-${String(i + 1).padStart(2, '0')}`])
        );
        const existing = (session.enrichedData as Record<string, unknown>) ?? {};
        await prisma.onboardingSession.update({
          where: { id: sessionId },
          data: { enrichedData: { ...existing, roomCodes } as any },
        });
      } else {
        roomCodes = ((session.enrichedData as Record<string, unknown>)?.['roomCodes'] as Record<string, string>) ?? {};
      }

      for (const room of rooms) {
        const code = roomCodes[room.name];
        if (!code) throw new Error(`No CM code for room: ${room.name}`);
        sseEvent(reply, { type: 'progress', message: `Creating room: ${room.name}` });
        try {
          await hgBoClient.createRoom(propertyCode, { type: room.name, name: room.name, code });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('409') && !msg.includes('already')) throw err;
        }
      }
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
      sseEvent(reply, { type: 'complete', stepId: step.id });
```

- [ ] **Step 2: Replace the `create_rateplans` branch**

Find and replace the entire `} else if (step.id === 'create_rateplans') {` block (ends just before `} else if (step.id === 'create_policies') {`):

```typescript
    } else if (step.id === 'create_rateplans') {
      const propertyCode = session.hgPropertyCode;
      if (!propertyCode) throw new Error('No property code');
      const enriched = (session.enrichedData as Record<string, unknown>) ?? {};
      const cmSettings = (enriched['cmSettings'] as {
        ratePlans: Array<{ pmsRateplanCode: string; boardCode: string; priceType: 'gross' | 'net'; isRefundable: boolean }>;
      }) ?? { ratePlans: [] };
      const roomCodes = (enriched['roomCodes'] as Record<string, string>) ?? {};
      const allRoomCodes = Object.values(roomCodes);

      let ratePlans = cmSettings.ratePlans;
      if (flow.useDefaultCodes) {
        // Generate FLEX-{BOARD} for refundable, NRF-{BOARD} for non-refundable
        // Persist updated codes so create_policies + create_taxes use the correct pmsRateplanCode
        ratePlans = ratePlans.map(rp => ({
          ...rp,
          pmsRateplanCode: rp.isRefundable ? `FLEX-${rp.boardCode}` : `NRF-${rp.boardCode}`,
        }));
        await prisma.onboardingSession.update({
          where: { id: sessionId },
          data: { enrichedData: { ...enriched, cmSettings: { ...cmSettings, ratePlans } } as any },
        });
      }

      for (const rp of ratePlans) {
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
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @ibe/onboarding-api exec tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/onboarding-api/src/services/step-executor.service.ts
git commit -m "feat(onboarding-api): generate ROOM-XX and FLEX/NRF codes when useDefaultCodes"
```

---

## Task 5: Frontend — hide code-entry fields when `useDefaultCodes`

**Files:**
- Modify: `apps/onboarding/src/components/steps/DataReviewStep.tsx`
- Modify: `apps/onboarding/src/components/steps/CmSettingsStep.tsx`

- [ ] **Step 1: Update `DataReviewStep` — add `needsRoomCodes` and use it throughout**

In `apps/onboarding/src/components/steps/DataReviewStep.tsx`:

**Change 1:** After `const isBlank = state.dataFlow === 'blank';` (line 24), add:
```typescript
  const needsRoomCodes = isBlank && !state.useDefaultCodes;
```

**Change 2:** In `handleSubmit`, replace `if (isBlank) {` validation block:
```typescript
    if (needsRoomCodes) {
      for (const room of rooms) {
        if (!roomCodes[room.name]?.trim()) { setError(`Enter CM code for room: ${room.name}`); return; }
      }
    }
```

**Change 3:** In `handleSubmit` `api.confirmReview` call, replace `(isBlank ? { roomCodes } : {})`:
```typescript
      await api.confirmReview({ ...enriched, ...fields, ...(needsRoomCodes ? { roomCodes } : {}) });
```

**Change 4:** Replace the room codes section JSX (currently `{isBlank && rooms.length > 0 && (`):
```typescript
        {needsRoomCodes && rooms.length > 0 && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>Room type codes (must match your channel manager codes exactly)</p>
            {rooms.map(room => (
              <div key={room.name} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <span style={{ flex: 1, fontSize: '0.9rem' }}>{room.name}</span>
                <input type="text" placeholder="CM room code" value={roomCodes[room.name] ?? ''}
                  onChange={e => setRoomCodes(p => ({ ...p, [room.name]: e.target.value }))}
                  style={{ width: '160px', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
              </div>
            ))}
          </div>
        )}
```

- [ ] **Step 2: Update `CmSettingsStep` — hide CM Code column when `useDefaultCodes`**

In `apps/onboarding/src/components/steps/CmSettingsStep.tsx`:

**Change 1:** After `const taxes = state.harvestedTaxes ?? [];` (line 20), add:
```typescript
  const useDefaultCodes = state.useDefaultCodes;
```

**Change 2:** Replace the column headers array (currently the array with `'CM Code'` in it):
```typescript
              {(['Board', 'R/NR', ...(useDefaultCodes ? [] : ['CM Code']), 'Price type', 'Commission', 'Charge'] as string[]).map(h => (
                <th key={h} style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
```

**Change 3:** Replace the CM Code `<td>` cell in each row (the one with `placeholder="e.g. FLEX-BB"`):
```typescript
                    {!useDefaultCodes && (
                      <td style={{ padding: '0.4rem 0.6rem' }}>
                        <input type="text" placeholder="e.g. FLEX-BB" value={row.pmsRateplanCode}
                          onChange={e => updateRow(idx, { pmsRateplanCode: e.target.value })}
                          style={{ ...inputStyle, width: '120px' }} />
                      </td>
                    )}
```

- [ ] **Step 3: Type-check the onboarding app**

```bash
pnpm --filter @ibe/onboarding type-check
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/onboarding/src/components/steps/DataReviewStep.tsx \
        apps/onboarding/src/components/steps/CmSettingsStep.tsx
git commit -m "feat(onboarding): hide room/rate code entry when useDefaultCodes (TravelClick)"
```
