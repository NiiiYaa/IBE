import { logger } from '../../utils/logger.js'
import type { ChatMessage } from '../sessions/types.js'
import type { ProviderAdapter, ProviderResponse, ToolDefinition } from './types.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { content: unknown } } }

type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const result: GeminiContent[] = []

  for (const m of messages) {
    if (m.role === 'system') continue  // handled via system_instruction

    if (m.role === 'user') {
      result.push({ role: 'user', parts: [{ text: m.content }] })
      continue
    }

    if (m.role === 'assistant') {
      const parts: GeminiPart[] = []
      if (m.content) parts.push({ text: m.content })
      for (const tc of m.toolCalls ?? []) {
        parts.push({ functionCall: { name: tc.name, args: tc.arguments } })
      }
      if (parts.length > 0) result.push({ role: 'model', parts })
      continue
    }

    if (m.role === 'tool') {
      // Function responses go in a user turn
      const part: GeminiPart = {
        functionResponse: {
          name: m.name,
          response: { content: (() => { try { return JSON.parse(m.content) } catch { return m.content } })() },
        },
      }
      const last = result[result.length - 1]
      if (last?.role === 'user') {
        last.parts.push(part)
      } else {
        result.push({ role: 'user', parts: [part] })
      }
    }
  }

  return result
}

export class GeminiAdapter implements ProviderAdapter {
  async call(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
    apiKey: string,
    model: string,
  ): Promise<ProviderResponse> {
    const url = `${BASE}/${model}:generateContent?key=${apiKey}`

    const body: Record<string, unknown> = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: toGeminiContents(messages),
    }

    if (tools.length > 0) {
      body.tools = [{
        function_declarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }]
      body.tool_config = { function_calling_config: { mode: 'AUTO' } }
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        logger.error({ status: res.status, text }, '[AI] Gemini error')
        return { text: null, toolCalls: [], stopReason: 'error', error: `${res.status}: ${text.slice(0, 200)}` }
      }

      const data = await res.json() as {
        candidates: Array<{
          content: { parts: GeminiPart[] }
          finishReason: string
        }>
      }

      const candidate = data.candidates[0]
      if (!candidate) return { text: null, toolCalls: [], stopReason: 'error', error: 'Empty response' }

      let text: string | null = null
      const toolCalls: ProviderResponse['toolCalls'] = []

      for (const part of candidate.content.parts) {
        if ('text' in part) text = (text ?? '') + part.text
        if ('functionCall' in part) {
          toolCalls.push({
            id: `gemini-${part.functionCall.name}-${Date.now()}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args,
          })
        }
      }

      return {
        text,
        toolCalls,
        stopReason: candidate.finishReason === 'STOP' && toolCalls.length > 0 ? 'tool_use'
          : candidate.finishReason === 'MAX_TOKENS' ? 'max_tokens'
          : 'end',
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      logger.error({ err }, '[AI] Gemini fetch failed')
      return { text: null, toolCalls: [], stopReason: 'error', error: msg }
    }
  }
}
