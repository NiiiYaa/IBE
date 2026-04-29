import 'dotenv/config'
import express from 'express'
import { provider } from './provider.js'
import type { ClientContext } from './provider.js'
import { askAI, configure, isConfigured, registerPhone } from './ai-bridge.js'

const PORT = Number(process.env.PORT ?? 3002)
const SESSION_PATH = process.env.SESSION_PATH ?? './.wwebjs_session'

const app = express()
app.use(express.json())

function parseCtx(req: express.Request): ClientContext {
  const q = req.query as Record<string, string>
  const b = (req.body ?? {}) as Record<string, unknown>
  const propertyId = q.propertyId ?? b.propertyId
  const orgId = q.orgId ?? b.orgId
  return {
    ...(propertyId ? { propertyId: Number(propertyId) } : {}),
    ...(orgId ? { orgId: Number(orgId) } : {}),
  }
}

function startClient(ctx: ClientContext) {
  provider.initClient(ctx, SESSION_PATH, askAI, registerPhone).catch(err =>
    console.error(`[wa] Init error (${JSON.stringify(ctx)}):`, err),
  )
}

// ── API ───────────────────────────────────────────────────────────────────────

app.get('/status', (req, res) => {
  res.json({ ...provider.getStatus(parseCtx(req)), configured: isConfigured() })
})

app.get('/qr', (req, res) => {
  const qr = provider.getQrDataUrl(parseCtx(req))
  if (!qr) return res.status(404).json({ error: 'No QR available' })
  res.json({ qr })
})

app.post('/disconnect', async (req, res) => {
  await provider.disconnectClient(parseCtx(req))
  res.json({ ok: true })
})

app.post('/send-message', async (req, res) => {
  const { to, message } = req.body as { to?: string; message?: string }
  if (!to || !message) return res.status(400).json({ error: 'to and message are required' })
  try {
    await provider.sendMessage(parseCtx(req), to, message)
    res.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[wa] sendMessage error:', msg)
    res.status(500).json({ error: msg })
  }
})

app.post('/configure', (req, res) => {
  const { ibeApiUrl, orgId, propertyId } = req.body as { ibeApiUrl?: string; orgId?: number; propertyId?: number }
  configure({ ibeApiUrl })
  const ctx: ClientContext = {
    ...(propertyId ? { propertyId } : {}),
    ...(orgId && !propertyId ? { orgId } : {}),
  }
  console.log('[wa] Configure:', { ibeApiUrl, ...ctx })
  startClient(ctx)
  res.json({ ok: true })
})

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[wa] Listening on http://localhost:${PORT}`)

  if (!isConfigured()) {
    console.log('[wa] Waiting for POST /configure')
    return
  }

  startClient({}) // system client

  for (const ctx of provider.findExistingSessions(SESSION_PATH)) {
    if (ctx.orgId !== undefined || ctx.propertyId !== undefined) {
      console.log(`[wa] Restoring session:`, ctx)
      startClient(ctx)
    }
  }
})
