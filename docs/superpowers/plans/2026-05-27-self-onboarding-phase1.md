# Self-Onboarding Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core self-onboarding framework — invitation flow, session state machine, Mews vendor flow end-to-end, and basic admin module — so a hotel can receive an invite link, connect their Mews account, and go live without HG team involvement.

**Architecture:** Token-based invitation → session cookie auth → step state machine in onboarding-api → HG Back Office API creates property/rooms/rateplans → SSE streams progress to the wizard UI. Three new units: `apps/onboarding` (Next.js 14 wizard), `apps/onboarding-api` (Fastify, shares the same Prisma schema as `apps/api`), `packages/onboarding-flows` (vendor plugin objects).

**Tech Stack:** Next.js 14, Fastify 4, Prisma 5 (shared schema), Vitest, Zod, undici (HG BO API calls), SSE (same pattern as manual.route.ts), TypeScript ESM

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/prisma/schema.prisma` | Modify | Add OnboardingInvitation, OnboardingSession, OnboardingHelpRequest models |
| `apps/api/src/routes/onboarding-admin.route.ts` | Create | Admin routes: POST/GET/DELETE invitations, GET sessions |
| `apps/api/src/services/onboarding-invitation.service.ts` | Create | Create/list/revoke invitations |
| `packages/onboarding-flows/package.json` | Create | New package declaration |
| `packages/onboarding-flows/src/types.ts` | Create | VendorFlow, OnboardingContext, StepResult types |
| `packages/onboarding-flows/src/vendors/mews.ts` | Create | Mews vendor plugin (Form_Type=ID, pmsId=4) |
| `packages/onboarding-flows/src/registry.ts` | Create | Map pmsId → VendorFlow |
| `packages/onboarding-flows/src/index.ts` | Create | Re-exports |
| `apps/onboarding-api/package.json` | Create | Fastify app, references shared prisma schema |
| `apps/onboarding-api/src/env.ts` | Create | Env vars with zod |
| `apps/onboarding-api/src/db/client.ts` | Create | Prisma client singleton |
| `apps/onboarding-api/src/services/session.service.ts` | Create | Token validation, session CRUD, step state machine |
| `apps/onboarding-api/src/services/hg-bo.client.ts` | Create | HG Back Office API calls |
| `apps/onboarding-api/src/services/enrichment.service.ts` | Create | Website scrape + HG data lookup |
| `apps/onboarding-api/src/services/step-executor.service.ts` | Create | Orchestrates steps, emits SSE events |
| `apps/onboarding-api/src/routes/session.route.ts` | Create | POST /session (init from token) |
| `apps/onboarding-api/src/routes/wizard.route.ts` | Create | GET /wizard/state, POST /wizard/submit-step, GET /wizard/execute-sse |
| `apps/onboarding-api/src/app.ts` | Create | Fastify app factory |
| `apps/onboarding-api/src/server.ts` | Create | Entry point |
| `apps/onboarding-api/tsconfig.json` | Create | TypeScript config |
| `apps/onboarding/package.json` | Create | Next.js 14 app |
| `apps/onboarding/src/app/page.tsx` | Create | Landing / root redirect |
| `apps/onboarding/src/app/start/[token]/page.tsx` | Create | Token init → sets cookie → redirect |
| `apps/onboarding/src/app/wizard/page.tsx` | Create | Main wizard page |
| `apps/onboarding/src/components/WizardLayout.tsx` | Create | Progress bar + step area |
| `apps/onboarding/src/components/steps/AutomatedStep.tsx` | Create | SSE progress display |
| `apps/onboarding/src/components/steps/DataReviewStep.tsx` | Create | Enriched data review form |
| `apps/onboarding/src/components/steps/CredentialsStep.tsx` | Create | Schema-driven credential form |
| `apps/onboarding/src/components/steps/UserActionStep.tsx` | Create | Instruction display + confirm |
| `apps/onboarding/src/lib/api.ts` | Create | Typed fetch wrapper for onboarding-api |
| `apps/web/src/app/admin/hotel-onboarding/page.tsx` | Create | Admin: Invitations tab + Sessions tab |

---

## Task 1: DB Models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Test: `apps/api/src/services/__tests__/onboarding-invitation.service.test.ts` (written in Task 4)

- [ ] **Step 1: Add models to schema**

Append to the end of `apps/api/prisma/schema.prisma`:

```prisma
// ── Self-Onboarding ──────────────────────────────────────────────────────────

model OnboardingInvitation {
  id             Int                @id @default(autoincrement())
  token          String             @unique @default(cuid())
  organizationId Int
  pmsId          Int                // maps to ARI_Source_Id / HG pmsId
  pmsName        String             // human-readable, e.g. "Mews"
  hotelName      String?
  websiteUrl     String?
  contactEmail   String?
  expiresAt      DateTime
  usedAt         DateTime?
  revokedAt      DateTime?
  createdAt      DateTime           @default(now())
  createdByAdminId Int?
  session        OnboardingSession?
}

model OnboardingSession {
  id             Int                  @id @default(autoincrement())
  invitationId   Int                  @unique
  invitation     OnboardingInvitation @relation(fields: [invitationId], references: [id])
  status         String               @default("in_progress") // in_progress | completed | abandoned
  currentStep    Int                  @default(0)
  stepsJson      Json                 @default("[]")
  enrichedData   Json?
  hgPropertyCode String?
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt
  helpRequests   OnboardingHelpRequest[]
}

