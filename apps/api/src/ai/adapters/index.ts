import type { AIProvider } from '@ibe/shared'
import type { ProviderAdapter } from './types.js'
import { OpenAICompatAdapter } from './openai-compat.js'
import { AnthropicAdapter } from './anthropic.js'
import { GeminiAdapter } from './gemini.js'
import { FakeAdapter } from './fake.js'

export function getProviderAdapter(provider: AIProvider): ProviderAdapter {
  switch (provider) {
    case 'openai':
    case 'grok':
    case 'deepseek':
    case 'openrouter':
      return new OpenAICompatAdapter(provider)
    case 'anthropic':
      return new AnthropicAdapter()
    case 'gemini':
      return new GeminiAdapter()
    case 'fake':
      return new FakeAdapter()
  }
}

export type { ProviderAdapter, ToolDefinition, ProviderResponse } from './types.js'
