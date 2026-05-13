import { prisma } from '../db/client.js'
import type {
  ExternalIBEConfigRow,
  ExternalIBEConfigUpdate,
  EffectiveExternalIBEConfig,
  ExternalIBEAnalyzeRequest,
  ExternalIBEAnalyzeResponse,
} from '@ibe/shared'
import { resolveAIConfig } from './ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'

// ── buildExternalUrl ──────────────────────────────────────────────────────

export function buildExternalUrl(
  template: string,
  params: Record<string, string | number | null | undefined>,
): string {
  let result = template
  for (const [key, val] of Object.entries(params)) {
    if (val !== null && val !== undefined) {
      result = result.replaceAll(`{${key}}`, String(val))
    }
  }
  // Strip query params whose token was not replaced (value was null/missing)
  const qIdx = result.indexOf('?')
  if (qIdx === -1) return result
  const base = result.slice(0, qIdx)
  const kept = result.slice(qIdx + 1).split('&').filter(pair => !/\{[^}]+\}/.test(pair))
  return kept.length > 0 ? `${base}?${kept.join('&')}` : base
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toRow(row: {
  id: number
  organizationId: number | null
  propertyId: number | null
  searchTemplate: string | null
  bookingTemplate: string | null
  searchSampleUrls: unknown
  bookingSampleUrls: unknown
  externalHotelId: string | null
  mcpEnabled: boolean
  affiliateEnabled: boolean
  widgetEnabled: boolean
  createdAt: Date
  updatedAt: Date
}): ExternalIBEConfigRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    propertyId: row.propertyId,
    searchTemplate: row.searchTemplate,
    bookingTemplate: row.bookingTemplate,
    searchSampleUrls: Array.isArray(row.searchSampleUrls) ? (row.searchSampleUrls as string[]) : [],
    bookingSampleUrls: Array.isArray(row.bookingSampleUrls) ? (row.bookingSampleUrls as string[]) : [],
    externalHotelId: row.externalHotelId,
    mcpEnabled: row.mcpEnabled,
    affiliateEnabled: row.affiliateEnabled,
    widgetEnabled: row.widgetEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function getExternalIBEConfig(
  scope: { orgId?: number; propertyId?: number },
): Promise<ExternalIBEConfigRow | null> {
  const where = scope.propertyId !== undefined
    ? { propertyId: scope.propertyId }
    : { organizationId: scope.orgId }
  const row = await prisma.externalIBEConfig.findUnique({ where })
  return row ? toRow(row) : null
}

export async function upsertExternalIBEConfig(
  scope: { orgId?: number; propertyId?: number },
  data: ExternalIBEConfigUpdate,
): Promise<ExternalIBEConfigRow> {
  const where = scope.propertyId !== undefined
    ? { propertyId: scope.propertyId }
    : { organizationId: scope.orgId }

  const create = scope.propertyId !== undefined
    ? { ...data, propertyId: scope.propertyId }
    : { ...data, organizationId: scope.orgId! }

  const row = await prisma.externalIBEConfig.upsert({
    where,
    create,
    update: data,
  })
  return toRow(row)
}

export async function deleteExternalIBEConfig(
  scope: { orgId?: number; propertyId?: number },
): Promise<void> {
  const where = scope.propertyId !== undefined
    ? { propertyId: scope.propertyId }
    : { organizationId: scope.orgId }
  await prisma.externalIBEConfig.delete({ where })
}

// ── Resolver ──────────────────────────────────────────────────────────────

export async function getEffectiveExternalIBEConfig(
  propertyId: number,
): Promise<EffectiveExternalIBEConfig | null> {
  const [hotelRow, property] = await Promise.all([
    prisma.externalIBEConfig.findUnique({ where: { propertyId } }),
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
  ])

  if (!property) return null

  const chainRow = property.organizationId
    ? await prisma.externalIBEConfig.findUnique({ where: { organizationId: property.organizationId } })
    : null

  // Standalone hotel (no chain config)
  if (!chainRow) {
    if (!hotelRow) return null
    return {
      searchTemplate: hotelRow.searchTemplate,
      bookingTemplate: hotelRow.bookingTemplate,
      externalHotelId: hotelRow.externalHotelId,
      mcpEnabled: hotelRow.mcpEnabled,
      affiliateEnabled: hotelRow.affiliateEnabled,
      widgetEnabled: hotelRow.widgetEnabled,
    }
  }

  // Chain-member hotel with no hotel row → use chain as-is
  if (!hotelRow) {
    return {
      searchTemplate: chainRow.searchTemplate,
      bookingTemplate: chainRow.bookingTemplate,
      externalHotelId: null,
      mcpEnabled: chainRow.mcpEnabled,
      affiliateEnabled: chainRow.affiliateEnabled,
      widgetEnabled: chainRow.widgetEnabled,
    }
  }

  // Hotel has own templates → full override
  if (hotelRow.searchTemplate || hotelRow.bookingTemplate) {
    return {
      searchTemplate: hotelRow.searchTemplate ?? chainRow.searchTemplate,
      bookingTemplate: hotelRow.bookingTemplate ?? chainRow.bookingTemplate,
      externalHotelId: hotelRow.externalHotelId,
      mcpEnabled: hotelRow.mcpEnabled,
      affiliateEnabled: hotelRow.affiliateEnabled,
      widgetEnabled: hotelRow.widgetEnabled,
    }
  }

  // Hotel only has externalHotelId → merge with chain templates
  return {
    searchTemplate: chainRow.searchTemplate,
    bookingTemplate: chainRow.bookingTemplate,
    externalHotelId: hotelRow.externalHotelId,
    mcpEnabled: hotelRow.mcpEnabled,
    affiliateEnabled: hotelRow.affiliateEnabled,
    widgetEnabled: hotelRow.widgetEnabled,
  }
}