model OnboardingHelpRequest {
  id        Int               @id @default(autoincrement())
  sessionId Int
  session   OnboardingSession @relation(fields: [sessionId], references: [id])
  message   String
  status    String            @default("open") // open | resolved
  createdAt DateTime          @default(now())
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api && pnpm db:migrate
```

When prompted for migration name, enter: `add_onboarding_models`

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 3: Verify generated client has the new models**

```bash
cd apps/api && node -e "import('./src/db/client.js').then(m => console.log(Object.keys(m.default)))"
```

Expected: output includes `onboardingInvitation`, `onboardingSession`, `onboardingHelpRequest`

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(onboarding): add DB models for invitation, session, help request"
```

---

## Task 2: packages/onboarding-flows

**Files:**
- Create: `packages/onboarding-flows/package.json`
- Create: `packages/onboarding-flows/tsconfig.json`
- Create: `packages/onboarding-flows/src/types.ts`
- Create: `packages/onboarding-flows/src/vendors/mews.ts`
- Create: `packages/onboarding-flows/src/registry.ts`
- Create: `packages/onboarding-flows/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/onboarding-flows/src/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getVendorFlow } from '../registry.js';

describe('vendor registry', () => {
  it('returns Mews flow for pmsId 4', () => {
    const flow = getVendorFlow(4);
    expect(flow).toBeDefined();
    expect(flow!.pmsId).toBe(4);
    expect(flow!.steps.length).toBeGreaterThan(0);
  });

  it('returns undefined for unknown pmsId', () => {
    expect(getVendorFlow(9999)).toBeUndefined();
  });

  it('Mews credentials schema has channelManagerCode field', () => {
    const flow = getVendorFlow(4)!;
    const parsed = flow.credentialsSchema.safeParse({ channelManagerCode: 'ABC123' });
    expect(parsed.success).toBe(true);
  });

  it('Mews credentials schema rejects empty code', () => {
    const flow = getVendorFlow(4)!;
    const parsed = flow.credentialsSchema.safeParse({ channelManagerCode: '' });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Create package.json**

Create `packages/onboarding-flows/package.json`:

```json
{
  "name": "@ibe/onboarding-flows",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "devDependencies": {
    "vitest": "^1.5.0",
    "typescript": "^5.4.0",
    "zod": "^3.22.0"
  },
  "dependencies": {
    "zod": "^3.22.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Create `packages/onboarding-flows/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create types.ts**

Create `packages/onboarding-flows/src/types.ts`:

```typescript
import { z } from 'zod';

export type StepKind =
  | 'automated'     // runs server-side, streams SSE progress
  | 'data_review'   // shows enriched data for user to confirm/edit
  | 'credentials'   // collects credentials via schema-driven form
  | 'user_action';  // shows instructions user must follow manually

export interface StepDefinition {
  id: string;
  kind: StepKind;
  title: string;
  description: string;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface OnboardingContext {
  sessionId: number;
  pmsId: number;
  organizationId: number;
  credentials: Record<string, string>;
  enrichedData: Record<string, unknown>;
  hgPropertyCode?: string;
  completedSteps: StepResult[];
}

export interface VendorFlow {
  pmsId: number;
  pmsName: string;
  steps: StepDefinition[];
  credentialsSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  enrichHotelData: (ctx: OnboardingContext) => Promise<Record<string, unknown>>;
  validateConnection: (ctx: OnboardingContext) => Promise<{ valid: boolean; message?: string }>;
  getHGPropertyPayload: (ctx: OnboardingContext) => Record<string, unknown>;
}
```

- [ ] **Step 5: Create mews.ts**

Create `packages/onboarding-flows/src/vendors/mews.ts`:

```typescript
import { z } from 'zod';
import type { VendorFlow } from '../types.js';

export const mewsFlow: VendorFlow = {
  pmsId: 4,
  pmsName: 'Mews',
  credentialsSchema: z.object({
    channelManagerCode: z.string().min(1, 'Channel Manager Code is required'),
  }),
  steps: [
    {
      id: 'collect_credentials',
      kind: 'credentials',
      title: 'Connect Your Mews Account',
      description: 'Enter your Mews Channel Manager Code. You can find this in Mews Operations → Settings → Integrations → Channel Managers.',
    },
    {
      id: 'enrich_data',
      kind: 'automated',
      title: 'Fetching Your Property Details',
      description: 'We are automatically pulling your hotel information from Mews.',
    },
    {
      id: 'review_data',
      kind: 'data_review',
      title: 'Review Your Property Information',
      description: 'Please review and confirm the details we found for your property.',
    },
    {
      id: 'create_hg_property',
      kind: 'automated',
      title: 'Creating Your HyperGuest Profile',
      description: 'Setting up your property in the HyperGuest system.',
    },
    {
      id: 'trigger_ari_sync',
      kind: 'automated',
      title: 'Syncing Availability & Rates',
      description: 'Triggering your first availability and rate sync from Mews.',
    },
    {
      id: 'done',
      kind: 'user_action',
      title: 'You\'re Live!',
      description: 'Your Mews property is now connected to HyperGuest. Buyers can start booking immediately.',
    },
  ],
  async enrichHotelData(ctx) {
    // Mews Has_Static_Data=1 — data is fetched via HG BO API after property is created.
    // At enrichment stage we return what we know from the invite + placeholder.
    return {
      channelManagerCode: ctx.credentials.channelManagerCode,
      fetchedFromMews: true,
    };
  },
  async validateConnection(ctx) {
    // Mews connection is validated implicitly when trigger-update succeeds.
    // At credential submission stage, we just confirm the code is non-empty.
    if (!ctx.credentials.channelManagerCode) {
      return { valid: false, message: 'Channel Manager Code is required' };
    }
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched.hotelName as string) || 'My Hotel',
        pmsId: 4,
        location: {
          city: {
            name: (enriched.city as string) || 'Unknown',
            countryCode: (enriched.countryCode as string) || 'XX',
          },
        },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { channelManagerCode: ctx.credentials.channelManagerCode },
        propertyCode: ctx.credentials.channelManagerCode,
      },
    };
  },
};
```

- [ ] **Step 6: Create registry.ts**

Create `packages/onboarding-flows/src/registry.ts`:

```typescript
import type { VendorFlow } from './types.js';
import { mewsFlow } from './vendors/mews.js';

const registry = new Map<number, VendorFlow>([
  [4, mewsFlow],
]);

export function getVendorFlow(pmsId: number): VendorFlow | undefined {
  return registry.get(pmsId);
}
```

- [ ] **Step 7: Create index.ts**

Create `packages/onboarding-flows/src/index.ts`:

```typescript
export * from './types.js';
export * from './registry.js';
```

- [ ] **Step 8: Run the failing test to confirm it fails**

```bash
cd packages/onboarding-flows && pnpm vitest run src/__tests__/registry.test.ts
```

Expected: FAIL (modules not found yet)

- [ ] **Step 9: Install deps and run tests**

```bash
cd /home/nir/ibe && pnpm install
cd packages/onboarding-flows && pnpm vitest run
```

Expected: 4 tests PASS

- [ ] **Step 10: Commit**

```bash
git add packages/onboarding-flows/
git commit -m "feat(onboarding): add onboarding-flows package with Mews vendor plugin"
```

---

## Task 3: apps/onboarding-api scaffold

**Files:**
- Create: `apps/onboarding-api/package.json`
- Create: `apps/onboarding-api/tsconfig.json`
- Create: `apps/onboarding-api/src/env.ts`
- Create: `apps/onboarding-api/src/db/client.ts`
- Create: `apps/onboarding-api/src/app.ts`
- Create: `apps/onboarding-api/src/server.ts`
- Create: `apps/onboarding-api/.env.example`

- [ ] **Step 1: Create package.json**

Create `apps/onboarding-api/package.json`:

```json
{
  "name": "@ibe/onboarding-api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/server.js",
  "scripts": {
    "dev": "node --env-file=.env --watch --import /home/nir/ibe/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/esm/index.mjs src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/cookie": "^9.4.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/sensible": "^5.0.0",
    "@ibe/onboarding-flows": "workspace:*",
    "@prisma/client": "^5.12.0",
    "fastify": "^4.27.0",
    "pino": "^9.0.0",
    "undici": "^6.0.0",
    "zod": "^3.22.0"
  },
  "prisma": {
    "schema": "../api/prisma/schema.prisma"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "pino-pretty": "^13.1.3",
    "prisma": "^5.12.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `apps/onboarding-api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create .env.example**

Create `apps/onboarding-api/.env.example`:

```
PORT=3003
DATABASE_URL=postgresql://...
HG_BO_API_BASE=https://back-office.dev.hyperguest.io
HG_BO_API_KEY=geniegeniesecret
SESSION_COOKIE_SECRET=change-me-in-prod
ONBOARDING_APP_URL=http://localhost:3002
```

- [ ] **Step 4: Create src/env.ts**

Create `apps/onboarding-api/src/env.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3003'),
  DATABASE_URL: z.string(),
  HG_BO_API_BASE: z.string().url(),
  HG_BO_API_KEY: z.string(),
  SESSION_COOKIE_SECRET: z.string().min(16),
  ONBOARDING_APP_URL: z.string().url().default('http://localhost:3002'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 5: Create src/db/client.ts**

Create `apps/onboarding-api/src/db/client.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export default prisma;
```

- [ ] **Step 6: Create src/app.ts**

Create `apps/onboarding-api/src/app.ts`:

```typescript
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { env } from './env.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: 'info' } });

  await app.register(cors, {
    origin: env.ONBOARDING_APP_URL,
    credentials: true,
  });
  await app.register(cookie, { secret: env.SESSION_COOKIE_SECRET });
  await app.register(sensible);

  app.get('/health', async () => ({ ok: true }));

  return app;
}
```

- [ ] **Step 7: Create src/server.ts**

Create `apps/onboarding-api/src/server.ts`:

```typescript
import { buildApp } from './app.js';
import { env } from './env.js';

const app = await buildApp();
await app.listen({ port: parseInt(env.PORT), host: '0.0.0.0' });
```

- [ ] **Step 8: Install deps**

```bash
cd /home/nir/ibe && pnpm install
```

- [ ] **Step 9: Type check**

```bash
cd apps/onboarding-api && pnpm type-check
```

Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add apps/onboarding-api/
git commit -m "feat(onboarding): scaffold onboarding-api Fastify app"
```

---

## Task 4: Invitation service + admin routes in apps/api

**Files:**
- Create: `apps/api/src/services/onboarding-invitation.service.ts`
- Create: `apps/api/src/services/__tests__/onboarding-invitation.service.test.ts`
- Create: `apps/api/src/routes/onboarding-admin.route.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/__tests__/onboarding-invitation.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client.js', () => ({
  default: {
    onboardingInvitation: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import prisma from '../../db/client.js';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  getInvitationByToken,
} from '../onboarding-invitation.service.js';

beforeEach(() => vi.clearAllMocks());

describe('createInvitation', () => {
  it('creates an invitation with 7-day expiry', async () => {
    const mockInv = { id: 1, token: 'abc', expiresAt: new Date() };
    vi.mocked(prisma.onboardingInvitation.create).mockResolvedValue(mockInv as any);

    const result = await createInvitation({
      organizationId: 5,
      pmsId: 4,
      pmsName: 'Mews',
      createdByAdminId: 10,
    });

    expect(prisma.onboardingInvitation.create).toHaveBeenCalledOnce();
    const callArg = vi.mocked(prisma.onboardingInvitation.create).mock.calls[0][0];
    const expiry = callArg.data.expiresAt as Date;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiry.getTime() - Date.now()).toBeGreaterThan(sevenDays - 5000);
    expect(result).toBe(mockInv);
  });
});

describe('revokeInvitation', () => {
  it('sets revokedAt', async () => {
    vi.mocked(prisma.onboardingInvitation.update).mockResolvedValue({} as any);
    await revokeInvitation(1);
    expect(prisma.onboardingInvitation.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('getInvitationByToken', () => {
  it('returns invitation for valid token', async () => {
    const mockInv = { id: 1, token: 'tok', revokedAt: null, usedAt: null, expiresAt: new Date(Date.now() + 10000) };
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue(mockInv as any);
    const result = await getInvitationByToken('tok');
    expect(result).toBe(mockInv);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd apps/api && pnpm vitest run src/services/__tests__/onboarding-invitation.service.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create the service**

Create `apps/api/src/services/onboarding-invitation.service.ts`:

```typescript
import prisma from '../db/client.js';

interface CreateInvitationInput {
  organizationId: number;
  pmsId: number;
  pmsName: string;
  hotelName?: string;
  websiteUrl?: string;
  contactEmail?: string;
  createdByAdminId?: number;
}

export async function createInvitation(input: CreateInvitationInput) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return prisma.onboardingInvitation.create({
    data: { ...input, expiresAt },
  });
}

export async function listInvitations(organizationId: number) {
  return prisma.onboardingInvitation.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    include: { session: { select: { status: true, currentStep: true } } },
  });
}

