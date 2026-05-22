import { prisma } from '../db/client.js'
import { resolveAIConfig } from './ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import { getPropertyDetail } from './static.service.js'
import { logger } from '../utils/logger.js'
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

function buildDataTable(
  results: Array<{ searchParamId: number; competitorId: number | null; checkIn: string; checkOut: string; roomName: string | null; board: string | null; cancellation: string | null; searchStatus: string; pricePerNight: number | null; total: number | null; currency: string | null }>,
  params: Array<{ id: number; label: string }>,
  competitors: Array<{ id: number; name: string }>,
): string {
  const today = new Date().toISOString().split('T')[0]!
  const fresh = results.filter(r => r.checkIn >= today)
  if (fresh.length === 0) return '(no current comparison data)'

  const paramById = new Map(params.map(p => [p.id, p]))
  const compById = new Map(competitors.map(c => [c.id, c]))

  const header = 'Pattern | Check-in | Check-out | Competitor | Room | Board | Cancellation | Status | Price/Night | Total | Currency'
  const rows = fresh.map(r => [
    paramById.get(r.searchParamId)?.label ?? `Config #${r.searchParamId}`,
    r.checkIn,
    r.checkOut,
    r.competitorId === null ? 'My Hotel' : (compById.get(r.competitorId)?.name ?? `Competitor ${r.competitorId}`),
    r.roomName ?? '',
    r.board ?? '',
    r.cancellation ?? '',
    r.searchStatus,
    r.pricePerNight ?? '',
    r.total ?? '',
    r.currency ?? '',
  ].join(' | '))

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

  const [results, params, competitors] = await Promise.all([
    prisma.compSetResult.findMany({ where: { propertyId } }),
    prisma.compSetSearchParam.findMany({ where: { propertyId } }),
    prisma.compSetCompetitor.findMany({ where: { propertyId } }),
  ])

  const dataTable = buildDataTable(results, params, competitors)
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
