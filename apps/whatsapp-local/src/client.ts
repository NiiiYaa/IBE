import pkg from 'whatsapp-web.js'
const { Client, LocalAuth } = pkg as typeof import('whatsapp-web.js')
import qrcode from 'qrcode'
import path from 'path'
import fs from 'fs'
import { registerPhone } from './ai-bridge.js'

export type ConnectionStatus = 'disconnected' | 'qr' | 'connected'
export type ClientContext = { orgId?: number; propertyId?: number }

interface ClientState {
  client: Client
  status: ConnectionStatus
  qrDataUrl: string | null
  phoneNumber: string | null
  context: ClientContext
}

const clients = new Map<string, ClientState>()

export function clientKey(ctx: ClientContext) {
  if (ctx.propertyId) return `property-${ctx.propertyId}`
  if (ctx.orgId) return `org-${ctx.orgId}`
  return 'system'
}

export function getStatus(ctx: ClientContext = {}) {
  const state = clients.get(clientKey(ctx))
  return { status: state?.status ?? 'disconnected', phoneNumber: state?.phoneNumber ?? undefined }
}

export function getQrDataUrl(ctx: ClientContext = {}) {
  return clients.get(clientKey(ctx))?.qrDataUrl ?? null
}

export async function initClient(
  ctx: ClientContext,
  sessionPath: string,
  onMessage: (from: string, body: string, ctx: ClientContext, myPhone?: string) => Promise<string>,
) {
  const key = clientKey(ctx)
  if (clients.has(key)) return

  const extraLibs = new URL('../chrome-libs', import.meta.url).pathname
  const ldPath = process.env.LD_LIBRARY_PATH ? `${extraLibs}:${process.env.LD_LIBRARY_PATH}` : extraLibs
  process.env.LD_LIBRARY_PATH = ldPath

  const orgSessionPath = path.join(sessionPath, key)
  const state: ClientState = { client: null!, status: 'disconnected', qrDataUrl: null, phoneNumber: null, context: ctx }
  clients.set(key, state)

  const label = key

  state.client = new Client({
    authStrategy: new LocalAuth({ dataPath: orgSessionPath }),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
  })

  state.client.on('qr', async (qr) => {
    state.status = 'qr'
    state.qrDataUrl = await qrcode.toDataURL(qr)
    console.log(`[wwebjs:${label}] QR ready`)
  })

  state.client.on('authenticated', () => {
    state.qrDataUrl = null
  })

  state.client.on('ready', async () => {
    state.status = 'connected'
    state.phoneNumber = state.client.info?.wid?.user ?? null
    console.log(`[wwebjs:${label}] Connected as ${state.phoneNumber}`)
    if (state.phoneNumber) registerPhone(state.phoneNumber, ctx)
  })

  state.client.on('disconnected', (reason) => {
    state.status = 'disconnected'
    state.phoneNumber = null
    state.qrDataUrl = null
    clients.delete(key)
    console.log(`[wwebjs:${label}] Disconnected:`, reason)
  })

  state.client.on('message', async (msg) => {
    if (msg.fromMe) return
    console.log(`[wwebjs:${label}] Message from ${msg.from}: ${msg.body.slice(0, 60)}`)
    try {
      const reply = await onMessage(msg.from, msg.body, ctx, state.phoneNumber ?? undefined)
      await msg.reply(reply)
    } catch (err) {
      console.error(`[wwebjs:${label}] Message error:`, err)
    }
  })

  await state.client.initialize()
}

export async function disconnectClient(ctx: ClientContext = {}) {
  const key = clientKey(ctx)
  const state = clients.get(key)
  if (!state) return
  await state.client.destroy()
  clients.delete(key)
}

// Scan session directory for existing sessions and return their contexts
export function findExistingSessions(sessionPath: string): ClientContext[] {
  try {
    const entries = fs.readdirSync(sessionPath, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory())
      .flatMap((e): ClientContext[] => {
        if (e.name === 'system') return [{}]
        const org = e.name.match(/^org-(\d+)$/)
        if (org) return [{ orgId: Number(org[1]) }]
        const prop = e.name.match(/^property-(\d+)$/)
        if (prop) return [{ propertyId: Number(prop[1]) }]
        return []
      })
  } catch {
    return []
  }
}