export async function revokeInvitation(id: number) {
  return prisma.onboardingInvitation.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

export async function getInvitationByToken(token: string) {
  return prisma.onboardingInvitation.findUnique({ where: { token } });
}

export function isInvitationValid(inv: {
  revokedAt: Date | null;
  usedAt: Date | null;
  expiresAt: Date;
}): { valid: boolean; reason?: string } {
  if (inv.revokedAt) return { valid: false, reason: 'revoked' };
  if (inv.usedAt) return { valid: false, reason: 'already_used' };
  if (inv.expiresAt < new Date()) return { valid: false, reason: 'expired' };
  return { valid: true };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/api && pnpm vitest run src/services/__tests__/onboarding-invitation.service.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Create admin route**

Create `apps/api/src/routes/onboarding-admin.route.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from '../services/onboarding-invitation.service.js';
import { getVendorFlow } from '@ibe/onboarding-flows';

const createInvitationSchema = z.object({
  pmsId: z.number().int().positive(),
  hotelName: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
});

export async function onboardingAdminRoutes(app: FastifyInstance) {
  // All routes require admin session (same JWT guard as other admin routes)
  app.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.unauthorized();
    }
  });

  app.post('/admin/hotel-onboarding/invitations', async (request, reply) => {
    const me = request.user as { adminId: number; organizationId: number };
    const body = createInvitationSchema.parse(request.body);
    const flow = getVendorFlow(body.pmsId);
    if (!flow) return reply.badRequest(`Unknown pmsId: ${body.pmsId}`);

    const inv = await createInvitation({
      organizationId: me.organizationId,
      pmsId: body.pmsId,
      pmsName: flow.pmsName,
      hotelName: body.hotelName,
      websiteUrl: body.websiteUrl,
      contactEmail: body.contactEmail,
      createdByAdminId: me.adminId,
    });
    return reply.code(201).send(inv);
  });

  app.get('/admin/hotel-onboarding/invitations', async (request) => {
    const me = request.user as { organizationId: number };
    return listInvitations(me.organizationId);
  });

  app.delete('/admin/hotel-onboarding/invitations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await revokeInvitation(parseInt(id));
    return reply.code(204).send();
  });
}
```

- [ ] **Step 6: Register route in apps/api**

Open `apps/api/src/app.ts` (or wherever routes are registered — search for where other admin routes are registered):

```bash
grep -n "adminRoutes\|register.*route" apps/api/src/app.ts | head -20
```

Add the import and registration alongside the other admin route registrations:

```typescript
import { onboardingAdminRoutes } from './routes/onboarding-admin.route.js';
// ... inside the route registration block:
await app.register(onboardingAdminRoutes);
```

- [ ] **Step 7: Type check**

```bash
cd apps/api && pnpm type-check
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/onboarding-invitation.service.ts \
        apps/api/src/services/__tests__/onboarding-invitation.service.test.ts \
        apps/api/src/routes/onboarding-admin.route.ts \
        apps/api/src/app.ts
git commit -m "feat(onboarding): invitation service + admin routes"
```

---

## Task 5: Session service in apps/onboarding-api

**Files:**
- Create: `apps/onboarding-api/src/services/session.service.ts`
- Create: `apps/onboarding-api/src/services/__tests__/session.service.test.ts`
- Create: `apps/onboarding-api/src/routes/session.route.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/session.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client.js', () => ({
  default: {
    onboardingInvitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    onboardingSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import prisma from '../../db/client.js';
import { initSession, getSession, advanceStep } from '../session.service.js';

beforeEach(() => vi.clearAllMocks());

const futureDate = new Date(Date.now() + 86400000);

describe('initSession', () => {
  it('throws if token is invalid', async () => {
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue(null);
    await expect(initSession('bad-token')).rejects.toThrow('invalid');
  });

  it('throws if invitation is expired', async () => {
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue({
      id: 1, revokedAt: null, usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      pmsId: 4, pmsName: 'Mews', organizationId: 5,
      session: null,
    } as any);
    await expect(initSession('tok')).rejects.toThrow('expired');
  });

  it('creates session and marks invitation used', async () => {
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue({
      id: 1, revokedAt: null, usedAt: null,
      expiresAt: futureDate,
      pmsId: 4, pmsName: 'Mews', organizationId: 5,
      session: null,
    } as any);
    vi.mocked(prisma.onboardingInvitation.update).mockResolvedValue({} as any);
    vi.mocked(prisma.onboardingSession.create).mockResolvedValue({ id: 42 } as any);

    const result = await initSession('valid-token');
    expect(prisma.onboardingInvitation.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { usedAt: expect.any(Date) },
    });
    expect(result.id).toBe(42);
  });
});

describe('advanceStep', () => {
  it('increments currentStep', async () => {
    vi.mocked(prisma.onboardingSession.update).mockResolvedValue({ currentStep: 2 } as any);
    await advanceStep(1, 1, { stepId: 'collect_credentials', success: true });
    expect(prisma.onboardingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } })
    );
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/session.service.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found

- [ ] **Step 3: Create session.service.ts**

Create `apps/onboarding-api/src/services/session.service.ts`:

```typescript
import prisma from '../db/client.js';
import type { StepResult } from '@ibe/onboarding-flows';
import { getVendorFlow } from '@ibe/onboarding-flows';

export class OnboardingError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

export async function initSession(token: string) {
  const invitation = await prisma.onboardingInvitation.findUnique({
    where: { token },
    include: { session: true },
  });

  if (!invitation) throw new OnboardingError('Invitation not found', 'invalid');
  if (invitation.revokedAt) throw new OnboardingError('Invitation revoked', 'revoked');
  if (invitation.usedAt) throw new OnboardingError('Invitation already used', 'already_used');
  if (invitation.expiresAt < new Date()) throw new OnboardingError('Invitation expired', 'expired');

  const flow = getVendorFlow(invitation.pmsId);
  if (!flow) throw new OnboardingError(`No flow for pmsId ${invitation.pmsId}`, 'unknown_pms');

  const initialSteps = flow.steps.map((s) => ({ ...s, status: 'pending' }));

  const [session] = await Promise.all([
    prisma.onboardingSession.create({
      data: {
        invitationId: invitation.id,
        stepsJson: initialSteps,
        currentStep: 0,
      },
    }),
    prisma.onboardingInvitation.update({
      where: { id: invitation.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return session;
}

export async function getSession(sessionId: number) {
  return prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    include: { invitation: true },
  });
}

export async function advanceStep(sessionId: number, currentStep: number, result: StepResult) {
  const session = await prisma.onboardingSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new OnboardingError('Session not found', 'not_found');

  const steps = session.stepsJson as Array<Record<string, unknown>>;
  steps[currentStep] = { ...steps[currentStep], status: result.success ? 'completed' : 'failed', result };

  return prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      stepsJson: steps,
      currentStep: result.success ? currentStep + 1 : currentStep,
      enrichedData: result.data ? { ...(session.enrichedData as object ?? {}), ...result.data } : undefined,
    },
  });
}

export async function saveCredentials(sessionId: number, credentials: Record<string, string>) {
  return prisma.onboardingSession.update({
    where: { id: sessionId },
    data: { enrichedData: { credentials } },
  });
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/session.service.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Create session route**

Create `apps/onboarding-api/src/routes/session.route.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { initSession } from '../services/session.service.js';

export async function sessionRoutes(app: FastifyInstance) {
  // POST /session — exchange invitation token for a session cookie
  app.post<{ Body: { token: string } }>('/session', async (request, reply) => {
    const { token } = request.body;
    if (!token) return reply.badRequest('token required');

    try {
      const session = await initSession(token);
      reply.setCookie('onb_session', String(session.id), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
      return reply.send({ ok: true, sessionId: session.id });
    } catch (err: any) {
      return reply.badRequest(err.message ?? 'Invalid token');
    }
  });
}
```

- [ ] **Step 6: Register route in app.ts**

Edit `apps/onboarding-api/src/app.ts` — add imports and registration:

```typescript
import { sessionRoutes } from './routes/session.route.js';
// inside buildApp(), after registering plugins:
await app.register(sessionRoutes);
```

- [ ] **Step 7: Type check**

```bash
cd apps/onboarding-api && pnpm type-check
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/onboarding-api/src/services/ apps/onboarding-api/src/routes/session.route.ts apps/onboarding-api/src/app.ts
git commit -m "feat(onboarding): session service + token exchange route"
```

---

## Task 6: HG Back Office API client

**Files:**
- Create: `apps/onboarding-api/src/services/hg-bo.client.ts`
- Create: `apps/onboarding-api/src/services/__tests__/hg-bo.client.test.ts`

HG BO API base: `https://back-office.dev.hyperguest.io`
Auth: `X-Api-Key: geniegeniesecret` (from env `HG_BO_API_KEY`)
All calls are to `/api/v1/integration/properties`

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/hg-bo.client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock undici fetch
vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

import { fetch } from 'undici';
import { HGBoClient } from '../hg-bo.client.js';

const client = new HGBoClient('https://back-office.dev.hyperguest.io', 'test-key');

beforeEach(() => vi.clearAllMocks());

function mockResponse(body: unknown, status = 200) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any);
}

describe('createProperty', () => {
  it('POSTs to /api/v1/integration/properties and returns propertyCode', async () => {
    mockResponse({ property: { propertyCode: 'MEWS-001' } });
    const result = await client.createProperty({
      property: { name: 'Test Hotel', pmsId: 4, location: { city: { name: 'London', countryCode: 'GB' } }, isPilot: true, status: 'Incomplete' },
      propertySource: { data: { channelManagerCode: 'CM-001' }, propertyCode: 'CM-001' },
    });
    expect(result.property.propertyCode).toBe('MEWS-001');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://back-office.dev.hyperguest.io/api/v1/integration/properties/',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-Api-Key': 'test-key' }) })
    );
  });
});

