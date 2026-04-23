/**
 * OpenAI-compatible adapter — covers OpenAI, Grok (xAI), DeepSeek, and OpenRouter.
 * All four expose the same /v1/chat/completions endpoint format.
 */

import { logger } from '../../utils/logger.js'
import type { ChatMessage } from '../sessions/types.js'
import type { ProviderAdapter, ProviderResponse, ToolDefinition } from './types.js'

const BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  grok: 'https://api.x.ai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
}

function toProviderMessages(messages: ChatMessage[]): unknown[] {
  return messages.map(m => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, name: m.name, content: m.content }
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      }
    }
    return { role: m.role, content: m.content }
  })
}

export class OpenAICompatAdapter implements ProviderAdapter {
  constructor(private readonly provider: string) {}

  async call(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
    apiKey: string,
    model: string,
  ): Promise<ProviderResponse> {
    const url = BASE_URLS[this.provider]
    if (!url) return { text: null, toolCalls: [], stopReason: 'error', error: `Unknown provider: ${this.provider}` }

    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...toProviderMessages(messages),
      ],
    }

    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
      body.tool_choice = 'auto'
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }
    if (this.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://hyperguest.com'
      headers['X-Title'] = 'HyperGuest IBE'
    }

    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        logger.error({ provider: this.provider, status: res.status, text }, '[AI] Provider error')
        return { text: null, toolCalls: [], stopReason: 'error', error: `${res.status}: ${text.slice(0, 200)}` }
      }

      const data = await res.json() as {
        choices: Array<{
          message: {
            content: string | null
            tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
          }
          finish_reason: string
        }>
      }

      const choice = data.choices[0]
      if (!choice) return { text: null, toolCalls: [], stopReason: 'error', error: 'Empty response' }

      const toolCalls = (choice.message.tool_calls ?? []).map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: (() => { try { return JSON.parse(tc.function.arguments) as Record<string, unknown> } catch { return {} } })(),
      }))

      return {
        text: choice.message.content,
        toolCalls,
        stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use'
          : choice.finish_reason === 'length' ? 'max_tokens'
          : 'end',
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      logger.error({ provider: this.provider, err }, '[AI] Fetch failed')
      return { text: null, toolCalls: [], stopReason: 'error', error: msg }
    }
  }
}
