export type AIProvider = 'openai' | 'gemini' | 'anthropic' | 'grok' | 'deepseek' | 'openrouter' | 'fake'

export const AI_PROVIDERS: AIProvider[] = ['openai', 'gemini', 'anthropic', 'grok', 'deepseek', 'openrouter', 'fake']

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic',
  grok: 'Grok (xAI)',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  fake: 'Fake AI (testing only)',
}

export const AI_PROVIDER_MODELS: Record<AIProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  grok: ['grok-3', 'grok-3-fast', 'grok-2'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openrouter: [
    'openai/gpt-4o',
    'anthropic/claude-sonnet-4-5',
    'google/gemini-2.0-flash-001',
    'deepseek/deepseek-chat-v3-0324',
    'meta-llama/llama-4-maverick',
    'mistralai/mistral-large',
  ],
  fake: ['fake-model'],
}

export interface AIConfigResponse {
  provider: AIProvider | null
  model: string | null
  apiKeySet: boolean
  apiKeyMasked: string | null
  systemPrompt: string | null
  enabled: boolean
}

export interface OrgAIConfigResponse extends AIConfigResponse {
  useInherited: boolean
  inherited: AIConfigResponse | null
}

export interface PropertyAIConfigResponse extends AIConfigResponse {
  useInherited: boolean
  inherited: AIConfigResponse | null
  inheritedFrom: 'org' | 'system' | null
}

export interface AIConfigUpdate {
  provider?: AIProvider
  model?: string
  apiKey?: string
  systemPrompt?: string | null
  enabled?: boolean
}

export interface OrgAIConfigUpdate extends AIConfigUpdate {
  useInherited?: boolean
}

export interface PropertyAIConfigUpdate extends AIConfigUpdate {
  useInherited?: boolean
}

export interface AITestResult {
  ok: boolean
  error?: string
}

// ── Conversational search ─────────────────────────────────────────────────────

export interface GuestChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolResults?: Array<{ tool: string; data: unknown }>
  timestamp: string
}

export type ChatStreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_result'; tool: string; data: unknown }
  | { type: 'done'; history: unknown[] }
  | { type: 'error'; message: string }