describe('triggerAriSync', () => {
  it('POSTs to trigger-update endpoint', async () => {
    mockResponse({ ok: true });
    await client.triggerAriSync('MEWS-001');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://back-office.dev.hyperguest.io/api/v1/integration/properties/MEWS-001/trigger-update',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/hg-bo.client.test.ts 2>&1 | tail -10
```

Expected: FAIL

- [ ] **Step 3: Create hg-bo.client.ts**

Create `apps/onboarding-api/src/services/hg-bo.client.ts`:

```typescript
import { fetch } from 'undici';
import { env } from '../env.js';

export class HGBoClient {
  private base: string;
  private apiKey: string;

  constructor(base: string, apiKey: string) {
    this.base = base.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HG BO API ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async createProperty(payload: Record<string, unknown>) {
    return this.request<{ property: { propertyCode: string } }>(
      'POST',
      '/api/v1/integration/properties/',
      payload
    );
  }

  async getProperty(propertyCode: string) {
    return this.request<Record<string, unknown>>('GET', `/api/v1/integration/properties/${propertyCode}`);
  }

  async triggerAriSync(propertyCode: string) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/v1/integration/properties/${propertyCode}/trigger-update`
    );
  }

  async listRooms(propertyCode: string) {
    return this.request<unknown[]>('GET', `/api/v1/integration/properties/${propertyCode}/rooms`);
  }
}

export const hgBoClient = new HGBoClient(env.HG_BO_API_BASE, env.HG_BO_API_KEY);
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/hg-bo.client.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/onboarding-api/src/services/hg-bo.client.ts \
        apps/onboarding-api/src/services/__tests__/hg-bo.client.test.ts
git commit -m "feat(onboarding): HG Back Office API client"
```

---

## Task 7: Enrichment service

**Files:**
- Create: `apps/onboarding-api/src/services/enrichment.service.ts`

The enrichment service uses data already available (from the invitation + credentials), since Mews Has_Static_Data=1 means HG fetches static data automatically after ARI sync. At enrichment phase we collect what we can from the invite metadata and prompt the user to review.

- [ ] **Step 1: Write the failing test**

Create `apps/onboarding-api/src/services/__tests__/enrichment.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildEnrichedData } from '../enrichment.service.js';

describe('buildEnrichedData', () => {
  it('merges invitation metadata with credentials', () => {
    const result = buildEnrichedData({
      hotelName: 'Grand Hotel',
      websiteUrl: 'https://grand.com',
      contactEmail: 'info@grand.com',
      credentials: { channelManagerCode: 'CM-123' },
    });
    expect(result.hotelName).toBe('Grand Hotel');
    expect(result.websiteUrl).toBe('https://grand.com');
    expect(result.credentials.channelManagerCode).toBe('CM-123');
  });

  it('provides defaults when invitation metadata is missing', () => {
    const result = buildEnrichedData({
      hotelName: undefined,
      websiteUrl: undefined,
      contactEmail: undefined,
      credentials: { channelManagerCode: 'X' },
    });
    expect(result.hotelName).toBe('');
    expect(result.city).toBe('');
    expect(result.countryCode).toBe('');
  });
});
```

- [ ] **Step 2: Create enrichment.service.ts**

Create `apps/onboarding-api/src/services/enrichment.service.ts`:

```typescript
export interface EnrichedHotelData {
  hotelName: string;
  websiteUrl: string;
  contactEmail: string;
  city: string;
  countryCode: string;
  starRating?: number;
  roomCount?: number;
  credentials: Record<string, string>;
}

export function buildEnrichedData(input: {
  hotelName?: string | null;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  credentials: Record<string, string>;
}): EnrichedHotelData {
  return {
    hotelName: input.hotelName ?? '',
    websiteUrl: input.websiteUrl ?? '',
    contactEmail: input.contactEmail ?? '',
    city: '',
    countryCode: '',
    credentials: input.credentials,
  };
}
```

- [ ] **Step 3: Run tests**

```bash
cd apps/onboarding-api && pnpm vitest run src/services/__tests__/enrichment.service.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/onboarding-api/src/services/enrichment.service.ts \
        apps/onboarding-api/src/services/__tests__/enrichment.service.test.ts
git commit -m "feat(onboarding): enrichment service"
```

---

## Task 8: Step executor + wizard SSE route

**Files:**
- Create: `apps/onboarding-api/src/services/step-executor.service.ts`
- Create: `apps/onboarding-api/src/routes/wizard.route.ts`

SSE pattern from `apps/api/src/routes/manual.route.ts`: use `reply.raw.write('data: ...\n\n')` and keep the response open until done.

- [ ] **Step 1: Create step-executor.service.ts**

Create `apps/onboarding-api/src/services/step-executor.service.ts`:

```typescript
import type { FastifyReply } from 'fastify';
import { getVendorFlow, type OnboardingContext } from '@ibe/onboarding-flows';
import { hgBoClient } from './hg-bo.client.js';
import { advanceStep, getSession } from './session.service.js';
import { buildEnrichedData } from './enrichment.service.js';
import prisma from '../db/client.js';

function sseEvent(reply: FastifyReply, data: Record<string, unknown>) {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function executeAutomatedStep(sessionId: number, stepIndex: number, reply: FastifyReply) {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  const session = await getSession(sessionId);
  if (!session) {
    sseEvent(reply, { type: 'error', message: 'Session not found' });
    reply.raw.end();
    return;
  }

  const invitation = session.invitation;
  const flow = getVendorFlow(invitation.pmsId);
  if (!flow) {
    sseEvent(reply, { type: 'error', message: 'Unknown vendor' });
    reply.raw.end();
    return;
  }

  const enrichedData = (session.enrichedData as Record<string, unknown>) ?? {};
  const credentials = (enrichedData.credentials as Record<string, string>) ?? {};

  const ctx: OnboardingContext = {
    sessionId,
    pmsId: invitation.pmsId,
    organizationId: invitation.organizationId,
    credentials,
    enrichedData,
    hgPropertyCode: session.hgPropertyCode ?? undefined,
    completedSteps: [],
  };

  const step = flow.steps[stepIndex];
  sseEvent(reply, { type: 'start', stepId: step.id });

  try {
    if (step.id === 'enrich_data') {
      sseEvent(reply, { type: 'progress', message: 'Building enriched data...' });
      const enriched = buildEnrichedData({
        hotelName: invitation.hotelName,
        websiteUrl: invitation.websiteUrl,
        contactEmail: invitation.contactEmail,
        credentials,
      });
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true, data: enriched });
      sseEvent(reply, { type: 'complete', stepId: step.id, data: enriched });
    }

    else if (step.id === 'create_hg_property') {
      sseEvent(reply, { type: 'progress', message: 'Creating property in HyperGuest...' });
      const payload = flow.getHGPropertyPayload({ ...ctx, enrichedData: { ...enrichedData } });
      const result = await hgBoClient.createProperty(payload);
      const propertyCode = result.property.propertyCode;
      await prisma.onboardingSession.update({
        where: { id: sessionId },
        data: { hgPropertyCode: propertyCode },
      });
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true, data: { propertyCode } });
      sseEvent(reply, { type: 'complete', stepId: step.id, data: { propertyCode } });
    }

    else if (step.id === 'trigger_ari_sync') {
      sseEvent(reply, { type: 'progress', message: 'Triggering ARI sync...' });
      const propertyCode = session.hgPropertyCode;
      if (!propertyCode) throw new Error('No property code — create_hg_property must run first');
      await hgBoClient.triggerAriSync(propertyCode);
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
      sseEvent(reply, { type: 'complete', stepId: step.id });
    }

    else {
      sseEvent(reply, { type: 'error', message: `Step ${step.id} is not an automated step` });
    }
  } catch (err: any) {
    await advanceStep(sessionId, stepIndex, { stepId: step.id, success: false, error: err.message });
    sseEvent(reply, { type: 'error', message: err.message });
  }

  reply.raw.end();
}
```

- [ ] **Step 2: Create wizard.route.ts**

Create `apps/onboarding-api/src/routes/wizard.route.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { getSession, advanceStep, saveCredentials } from '../services/session.service.js';
import { executeAutomatedStep } from '../services/step-executor.service.js';
import { getVendorFlow } from '@ibe/onboarding-flows';

function getSessionIdFromCookie(request: any): number | null {
  const raw = request.cookies?.onb_session;
  if (!raw) return null;
  const parsed = parseInt(raw);
  return isNaN(parsed) ? null : parsed;
}

export async function wizardRoutes(app: FastifyInstance) {
  // GET /wizard/state — returns current session state for the wizard UI
  app.get('/wizard/state', async (request, reply) => {
    const sessionId = getSessionIdFromCookie(request);
    if (!sessionId) return reply.unauthorized('No session');

    const session = await getSession(sessionId);
    if (!session) return reply.notFound('Session not found');

    const flow = getVendorFlow(session.invitation.pmsId);
    return {
      sessionId: session.id,
      pmsId: session.invitation.pmsId,
      pmsName: session.invitation.pmsName,
      currentStep: session.currentStep,
      totalSteps: flow?.steps.length ?? 0,
      steps: session.stepsJson,
      enrichedData: session.enrichedData,
      hgPropertyCode: session.hgPropertyCode,
      status: session.status,
    };
  });

  // POST /wizard/submit-credentials — saves credentials and advances past credential step
  app.post<{ Body: { credentials: Record<string, string> } }>(
    '/wizard/submit-credentials',
    async (request, reply) => {
      const sessionId = getSessionIdFromCookie(request);
      if (!sessionId) return reply.unauthorized('No session');

      const session = await getSession(sessionId);
      if (!session) return reply.notFound('Session not found');

      const flow = getVendorFlow(session.invitation.pmsId);
      if (!flow) return reply.badRequest('Unknown vendor');

      const parsed = flow.credentialsSchema.safeParse(request.body.credentials);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0].message);

      await saveCredentials(sessionId, parsed.data);
      await advanceStep(sessionId, session.currentStep, {
        stepId: flow.steps[session.currentStep].id,
        success: true,
        data: { credentials: parsed.data },
      });

      return { ok: true };
    }
  );

  // POST /wizard/confirm-review — user confirms enriched data (with any edits)
  app.post<{ Body: { enrichedData: Record<string, unknown> } }>(
    '/wizard/confirm-review',
    async (request, reply) => {
      const sessionId = getSessionIdFromCookie(request);
      if (!sessionId) return reply.unauthorized('No session');

      const session = await getSession(sessionId);
      if (!session) return reply.notFound('Session not found');

      const flow = getVendorFlow(session.invitation.pmsId);
      if (!flow) return reply.badRequest('Unknown vendor');

      await advanceStep(sessionId, session.currentStep, {
        stepId: flow.steps[session.currentStep].id,
        success: true,
        data: request.body.enrichedData,
      });

      return { ok: true };
    }
  );

  // GET /wizard/execute — SSE stream for automated step execution
  app.get('/wizard/execute', async (request, reply) => {
    const sessionId = getSessionIdFromCookie(request);
    if (!sessionId) {
      reply.code(401).send('No session');
      return;
    }

    const session = await getSession(sessionId);
    if (!session) {
      reply.code(404).send('Session not found');
      return;
    }

    await executeAutomatedStep(sessionId, session.currentStep, reply);
  });
}
```

- [ ] **Step 3: Register wizard routes in app.ts**

Edit `apps/onboarding-api/src/app.ts`:

```typescript
import { wizardRoutes } from './routes/wizard.route.js';
// inside buildApp():
await app.register(wizardRoutes);
```

- [ ] **Step 4: Type check**

```bash
cd apps/onboarding-api && pnpm type-check
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/onboarding-api/src/services/step-executor.service.ts \
        apps/onboarding-api/src/routes/wizard.route.ts \
        apps/onboarding-api/src/app.ts
git commit -m "feat(onboarding): step executor + wizard SSE route"
```

---

## Task 9: apps/onboarding Next.js scaffold

**Files:**
- Create: `apps/onboarding/package.json`
- Create: `apps/onboarding/tsconfig.json`
- Create: `apps/onboarding/next.config.mjs`
- Create: `apps/onboarding/src/app/layout.tsx`
- Create: `apps/onboarding/src/app/page.tsx`
- Create: `apps/onboarding/src/lib/api.ts`

- [ ] **Step 1: Create package.json**

Create `apps/onboarding/package.json`:

```json
{
  "name": "@ibe/onboarding",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start -p 3002",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18",
    "react-dom": "^18",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `apps/onboarding/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "incremental": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.mjs**

Create `apps/onboarding/next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_ONBOARDING_API_URL: process.env.NEXT_PUBLIC_ONBOARDING_API_URL ?? 'http://localhost:3003',
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create layout.tsx**

Create `apps/onboarding/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HyperGuest Onboarding',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8f9fa' }}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Create root page.tsx**

Create `apps/onboarding/src/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <h1>HyperGuest Hotel Onboarding</h1>
      <p>Please use the invitation link sent to your email to get started.</p>
    </main>
  );
}
```

- [ ] **Step 6: Create src/lib/api.ts**

Create `apps/onboarding/src/lib/api.ts`:

```typescript
const BASE = process.env.NEXT_PUBLIC_ONBOARDING_API_URL ?? 'http://localhost:3003';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  initSession: (token: string) => request<{ ok: boolean; sessionId: number }>('POST', '/session', { token }),
  getState: () => request<WizardState>('GET', '/wizard/state'),
  submitCredentials: (credentials: Record<string, string>) =>
    request<{ ok: boolean }>('POST', '/wizard/submit-credentials', { credentials }),
  confirmReview: (enrichedData: Record<string, unknown>) =>
    request<{ ok: boolean }>('POST', '/wizard/confirm-review', { enrichedData }),
};

export interface WizardState {
  sessionId: number;
  pmsId: number;
  pmsName: string;
  currentStep: number;
  totalSteps: number;
  steps: Array<{ id: string; kind: string; title: string; description: string; status: string }>;
  enrichedData: Record<string, unknown> | null;
  hgPropertyCode: string | null;
  status: string;
}
```

- [ ] **Step 7: Install deps**

```bash
cd /home/nir/ibe && pnpm install
```

- [ ] **Step 8: Type check**

```bash
cd apps/onboarding && pnpm type-check
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add apps/onboarding/
git commit -m "feat(onboarding): Next.js 14 onboarding app scaffold"
```

---

## Task 10: /start/[token] page

**Files:**
- Create: `apps/onboarding/src/app/start/[token]/page.tsx`

This page is a Server Component that calls the onboarding-api to exchange the token for a session cookie, then redirects to the wizard.

- [ ] **Step 1: Create the page**

Create `apps/onboarding/src/app/start/[token]/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

interface Props {
  params: { token: string };
}

export default async function StartPage({ params }: Props) {
  const { token } = params;

  if (!token) redirect('/');

  const apiUrl = process.env.NEXT_PUBLIC_ONBOARDING_API_URL ?? 'http://localhost:3003';

  try {
    const res = await fetch(`${apiUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      return (
        <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
          <h2>Invalid or Expired Invitation</h2>
          <p style={{ color: '#666' }}>{text || 'This invitation link is no longer valid. Please contact your HyperGuest representative.'}</p>
        </main>
      );
    }

    // The session cookie is set by onboarding-api via Set-Cookie header.
    // Next.js Server Components can forward Set-Cookie headers automatically
    // when using credentials: 'include' — but since this is server-to-server,
    // we need to manually forward the cookie.
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const cookieStore = cookies();
      const match = setCookie.match(/onb_session=([^;]+)/);
      if (match) {
        cookieStore.set('onb_session', match[1], {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        });
      }
    }
  } catch {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <h2>Something went wrong</h2>
        <p>Please try again or contact support.</p>
      </main>
    );
  }

  redirect('/wizard');
}
```

- [ ] **Step 2: Type check**

```bash
cd apps/onboarding && pnpm type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/onboarding/src/app/start/
git commit -m "feat(onboarding): token exchange page /start/[token]"
```

---

## Task 11: Wizard page + WizardLayout

**Files:**
- Create: `apps/onboarding/src/app/wizard/page.tsx`
- Create: `apps/onboarding/src/components/WizardLayout.tsx`

- [ ] **Step 1: Create WizardLayout.tsx**

Create `apps/onboarding/src/components/WizardLayout.tsx`:

```tsx
'use client';

