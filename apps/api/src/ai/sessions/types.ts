export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface SystemMessage {
  role: 'system'
  content: string
}

export interface UserMessage {
  role: 'user'
  content: string
}

export interface AssistantMessage {
  role: 'assistant'
  content: string | null
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
}

export interface ToolMessage {
  role: 'tool'
  toolCallId: string
  name: string
  content: string  // JSON-stringified result
}

export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage

export interface ConversationSession {
  load(sessionId: string): Promise<ChatMessage[]>
  save(sessionId: string, history: ChatMessage[]): Promise<void>
}
