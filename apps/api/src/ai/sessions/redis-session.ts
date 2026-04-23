import type { ConversationSession, ChatMessage } from './types.js'
import { cacheGet, cacheSet } from '../../utils/cache.js'

const TTL_SECONDS = 60 * 60 * 24  // 24 hours — covers a full guest booking session

/**
 * WhatsApp / async channel: history is stored server-side keyed by phone number (or any
 * external identifier). Each incoming webhook loads the history, runs the orchestrator,
 * and saves the updated history back.
 */
export class RedisSession implements ConversationSession {
  private key(sessionId: string): string {
    return `ai:session:${sessionId}`
  }

  async load(sessionId: string): Promise<ChatMessage[]> {
    const stored = await cacheGet<ChatMessage[]>(this.key(sessionId))
    return stored ?? []
  }

  async save(sessionId: string, history: ChatMessage[]): Promise<void> {
    await cacheSet(this.key(sessionId), history, TTL_SECONDS)
  }
}
