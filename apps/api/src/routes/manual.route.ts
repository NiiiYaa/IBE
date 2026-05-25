import type { FastifyInstance } from 'fastify'
import { createWriteStream, statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { env } from '../config/env.js'
import {
  startGenerationJob,
  getJobState,
  loadManualData,
  filterSectionsByRole,
  renderManualHtml,
} from '../services/manual-generate.service.js'

const MANUAL_PATH = env.MANUAL_FILE_PATH
  ?? resolve(process.cwd(), '../../apps/web/public/HG-IBE-Admin-User-Manual.pdf')

// Pre-load logo as base64 so PDF generation works without network access
const LOGO_DATA_URI = (() => {
  try {
    const data = readFileSync(resolve(process.cwd(), '../../apps/web/public/hyperguest-logo.png'))
    return `data:image/png;base64,${data.toString('base64')}`
  } catch { return '' }
})()

async function generatePdf(html: string): Promise<Buffer> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] })
  try {
    const page = await browser.newPage()
    const pdfHtml = LOGO_DATA_URI ? html.replace('src="/hyperguest-logo.png"', `src="${LOGO_DATA_URI}"`) : html
    await page.setContent(pdfHtml, { waitUntil: 'domcontentloaded' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

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

  // ── New: AI generation (SSE, background job) ───────────────────────────────
  // Generation runs detached from the HTTP connection so Render's request
  // timeout cannot kill it. The SSE stream polls an in-memory job state every
  // 300 ms. If the browser disconnects and reconnects, it replays all events
  // from the start and catches up instantly.

  fastify.post('/admin/super/manual/generate', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })

    const { force } = request.query as { force?: string }
    startGenerationJob(force === 'true')

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders()

    await new Promise<void>((resolve) => {
      let lastIndex = 0

      const keepalive = setInterval(() => {
        try { reply.raw.write(': ping\n\n') } catch { /* closed */ }
      }, 20_000)

      const poll = setInterval(() => {
        const state = getJobState()
        const newEvents = state.events.slice(lastIndex)
        try {
          for (const event of newEvents) {
            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
          }
          lastIndex += newEvents.length
          if (!state.running && lastIndex >= state.events.length) {
            clearInterval(poll)
            clearInterval(keepalive)
            reply.raw.end()
            resolve()
          }
        } catch {
          // client disconnected — generation continues in background
          clearInterval(poll)
          clearInterval(keepalive)
          resolve()
        }
      }, 300)

      request.raw.on('close', () => {
        clearInterval(poll)
        clearInterval(keepalive)
        resolve()
      })
    })
  })

  // ── New: Serve manual HTML (role-filtered) ──────────────────────────────────

  fastify.get('/admin/manual', async (request, reply) => {
    const { download, audience, format } = request.query as { download?: string; audience?: string; format?: string }

    const data = loadManualData()
    if (!data) {
      void reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(`<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px;color:#334155">
        <h2>Manual not yet generated</h2>
        <p>A super admin can generate it from <strong>Config → Manual</strong>.</p>
      </body></html>`)
    }

    const role = request.admin.role
    let sectionsToRender = filterSectionsByRole(data.sections, role)

    if (role === 'super' && audience === 'hotel') {
      sectionsToRender = filterSectionsByRole(data.sections, 'hotel')
    }

    const isFullManual = role === 'super' && audience !== 'hotel'
    const title = 'HyperGuest AI Concierge Booking Engine'
    const edition = isFullManual ? undefined : 'Hotel Edition'
    const html = renderManualHtml(sectionsToRender, title, edition)

    if (format === 'pdf') {
      const filename = audience === 'hotel'
        ? 'HG-IBE-Admin-Manual-Hotel.pdf'
        : 'HG-IBE-Admin-Manual-Full.pdf'
      const pdf = await generatePdf(html)
      void reply.header('Content-Type', 'application/pdf')
      void reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(pdf)
    }

    void reply.header('Content-Type', 'text/html; charset=utf-8')

    if (download === 'true') {
      const filename = audience === 'hotel'
        ? 'HG-IBE-Admin-Manual-Hotel.html'
        : 'HG-IBE-Admin-Manual-Full.html'
      void reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    }

    return reply.send(html)
  })

  // ── New: Manual metadata ────────────────────────────────────────────────────

  fastify.get('/admin/super/manual-ai-info', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const data = loadManualData()
    return reply.send({
      exists: !!data,
      generatedAt: data?.generatedAt ?? null,
      sectionCount: data?.sections.length ?? 0,
      generating: getJobState().running,
    })
  })
}
