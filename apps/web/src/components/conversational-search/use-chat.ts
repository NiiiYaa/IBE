'use client'

import { useState, useCallback, useRef } from 'react'
import type { GuestChatMessage, ChatStreamChunk } from '@ibe/shared'

interface UseChatOptions {
  propertyId?: number
  orgId?: number
}

export interface ChatState {
  messages: GuestChatMessage[]
  isLoading: boolean
  error: string | null
}

// Raw server-side history (includes tool messages) sent back with each request
type RawHistory = unknown[]

export function useChat({ propertyId, orgId }: UseChatOptions) {
  const [messages, setMessages] = useState<GuestChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionId = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  const rawHistoryRef = useRef<RawHistory>([])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: GuestChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setError(null)

    // Placeholder assistant message — we'll fill it in as chunks arrive
    const assistantMsg: GuestChatMessage = {
      role: 'assistant',
      content: '',
      toolResults: [],
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, assistantMsg])
    const assistantIndex = messages.length + 1

    try {
      const res = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: rawHistoryRef.current,
          propertyId,
          orgId,
          sessionId: sessionId.current,
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6).trim()
          if (!json) continue

          try {
            const chunk = JSON.parse(json) as ChatStreamChunk

            if (chunk.type === 'text') {
              setMessages(prev => {
                const next = [...prev]
                const msg = next[assistantIndex]
                if (msg) next[assistantIndex] = { ...msg, content: msg.content + chunk.delta }
                return next
              })
            }

            if (chunk.type === 'tool_result') {
              setMessages(prev => {
                const next = [...prev]
                const msg = next[assistantIndex]
                if (msg) {
                  next[assistantIndex] = {
                    ...msg,
                    toolResults: [...(msg.toolResults ?? []), { tool: chunk.tool, data: chunk.data }],
                  }
                }
                return next
              })
            }

            if (chunk.type === 'done') {
              rawHistoryRef.current = chunk.history as RawHistory
            }

            if (chunk.type === 'error') {
              setError(chunk.message)
            }
          } catch {
            // malformed chunk — skip
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection error'
      setError(msg)
      setMessages(prev => {
        const next = [...prev]
        const msg2 = next[assistantIndex]
        if (msg2 && !msg2.content) {
          next[assistantIndex] = { ...msg2, content: 'Sorry, something went wrong. Please try again.' }
        }
        return next
      })
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, messages.length, propertyId, orgId])

  const reset = useCallback(() => {
    setMessages([])
    setError(null)
    rawHistoryRef.current = []
    sessionId.current = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }, [])

  return { messages, isLoading, error, send, reset }
}
