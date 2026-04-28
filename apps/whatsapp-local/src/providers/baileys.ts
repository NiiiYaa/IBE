import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode'
import path from 'path'
import fs from 'fs'
import type { ConnectionStatus, ClientContext, OnMessageFn, OnReadyFn } from './types.js'
import { clientKey } from './types.js'

interface ClientState {
  status: ConnectionStatus
  qrDataUrl: string | null
  phoneNumber: string | null
  context: ClientContext
  socket: ReturnType<typeof makeWASocket> | null
  stopping: boolean
}

const clients = new Map<string, ClientState>()

// Silent logger — Baileys is very noisy by default
const noop = () => {}
const silentLogger = {
  trace: noop, debug: noop, info: noop,
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  fatal: console.error.bind(console),
  child: () => silentLogger,
} as unknown as Parameters<typeof makeWASocket>[0]['logger']

export function getStatus(ctx: ClientContext = {}): { status: ConnectionStatus; phoneNumber?: string } {
  const state = clients.get(clientKey(ctx))
  return { status: state?.status ?? 'disconnected', phoneNumber: state?.phoneNumber ?? undefined }
}

export function getQrDataUrl(ctx: ClientContext = {}): string | null {
  return clients.get(clientKey(ctx))?.qrDataUrl ?? null
}

export async function initClient(
  ctx: ClientContext,
  sessionPath: string,
  onMessage: OnMessageFn,
  onReady?: OnReadyFn,
): Promise<void> {
  const key = clientKey(ctx)
  if (clients.has(key)) return

  const label = key
  const authDir = path.join(sessionPath, key)
  fs.mkdirSync(authDir, { recursive: true })

  const state: ClientState = {
    status: 'disconnected',
    qrDataUrl: null,
    phoneNumber: null,
    context: ctx,
    socket: null,
    stopping: false,
  }
  clients.set(key, state)

  async function connect() {
    const { state: authState, saveCreds } = await useMultiFileAuthState(authDir)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, silentLogger),
      },
      logger: silentLogger,
      printQRInTerminal: false,
      browser: ['IBE', 'Chrome', '1.0'],
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: undefined,
    })

    state.socket = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        state.status = 'qr'
        try {
          state.qrDataUrl = await qrcode.toDataURL(qr)
          console.log(`[baileys:${label}] QR ready`)
        } catch (err) {
          console.error(`[baileys:${label}] QR error:`, err)
        }
      }

      if (connection === 'open') {
        state.status = 'connected'
        state.qrDataUrl = null
        // JID looks like "972552455705:0@s.whatsapp.net" — extract the number part
        const jid = sock.user?.id ?? ''
        state.phoneNumber = jid.split(':')[0].split('@')[0] || null
        console.log(`[baileys:${label}] Connected as ${state.phoneNumber}`)
        if (state.phoneNumber && onReady) onReady(state.phoneNumber, ctx)
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut
        console.log(`[baileys:${label}] Disconnected (${statusCode})`)

        state.status = 'disconnected'
        state.phoneNumber = null
        state.socket = null

        if (loggedOut) {
          clients.delete(key)
          try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
        } else if (!state.stopping) {
          console.log(`[baileys:${label}] Reconnecting in 5s...`)
          setTimeout(() => connect(), 5000)
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      for (const msg of messages) {
        if (msg.key.fromMe) continue
        const from = msg.key.remoteJid
        if (!from || from.endsWith('@g.us')) continue // skip groups

        const text = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || ''
        if (!text.trim()) continue

        console.log(`[baileys:${label}] Message from ${from}: ${text.slice(0, 60)}`)
        try {
          const reply = await onMessage(from, text, ctx, state.phoneNumber ?? undefined)
          await sock.sendMessage(from, { text: reply })
        } catch (err) {
          console.error(`[baileys:${label}] Message error:`, err)
        }
      }
    })
  }

  await connect()
}

export async function disconnectClient(ctx: ClientContext = {}): Promise<void> {
  const key = clientKey(ctx)
  const state = clients.get(key)
  if (!state) return
  state.stopping = true
  try { await state.socket?.logout() } catch { state.socket?.end(undefined) }
  clients.delete(key)
}

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