import type { WizardState } from '@/lib/api';

interface Props {
  state: WizardState;
  children: React.ReactNode;
}

export function WizardLayout({ state, children }: Props) {
  const progress = state.totalSteps > 0 ? (state.currentStep / state.totalSteps) * 100 : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a2e' }}>HyperGuest</span>
        <span style={{ color: '#666', fontSize: '0.9rem' }}>Hotel Onboarding — {state.pmsName}</span>
      </header>

      {/* Progress bar */}
      <div style={{ background: '#e0e0e0', height: '4px' }}>
        <div style={{ background: '#2563eb', height: '100%', width: `${progress}%`, transition: 'width 0.3s ease' }} />
      </div>

      {/* Step indicator */}
      <div style={{ textAlign: 'center', padding: '0.75rem', color: '#666', fontSize: '0.85rem' }}>
        Step {state.currentStep + 1} of {state.totalSteps}
      </div>

      {/* Content */}
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '2rem 1rem' }}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create wizard page.tsx**

Create `apps/onboarding/src/app/wizard/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type WizardState } from '@/lib/api';
import { WizardLayout } from '@/components/WizardLayout';
import { AutomatedStep } from '@/components/steps/AutomatedStep';
import { CredentialsStep } from '@/components/steps/CredentialsStep';
import { DataReviewStep } from '@/components/steps/DataReviewStep';
import { UserActionStep } from '@/components/steps/UserActionStep';

export default function WizardPage() {
  const router = useRouter();
  const [state, setState] = useState<WizardState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadState() {
    try {
      const s = await api.getState();
      setState(s);
    } catch (err: any) {
      if (err.message.includes('401') || err.message.includes('No session')) {
        router.push('/');
      } else {
        setError(err.message);
      }
    }
  }

  useEffect(() => { loadState(); }, []);

  if (error) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#666' }}>{error}</p>
          <button onClick={loadState}>Retry</button>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </main>
    );
  }

  if (state.status === 'completed') {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
        <h2>You&apos;re connected!</h2>
        <p>Your property is now live on HyperGuest.</p>
      </main>
    );
  }

  const currentStepDef = state.steps[state.currentStep];

  function renderStep() {
    if (!currentStepDef) return null;
    switch (currentStepDef.kind) {
      case 'automated':
        return <AutomatedStep step={currentStepDef} onComplete={loadState} />;
      case 'credentials':
        return <CredentialsStep step={currentStepDef} pmsId={state!.pmsId} onComplete={loadState} />;
      case 'data_review':
        return <DataReviewStep step={currentStepDef} enrichedData={state!.enrichedData ?? {}} onComplete={loadState} />;
      case 'user_action':
        return <UserActionStep step={currentStepDef} />;
      default:
        return <p>Unknown step type</p>;
    }
  }

  return (
    <WizardLayout state={state}>
      {renderStep()}
    </WizardLayout>
  );
}
```

