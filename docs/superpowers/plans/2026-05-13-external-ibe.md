# External IBE Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let chain and hotel admins configure an external booking engine URL, with AI-assisted template extraction, so that MCP booking links and affiliate links point to the external IBE instead of the local one.

**Architecture:** One `ExternalIBEConfig` Prisma model shared by org-level and property-level rows. A service layer handles CRUD, the chain→hotel resolver, URL substitution, and AI analysis. A single admin page adapts its UI based on context (chain, standalone hotel, or chain-member hotel). MCP `create_booking_link` checks the resolved config and falls back to the local URL.

**Tech Stack:** Prisma ORM, Fastify, Next.js 14, TanStack Query, Vitest, Anthropic API (direct HTTP, using the configured AI key from `resolveAIConfig`), TypeScript with `exactOptionalPropertyTypes`.

**Spec:** `docs/superpowers/specs/2026-05-13-external-ibe-design.md`

---

## File Map

**New files:**
- `packages/shared/src/types/external-ibe.ts` — shared TS types
- `apps/api/src/services/external-ibe.service.ts` — CRUD, resolver, `buildExternalUrl`, AI analyze
- `apps/api/src/services/__tests__/external-ibe.service.test.ts` — service unit tests
- `apps/api/src/routes/external-ibe.route.ts` — 5 HTTP endpoints
- `apps/web/src/app/admin/config/external-ibe/page.tsx` — admin UI

**Modified files:**
- `apps/api/prisma/schema.prisma` — add `ExternalIBEConfig` model + back-relations
- `packages/shared/src/index.ts` — export new types
- `apps/api/src/app.ts` — register route
- `apps/web/src/lib/api-client.ts` — 4 new API client methods
- `apps/web/src/app/admin/_layout-client.tsx` — add nav item
- `apps/api/src/routes/mcp.route.ts` — `create_booking_link` uses external URL when configured

---

## Task 1: Prisma Model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the `ExternalIBEConfig` model to the schema**

  Open `apps/api/prisma/schema.prisma`. Append this block at the end of the file (after the last `}` of `PropertyAmadeusConfig`):

  ```prisma
  model ExternalIBEConfig {
    id               Int           @id @default(autoincrement())
    organizationId   Int?          @unique
    propertyId       Int?          @unique

    searchTemplate   String?
    bookingTemplate  String?
    searchSampleUrls Json          @default("[]")
    bookingSampleUrls Json         @default("[]")
    externalHotelId  String?

    mcpEnabled       Boolean       @default(false)
    affiliateEnabled Boolean       @default(false)
    widgetEnabled    Boolean       @default(false)

    createdAt        DateTime      @default(now())
    updatedAt        DateTime      @updatedAt

    organization     Organization? @relation(fields: [organizationId], references: [id])
    property         Property?     @relation(fields: [propertyId], references: [propertyId])
  }
  ```

- [ ] **Step 2: Add back-relations to `Organization` and `Property`**

  In the `Organization` model (starts at line 15), find the last relation line (currently `orgDataProviderConfig OrgDataProviderConfig?`) and add one line below it:

  ```prisma
    externalIBEConfig           ExternalIBEConfig?
  ```

  In the `Property` model (starts around line 434), find the last relation line (currently `propertyScore PropertyScore?`) and add one line below it:

  ```prisma
    externalIBEConfig     ExternalIBEConfig?
  ```

- [ ] **Step 3: Run the migration**

  From the repo root:
  ```bash
  cd apps/api && npx prisma migrate dev --name add_external_ibe_config
  ```
  Expected: migration file created, schema applied, no errors.

- [ ] **Step 4: Regenerate the Prisma client**

  ```bash
  cd apps/api && npx prisma generate
  ```
  Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
  git commit -m "feat: add ExternalIBEConfig prisma model"
  ```

---

## Task 2: Shared Types

**Files:**
- Create: `packages/shared/src/types/external-ibe.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test** (type-check test — verify the file exports compile)

  Create `packages/shared/src/types/external-ibe.ts` with this content:

  ```ts
  export interface ExternalIBEConfigRow {
    id: number
    organizationId: number | null
    propertyId: number | null
    searchTemplate: string | null
    bookingTemplate: string | null
    searchSampleUrls: string[]
    bookingSampleUrls: string[]
    externalHotelId: string | null
    mcpEnabled: boolean
    affiliateEnabled: boolean
    widgetEnabled: boolean
    createdAt: string
    updatedAt: string
  }

  export interface ExternalIBEConfigUpdate {
    searchTemplate?: string | null
    bookingTemplate?: string | null
    searchSampleUrls?: string[]
    bookingSampleUrls?: string[]
    externalHotelId?: string | null
    mcpEnabled?: boolean
    affiliateEnabled?: boolean
    widgetEnabled?: boolean
  }

  export interface ExternalIBEAnalyzeRequest {
    urls: string[]
    type: 'search' | 'booking'
    orgId?: number
    propertyId?: number
  }

  export interface ExternalIBEAnalyzeResponse {
    template: string
    mapping: Array<{
      concept: string
      detectedParam: string
      exampleValue: string
    }>
    unmapped: string[]
  }

  export interface EffectiveExternalIBEConfig {
    searchTemplate: string | null
    bookingTemplate: string | null
    externalHotelId: string | null
    mcpEnabled: boolean
    affiliateEnabled: boolean
    widgetEnabled: boolean
  }
  ```

- [ ] **Step 2: Export from the shared package index**

  In `packages/shared/src/index.ts`, add after the last `export * from './types/...'` line:

  ```ts
  export type * from './types/external-ibe.js'
  ```

- [ ] **Step 3: Build the shared package to verify types compile**

  ```bash
  cd packages/shared && npm run build
  ```
  Expected: no TypeScript errors, build succeeds.

- [ ] **Step 4: Commit**

  ```bash
  git add packages/shared/src/types/external-ibe.ts packages/shared/src/index.ts packages/shared/dist/
  git commit -m "feat: add ExternalIBE shared types"
  ```

---

## Task 3: Service — buildExternalUrl + CRUD + Resolver

