import type { ConversationSession, ChatMessage } from './types.js'

/**
 * Web channel: history is owned by the client and sent with every request.
 * load() returns the provided history; save() is a no-op.
 */
export class ClientSession implements ConversationSession {
  constructor(private readonly history: ChatMessage[]) {}

  async load(_sessionId: string): Promise<ChatMessage[]> {
    return this.history
  }

  async save(_sessionId: string, _history: ChatMessage[]): Promise<void> {
    // Client owns history — nothing to persist server-side
  }
}