- [ ] **Step 3: Type check**

```bash
cd apps/onboarding && pnpm type-check
```

Expected: errors about missing step components (will be fixed in Task 12)

- [ ] **Step 4: Commit skeleton (components will be stubs)**

We'll create stub components in Task 12 before running type-check clean.

---

## Task 12: Step renderer components

**Files:**
- Create: `apps/onboarding/src/components/steps/AutomatedStep.tsx`
- Create: `apps/onboarding/src/components/steps/CredentialsStep.tsx`
- Create: `apps/onboarding/src/components/steps/DataReviewStep.tsx`
- Create: `apps/onboarding/src/components/steps/UserActionStep.tsx`

- [ ] **Step 1: Create AutomatedStep.tsx**

Create `apps/onboarding/src/components/steps/AutomatedStep.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  step: { id: string; title: string; description: string };
  onComplete: () => void;
}

interface SseEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  message?: string;
  stepId?: string;
  data?: Record<string, unknown>;
}

export function AutomatedStep({ step, onComplete }: Props) {
  const [messages, setMessages] = useState<string[]>([]);
  const [status, setStatus] = useState<'running' | 'done' | 'error'>('running');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const apiUrl = process.env.NEXT_PUBLIC_ONBOARDING_API_URL ?? 'http://localhost:3003';
    const es = new EventSource(`${apiUrl}/wizard/execute`, { withCredentials: true });

    es.onmessage = (e) => {
      const event: SseEvent = JSON.parse(e.data);
      if (event.type === 'progress' && event.message) {
        setMessages((prev) => [...prev, event.message!]);
      } else if (event.type === 'complete') {
        setStatus('done');
        es.close();
        setTimeout(onComplete, 800);
      } else if (event.type === 'error') {
        setMessages((prev) => [...prev, `Error: ${event.message}`]);
        setStatus('error');
        es.close();
      }
    };

    es.onerror = () => {
      setStatus('error');
      setMessages((prev) => [...prev, 'Connection lost']);
      es.close();
    };

    return () => es.close();
  }, []);

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{step.description}</p>

      {status === 'running' && (
        <div style={{ marginBottom: '1rem', color: '#2563eb' }}>Working...</div>
      )}
      {status === 'done' && (
        <div style={{ color: '#16a34a', fontWeight: 600 }}>Done ✓</div>
      )}
      {status === 'error' && (
        <div style={{ color: '#dc2626' }}>Something went wrong. Please try again.</div>
      )}

      <ul style={{ textAlign: 'left', listStyle: 'none', padding: 0, marginTop: '1rem' }}>
        {messages.map((m, i) => (
          <li key={i} style={{ padding: '0.25rem 0', color: status === 'error' && i === messages.length - 1 ? '#dc2626' : '#374151', fontSize: '0.9rem' }}>
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Create CredentialsStep.tsx**

For Mews, `pmsId=4`, the schema has one field: `channelManagerCode`. The component renders fields based on what the schema requires (for now Mews only, additional vendors added when their flows are implemented).

Create `apps/onboarding/src/components/steps/CredentialsStep.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  pmsId: number;
  onComplete: () => void;
}

