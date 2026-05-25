# AI-Generated User Manual Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a role-aware HTML user manual from live codebase source files via Claude, served through an authenticated API route, with a `?` help icon in the admin header.

**Architecture:** A new `manual-generate.service.ts` loops through pre-defined sections (each with a list of source files), calls Claude for each, and saves a JSON blob of `{ generatedAt, sections[] }`. A `GET /admin/manual` route reads that JSON, filters by the caller's role, converts markdown to HTML, and returns a styled HTML page. The existing `POST manual/generate` SSE route streams progress during generation.

**Tech Stack:** Fastify SSE (existing pattern), `marked` (new dep for markdown→HTML), Anthropic API (via existing system AI config pattern), Next.js admin UI (existing SSE streaming pattern from language/translations page).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/services/manual-generate.service.ts` | **Create** | Section config, file reading, Claude calls, JSON storage |
| `apps/api/src/routes/manual.route.ts` | **Modify** | Add generate (SSE) + serve (HTML) routes |
| `apps/web/src/app/admin/config/manual/page.tsx` | **Modify** | Generate button, SSE progress, downloads panel |
| `apps/web/src/app/admin/_layout-client.tsx` | **Modify** | Replace PDF download icon with `?` help icon |

---

## Task 1: Add `marked` dependency

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install marked**

```bash
cd /home/nir/ibe && pnpm add marked --filter @ibe/api
```

Expected: `marked` appears in `apps/api/package.json` dependencies.

- [ ] **Step 2: Verify import works**

```bash
cd /home/nir/ibe/apps/api && node -e "import('marked').then(m => console.log('ok', Object.keys(m)))"
```

Expected output includes `parse`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add marked for markdown→HTML conversion"
```

---

## Task 2: Create `manual-generate.service.ts` — section config + file reading

**Files:**
- Create: `apps/api/src/services/manual-generate.service.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/__tests__/manual-generate.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MANUAL_SECTIONS, readSectionFiles, filterSectionsByRole } from '../manual-generate.service.js'

describe('MANUAL_SECTIONS', () => {
  it('has no duplicate ids', () => {
    const ids = MANUAL_SECTIONS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all audiences are valid', () => {
    for (const s of MANUAL_SECTIONS) {
      expect(['hotel', 'super', 'both']).toContain(s.audience)
    }
  })
})

describe('filterSectionsByRole', () => {
  const sections = [
    { id: 'a', title: 'A', audience: 'hotel' as const, markdown: '' },
    { id: 'b', title: 'B', audience: 'super' as const, markdown: '' },
    { id: 'c', title: 'C', audience: 'both' as const, markdown: '' },
  ]

  it('hotel role sees hotel + both', () => {
    const result = filterSectionsByRole(sections, 'hotel')
    expect(result.map(s => s.id)).toEqual(['a', 'c'])
  })

  it('super role sees all', () => {
    const result = filterSectionsByRole(sections, 'super')
    expect(result.map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('admin role sees hotel + both', () => {
    const result = filterSectionsByRole(sections, 'admin')
    expect(result.map(s => s.id)).toEqual(['a', 'c'])
  })
})

describe('readSectionFiles', () => {
  it('returns empty string for non-existent file without throwing', async () => {
    const result = await readSectionFiles(['/nonexistent/file.tsx'])
    expect(result).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/nir/ibe/apps/api && npx vitest run src/services/__tests__/manual-generate.service.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the service file**

Create `apps/api/src/services/manual-generate.service.ts`:

```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { parse as parseMarkdown } from 'marked'
import { prisma } from '../db/prisma.js'
import { decryptApiKey } from './ai-config.service.js'
import { logger } from '../utils/logger.js'
import { env } from '../config/env.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ManualSectionAudience = 'hotel' | 'super' | 'both'

export interface ManualSectionDef {
  id: string
  title: string
  audience: ManualSectionAudience
  files: string[]
}

export interface ManualSection {
  id: string
  title: string
  audience: ManualSectionAudience
  markdown: string
}