// ── AI Analysis ───────────────────────────────────────────────────────────

const PLACEHOLDER_VOCABULARY = [
  'externalHotelId — Property ID in the external IBE system',
  'hotelId — HyperGuest internal property ID',
  'checkIn — Arrival date (YYYY-MM-DD)',
  'checkOut — Departure date (YYYY-MM-DD)',
  'adults — Adult guest count',
  'rooms — Room count',
  'nationality — Guest nationality (ISO 2-letter code)',
  'currency — Currency code (e.g. USD)',
  'roomId — Room type ID (booking URLs only)',
  'ratePlanId — Rate plan ID (booking URLs only)',
  'solutionId — Session-specific booking token from the external IBE search (booking URLs only; a UUID or opaque code generated per search session)',
]

export async function analyzeExternalIBEUrls(
  req: ExternalIBEAnalyzeRequest,
): Promise<ExternalIBEAnalyzeResponse | { error: string }> {
  const aiConfig = await resolveAIConfig(req.propertyId, req.orgId)
  if (!aiConfig) return { error: 'AI not configured for this scope' }

  const systemPrompt = `You are a URL structure analyzer. Given sample URLs from an external hotel booking engine, identify which URL parameters correspond to the placeholder concepts listed. Return only a JSON object, no surrounding text.`

  const userPrompt = `Analyze these sample ${req.type} page URLs and identify which parameters correspond to the placeholder vocabulary.

Placeholder vocabulary:
${PLACEHOLDER_VOCABULARY.map(p => `- {${p}}`).join('\n')}

Sample URLs${req.scenarios?.length ? ' (each captured under a different scenario to help identify guest/date parameters)' : ''}:
${req.urls.map((u, i) => req.scenarios?.[i] ? `${i + 1}. [${req.scenarios[i]}]: ${u}` : `${i + 1}. ${u}`).join('\n')}

Return a JSON object with exactly this structure:
{
  "template": "<the URL with parameter values replaced by {placeholder} tokens>",
  "mapping": [
    { "concept": "<placeholder name without braces>", "detectedParam": "<URL param name>", "exampleValue": "<value from first sample URL>" }
  ],
  "unmapped": ["<param names present in URL but not mapped to any concept>"]
}

Rules:
- Use {externalHotelId} (not {hotelId}) when you detect a hotel identifier that belongs to the external booking system.
- Use {solutionId} when you detect a UUID or opaque session token in the path or query that identifies a specific offer from a prior search (common in path segments like /solution/UUID or /offer/UUID).
- When scenario labels are provided, use them to identify guest-count and stay-duration parameters: a parameter whose value changes between an adults=2 URL and an adults=1 URL maps to {adults}; a parameter whose value changes with nights maps to date parameters; a parameter that appears only in child-inclusive scenarios maps to {children} or the {guests} composite.
- If a parameter appears in some URLs but not others, include it if it appears in the majority.
- Keep parameters that have no matching concept as static literal values in the template (do not invent placeholder names outside the vocabulary above).
- Return only the JSON object, no surrounding text.`

  try {
    const adapter = getProviderAdapter(aiConfig.provider)
    const response = await adapter.call(
      [{ role: 'user', content: userPrompt }],
      [],
      systemPrompt,
      aiConfig.apiKey,
      aiConfig.model,
    )

    if (response.stopReason === 'error' || !response.text) {
      return { error: response.error ?? 'No response from AI' }
    }

    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    const jsonText = response.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed = JSON.parse(jsonText) as ExternalIBEAnalyzeResponse
    return parsed
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unexpected error during analysis' }
  }
}
