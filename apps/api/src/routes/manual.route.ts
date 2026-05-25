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

    const keepalive = setInterval(() => {
      try { reply.raw.write(': ping\n\n') } catch { /* connection closed */ }
    }, 20_000)

    try {
      await generateManual((event) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      })
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', title: 'Fatal', message: err instanceof Error ? err.message : 'Generation failed' })}\n\n`)
    } finally {
      clearInterval(keepalive)
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

    const role = request.admin.role
    let sectionsToRender = filterSectionsByRole(data.sections, role)

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

  // ── New: Manual metadata ────────────────────────────────────────────────────

  fastify.get('/admin/super/manual-ai-info', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const data = loadManualData()
    return reply.send({ exists: !!data, generatedAt: data?.generatedAt ?? null, sectionCount: data?.sections.length ?? 0 })
  })
}
