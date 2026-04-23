import { logger } from '../../utils/logger.js'
import type { ChatMessage } from '../sessions/types.js'
import type { ProviderAdapter, ProviderResponse, ToolDefinition } from './types.js'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const MAX_TOKENS = 4096

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

function toAnthropicMessages(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }> {
  const result: Array<{ role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }> = []

  for (const m of messages) {
    if (m.role === 'system') continue  // handled separately as `system` param

    if (m.role === 'user') {
      result.push({ role: 'user', content: m.content })
      continue
    }

    if (m.role === 'assistant') {
      const content: AnthropicContentBlock[] = []
      if (m.content) content.push({ type: 'text', text: m.content })
      for (const tc of m.toolCalls ?? []) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments })
      }
      result.push({ role: 'assistant', content: content.length === 1 && content[0]?.type === 'text' ? content[0].text : content })
      continue
    }

    if (m.role === 'tool') {
      // Tool results must be in a `user` message
      const last = result[result.length - 1]
      const block: AnthropicContentBlock = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }
      if (last?.role === 'user' && Array.isArray(last.content)) {
        (last.content as AnthropicContentBlock[]).push(block)
      } else {
        result.push({ role: 'user', content: [block] })
      }
    }
  }

  return result
}

export class AnthropicAdapter implements ProviderAdapter {
  async call(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
    apiKey: string,
    model: string,
  ): Promise<ProviderResponse> {
    const body: Record<string, unknown> = {
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: toAnthropicMessages(messages),
    }

    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }))
    }

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        logger.error({ status: res.status, text }, '[AI] Anthropic error')
        return { text: null, toolCalls: [], stopReason: 'error', error: `${res.status}: ${text.slice(0, 200)}` }
      }

      const data = await res.json() as {
        content: AnthropicContentBlock[]
        stop_reason: string
      }

      const textBlock = data.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
      const toolBlocks = data.content.filter(b => b.type === 'tool_use') as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>

      return {
        text: textBlock?.text ?? null,
        toolCalls: toolBlocks.map(b => ({ id: b.id, name: b.name, arguments: b.input })),
        stopReason: data.stop_reason === 'tool_use' ? 'tool_use'
          : data.stop_reason === 'max_tokens' ? 'max_tokens'
          : 'end',
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      logger.error({ err }, '[AI] Anthropic fetch failed')
      return { text: null, toolCalls: [], stopReason: 'error', error: msg }
    }
  }
}
