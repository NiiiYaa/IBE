# Admin Help Chat — Design Spec
Date: 2026-05-25

## Overview

A floating conversational AI widget available on every admin page. Answers questions about the HG-IBE admin panel using the AI-generated manual as its knowledge base. Visible to all authenticated admin users; hidden if no manual has been generated yet.

---

## Backend

### Endpoint
`POST /admin/manual/chat`  
Auth: any authenticated admin (not super-only).  
Request body: `{ question: string }`  
Response: SSE stream of text chunks.

### Section scoring
1. Load `ManualCache` from DB (single row, already used by other manual routes).
2. Normalize the question: lowercase, split on non-alphanumeric, remove common stop words (the, a, an, is, how, do, what, where, can, i, to, etc.).
3. For each `ManualSection`, count keyword hits:
   - Hit in section **title** → weight ×3
   - Hit in first 500 chars of **markdown** → weight ×1
4. Sort sections by score descending, take top 4 with score > 0.
5. Fallback: if no section scores > 0 (very generic question), take the 4 sections whose titles share the most characters with the question.

### System prompt
```
You are a help assistant for the HG-IBE admin panel, a hotel booking engine.
Answer questions based only on the manual sections provided below.
Be concise and practical. Use bullet points where helpful.
If the answer is not covered in the provided sections, say so clearly.
```
Followed by the selected sections' full markdown text.

### Streaming
Uses the existing `getProviderAdapter` + system AI config (same pattern as manual generation). Streams raw text chunks as `data: <chunk>\n\n` SSE events. On error, emits `data: {"error":"..."}\n\n` and closes.

### Location
New handler added to `apps/api/src/routes/manual.route.ts` (alongside existing manual endpoints).

---

## Frontend

### Component
`apps/web/src/app/admin/_components/AdminHelpChat.tsx`  
Added to `apps/web/src/app/admin/_layout-client.tsx` so it renders on every admin page.

### Visibility
On mount, calls `getManualAiInfo()`. If `exists` is false, renders nothing.

### Collapsed state
Circular fixed button, bottom-right corner. Chat bubble icon inside.

### Expanded panel
Anchored bottom-right, above the button. 360px wide × ~480px tall.

**Header:** "Ask me" text left, X close button right.

**Body (scrollable message thread):**
- User messages: right-aligned, primary-color bubble.
- AI messages: left-aligned, surface-color bubble.
- Streaming in progress: blinking cursor appended to the partial response.

**Empty state (no messages yet):**
- Greeting line: *"Hi! Ask me anything about the admin panel."*
- 4 suggestion chips (click pre-fills the input and sends):
  - "How do affiliates work?"
  - "What is flexible dates?"
  - "How do I configure AI channels?"
  - "What are the booking modes?"

**Footer:** Single-line text input + Send button. Both disabled while a response is streaming.

### State
| Field | Type | Purpose |
|---|---|---|
| `open` | boolean | Panel open/closed |
| `messages` | `{role, text}[]` | Full thread for display |
| `streaming` | boolean | Whether a response is in progress |
| `streamingText` | string | Partial text of the current AI response |

Each question is **stateless** — only the current question is sent to the AI, no prior messages. History is displayed locally for UX but not forwarded to the backend.

### Error handling
- **Streaming error:** Red inline message in thread. User can retry.
- **Empty/whitespace input:** Send button disabled.
- **Manual not available:** Widget hidden entirely (checked once on mount).
- **AI not configured:** Server error message surfaced in thread.
- **Page navigation:** Widget stays open — it lives in the layout, React preserves state.

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/routes/manual.route.ts` | Add `POST /admin/manual/chat` SSE endpoint |
| `apps/web/src/app/admin/_components/AdminHelpChat.tsx` | New floating chat widget component |
| `apps/web/src/app/admin/_layout-client.tsx` | Mount `AdminHelpChat` |

No new DB models, no new API client methods (uses `fetch` directly for SSE streaming).