const CREDENTIAL_FIELDS: Record<number, Array<{ key: string; label: string; placeholder: string; hint?: string }>> = {
  4: [
    {
      key: 'channelManagerCode',
      label: 'Channel Manager Code',
      placeholder: 'e.g. CM-12345',
      hint: 'Find this in Mews Operations → Settings → Integrations → Channel Managers',
    },
  ],
};

export function CredentialsStep({ step, pmsId, onComplete }: Props) {
  const fields = CREDENTIAL_FIELDS[pmsId] ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.submitCredentials(values);
      onComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{step.description}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {fields.map((field) => (
          <div key={field.key}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem' }}>{field.label}</label>
            <input
              type="text"
              placeholder={field.placeholder}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              required
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }}
            />
            {field.hint && <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.4rem' }}>{field.hint}</p>}
          </div>
        ))}

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create DataReviewStep.tsx**

Create `apps/onboarding/src/components/steps/DataReviewStep.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  enrichedData: Record<string, unknown>;
  onComplete: () => void;
}

const EDITABLE_FIELDS = [
  { key: 'hotelName', label: 'Hotel Name', type: 'text' },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'countryCode', label: 'Country Code (2-letter)', type: 'text' },
  { key: 'websiteUrl', label: 'Website URL', type: 'url' },
  { key: 'contactEmail', label: 'Contact Email', type: 'email' },
  { key: 'starRating', label: 'Star Rating (1-5)', type: 'number' },
  { key: 'roomCount', label: 'Number of Rooms', type: 'number' },
];

export function DataReviewStep({ step, enrichedData, onComplete }: Props) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(EDITABLE_FIELDS.map((f) => [f.key, String(enrichedData[f.key] ?? '')]))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.hotelName?.trim()) { setError('Hotel name is required'); return; }
    if (!values.city?.trim()) { setError('City is required'); return; }
    if (!values.countryCode?.trim() || values.countryCode.length !== 2) { setError('Country code must be 2 letters (e.g. GB, US)'); return; }

    setError(null);
    setLoading(true);
    try {
      await api.confirmReview({ ...enrichedData, ...values });
      onComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{step.description}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {EDITABLE_FIELDS.map((field) => (
          <div key={field.key}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' }}>{field.label}</label>
            <input
              type={field.type}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              style={{ width: '100%', padding: '0.7rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
            />
          </div>
        ))}

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Saving...' : 'Confirm & Continue'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Create UserActionStep.tsx**

Create `apps/onboarding/src/components/steps/UserActionStep.tsx`:

```tsx
interface Props {
  step: { id: string; title: string; description: string };
}

