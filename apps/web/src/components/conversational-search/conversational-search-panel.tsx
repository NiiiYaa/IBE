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

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 1 L10.5 6.5 L16 8 L10.5 9.5 L9 15 L7.5 9.5 L2 8 L7.5 6.5 Z" fill="#7c3aed" />
      <path d="M19 2 L19.9 4.6 L22.5 5.5 L19.9 6.4 L19 9 L18.1 6.4 L15.5 5.5 L18.1 4.6 Z" fill="#3b82f6" />
    </svg>
  )
}

function ToolResultRenderer({ tool, data, propertyId }: { tool: string; data: unknown; propertyId?: number }) {
  if (tool === 'search_availability' || tool === 'filter_results') {
    const result = data as SearchResult & { error?: string }
    if (result.error) return <p className="mt-1 text-xs text-[var(--color-error)]">{result.error}</p>
    return <SearchResultCards data={result} {...(propertyId ? { fallbackPropertyId: propertyId } : {})} />
  }
  if (tool === 'prepare_booking') {
    return <BookingHandoffCard data={data as BookingHandoff} />
  }
  return null
}

// Matches Arabic, Hebrew, Syriac, Thaana, and their presentation forms
const RTL_RE = /[֑-߿יִ-﷽ﹰ-ﻼ]/

function detectDir(text: string): 'rtl' | 'ltr' {
  return RTL_RE.test(text) ? 'rtl' : 'ltr'
}

function MessageBubble({ msg, propertyId }: { msg: GuestChatMessage; propertyId?: number }) {
  const isUser = msg.role === 'user'
  const dir = msg.content ? detectDir(msg.content) : 'ltr'
  const isRtl = dir === 'rtl'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        dir={dir}
        className={[
          'max-w-[85%] rounded-2xl px-4 py-2.5',
          isUser
            ? 'bg-[var(--color-primary)] text-white'
            : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]',
          isRtl ? 'text-right' : '',
        ].join(' ')}
      >
        {msg.content && (
          isUser
            ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
            : <div className="text-sm"><MarkdownContent content={msg.content} dir={dir} /></div>
        )}
        {msg.toolResults?.map((tr, i) => (
          <ToolResultRenderer key={i} tool={tr.tool} data={tr.data} {...(propertyId ? { propertyId } : {})} />
        ))}
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
  const [hasChatStarted, setHasChatStarted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasMessages = messages.length > 0 || isLoading

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (!isLoading) inputRef.current?.focus()
  }, [isLoading])

  function handleSend() {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    setHasChatStarted(true)
    void send(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSend()
  }

  return (
    <div className={['relative flex flex-col bg-[var(--color-background)]', className].join(' ')}>

      {/* Messages — invisible/inert until first message, then fades in */}
      <div
        className="min-h-0 flex-1 flex flex-col"
        style={{
          overflowY: hasMessages ? 'auto' : 'hidden',
          opacity: hasMessages ? 1 : 0,
          pointerEvents: hasMessages ? 'auto' : 'none',
          transition: 'opacity 0.8s ease',
        }}
      >
        {/* Spacer pushes messages to the bottom; shrinks as messages fill the space */}
        <div className="flex-1" />
        <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-3">
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} {...(propertyId ? { propertyId } : {})} />
          ))}
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                <span className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-muted)]" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </span>
              </div>
            </div>
          )}
          {error && <p className="text-center text-xs text-[var(--color-error)]">{error}</p>}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input section — starts centered via translateY, slides to bottom after first message */}
      <div
        className="shrink-0 px-4 pb-6 pt-3"
        style={{
          transform: hasChatStarted ? 'translateY(0)' : 'translateY(-42vh)',
          transition: 'transform 4s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform',
        }}
      >
        <div className="mx-auto w-full max-w-2xl">
          {/* Suggestions when empty */}
          {!hasMessages && (
            <div className="mb-4">
              <p className="mb-3 text-center text-sm text-[var(--color-text-muted)]">
                Tell me what you're looking for and I'll find the perfect room.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => { setInput(''); setHasChatStarted(true); void send(s) }}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-xs text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chips row: New chat · Standard */}
          {(messages.length > 0 || onClose) && (
            <div className="flex items-center gap-2 mb-1.5">
              {messages.length > 0 && (
                <button
                  onClick={reset}
                  className="whitespace-nowrap rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  New chat
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-primary-light)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-border)]"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="5.5" cy="5.5" r="4" />
                    <line x1="8.5" y1="8.5" x2="12" y2="12" />
                  </svg>
                  Standard
                </button>
              )}
            </div>
          )}

          {/* Input row: pill + Ask */}
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center overflow-hidden rounded-2xl bg-white shadow-2xl ring-2 ring-violet-400">
              <div className="flex flex-1 items-center gap-2 px-4 py-3">
                <span className="shrink-0"><SparkleIcon /></span>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  dir={input ? detectDir(input) : 'ltr'}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about rooms, dates, availability…"
                  disabled={isLoading}
                  className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="shrink-0 whitespace-nowrap rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white shadow-2xl transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? '…' : 'Ask'}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-[var(--color-text-muted)]">
            AI-powered · Results based on live availability
          </p>
        </div>
      </div>
    </div>
  )
}