export interface ManualData {
  generatedAt: string
  sections: ManualSection[]
}

export type ManualGenerateEvent =
  | { type: 'section:start'; title: string }
  | { type: 'section:done'; title: string }
  | { type: 'error'; title: string; message: string }
  | { type: 'complete' }

// ── Storage ───────────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(process.cwd(), '../..')
const MANUAL_JSON_PATH = env.MANUAL_JSON_PATH
  ?? resolve(process.cwd(), 'data/HG-IBE-Admin-Manual.json')

export function loadManualData(): ManualData | null {
  if (!existsSync(MANUAL_JSON_PATH)) return null
  try {
    return JSON.parse(readFileSync(MANUAL_JSON_PATH, 'utf-8')) as ManualData
  } catch {
    return null
  }
}

function saveManualData(data: ManualData): void {
  mkdirSync(dirname(MANUAL_JSON_PATH), { recursive: true })
  writeFileSync(MANUAL_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

// ── Section Definitions ───────────────────────────────────────────────────────

export const MANUAL_SECTIONS: ManualSectionDef[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/dashboard/page.tsx',
      'apps/api/src/routes/dashboard.route.ts',
    ],
  },
  {
    id: 'bookings',
    title: 'Bookings',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/bookings/page.tsx',
      'apps/web/src/app/admin/bookings/booked-today/page.tsx',
      'apps/api/src/routes/admin-bookings.route.ts',
    ],
  },
  {
    id: 'design-chain',
    title: 'Design — Chain',
    audience: 'hotel',
    files: [
      'apps/web/src/app/admin/design/chain/page.tsx',
    ],
  },
  {
    id: 'design-hotel',
    title: 'Design — Hotel',
    audience: 'hotel',
    files: [
      'apps/web/src/app/admin/design/homepage/page.tsx',
      'apps/web/src/app/admin/design/search-bar/page.tsx',
    ],
  },
  {
    id: 'config-properties',
    title: 'Config: Properties',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/config/properties/page.tsx',
    ],
  },
  {
    id: 'config-offers',
    title: 'Config: Offers & Pricing',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/config/offers/page.tsx',
      'apps/web/src/app/admin/config/misc/pricing/page.tsx',
    ],
  },
  {
    id: 'config-groups',
    title: 'Config: Groups',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/config/groups/page.tsx',
    ],
  },
  {
    id: 'config-ai',
    title: 'Config: AI & Channels',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/config/ai/page.tsx',
      'apps/web/src/app/admin/config/ai/channels/page.tsx',
    ],
  },
  {
    id: 'communication',
    title: 'Communication',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/communication/emails/page.tsx',
      'apps/web/src/app/admin/communication/whatsapp/page.tsx',
      'apps/web/src/app/admin/communication/sms/page.tsx',
    ],
  },
  {
    id: 'config-weather-maps',
    title: 'Config: Weather & Maps',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/config/weather/page.tsx',
      'apps/web/src/app/admin/config/maps/page.tsx',
    ],
  },
  {
    id: 'config-events',
    title: 'Config: Events',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/config/events/page.tsx',
    ],
  },
  {
    id: 'config-marketing',
    title: 'Config: Marketing',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/config/marketing/page.tsx',
    ],
  },
  {
    id: 'conversion',
    title: 'Conversion',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/conversion/onsite/page.tsx',
      'apps/web/src/app/admin/conversion/price-comparison/page.tsx',
      'apps/web/src/app/admin/conversion/promo-codes/page.tsx',
    ],
  },
  {
    id: 'affiliates',
    title: 'Affiliates',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/affiliates/page.tsx',
    ],
  },
  {
    id: 'campaigns',
    title: 'Campaigns',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/campaigns/page.tsx',
    ],
  },
  {
    id: 'clusters',
    title: 'Clusters',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/clusters/page.tsx',
    ],
  },
  {
    id: 'b2b',
    title: 'B2B Access',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/b2b/page.tsx',
    ],
  },
  {
    id: 'users-guests',
    title: 'Users & Guests',
    audience: 'both',
    files: [
      'apps/web/src/app/admin/config/org/page.tsx',
    ],
  },
  // ── Super-only ──────────────────────────────────────────────────────────────
  {
    id: 'super-organizations',
    title: 'Organizations (Super Admin)',
    audience: 'super',
    files: [
      'apps/web/src/app/admin/config/properties/page.tsx',
      'apps/api/src/routes/admin.route.ts',
    ],
  },
  {
    id: 'super-domain',
    title: 'Domain & Deployment',
    audience: 'super',
    files: [
      'apps/web/src/app/admin/config/domain/page.tsx',
      'apps/web/src/app/admin/config/hg-sync/page.tsx',
    ],
  },
  {
    id: 'super-test-bookings',
    title: 'Test Bookings',
    audience: 'super',
    files: [
      'apps/web/src/app/admin/config/test-bookings/page.tsx',
    ],
  },
  {
    id: 'super-mcp',
    title: 'MCP & Integrations',
    audience: 'super',
    files: [
      'apps/web/src/app/admin/ai/mcp/page.tsx',
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_FILE_CHARS = 6000

export async function readSectionFiles(files: string[]): Promise<string> {
  const parts: string[] = []
  for (const relPath of files) {
    const absPath = resolve(REPO_ROOT, relPath)
    try {
      const content = readFileSync(absPath, 'utf-8')
      const truncated = content.length > MAX_FILE_CHARS
        ? content.slice(0, MAX_FILE_CHARS) + '\n[... truncated]'
        : content
      parts.push(`\n\n--- FILE: ${relPath} ---\n${truncated}`)
    } catch {
      // file missing or unreadable — skip silently
    }
  }
  return parts.join('')
}

export function filterSectionsByRole(
  sections: ManualSection[],
  role: string,
): ManualSection[] {
  if (role === 'super') return sections
  return sections.filter(s => s.audience === 'hotel' || s.audience === 'both')
}

// ── Claude call ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are writing a user manual for HG-IBE, a hotel booking engine admin panel used by hotel and chain operators. Write clear, practical, step-by-step documentation. Use markdown with headers (##, ###), bullet points, and short paragraphs. No fluff, no repetition. Focus on what the user needs to do and why.`

async function callClaude(sectionTitle: string, audience: string, filesContent: string): Promise<string> {
  const systemRow = await prisma.systemAIConfig.findFirst()
  if (!systemRow?.apiKey || !systemRow.enabled) {
    throw new Error('No system AI config found. Configure AI in the admin panel first.')
  }

  const apiKey = decryptApiKey(systemRow.apiKey)
  const model = systemRow.model ?? 'claude-sonnet-4-6'

  const audienceDesc = audience === 'super'
    ? 'super administrators managing the platform'
    : audience === 'hotel'
      ? 'hotel and chain administrators managing their properties'
      : 'hotel, chain, and super administrators'

  const userPrompt = `Section: ${sectionTitle}
Audience: ${audienceDesc}

Below are the relevant source files for this section. Extract the meaningful UI elements (field labels, toggle descriptions, hints, section headers, available options) and write a clear manual section covering: what this section does, the key settings and what they control, and common tasks a user would perform here.
${filesContent}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json() as { content: Array<{ type: string; text?: string }> }
  const textBlock = data.content.find(b => b.type === 'text')
  return textBlock?.text ?? ''
}

// ── Main generate function ────────────────────────────────────────────────────

export async function generateManual(emit: (event: ManualGenerateEvent) => void): Promise<void> {
  const sections: ManualSection[] = []

  for (const def of MANUAL_SECTIONS) {
    emit({ type: 'section:start', title: def.title })
    try {
      const filesContent = await readSectionFiles(def.files)
      const markdown = await callClaude(def.title, def.audience, filesContent)
      sections.push({ id: def.id, title: def.title, audience: def.audience, markdown })
      emit({ type: 'section:done', title: def.title })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ section: def.id, err }, '[Manual] Section generation failed')
      emit({ type: 'error', title: def.title, message })
      sections.push({ id: def.id, title: def.title, audience: def.audience, markdown: `*Generation failed for this section: ${message}*` })
    }
  }

  saveManualData({ generatedAt: new Date().toISOString(), sections })
  emit({ type: 'complete' })
}

// ── HTML rendering ────────────────────────────────────────────────────────────

export function renderManualHtml(sections: ManualSection[], title: string): string {
  const tocItems = sections
    .map(s => `<li><a href="#${s.id}">${s.title}</a></li>`)
    .join('\n')

  const bodyItems = sections.map(s => {
    const html = parseMarkdown(s.markdown) as string
    return `<section id="${s.id}" class="section">\n${html}\n</section>`
  }).join('\n\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a2e; background: #f8f9fb; }
  .layout { display: flex; min-height: 100vh; }
  .sidebar { width: 260px; min-width: 260px; background: #fff; border-right: 1px solid #e2e8f0; padding: 24px 16px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  .sidebar h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin-bottom: 12px; }
  .sidebar ol { list-style: none; padding: 0; }
  .sidebar li { margin-bottom: 4px; }
  .sidebar a { display: block; padding: 4px 8px; border-radius: 6px; font-size: 13px; color: #475569; text-decoration: none; transition: background .15s, color .15s; }
  .sidebar a:hover { background: #f1f5f9; color: #1e293b; }
  .content { flex: 1; padding: 48px 56px; max-width: 860px; }
  .content h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #0f172a; }
  .meta { font-size: 13px; color: #94a3b8; margin-bottom: 40px; }
  .section { margin-bottom: 48px; padding-bottom: 48px; border-bottom: 1px solid #e2e8f0; }
  .section:last-child { border-bottom: none; }
  .section h2 { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
  .section h3 { font-size: 16px; font-weight: 600; color: #1e293b; margin: 20px 0 8px; }
  .section p { margin-bottom: 12px; color: #334155; }
  .section ul, .section ol { padding-left: 20px; margin-bottom: 12px; }
  .section li { margin-bottom: 4px; color: #334155; }
  .section strong { color: #0f172a; }
  .section code { font-family: monospace; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-size: 13px; }
  @media print { .sidebar { display: none; } .content { padding: 24px; } }
</style>
</head>
<body>
<div class="layout">
  <nav class="sidebar">
    <h2>Contents</h2>
    <ol>${tocItems}</ol>
  </nav>
  <main class="content">
    <h1>${title}</h1>
    <p class="meta">Generated ${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
    ${bodyItems}
  </main>
</div>
</body>
</html>`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/nir/ibe/apps/api && npx vitest run src/services/__tests__/manual-generate.service.test.ts 2>&1 | tail -15
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Type-check**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | grep manual | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/manual-generate.service.ts apps/api/src/services/__tests__/manual-generate.service.test.ts
git commit -m "feat(manual): add manual-generate service with sections config, Claude calls, HTML rendering"
```

---

## Task 3: Update `manual.route.ts` — add generate (SSE) + serve routes

**Files:**
- Modify: `apps/api/src/routes/manual.route.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import type { FastifyInstance } from 'fastify'
import { createWriteStream, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { env } from '../config/env.js'
import {
  generateManual,
  loadManualData,
  filterSectionsByRole,
  renderManualHtml,
} from '../services/manual-generate.service.js'

const MANUAL_PATH = env.MANUAL_FILE_PATH
  ?? resolve(process.cwd(), '../../apps/web/public/HG-IBE-Admin-User-Manual.pdf')

export async function manualRoutes(fastify: FastifyInstance) {
  // ── Existing: PDF info + upload ─────────────────────────────────────────────

  fastify.get('/admin/super/manual-info', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    try {
      const stat = statSync(MANUAL_PATH)
      return reply.send({ exists: true, size: stat.size, updatedAt: stat.mtime.toISOString() })
    } catch {
      return reply.send({ exists: false, size: 0, updatedAt: null })
    }
  })

  fastify.post('/admin/super/manual', {
    config: { rawBody: false },
    onRequest: [],
  }, async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const data = await request.file({ limits: { fileSize: 30 * 1024 * 1024 } })
    if (!data) return reply.status(400).send({ error: 'No file provided' })
    const ext = data.filename.split('.').pop()?.toLowerCase()
    if (ext !== 'pdf') return reply.status(400).send({ error: 'Only PDF files are accepted' })
    await pipeline(data.file, createWriteStream(MANUAL_PATH))
    fastify.log.info(`Manual updated by super admin ${request.admin.adminId}`)
    return reply.send({ ok: true })
  })

  // ── New: AI generation (SSE) ────────────────────────────────────────────────

  fastify.post('/admin/super/manual/generate', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders()

    try {
      await generateManual((event) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      })
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', title: 'Fatal', message: err instanceof Error ? err.message : 'Generation failed' })}\n\n`)
    } finally {
      reply.raw.end()
    }
  })

  // ── New: Serve manual HTML (role-filtered) ──────────────────────────────────

  fastify.get('/admin/manual', async (request, reply) => {
    const { download, audience } = request.query as { download?: string; audience?: string }

    const data = loadManualData()
    if (!data) {
      void reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(`<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px;color:#334155">
        <h2>Manual not yet generated</h2>
        <p>A super admin can generate it from <strong>Config → Manual</strong>.</p>
      </body></html>`)
    }

    // Determine audience to render
    const role = request.admin.role
    let sectionsToRender = filterSectionsByRole(data.sections, role)

    // Super can request hotel-only download
    if (role === 'super' && audience === 'hotel') {
      sectionsToRender = filterSectionsByRole(data.sections, 'hotel')
    }

    const isFullManual = role === 'super' && audience !== 'hotel'
    const title = isFullManual ? 'HG-IBE Admin Manual — Full' : 'HG-IBE Admin Manual'
    const html = renderManualHtml(sectionsToRender, title)

    void reply.header('Content-Type', 'text/html; charset=utf-8')

    if (download === 'true') {
      const filename = audience === 'hotel'
        ? 'HG-IBE-Admin-Manual-Hotel.html'
        : 'HG-IBE-Admin-Manual-Full.html'
      void reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    }

    return reply.send(html)
  })

  // ── New: Manual metadata (generated-at timestamp) ───────────────────────────

  fastify.get('/admin/super/manual-ai-info', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const data = loadManualData()
    return reply.send({ exists: !!data, generatedAt: data?.generatedAt ?? null, sectionCount: data?.sections.length ?? 0 })
  })
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | grep -E "manual|error TS" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/manual.route.ts
git commit -m "feat(manual): add SSE generate route + role-filtered HTML serve route"
```

---

## Task 4: Add `MANUAL_JSON_PATH` to env config

**Files:**
- Modify: `apps/api/src/config/env.ts`

- [ ] **Step 1: Check current env shape**

```bash
grep -n "MANUAL_FILE_PATH\|MANUAL_JSON" /home/nir/ibe/apps/api/src/config/env.ts
```

- [ ] **Step 2: Add MANUAL_JSON_PATH to env**

In `apps/api/src/config/env.ts`, find the section where `MANUAL_FILE_PATH` is defined and add alongside it:

```ts
MANUAL_JSON_PATH: process.env['MANUAL_JSON_PATH'],
```

- [ ] **Step 3: Type-check**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | grep "env\|MANUAL" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/env.ts
git commit -m "chore(api): add MANUAL_JSON_PATH to env config"
```

