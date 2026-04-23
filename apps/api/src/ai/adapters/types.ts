import type { ChatMessage } from '../sessions/types.js'

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface ProviderResponse {
  text: string | null
  toolCalls: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
  stopReason: 'end' | 'tool_use' | 'max_tokens' | 'error'
  error?: string
}

export interface ProviderAdapter {
  call(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
    apiKey: string,
    model: string,
  ): Promise<ProviderResponse>
}
