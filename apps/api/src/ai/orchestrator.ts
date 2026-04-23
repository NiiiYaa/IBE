import { resolveAIConfig, resolveContextPropertyIds } from '../services/ai-config.service.js'
import { getProviderAdapter } from './adapters/index.js'
import { ALL_TOOLS, executeTool } from './tools/index.js'
import { logger } from '../utils/logger.js'
import type { ConversationSession, ChatMessage, AssistantMessage, ToolMessage } from './sessions/types.js'

const MAX_TOOL_ITERATIONS = 5

export interface OrchestratorInput {
  message: string
  session: ConversationSession
  sessionId: string
  propertyId?: number
  orgId?: number
  customSystemPrompt?: string
}

export interface ToolCallResult {
  tool: string
  data: unknown
}

export interface OrchestratorResult {
  text: string
  toolResults: ToolCallResult[]
  updatedHistory: ChatMessage[]
  error?: string
}

function buildSystemPrompt(custom?: string, propertyIds?: number[]): string {
  const base = `You are a helpful hotel booking assistant. Your role is to:
1. Help guests find available rooms based on their dates, preferences, and budget
2. Answer questions about the hotel and room types
3. Guide guests through selecting and booking a room
4. Be concise, friendly, and professional

When searching, always confirm the dates with the guest before searching.
When presenting rooms, highlight the most relevant options clearly.
When the guest is ready to book, use prepare_booking to generate the booking link.
Never invent prices or availability — always use the search_availability tool to get real data.`

  let resolved = custom
  if (resolved && propertyIds && propertyIds.length > 0) {
    resolved = resolved.replace(/\[hotel\]/gi, propertyIds.join(', '))
  }

  let context = ''
  if (propertyIds && propertyIds.length === 1) {
    context = `\n\nProperty context: You are embedded in the booking engine for property ID ${propertyIds[0]}. Always use propertyId ${propertyIds[0]} in all tool calls. Never ask the user which hotel — the property is already known.`
  } else if (propertyIds && propertyIds.length > 1) {
    context = `\n\nProperty context: You are embedded in a hotel chain booking engine. The available property IDs are: ${propertyIds.join(', ')}. Ask the user which hotel they are interested in, then use the corresponding property ID in tool calls.`
  }

  const parts = [base, context, resolved ? `Additional instructions:\n${resolved}` : ''].filter(Boolean)
  return parts.join('\n\n')
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  const { message, session, sessionId, propertyId, customSystemPrompt } = input

  const aiConfig = await resolveAIConfig(propertyId)
  if (!aiConfig) {
    return {
      text: 'AI assistant is not configured for this hotel. Please contact the hotel directly.',
      toolResults: [],
      updatedHistory: [],
      error: 'no_config',
    }
  }

  const adapter = getProviderAdapter(aiConfig.provider)
  const propertyIds = await resolveContextPropertyIds(propertyId, input.orgId)
  const systemPrompt = buildSystemPrompt(aiConfig.systemPrompt ?? customSystemPrompt, propertyIds)

  const history = await session.load(sessionId)
  const userMessage: ChatMessage = { role: 'user', content: message }
  let messages: ChatMessage[] = [...history, userMessage]

  const allToolResults: ToolCallResult[] = []
  let finalText = ''
  let iterations = 0

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++

    const response = await adapter.call(messages, ALL_TOOLS, systemPrompt, aiConfig.apiKey, aiConfig.model)

    if (response.stopReason === 'error') {
      logger.error({ sessionId, error: response.error }, '[Orchestrator] Provider error')
      return {
        text: 'I encountered an error. Please try again.',
        toolResults: allToolResults,
        updatedHistory: messages,
        ...(response.error ? { error: response.error } : {}),
      }
    }

    // Append assistant message to history
    const assistantMsg: AssistantMessage = {
      role: 'assistant',
      content: response.text,
      ...(response.toolCalls.length > 0 && { toolCalls: response.toolCalls }),
    }
    messages = [...messages, assistantMsg]

    if (response.toolCalls.length === 0) {
      finalText = response.text ?? ''
      break
    }

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      response.toolCalls.map(async tc => {
        logger.info({ tool: tc.name, args: tc.arguments, sessionId }, '[Orchestrator] Executing tool')
        const result = await executeTool(tc.name, tc.arguments)
        return { tc, result }
      })
    )

    for (const { tc, result } of toolResults) {
      allToolResults.push({ tool: tc.name, data: result })
      const toolMsg: ToolMessage = {
        role: 'tool',
        toolCallId: tc.id,
        name: tc.name,
        content: JSON.stringify(result),
      }
      messages = [...messages, toolMsg]
    }
  }

  if (!finalText && iterations >= MAX_TOOL_ITERATIONS) {
    finalText = 'I was unable to complete your request. Please try rephrasing.'
  }

  await session.save(sessionId, messages)

  logger.info({ sessionId, iterations, toolCount: allToolResults.length }, '[Orchestrator] Done')

  return { text: finalText, toolResults: allToolResults, updatedHistory: messages }
}
