import { prisma } from '../db/client.js'
import { resolveAIConfig } from './ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import { getPropertyDetail } from './static.service.js'
import { logger } from '../utils/logger.js'
import { sendEmail } from './email.service.js'
import { getCommSettings, getSystemCommSettings } from './communication.service.js'
import { sendWhatsAppMessage } from './whatsapp.service.js'
import { sendMessage as sendWebjsMessage } from './whatsapp-manager.service.js'
import type { CompSetInsight, InsightContent } from '@ibe/shared'

function rowToInsight(row: { id: number; propertyId: number; analyzedAt: Date; content: string }): CompSetInsight {
  let content: InsightContent
  try {
    content = JSON.parse(row.content) as InsightContent
  } catch {
    content = { summary: row.content.slice(0, 500), pricingInsights: [], competitorPositioning: [], recommendedActions: [], anomalies: [], strategicRecommendations: [] }
  }
  return { id: row.id, propertyId: row.propertyId, analyzedAt: row.analyzedAt.toISOString(), content }
}

export async function getLatestInsight(propertyId: number): Promise<CompSetInsight | null> {
  const row = await prisma.compSetInsight.findUnique({ where: { propertyId } })
  return row ? rowToInsight(row) : null
}

export async function hasNewData(propertyId: number): Promise<boolean> {
  const latest = await prisma.compSetResult.findFirst({
    where: { propertyId },
    orderBy: { fetchedAt: 'desc' },
    select: { fetchedAt: true },
  })
  if (!latest) return false
  const insight = await prisma.compSetInsight.findUnique({ where: { propertyId }, select: { analyzedAt: true } })
  if (!insight) return true
  return latest.fetchedAt > insight.analyzedAt
}

function fmtCancellation(raw: string | null): string {
  if (!raw) return ''
  if (raw === 'NR') return 'Non-Refundable'
  if (raw === 'Flexi') return 'Flexible (Refundable)'
  return raw
}

function buildDataTable(
  results: Array<{ searchParamId: number; competitorId: number | null; checkIn: string; checkOut: string; nights: number; adults: number; roomName: string | null; board: string | null; cancellation: string | null; searchStatus: string; pricePerNight: number | null; total: number | null; currency: string | null }>,
  params: Array<{ id: number; label: string; offsetDays: number; nights: number; adults: number; children: number }>,
  competitors: Array<{ id: number; name: string; comparisonMode: string }>,
  mappings: Array<{ competitorId: number; compRoomName: string; ownRoomName: string }>,
  events: Array<{ name: string; startDate: string; endDate: string; demandLevel: string; demandDescription: string }>,
): string {
  const today = new Date().toISOString().split('T')[0]!
  const fresh = results.filter(r => r.checkIn >= today)
  if (fresh.length === 0) return '(no current comparison data)'

  const paramById = new Map(params.map(p => [p.id, p]))
  const compById = new Map(competitors.map(c => [c.id, c]))

  // mapping lookup: competitorId → compRoomName → ownRoomName
  const mappingByComp = new Map<number, Map<string, string>>()
  for (const m of mappings) {
    if (!mappingByComp.has(m.competitorId)) mappingByComp.set(m.competitorId, new Map())
    mappingByComp.get(m.competitorId)!.set(m.compRoomName, m.ownRoomName)
  }

  // my hotel results index: "paramId|roomName|board|cancellation" → pricePerNight
  const myRateIndex = new Map<string, number>()
  for (const r of fresh) {
    if (r.competitorId === null && r.searchStatus === 'found' && r.pricePerNight != null && r.roomName) {
      myRateIndex.set(`${r.searchParamId}|${r.roomName}|${r.board ?? ''}|${r.cancellation ?? ''}`, r.pricePerNight)
    }
  }

  const impactLabel: Record<string, string> = { high: 'High Impact', medium: 'Medium Impact', low: 'Low Impact' }
  function eventsForRow(checkIn: string, checkOut: string): string {
    const matching = events.filter(e => e.startDate <= checkOut && e.endDate >= checkIn)
    if (matching.length === 0) return ''
    return matching.map(e => {
      const tag = impactLabel[e.demandLevel] ?? 'Impact'
      const detail = e.demandDescription?.trim() ? `${e.name} – ${e.demandDescription}` : e.name
      return `[${tag}] ${detail}`
    }).join('; ')
  }

  const header = 'Pattern | Offset Days | Nights | Adults | Children | Check-in | Check-out | Competitor | Room | Board | Cancellation | Status | Price/Night | Total | Currency | My Hotel Implied Room | My Hotel Implied Rate | Difference | Events'
  const rows = fresh.map(r => {
    const param = paramById.get(r.searchParamId)
    const isMyHotel = r.competitorId === null
    const comp = isMyHotel ? null : compById.get(r.competitorId!)
    const compName = isMyHotel ? 'My Hotel' : (comp?.name ?? `Competitor ${r.competitorId}`)

    let impliedRoom = ''
    let impliedRate = ''
    let difference = ''
    if (!isMyHotel && r.roomName && comp?.comparisonMode === 'room_mapping' && r.searchStatus === 'found' && r.pricePerNight != null) {
      const ownRoom = mappingByComp.get(r.competitorId!)?.get(r.roomName) ?? ''
      impliedRoom = ownRoom
      if (ownRoom) {
        const myRate = myRateIndex.get(`${r.searchParamId}|${ownRoom}|${r.board ?? ''}|${r.cancellation ?? ''}`)
        if (myRate != null) {
          impliedRate = String(myRate)
          const pct = (r.pricePerNight - myRate) / myRate * 100
          difference = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
        }
      }
    }

    return [
      param?.label ?? `Config #${r.searchParamId}`,
      param?.offsetDays ?? '',
      r.nights,
      r.adults,
      param?.children ?? 0,
      r.checkIn,
      r.checkOut,
      compName,
      r.roomName ?? '',
      r.board ?? '',
      fmtCancellation(r.cancellation),
      r.searchStatus,
      r.pricePerNight ?? '',
      r.total ?? '',
      r.currency ?? '',
      impliedRoom,
      impliedRate,
      difference,
      eventsForRow(r.checkIn, r.checkOut),
    ].join(' | ')
  })

  return [header, ...rows].join('\n')
}

