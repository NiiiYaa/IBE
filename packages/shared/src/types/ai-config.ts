import type { SellModel } from './api.js'

// ── AI Channels ───────────────────────────────────────────────────────────────

export type AIChannel = 'aiSearchBar' | 'whatsapp' | 'mcp'
export const AI_CHANNELS: AIChannel[] = ['aiSearchBar', 'whatsapp', 'mcp']

export const AI_CHANNEL_LABELS: Record<AIChannel, string> = {
  aiSearchBar: 'AI Search Bar',
  whatsapp: 'WhatsApp',
  mcp: 'MCP',
}

export const AI_CHANNEL_DESCRIPTIONS: Record<AIChannel, string> = {
  aiSearchBar: 'Conversational search bar on the booking engine — guests can ask in natural language.',
  whatsapp: 'AI assistant via WhatsApp — guests can book and enquire through chat.',
  mcp: 'Model Context Protocol server — allows external AI clients (Claude Desktop, Cursor, etc.) to access hotel data.',
}

export interface AIChannelSettings {
  aiSearchBar: SellModel[]
  whatsapp: SellModel[]
  mcp: SellModel[]
}

export type UpdateAIChannelSettingsRequest = Partial<AIChannelSettings>

// ── AI Provider / Config ──────────────────────────────────────────────────────

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
  systemServiceDisabled: boolean
}

export interface PropertyAIConfigResponse extends AIConfigResponse {
  useInherited: boolean
  inherited: AIConfigResponse | null
  inheritedFrom: 'org' | 'system' | null
  systemServiceDisabled: boolean
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
  systemServiceDisabled?: boolean
}

export interface PropertyAIConfigUpdate extends AIConfigUpdate {
  useInherited?: boolean
  systemServiceDisabled?: boolean
}

export interface AITestResult {
  ok: boolean
  error?: string
}

// ── Translation AI config ─────────────────────────────────────────────────────

export interface TranslationAIConfigResponse {
  useSystemDefault: boolean
  provider: AIProvider | null
  model: string | null
  apiKeySet: boolean
  apiKeyMasked: string | null
  /** Resolved system default AI, shown as preview when useSystemDefault is true */
  systemDefault: { provider: AIProvider | null; model: string | null } | null
}

export interface TranslationAIConfigUpdate {
  useSystemDefault?: boolean
  provider?: AIProvider | null
  model?: string | null
  apiKey?: string | null
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
