import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'
import { getEffectiveConfig } from './data-provider.service.js'
import { fetchHotelScore } from '../adapters/dataforseo/client.js'

export interface RefreshResult {
  propertyId: number
  skipped: boolean
  reason?: string
  score?: number | null
  reviewCount?: number | null
}

export async function refreshProperty(propertyId: number, { force = false } = {}): Promise<RefreshResult> {
  const config = await getEffectiveConfig(propertyId)

  if (!force && !config.enabled) {
    return { propertyId, skipped: true, reason: 'disabled' }
  }

  if (!config.cid) {
    return { propertyId, skipped: true, reason: 'No Google Maps URL configured for this property' }
  }

  // Verify the property exists in the local DB before writing PropertyScore (FK constraint)
  const propertyExists = await prisma.property.findUnique({ where: { propertyId }, select: { propertyId: true } })
  if (!propertyExists) {
    return { propertyId, skipped: true, reason: 'Property not registered in database' }
  }

  // Mark as fetching
  await prisma.propertyScore.upsert({
    where: { propertyId },
    create: { propertyId, status: 'fetching' },
    update: { status: 'fetching', errorMsg: null },
  })

  try {
    const result = await fetchHotelScore(
      config.cid,
      config.login,
      config.password,
    )

    if (!result) {
      await prisma.propertyScore.upsert({
        where: { propertyId },
        create: { propertyId, status: 'error', errorMsg: 'No score returned by provider' },
        update: { status: 'error', errorMsg: 'No score returned by provider', fetchedAt: new Date() },
      })
      return { propertyId, skipped: false, score: null, reviewCount: null }
    }

    await prisma.propertyScore.upsert({
      where: { propertyId },
      create: {
        propertyId,
        score: result.score,
        reviewCount: result.reviewCount,
        source: 'dataforseo',
        fetchedAt: new Date(),
        status: 'done',
        errorMsg: null,
      },
      update: {
        score: result.score,
        reviewCount: result.reviewCount,
        source: 'dataforseo',
        fetchedAt: new Date(),
        status: 'done',
        errorMsg: null,
      },
    })

    logger.info({ propertyId, score: result.score, reviewCount: result.reviewCount }, '[DataProvider] Score saved')
    return { propertyId, skipped: false, score: result.score, reviewCount: result.reviewCount }
  } catch (err) {
    logger.warn({ propertyId, err }, '[DataProvider] Refresh failed')
    await prisma.propertyScore.upsert({
      where: { propertyId },
      create: { propertyId, status: 'error', errorMsg: String(err) },
      update: { status: 'error', errorMsg: String(err) },
    })
    return { propertyId, skipped: false, score: null, reviewCount: null }
  }
}

export async function findPropertiesDueForRefresh(): Promise<number[]> {
  const allProperties = await prisma.property.findMany({
    where: { isActive: true, deletedAt: null },
    select: { propertyId: true },
  })

  const scores = await prisma.propertyScore.findMany({
    where: { propertyId: { in: allProperties.map(p => p.propertyId) } },
    select: { propertyId: true, fetchedAt: true, status: true },
  })

  const scoreMap = new Map(scores.map(s => [s.propertyId, s]))
  const now = Date.now()

  const due: number[] = []
  for (const { propertyId } of allProperties) {
    const score = scoreMap.get(propertyId)
    if (!score || !score.fetchedAt || score.status === 'error') {
      due.push(propertyId)
      continue
    }
    const config = await getEffectiveConfig(propertyId)
    const ageMs = now - score.fetchedAt.getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)
    if (ageDays >= config.refreshIntervalDays) {
      due.push(propertyId)
    }
  }

  return due
}

export async function refreshDueProperties(): Promise<void> {
  const due = await findPropertiesDueForRefresh()
  if (due.length === 0) {
    logger.info('[DataProvider] No properties due for refresh')
    return
  }

  logger.info({ count: due.length }, '[DataProvider] Starting refresh run')

  // Sequential to avoid hammering the external API
  for (const propertyId of due) {
    await refreshProperty(propertyId)
  }

  logger.info({ count: due.length }, '[DataProvider] Refresh run complete')
}
