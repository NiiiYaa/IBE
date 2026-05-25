'use client'

import { useEffect, useRef, useState } from 'react'

type Message = { role: 'user' | 'assistant'; text: string; error?: boolean }

const SUGGESTIONS = [
  'How do affiliates work?',
  'What is flexible dates?',
  'How do I configure AI channels?',
  'What are the booking modes?',
]

export function AdminHelpChat() {
  const [manualExists, setManualExists] = useState(false)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/v1/admin/super/manual-ai-info', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { exists: boolean }) => setManualExists(data.exists))
      .catch(() => {})
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  if (!manualExists) return null

  async function handleSend(question: string) {
    const q = question.trim()
    if (!q || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)

    try {
      const res = await fetch('/api/v1/admin/manual/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })

      if (!res.ok || !res.body) {
        setMessages(prev => [...prev, { role: 'assistant', text: `Server error ${res.status}. Please try again.`, error: true }])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let responseText = ''
      let hasError = false

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as { text?: string; error?: string; done?: boolean }
            if (event.error) { responseText = event.error; hasError = true }
            if (event.text) responseText = event.text
          } catch { /* ignore parse errors */ }
        }
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: responseText || 'No response received.',
        error: hasError,
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Connection error. Please try again.', error: true }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Expanded panel */}
      {open && (
        <div
          className="w-[360px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl flex flex-col"
          style={{ height: '480px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
            <span className="text-sm font-semibold text-[var(--color-text)]">Ask me</span>
            <button
              onClick={() => setOpen(false)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors text-lg leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Message thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="space-y-3">
                <p className="text-xs text-[var(--color-text-muted)]">
                  Hi! Ask me anything about the admin panel.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => void handleSend(s)}
                      className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`rounded-lg px-3 py-2 text-xs max-w-[82%] whitespace-pre-wrap leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[var(--color-primary)] text-white'
                      : m.error
                        ? 'bg-[var(--color-surface)] text-[var(--color-error)] border border-[var(--color-error)]'
                        : 'bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)]'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg px-3 py-2 text-xs bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <span className="animate-pulse">…</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input footer */}
          <div className="border-t border-[var(--color-border)] p-3 flex gap-2 flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(input) }
              }}
              disabled={loading}
              placeholder="Ask a question…"
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
            />
            <button
              onClick={() => void handleSend(input)}
              disabled={!input.trim() || loading}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Floating bubble */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-12 h-12 rounded-full bg-[var(--color-primary)] text-white shadow-lg hover:bg-[var(--color-primary-hover)] transition-colors flex items-center justify-center flex-shrink-0"
        aria-label={open ? 'Close help chat' : 'Open help chat'}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </div>
  )
}
