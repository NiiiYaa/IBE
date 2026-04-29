import { runOrchestrator } from './orchestrator.js'
import { RedisSession } from './sessions/redis-session.js'
import { prisma } from '../db/client.js'
import { registerWebjsPhone, resolveWebjsPhoneContext, getWaSessionContext, setWaSessionContext, clearWaSessionContext } from '../services/communication.service.js'
import { logger } from '../utils/logger.js'

function extractPropertyIdFromToolResults(toolResults: { tool: string; data: unknown }[]): number | null {
  for (const tr of toolResults) {
    const d = tr.data as Record<string, unknown> | null
    if (!d) continue
    if (typeof d.propertyId === 'number') return d.propertyId
    const rooms = d.rooms
    if (Array.isArray(rooms) && rooms.length > 0) {
      const first = rooms[0] as Record<string, unknown>
      if (typeof first.propertyId === 'number') return first.propertyId
    }
    const hotels = d.hotels
    if (Array.isArray(hotels) && hotels.length > 0) {
      const first = hotels[0] as Record<string, unknown>
      if (typeof first.propertyId === 'number') return first.propertyId
    }
  }
  return null
}

export interface WhatsAppTurnParams {
  from: string       // sender JID or phone number
  message: string
  myPhone?: string   // connected WhatsApp number (to register context)
  orgId?: number
  propertyId?: number
}

export async function runWhatsAppTurn(params: WhatsAppTurnParams): Promise<string> {
  const { from, message, myPhone } = params
  let { orgId, propertyId } = params

  const sessionId = orgId ? `wa-${orgId}-${from}` : myPhone ? `wa-${myPhone}-${from}` : `wa-${from}`

  if (myPhone) registerWebjsPhone(myPhone, {
    ...(orgId !== undefined ? { orgId } : {}),
    ...(propertyId !== undefined ? { propertyId } : {}),
  })

  // Fresh greeting (e.g. prefilled "Hello, I'd like to find out about X") — reset session
  // so a user switching between chains/hotels on a shared global number starts clean.
  const isFreshGreeting = /^hello,?\s+i['']d like to find out about\b/i.test(message.trim())
  if (isFreshGreeting && !orgId && !propertyId) {
    const session = new RedisSession()
    await Promise.all([
      session.save(sessionId, []),
      clearWaSessionContext(sessionId),
    ])
    logger.info({ from, sessionId }, '[WhatsApp] Fresh greeting — session reset')
  }

  // Resolve context: phone registry → saved session context
  let waCtxAlreadySaved = false
  if (!orgId && !propertyId) {
    if (myPhone) {
      const phoneCtx = resolveWebjsPhoneContext(myPhone)
      if (phoneCtx) { orgId = phoneCtx.orgId; propertyId = phoneCtx.propertyId }
    }
    if (!orgId && !propertyId) {
      const savedCtx = await getWaSessionContext(sessionId)
      if (savedCtx) {
        orgId = savedCtx.orgId; propertyId = savedCtx.propertyId; waCtxAlreadySaved = true
      }
    }
  }

  const result = await runOrchestrator({
    message,
    session: new RedisSession(),
    sessionId,
    channel: 'whatsapp',
    ...(propertyId ? { propertyId } : {}),
    ...(orgId ? { orgId } : {}),
  })

  // Lock session to resolved hotel after first successful tool call
  if (!waCtxAlreadySaved && !orgId && !propertyId && result.toolResults.length > 0) {
    const resolvedPropId = extractPropertyIdFromToolResults(result.toolResults)
    if (resolvedPropId) {
      const prop = await prisma.property.findUnique({
        where: { propertyId: resolvedPropId },
        select: { organizationId: true },
      })
      if (prop) void setWaSessionContext(sessionId, { orgId: prop.organizationId, propertyId: resolvedPropId })
    }
  }

  logger.info({ from, sessionId }, '[WhatsApp] Turn complete')
  return result.text || 'Sorry, I could not process your request.'
}
