import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { prisma } from '../db/client.js'
import { registerWebjsPhone } from './communication.service.js'
import { runWhatsAppTurn } from '../ai/whatsapp-handler.js'
import { logger } from '../utils/logger.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'qr' | 'connected'
export type ClientContext = { orgId?: number; propertyId?: number }

export function clientKey(ctx: ClientContext): string {
  if (ctx.propertyId) return `property-${ctx.propertyId}`
  if (ctx.orgId) return `org-${ctx.orgId}`
  return 'system'
}

interface ClientState {
  status: ConnectionStatus
  qrDataUrl: string | null
  phoneNumber: string | null
  context: ClientContext
  socket: ReturnType<typeof makeWASocket> | null
  stopping: boolean
}

// ── In-memory state ───────────────────────────────────────────────────────────

const clients = new Map<string, ClientState>()

// Silent Baileys logger
const noop = () => {}
const silentLogger = {
  trace: noop, debug: noop, info: noop,
  warn: (...a: unknown[]) => logger.warn(a, '[Baileys]'),
  error: (...a: unknown[]) => logger.error(a, '[Baileys]'),
  fatal: (...a: unknown[]) => logger.error(a, '[Baileys]'),
  child: () => silentLogger,
} as unknown as NonNullable<Parameters<typeof makeWASocket>[0]['logger']>

// ── Session persistence ───────────────────────────────────────────────────────

const TEMP_BASE = path.join(os.tmpdir(), 'wa-sessions')

function tempDir(key: string): string {
  const dir = path.join(TEMP_BASE, key)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function restoreSessionFromDb(key: string): Promise<void> {
  const row = await prisma.whatsAppSession.findUnique({ where: { clientKey: key } })
  if (!row?.authData) return
  const dir = tempDir(key)
  const files = row.authData as Record<string, unknown>
  for (const [filename, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(content))
  }
}

async function persistSessionToDb(key: string): Promise<void> {
  const dir = tempDir(key)
  const authData: Record<string, unknown> = {}
  try {
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.json')) {
        authData[file] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
      }
    }
  } catch { return }
  await prisma.whatsAppSession.upsert({
    where: { clientKey: key },
    create: { clientKey: key, authData },
    update: { authData },
  })
}

// ── Client lifecycle ──────────────────────────────────────────────────────────

export async function initClient(ctx: ClientContext): Promise<void> {
  const key = clientKey(ctx)
  if (clients.has(key)) return

  const state: ClientState = {
    status: 'disconnected', qrDataUrl: null, phoneNumber: null,
    context: ctx, socket: null, stopping: false,
  }
  clients.set(key, state)

  await restoreSessionFromDb(key)

  async function connect() {
    const dir = tempDir(key)
    const { state: authState, saveCreds } = await useMultiFileAuthState(dir)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, silentLogger!),
      },
      logger: silentLogger,
      printQRInTerminal: false,
      browser: ['IBE', 'Chrome', '1.0'],
      connectTimeoutMs: 60_000,
    })

    state.socket = sock

    sock.ev.on('creds.update', async () => {
      await saveCreds()
      await persistSessionToDb(key)
    })

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        state.status = 'qr'
        try {
          state.qrDataUrl = await qrcode.toDataURL(qr)
          logger.info({ key }, '[WA] QR ready')
        } catch (err) {
          logger.error({ err, key }, '[WA] QR generation failed')
        }
      }

      if (connection === 'open') {
        state.status = 'connected'
        state.qrDataUrl = null
        const jid = sock.user?.id ?? ''
        state.phoneNumber = jid.split(':')[0]?.split('@')[0] || null
        logger.info({ key, phone: state.phoneNumber }, '[WA] Connected')
        if (state.phoneNumber) registerWebjsPhone(state.phoneNumber, ctx)
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut
        logger.info({ key, statusCode, loggedOut }, '[WA] Disconnected')

        state.status = 'disconnected'
        state.phoneNumber = null
        state.socket = null

        if (loggedOut) {
          clients.delete(key)
          await prisma.whatsAppSession.deleteMany({ where: { clientKey: key } }).catch(() => {})
          try { fs.rmSync(tempDir(key), { recursive: true, force: true }) } catch {}
        } else if (!state.stopping) {
          logger.info({ key }, '[WA] Reconnecting in 5s...')
          setTimeout(() => void connect(), 5000)
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      for (const msg of messages) {
        if (msg.key.fromMe) continue
        const from = msg.key.remoteJid
        if (!from || from.endsWith('@g.us')) continue

        const text = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || ''
        if (!text.trim()) continue

        logger.info({ key, from, text: text.slice(0, 60) }, '[WA] Incoming message')
        try {
          const reply = await runWhatsAppTurn({
            from,
            message: text,
            ...(state.phoneNumber ? { myPhone: state.phoneNumber } : {}),
            ...(ctx.orgId !== undefined ? { orgId: ctx.orgId } : {}),
            ...(ctx.propertyId !== undefined ? { propertyId: ctx.propertyId } : {}),
          })
          await sock.sendMessage(from, { text: reply })
        } catch (err) {
          logger.error({ err, key, from }, '[WA] Message handling failed')
        }
      }
    })
  }

  await connect()
}

export async function sendMessage(ctx: ClientContext = {}, to: string, text: string): Promise<void> {
  const key = clientKey(ctx)
  let state = clients.get(key)
  // Fall back to system client when no org/property-specific client is connected
  if ((!state || state.status !== 'connected') && (ctx.orgId !== undefined || ctx.propertyId !== undefined)) {
    state = clients.get('system')
  }
  if (!state?.socket || state.status !== 'connected') {
    throw new Error(`No connected client for context ${key}`)
  }
  const jid = to.replace(/^\+/, '') + '@s.whatsapp.net'
  await state.socket.sendMessage(jid, { text })
}

export async function disconnectClient(ctx: ClientContext = {}): Promise<void> {
  const key = clientKey(ctx)
  const state = clients.get(key)
  if (!state) return
  state.stopping = true
  try { await state.socket?.logout() } catch { state.socket?.end(undefined) }
  clients.delete(key)
}

// ── Public getters ────────────────────────────────────────────────────────────

export function getStatus(ctx: ClientContext = {}): { status: ConnectionStatus; phoneNumber?: string } {
  const state = clients.get(clientKey(ctx))
  const phone = state?.phoneNumber || undefined
  return phone
    ? { status: state?.status ?? 'disconnected', phoneNumber: phone }
    : { status: state?.status ?? 'disconnected' }
}

export function getQrDataUrl(ctx: ClientContext = {}): string | null {
  return clients.get(clientKey(ctx))?.qrDataUrl ?? null
}

// ── Startup: restore all sessions from DB ─────────────────────────────────────

export async function initAllSessions(): Promise<void> {
  const rows = await prisma.whatsAppSession.findMany({ select: { clientKey: true } })
  for (const row of rows) {
    const key = row.clientKey
    let ctx: ClientContext = {}
    const org = key.match(/^org-(\d+)$/)
    if (org) ctx = { orgId: Number(org[1]) }
    const prop = key.match(/^property-(\d+)$/)
    if (prop) ctx = { propertyId: Number(prop[1]) }
    logger.info({ key }, '[WA] Restoring session from DB')
    void initClient(ctx)
  }
}
