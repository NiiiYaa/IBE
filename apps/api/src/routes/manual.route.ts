import type { FastifyInstance } from 'fastify'
import { createWriteStream, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { env } from '../config/env.js'

const MANUAL_PATH = env.MANUAL_FILE_PATH
  ?? resolve(process.cwd(), '../../apps/web/public/HG-IBE-Admin-User-Manual.pdf')

export async function manualRoutes(fastify: FastifyInstance) {
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
    fastify.log.info(`Manual updated by super admin ${request.admin.adminId}, saved to ${MANUAL_PATH}`)

    return reply.send({ ok: true })
  })
}
