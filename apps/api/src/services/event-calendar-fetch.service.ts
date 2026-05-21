import { logger } from '../utils/logger.js'
import { prisma } from '../db/client.js'
import { resolveAIConfig } from './ai-config.service.js'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import {
  getSystemEventCalendarConfig,
  getPropertyEventCalendarConfig,
  replacePropertyEvents,
} from './event-calendar.service.js'

interface ParsedEvent {
  name: string
  startDate: string
  endDate: string
  description: string
  demandLevel: 'high' | 'medium' | 'low'
  demandDescription: string
}

function isValidEvent(obj: unknown): obj is ParsedEvent {
  if (!obj || typeof obj !== 'object') return false
  const e = obj as Record<string, unknown>
  return (
    typeof e.name === 'string' &&
    typeof e.startDate === 'string' &&
    typeof e.endDate === 'string' &&
    typeof e.description === 'string' &&
    (e.demandLevel === 'high' || e.demandLevel === 'medium' || e.demandLevel === 'low') &&
    typeof e.demandDescription === 'string'
  )
}

export async function refreshPropertyEvents(
  propertyId: number,
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  const prop = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  const orgId = prop?.organizationId ?? undefined

  const aiConfig = await resolveAIConfig(propertyId, orgId)
  if (!aiConfig) {
    logger.info({ propertyId }, '[EventCalendar] No AI config — skipping')
    return
  }

  let staticData: Awaited<ReturnType<typeof fetchPropertyStatic>>
  try {
    staticData = await fetchPropertyStatic(propertyId)
  } catch (err) {
    logger.warn({ err, propertyId }, '[EventCalendar] fetchPropertyStatic failed — skipping')
    return
  }

  const [sysConfig, propConfig] = await Promise.all([
    getSystemEventCalendarConfig(),
    getPropertyEventCalendarConfig(propertyId),
  ])
  const radiusKm = propConfig?.radiusKm ?? sysConfig.defaultRadiusKm ?? 50

  const { latitude, longitude } = staticData.coordinates
  const city = staticData.location.city.name
  const countryCode = staticData.location.countryCode

  const systemPrompt = 'You are a hotel demand intelligence assistant. Return only valid JSON with no surrounding text.'
  const userPrompt = `Find events (concerts, conferences, sports tournaments, festivals, public holidays, major exhibitions, trade shows) happening within ${radiusKm}km of ${city}, ${countryCode} (coordinates: ${latitude}, ${longitude}) between ${periodStart} and ${periodEnd}.

Search the web for current, accurate information.

Return a JSON array where each object has exactly these keys:
- name (string)
- startDate (YYYY-MM-DD)
- endDate (YYYY-MM-DD)
- description (string, 1–2 sentences)
- demandLevel ("high", "medium", or "low")
- demandDescription (string, 1 sentence explaining expected traveler impact)

Return only the JSON array, no surrounding text. If no events are found, return an empty array [].`

  let events: ParsedEvent[] = []
  try {
    const adapter = getProviderAdapter(aiConfig.provider)
    const response = await adapter.call(
      [{ role: 'user', content: userPrompt }],
      [],
      systemPrompt,
      aiConfig.apiKey,
      aiConfig.model,
    )
    if (response.stopReason !== 'error' && response.text) {
      const jsonText = response.text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim()
      const parsed = JSON.parse(jsonText) as unknown
      if (Array.isArray(parsed)) {
        events = parsed.filter(isValidEvent)
        const skipped = parsed.length - events.length
        if (skipped > 0) {
          logger.warn({ propertyId, skipped }, '[EventCalendar] Skipped malformed event objects')
        }
      }
    }
  } catch (err) {
    logger.warn({ err, propertyId }, '[EventCalendar] AI call or parse failed — storing zero events')
    events = []
  }

  await replacePropertyEvents(propertyId, new Date(), periodStart, periodEnd, events)
  logger.info({ propertyId, count: events.length }, '[EventCalendar] Events refreshed')
}
