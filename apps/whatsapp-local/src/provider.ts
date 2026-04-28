import * as baileys from './providers/baileys.js'
import * as wwebjs from './providers/wwebjs.js'
import type { ClientContext, OnMessageFn, OnReadyFn, ConnectionStatus } from './providers/types.js'

export type { ClientContext }

export interface WAProvider {
  initClient(ctx: ClientContext, sessionPath: string, onMessage: OnMessageFn, onReady?: OnReadyFn): Promise<void>
  getStatus(ctx?: ClientContext): { status: ConnectionStatus; phoneNumber?: string }
  getQrDataUrl(ctx?: ClientContext): string | null
  disconnectClient(ctx?: ClientContext): Promise<void>
  findExistingSessions(sessionPath: string): ClientContext[]
}

const name = (process.env.WA_PROVIDER ?? 'baileys').toLowerCase()

if (name !== 'baileys' && name !== 'wwebjs') {
  console.warn(`[wa] Unknown WA_PROVIDER "${name}", defaulting to baileys`)
}

export const provider: WAProvider = name === 'wwebjs' ? wwebjs : baileys

console.log(`[wa] Provider: ${name === 'wwebjs' ? 'wwebjs (Puppeteer/Chrome)' : 'baileys (WebSocket)'}`)
