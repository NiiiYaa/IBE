import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { parse as parseMarkdown } from 'marked'
import { logger } from '../utils/logger.js'
import { env } from '../config/env.js'
import { resolveAIConfig } from './ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'

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

// ── Background job state ──────────────────────────────────────────────────────

interface JobState {
  running: boolean
  events: ManualGenerateEvent[]
}

let _job: JobState = { running: false, events: [] }

export function getJobState(): JobState {
  return _job
}

export function startGenerationJob(): void {
  if (_job.running) return
  _job = { running: true, events: [] }
  void generateManual((event) => {
    _job.events.push(event)
  }).finally(() => {
    _job.running = false
  })
}

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

const MAX_EXTRACTED_CHARS = 3000

/**
 * For TSX files: extract only `return (...)` blocks — the JSX that contains
 * field labels, descriptions, toggle text, and section headers. Everything
 * else (imports, types, hooks, state, API calls) is noise for documentation.
 * For other files: return the raw source (truncated).
 */
export function extractUiContent(source: string, filePath: string): string {
  if (!filePath.endsWith('.tsx')) {
    return source.slice(0, MAX_EXTRACTED_CHARS)
  }

  const lines = source.split('\n')
  const output: string[] = []
  let inReturn = false
  let depth = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip directives and imports — pure noise
    if (trimmed === "'use client'" || trimmed === '"use client"') continue
    if (trimmed.startsWith('import ')) continue

    if (!inReturn) {
      // Detect start of a return block
      if (/^\s*return\s*\(/.test(line)) {
        inReturn = true
        depth = 0
      } else {
        continue
      }
    }

    output.push(line)

    // Count parens to find where the return block closes.
    // Skip chars inside string literals to avoid false counts.
    let inStr: string | null = null
    for (const ch of line) {
      if (!inStr && (ch === '"' || ch === "'" || ch === '`')) { inStr = ch; continue }
      if (inStr && ch === inStr) { inStr = null; continue }
      if (!inStr) {
        if (ch === '(') depth++
        else if (ch === ')') {
          depth--
          if (depth <= 0) { inReturn = false; break }
        }
      }
    }
  }

  const result = output.join('\n')
  return result.length > MAX_EXTRACTED_CHARS
    ? result.slice(0, MAX_EXTRACTED_CHARS) + '\n[... truncated]'
    : result
}

export async function readSectionFiles(files: string[]): Promise<string> {
  const parts: string[] = []
  for (const relPath of files) {
    const absPath = resolve(REPO_ROOT, relPath)
    try {
      const raw = await readFile(absPath, 'utf-8')
      const content = extractUiContent(raw, relPath)
      if (content.trim()) {
        parts.push(`\n\n--- FILE: ${relPath} ---\n${content}`)
      }
    } catch {
      logger.warn({ relPath }, '[Manual] Source file not found, skipping')
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

async function callAI(sectionTitle: string, audience: string, filesContent: string): Promise<string> {
  const config = await resolveAIConfig()
  if (!config) {
    throw new Error('No system AI config found. Configure AI in the admin panel first.')
  }

  const audienceDesc = audience === 'super'
    ? 'super administrators managing the platform'
    : audience === 'hotel'
      ? 'hotel and chain administrators managing their properties'
      : 'hotel, chain, and super administrators'

  const userPrompt = `Section: ${sectionTitle}
Audience: ${audienceDesc}

Below are the relevant source files for this section. Extract the meaningful UI elements (field labels, toggle descriptions, hints, section headers, available options) and write a clear manual section covering: what this section does, the key settings and what they control, and common tasks a user would perform here.
${filesContent}`

  const adapter = getProviderAdapter(config.provider)
  const response = await Promise.race([
    adapter.call([{ role: 'user', content: userPrompt }], [], SYSTEM_PROMPT, config.apiKey, config.model),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI call timed out after 40s')), 40_000)
    ),
  ])

  if (response.stopReason === 'error') {
    throw new Error(`AI provider error: ${response.error ?? 'Unknown error'}`)
  }

  return response.text ?? ''
}

// ── Main generate function ────────────────────────────────────────────────────

export async function generateManual(emit: (event: ManualGenerateEvent) => void): Promise<void> {
  const generatedAt = new Date().toISOString()

  // Resume from a recent partial run: reuse sections that succeeded within the last 4 hours
  const existing = loadManualData()
  const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000
  const reusable = new Map<string, ManualSection>()
  if (existing && new Date(existing.generatedAt).getTime() > fourHoursAgo) {
    for (const s of existing.sections) {
      if (!s.markdown.startsWith('*Generation failed for this section:')) {
        reusable.set(s.id, s)
      }
    }
  }

  const sections: ManualSection[] = []

  for (const def of MANUAL_SECTIONS) {
    emit({ type: 'section:start', title: def.title })

    const cached = reusable.get(def.id)
    if (cached) {
      sections.push(cached)
      emit({ type: 'section:done', title: def.title })
      continue
    }

    try {
      const filesContent = await readSectionFiles(def.files)
      const markdown = await callAI(def.title, def.audience, filesContent)
      sections.push({ id: def.id, title: def.title, audience: def.audience, markdown })
      // Save after every section so partial work is preserved if the connection drops
      saveManualData({ generatedAt, sections: [...sections] })
      emit({ type: 'section:done', title: def.title })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ section: def.id, err }, '[Manual] Section generation failed')
      emit({ type: 'error', title: def.title, message })
      sections.push({ id: def.id, title: def.title, audience: def.audience, markdown: `*Generation failed for this section: ${message}*` })
      saveManualData({ generatedAt, sections: [...sections] })
    }
  }

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
<link rel="icon" type="image/png" href="/hg-favicon.png">
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
  .brand { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
  .brand img { height: 40px; width: auto; }
  .content h1 { font-size: 26px; font-weight: 700; color: #0f172a; }
  .meta { font-size: 13px; color: #94a3b8; margin-top: 6px; margin-bottom: 40px; }
  .section { margin-bottom: 48px; padding-bottom: 48px; border-bottom: 1px solid #e2e8f0; }
  .section:last-child { border-bottom: none; }
  .section h2 { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
  .section h3 { font-size: 16px; font-weight: 600; color: #1e293b; margin: 20px 0 8px; }
  .section p { margin-bottom: 12px; color: #334155; }
  .section ul, .section ol { padding-left: 20px; margin-bottom: 12px; }
  .section li { margin-bottom: 4px; color: #334155; }
  .section strong { color: #0f172a; }
  .section code { font-family: monospace; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-size: 13px; }
  .section table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 14px; }
  .section thead tr { background: #f1f5f9; }
  .section th { text-align: left; padding: 10px 14px; font-weight: 600; color: #1e293b; border: 1px solid #e2e8f0; }
  .section td { padding: 10px 14px; border: 1px solid #e2e8f0; color: #334155; vertical-align: top; }
  .section tbody tr:nth-child(even) { background: #f8f9fb; }
  @media print { .sidebar { display: none; } .layout { display: block; } .content { padding: 24px; max-width: 100%; } .section { page-break-inside: avoid; } }
</style>
</head>
<body>
<div class="layout">
  <nav class="sidebar">
    <h2>Contents</h2>
    <ol>${tocItems}</ol>
  </nav>
  <main class="content">
    <div class="brand">
      <img src="/hyperguest-logo.png" alt="HyperGuest">
    </div>
    <h1>${title}</h1>
    <p class="meta">Generated ${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
    ${bodyItems}
  </main>
</div>
</body>
</html>`
}
