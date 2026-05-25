# Admin Help Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating conversational AI chat widget to every admin page that answers questions using the generated manual as its knowledge base.

**Architecture:** A new `POST /admin/manual/chat` SSE endpoint scores manual sections by keyword overlap with the question, injects the top 4 into a system prompt, and streams the AI response back. A fixed `AdminHelpChat` React component in the admin layout renders the collapsed bubble and expanded panel, hidden when no manual exists.

**Tech Stack:** Fastify SSE, existing provider adapter (`getProviderAdapter`), `resolveAIConfig`, React hooks, Tailwind + CSS vars.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/services/manual-generate.service.ts` | Modify | Add `scoreAndSelectSections` export |
| `apps/api/src/routes/manual.route.ts` | Modify | Add `POST /admin/manual/chat` SSE endpoint |
| `apps/web/src/app/admin/_components/AdminHelpChat.tsx` | Create | Floating chat bubble + panel component |
| `apps/web/src/app/admin/_layout-client.tsx` | Modify | Mount `<AdminHelpChat />` |

---

### Task 1: Add section scoring utility to service

**Files:**
- Modify: `apps/api/src/services/manual-generate.service.ts`

- [ ] **Step 1: Add `scoreAndSelectSections` export** at the bottom of the `// ── Helpers ──` block (after `readSectionFiles`, before `// ── Claude call ──`):

```typescript
const STOP_WORDS = new Set([
  'the','a','an','is','how','do','what','where','can','i','to','in','on','at',
  'for','of','and','or','it','this','that','are','be','been','was','were','will',
  'would','could','should','my','me','we','us','you','they','he','she','which',
  'with','from','by','about','does','did','has','have','had','not','no','if',
  'so','set','up','get','use','using','make',
])

export function scoreAndSelectSections(question: string, sections: ManualSection[]): ManualSection[] {
  const keywords = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))

  if (keywords.length === 0) return sections.slice(0, 4)

  const scored = sections.map(s => {
    const titleTokens = s.title.toLowerCase().split(/[^a-z0-9]+/)
    const bodyTokens = s.markdown.slice(0, 500).toLowerCase().split(/[^a-z0-9]+/)
    let score = 0
    for (const kw of keywords) {
      if (titleTokens.some(w => w.includes(kw) || kw.includes(w))) score += 3
      if (bodyTokens.some(w => w.includes(kw) || kw.includes(w))) score += 1
    }
    return { section: s, score }
  })

  const top = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(s => s.section)

  if (top.length > 0) return top

  // Fallback: sections whose title shares the most characters with the question
  const qLower = question.toLowerCase()
  return [...scored]
    .sort((a, b) => {
      const overlap = (title: string) =>
        [...title.toLowerCase()].filter(c => c !== ' ' && qLower.includes(c)).length
      return overlap(b.section.title) - overlap(a.section.title)
    })
    .slice(0, 4)
    .map(s => s.section)
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep manual
```
Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/manual-generate.service.ts
git commit -m "feat(manual-chat): add scoreAndSelectSections utility"
```

---

### Task 2: Add chat SSE endpoint

**Files:**
- Modify: `apps/api/src/routes/manual.route.ts`

- [ ] **Step 1: Add imports** at the top of `manual.route.ts`, after the existing import block:

```typescript
import { resolveAIConfig } from '../services/ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import { scoreAndSelectSections } from '../services/manual-generate.service.js'
```

The full updated import block for the service should look like:

```typescript
import {
  startGenerationJob,
  getJobState,
  loadManualData,
  filterSectionsByRole,
  renderManualHtml,
  generateOneSection,
  scoreAndSelectSections,
  MANUAL_SECTIONS,
} from '../services/manual-generate.service.js'
```

- [ ] **Step 2: Add the chat endpoint** inside `manualRoutes`, after the `generate-section` endpoint and before the closing `}`:

```typescript
// ── Chat: conversational help based on manual sections ──────────────────────

