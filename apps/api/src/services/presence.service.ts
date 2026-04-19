import { cacheGet, cacheSet } from '../utils/cache.js'

const TTL_SECONDS = 90
const KEY_PREFIX = 'presence'

type SessionMap = Record<string, number> // sessionId → expiresAt (ms)

function key(propertyId: number): string {
  return `${KEY_PREFIX}:${propertyId}`
}

export async function trackPresence(propertyId: number, sessionId: string): Promise<number> {
  const now = Date.now()
  const map = (await cacheGet<SessionMap>(key(propertyId))) ?? {}

  // Renew this session and drop expired ones in one pass
  const fresh: SessionMap = {}
  for (const [sid, exp] of Object.entries(map)) {
    if (exp > now) fresh[sid] = exp
  }
  fresh[sessionId] = now + TTL_SECONDS * 1000

  await cacheSet(key(propertyId), fresh, TTL_SECONDS)
  return Object.keys(fresh).length
}

export async function getViewerCount(propertyId: number): Promise<number> {
  const now = Date.now()
  const map = (await cacheGet<SessionMap>(key(propertyId))) ?? {}
  return Object.values(map).filter(exp => exp > now).length
}