export async function generateInsight(propertyId: number): Promise<CompSetInsight> {
  const property = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true, name: true },
  })
  if (!property) throw new Error(`Property ${propertyId} not found`)

  const aiConfig = await resolveAIConfig(propertyId, property.organizationId)
  if (!aiConfig) throw new Error('AI not configured for this property')

  let hotelName = property.name ?? `Property ${propertyId}`
  let hotelCity = ''
  let hotelCountry = ''
  let starRating = 0
  try {
    const detail = await getPropertyDetail(propertyId)
    hotelName = detail.name
    hotelCity = detail.location.city
    hotelCountry = detail.location.countryCode
    starRating = detail.starRating
  } catch (err) {
    logger.warn({ err, propertyId }, '[CompSetInsight] Could not fetch property detail, using DB name')
  }

  const [results, params, competitors, mappings, events] = await Promise.all([
    prisma.compSetResult.findMany({ where: { propertyId } }),
    prisma.compSetSearchParam.findMany({
      where: { propertyId },
      select: { id: true, label: true, offsetDays: true, nights: true, adults: true, children: true },
    }),
    prisma.compSetCompetitor.findMany({
      where: { propertyId },
      select: { id: true, name: true, comparisonMode: true },
    }),
    prisma.compSetRoomMapping.findMany({
      where: { competitor: { propertyId } },
      select: { competitorId: true, compRoomName: true, ownRoomName: true },
    }),
    prisma.eventCalendarEvent.findMany({
      where: { propertyId },
      select: { name: true, startDate: true, endDate: true, demandLevel: true, demandDescription: true },
    }),
  ])

  const dataTable = buildDataTable(results, params, competitors, mappings, events)
  const starStr = starRating > 0 ? `${starRating}-star ` : ''
  const locationStr = [hotelCity, hotelCountry].filter(Boolean).join(', ')
  const hotelContext = locationStr ? `${hotelName}, a ${starStr}hotel located in ${locationStr}` : `${hotelName}`
  const fetchedDate = results[0]
    ? new Date(results[0].fetchedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'today'

  const prompt = `You are a revenue management AI assistant.

I am the Revenue Manager of ${hotelContext}.

Below is our latest competitor rate comparison data fetched on ${fetchedDate}.

Respond with ONLY a valid JSON object in this exact format — no markdown fences, no explanation outside the JSON:
{
  "summary": "One-sentence headline summarizing the single most important finding",
  "pricingInsights": ["bullet 1", "bullet 2"],
  "competitorPositioning": ["bullet 1"],
  "recommendedActions": ["bullet 1", "bullet 2"],
  "anomalies": ["bullet 1"],
  "strategicRecommendations": ["bullet 1"]
}

Each array may have 1–5 items. Omit a key only if there is genuinely nothing to say (use an empty array otherwise).

Competitor Data:
${dataTable}`

  const adapter = getProviderAdapter(aiConfig.provider)
  const response = await adapter.call(
    [{ role: 'user', content: prompt }],
    [],
    'You are a revenue management AI assistant. Return only valid JSON with no markdown fences.',
    aiConfig.apiKey,
    aiConfig.model,
  )

  const rawText = response.text ?? ''
  let content: InsightContent
  try {
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    content = JSON.parse(jsonText) as InsightContent
  } catch {
    logger.warn({ propertyId }, '[CompSetInsight] AI response was not valid JSON, storing fallback')
    content = { summary: rawText.slice(0, 500), pricingInsights: [], competitorPositioning: [], recommendedActions: [], anomalies: [], strategicRecommendations: [] }
  }

  const now = new Date()
  const row = await prisma.compSetInsight.upsert({
    where: { propertyId },
    create: { propertyId, analyzedAt: now, content: JSON.stringify(content) },
    update: { analyzedAt: now, content: JSON.stringify(content) },
  })

  logger.info({ propertyId }, '[CompSetInsight] Analysis stored')
  return rowToInsight(row)
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export async function sendInsight(propertyId: number, channel: 'email' | 'whatsapp', to: string): Promise<{ ok: boolean }> {
  const [insight, latestResult, property] = await Promise.all([
    getLatestInsight(propertyId),
    prisma.compSetResult.findFirst({ where: { propertyId }, orderBy: { fetchedAt: 'desc' }, select: { fetchedAt: true } }),
    prisma.property.findUnique({ where: { propertyId }, select: { name: true, organizationId: true } }),
  ])
  if (!insight) throw new Error('No insight found for this property')
  if (!property) throw new Error('Property not found')

  const propertyName = property.name ?? `Property ${propertyId}`
  const analyzedAt = fmtDateTime(insight.analyzedAt)
  const lastFetchedAt = latestResult?.fetchedAt ? fmtDateTime(latestResult.fetchedAt.toISOString()) : null
  const headerLine = lastFetchedAt
    ? `Last analyzed: ${analyzedAt} · Based on the competitor search performed on ${lastFetchedAt}`
    : `Last analyzed: ${analyzedAt}`

  const c = insight.content
  const sections: Array<{ title: string; items: string[] }> = [
    { title: 'Pricing Insights',           items: c.pricingInsights },
    { title: 'Competitor Positioning',     items: c.competitorPositioning },
    { title: 'Recommended Actions',        items: c.recommendedActions },
    { title: 'Anomalies',                  items: c.anomalies },
    { title: 'Strategic Recommendations',  items: c.strategicRecommendations },
  ]

  if (channel === 'email') {
    const htmlParts = [
      `<h2 style="font-family:sans-serif;margin-bottom:4px">CompSet Analysis — ${propertyName}</h2>`,
      `<p style="font-family:sans-serif;color:#666;margin-top:0">${headerLine}</p>`,
      `<p style="font-family:sans-serif"><strong>${c.summary}</strong></p>`,
    ]
    for (const { title, items } of sections) {
      if (items.length === 0) continue
      htmlParts.push(`<h3 style="font-family:sans-serif;margin-bottom:6px">${title}</h3>`)
      htmlParts.push(`<ul style="font-family:sans-serif;margin-top:0">`)
      items.forEach(item => htmlParts.push(`<li>${item}</li>`))
      htmlParts.push(`</ul>`)
    }
    const result = await sendEmail(
      property.organizationId,
      { to, subject: `CompSet Analysis — ${propertyName} (${analyzedAt})`, html: htmlParts.join('') },
      propertyId,
    )
    if (!result.ok) throw new Error(result.error ?? 'Email send failed')
    return { ok: true }
  }

  if (channel === 'whatsapp') {
    const settings = property.organizationId > 0
      ? await getCommSettings(property.organizationId)
      : await getSystemCommSettings()
    if (!settings.whatsappEnabled) throw new Error('WhatsApp not configured for this property')

    const textLines = [
      `📊 CompSet Analysis — ${propertyName}`,
      headerLine,
      ``,
      c.summary,
    ]
    for (const { title, items } of sections) {
      if (items.length === 0) continue
      textLines.push(``, `${title}:`)
      items.forEach(item => textLines.push(`• ${item}`))
    }
    const text = textLines.join('\n')

    if (settings.whatsappProvider === 'meta') {
      if (!settings.whatsappPhoneNumberId || !settings.whatsappAccessToken) throw new Error('WhatsApp not configured')
      await sendWhatsAppMessage(settings.whatsappPhoneNumberId, settings.whatsappAccessToken, to, text)
    } else if (settings.whatsappProvider === 'twilio') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const twilio = await import('twilio' as any)
      const client = new twilio.default(settings.whatsappTwilioAccountSid, settings.whatsappTwilioAuthToken!)
      await client.messages.create({ from: `whatsapp:${settings.whatsappTwilioNumber}`, to: `whatsapp:${to}`, body: text })
    } else if (settings.whatsappProvider === 'wwebjs') {
      const ctx = property.organizationId > 0 ? { orgId: property.organizationId } : {}
      await sendWebjsMessage(ctx, to, text)
    }
    return { ok: true }
  }

  throw new Error('Invalid channel')
}
