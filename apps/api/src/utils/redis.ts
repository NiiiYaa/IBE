import Redis from 'ioredis'
import { env } from '../config/env.js'

let redisClient: Redis | null = null

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableReadyCheck: true,
    })

    redisClient.on('error', (err: Error) => {
      console.error('[Redis] Connection error:', err.message)
    })

    redisClient.on('connect', () => {
      if (env.NODE_ENV !== 'test') {
        console.warn('[Redis] Connected')
      }
    })
  }
  return redisClient
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}

/**
 * Gets a JSON-serialised value from Redis, or null if not found.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  const raw = await redis.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Sets a JSON-serialised value in Redis with a TTL in seconds.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis()
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
}

/**
 * Deletes a key from Redis.
 */
export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis()
  await redis.del(key)
}
