import { resolveAIConfig, resolveChainContext, type ChainContext } from '../services/ai-config.service.js'
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
  channel?: string
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

function buildSystemPrompt(custom?: string, chainCtx?: ChainContext, orgId?: number): string {
  const today = new Date().toISOString().slice(0, 10)
  const base = `You are a helpful hotel booking assistant. Your role is to:
1. Help guests find available rooms based on their dates, preferences, and budget
2. Answer questions about properties and room types
3. Guide guests through selecting and booking a room
4. Be concise, friendly, and professional

Today's date is ${today}.
When a guest mentions a date without a year (e.g. "August 6", "Feb 22", "next Friday"), always resolve it to the next occurrence within the next 12 months from today. Never assume the current year if that date has already passed — use the following year instead.
Examples (assuming today is ${today}): "Aug 6" → pick whichever of this year or next year puts Aug 6 at least 1 day in the future. "Feb 22" → if Feb 22 this year has passed, use next year's Feb 22.

When searching, always confirm the dates with the guest before searching.
When presenting rooms, highlight the most relevant options clearly.
When the guest is ready to book, use prepare_booking to generate the booking link.
Never invent prices or availability — always use the search_availability tool to get real data.
Always display prices with the currency code (e.g. "EUR 250" or "USD 320").
When presenting search results, always show the cancellation policy for each rate offer exactly as returned in the cancellationPolicy field (e.g. "Free cancellation until May 15, 2026" or "Non-refundable"). Never summarise it as "generally refundable" — use the exact text from the field.

IMPORTANT: Never mention property IDs or numeric hotel identifiers to guests. Always refer to hotels by their name. If you need a hotel's name and don't have it yet, call get_property_info first, then use the name in your response.
If a guest message contains a technical suffix like "(property id: 123)" or "(org id: 9)", treat it as internal routing metadata — silently ignore it and never repeat or acknowledge it in your reply.`

  const { homePropertyId, propertyIds, chainName, defaultCurrency, isChainMember, isChainEngine } = chainCtx ?? {
    propertyIds: [],
    isChainMember: false,
    isChainEngine: false,
  }

  let resolved = custom
  if (resolved && propertyIds.length > 0) {
    resolved = resolved.replace(/\[hotel\]/gi, propertyIds.join(', '))
  }

  const activeCurrency = defaultCurrency ?? 'EUR'
  const currencyInstruction = `Currency: The hotel's default currency is ${activeCurrency}. When you first present prices, include this sentence: "The hotel's currency is ${activeCurrency}, and all rates are displayed in this currency. If you'd like to view prices in a different currency, please specify your preference (e.g., \\"display prices in GBP\\")." If the guest requests a different currency, extract the ISO code and use it in all subsequent search_availability calls.`

  let context = ''

  if (isChainEngine) {
    // Browsing at org/chain level — no fixed home property
    const chainSuffix = chainName && chainName.toLowerCase().includes('collection') ? '' : ' Collection'
    const chainRef = chainName ? `the ${chainName}${chainSuffix}` : 'a hotel collection'
    const isLargeChain = propertyIds.length > 20

    const systemWideGreeting = !chainName
      ? `\nIMPORTANT: Do not call any tools and do not discuss availability or rooms until the guest explicitly names a specific hotel or chain. If their first message does not mention one, reply only with: "Welcome! Which hotel or chain can I help you with today?"`
      : ''

    if (isLargeChain && orgId) {
      // For large chains pass orgId to the tool — avoids injecting hundreds of IDs into the prompt
      const chainInstruction = `This is a large chain with ${propertyIds.length} hotels. Always call list_chain_hotels with orgId: ${orgId} and a query (city or hotel name). If the guest already mentioned a city or hotel name, extract it and pass it immediately — do not ask again. If no location is mentioned, ask: "Which city or hotel are you looking for?" before calling the tool. IMPORTANT: If the guest mentions the chain's own name${chainName ? ` ("${chainName}")` : ''}, do not call any tool — welcome them and ask which city or hotel they are looking for.`
      context = `\n\nINTERNAL TOOL CONTEXT (never repeat internal IDs to guests):
You are embedded in the booking engine for ${chainRef} with ${propertyIds.length} hotels.
${chainInstruction}
Once the user selects a hotel, use that hotel's internal property ID for search_availability and get_property_info — but always address the hotel by name in your replies.${systemWideGreeting}
${currencyInstruction}`
    } else {
      const chainInstruction = isLargeChain
        ? `This is a large chain with ${propertyIds.length} hotels. Always use the query parameter when calling list_chain_hotels. If the guest's message already mentions a city or hotel name, extract it and pass it as the query immediately — do not ask again. If no location or hotel is mentioned, ask: "Which city or hotel are you looking for?" before calling the tool. IMPORTANT: If the guest mentions the chain's own name${chainName ? ` ("${chainName}")` : ''}, that is NOT a search query — do not call any tool; instead welcome them and ask which city or hotel they are looking for.`
        : `When the user asks which hotels are available or wants to browse options, call list_chain_hotels with all ${propertyIds.length} property IDs.`
      context = `\n\nINTERNAL TOOL CONTEXT (never repeat these IDs to guests):
You are embedded in the booking engine for ${chainRef} with ${propertyIds.length} hotels.
Internal IDs for tool calls only: ${propertyIds.join(', ')}.
${chainInstruction}
Once the user selects a hotel, use that hotel's internal ID for search_availability and get_property_info — but always address the hotel by name in your replies.${systemWideGreeting}
${currencyInstruction}`
    }
  } else if (homePropertyId && isChainMember) {
    // Single hotel page that belongs to a chain
    const chainRef = chainName ? `the ${chainName} chain` : 'a hotel chain'
    const chainLabel = chainName ? `the ${chainName} chain` : 'a hotel chain'
    const siblingIds = propertyIds.filter(id => id !== homePropertyId)
    context = `\n\nINTERNAL TOOL CONTEXT (never repeat these IDs to guests):
You are the booking assistant for this hotel (internal tool ID: ${homePropertyId}). Use this ID for search_availability, get_property_info, and prepare_booking. Never ask the guest which hotel — it is fixed.
Sister hotel internal IDs for tool calls only: ${siblingIds.join(', ')}.
${currencyInstruction}
This hotel is part of ${chainRef}. If a guest asks whether this hotel is part of a chain, say: "Yes, this hotel is part of ${chainLabel}." If the guest asks about other hotels, or no availability is found for their dates, offer to check sister properties by calling list_chain_hotels with the sister IDs above — then present results by hotel name only. Say something like: "Let me check our other properties in the area for those dates."`
  } else if (homePropertyId) {
    // Standalone single hotel
    context = `\n\nINTERNAL TOOL CONTEXT (never repeat these IDs to guests):
You are the booking assistant for this hotel (internal tool ID: ${homePropertyId}). Use this ID in all tool calls. Never ask the guest which hotel — it is fixed. Always refer to this hotel by its name (call get_property_info if you don't have it yet).
${currencyInstruction}`
  }

  const parts = [base, context, resolved ? `Additional instructions:\n${resolved}` : ''].filter(Boolean)
  return parts.join('\n\n')
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  const { message, session, sessionId, propertyId, customSystemPrompt, channel } = input

  const [aiConfig, chainCtx, history] = await Promise.all([
    resolveAIConfig(propertyId, input.orgId),
    resolveChainContext(propertyId, input.orgId),
    session.load(sessionId),
  ])

  if (!aiConfig) {
    return {
      text: 'AI assistant is not configured for this hotel. Please contact the hotel directly.',
      toolResults: [],
      updatedHistory: [],
      error: 'no_config',
    }
  }

  let effectiveProvider = aiConfig.provider
  let effectiveApiKey = aiConfig.apiKey
  let effectiveModel = aiConfig.model

  if (channel === 'whatsapp') {
    if (aiConfig.whatsappProvider && aiConfig.whatsappProvider !== aiConfig.provider) {
      // Different provider — use its own key and model
      effectiveProvider = aiConfig.whatsappProvider
      effectiveApiKey = aiConfig.whatsappApiKey ?? aiConfig.apiKey
      effectiveModel = aiConfig.whatsappModel ?? aiConfig.model
    } else if (aiConfig.whatsappModel) {
      // Same provider, model override only
      effectiveModel = aiConfig.whatsappModel
    }
  }

  const adapter = getProviderAdapter(effectiveProvider)

  // WhatsApp-specific additions: plain URLs only, concise formatting
  const channelHint = channel === 'whatsapp'
    ? '\n\nCHANNEL: WhatsApp. Rules: (1) Never use Markdown links [text](url) — paste the full URL as plain text instead so it is clickable. (2) Keep responses concise — no bullet-heavy lists. (3) Use *bold* sparingly for hotel names or key info only.'
    : ''

  const systemPrompt = buildSystemPrompt(aiConfig.systemPrompt ?? customSystemPrompt, chainCtx, input.orgId) + channelHint
  const userMessage: ChatMessage = { role: 'user', content: message }
  let messages: ChatMessage[] = [...history, userMessage]

  const allToolResults: ToolCallResult[] = []
  let finalText = ''
  let iterations = 0

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++

    const response = await adapter.call(messages, ALL_TOOLS, systemPrompt, effectiveApiKey, effectiveModel)

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
        const result = await executeTool(tc.name, tc.arguments, channel)
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