---

## Task 5: Update manual admin page — Generate button + SSE progress + downloads

**Files:**
- Modify: `apps/web/src/app/admin/config/manual/page.tsx`

- [ ] **Step 1: Add `getManualAiInfo` to api-client.ts**

In `apps/web/src/lib/api-client.ts`, find the `getManualInfo` method and add below it:

```ts
getManualAiInfo(): Promise<{ exists: boolean; generatedAt: string | null; sectionCount: number }> {
  return apiRequest('/api/v1/admin/super/manual-ai-info')
},
```

- [ ] **Step 2: Replace manual page**

Replace the entire contents of `apps/web/src/app/admin/config/manual/page.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiClientError } from '@/lib/api-client'

type GenerateEvent =
  | { type: 'section:start'; title: string }
  | { type: 'section:done'; title: string }
  | { type: 'error'; title: string; message: string }
  | { type: 'complete' }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ManualPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [sections, setSections] = useState<{ title: string; done: boolean; error?: string }[]>([])

  const { data: pdfInfo, isLoading: pdfLoading } = useQuery({
    queryKey: ['manual-info'],
    queryFn: () => apiClient.getManualInfo(),
  })

  const { data: aiInfo, isLoading: aiLoading } = useQuery({
    queryKey: ['manual-ai-info'],
    queryFn: () => apiClient.getManualAiInfo(),
  })

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFile) return
    setUploading(true)
    setUploadMsg(null)
    try {
      await apiClient.uploadManual(selectedFile)
      setUploadMsg({ ok: true, text: 'Manual updated successfully.' })
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await qc.invalidateQueries({ queryKey: ['manual-info'] })
    } catch (err) {
      setUploadMsg({ ok: false, text: err instanceof ApiClientError ? err.message : 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    setGenerateError(null)
    setSections([])
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/v1/admin/super/manual/generate', {
        method: 'POST',
        credentials: 'include',
        signal: abortRef.current.signal,
      })
      if (!res.ok || !res.body) {
        throw new Error(`Server error ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as GenerateEvent
            if (event.type === 'section:start') {
              setSections(prev => [...prev, { title: event.title, done: false }])
            }
            if (event.type === 'section:done') {
              setSections(prev => prev.map(s => s.title === event.title ? { ...s, done: true } : s))
            }
            if (event.type === 'error') {
              setSections(prev => prev.map(s => s.title === event.title ? { ...s, done: true, error: event.message } : s))
            }
            if (event.type === 'complete') {
              await qc.invalidateQueries({ queryKey: ['manual-ai-info'] })
            }
          } catch { /* ignore parse errors */ }
        }
      }
      reader.cancel().catch(() => {})
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setGenerateError(err instanceof Error ? err.message : 'Generation failed')
      }
    } finally {
      setGenerating(false)
    }
  }

  const generatedAt = aiInfo?.generatedAt
    ? new Date(aiInfo.generatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : null

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Admin User Manual</h1>

      {/* AI Generation */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">AI-generated manual</h2>
            {!aiLoading && generatedAt && (
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Last generated {generatedAt} · {aiInfo?.sectionCount} sections</p>
            )}
          </div>
          {!aiLoading && aiInfo?.exists && (
            <a
              href="/api/v1/admin/manual"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)]"
            >
              View Manual
            </a>
          )}
        </div>

        <button
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
        >
          {generating ? 'Generating…' : 'Generate with AI'}
        </button>

        {/* Progress */}
        {sections.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {sections.map(s => (
              <li key={s.title} className="flex items-center gap-2">
                {s.error
                  ? <span className="text-[var(--color-error)]">✗</span>
                  : s.done
                    ? <span className="text-green-600">✓</span>
                    : <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full text-[var(--color-primary)]" />
                }
                <span className={s.error ? 'text-[var(--color-error)]' : s.done ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}>
                  {s.title}{s.error ? ` — ${s.error}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        {generateError && (
          <p className="text-sm text-[var(--color-error)]">{generateError}</p>
        )}

        {/* Downloads — shown only after manual exists */}
        {!aiLoading && aiInfo?.exists && (
          <div className="flex gap-2 pt-1 border-t border-[var(--color-border)]">
            <a
              href="/api/v1/admin/manual?download=true"
              className="flex-1 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-center text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)]"
            >
              Download: Full manual
            </a>
            <a
              href="/api/v1/admin/manual?download=true&audience=hotel"
              className="flex-1 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-center text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)]"
            >
              Download: Hotel version
            </a>
          </div>
        )}
      </section>

      {/* PDF Upload (legacy) */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Upload PDF manual (override)</h2>
        {!pdfLoading && pdfInfo?.exists && (
          <div className="flex items-center justify-between gap-4 text-sm">
            <div>
              <p className="text-[var(--color-text)]">HG-IBE-Admin-User-Manual.pdf</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {formatSize(pdfInfo.size)}
                {pdfInfo.updatedAt && <> · {new Date(pdfInfo.updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</>}
              </p>
            </div>
            <a href="/HG-IBE-Admin-User-Manual.pdf" download className="flex-shrink-0 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)]">
              Download
            </a>
          </div>
        )}
        <form onSubmit={e => void handleUpload(e)} className="space-y-3">
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-border)] px-6 py-6 transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-background)]"
            onClick={() => fileRef.current?.click()}
          >
            {selectedFile
              ? <p className="text-sm font-medium text-[var(--color-text)]">{selectedFile.name}</p>
              : <p className="text-sm text-[var(--color-text-muted)]">Click to select a PDF file</p>
            }
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} />
          </div>
          {uploadMsg && (
            <p className={`text-sm ${uploadMsg.ok ? 'text-green-600' : 'text-[var(--color-error)]'}`}>{uploadMsg.text}</p>
          )}
          <button type="submit" disabled={!selectedFile || uploading} className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
            {uploading ? 'Uploading…' : 'Upload & replace manual'}
          </button>
        </form>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep manual | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/config/manual/page.tsx apps/web/src/lib/api-client.ts
git commit -m "feat(manual): admin UI — AI generate button, SSE progress, downloads panel"
```

---

## Task 6: Add `?` help icon to admin header

**Files:**
- Modify: `apps/web/src/app/admin/_layout-client.tsx`

- [ ] **Step 1: Replace the existing PDF download `<a>` with a help icon**

In `apps/web/src/app/admin/_layout-client.tsx`, find this block (around line 499):

```tsx
              <a
                href="/HG-IBE-Admin-User-Manual.pdf"
                download
                title="Download user manual"
                className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </a>
```

Replace with:

```tsx
              <a
                href="/api/v1/admin/manual"
                target="_blank"
                rel="noopener noreferrer"
                title="Help & user manual"
                className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </a>
```

- [ ] **Step 2: Type-check**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep "_layout\|error" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/_layout-client.tsx
git commit -m "feat(manual): replace PDF download icon with ? help icon opening manual in new tab"
```

---

## Task 7: Push + verify

- [ ] **Step 1: Run full type-check**

```bash
cd /home/nir/ibe && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | grep "error TS" | head -5
cd /home/nir/ibe && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep "error TS" | head -5
```

Expected: no errors on either.

- [ ] **Step 2: Run tests**

```bash
cd /home/nir/ibe/apps/api && npx vitest run src/services/__tests__/manual-generate.service.test.ts 2>&1 | tail -10
```

Expected: all tests PASS.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Notes for implementer

- **AI config required:** Generation calls the Anthropic API using the **system-level AI config** stored in `SystemAIConfig`. If no config is set, generation will fail with a clear error. Ensure system AI config is configured in the admin panel before testing.
- **Data directory on Render:** The `data/` directory is relative to the API process working directory. On Render, use a persistent disk and set `MANUAL_JSON_PATH` to a path on that disk (e.g. `/data/HG-IBE-Admin-Manual.json`).
- **Generation time:** ~22 sections × ~5–10s per Claude call = 2–4 minutes. The SSE progress keeps the UI responsive throughout.
- **Partial failures:** If Claude fails for a section, generation continues. The section gets a fallback markdown message and the JSON is still saved with all other sections complete.
