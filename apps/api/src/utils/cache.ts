/**
 * Cache abstraction — uses Redis when available, falls back to in-memory.
 * All cache operations go through this module, never directly through redis.ts.
 *
 * In-memory cache is suitable for single-process development only.
 * In production, always set REDIS_URL.
 */

import { env } from '../config/env.js'
import { logger } from './logger.js'

// ── In-memory fallback ────────────────────────────────────────────────────────

interface CacheEntry {
  value: string
  expiresAt: number
}

const memoryCache = new Map<string, CacheEntry>()

function memGet(key: string): string | null {
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key)
    return null
  }
  return entry.value
}

function memSet(key: string, value: string, ttlSeconds: number): void {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
}

function memDel(key: string): void {
  memoryCache.delete(key)
}

// ── Redis-backed implementation ───────────────────────────────────────────────

async function redisGet(key: string): Promise<string | null> {
  const { getRedis } = await import('./redis.js')
  return getRedis().get(key)
}

async function redisSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const { getRedis } = await import('./redis.js')
  await getRedis().set(key, value, 'EX', ttlSeconds)
}

async function redisDel(key: string): Promise<void> {
  const { getRedis } = await import('./redis.js')
  await getRedis().del(key)
}

// ── Public API ────────────────────────────────────────────────────────────────

const useMemory = !env.REDIS_URL

if (useMemory) {
  logger.warn('[Cache] REDIS_URL not set — using in-memory cache (not suitable for production)')
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = useMemory ? memGet(key) : await redisGet(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const serialized = JSON.stringify(value)
  if (useMemory) {
    memSet(key, serialized, ttlSeconds)
  } else {
    await redisSet(key, serialized, ttlSeconds)
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (useMemory) {
    memDel(key)
  } else {
    await redisDel(key)
  }
}
