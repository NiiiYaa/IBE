import type { ChatMessage } from '../sessions/types.js'
import type { ToolDefinition, ProviderAdapter, ProviderResponse } from './types.js'
import { addDays, todayIso } from '@ibe/shared'

export class FakeAdapter implements ProviderAdapter {
  async call(
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<ProviderResponse> {
    const hasToolResults = messages.some(m => m.role === 'tool')
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    const userText = typeof lastUser?.content === 'string' ? lastUser.content.toLowerCase() : ''

    // If there are tool results already, produce a text summary
    if (hasToolResults) {
      return {
        text: 'Here are the available options I found for your dates. Let me know if you\'d like to book one of these rooms or if you have any questions!',
        toolCalls: [],
        stopReason: 'end',
      }
    }

    // Decide which tool to call based on the user message
    const wantsSearch = /room|availab|stay|night|check|book|price|rate|sleep/i.test(userText)
    const wantsInfo = /info|about|facilit|pool|gym|parking|wifi|breakfast|restaurant/i.test(userText)

    if (wantsInfo && tools.find(t => t.name === 'get_property_info')) {
      return {
        text: null,
        toolCalls: [{ id: 'fake-tool-1', name: 'get_property_info', arguments: {} }],
        stopReason: 'tool_use',
      }
    }

    if (wantsSearch && tools.find(t => t.name === 'search_availability')) {
      const checkIn = addDays(todayIso(), 7)
      const checkOut = addDays(todayIso(), 9)
      return {
        text: null,
        toolCalls: [{
          id: 'fake-tool-1',
          name: 'search_availability',
          arguments: { checkIn, checkOut, adults: 2 },
        }],
        stopReason: 'tool_use',
      }
    }

    // Fallback: friendly greeting / unknown intent
    return {
      text: 'Hi! I\'m the hotel booking assistant (running in test mode). I can help you search for available rooms, check dates, or answer questions about the property. What are you looking for?',
      toolCalls: [],
      stopReason: 'end',
    }
  }
}