export function UserActionStep({ step }: Props) {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#444', fontSize: '1.05rem', lineHeight: 1.6 }}>{step.description}</p>
      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
        <p style={{ color: '#15803d', fontWeight: 600, margin: 0 }}>What happens next?</p>
        <p style={{ color: '#166534', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
          Your HyperGuest team will review your connection and reach out within 24 hours to confirm your first booking is ready.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Type check everything**

```bash
cd apps/onboarding && pnpm type-check
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/onboarding/src/
git commit -m "feat(onboarding): wizard UI — step renderers and layout"
```

---

## Task 13: Admin module in apps/web

**Files:**
- Create: `apps/web/src/app/admin/hotel-onboarding/page.tsx`

This adds a basic admin page to create invitation links and view session status. It follows the same patterns as other admin pages in the codebase.

- [ ] **Step 1: Find where admin pages live and how they authenticate**

```bash
ls apps/web/src/app/admin/ | head -20
head -30 apps/web/src/app/admin/layout.tsx 2>/dev/null || head -30 apps/web/src/app/admin/bookings/page.tsx 2>/dev/null
```

This step is read-only — confirm the pattern before writing the page.

- [ ] **Step 2: Create the admin page**

Create `apps/web/src/app/admin/hotel-onboarding/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api'; // same helper used by all admin pages

interface Invitation {
  id: number;
  token: string;
  pmsName: string;
  hotelName?: string;
  contactEmail?: string;
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
  session?: { status: string; currentStep: number } | null;
}

const PMS_OPTIONS = [
  { id: 4, name: 'Mews' },
];

export default function HotelOnboardingPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ pmsId: 4, hotelName: '', contactEmail: '', websiteUrl: '' });
  const [newLink, setNewLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onboardingAppUrl = process.env.NEXT_PUBLIC_ONBOARDING_APP_URL ?? 'http://localhost:3002';

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest<Invitation[]>('GET', '/admin/hotel-onboarding/invitations');
      setInvitations(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNewLink(null);
    try {
      const inv = await apiRequest<Invitation>('POST', '/admin/hotel-onboarding/invitations', form);
      setNewLink(`${onboardingAppUrl}/start/${inv.token}`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: number) {
    if (!confirm('Revoke this invitation?')) return;
    await apiRequest('DELETE', `/admin/hotel-onboarding/invitations/${id}`);
    await load();
  }

  function statusBadge(inv: Invitation) {
    if (inv.revokedAt) return <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Revoked</span>;
    if (inv.session?.status === 'completed') return <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Completed</span>;
    if (inv.usedAt) return <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>In Progress (step {inv.session?.currentStep ?? 0})</span>;
    if (new Date(inv.expiresAt) < new Date()) return <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Expired</span>;
    return <span style={{ background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Pending</span>;
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Hotel Onboarding</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>Generate invitation links for hotels to self-onboard onto HyperGuest.</p>

      {/* Create form */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>New Invitation</h2>
        <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>System / PMS</label>
            <select
              value={form.pmsId}
              onChange={(e) => setForm((p) => ({ ...p, pmsId: parseInt(e.target.value) }))}
              style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              {PMS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel Name</label>
            <input type="text" value={form.hotelName} onChange={(e) => setForm((p) => ({ ...p, hotelName: e.target.value }))} placeholder="Optional" style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Contact Email</label>
            <input type="email" value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} placeholder="Optional" style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel Website</label>
            <input type="url" value={form.websiteUrl} onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))} placeholder="https://..." style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            {error && <p style={{ color: '#dc2626', marginBottom: '0.5rem' }}>{error}</p>}
            <button type="submit" disabled={creating} style={{ padding: '0.7rem 1.5rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Creating...' : 'Generate Invitation Link'}
            </button>
          </div>
        </form>

        {newLink && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
            <p style={{ fontWeight: 600, color: '#15803d', marginBottom: '0.25rem' }}>Invitation link created:</p>
            <code style={{ wordBreak: 'break-all', fontSize: '0.875rem', color: '#166534' }}>{newLink}</code>
            <button
              onClick={() => navigator.clipboard.writeText(newLink)}
              style={{ marginLeft: '1rem', padding: '0.25rem 0.75rem', border: '1px solid #16a34a', borderRadius: '4px', background: 'transparent', color: '#16a34a', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Copy
            </button>
          </div>
        )}
      </div>

      {/* Invitations table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>Invitations</div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading...</div>
        ) : invitations.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No invitations yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Hotel</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>PMS</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Expires</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div>{inv.hotelName || '—'}</div>
                    {inv.contactEmail && <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>{inv.contactEmail}</div>}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{inv.pmsName}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{statusBadge(inv)}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {!inv.usedAt && !inv.revokedAt && (
                      <>
                        <button
                          onClick={() => navigator.clipboard.writeText(`${onboardingAppUrl}/start/${inv.token}`)}
                          style={{ marginRight: '0.5rem', padding: '0.25rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', background: 'transparent' }}
                        >
                          Copy Link
                        </button>
                        <button
                          onClick={() => handleRevoke(inv.id)}
                          style={{ padding: '0.25rem 0.6rem', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', background: 'transparent', color: '#dc2626' }}
                        >
                          Revoke
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add to admin navigation**

Find where admin nav items are defined:

```bash
grep -rn "hotel-onboarding\|onboarding" apps/web/src/ --include="*.tsx" --include="*.ts" | head -5
grep -rn '"Config"\|"config"\|adminNavItems\|navItems' apps/web/src/components/ --include="*.tsx" | head -10
```

Add a nav item pointing to `/admin/hotel-onboarding` in the appropriate config file (follow the existing pattern for nav items in this codebase).

- [ ] **Step 4: Type check**

```bash
cd apps/web && pnpm type-check
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/hotel-onboarding/
git commit -m "feat(onboarding): admin hotel-onboarding page (invitations + status)"
```

---

## End-to-End Manual Test Checklist

After all tasks are complete, run this flow:

- [ ] Start `apps/onboarding-api` dev server (`pnpm dev` in `apps/onboarding-api`)
- [ ] Start `apps/onboarding` dev server (`pnpm dev` in `apps/onboarding`)
- [ ] In `apps/api` admin, go to `/admin/hotel-onboarding`
- [ ] Create an invitation for Mews with a test hotel name
- [ ] Copy the generated link and open it in a browser
- [ ] Confirm redirect to `/wizard` happens
- [ ] Step 1: Enter a dummy Channel Manager Code, click Connect
- [ ] Step 2: AutomatedStep runs SSE — "Fetching Property Details" completes
- [ ] Step 3: DataReview form pre-fills — enter city/country, click Confirm
- [ ] Step 4: AutomatedStep — "Creating HyperGuest Profile" — calls HG BO API
- [ ] Step 5: AutomatedStep — "Triggering ARI Sync" — calls trigger-update
- [ ] Step 6: UserActionStep — "You're Live!" screen displays
- [ ] In admin, invitation row shows status "Completed"

---

## Self-Review

**Spec coverage:**
- Token-based invite: Task 4 ✓
- Session state machine: Task 5 ✓
- Mews vendor flow (pmsId=4, Form_Type=ID): Tasks 2 + 8 ✓
- HG BO API integration: Task 6 ✓
- SSE step streaming: Task 8 ✓
- Wizard UI: Tasks 9–12 ✓
- Admin module: Task 13 ✓
- DB models: Task 1 ✓

**Gaps / Phase 2 scope (not in this plan):**
- AI assistant bubble in wizard
- Help request flow (OnboardingHelpRequest model is in place)
- Email sending of invitation link
- Additional vendor flows beyond Mews
- Subdomain routing for `onboard.hyperguest.com`
- Render.com deployment config for the two new apps