fastify.post('/admin/manual/chat', async (request, reply) => {
  const { question } = request.body as { question?: string }
  if (!question?.trim()) return reply.status(400).send({ error: 'question required' })

  const data = await loadManualData()
  if (!data) return reply.status(404).send({ error: 'Manual not generated yet' })

  const config = await resolveAIConfig()
  if (!config) return reply.status(503).send({ error: 'AI not configured' })

  const selected = scoreAndSelectSections(question.trim(), data.sections)
  const sectionsText = selected
    .map(s => `## ${s.title}\n${s.markdown}`)
    .join('\n\n---\n\n')

  const systemPrompt = `You are a help assistant for the HG-IBE admin panel, a hotel booking engine used by hotel and chain administrators.
Answer questions based only on the manual sections provided below.
Be concise and practical. Use bullet points where helpful.
If the answer is not covered in the provided sections, say so clearly.

${sectionsText}`

  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.raw.setHeader('X-Accel-Buffering', 'no')
  reply.raw.flushHeaders()

  try {
    const adapter = getProviderAdapter(config.provider)
    const response = await Promise.race([
      adapter.call(
        [{ role: 'user', content: question.trim() }],
        [],
        systemPrompt,
        config.apiKey,
        config.model,
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI call timed out')), 90_000)
      ),
    ])

    if (response.stopReason === 'error') {
      reply.raw.write(`data: ${JSON.stringify({ error: response.error ?? 'AI error' })}\n\n`)
    } else {
      reply.raw.write(`data: ${JSON.stringify({ text: response.text ?? '' })}\n\n`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
  }

  reply.raw.write(`data: ${JSON.stringify({ done: true })}\n\n`)
  reply.raw.end()
})
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/manual.route.ts
git commit -m "feat(manual-chat): add POST /admin/manual/chat SSE endpoint"
```

---

### Task 3: Create AdminHelpChat component

**Files:**
- Create: `apps/web/src/app/admin/_components/AdminHelpChat.tsx`

- [ ] **Step 1: Create the file**

```typescript
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
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep AdminHelpChat
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/_components/AdminHelpChat.tsx
git commit -m "feat(manual-chat): add AdminHelpChat floating widget component"
```

---

### Task 4: Mount widget in admin layout

**Files:**
- Modify: `apps/web/src/app/admin/_layout-client.tsx`

- [ ] **Step 1: Add import** at the top of `_layout-client.tsx`, alongside the other component imports (after the `PropertySelector` import):

```typescript
import { AdminHelpChat } from './_components/AdminHelpChat'
```

- [ ] **Step 2: Mount the widget** inside `AdminLayoutInner`'s return, right before the closing `</div>` at the end of the outer wrapper (line ~811, after `</main>`):

```tsx
        <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-background)]">
          {children}
        </main>
      </div>
      <AdminHelpChat />   {/* ← add this line */}
    </div>
  )
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -10
```
Expected: same pre-existing errors as before (the `RatesSubTable` issue in test-bookings), nothing new.

- [ ] **Step 4: Final commit**

```bash
git add apps/web/src/app/admin/_layout-client.tsx
git commit -m "feat(manual-chat): mount AdminHelpChat in admin layout"
```

---

### Task 5: Push

- [ ] **Push to origin**

```bash
git push origin main
```

Render will redeploy. After deploy, the chat bubble appears bottom-right on all admin pages (only when the manual has been generated).

---

## Manual Test Checklist

After deploy:
- [ ] With no manual generated: bubble is hidden
- [ ] After generating manual: bubble appears bottom-right
- [ ] Click bubble → panel opens with header "Ask me" and 4 suggestion chips
- [ ] Click a suggestion chip → sends question, shows loading `…`, then AI response appears
- [ ] Type a custom question + Enter → sends and responds
- [ ] Ask about a topic covered in the manual → answer is relevant
- [ ] Navigate to a different admin page → widget stays open with same conversation
- [ ] Click X → panel closes, bubble remains
