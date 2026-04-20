/**
 * Server entry point.
 * Builds the Fastify app, connects to infrastructure, and starts listening.
 */

import { buildApp } from './app.js'
import { env } from './config/env.js'
import { prisma } from './db/client.js'
import { logger } from './utils/logger.js'

async function connectWithRetry(maxAttempts = 10, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect()
      return
    } catch (err) {
      if (attempt >= maxAttempts) throw err
      logger.warn({ err, attempt }, `[Server] DB connect failed, retrying in ${delayMs}ms...`)
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
}

async function start() {
  await connectWithRetry()
  logger.info('[Server] Database connected')

  if (env.REDIS_URL) {
    const { getRedis } = await import('./utils/redis.js')
    const redis = getRedis()
    await redis.connect()
    logger.info('[Server] Redis connected')
  } else {
    logger.warn('[Server] REDIS_URL not set — using in-memory cache')
  }

  if (env.HYPERGUEST_MOCK === 'true') {
    logger.warn('[Server] HYPERGUEST_MOCK=true — using mock adapter, no real API calls')
  }

  const app = await buildApp()
  await app.listen({ port: env.API_PORT, host: env.API_HOST })
  logger.info(`[Server] Listening on ${env.API_HOST}:${env.API_PORT}`)

  // Background warmup: pre-populate HyperGuest static cache so the first request is never cold
  void warmupStaticCache()
}

async function warmupStaticCache() {
  if (env.HYPERGUEST_MOCK === 'true') return
  try {
    const properties = await prisma.property.findMany({
      where: { isActive: true, deletedAt: null },
      select: { propertyId: true },
    })
    if (properties.length === 0) return
    logger.info({ count: properties.length }, '[Warmup] Pre-fetching static data for active properties')

    const { fetchPropertyStatic } = await import('./adapters/hyperguest/static.js')
    const CONCURRENCY = 3
    for (let i = 0; i < properties.length; i += CONCURRENCY) {
      const batch = properties.slice(i, i + CONCURRENCY)
      await Promise.allSettled(batch.map(p => fetchPropertyStatic(p.propertyId)))
    }
    logger.info('[Warmup] Static cache warm')
  } catch (err) {
    logger.warn({ err }, '[Warmup] Static cache warmup failed (non-fatal)')
  }
}

async function shutdown(signal: string) {
  logger.info({ signal }, '[Server] Shutting down gracefully')
  if (env.REDIS_URL) {
    const { closeRedis } = await import('./utils/redis.js')
    await closeRedis()
  }
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

start().catch((err) => {
  logger.error({ err }, '[Server] Startup failed')
  process.exit(1)
})
