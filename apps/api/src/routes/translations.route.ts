import type { FastifyInstance } from 'fastify'
import type { TranslationNamespace, TranslationAIConfigUpdate } from '@ibe/shared'
import { TRANSLATION_NAMESPACES } from '@ibe/shared'
import {
  getTranslationsForLocale,
  getTranslationStatus,
  listTranslationsForNamespace,
  upsertTranslation,
  deleteTranslationsForLocale,
  autoTranslateMissing,
  translateSingleString,
  getTranslationAIConfig,
  upsertTranslationAIConfig,
  getTotalStringCount,
  getFacilityCoverage,
} from '../services/translation.service.js'

export async function translationsPublicRoutes(fastify: FastifyInstance) {
  // GET /config/translations?locale=fr — returns flat "namespace.key": value map for IBE
  fastify.get('/config/translations', async (request, reply) => {
    const { locale } = request.query as { locale?: string }
    if (!locale) return reply.status(400).send({ error: 'locale is required' })
    void reply.header('Cache-Control', 'public, max-age=300, s-maxage=600')
    return reply.send(await getTranslationsForLocale(locale))
  })
}

export async function translationsAdminRoutes(fastify: FastifyInstance) {
  // GET /admin/design/translations/ai-config
  fastify.get('/admin/design/translations/ai-config', async (_request, reply) => {
    return reply.send(await getTranslationAIConfig())
  })

  // PUT /admin/design/translations/ai-config
  fastify.put('/admin/design/translations/ai-config', async (request, reply) => {
    const data = request.body as TranslationAIConfigUpdate
    return reply.send(await upsertTranslationAIConfig(data))
  })

  // POST /admin/design/translations/translate-one — AI-translate a single string
  fastify.post('/admin/design/translations/translate-one', async (request, reply) => {
    const { locale, namespace, key } = request.body as { locale: string; namespace: string; key: string }
    if (!locale || !namespace || !key) return reply.status(400).send({ error: 'locale, namespace, key required' })
    try {
      const value = await translateSingleString(locale, namespace, key)
      return reply.send({ value })
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : 'Translation failed' })
    }
  })

  // GET /admin/design/translations/total — total English string count
  fastify.get('/admin/design/translations/total', async (_request, reply) => {
    return reply.send({ total: getTotalStringCount() })
  })

  // GET /admin/design/translations/status — per-locale, per-namespace counts
  fastify.get('/admin/design/translations/status', async (_request, reply) => {
    return reply.send(await getTranslationStatus())
  })

  // GET /admin/design/translations/facility-coverage — facility translation counts per locale
  fastify.get('/admin/design/translations/facility-coverage', async (_request, reply) => {
    return reply.send(await getFacilityCoverage())
  })

  // GET /admin/design/translations/:locale/:namespace — list rows for editing
  fastify.get('/admin/design/translations/:locale/:namespace', async (request, reply) => {
    const { locale, namespace } = request.params as { locale: string; namespace: string }
    if (!TRANSLATION_NAMESPACES.includes(namespace as TranslationNamespace)) {
      return reply.status(400).send({ error: 'Invalid namespace' })
    }
    return reply.send(await listTranslationsForNamespace(locale, namespace as TranslationNamespace))
  })

  // PUT /admin/design/translations/:locale/:namespace/:key — upsert single translation
  fastify.put('/admin/design/translations/:locale/:namespace/:key', async (request, reply) => {
    const { locale, namespace, key } = request.params as { locale: string; namespace: string; key: string }
    const { value } = request.body as { value: string }
    if (typeof value !== 'string') return reply.status(400).send({ error: 'value is required' })
    await upsertTranslation(locale, namespace, key, value)
    return reply.send({ ok: true })
  })

  // DELETE /admin/design/translations/:locale — remove all translations for a locale
  fastify.delete('/admin/design/translations/:locale', async (request, reply) => {
    const { locale } = request.params as { locale: string }
    await deleteTranslationsForLocale(locale)
    return reply.send({ ok: true })
  })

  // POST /admin/design/translations/auto-translate — SSE stream of AI translation progress
  fastify.post('/admin/design/translations/auto-translate', async (request, reply) => {
    const { locale, namespace, limit } = request.body as { locale: string; namespace?: TranslationNamespace; limit?: number }
    if (!locale) return reply.status(400).send({ error: 'locale is required' })

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders()

    try {
      await autoTranslateMissing(
        locale,
        namespace ?? null,
        (event) => { reply.raw.write(`data: ${JSON.stringify(event)}\n\n`) },
        limit,
      )
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : 'Translation failed' })}\n\n`)
    } finally {
      reply.raw.end()
    }
  })
}
