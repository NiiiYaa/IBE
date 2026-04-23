'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from './use-chat'
import { SearchResultCards, BookingHandoffCard } from './room-cards'
import { MarkdownContent } from './markdown-content'
import type { GuestChatMessage } from '@ibe/shared'
import type { SearchResult, BookingHandoff } from './types'

interface Props {
  propertyId?: number
  orgId?: number
  onClose?: () => void
  className?: string
}

const SUGGESTIONS = [
  'I need a room for 2 adults next weekend',
  'Show me your best rooms in June',
  'What rooms do you have under €150/night?',
  'I want a room with breakfast included',
]

function ToolResultRenderer({ tool, data }: { tool: string; data: unknown }) {
  if (tool === 'search_availability' || tool === 'filter_results') {
    const result = data as SearchResult & { error?: string }
    if (result.error) return <p className="mt-1 text-xs text-[var(--color-error)]">{result.error}</p>
    return <SearchResultCards data={result} />
  }
  if (tool === 'prepare_booking') {
    const result = data as BookingHandoff
    return <BookingHandoffCard data={result} />
  }
  return null
}

function MessageBubble({ msg }: { msg: GuestChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={[
        'max-w-[85%] rounded-2xl px-4 py-2.5',
        isUser
          ? 'bg-[var(--color-primary)] text-white'
          : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]',
      ].join(' ')}>
        {msg.content && (
          isUser
            ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
            : <div className="text-sm"><MarkdownContent content={msg.content} /></div>
        )}
        {msg.toolResults?.map((tr, i) => (
          <ToolResultRenderer key={i} tool={tr.tool} data={tr.data} />
        ))}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <span className="flex gap-1">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  )
}

export function ConversationalSearchPanel({ propertyId, orgId, onClose, className }: Props) {
  const { messages, isLoading, error, send, reset } = useChat({
    ...(propertyId ? { propertyId } : {}),
    ...(orgId ? { orgId } : {}),
  })
  const [input, setInput] = useState('')
  const topRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  function handleSend() {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    void send(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={['flex flex-col bg-[var(--color-background)]', className].join(' ')}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">✦</span>
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">AI Booking Assistant</p>
            <p className="text-xs text-[var(--color-text-muted)]">Ask me anything about rooms & availability</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button onClick={reset} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              New chat
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--color-background)] text-[var(--color-text-muted)]">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="py-6">
            <p className="mb-4 text-center text-sm text-[var(--color-text-muted)]">
              Tell me what you're looking for and I'll find the perfect room.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-xs text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={topRef} />

        {isLoading && messages[messages.length - 1]?.role === 'user' && <TypingIndicator />}

        {error && (
          <p className="text-center text-xs text-[var(--color-error)]">{error}</p>
        )}

        {(() => {
          const pairs: GuestChatMessage[][] = []
          for (let i = 0; i < messages.length; i += 2) pairs.push(messages.slice(i, i + 2))
          return pairs.reverse().flat().map((msg, i) => <MessageBubble key={i} msg={msg} />)
        })()}
      </div>

      {/* Input */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about rooms, dates, availability…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="shrink-0 rounded-xl bg-[var(--color-primary)] p-2.5 text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40 transition-opacity"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[var(--color-text-muted)]">
          AI-powered · Results based on live availability
        </p>
      </div>
    </div>
  )
}
