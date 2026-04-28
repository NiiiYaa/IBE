import type { ClientContext } from './providers/types.js'

let ibeApiUrl = process.env.IBE_API_URL ?? 'http://localhost:3001'

export function configure(config: { ibeApiUrl?: string }) {
  if (config.ibeApiUrl) ibeApiUrl = config.ibeApiUrl
}

export function isConfigured(): boolean {
  return !!ibeApiUrl
}

// Register connected phone → org/property context with the API.
// Called on every ready event and once per message (handles API restarts).
export function registerPhone(myPhone: string, ctx: ClientContext): void {
  fetch(`${ibeApiUrl}/api/v1/wwebjs/phone-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: myPhone, ...ctx }),
  }).catch(() => {})
}

export async function askAI(phoneNumber: string, message: string, ctx: ClientContext, myPhone?: string): Promise<string> {
  // Re-register on every message so context survives API restarts
  if (myPhone) registerPhone(myPhone, ctx)

  const res = await fetch(`${ibeApiUrl}/api/v1/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sessionId: `wa-${phoneNumber}`,
      channel: 'whatsapp',
      ...(myPhone ? { webjsPhone: myPhone } : {}),
      ...(ctx.propertyId ? { propertyId: ctx.propertyId } : {}),
      ...(ctx.orgId ? { orgId: ctx.orgId } : {}),
    }),
  })

  if (!res.ok || !res.body) {
    throw new Error(`AI API error: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data) as { text?: string; delta?: string }
          if (parsed.delta) text += parsed.delta
          else if (parsed.text) text = parsed.text
        } catch {
          // ignore non-JSON lines
        }
      }
    }
  }

  return text.trim() || 'Sorry, I could not process your request.'
}