**Files:**
- Create: `apps/api/src/services/external-ibe.service.ts`
- Create: `apps/api/src/services/__tests__/external-ibe.service.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `apps/api/src/services/__tests__/external-ibe.service.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest'

  vi.mock('../../db/client.js', () => ({
    prisma: {
      externalIBEConfig: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
      property: {
        findUnique: vi.fn(),
      },
    },
  }))

  import { prisma } from '../../db/client.js'
  import {
    buildExternalUrl,
    getEffectiveExternalIBEConfig,
    getExternalIBEConfig,
  } from '../external-ibe.service.js'

  const mp = prisma as any
  beforeEach(() => { vi.clearAllMocks() })

  // ── buildExternalUrl ──────────────────────────────────────────────────────

  describe('buildExternalUrl', () => {
    it('replaces all tokens', () => {
      expect(buildExternalUrl(
        'https://ext.com/book?hotel={externalHotelId}&from={checkIn}&to={checkOut}',
        { externalHotelId: '4521', checkIn: '2024-06-01', checkOut: '2024-06-07' },
      )).toBe('https://ext.com/book?hotel=4521&from=2024-06-01&to=2024-06-07')
    })

    it('omits query param when value is null', () => {
      expect(buildExternalUrl(
        'https://ext.com/book?hotel={externalHotelId}&room={roomId}',
        { externalHotelId: '4521', roomId: null },
      )).toBe('https://ext.com/book?hotel=4521')
    })

    it('removes query string entirely when all params are null', () => {
      expect(buildExternalUrl(
        'https://ext.com/book?room={roomId}',
        { roomId: null },
      )).toBe('https://ext.com/book')
    })

    it('handles path-segment placeholders', () => {
      expect(buildExternalUrl(
        'https://ext.com/{externalHotelId}/book?from={checkIn}',
        { externalHotelId: '4521', checkIn: '2024-06-01' },
      )).toBe('https://ext.com/4521/book?from=2024-06-01')
    })

    it('leaves unknown tokens intact in path segments', () => {
      expect(buildExternalUrl(
        'https://ext.com/{externalHotelId}/book',
        {},
      )).toBe('https://ext.com/{externalHotelId}/book')
    })
  })

  // ── getEffectiveExternalIBEConfig ─────────────────────────────────────────

  describe('getEffectiveExternalIBEConfig — standalone hotel', () => {
    it('returns hotel config when no chain config exists', async () => {
      mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
      mp.externalIBEConfig.findUnique
        .mockResolvedValueOnce({   // hotel row
          searchTemplate: 'https://ext.com/search?hotel={externalHotelId}',
          bookingTemplate: 'https://ext.com/book?hotel={externalHotelId}',
          externalHotelId: '4521',
          mcpEnabled: true,
          affiliateEnabled: false,
          widgetEnabled: false,
        })
        .mockResolvedValueOnce(null)  // chain row

      const result = await getEffectiveExternalIBEConfig(42)
      expect(result?.searchTemplate).toBe('https://ext.com/search?hotel={externalHotelId}')
      expect(result?.externalHotelId).toBe('4521')
      expect(result?.mcpEnabled).toBe(true)
    })

    it('returns null when no hotel config and no chain config', async () => {
      mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
      mp.externalIBEConfig.findUnique.mockResolvedValue(null)

      expect(await getEffectiveExternalIBEConfig(42)).toBeNull()
    })
  })

  describe('getEffectiveExternalIBEConfig — chain-member hotel', () => {
    it('merges chain templates with hotel externalHotelId', async () => {
      mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
      mp.externalIBEConfig.findUnique
        .mockResolvedValueOnce({   // hotel row (no own templates)
          searchTemplate: null,
          bookingTemplate: null,
          externalHotelId: '4521',
          mcpEnabled: true,
          affiliateEnabled: false,
          widgetEnabled: false,
        })
        .mockResolvedValueOnce({   // chain row
          searchTemplate: 'https://ext.com/search?hotel={externalHotelId}&from={checkIn}',
          bookingTemplate: 'https://ext.com/book?hotel={externalHotelId}&room={roomId}',
          mcpEnabled: true,
          affiliateEnabled: false,
          widgetEnabled: false,
        })

      const result = await getEffectiveExternalIBEConfig(42)
      expect(result?.searchTemplate).toBe('https://ext.com/search?hotel={externalHotelId}&from={checkIn}')
      expect(result?.externalHotelId).toBe('4521')
    })

    it('returns chain config as-is when no hotel row', async () => {
      mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
      mp.externalIBEConfig.findUnique
        .mockResolvedValueOnce(null)  // hotel row
        .mockResolvedValueOnce({      // chain row
          searchTemplate: 'https://ext.com/search?hotel={externalHotelId}',
          bookingTemplate: null,
          mcpEnabled: false,
          affiliateEnabled: false,
          widgetEnabled: false,
        })

      const result = await getEffectiveExternalIBEConfig(42)
      expect(result?.searchTemplate).toBe('https://ext.com/search?hotel={externalHotelId}')
      expect(result?.externalHotelId).toBeNull()
    })

    it('uses hotel own templates when hotel has them (full override)', async () => {
      mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
      mp.externalIBEConfig.findUnique
        .mockResolvedValueOnce({   // hotel row with own templates
          searchTemplate: 'https://hotel-own.com/search?h={externalHotelId}',
          bookingTemplate: 'https://hotel-own.com/book?h={externalHotelId}',
          externalHotelId: '9999',
          mcpEnabled: true,
          affiliateEnabled: true,
          widgetEnabled: false,
        })
        .mockResolvedValueOnce({   // chain row
          searchTemplate: 'https://chain.com/search?hotel={externalHotelId}',
          bookingTemplate: 'https://chain.com/book?hotel={externalHotelId}',
          mcpEnabled: false,
          affiliateEnabled: false,
          widgetEnabled: false,
        })

      const result = await getEffectiveExternalIBEConfig(42)
      expect(result?.searchTemplate).toBe('https://hotel-own.com/search?h={externalHotelId}')
      expect(result?.mcpEnabled).toBe(true)
    })
  })

  // ── getExternalIBEConfig ──────────────────────────────────────────────────

  describe('getExternalIBEConfig', () => {
    it('returns null when no row found', async () => {
      mp.externalIBEConfig.findUnique.mockResolvedValue(null)
      expect(await getExternalIBEConfig({ orgId: 1 })).toBeNull()
    })

    it('returns row when found by orgId', async () => {
      const row = {
        id: 1, organizationId: 1, propertyId: null,
        searchTemplate: 'https://ext.com/search', bookingTemplate: null,
        searchSampleUrls: '[]', bookingSampleUrls: '[]',
        externalHotelId: null, mcpEnabled: false,
        affiliateEnabled: false, widgetEnabled: false,
        createdAt: new Date(), updatedAt: new Date(),
      }
      mp.externalIBEConfig.findUnique.mockResolvedValue(row)
      const result = await getExternalIBEConfig({ orgId: 1 })
      expect(result?.searchTemplate).toBe('https://ext.com/search')
      expect(result?.searchSampleUrls).toEqual([])
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd apps/api && npm test -- external-ibe.service
  ```
  Expected: FAIL — `external-ibe.service.js` does not exist yet.

- [ ] **Step 3: Implement the service**

  Create `apps/api/src/services/external-ibe.service.ts`:

  ```ts
  import { prisma } from '../db/client.js'
  import type {
    ExternalIBEConfigRow,
    ExternalIBEConfigUpdate,
    EffectiveExternalIBEConfig,
  } from '@ibe/shared'

  // ── buildExternalUrl ──────────────────────────────────────────────────────

  export function buildExternalUrl(
    template: string,
    params: Record<string, string | number | null | undefined>,
  ): string {
    let result = template
    for (const [key, val] of Object.entries(params)) {
      if (val !== null && val !== undefined) {
        result = result.replaceAll(`{${key}}`, String(val))
      }
    }
    // Strip query params whose token was not replaced (value was null/missing)
    const qIdx = result.indexOf('?')
    if (qIdx === -1) return result
    const base = result.slice(0, qIdx)
    const kept = result.slice(qIdx + 1).split('&').filter(pair => !/\{[^}]+\}/.test(pair))
    return kept.length > 0 ? `${base}?${kept.join('&')}` : base
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toRow(row: {
    id: number
    organizationId: number | null
    propertyId: number | null
    searchTemplate: string | null
    bookingTemplate: string | null
    searchSampleUrls: unknown
    bookingSampleUrls: unknown
    externalHotelId: string | null
    mcpEnabled: boolean
    affiliateEnabled: boolean
    widgetEnabled: boolean
    createdAt: Date
    updatedAt: Date
  }): ExternalIBEConfigRow {
    return {
      id: row.id,
      organizationId: row.organizationId,
      propertyId: row.propertyId,
      searchTemplate: row.searchTemplate,
      bookingTemplate: row.bookingTemplate,
      searchSampleUrls: Array.isArray(row.searchSampleUrls) ? (row.searchSampleUrls as string[]) : [],
      bookingSampleUrls: Array.isArray(row.bookingSampleUrls) ? (row.bookingSampleUrls as string[]) : [],
      externalHotelId: row.externalHotelId,
      mcpEnabled: row.mcpEnabled,
      affiliateEnabled: row.affiliateEnabled,
      widgetEnabled: row.widgetEnabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  export async function getExternalIBEConfig(
    scope: { orgId?: number; propertyId?: number },
  ): Promise<ExternalIBEConfigRow | null> {
    const where = scope.propertyId !== undefined
      ? { propertyId: scope.propertyId }
      : { organizationId: scope.orgId }
    const row = await prisma.externalIBEConfig.findUnique({ where })
    return row ? toRow(row) : null
  }

  export async function upsertExternalIBEConfig(
    scope: { orgId?: number; propertyId?: number },
    data: ExternalIBEConfigUpdate,
  ): Promise<ExternalIBEConfigRow> {
    const where = scope.propertyId !== undefined
      ? { propertyId: scope.propertyId }
      : { organizationId: scope.orgId }

    const create = {
      ...data,
      ...(scope.propertyId !== undefined ? { propertyId: scope.propertyId } : { organizationId: scope.orgId }),
    }

    const row = await prisma.externalIBEConfig.upsert({
      where,
      create,
      update: data,
    })
    return toRow(row)
  }

  export async function deleteExternalIBEConfig(
    scope: { orgId?: number; propertyId?: number },
  ): Promise<void> {
    const where = scope.propertyId !== undefined
      ? { propertyId: scope.propertyId }
      : { organizationId: scope.orgId }
    await prisma.externalIBEConfig.delete({ where })
  }

  // ── Resolver ──────────────────────────────────────────────────────────────

  export async function getEffectiveExternalIBEConfig(
    propertyId: number,
  ): Promise<EffectiveExternalIBEConfig | null> {
    const [hotelRow, property] = await Promise.all([
      prisma.externalIBEConfig.findUnique({ where: { propertyId } }),
      prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
    ])

    if (!property) return null

    const chainRow = property.organizationId
      ? await prisma.externalIBEConfig.findUnique({ where: { organizationId: property.organizationId } })
      : null

    // Standalone hotel (no chain config)
    if (!chainRow) {
      if (!hotelRow) return null
      return {
        searchTemplate: hotelRow.searchTemplate,
        bookingTemplate: hotelRow.bookingTemplate,
        externalHotelId: hotelRow.externalHotelId,
        mcpEnabled: hotelRow.mcpEnabled,
        affiliateEnabled: hotelRow.affiliateEnabled,
        widgetEnabled: hotelRow.widgetEnabled,
      }
    }

    // Chain-member hotel with no hotel row → use chain as-is
    if (!hotelRow) {
      return {
        searchTemplate: chainRow.searchTemplate,
        bookingTemplate: chainRow.bookingTemplate,
        externalHotelId: null,
        mcpEnabled: chainRow.mcpEnabled,
        affiliateEnabled: chainRow.affiliateEnabled,
        widgetEnabled: chainRow.widgetEnabled,
      }
    }

    // Hotel has own templates → full override
    if (hotelRow.searchTemplate || hotelRow.bookingTemplate) {
      return {
        searchTemplate: hotelRow.searchTemplate ?? chainRow.searchTemplate,
        bookingTemplate: hotelRow.bookingTemplate ?? chainRow.bookingTemplate,
        externalHotelId: hotelRow.externalHotelId,
        mcpEnabled: hotelRow.mcpEnabled,
        affiliateEnabled: hotelRow.affiliateEnabled,
        widgetEnabled: hotelRow.widgetEnabled,
      }
    }

    // Hotel only has externalHotelId → merge with chain templates
    return {
      searchTemplate: chainRow.searchTemplate,
      bookingTemplate: chainRow.bookingTemplate,
      externalHotelId: hotelRow.externalHotelId,
      mcpEnabled: hotelRow.mcpEnabled,
      affiliateEnabled: hotelRow.affiliateEnabled,
      widgetEnabled: hotelRow.widgetEnabled,
    }
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd apps/api && npm test -- external-ibe.service
  ```
  Expected: all tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/services/external-ibe.service.ts \
          apps/api/src/services/__tests__/external-ibe.service.test.ts
  git commit -m "feat: add external IBE service with buildExternalUrl and resolver"
  ```

---

## Task 4: AI Analyze Function

**Files:**
- Modify: `apps/api/src/services/external-ibe.service.ts`
- Modify: `apps/api/src/services/__tests__/external-ibe.service.test.ts`

The analyze function calls the Anthropic API using the AI key configured for the given scope (`resolveAIConfig`). It sends the sample URLs and returns a structured template + mapping.

- [ ] **Step 1: Add failing tests for the analyze function**

  Append these to `apps/api/src/services/__tests__/external-ibe.service.test.ts`:

  ```ts
  vi.mock('../ai-config.service.js', () => ({
    resolveAIConfig: vi.fn(),
  }))

  import { resolveAIConfig } from '../ai-config.service.js'
  import { analyzeExternalIBEUrls } from '../external-ibe.service.js'

  const mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)

  describe('analyzeExternalIBEUrls', () => {
    it('returns error when no AI config is available', async () => {
      (resolveAIConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      const result = await analyzeExternalIBEUrls({
        urls: ['https://ext.com/book?hotel=123&from=2024-06-01'],
        type: 'booking',
      })
      expect(result).toEqual({ error: 'AI not configured for this scope' })
    })

    it('returns error when provider is not anthropic', async () => {
      (resolveAIConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'openai', apiKey: 'sk-test', model: 'gpt-4',
      })
      const result = await analyzeExternalIBEUrls({
        urls: ['https://ext.com/book?hotel=123&from=2024-06-01'],
        type: 'booking',
      })
      expect(result).toEqual({ error: 'AI analysis requires Anthropic to be configured' })
    })

    it('returns parsed template and mapping on success', async () => {
      (resolveAIConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-sonnet-4-6',
      })

      const aiResponse = {
        template: 'https://ext.com/book?hotel={externalHotelId}&from={checkIn}',
        mapping: [
          { concept: 'externalHotelId', detectedParam: 'hotel', exampleValue: '123' },
          { concept: 'checkIn', detectedParam: 'from', exampleValue: '2024-06-01' },
        ],
        unmapped: [],
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: JSON.stringify(aiResponse) }],
          stop_reason: 'end_turn',
        }),
      })

      const result = await analyzeExternalIBEUrls({
        urls: ['https://ext.com/book?hotel=123&from=2024-06-01'],
        type: 'booking',
      })

      expect(result).toEqual(aiResponse)
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd apps/api && npm test -- external-ibe.service
  ```
  Expected: the three new `analyzeExternalIBEUrls` tests FAIL.

- [ ] **Step 3: Implement `analyzeExternalIBEUrls` in the service**

  Add these imports at the top of `apps/api/src/services/external-ibe.service.ts`:

  ```ts
  import { resolveAIConfig } from './ai-config.service.js'
  import type { ExternalIBEAnalyzeRequest, ExternalIBEAnalyzeResponse } from '@ibe/shared'
  ```

  Add this function at the end of the file:

  ```ts
  const PLACEHOLDER_VOCABULARY = [
    'externalHotelId — Property ID in the external IBE system',
    'hotelId — HyperGuest internal property ID',
    'checkIn — Arrival date (YYYY-MM-DD)',
    'checkOut — Departure date (YYYY-MM-DD)',
    'adults — Adult guest count',
    'rooms — Room count',
    'nationality — Guest nationality (ISO 2-letter code)',
    'currency — Currency code (e.g. USD)',
    'roomId — Room type ID (booking URLs only)',
    'ratePlanId — Rate plan ID (booking URLs only)',
  ]

  export async function analyzeExternalIBEUrls(
    req: ExternalIBEAnalyzeRequest,
  ): Promise<ExternalIBEAnalyzeResponse | { error: string }> {
    const aiConfig = await resolveAIConfig(req.propertyId, req.orgId)
    if (!aiConfig) return { error: 'AI not configured for this scope' }
    if (aiConfig.provider !== 'anthropic') return { error: 'AI analysis requires Anthropic to be configured' }

    const prompt = `You are a URL structure analyzer. Given these sample ${req.type} page URLs from an external hotel booking engine, identify which URL parameters correspond to the placeholder concepts below.

Placeholder vocabulary:
${PLACEHOLDER_VOCABULARY.map(p => `- {${p}}`).join('\n')}

Sample URLs:
${req.urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}

Return a JSON object with exactly this structure:
{
  "template": "<the URL with parameter values replaced by {placeholder} tokens>",
  "mapping": [
    { "concept": "<placeholder name without braces>", "detectedParam": "<URL param name>", "exampleValue": "<value from first sample URL>" }
  ],
  "unmapped": ["<param names present in URL but not mapped to any concept>"]
}

Rules:
- Use {externalHotelId} (not {hotelId}) when you detect a hotel identifier that belongs to the external booking system.
- If a parameter appears in some URLs but not others, include it if it appears in the majority.
- Return only the JSON object, no surrounding text.`

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': aiConfig.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return { error: `Anthropic API error: ${res.status} ${text.slice(0, 200)}` }
      }

      const data = await res.json() as {
        content: Array<{ type: string; text?: string }>
      }

      const textBlock = data.content.find(b => b.type === 'text')
      if (!textBlock?.text) return { error: 'No response from AI' }

      const parsed = JSON.parse(textBlock.text) as ExternalIBEAnalyzeResponse
      return parsed
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Unexpected error during analysis' }
    }
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd apps/api && npm test -- external-ibe.service
  ```
  Expected: all tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/services/external-ibe.service.ts \
          apps/api/src/services/__tests__/external-ibe.service.test.ts
  git commit -m "feat: add AI URL analysis to external IBE service"
  ```

---

## Task 5: API Route + App Registration

**Files:**
- Create: `apps/api/src/routes/external-ibe.route.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create the route file**

  Create `apps/api/src/routes/external-ibe.route.ts`:

  ```ts
  import type { FastifyInstance } from 'fastify'
  import {
    getExternalIBEConfig,
    upsertExternalIBEConfig,
    deleteExternalIBEConfig,
    analyzeExternalIBEUrls,
  } from '../services/external-ibe.service.js'
  import type { ExternalIBEConfigUpdate, ExternalIBEAnalyzeRequest } from '@ibe/shared'

  function parseScope(
    query: Record<string, string>,
    admin: { role: string; organizationId: number | null },
  ): { orgId?: number; propertyId?: number } | { error: string } {
    const rawProperty = query['propertyId']
    const rawOrg = query['orgId']

    if (rawProperty) {
      const propertyId = parseInt(rawProperty, 10)
      if (isNaN(propertyId)) return { error: 'Invalid propertyId' }
      return { propertyId }
    }

    if (rawOrg) {
      if (admin.role !== 'super' && admin.role !== 'chain') {
        const orgId = parseInt(rawOrg, 10)
        if (orgId !== admin.organizationId) return { error: 'Forbidden' }
      }
      const orgId = parseInt(rawOrg, 10)
      if (isNaN(orgId)) return { error: 'Invalid orgId' }
      return { orgId }
    }

    if (admin.organizationId) return { orgId: admin.organizationId }
    return { error: 'No scope provided' }
  }

  export async function externalIBERoutes(fastify: FastifyInstance) {
    fastify.get('/admin/external-ibe', async (request, reply) => {
      const scope = parseScope(
        request.query as Record<string, string>,
        request.admin,
      )
      if ('error' in scope) return reply.status(400).send({ error: scope.error })
      return reply.send(await getExternalIBEConfig(scope))
    })

    fastify.put('/admin/external-ibe', async (request, reply) => {
      const scope = parseScope(
        request.query as Record<string, string>,
        request.admin,
      )
      if ('error' in scope) return reply.status(400).send({ error: scope.error })
      const body = request.body as ExternalIBEConfigUpdate
      return reply.send(await upsertExternalIBEConfig(scope, body))
    })

    fastify.delete('/admin/external-ibe', async (request, reply) => {
      const scope = parseScope(
        request.query as Record<string, string>,
        request.admin,
      )
      if ('error' in scope) return reply.status(400).send({ error: scope.error })
      try {
        await deleteExternalIBEConfig(scope)
        return reply.status(204).send()
      } catch {
        return reply.status(404).send({ error: 'Config not found' })
      }
    })

    fastify.post('/admin/external-ibe/analyze', async (request, reply) => {
      const body = request.body as ExternalIBEAnalyzeRequest
      if (!body.urls?.length) return reply.status(400).send({ error: 'urls is required' })
      if (!body.type) return reply.status(400).send({ error: 'type is required' })
      const result = await analyzeExternalIBEUrls(body)
      if ('error' in result) return reply.status(422).send(result)
      return reply.send(result)
    })
  }
  ```

- [ ] **Step 2: Register the route in `app.ts`**

  In `apps/api/src/app.ts`:

  a) Add the import near the other config route imports (e.g., after the `amadeusConfigRoutes` import):
  ```ts
  import { externalIBERoutes } from './routes/external-ibe.route.js'
  ```

  b) Register it inside the admin-authenticated block, near the other config route registrations (e.g., after `amadeusConfigRoutes`):
  ```ts
  await adminApp.register(externalIBERoutes, { prefix: '/api/v1' })
  ```

- [ ] **Step 3: Restart the API server and verify the routes exist**

  ```bash
  curl -s http://localhost:3001/api/v1/admin/external-ibe -H "Authorization: Bearer <token>" | head -c 100
  ```
  Expected: JSON response (null or `{}`) rather than 404.

  (The API server must be running. If not started, run `cd apps/api && npm run dev` first.)

- [ ] **Step 4: Commit**

  ```bash
  git add apps/api/src/routes/external-ibe.route.ts apps/api/src/app.ts
  git commit -m "feat: add external IBE API routes"
  ```

---

## Task 6: API Client Methods

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add imports in the web api-client file**

  In `apps/web/src/lib/api-client.ts`, add these imports after the existing `@ibe/shared` type imports:

  ```ts
  import type {
    ExternalIBEConfigRow,
    ExternalIBEConfigUpdate,
    ExternalIBEAnalyzeRequest,
    ExternalIBEAnalyzeResponse,
  } from '@ibe/shared'
  ```

  (Check if `@ibe/shared` imports are already consolidated in one import statement; if so, just add these four types to that existing import.)

- [ ] **Step 2: Add four API client methods**

  In the `apiClient` object in `apps/web/src/lib/api-client.ts`, add after the `updateMapsConfig` method block (around line 1394):

  ```ts
  getExternalIBEConfig(scope: { orgId?: number; propertyId?: number }): Promise<ExternalIBEConfigRow | null> {
    const qs = scope.propertyId !== undefined
      ? `?propertyId=${scope.propertyId}`
      : scope.orgId !== undefined ? `?orgId=${scope.orgId}` : ''
    return apiRequest(`/api/v1/admin/external-ibe${qs}`)
  },

  upsertExternalIBEConfig(
    data: ExternalIBEConfigUpdate,
    scope: { orgId?: number; propertyId?: number },
  ): Promise<ExternalIBEConfigRow> {
    const qs = scope.propertyId !== undefined
      ? `?propertyId=${scope.propertyId}`
      : scope.orgId !== undefined ? `?orgId=${scope.orgId}` : ''
    return apiRequest(`/api/v1/admin/external-ibe${qs}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  deleteExternalIBEConfig(scope: { orgId?: number; propertyId?: number }): Promise<void> {
    const qs = scope.propertyId !== undefined
      ? `?propertyId=${scope.propertyId}`
      : scope.orgId !== undefined ? `?orgId=${scope.orgId}` : ''
    return apiRequest(`/api/v1/admin/external-ibe${qs}`, { method: 'DELETE' })
  },

  analyzeExternalIBEUrls(req: ExternalIBEAnalyzeRequest): Promise<ExternalIBEAnalyzeResponse> {
    return apiRequest('/api/v1/admin/external-ibe/analyze', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  },
  ```

- [ ] **Step 3: Build the web app to verify TypeScript compiles**

  ```bash
  cd apps/web && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/src/lib/api-client.ts
  git commit -m "feat: add external IBE API client methods"
  ```

---

## Task 7: Admin UI Page

**Files:**
- Create: `apps/web/src/app/admin/config/external-ibe/page.tsx`

This is a single page that renders one of three layouts:
- **Full template UI**: shown for chain admins and standalone hotels (no chain config above).
- **Simplified UI**: shown for chain-member hotels (chain config exists).

Scope is determined by `useAdminProperty()` + `useAdminAuth()`:
- `admin.role === 'chain'` or `contextOrgId != null` (super viewing an org) → org/chain level
- `contextPropertyId != null` → hotel level; fetch both hotel config and org config to determine which layout

- [ ] **Step 1: Create the page file**

  Create `apps/web/src/app/admin/config/external-ibe/page.tsx`:

  ```tsx
  'use client'

  import { useState } from 'react'
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { apiClient } from '@/lib/api-client'
  import { useAdminAuth } from '@/hooks/use-admin-auth'
  import { useAdminProperty } from '../../property-context'
  import type { ExternalIBEConfigRow, ExternalIBEAnalyzeResponse } from '@ibe/shared'

  // ── Shared sub-components ─────────────────────────────────────────────────

  function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
          checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
        ].join(' ')}
      >
        <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
      </button>
    )
  }

  function MappingTable({ mapping, unmapped }: { mapping: ExternalIBEAnalyzeResponse['mapping']; unmapped: string[] }) {
    return (
      <div className="mt-3 space-y-3">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[var(--color-text-muted)]">
              <th className="pb-1 pr-4 font-medium">Concept</th>
              <th className="pb-1 pr-4 font-medium">Detected param</th>
              <th className="pb-1 font-medium">Example value</th>
            </tr>
          </thead>
          <tbody>
            {mapping.map(m => (
              <tr key={m.concept} className="border-t border-[var(--color-border)]">
                <td className="py-1.5 pr-4 font-mono text-xs text-[var(--color-primary)]">{`{${m.concept}}`}</td>
                <td className="py-1.5 pr-4 font-mono text-xs text-[var(--color-text)]">{m.detectedParam}</td>
                <td className="py-1.5 font-mono text-xs text-[var(--color-text-muted)]">{m.exampleValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {unmapped.length > 0 && (
          <p className="text-xs text-[var(--color-text-muted)]">
            Not mapped (will be ignored): {unmapped.join(', ')}
          </p>
        )}
      </div>
    )
  }

  // ── URL Analysis section (used in both full and simplified views) ─────────

  function AnalysisSection({
    label,
    type,
    singleUrl,
    orgId,
    propertyId,
    result,
    onResult,
  }: {
    label: string
    type: 'search' | 'booking'
    singleUrl?: boolean
    orgId?: number
    propertyId?: number
    result: ExternalIBEAnalyzeResponse | null
    onResult: (r: ExternalIBEAnalyzeResponse) => void
  }) {
    const [urls, setUrls] = useState('')
    const [error, setError] = useState<string | null>(null)

    const analyzeMutation = useMutation({
      mutationFn: () => apiClient.analyzeExternalIBEUrls({
        urls: urls.split('\n').map(u => u.trim()).filter(Boolean),
        type,
        ...(orgId !== undefined ? { orgId } : {}),
        ...(propertyId !== undefined ? { propertyId } : {}),
      }),
      onSuccess: r => { onResult(r); setError(null) },
      onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Analysis failed'),
    })

    return (
      <div className="space-y-3">
        <label className="block text-sm font-medium text-[var(--color-text)]">{label}</label>
        <textarea
          value={urls}
          onChange={e => setUrls(e.target.value)}
          placeholder={singleUrl ? 'Paste one sample URL from this hotel' : 'Paste one or more sample URLs (one per line)'}
          rows={singleUrl ? 2 : 4}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
        />
        <button
          type="button"
          disabled={!urls.trim() || analyzeMutation.isPending}
          onClick={() => analyzeMutation.mutate()}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {analyzeMutation.isPending ? 'Analyzing…' : singleUrl ? 'Extract ID' : 'Analyze'}
        </button>
        {error && <p className="text-sm text-error">{error}</p>}
        {result && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">Generated template</p>
            <p className="font-mono text-sm text-[var(--color-text)] break-all">{result.template}</p>
            <MappingTable mapping={result.mapping} unmapped={result.unmapped} />
          </div>
        )}
      </div>
    )
  }

  // ── Channel toggles ───────────────────────────────────────────────────────

  function ChannelToggles({
    mcp, affiliate, widget, disabled,
    onChange,
  }: {
    mcp: boolean; affiliate: boolean; widget: boolean
    disabled: boolean
    onChange: (key: 'mcpEnabled' | 'affiliateEnabled' | 'widgetEnabled', v: boolean) => void
  }) {
    return (
      <div className="space-y-3">
        {([
          ['mcpEnabled', 'MCP', mcp],
          ['affiliateEnabled', 'Affiliate', affiliate],
          ['widgetEnabled', 'Widget', widget],
        ] as const).map(([key, lbl, val]) => (
          <div key={key} className="flex items-center justify-between">
            <span className={`text-sm ${disabled ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`}>{lbl}</span>
            <Toggle checked={val} onChange={v => !disabled && onChange(key, v)} />
          </div>
        ))}
        {disabled && (
          <p className="text-xs text-[var(--color-text-muted)]">Save at least one template to enable channel toggles.</p>
        )}
      </div>
    )
  }

  // ── Full template UI (chain + standalone hotel) ───────────────────────────

  function FullTemplateUI({
    existing,
    scope,
    onSaved,
    onDeleted,
  }: {
    existing: ExternalIBEConfigRow | null
    scope: { orgId?: number; propertyId?: number }
    onSaved: () => void
    onDeleted: () => void
  }) {
    const qc = useQueryClient()
    const [searchResult, setSearchResult] = useState<ExternalIBEAnalyzeResponse | null>(null)
    const [bookingResult, setBookingResult] = useState<ExternalIBEAnalyzeResponse | null>(null)
    const [mcpEnabled, setMcpEnabled] = useState(existing?.mcpEnabled ?? false)
    const [affiliateEnabled, setAffiliateEnabled] = useState(existing?.affiliateEnabled ?? false)
    const [widgetEnabled, setWidgetEnabled] = useState(existing?.widgetEnabled ?? false)
    const [deleteConfirm, setDeleteConfirm] = useState(false)

    const hasTemplates = !!(existing?.searchTemplate || existing?.bookingTemplate || searchResult || bookingResult)

    const saveMutation = useMutation({
      mutationFn: () => apiClient.upsertExternalIBEConfig({
        ...(searchResult ? { searchTemplate: searchResult.template, searchSampleUrls: [] } : {}),
        ...(bookingResult ? { bookingTemplate: bookingResult.template, bookingSampleUrls: [] } : {}),
        mcpEnabled,
        affiliateEnabled,
        widgetEnabled,
      }, scope),
      onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe', scope] }); onSaved() },
    })

    const deleteMutation = useMutation({
      mutationFn: () => apiClient.deleteExternalIBEConfig(scope),
      onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe', scope] }); onDeleted() },
    })

    return (
      <div className="space-y-6">
        {existing && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-1">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">Current search template</p>
            <p className="font-mono text-sm text-[var(--color-text)] break-all">{existing.searchTemplate ?? '—'}</p>
            <p className="text-xs font-medium text-[var(--color-text-muted)] mt-2">Current booking template</p>
            <p className="font-mono text-sm text-[var(--color-text)] break-all">{existing.bookingTemplate ?? '—'}</p>
          </div>
        )}

        <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Search page URL</h3>
          <AnalysisSection
            label="Paste one or more sample search page URLs (one per line)"
            type="search"
            orgId={scope.orgId}
            propertyId={scope.propertyId}
            result={searchResult}
            onResult={setSearchResult}
          />
        </section>

        <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Booking page URL</h3>
          <AnalysisSection
            label="Paste one or more sample booking page URLs (one per line)"
            type="booking"
            orgId={scope.orgId}
            propertyId={scope.propertyId}
            result={bookingResult}
            onResult={setBookingResult}
          />
        </section>

        <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Channel toggles</h3>
          <ChannelToggles
            mcp={mcpEnabled}
            affiliate={affiliateEnabled}
            widget={widgetEnabled}
            disabled={!hasTemplates}
            onChange={(k, v) => {
              if (k === 'mcpEnabled') setMcpEnabled(v)
              else if (k === 'affiliateEnabled') setAffiliateEnabled(v)
              else setWidgetEnabled(v)
            }}
          />
        </section>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {existing && !deleteConfirm && (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="rounded-lg border border-error/30 px-4 py-2 text-sm font-medium text-error hover:bg-error/5 transition-colors"
            >
              Delete config
            </button>
          )}
          {deleteConfirm && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-text-muted)]">Are you sure?</span>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
                className="rounded-lg bg-error px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button type="button" onClick={() => setDeleteConfirm(false)} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Simplified hotel UI ───────────────────────────────────────────────────

  function SimplifiedHotelUI({
    chainConfig,
    hotelExisting,
    propertyId,
    orgId,
    onSaved,
    onDeleted,
  }: {
    chainConfig: ExternalIBEConfigRow
    hotelExisting: ExternalIBEConfigRow | null
    propertyId: number
    orgId: number
    onSaved: () => void
    onDeleted: () => void
  }) {
    const qc = useQueryClient()
    const [idResult, setIdResult] = useState<ExternalIBEAnalyzeResponse | null>(null)
    const [mcpEnabled, setMcpEnabled] = useState(hotelExisting?.mcpEnabled ?? chainConfig.mcpEnabled)
    const [affiliateEnabled, setAffiliateEnabled] = useState(hotelExisting?.affiliateEnabled ?? chainConfig.affiliateEnabled)
    const [widgetEnabled, setWidgetEnabled] = useState(hotelExisting?.widgetEnabled ?? chainConfig.widgetEnabled)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [searchResult, setSearchResult] = useState<ExternalIBEAnalyzeResponse | null>(null)
    const [bookingResult, setBookingResult] = useState<ExternalIBEAnalyzeResponse | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState(false)

    const detectedId = idResult?.mapping.find(m => m.concept === 'externalHotelId')?.exampleValue

    const saveMutation = useMutation({
      mutationFn: () => {
        const data: Record<string, unknown> = {
          mcpEnabled,
          affiliateEnabled,
          widgetEnabled,
        }
        if (detectedId) data['externalHotelId'] = detectedId
        if (searchResult) data['searchTemplate'] = searchResult.template
        if (bookingResult) data['bookingTemplate'] = bookingResult.template
        return apiClient.upsertExternalIBEConfig(data, { propertyId })
      },
      onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); onSaved() },
    })

    const deleteMutation = useMutation({
      mutationFn: () => apiClient.deleteExternalIBEConfig({ propertyId }),
      onSuccess: () => { void qc.invalidateQueries({ queryKey: ['external-ibe'] }); onDeleted() },
    })

    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
          <p className="text-xs font-medium text-[var(--color-text-muted)]">Templates inherited from chain configuration</p>
          <div className="space-y-1">
            <p className="text-xs text-[var(--color-text-muted)]">Search</p>
            <p className="font-mono text-sm text-[var(--color-text)] break-all">{chainConfig.searchTemplate ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-[var(--color-text-muted)]">Booking</p>
            <p className="font-mono text-sm text-[var(--color-text)] break-all">{chainConfig.bookingTemplate ?? '—'}</p>
          </div>
        </div>

        <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Your external hotel ID</h3>
          {hotelExisting?.externalHotelId && !detectedId && (
            <p className="text-sm text-[var(--color-text)]">
              Current ID: <span className="font-mono font-medium">{hotelExisting.externalHotelId}</span>
            </p>
          )}
          <AnalysisSection
            label="Paste one sample URL from your external booking page to extract this hotel's ID"
            type="booking"
            singleUrl
            propertyId={propertyId}
            orgId={orgId}
            result={idResult}
            onResult={setIdResult}
          />
          {detectedId && (
            <p className="text-sm text-[var(--color-text)]">
              Your external hotel ID: <span className="font-mono font-medium text-[var(--color-primary)]">{detectedId}</span>
            </p>
          )}
        </section>

        <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Channel toggles</h3>
          <ChannelToggles
            mcp={mcpEnabled}
            affiliate={affiliateEnabled}
            widget={widgetEnabled}
            disabled={false}
            onChange={(k, v) => {
              if (k === 'mcpEnabled') setMcpEnabled(v)
              else if (k === 'affiliateEnabled') setAffiliateEnabled(v)
              else setWidgetEnabled(v)
            }}
          />
        </section>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {hotelExisting && !deleteConfirm && (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="rounded-lg border border-error/30 px-4 py-2 text-sm font-medium text-error hover:bg-error/5 transition-colors"
            >
              Delete override
            </button>
          )}
          {deleteConfirm && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-text-muted)]">Revert to chain config?</span>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
                className="rounded-lg bg-error px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Yes, revert'}
              </button>
              <button type="button" onClick={() => setDeleteConfirm(false)} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                Cancel
              </button>
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] flex items-center gap-1"
          >
            <svg className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Advanced: override templates
          </button>
          {showAdvanced && (
            <div className="mt-4 space-y-4">
              <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Search page URL override</h3>
                <AnalysisSection
                  label="Paste sample search page URLs"
                  type="search"
                  propertyId={propertyId}
                  result={searchResult}
                  onResult={setSearchResult}
                />
              </section>
              <section className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Booking page URL override</h3>
                <AnalysisSection
                  label="Paste sample booking page URLs"
                  type="booking"
                  propertyId={propertyId}
                  result={bookingResult}
                  onResult={setBookingResult}
                />
              </section>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Main page ─────────────────────────────────────────────────────────────

  export default function ExternalIBEPage() {
    const { admin } = useAdminAuth()
    const { propertyId: contextPropertyId, orgId: contextOrgId } = useAdminProperty()
    const qc = useQueryClient()
    const [savedBanner, setSavedBanner] = useState(false)

    const isHotelLevel = contextPropertyId !== null
    const isSuper = admin?.role === 'super'

    const propertyScope = isHotelLevel ? { propertyId: contextPropertyId! } : undefined
    const orgScope = isSuper
      ? (contextOrgId !== null ? { orgId: contextOrgId! } : undefined)
      : (admin?.organizationId ? { orgId: admin.organizationId } : undefined)

    const hotelQuery = useQuery({
      queryKey: ['external-ibe', 'hotel', contextPropertyId],
      queryFn: () => apiClient.getExternalIBEConfig(propertyScope!),
      enabled: isHotelLevel,
    })

    const orgQuery = useQuery({
      queryKey: ['external-ibe', 'org', orgScope?.orgId ?? contextOrgId],
      queryFn: () => apiClient.getExternalIBEConfig(orgScope!),
      enabled: !!orgScope,
    })

    if (!admin) return null

    const isLoading = (isHotelLevel ? hotelQuery.isLoading : false) || orgQuery.isLoading

    if (isLoading) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-8">
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--color-border)]" />
            ))}
          </div>
        </main>
      )
    }

    const chainConfig = orgQuery.data ?? null
    const hotelConfig = hotelQuery.data ?? null

    const showSimplified = isHotelLevel && chainConfig !== null
    const scope = isHotelLevel ? propertyScope! : orgScope!

    if (!scope) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-8">
          <p className="text-sm text-[var(--color-text-muted)]">Select a property or organisation to configure.</p>
        </main>
      )
    }

    function handleSaved() {
      setSavedBanner(true)
      setTimeout(() => setSavedBanner(false), 3000)
    }

    function handleDeleted() {
      void qc.invalidateQueries({ queryKey: ['external-ibe'] })
    }

    return (
      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">External IBE</h1>
          {savedBanner && (
            <span className="text-sm text-success font-medium">Saved</span>
          )}
        </div>

        {isHotelLevel && !chainConfig && (
          <p className="text-sm text-[var(--color-text-muted)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            No chain configuration found. Configure templates directly for this property.
          </p>
        )}

        {isHotelLevel && chainConfig && hotelConfig && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">Hotel-level override active</p>
            <button
              type="button"
              onClick={() => {
                void apiClient.deleteExternalIBEConfig(scope).then(() => {
                  void qc.invalidateQueries({ queryKey: ['external-ibe'] })
                })
              }}
              className="text-sm font-medium text-amber-700 hover:text-amber-900 underline"
            >
              Delete override
            </button>
          </div>
        )}

        {isHotelLevel && chainConfig && !hotelConfig && (
          <p className="text-sm text-[var(--color-text-muted)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            Using chain configuration
          </p>
        )}

        {showSimplified ? (
          <SimplifiedHotelUI
            chainConfig={chainConfig!}
            hotelExisting={hotelConfig}
            propertyId={contextPropertyId!}
            orgId={orgScope?.orgId ?? admin.organizationId ?? 0}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        ) : (
          <FullTemplateUI
            existing={isHotelLevel ? hotelConfig : chainConfig}
            scope={scope}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      </main>
    )
  }
  ```

- [ ] **Step 2: Build the web app to verify TypeScript compiles**

  ```bash
  cd apps/web && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/src/app/admin/config/external-ibe/page.tsx
  git commit -m "feat: add external IBE admin UI page"
  ```

---

## Task 8: Nav Item

**Files:**
- Modify: `apps/web/src/app/admin/_layout-client.tsx`

- [ ] **Step 1: Add the nav item**

  In `apps/web/src/app/admin/_layout-client.tsx`, find the `Configuration` section items array (around line 98–115). Add one entry after the `Events` line:

  ```ts
  { href: '/admin/config/external-ibe', label: 'External IBE', sellerOnly: true },
  ```

  The Configuration section should look like:

  ```ts
  {
    title: 'Configuration',
    items: [
      { href: '/admin/config/properties', label: 'Properties', sellerOnly: true },
      { href: '/admin/config/org', label: 'Organization', minRole: 'admin', buyerAccessible: true },
      { href: '/admin/config/domain', label: 'Domain', sellerOnly: true },
      { href: '/admin/config/offers', label: 'Offers', sellerOnly: true },
      { href: '/admin/config/models', label: 'Channels', sellerOnly: true },
      { href: '/admin/config/pixels', label: 'Tracking & Analytics', sellerOnly: true },
      { href: '/admin/payments/gateway', label: 'Payment Gateway', minRole: 'admin', sellerOnly: true },
      { href: '/admin/communication/emails', label: 'Emails', sellerOnly: true },
      { href: '/admin/communication/whatsapp', label: 'WhatsApp', sellerOnly: true },
      { href: '/admin/communication/sms', label: 'SMS', sellerOnly: true },
      { href: '/admin/config/maps', label: 'Maps', sellerOnly: true },
      { href: '/admin/config/data-provider', label: 'Data Provider', sellerOnly: true },
      { href: '/admin/config/weather', label: 'Weather', sellerOnly: true },
      { href: '/admin/config/events', label: 'Events', sellerOnly: true },
      { href: '/admin/config/external-ibe', label: 'External IBE', sellerOnly: true },
      { href: '/admin/config/manual', label: 'User Manual', minRole: 'super' },
    ],
  },
  ```

- [ ] **Step 2: Build to verify**

  ```bash
  cd apps/web && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/src/app/admin/_layout-client.tsx
  git commit -m "feat: add External IBE nav item to admin sidebar"
  ```

---

## Task 9: MCP create_booking_link Integration

**Files:**
- Modify: `apps/api/src/routes/mcp.route.ts`

When a property has an external IBE configured with `mcpEnabled: true` and a `bookingTemplate`, the `create_booking_link` MCP tool should return the external URL instead of the local one.

- [ ] **Step 1: Add the import to `mcp.route.ts`**

  At the top of `apps/api/src/routes/mcp.route.ts`, add:

  ```ts
  import { getEffectiveExternalIBEConfig, buildExternalUrl } from '../services/external-ibe.service.js'
  ```

- [ ] **Step 2: Update the `create_booking_link` handler**

  Find the `create_booking_link` block in `mcp.route.ts` (around line 812). It currently reads:

  ```ts
  if (toolName === 'create_booking_link') {
    if (!pid) return mcpError('propertyId is required')
    const checkIn  = args['checkIn']  as string | undefined
    const checkOut = args['checkOut'] as string | undefined
    if (!checkIn || !checkOut) return mcpError('checkIn and checkOut are required')
    const adults     = (args['adults']     as number | undefined) ?? 2
    const children   = (args['children']   as number | undefined) ?? 0
    const roomId     = args['roomId']     as number | undefined
    const ratePlanId = args['ratePlanId'] as number | undefined
    const searchId   = args['searchId']   as string | undefined

    const params = new URLSearchParams({
      hotelId: String(pid), checkIn, checkOut,
      'rooms[0][adults]': String(adults),
      ...(children > 0 ? { 'rooms[0][children]': String(children) } : {}),
    })
    if (roomId)     params.set('roomId',     String(roomId))
    if (ratePlanId) params.set('ratePlanId', String(ratePlanId))
    if (searchId)   params.set('searchId',   searchId)

    const url = `${env.WEB_BASE_URL}/booking?${params.toString()}`
    return mcpResult(JSON.stringify({ bookingUrl: url, message: 'Direct the guest to this URL to complete the booking.' }))
  }
  ```

  Replace it with:

  ```ts
  if (toolName === 'create_booking_link') {
    if (!pid) return mcpError('propertyId is required')
    const checkIn  = args['checkIn']  as string | undefined
    const checkOut = args['checkOut'] as string | undefined
    if (!checkIn || !checkOut) return mcpError('checkIn and checkOut are required')
    const adults     = (args['adults']     as number | undefined) ?? 2
    const children   = (args['children']   as number | undefined) ?? 0
    const roomId     = args['roomId']     as number | undefined
    const ratePlanId = args['ratePlanId'] as number | undefined
    const searchId   = args['searchId']   as string | undefined

    // Check for external IBE override
    const externalConfig = await getEffectiveExternalIBEConfig(pid)
    if (externalConfig?.mcpEnabled && externalConfig.bookingTemplate) {
      const url = buildExternalUrl(externalConfig.bookingTemplate, {
        externalHotelId: externalConfig.externalHotelId ?? null,
        hotelId: pid,
        checkIn: checkIn ?? null,
        checkOut: checkOut ?? null,
        adults,
        rooms: 1,
        roomId: roomId ?? null,
        ratePlanId: ratePlanId ?? null,
        nationality: null,
        currency: null,
      })
      return mcpResult(JSON.stringify({ bookingUrl: url, message: 'Direct the guest to this URL to complete the booking.' }))
    }

    const params = new URLSearchParams({
      hotelId: String(pid), checkIn, checkOut,
      'rooms[0][adults]': String(adults),
      ...(children > 0 ? { 'rooms[0][children]': String(children) } : {}),
    })
    if (roomId)     params.set('roomId',     String(roomId))
    if (ratePlanId) params.set('ratePlanId', String(ratePlanId))
    if (searchId)   params.set('searchId',   searchId)

    const url = `${env.WEB_BASE_URL}/booking?${params.toString()}`
    return mcpResult(JSON.stringify({ bookingUrl: url, message: 'Direct the guest to this URL to complete the booking.' }))
  }
  ```

- [ ] **Step 3: Run all API tests**

  ```bash
  cd apps/api && npm test
  ```
  Expected: all tests PASS (no regressions).

- [ ] **Step 4: Commit**

  ```bash
  git add apps/api/src/routes/mcp.route.ts
  git commit -m "feat: use external IBE URL in MCP create_booking_link when configured"
  ```

---

## Task 10: Widget Integration (search_availability → external booking URLs)

**Files:**
- Modify: `apps/api/src/routes/mcp.route.ts`

The MCP room results widget (`WIDGET_HTML`) builds booking URLs in inline client-side JS. When the property has an external IBE configured with `mcpEnabled: true`, the widget should use the external booking template instead of the local URL.

Two changes needed: (1) pass external config into `_meta` in the `search_availability` handler, (2) update the inline `bookingUrl()` JS function in `WIDGET_HTML` to use it.

- [ ] **Step 1: Update `search_availability` handler to include external config in `_meta`**

  Find the `search_availability` block (around line 772–785). Replace the return statement:

  ```ts
  // Add before the return, after structuredContent is defined:
  const externalConfig = await getEffectiveExternalIBEConfig(pid)
  const externalMeta = externalConfig?.mcpEnabled && externalConfig.bookingTemplate
    ? {
        externalBookingTemplate: externalConfig.bookingTemplate,
        externalHotelId: externalConfig.externalHotelId ?? null,
        externalMcpEnabled: true,
      }
    : {}

  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
    _meta: {
      ui: { resourceUri: WIDGET_URI },
      ...structuredContent,
      propertyId: pid,
      checkIn,
      checkOut,
      adults,
      webBaseUrl: env.WEB_BASE_URL,
      ...externalMeta,
    },
  }
  ```

  The full updated block (replacing lines 772–785):

  ```ts
  const structuredContent = { searchId: results.searchId, rooms: summary, currency: results.currency }
  const externalConfig = await getEffectiveExternalIBEConfig(pid)
  const externalMeta = externalConfig?.mcpEnabled && externalConfig.bookingTemplate
    ? {
        externalBookingTemplate: externalConfig.bookingTemplate,
        externalHotelId: externalConfig.externalHotelId ?? null,
        externalMcpEnabled: true,
      }
    : {}
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
    _meta: {
      ui: { resourceUri: WIDGET_URI },
      ...structuredContent,
      propertyId: pid,
      checkIn,
      checkOut,
      adults,
      webBaseUrl: env.WEB_BASE_URL,
      ...externalMeta,
    },
  }
  ```

- [ ] **Step 2: Update the `bookingUrl()` function in `WIDGET_HTML`**

  In `WIDGET_HTML`, find this function (around line 175–187):

  ```js
  function bookingUrl(room, rate, meta) {
    if (!meta.webBaseUrl || !meta.propertyId) return null
    const p = new URLSearchParams({
      hotelId:           String(meta.propertyId),
      checkIn:           meta.checkIn  ?? '',
      checkOut:          meta.checkOut ?? '',
      'rooms[0][adults]': String(meta.adults ?? 2),
      roomId:            String(room.roomId),
      ratePlanId:        String(rate.ratePlanId),
      searchId:          meta.searchId ?? '',
    })
    return meta.webBaseUrl + '/booking?' + p
  }
  ```

  Replace it with:

  ```js
  function bookingUrl(room, rate, meta) {
    if (meta.externalMcpEnabled && meta.externalBookingTemplate) {
      var tpl = meta.externalBookingTemplate
      var vals = {
        externalHotelId: meta.externalHotelId || null,
        hotelId: String(meta.propertyId || ''),
        checkIn: meta.checkIn || null,
        checkOut: meta.checkOut || null,
        adults: String(meta.adults || 2),
        rooms: '1',
        roomId: String(room.roomId),
        ratePlanId: String(rate.ratePlanId),
        nationality: null,
        currency: null,
      }
      for (var k in vals) {
        if (vals[k] !== null) tpl = tpl.split('{' + k + '}').join(vals[k])
      }
      var qi = tpl.indexOf('?')
      if (qi !== -1) {
        var base = tpl.slice(0, qi)
        var kept = tpl.slice(qi + 1).split('&').filter(function(p) { return !/\{[^}]+\}/.test(p) })
        return kept.length > 0 ? base + '?' + kept.join('&') : base
      }
      return tpl
    }
    if (!meta.webBaseUrl || !meta.propertyId) return null
    const p = new URLSearchParams({
      hotelId:           String(meta.propertyId),
      checkIn:           meta.checkIn  ?? '',
      checkOut:          meta.checkOut ?? '',
      'rooms[0][adults]': String(meta.adults ?? 2),
      roomId:            String(room.roomId),
      ratePlanId:        String(rate.ratePlanId),
      searchId:          meta.searchId ?? '',
    })
    return meta.webBaseUrl + '/booking?' + p
  }
  ```

- [ ] **Step 3: Run all API tests**

  ```bash
  cd apps/api && npm test
  ```
  Expected: all tests PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/api/src/routes/mcp.route.ts
  git commit -m "feat: use external IBE URL in MCP widget when configured"
  ```

> **Note — Affiliate link builder:** The spec lists `apps/api/src/services/affiliate.service.ts` as an integration point for `bookingTemplate`. The current affiliate service is CRUD-only and does not build booking URLs. No changes are needed here until the affiliate link-building feature is implemented.

---

## Verification Checklist

After all tasks are complete:

- [ ] `cd apps/api && npm test` — all tests pass
- [ ] `cd apps/web && npx tsc --noEmit` — no TypeScript errors
- [ ] Navigate to Admin → Configuration → External IBE — page loads
- [ ] At chain level: paste a sample URL, click Analyze, see mapping table
- [ ] At hotel level with chain config: simplified view shows inherited templates + "Extract ID" flow
- [ ] At standalone hotel level: full template UI shown (no inheritance banner)
- [ ] Save config → refresh page → config persists
- [ ] Delete config → page reverts to empty state
- [ ] MCP `create_booking_link` — when property has external IBE config with `mcpEnabled: true`, returned URL uses the configured template
